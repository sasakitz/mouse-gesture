const DEFAULT_CONFIG = {
  enabled: true,
  minDistance: 30,
  trailColor: '#3b82f6',
  trailOpacity: 0.75,
  trailWidth: 3,
  blacklist: [],
  contextMenuKey: 'shiftKey',
  gestures: {
    'L':  { action: 'back',         label: '戻る' },
    'R':  { action: 'forward',      label: '進む' },
    'U':  { action: 'scrollTop',    label: '最上部へスクロール' },
    'D':  { action: 'scrollBottom', label: '最下部へスクロール' },
    'DR': { action: 'closeTab',     label: 'タブを閉じる' },
    'DU': { action: 'reload',       label: 'リロード' },
  }
};

chrome.runtime.onInstalled.addListener(async () => {
  const result = await chrome.storage.sync.get('gestureConfig');
  if (!result.gestureConfig) {
    await chrome.storage.sync.set({ gestureConfig: DEFAULT_CONFIG });
  }
  updateIcon(DEFAULT_CONFIG.enabled);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.gestureConfig) {
    const config = changes.gestureConfig.newValue;
    updateIcon(config?.enabled ?? true);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CONFIG') {
    chrome.storage.sync.get('gestureConfig').then((result) => {
      const config = result.gestureConfig || DEFAULT_CONFIG;
      sendResponse({ success: true, config });
    });
    return true; // keep channel open for async response
  }

  if (message.type === 'EXECUTE_ACTION') {
    const tabId = sender.tab?.id;
    executeAction(message.action, tabId)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'DOWNLOAD_MEDIA') {
    chrome.downloads.download({ url: message.url })
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function executeAction(action, tabId) {
  switch (action) {
    case 'back':
      await chrome.tabs.goBack(tabId);
      break;
    case 'forward':
      await chrome.tabs.goForward(tabId);
      break;
    case 'reload':
      await chrome.tabs.reload(tabId);
      break;
    case 'closeTab':
      await chrome.tabs.remove(tabId);
      break;
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

function updateIcon(enabled) {
  const size = 128;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  const radius = 24;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.arcTo(size, 0, size, radius, radius);
  ctx.lineTo(size, size - radius);
  ctx.arcTo(size, size, size - radius, size, radius);
  ctx.lineTo(radius, size);
  ctx.arcTo(0, size, 0, size - radius, radius);
  ctx.lineTo(0, radius);
  ctx.arcTo(0, 0, radius, 0, radius);
  ctx.closePath();
  ctx.fillStyle = enabled ? '#312e81' : '#6b7280';
  ctx.fill();

  // Gesture trail (L-shape: down then right)
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = enabled ? 1.0 : 0.5;

  ctx.beginPath();
  ctx.moveTo(44, 28);
  ctx.lineTo(44, 78);
  ctx.lineTo(92, 78);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(78, 64);
  ctx.lineTo(92, 78);
  ctx.lineTo(78, 92);
  ctx.stroke();

  // Start dot
  ctx.beginPath();
  ctx.arc(44, 28, 6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill();

  const imageData = ctx.getImageData(0, 0, size, size);
  chrome.action.setIcon({ imageData });
}
