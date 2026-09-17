/**
 * FormMemory - Background Script (Manifest V3)
 * Handles extension lifecycle and keyboard command dispatching.
 */

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

browserAPI.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[FormMemory] Extension installed successfully.');
  }
});

// Keyboard shortcut handler (Alt+Shift+F)
browserAPI.commands.onCommand.addListener(async (command) => {
  if (command === 'quick_fill_job') {
    try {
      const [activeTab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
      if (activeTab && activeTab.id) {
        browserAPI.tabs.sendMessage(activeTab.id, { action: 'TRIGGER_JOB_FILL' });
      }
    } catch (err) {
      console.warn('[FormMemory] Error sending shortcut action:', err);
    }
  }
});
