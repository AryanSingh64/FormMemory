/**
 * FormMemory - Popup Script
 * Manages Job Profile, Saved Site Histories, Blacklist, and JSON Backup/Restore.
 */

function initPopup() {
  // Safe storage wrappers supporting both Promise (Firefox) and callback (Chrome) APIs
  const getStorage = (keys) => {
    return new Promise((resolve) => {
      try {
        if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
          const p = browser.storage.local.get(keys);
          if (p && typeof p.then === 'function') {
            return p.then(res => resolve(res || {})).catch(() => resolve({}));
          }
        }
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(keys, (res) => {
            if (chrome.runtime && chrome.runtime.lastError) {
              resolve({});
            } else {
              resolve(res || {});
            }
          });
          return;
        }
        resolve({});
      } catch (err) {
        console.warn('[FormMemory Popup] Storage get error:', err);
        resolve({});
      }
    });
  };

  const setStorage = (items) => {
    return new Promise((resolve) => {
      try {
        if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
          const p = browser.storage.local.set(items);
          if (p && typeof p.then === 'function') {
            return p.then(resolve).catch(() => resolve());
          }
        }
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set(items, () => resolve());
          return;
        }
        resolve();
      } catch (err) {
        console.warn('[FormMemory Popup] Storage set error:', err);
        resolve();
      }
    });
  };

  const removeStorage = (keys) => {
    return new Promise((resolve) => {
      try {
        if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
          const p = browser.storage.local.remove(keys);
          if (p && typeof p.then === 'function') {
            return p.then(resolve).catch(() => resolve());
          }
        }
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.remove(keys, () => resolve());
          return;
        }
        resolve();
      } catch (err) {
        console.warn('[FormMemory Popup] Storage remove error:', err);
        resolve();
      }
    });
  };

  // Tabs
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Job Profile Elements
  const jobProfileForm = document.getElementById('jobProfileForm');
  const quickFillHeaderBtn = document.getElementById('quickFillHeaderBtn');
  const jobFieldIds = [
    // Personal
    'firstName', 'lastName', 'fullName', 'email', 'phone', 'gender',
    // Address & Location
    'address', 'addressLine2', 'city', 'state', 'postalCode', 'country',
    // Professional & Experience
    'company', 'jobTitle', 'experienceYears', 'noticePeriod',
    'currentSalary', 'expectedSalary', 'startDate', 'workMode', 'relocation',
    // Education & Academics
    'university', 'rollNo', 'degree', 'major', 'gradYear', 'gpa', 'tenthMarks', 'twelfthMarks',
    // Links & Social
    'linkedin', 'github', 'portfolio', 'twitter',
    // Work Eligibility & Screening
    'workAuthorization', 'visaSponsorship', 'veteranStatus', 'disabilityStatus', 'ethnicity', 'referralSource', 'terms',
    // Skills & Summary
    'skills', 'coverLetter', 'whyUs'
  ];

  // Sites Elements
  const sitesList = document.getElementById('sitesList');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const statusText = document.getElementById('statusText');

  // Blacklist & Backup Elements
  const blacklistInput = document.getElementById('blacklistInput');
  const addBlacklistBtn = document.getElementById('addBlacklistBtn');
  const blackclassList = document.getElementById('blackclassList');
  const exportBtn = document.getElementById('exportBtn');
  const importFileInput = document.getElementById('importFileInput');

  let sitesData = [];
  let currentBlacklist = [];

  // ----------------------------------------------------
  // NOTIFICATION HELPER
  // ----------------------------------------------------
  function showNotification(msg) {
    if (statusText) {
      statusText.textContent = msg;
      setTimeout(() => {
        if (statusText) statusText.textContent = 'Stored locally on your device';
      }, 2500);
    }
  }

  // ----------------------------------------------------
  // TAB NAVIGATION
  // ----------------------------------------------------
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');

      if (targetId === 'tabSites') loadSitesData();
      if (targetId === 'tabSettings') loadBlacklist();
    });
  });

  // ----------------------------------------------------
  // JOB PROFILE LOGIC
  // ----------------------------------------------------
  async function loadJobProfile() {
    try {
      const data = await getStorage('job_profile');
      const profile = data.job_profile || {};

      jobFieldIds.forEach(id => {
        const input = document.getElementById(`job_${id}`);
        if (input && profile[id] !== undefined) {
          input.value = profile[id];
        }
      });
    } catch (err) {
      console.error('[FormMemory Popup] Error loading job profile:', err);
    }
  }

  if (jobProfileForm) {
    jobProfileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const profile = {};
      jobFieldIds.forEach(id => {
        const input = document.getElementById(`job_${id}`);
        if (input) profile[id] = input.value.trim();
      });

      try {
        await setStorage({ job_profile: profile });
        showNotification('Job Profile saved successfully!');
      } catch (err) {
        console.error('[FormMemory Popup] Error saving job profile:', err);
      }
    });
  }

  // Quick fill button in header
  if (quickFillHeaderBtn) {
    quickFillHeaderBtn.addEventListener('click', async () => {
      try {
        const queryTabs = () => new Promise(res => {
          if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.query) {
            const p = browser.tabs.query({ active: true, currentWindow: true });
            if (p && typeof p.then === 'function') return p.then(res).catch(() => res([]));
          }
          if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
            chrome.tabs.query({ active: true, currentWindow: true }, tabs => res(tabs || []));
            return;
          }
          res([]);
        });

        const tabs = await queryTabs();
        if (tabs && tabs[0] && tabs[0].id) {
          const sendMsg = (tabId, msg) => new Promise(res => {
            if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.sendMessage) {
              const p = browser.tabs.sendMessage(tabId, msg);
              if (p && typeof p.then === 'function') return p.then(res).catch(() => res(null));
            }
            if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.sendMessage) {
              chrome.tabs.sendMessage(tabId, msg, res);
              return;
            }
            res(null);
          });

          await sendMsg(tabs[0].id, { action: 'TRIGGER_JOB_FILL' });
          showNotification('Autofill command sent to active tab!');
        }
      } catch (err) {
        showNotification('Could not autofill current tab');
      }
    });
  }

  // ----------------------------------------------------
  // SAVED SITES LOGIC
  // ----------------------------------------------------
  async function loadSitesData() {
    try {
      const allItems = await getStorage(null);
      sitesData = [];

      for (const [key, value] of Object.entries(allItems)) {
        if (key.startsWith('site:')) {
          const hostname = key.slice('site:'.length);
          const fields = value && typeof value === 'object' ? value : {};
          const fieldKeys = Object.keys(fields).filter(k => k !== '_credentials');
          let totalEntries = 0;

          fieldKeys.forEach(fk => {
            if (Array.isArray(fields[fk])) {
              totalEntries += fields[fk].length;
            }
          });

          const hasCredentials = Boolean(fields._credentials && (fields._credentials.username || fields._credentials.password));

          sitesData.push({
            hostname,
            storageKey: key,
            fieldCount: fieldKeys.length,
            totalEntries,
            hasCredentials
          });
        }
      }

      sitesData.sort((a, b) => a.hostname.localeCompare(b.hostname));
      renderSitesList();
    } catch (err) {
      console.error('[FormMemory Popup] Error loading sites data:', err);
    }
  }

  function renderSitesList() {
    if (!sitesList) return;
    sitesList.textContent = '';
    const query = (searchInput ? searchInput.value : '').toLowerCase().trim();

    const filtered = sitesData.filter(site => site.hostname.toLowerCase().includes(query));

    if (filtered.length === 0) {
      if (emptyState) {
        emptyState.style.display = 'block';
        emptyState.textContent = query ? 'No matching sites found.' : 'No saved form data yet.';
      }
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    filtered.forEach(site => {
      const li = document.createElement('li');
      li.className = 'site-item';

      const info = document.createElement('div');
      info.className = 'site-info';

      const hostSpan = document.createElement('span');
      hostSpan.className = 'site-host';
      hostSpan.textContent = site.hostname;
      info.appendChild(hostSpan);

      const meta = document.createElement('div');
      meta.className = 'site-meta';
      meta.textContent = `${site.fieldCount} fields (${site.totalEntries} entries)`;

      if (site.hasCredentials) {
        const credBadge = document.createElement('span');
        credBadge.className = 'badge';
        credBadge.style.fontSize = '10px';
        credBadge.style.marginLeft = '6px';
        credBadge.textContent = 'Auth Saved';
        meta.appendChild(credBadge);
      }
      info.appendChild(meta);

      const clearBtn = document.createElement('button');
      clearBtn.className = 'btn btn-subtle';
      clearBtn.textContent = 'Clear';
      clearBtn.title = `Clear saved data for ${site.hostname}`;

      clearBtn.addEventListener('click', async () => {
        try {
          await removeStorage(site.storageKey);
          sitesData = sitesData.filter(s => s.storageKey !== site.storageKey);
          renderSitesList();
          showNotification(`Cleared ${site.hostname}`);
        } catch (err) {
          console.error('[FormMemory Popup] Failed to clear site:', err);
        }
      });

      li.appendChild(info);
      li.appendChild(clearBtn);
      sitesList.appendChild(li);
    });
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', async () => {
      if (sitesData.length === 0) return;
      const confirmClear = confirm('Are you sure you want to clear all stored form memory across all sites?');
      if (!confirmClear) return;

      try {
        const keysToRemove = sitesData.map(s => s.storageKey);
        await removeStorage(keysToRemove);
        sitesData = [];
        renderSitesList();
        showNotification('All saved site data cleared');
      } catch (err) {
        console.error('[FormMemory Popup] Failed to clear all:', err);
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', renderSitesList);
  }

  // ----------------------------------------------------
  // BLACKLIST LOGIC
  // ----------------------------------------------------
  async function loadBlacklist() {
    try {
      const data = await getStorage('blacklist');
      currentBlacklist = data.blacklist || [];
      renderBlacklist();
    } catch (err) {
      console.error('[FormMemory Popup] Error loading blacklist:', err);
    }
  }

  function renderBlacklist() {
    if (!blackclassList) return;
    blackclassList.textContent = '';
    if (currentBlacklist.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.style.fontSize = '11px';
      emptyLi.style.color = 'var(--text-secondary)';
      emptyLi.textContent = 'No blacklisted sites.';
      blackclassList.appendChild(emptyLi);
      return;
    }

    currentBlacklist.forEach(domain => {
      const tag = document.createElement('li');
      tag.className = 'tag-item';

      const domainSpan = document.createElement('span');
      domainSpan.textContent = domain;

      const closeSpan = document.createElement('span');
      closeSpan.className = 'tag-close';
      closeSpan.title = 'Remove';
      closeSpan.textContent = '\u00D7';

      tag.appendChild(domainSpan);
      tag.appendChild(closeSpan);

      closeSpan.addEventListener('click', async () => {
        currentBlacklist = currentBlacklist.filter(d => d !== domain);
        await setStorage({ blacklist: currentBlacklist });
        renderBlacklist();
        showNotification(`Removed ${domain} from blacklist`);
      });

      blackclassList.appendChild(tag);
    });
  }

  if (addBlacklistBtn && blacklistInput) {
    addBlacklistBtn.addEventListener('click', async () => {
      const val = (blacklistInput.value || '').trim().toLowerCase();
      if (!val) return;
      const domain = val.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

      if (!currentBlacklist.includes(domain)) {
        currentBlacklist.push(domain);
        await setStorage({ blacklist: currentBlacklist });
        blacklistInput.value = '';
        renderBlacklist();
        showNotification(`Added ${domain} to blacklist`);
      }
    });
  }

  // ----------------------------------------------------
  // BACKUP & RESTORE (EXPORT / IMPORT JSON)
  // ----------------------------------------------------
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      try {
        const allData = await getStorage(null);
        const jsonStr = JSON.stringify(allData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `formmemory-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('Backup downloaded successfully!');
      } catch (err) {
        console.error('[FormMemory Popup] Export failed:', err);
        showNotification('Export failed');
      }
    });
  }

  if (importFileInput) {
    importFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedData = JSON.parse(event.target.result);
          if (typeof importedData !== 'object') throw new Error('Invalid JSON');

          await setStorage(importedData);
          showNotification('Backup restored successfully!');
          loadJobProfile();
          loadSitesData();
          loadBlacklist();
        } catch (err) {
          alert('Failed to import: Invalid JSON backup file.');
        }
      };
      reader.readAsText(file);
      importFileInput.value = '';
    });
  }

  // Floating button preference
  const showJobPillCheckbox = document.getElementById('showJobPillCheckbox');
  if (showJobPillCheckbox) {
    getStorage('show_job_pill').then(data => {
      showJobPillCheckbox.checked = data && data.show_job_pill !== false;
    });
    showJobPillCheckbox.addEventListener('change', async () => {
      await setStorage({ show_job_pill: showJobPillCheckbox.checked });
      showNotification(showJobPillCheckbox.checked ? 'Floating button enabled' : 'Floating button hidden');
    });
  }

  // Initial setup
  loadJobProfile();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPopup);
} else {
  initPopup();
}
