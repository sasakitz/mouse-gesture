document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('enabled-toggle');
  const settingsBtn = document.getElementById('settings-btn');

  // Load current config
  const result = await chrome.storage.sync.get('gestureConfig');
  const config = result.gestureConfig;
  if (config) {
    toggle.checked = config.enabled;
  }

  // Toggle handler
  toggle.addEventListener('change', async () => {
    const result = await chrome.storage.sync.get('gestureConfig');
    const config = result.gestureConfig || {};
    config.enabled = toggle.checked;
    await chrome.storage.sync.set({ gestureConfig: config });
  });

  // Open settings page
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
});
