/**
 * FormMemory - Popup Script
 * Manages Job Profile, Saved Site Histories, Blacklist, and JSON Backup/Restore.
 */

function initPopup() {
  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  // Tabs
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Job Profile Elements
  const jobProfileForm = document.getElementById('jobProfileForm');
  const quickFillHeaderBtn = document.getElementById('quickFillHeaderBtn');
  const jobFieldIds = [
    'firstName', 'lastName', 'fullName', 'email', 'phone',
    'company', 'jobTitle', 'experienceYears', 'noticePeriod',
    'linkedin', 'github', 'portfolio', 'city', 'state',
    'workAuthorization', 'visaSponsorship', 'coverLetter'
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
      const data = await browserAPI.storage.local.get('job_profile');
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

  jobProfileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const profile = {};
    jobFieldIds.forEach(id => {
      const input = document.getElementById(`job_${id}`);
      if (input) profile[id] = input.value.trim();
    });

    try {
      await browserAPI.storage.local.set({ job_profile: profile });
      showNotification('Job Profile saved successfully!');
    } catch (err) {
      console.error('[FormMemory Popup] Error saving job profile:', err);
    }
  });

  // Quick fill button in header
  quickFillHeaderBtn.addEventListener('click', async () => {
    try {
      const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        await browserAPI.tabs.sendMessage(tab.id, { action: 'TRIGGER_JOB_FILL' });
        showNotification('Autofill command sent to active tab!');
      }
    } catch (err) {
      showNotification('Could not autofill current tab');
    }
  });

  // ----------------------------------------------------
  // SAVED SITES LOGIC
  // ----------------------------------------------------
  async function loadSitesData() {
    try {
      const allItems = await browserAPI.storage.local.get(null);
      sitesData = [];

      for (const [key, value] of Object.entries(allItems)) {
        if (key.startsWith('site:')) {
          const hostname = key.slice('site:'.length);
          const fields = value && typeof value === 'object' ? value : {};
          const fieldKeys = Object.keys(fields).filter(k => k !== '_credentials');
          let totalEntries = 0;

          fieldKeys.forEach(f => {
            if (Array.isArray(fields[f])) {
              totalEntries += fields[f].length;
            }
          });

          if (Array.isArray(fields._credentials)) {
            totalEntries += fields._credentials.length;
          }

          sitesData.push({
            storageKey: key,
            hostname,
            fieldCount: fieldKeys.length,
            entryCount: totalEntries
          });
        }
      }

      sitesData.sort((a, b) => a.hostname.localeCompare(b.hostname));
      renderSitesList();
    } catch (err) {
      console.error('[FormMemory Popup] Failed to load site data:', err);
    }
  }

  function renderSitesList() {
    const query = (searchInput.value || '').trim().toLowerCase();
    const filtered = sitesData.filter(s => s.hostname.toLowerCase().includes(query));

    sitesList.innerHTML = '';

    if (sitesData.length === 0) {
      emptyState.style.display = 'block';
      clearAllBtn.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';
    clearAllBtn.style.display = 'block';

    if (filtered.length === 0) {
      const noMatch = document.createElement('div');
      noMatch.className = 'empty-state';
      noMatch.style.display = 'block';
      noMatch.textContent = 'No matching sites found.';
      sitesList.appendChild(noMatch);
      return;
    }

    filtered.forEach(site => {
      const li = document.createElement('li');
      li.className = 'site-row';

      const info = document.createElement('div');
      info.className = 'site-info';

      const hostnameEl = document.createElement('span');
      hostnameEl.className = 'site-hostname';
      hostnameEl.textContent = site.hostname;
      hostnameEl.title = site.hostname;

      const metaEl = document.createElement('span');
      metaEl.className = 'site-meta';
      metaEl.textContent = `${site.fieldCount} fields · ${site.entryCount} values`;

      info.appendChild(hostnameEl);
      info.appendChild(metaEl);

      const clearBtn = document.createElement('button');
      clearBtn.className = 'btn btn-subtle';
      clearBtn.textContent = 'Clear';
      clearBtn.title = `Clear saved data for ${site.hostname}`;

      clearBtn.addEventListener('click', async () => {
        try {
          await browserAPI.storage.local.remove(site.storageKey);
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

  clearAllBtn.addEventListener('click', async () => {
    if (sitesData.length === 0) return;
    const confirmClear = confirm('Are you sure you want to clear all stored form memory across all sites?');
    if (!confirmClear) return;

    try {
      const keysToRemove = sitesData.map(s => s.storageKey);
      await browserAPI.storage.local.remove(keysToRemove);
      sitesData = [];
      renderSitesList();
      showNotification('All saved site data cleared');
    } catch (err) {
      console.error('[FormMemory Popup] Failed to clear all:', err);
    }
  });

  searchInput.addEventListener('input', renderSitesList);

  // ----------------------------------------------------
  // BLACKLIST LOGIC
  // ----------------------------------------------------
  async function loadBlacklist() {
    try {
      const data = await browserAPI.storage.local.get('blacklist');
      currentBlacklist = data.blacklist || [];
      renderBlacklist();
    } catch (err) {
      console.error('[FormMemory Popup] Error loading blacklist:', err);
    }
  }

  function renderBlacklist() {
    blackclassList.innerHTML = '';
    if (currentBlacklist.length === 0) {
      blackclassList.innerHTML = '<li style="font-size:11px; color:var(--text-secondary);">No blacklisted sites.</li>';
      return;
    }

    currentBlacklist.forEach(domain => {
      const tag = document.createElement('li');
      tag.className = 'tag-item';
      tag.innerHTML = `<span>${domain}</span><span class="tag-close" title="Remove">&times;</span>`;

      tag.querySelector('.tag-close').addEventListener('click', async () => {
        currentBlacklist = currentBlacklist.filter(d => d !== domain);
        await browserAPI.storage.local.set({ blacklist: currentBlacklist });
        renderBlacklist();
        showNotification(`Removed ${domain} from blacklist`);
      });

      blackclassList.appendChild(tag);
    });
  }

  addBlacklistBtn.addEventListener('click', async () => {
    const val = (blacklistInput.value || '').trim().toLowerCase();
    if (!val) return;
    const domain = val.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

    if (!currentBlacklist.includes(domain)) {
      currentBlacklist.push(domain);
      await browserAPI.storage.local.set({ blacklist: currentBlacklist });
      blacklistInput.value = '';
      renderBlacklist();
      showNotification(`Added ${domain} to blacklist`);
    }
  });

  // ----------------------------------------------------
  // BACKUP & RESTORE (EXPORT / IMPORT JSON)
  // ----------------------------------------------------
  exportBtn.addEventListener('click', async () => {
    try {
      const allData = await browserAPI.storage.local.get(null);
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

  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        if (typeof importedData !== 'object') throw new Error('Invalid JSON');

        await browserAPI.storage.local.set(importedData);
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

  // ----------------------------------------------------
  // NOTIFICATION HELPER
  // ----------------------------------------------------
  function showNotification(msg) {
    statusText.textContent = msg;
    setTimeout(() => {
      statusText.textContent = 'Stored locally on your device';
    }, 2500);
  }

  // Floating button preference
  const showJobPillCheckbox = document.getElementById('showJobPillCheckbox');
  if (showJobPillCheckbox) {
    browserAPI.storage.local.get('show_job_pill').then(data => {
      showJobPillCheckbox.checked = data.show_job_pill !== false;
    });
    showJobPillCheckbox.addEventListener('change', () => {
      browserAPI.storage.local.set({ show_job_pill: showJobPillCheckbox.checked });
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
