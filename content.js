/**
 * FormMemory - Content Script
 * Privacy-first form memory, job application autofill engine, credential linking, and productivity tools.
 * Manifest V3 compatible (Firefox / WebExtensions standard).
 */

(function () {
  'use strict';

  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  // Configuration constants
  const OBSERVER_DEBOUNCE_MS = 250;
  const MAX_HISTORY_PER_FIELD = 25;
  const STORAGE_KEY_PREFIX = 'site:';
  const CURRENT_HOST = window.location.hostname || 'localhost';
  const STORAGE_KEY = STORAGE_KEY_PREFIX + CURRENT_HOST;

  // Exclude non-fillable elements
  const EXCLUDED_TYPES = new Set(['hidden', 'file', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'range', 'color']);
  const SENSITIVE_AUTOCOMPLETE_EXCLUDE = new Set(['cc-number', 'cc-csc', 'cc-exp', 'cc-type', 'one-time-code']);

  // State management
  let siteMemoryCache = null;
  let jobProfileCache = null;
  let blacklistCache = [];
  let activeDropdown = null;
  let activeElement = null;
  let activePromptBanner = null;
  let activeJobPill = null;
  let highlightedIndex = -1;
  const trackedElements = new WeakSet();

  /**
   * Normalize an entry to structured object: { value, count, lastUsed }
   */
  function normalizeEntry(item) {
    if (typeof item === 'string') {
      return { value: item, count: 1, lastUsed: Date.now() };
    }
    return {
      value: String(item.value || ''),
      count: Number(item.count) || 1,
      lastUsed: Number(item.lastUsed) || Date.now()
    };
  }

  /**
   * Generate a cryptographically secure random password.
   */
  function generateStrongPassword(length = 16) {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()_+-=';
    const values = new Uint8Array(length);
    crypto.getRandomValues(values);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset[values[i] % charset.length];
    }
    return result;
  }

  /**
   * Prune intermediate prefix noise (e.g. ["a", "ar", "ary", "aryan"])
   */
  function prunePrefixes(entries) {
    if (!Array.isArray(entries) || entries.length <= 1) return entries;
    const normalized = entries.map(normalizeEntry);

    return normalized.filter((item, idx) => {
      const val = item.value.toLowerCase().trim();
      if (!val) return false;

      const hasLongerSuperstring = normalized.some((other, oIdx) => {
        if (idx === oIdx) return false;
        const otherVal = other.value.toLowerCase().trim();
        return otherVal.length > val.length && otherVal.startsWith(val) && (val.length <= 4 || item.count <= other.count);
      });

      return !hasLongerSuperstring;
    });
  }

  /**
   * Display a quick unobtrusive toast message.
   */
  function showToast(message) {
    const existing = document.querySelector('.formmemory-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'formmemory-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 2200);
  }

  /**
   * Clean all fields in the current site's cache on startup.
   */
  function cleanSiteCache() {
    if (!siteMemoryCache) return;
    for (const fieldId of Object.keys(siteMemoryCache)) {
      if (fieldId === '_credentials') continue;
      const rawList = siteMemoryCache[fieldId];
      if (Array.isArray(rawList)) {
        siteMemoryCache[fieldId] = prunePrefixes(rawList);
      }
    }
  }

  /**
   * Load stored values, blacklist, and job profile from browser storage.
   */
  async function loadStorageData() {
    try {
      const data = await browserAPI.storage.local.get([STORAGE_KEY, 'blacklist', 'job_profile']);
      blacklistCache = data.blacklist || [];

      // Check if current site is blacklisted
      if (blacklistCache.includes(CURRENT_HOST)) {
        return false; // Silenced
      }

      jobProfileCache = data.job_profile || null;
      siteMemoryCache = data[STORAGE_KEY] || {};
      if (!Array.isArray(siteMemoryCache._credentials)) {
        siteMemoryCache._credentials = [];
      }
      cleanSiteCache();
      await flushStorage();
      return true;
    } catch (err) {
      console.warn('[FormMemory] Failed to load local storage:', err);
      siteMemoryCache = { _credentials: [] };
      return true;
    }
  }

  /**
   * Persist current memory cache to browser.storage.local.
   */
  async function flushStorage() {
    if (!siteMemoryCache) return;
    try {
      await browserAPI.storage.local.set({ [STORAGE_KEY]: siteMemoryCache });
    } catch (err) {
      console.warn('[FormMemory] Failed to write storage:', err);
    }
  }

  /**
   * Check whether an input or form control is eligible for tracking.
   */
  function isTrackableField(el) {
    if (!el || !(el instanceof HTMLElement)) return false;

    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea' || tag === 'select') {
      return !el.disabled && !el.readOnly;
    }

    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (EXCLUDED_TYPES.has(type)) return false;

      const auto = (el.getAttribute('autocomplete') || '').toLowerCase();
      if (SENSITIVE_AUTOCOMPLETE_EXCLUDE.has(auto)) return false;

      return !el.disabled && !el.readOnly;
    }

    return false;
  }

  /**
   * Determine if an element represents a username or email field.
   */
  function isUsernameOrEmailField(el) {
    if (!el || el.tagName.toLowerCase() !== 'input') return false;
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (type === 'email') return true;

    const name = (el.getAttribute('name') || '').toLowerCase();
    const id = (el.getAttribute('id') || '').toLowerCase();
    const auto = (el.getAttribute('autocomplete') || '').toLowerCase();

    if (auto.includes('username') || auto.includes('email')) return true;
    if (/user|email|login|account|handle/i.test(name) || /user|email|login|account|handle/i.test(id)) return true;

    return false;
  }

  /**
   * Find a related password field in the same form or surrounding container.
   */
  function findRelatedPasswordField(el) {
    if (!el) return null;
    const form = el.closest('form');
    if (form) {
      return form.querySelector('input[type="password"]');
    }
    const parent = el.parentElement?.parentElement;
    if (parent && parent !== document.body) {
      return parent.querySelector('input[type="password"]');
    }
    return null;
  }

  /**
   * Find a related username or email field for a given password input.
   */
  function findRelatedUsernameField(pwdEl) {
    if (!pwdEl) return null;
    const form = pwdEl.closest('form');
    const container = form || pwdEl.parentElement?.parentElement || document.body;
    const inputs = Array.from(container.querySelectorAll('input:not([type="password"]):not([type="hidden"]):not([type="submit"])'));

    const userField = inputs.find(isUsernameOrEmailField);
    if (userField) return userField;

    const pwdIndex = inputs.indexOf(pwdEl);
    if (pwdIndex > 0) return inputs[pwdIndex - 1];

    return inputs[0] || null;
  }

  /**
   * Find label text associated with the element.
   */
  function getAssociatedLabelText(el) {
    const parentLabel = el.closest('label');
    if (parentLabel) {
      const text = parentLabel.innerText || parentLabel.textContent || '';
      if (text.trim()) return text.trim();
    }

    if (el.id) {
      const forLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (forLabel) {
        const text = forLabel.innerText || forLabel.textContent || '';
        if (text.trim()) return text.trim();
      }
    }

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    const ariaLabelledBy = el.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const labelledEl = document.getElementById(ariaLabelledBy);
      if (labelledEl) {
        const text = labelledEl.innerText || labelledEl.textContent || '';
        if (text.trim()) return text.trim();
      }
    }

    return '';
  }

  /**
   * Generate a unique, deterministic identifier for a form field.
   */
  function getFieldIdentifier(el) {
    const name = el.getAttribute('name');
    if (name && name.trim()) return 'name:' + name.trim();

    const id = el.getAttribute('id');
    if (id && id.trim()) return 'id:' + id.trim();

    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    const placeholder = (el.getAttribute('placeholder') || '').trim();
    const labelText = getAssociatedLabelText(el).slice(0, 30);

    let pathSig = '';
    let current = el;
    let depth = 0;
    while (current && current !== document.body && depth < 4) {
      let index = 0;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === current.tagName) index++;
        sibling = sibling.previousElementSibling;
      }
      pathSig = `${current.tagName.toLowerCase()}[${index}]>` + pathSig;
      current = current.parentElement;
      depth++;
    }

    const rawSig = `${tag}:${type}|${placeholder}|${labelText}|${pathSig}`;
    let hash = 0;
    for (let i = 0; i < rawSig.length; i++) {
      hash = ((hash << 5) - hash) + rawSig.charCodeAt(i);
      hash |= 0;
    }

    return 'sig:' + Math.abs(hash).toString(36) + ':' + (placeholder || labelText || type).slice(0, 15);
  }

  /**
   * Link and store a username + password credential pair.
   */
  function linkCredential(username, password) {
    if (!siteMemoryCache || !username || !password) return;
    if (!Array.isArray(siteMemoryCache._credentials)) {
      siteMemoryCache._credentials = [];
    }

    const cleanUser = String(username).trim();
    const cleanPwd = String(password).trim();
    if (!cleanUser || !cleanPwd) return;

    let cred = siteMemoryCache._credentials.find(c => c.username.toLowerCase() === cleanUser.toLowerCase());
    if (!cred) {
      cred = {
        username: cleanUser,
        passwords: [{ value: cleanPwd, count: 1, lastUsed: Date.now() }],
        count: 1,
        lastUsed: Date.now()
      };
      siteMemoryCache._credentials.unshift(cred);
    } else {
      cred.count += 1;
      cred.lastUsed = Date.now();
      if (!Array.isArray(cred.passwords)) cred.passwords = [];

      const pwdMatch = cred.passwords.find(p => (typeof p === 'string' ? p : p.value) === cleanPwd);
      if (pwdMatch) {
        if (typeof pwdMatch === 'object') {
          pwdMatch.count += 1;
          pwdMatch.lastUsed = Date.now();
        }
      } else {
        cred.passwords.unshift({ value: cleanPwd, count: 1, lastUsed: Date.now() });
      }
    }
  }

  /**
   * Get linked passwords for a given username.
   */
  function getLinkedPasswords(username) {
    if (!siteMemoryCache || !Array.isArray(siteMemoryCache._credentials) || !username) return [];
    const cred = siteMemoryCache._credentials.find(c => c.username.toLowerCase() === username.toLowerCase().trim());
    if (!cred || !Array.isArray(cred.passwords)) return [];

    return cred.passwords.map(normalizeEntry).sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed);
  }

  /**
   * Save or increment a single field value in memory cache.
   */
  function commitFieldValue(fieldId, val, incrementCount = false) {
    if (!siteMemoryCache || !val) return;
    const cleanVal = String(val).trim();
    if (!cleanVal || cleanVal.length > 500) return;

    let existingList = siteMemoryCache[fieldId] || [];
    existingList = existingList.map(normalizeEntry);

    const matchIndex = existingList.findIndex(e => e.value === cleanVal);
    if (matchIndex >= 0) {
      existingList[matchIndex].lastUsed = Date.now();
      if (incrementCount) {
        existingList[matchIndex].count += 1;
      }
    } else {
      existingList.unshift({
        value: cleanVal,
        count: 1,
        lastUsed: Date.now()
      });
    }

    siteMemoryCache[fieldId] = prunePrefixes(existingList).slice(0, MAX_HISTORY_PER_FIELD);
  }

  /**
   * Delete a single entry from a field's history.
   */
  function deleteFieldValue(fieldId, valToDelete) {
    if (!siteMemoryCache) return;

    // Check regular fields
    if (siteMemoryCache[fieldId]) {
      siteMemoryCache[fieldId] = siteMemoryCache[fieldId].filter(e => {
        const val = typeof e === 'string' ? e : e.value;
        return val !== valToDelete;
      });
    }

    // Check credentials
    if (Array.isArray(siteMemoryCache._credentials)) {
      siteMemoryCache._credentials = siteMemoryCache._credentials.filter(c => {
        if (c.username === valToDelete) return false;
        if (Array.isArray(c.passwords)) {
          c.passwords = c.passwords.filter(p => (typeof p === 'string' ? p : p.value) !== valToDelete);
        }
        return true;
      });
    }

    flushStorage();
  }

  /**
   * Set value on an input element, ensuring React/Vue controlled inputs update properly.
   */
  function setFieldValue(el, value) {
    if (!el || value === undefined || value === null) return;

    try {
      const tag = el.tagName.toLowerCase();

      if (tag === 'select') {
        const stringVal = String(value).toLowerCase();
        let matched = false;
        for (const opt of el.options) {
          if (opt.value.toLowerCase() === stringVal || opt.text.toLowerCase().includes(stringVal)) {
            el.value = opt.value;
            matched = true;
            break;
          }
        }
        if (!matched && el.options.length > 0) {
          el.value = value;
        }
      } else {
        // Unconditionally assign value directly first
        el.value = value;

        // Safely invoke prototype descriptor setter if available for SPA frameworks
        try {
          const proto = tag === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
          const desc = Object.getOwnPropertyDescriptor(proto, 'value');
          if (desc && desc.set) {
            desc.set.call(el, value);
          }
        } catch (e) {
          // Ignore any Firefox Xray wrapper descriptor restriction
        }
      }

      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    } catch (err) {
      console.warn('[FormMemory] Error in setFieldValue:', err);
    }
  }

  /**
   * Remove any active dropdown from DOM.
   */
  function closeDropdown() {
    if (activeDropdown && activeDropdown.parentNode) {
      activeDropdown.parentNode.removeChild(activeDropdown);
    }
    activeDropdown = null;
    activeElement = null;
    highlightedIndex = -1;
  }

  /**
   * Update visual highlight for keyboard navigation in dropdown.
   */
  function updateHighlight() {
    if (!activeDropdown) return;
    const items = activeDropdown.querySelectorAll('.formmemory-dropdown-item');
    items.forEach((item, idx) => {
      if (idx === highlightedIndex) {
        item.classList.add('formmemory-item-highlighted');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('formmemory-item-highlighted');
      }
    });
  }

  /**
   * Display autofill suggestions dropdown below target field.
   */
  function showDropdown(el, customList = null) {
    if (!isTrackableField(el) || !siteMemoryCache) return;

    const isPassword = (el.getAttribute('type') || '').toLowerCase() === 'password';
    let candidateList = [];

    if (customList && Array.isArray(customList)) {
      candidateList = customList.map(normalizeEntry);
    } else if (isPassword) {
      const userEl = findRelatedUsernameField(el);
      const currentUserVal = (userEl && userEl.value ? userEl.value.trim() : '');
      const linked = currentUserVal ? getLinkedPasswords(currentUserVal) : [];

      if (linked.length > 0) {
        candidateList = linked;
      } else {
        const fieldId = getFieldIdentifier(el);
        candidateList = (siteMemoryCache[fieldId] || []).map(normalizeEntry);
      }
    } else {
      const fieldId = getFieldIdentifier(el);
      candidateList = (siteMemoryCache[fieldId] || []).map(normalizeEntry);

      if (isUsernameOrEmailField(el) && Array.isArray(siteMemoryCache._credentials)) {
        siteMemoryCache._credentials.forEach(cred => {
          if (!candidateList.some(c => c.value.toLowerCase() === cred.username.toLowerCase())) {
            candidateList.push({
              value: cred.username,
              count: cred.count || 1,
              lastUsed: cred.lastUsed || Date.now()
            });
          }
        });
      }
    }

    // Sort candidates by most used first
    candidateList.sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed);

    // Keep suggestions visible even if field is already filled
    const currentVal = (el.value || '').trim().toLowerCase();
    let suggestions = candidateList;
    if (currentVal) {
      const filtered = candidateList.filter(item => item.value.toLowerCase().includes(currentVal));
      suggestions = filtered.length > 0 ? filtered : candidateList;
    }

    if (suggestions.length === 0 && !isPassword) {
      closeDropdown();
      return;
    }

    closeDropdown();

    const rect = el.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    const dropdown = document.createElement('div');
    dropdown.className = 'formmemory-dropdown';
    dropdown.setAttribute('role', 'listbox');

    const minWidth = Math.max(rect.width, 210);
    dropdown.style.top = `${rect.bottom + scrollY + 4}px`;
    dropdown.style.left = `${rect.left + scrollX}px`;
    dropdown.style.width = `${minWidth}px`;

    // Action 1: "Autofill Entire Form" if form has multiple fields
    const form = el.closest('form');
    if (form) {
      const trackableFormFields = Array.from(form.querySelectorAll('input, textarea, select')).filter(isTrackableField);
      if (trackableFormFields.length >= 2) {
        const autofillAction = document.createElement('div');
        autofillAction.className = 'formmemory-dropdown-action';
        autofillAction.innerHTML = '<span>Autofill Entire Form</span>';
        autofillAction.title = 'Autofill all matching fields in this form from Job Profile & memory';

        autofillAction.addEventListener('mousedown', (e) => {
          e.preventDefault();
          closeDropdown();
          autofillFormOrSection(form);
        });

        dropdown.appendChild(autofillAction);
      }
    }

    // Action 2: If password field: Add "Generate Strong Password" action item
    if (isPassword) {
      const actionItem = document.createElement('div');
      actionItem.className = 'formmemory-dropdown-action';
      actionItem.textContent = 'Generate Strong Password (16 chars)';
      actionItem.title = 'Generate and fill a random cryptographically secure password';

      actionItem.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const pwd = generateStrongPassword(16);
        setFieldValue(el, pwd);
        closeDropdown();
        showToast('Generated & filled secure password!');

        const userEl = findRelatedUsernameField(el);
        if (userEl && userEl.value) {
          linkCredential(userEl.value, pwd);
        }
        commitFieldValue(getFieldIdentifier(el), pwd, true);
        flushStorage();
      });

      dropdown.appendChild(actionItem);
    }

    const relatedPwdField = isPassword ? null : findRelatedPasswordField(el);
    const fieldId = getFieldIdentifier(el);

    suggestions.forEach((item, idx) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'formmemory-dropdown-item';
      itemEl.setAttribute('role', 'option');

      const contentEl = document.createElement('span');
      contentEl.className = 'formmemory-item-content';

      if (isPassword) {
        contentEl.textContent = '••••••••' + (item.value.length > 8 ? ` (${item.value.length} chars)` : '');
        contentEl.title = 'Password';
      } else {
        contentEl.textContent = item.value;
        contentEl.title = item.value;
      }

      itemEl.appendChild(contentEl);

      // Only display badge for linked credentials on username/email fields
      const linkedPasswords = (!isPassword && isUsernameOrEmailField(el) && relatedPwdField) ? getLinkedPasswords(item.value) : [];
      if (linkedPasswords.length > 0) {
        const pwdBadge = document.createElement('span');
        pwdBadge.className = 'formmemory-item-badge-pwd';
        pwdBadge.textContent = linkedPasswords.length > 1 ? `${linkedPasswords.length} passwords` : '+ password';
        pwdBadge.title = linkedPasswords.length > 1
          ? `${linkedPasswords.length} passwords available for this account`
          : 'Autofills linked password';
        itemEl.appendChild(pwdBadge);
      }

      // Feature: In-Dropdown Item Deletion ('x')
      const delBtn = document.createElement('button');
      delBtn.className = 'formmemory-item-delete';
      delBtn.innerHTML = '&times;';
      delBtn.title = 'Delete this suggestion';
      delBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteFieldValue(fieldId, item.value);
        showToast('Suggestion removed');
        showDropdown(el);
      });
      itemEl.appendChild(delBtn);

      // Unified, reliable selection handler for both click and mousedown
      function selectItem(e) {
        if (e && e.target === delBtn) return;
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }

        // 1. Immediately fill the field
        setFieldValue(el, item.value);

        if (!isPassword) {
          commitFieldValue(fieldId, item.value, true);
        }

        // 2. Coordinated password fill if this is an email/username field
        if (!isPassword && isUsernameOrEmailField(el) && relatedPwdField) {
          const matchedPasswords = getLinkedPasswords(item.value);
          if (matchedPasswords.length === 1) {
            setFieldValue(relatedPwdField, matchedPasswords[0].value);
            commitFieldValue(getFieldIdentifier(relatedPwdField), matchedPasswords[0].value, true);
            closeDropdown();
            flushStorage();
            return;
          } else if (matchedPasswords.length > 1) {
            closeDropdown();
            setTimeout(() => {
              relatedPwdField.focus();
              showDropdown(relatedPwdField, matchedPasswords);
            }, 80);
            flushStorage();
            return;
          }
        }

        closeDropdown();
        flushStorage();

        // If field is in a form, ask to autofill remaining fields
        const parentForm = el.closest('form');
        if (parentForm) {
          setTimeout(() => showAutofillRemainingPrompt(parentForm, el), 250);
        }
      }

      itemEl.addEventListener('mousedown', selectItem);
      itemEl.addEventListener('click', selectItem);

      itemEl.addEventListener('mouseenter', () => {
        highlightedIndex = idx;
        updateHighlight();
      });

      dropdown.appendChild(itemEl);
    });

    document.body.appendChild(dropdown);
    activeDropdown = dropdown;
    activeElement = el;
    highlightedIndex = -1;

    const dropdownRect = dropdown.getBoundingClientRect();
    if (dropdownRect.bottom > window.innerHeight && rect.top > dropdownRect.height) {
      dropdown.style.top = `${rect.top + scrollY - dropdownRect.height - 4}px`;
    }
  }

  /**
   * Handle keyboard navigation in dropdown.
   */
  function handleKeyDown(e) {
    if (!activeDropdown) {
      if (e.key === 'ArrowDown' && e.target === activeElement) {
        showDropdown(e.target);
      }
      return;
    }

    const items = activeDropdown.querySelectorAll('.formmemory-dropdown-item');
    if (items.length === 0) return;

    // Shift + Delete to remove highlighted suggestion
    if (e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace')) {
      if (highlightedIndex >= 0 && highlightedIndex < items.length) {
        e.preventDefault();
        const delBtn = items[highlightedIndex].querySelector('.formmemory-item-delete');
        if (delBtn) delBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightedIndex = (highlightedIndex + 1) % items.length;
      updateHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightedIndex = (highlightedIndex - 1 + items.length) % items.length;
      updateHighlight();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (highlightedIndex >= 0 && highlightedIndex < items.length) {
        e.preventDefault();
        items[highlightedIndex].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
    }
  }

  /**
   * Dismiss the submit save prompt banner.
   */
  function dismissPromptBanner() {
    if (activePromptBanner && activePromptBanner.parentNode) {
      activePromptBanner.parentNode.removeChild(activePromptBanner);
    }
    activePromptBanner = null;
  }

  /**
   * Add current site to blacklist and dismiss.
   */
  async function blacklistCurrentSite() {
    try {
      const data = await browserAPI.storage.local.get('blacklist');
      const list = data.blacklist || [];
      if (!list.includes(CURRENT_HOST)) {
        list.push(CURRENT_HOST);
        await browserAPI.storage.local.set({ blacklist: list });
      }
      dismissPromptBanner();
      if (activeJobPill) activeJobPill.remove();
      showToast(`FormMemory deactivated on ${CURRENT_HOST}`);
    } catch (err) {
      console.warn('[FormMemory] Blacklist error:', err);
    }
  }

  /**
   * Display floating prompt asking the user to save submitted form fields.
   */
  function showSavePrompt(collectedFields, pair) {
    if (!collectedFields || collectedFields.length === 0) return;
    dismissPromptBanner();

    const banner = document.createElement('div');
    banner.className = 'formmemory-prompt-banner';

    const header = document.createElement('div');
    header.className = 'formmemory-prompt-header';

    const title = document.createElement('div');
    title.className = 'formmemory-prompt-title';
    title.textContent = pair && pair.username && pair.password
      ? 'Save login credentials?'
      : 'Save form information?';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'formmemory-prompt-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Dismiss';
    closeBtn.addEventListener('click', dismissPromptBanner);

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'formmemory-prompt-body';

    if (pair && pair.username && pair.password) {
      body.textContent = `Save password for ${pair.username} on ${CURRENT_HOST}?`;
    } else {
      body.textContent = `Would you like FormMemory to save ${collectedFields.length} field${collectedFields.length === 1 ? '' : 's'} for ${CURRENT_HOST}?`;
    }

    const actions = document.createElement('div');
    actions.className = 'formmemory-prompt-actions';

    const neverBtn = document.createElement('button');
    neverBtn.className = 'formmemory-prompt-btn-never';
    neverBtn.textContent = 'Never on this site';
    neverBtn.title = 'Add this domain to blacklist and silence FormMemory';
    neverBtn.addEventListener('click', blacklistCurrentSite);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'formmemory-prompt-btn formmemory-prompt-btn-subtle';
    cancelBtn.textContent = "Don't Save";
    cancelBtn.addEventListener('click', dismissPromptBanner);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'formmemory-prompt-btn formmemory-prompt-btn-primary';
    saveBtn.textContent = 'Save';

    saveBtn.addEventListener('click', async () => {
      collectedFields.forEach(({ fieldId, value }) => {
        commitFieldValue(fieldId, value, true);
      });

      if (pair && pair.username && pair.password) {
        linkCredential(pair.username, pair.password);
      }

      await flushStorage();

      saveBtn.textContent = 'Saved!';
      saveBtn.disabled = true;
      setTimeout(dismissPromptBanner, 900);
    });

    actions.appendChild(neverBtn);
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);

    banner.appendChild(header);
    banner.appendChild(body);
    banner.appendChild(actions);

    document.body.appendChild(banner);
    activePromptBanner = banner;

    setTimeout(() => {
      if (activePromptBanner === banner) {
        dismissPromptBanner();
      }
    }, 15000);
  }

  /**
   * Collect non-empty fields from a form or the surrounding page context, detecting credential pairs.
   */
  function inspectAndCollectForm(contextNode) {
    const root = (contextNode && contextNode.closest('form')) || contextNode || document;
    const inputs = root.querySelectorAll('input, textarea, select');
    const collected = [];
    let detectedUsername = '';
    let detectedPassword = '';

    inputs.forEach(el => {
      if (isTrackableField(el)) {
        const val = (el.value || '').trim();
        if (val && val.length > 1) {
          const fieldId = getFieldIdentifier(el);
          collected.push({ fieldId, value: val, el });

          if (el.tagName.toLowerCase() === 'input') {
            const type = (el.getAttribute('type') || 'text').toLowerCase();
            if (type === 'password' && !detectedPassword) {
              detectedPassword = val;
            } else if (isUsernameOrEmailField(el) && !detectedUsername) {
              detectedUsername = val;
            }
          }
        }
      }
    });

    if (!detectedUsername && detectedPassword) {
      const firstText = collected.find(item => item.el.tagName.toLowerCase() === 'input' && item.el.type !== 'password');
      if (firstText) detectedUsername = firstText.value;
    }

    const pair = (detectedUsername && detectedPassword) ? { username: detectedUsername, password: detectedPassword } : null;

    return { collected, pair };
  }

  /**
   * Handle form submission events.
   */
  function handleFormSubmit(e) {
    const { collected, pair } = inspectAndCollectForm(e.target);
    if (collected.length > 0) {
      showSavePrompt(collected, pair);
    }
  }

  /**
   * Handle clicks on potential submit/login/action buttons.
   */
  function handlePotentialSubmitClick(e) {
    const btn = e.target.closest('button, input[type="submit"], a');
    if (!btn) return;

    const isSubmitType = btn.getAttribute('type') === 'submit';
    const text = (btn.innerText || btn.value || '').toLowerCase();
    const isSubmitText = /submit|sign in|log in|login|register|create account|save/i.test(text);

    if (isSubmitType || isSubmitText) {
      const form = btn.closest('form');
      const { collected, pair } = inspectAndCollectForm(form || btn.parentElement);
      if (collected.length > 0) {
        showSavePrompt(collected, pair);
      }
    }
  }

  // ==========================================
  // JOB APPLICATION FILLING HEURISTIC ENGINE
  // ==========================================

  /**
   * Map of ATS Field Heuristics (matches Workday, Greenhouse, Lever, Ashby, BambooHR, etc.)
   */
  const JOB_FIELD_RULES = [
    { key: 'firstName', regex: /first.?name|fname|given.?name/i },
    { key: 'lastName', regex: /last.?name|lname|surname|family.?name/i },
    { key: 'fullName', regex: /full.?name|your.?name|candidate.?name|^name$/i },
    { key: 'email', regex: /email|e-mail/i },
    { key: 'phone', regex: /phone|mobile|cell|contact.?number|telephone/i },
    { key: 'company', regex: /current.?company|company.?name|employer|organization/i },
    { key: 'jobTitle', regex: /job.?title|current.?title|current.?role|designation|headline/i },
    { key: 'linkedin', regex: /linkedin|linked.?in/i },
    { key: 'github', regex: /github|git.?hub/i },
    { key: 'portfolio', regex: /portfolio|personal.?site|website|web.?page|blog/i },
    { key: 'twitter', regex: /twitter|x.?handle/i },
    { key: 'city', regex: /city/i },
    { key: 'state', regex: /state|region|province/i },
    { key: 'postalCode', regex: /zip|postal|pincode/i },
    { key: 'address', regex: /address|street/i },
    { key: 'experienceYears', regex: /years.?of.?experience|experience.?years|total.?experience/i },
    { key: 'noticePeriod', regex: /notice.?period|availability|available.?in/i },
    { key: 'expectedSalary', regex: /expected.?salary|expected.?ctc|compensation|current.?ctc/i },
    { key: 'workAuthorization', regex: /authorized.?to.?work|work.?authorization|eligible.?to.?work/i },
    { key: 'visaSponsorship', regex: /sponsorship|visa.?sponsorship|require.?sponsorship/i },
    { key: 'coverLetter', regex: /cover.?letter|summary|about.?yourself|notes/i }
  ];

  /**
   * Match an element to a job profile field key.
   */
  function matchJobFieldKey(el) {
    const name = el.getAttribute('name') || '';
    const id = el.getAttribute('id') || '';
    const placeholder = el.getAttribute('placeholder') || '';
    const aria = el.getAttribute('aria-label') || '';
    const label = getAssociatedLabelText(el);
    const type = (el.getAttribute('type') || '').toLowerCase();

    const signature = `${name} ${id} ${placeholder} ${aria} ${label}`.trim();

    if (type === 'email' && !/company.?email/i.test(signature)) {
      return 'email';
    }
    if (type === 'tel') {
      return 'phone';
    }

    for (const rule of JOB_FIELD_RULES) {
      if (rule.regex.test(signature)) {
        // Special case: don't confuse firstName with fullName
        if (rule.key === 'fullName' && /first/i.test(signature)) continue;
        return rule.key;
      }
    }

    return null;
  }

  /**
   * Autofill all matching job application fields on the page.
   */
  async function autofillJobApplication() {
    const data = await browserAPI.storage.local.get('job_profile');
    const profile = data.job_profile;

    if (!profile) {
      showToast('No Job Profile saved. Set up in FormMemory popup.');
      return;
    }

    const fields = document.querySelectorAll('input, textarea, select');
    let filledCount = 0;

    fields.forEach(el => {
      if (!isTrackableField(el)) return;
      const key = matchJobFieldKey(el);
      if (!key) return;

      const profileValue = profile[key];
      if (profileValue !== undefined && profileValue !== null && String(profileValue).trim() !== '') {
        setFieldValue(el, profileValue);
        filledCount++;
      }
    });

    if (filledCount > 0) {
      showToast(`FormMemory: Autofilled ${filledCount} job application fields!`);
    } else {
      showToast('No matching job application fields found.');
    }
  }

  /**
   * Autofill a specific form or container from Job Profile + Site Memory.
   */
  async function autofillFormOrSection(form) {
    if (!form) return;
    const data = await browserAPI.storage.local.get(['job_profile', STORAGE_KEY]);
    const profile = data.job_profile || {};
    const siteMem = data[STORAGE_KEY] || {};

    const fields = Array.from(form.querySelectorAll('input, textarea, select')).filter(isTrackableField);
    let filledCount = 0;

    fields.forEach(el => {
      if (el.value && String(el.value).trim() !== '') return;

      const jobKey = matchJobFieldKey(el);
      if (jobKey && profile[jobKey] !== undefined && String(profile[jobKey]).trim() !== '') {
        setFieldValue(el, profile[jobKey]);
        filledCount++;
        return;
      }

      const fieldId = getFieldIdentifier(el);
      const history = siteMem[fieldId];
      if (Array.isArray(history) && history.length > 0) {
        const topVal = typeof history[0] === 'string' ? history[0] : history[0].value;
        if (topVal) {
          setFieldValue(el, topVal);
          filledCount++;
        }
      }
    });

    if (filledCount > 0) {
      showToast(`FormMemory: Autofilled ${filledCount} form fields!`);
    } else {
      showToast('All fields are already filled or no profile data matched.');
    }
  }

  let activeAutofillPrompt = null;

  /**
   * Ask the user whether to autofill the rest of the form.
   */
  function showAutofillRemainingPrompt(form, triggerEl) {
    if (!form || activeAutofillPrompt) return;

    const emptyFields = Array.from(form.querySelectorAll('input, textarea, select'))
      .filter(el => isTrackableField(el) && el !== triggerEl && (!el.value || !el.value.trim()));

    if (emptyFields.length < 2) return;

    const banner = document.createElement('div');
    banner.className = 'formmemory-autofill-prompt';

    const textWrap = document.createElement('div');
    textWrap.className = 'formmemory-autofill-prompt-text';
    textWrap.innerHTML = `<span>Autofill ${emptyFields.length} other fields in this form?</span>`;

    const fillBtn = document.createElement('button');
    fillBtn.className = 'formmemory-autofill-prompt-btn';
    fillBtn.textContent = 'Autofill All';
    fillBtn.addEventListener('click', () => {
      banner.remove();
      activeAutofillPrompt = null;
      autofillFormOrSection(form);
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'formmemory-autofill-prompt-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Dismiss';
    closeBtn.addEventListener('click', () => {
      banner.remove();
      activeAutofillPrompt = null;
    });

    banner.appendChild(textWrap);
    banner.appendChild(fillBtn);
    banner.appendChild(closeBtn);

    document.body.appendChild(banner);
    activeAutofillPrompt = banner;

    setTimeout(() => {
      if (activeAutofillPrompt === banner) {
        banner.remove();
        activeAutofillPrompt = null;
      }
    }, 9000);
  }

  let jobPillDismissed = false;

  /**
   * Check if the page looks like an authentic job application form and display a floating fill pill.
   */
  async function checkAndRenderJobPill() {
    if (jobPillDismissed) return;

    // Check if user disabled the floating pill in popup settings
    const setting = await browserAPI.storage.local.get('show_job_pill');
    if (setting.show_job_pill === false) return;

    // Guard against duplicate pills in DOM
    const existingPills = document.querySelectorAll('.formmemory-job-pill');
    if (existingPills.length > 0) return;

    const fields = document.querySelectorAll('input, textarea, select');
    let matchedTotal = 0;
    let hasDistinctiveJobField = false;

    // Specific fields that distinguish a real job application from generic login/contact forms
    const DISTINCTIVE_JOB_KEYS = new Set([
      'company', 'jobTitle', 'linkedin', 'github', 'portfolio',
      'experienceYears', 'noticePeriod', 'expectedSalary',
      'workAuthorization', 'visaSponsorship', 'coverLetter'
    ]);

    fields.forEach(el => {
      if (isTrackableField(el)) {
        const key = matchJobFieldKey(el);
        if (key) {
          matchedTotal++;
          if (DISTINCTIVE_JOB_KEYS.has(key)) {
            hasDistinctiveJobField = true;
          }
        }
      }
    });

    // Check if the current URL is a known ATS portal or careers page
    const isJobUrl = /(greenhouse\.io|lever\.co|workday|myworkdayjobs|ashbyhq|bamboohr|smartrecruiters|taleo|icims|jobvite|workable|recruitee|\/apply|\/careers|\/jobs)/i.test(window.location.href);

    // Strict authentic job portal criteria:
    // 1. On an ATS / careers domain with at least 2 fields
    // 2. OR on any page that has at least 1 distinctive job field (e.g. LinkedIn, Portfolio, Work Auth) AND at least 3 fields total
    const isAuthenticJobPage = (isJobUrl && matchedTotal >= 2) || (hasDistinctiveJobField && matchedTotal >= 3);

    if (!isAuthenticJobPage) {
      return; // Do NOT show on normal login, contact, or search forms!
    }

    const pill = document.createElement('div');
    pill.className = 'formmemory-job-pill';

    const btn = document.createElement('button');
    btn.className = 'formmemory-job-pill-btn';
    btn.innerHTML = `<span>Fill Job App</span> <span class="formmemory-job-pill-badge">${matchedTotal} fields</span>`;
    btn.title = '1-Click Autofill Job Application (Alt+Shift+J)';
    btn.addEventListener('click', () => {
      autofillJobApplication();
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'formmemory-job-pill-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Dismiss for this page';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      jobPillDismissed = true;
      pill.remove();
      activeJobPill = null;
    });

    pill.appendChild(btn);
    pill.appendChild(closeBtn);
    document.body.appendChild(pill);
    activeJobPill = pill;
  }

  /**
   * Attach listeners to a tracked element.
   */
  function attachFieldListeners(el) {
    if (trackedElements.has(el)) return;
    trackedElements.add(el);

    el.addEventListener('change', () => {
      const val = (el.value || '').trim();
      if (val && val.length > 1) {
        const fieldId = getFieldIdentifier(el);
        commitFieldValue(fieldId, val, false);

        const pwdField = findRelatedPasswordField(el);
        if (pwdField && pwdField.value && isUsernameOrEmailField(el)) {
          linkCredential(val, pwdField.value);
        }

        flushStorage();
      }
    });

    el.addEventListener('focus', () => {
      showDropdown(el);
    });

    el.addEventListener('click', () => {
      showDropdown(el);
    });

    el.addEventListener('input', () => {
      if (activeElement === el) {
        showDropdown(el);
      }
    });

    el.addEventListener('keydown', handleKeyDown);

    el.addEventListener('blur', () => {
      setTimeout(() => {
        if (activeElement === el) {
          closeDropdown();
        }
      }, 180);
    });
  }

  /**
   * Scan and register all form elements currently in the DOM.
   */
  function scanExistingFields() {
    const fields = document.querySelectorAll('input, textarea, select');
    fields.forEach(el => {
      if (isTrackableField(el)) {
        attachFieldListeners(el);
      }
    });
    checkAndRenderJobPill();
  }

  /**
   * Setup debounced MutationObserver for dynamic SPAs.
   */
  function setupMutationObserver() {
    let observerTimer = null;

    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const tag = node.tagName.toLowerCase();
              if (tag === 'input' || tag === 'textarea' || tag === 'select' || node.querySelector('input, textarea, select')) {
                shouldScan = true;
                break;
              }
            }
          }
        }
        if (shouldScan) break;
      }

      if (shouldScan) {
        clearTimeout(observerTimer);
        observerTimer = setTimeout(scanExistingFields, OBSERVER_DEBOUNCE_MS);
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Setup global event listeners.
   */
  function setupGlobalListeners() {
    document.addEventListener('submit', handleFormSubmit, true);
    document.addEventListener('click', handlePotentialSubmitClick, true);

    document.addEventListener('click', (e) => {
      if (activeDropdown && !activeDropdown.contains(e.target) && e.target !== activeElement) {
        closeDropdown();
      }
    }, true);

    window.addEventListener('scroll', () => {
      if (activeDropdown) closeDropdown();
    }, { passive: true });

    window.addEventListener('resize', () => {
      if (activeDropdown) closeDropdown();
    }, { passive: true });

    // Listen for background keyboard shortcut (Alt+Shift+J)
    browserAPI.runtime.onMessage.addListener((msg) => {
      if (msg && msg.action === 'TRIGGER_JOB_FILL') {
        autofillJobApplication();
      }
    });
  }

  /**
   * Initialize extension content script.
   */
  async function init() {
    const active = await loadStorageData();
    if (!active) {
      console.log(`[FormMemory] Domain ${CURRENT_HOST} is blacklisted. Inactive.`);
      return;
    }

    scanExistingFields();
    setupMutationObserver();
    setupGlobalListeners();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
