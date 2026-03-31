const ACTION_OPTIONS = [
  { value: 'back',         label: '戻る' },
  { value: 'forward',      label: '進む' },
  { value: 'reload',       label: 'リロード' },
  { value: 'closeTab',     label: 'タブを閉じる' },
  { value: 'scrollTop',    label: '最上部へスクロール' },
  { value: 'scrollBottom', label: '最下部へスクロール' },
  { value: 'none',         label: '(未割当)' },
];

const ARROWS = { L: '←', R: '→', U: '↑', D: '↓' };
const DIRECTION_THRESHOLD = 12;

let currentConfig = null;
let toastTimer = null;

// ─── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  setupNavigation();
  renderGestureList();
  setupAppearanceControls();
  setupCustomRecorder();
  setupBlacklist();
  setupReverseList();
});

async function loadConfig() {
  const result = await chrome.storage.sync.get('gestureConfig');
  currentConfig = result.gestureConfig || getDefaultConfig();
}

async function saveConfig() {
  await chrome.storage.sync.set({ gestureConfig: currentConfig });
  showToast('保存しました');
}

function getDefaultConfig() {
  return {
    enabled: true,
    minDistance: 30,
    trailColor: '#3b82f6',
    trailOpacity: 0.75,
    trailWidth: 3,
    blacklist: [],
    reverseList: [],
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
}

// ─── Navigation ─────────────────────────────────────────────────────────────

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      const sectionId = 'section-' + item.dataset.section;
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById(sectionId)?.classList.add('active');
    });
  });
}

// ─── Gesture List ────────────────────────────────────────────────────────────

function renderGestureList() {
  const list = document.getElementById('gesture-list');
  list.innerHTML = '';

  const gestures = currentConfig.gestures || {};
  const sorted = Object.entries(gestures).sort((a, b) => a[0].localeCompare(b[0]));

  for (const [sequence, gesture] of sorted) {
    list.appendChild(createGestureRow(sequence, gesture.action));
  }
}

function createGestureRow(sequence, action) {
  const row = document.createElement('div');
  row.className = 'gesture-row';
  row.dataset.sequence = sequence;

  // Arrow diagram canvas
  const canvas = document.createElement('canvas');
  canvas.className = 'gesture-diagram';
  canvas.width = 90;
  canvas.height = 40;
  drawGestureDiagram(canvas, sequence);

  // Sequence label (monospace hint)
  const seqLabel = document.createElement('span');
  seqLabel.className = 'gesture-sequence-label';
  seqLabel.textContent = sequence;

  // Action select
  const select = document.createElement('select');
  select.className = 'action-select';
  for (const opt of ACTION_OPTIONS) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === action) option.selected = true;
    select.appendChild(option);
  }
  select.addEventListener('change', async () => {
    currentConfig.gestures[sequence].action = select.value;
    currentConfig.gestures[sequence].label =
      ACTION_OPTIONS.find(o => o.value === select.value)?.label || select.value;
    await saveConfig();
  });

  // Delete button
  const delBtn = document.createElement('button');
  delBtn.className = 'delete-btn';
  delBtn.title = '削除';
  delBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4h6v2"/>
  </svg>`;
  delBtn.addEventListener('click', async () => {
    delete currentConfig.gestures[sequence];
    await saveConfig();
    row.remove();
  });

  row.appendChild(canvas);
  row.appendChild(seqLabel);
  row.appendChild(select);
  row.appendChild(delBtn);
  return row;
}

// ─── Gesture Diagram ─────────────────────────────────────────────────────────

function drawGestureDiagram(canvas, sequence) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (!sequence || sequence.length === 0) return;

  const dirs = sequence.split('');
  const stepW = w / (dirs.length + 1);
  const midY = h / 2;

  // Draw arrows for each direction
  let x = stepW / 2;
  for (let i = 0; i < dirs.length; i++) {
    const arrow = ARROWS[dirs[i]] || dirs[i];
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#89b4fa';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(arrow, x + stepW * i, midY);
  }
}

// ─── Appearance Controls ─────────────────────────────────────────────────────

function setupAppearanceControls() {
  const colorInput = document.getElementById('trail-color');
  const colorValue = document.getElementById('trail-color-value');
  const opacityInput = document.getElementById('trail-opacity');
  const opacityValue = document.getElementById('trail-opacity-value');
  const widthInput = document.getElementById('trail-width');
  const widthValue = document.getElementById('trail-width-value');
  const minDistInput = document.getElementById('min-distance');
  const minDistValue = document.getElementById('min-distance-value');

  // Set initial values
  colorInput.value = currentConfig.trailColor || '#3b82f6';
  colorValue.textContent = colorInput.value;
  opacityInput.value = currentConfig.trailOpacity ?? 0.75;
  opacityValue.textContent = Math.round(opacityInput.value * 100) + '%';
  widthInput.value = currentConfig.trailWidth ?? 3;
  widthValue.textContent = widthInput.value + 'px';
  minDistInput.value = currentConfig.minDistance ?? 30;
  minDistValue.textContent = minDistInput.value + 'px';

  let saveTimer = null;
  function debouncedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveConfig, 400);
  }

  colorInput.addEventListener('input', () => {
    colorValue.textContent = colorInput.value;
    currentConfig.trailColor = colorInput.value;
    debouncedSave();
  });

  opacityInput.addEventListener('input', () => {
    opacityValue.textContent = Math.round(opacityInput.value * 100) + '%';
    currentConfig.trailOpacity = parseFloat(opacityInput.value);
    debouncedSave();
  });

  widthInput.addEventListener('input', () => {
    widthValue.textContent = widthInput.value + 'px';
    currentConfig.trailWidth = parseInt(widthInput.value, 10);
    debouncedSave();
  });

  minDistInput.addEventListener('input', () => {
    minDistValue.textContent = minDistInput.value + 'px';
    currentConfig.minDistance = parseInt(minDistInput.value, 10);
    debouncedSave();
  });

  const contextMenuKeySelect = document.getElementById('context-menu-key');
  contextMenuKeySelect.value = currentConfig.contextMenuKey ?? 'shiftKey';
  contextMenuKeySelect.addEventListener('change', () => {
    currentConfig.contextMenuKey = contextMenuKeySelect.value;
    debouncedSave();
  });
}

// ─── Custom Gesture Recorder ─────────────────────────────────────────────────

function setupCustomRecorder() {
  const canvas = document.getElementById('recorder-canvas');
  const ctx = canvas.getContext('2d');
  const seqEl = document.getElementById('recorder-sequence');
  const previewEl = document.getElementById('recorder-preview');
  const actionSelect = document.getElementById('recorder-action');
  const addBtn = document.getElementById('add-gesture-btn');
  const clearBtn = document.getElementById('clear-recorder-btn');

  let recording = false;
  let recPoints = [];
  let recDirections = '';
  let recLastDir = '';
  let recDist = 0;

  drawRecorderBackground(ctx, canvas.width, canvas.height);

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    recording = true;
    recPoints = [{ x: e.offsetX, y: e.offsetY }];
    recDirections = '';
    recLastDir = '';
    recDist = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRecorderBackground(ctx, canvas.width, canvas.height);
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!recording) return;
    const last = recPoints[recPoints.length - 1];
    const dx = e.offsetX - last.x;
    const dy = e.offsetY - last.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    recDist += dist;
    recPoints.push({ x: e.offsetX, y: e.offsetY });

    const startPt = recPoints[Math.max(0, recPoints.length - 5)];
    const ddx = e.offsetX - startPt.x;
    const ddy = e.offsetY - startPt.y;
    const dir = quantizeDirection(ddx, ddy);
    if (dir && dir !== recLastDir) {
      recDirections += dir;
      recLastDir = dir;
    }

    // Draw trail on recorder canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRecorderBackground(ctx, canvas.width, canvas.height);

    if (recPoints.length > 1) {
      ctx.beginPath();
      ctx.moveTo(recPoints[0].x, recPoints[0].y);
      for (let i = 1; i < recPoints.length; i++) {
        ctx.lineTo(recPoints[i].x, recPoints[i].y);
      }
      ctx.strokeStyle = '#7c3aed';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(recPoints[0].x, recPoints[0].y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#7c3aed';
      ctx.fill();
    }

    // Update sequence display
    const arrowStr = recDirections.split('').map(d => ARROWS[d] || d).join(' ');
    seqEl.textContent = arrowStr || 'ジェスチャーを描いてください';
  });

  window.addEventListener('mouseup', (e) => {
    if (!recording) return;
    recording = false;

    if (recDirections.length > 0 && recDist > 20) {
      const arrowStr = recDirections.split('').map(d => ARROWS[d] || d).join(' ');
      seqEl.textContent = arrowStr;

      // Check if sequence already exists
      if (currentConfig.gestures[recDirections]) {
        previewEl.textContent = `注意: "${recDirections}" は既に登録されています`;
      } else {
        previewEl.textContent = `シーケンス: ${recDirections}`;
      }

      addBtn.disabled = false;
    } else {
      seqEl.textContent = 'ジェスチャーを描いてください';
      previewEl.textContent = '';
      addBtn.disabled = true;
    }
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  addBtn.addEventListener('click', async () => {
    const action = actionSelect.value;
    if (!action || recDirections.length === 0) return;

    const label = ACTION_OPTIONS.find(o => o.value === action)?.label || action;
    currentConfig.gestures[recDirections] = { action, label };
    await saveConfig();

    // Add row to gesture list
    const list = document.getElementById('gesture-list');
    list.appendChild(createGestureRow(recDirections, action));

    // Reset recorder
    resetRecorder();
  });

  clearBtn.addEventListener('click', resetRecorder);

  function resetRecorder() {
    recording = false;
    recPoints = [];
    recDirections = '';
    recLastDir = '';
    recDist = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRecorderBackground(ctx, canvas.width, canvas.height);
    seqEl.textContent = 'ジェスチャーを描いてください';
    previewEl.textContent = '';
    actionSelect.value = '';
    addBtn.disabled = true;
  }
}

function drawRecorderBackground(ctx, w, h) {
  ctx.fillStyle = '#1e1e2e';
  ctx.fillRect(0, 0, w, h);

  // Grid dots
  ctx.fillStyle = '#313244';
  const spacing = 20;
  for (let x = spacing; x < w; x += spacing) {
    for (let y = spacing; y < h; y += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Center crosshair hint
  ctx.strokeStyle = '#45475a';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(w / 2, 10);
  ctx.lineTo(w / 2, h - 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(10, h / 2);
  ctx.lineTo(w - 10, h / 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ─── Geometry (shared with content.js logic) ────────────────────────────────

function quantizeDirection(dx, dy) {
  const magnitude = Math.sqrt(dx * dx + dy * dy);
  if (magnitude < DIRECTION_THRESHOLD) return null;

  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  if (angle >= -45 && angle < 45)   return 'R';
  if (angle >= 45  && angle < 135)  return 'D';
  if (angle >= 135 || angle < -135) return 'L';
  return 'U';
}

// ─── Blacklist ────────────────────────────────────────────────────────────────

function setupBlacklist() {
  const input = document.getElementById('blacklist-input');
  const addBtn = document.getElementById('blacklist-add-btn');
  const list = document.getElementById('blacklist-list');

  renderBlacklist();

  addBtn.addEventListener('click', async () => {
    const value = input.value.trim();
    if (!value) return;
    if (!currentConfig.blacklist) currentConfig.blacklist = [];
    if (currentConfig.blacklist.includes(value)) {
      showToast('既に登録されています');
      return;
    }
    currentConfig.blacklist.push(value);
    await saveConfig();
    input.value = '';
    renderBlacklist();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addBtn.click();
  });

  function renderBlacklist() {
    list.innerHTML = '';
    const entries = currentConfig.blacklist ?? [];
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'blacklist-empty';
      empty.textContent = '登録されているサイトはありません';
      list.appendChild(empty);
      return;
    }
    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = 'blacklist-row';

      const label = document.createElement('span');
      label.className = 'blacklist-entry';
      label.textContent = entry;

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.title = '削除';
      delBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6M14 11v6"/>
        <path d="M9 6V4h6v2"/>
      </svg>`;
      delBtn.addEventListener('click', async () => {
        currentConfig.blacklist = currentConfig.blacklist.filter(e => e !== entry);
        await saveConfig();
        renderBlacklist();
      });

      row.appendChild(label);
      row.appendChild(delBtn);
      list.appendChild(row);
    }
  }
}

// ─── Reverse List ────────────────────────────────────────────────────────────

function setupReverseList() {
  const input = document.getElementById('reverselist-input');
  const addBtn = document.getElementById('reverselist-add-btn');
  const list = document.getElementById('reverselist-list');

  renderReverseList();

  addBtn.addEventListener('click', async () => {
    const value = input.value.trim();
    if (!value) return;
    if (!currentConfig.reverseList) currentConfig.reverseList = [];
    if (currentConfig.reverseList.includes(value)) {
      showToast('既に登録されています');
      return;
    }
    currentConfig.reverseList.push(value);
    await saveConfig();
    input.value = '';
    renderReverseList();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addBtn.click();
  });

  function renderReverseList() {
    list.innerHTML = '';
    const entries = currentConfig.reverseList ?? [];
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'blacklist-empty';
      empty.textContent = '登録されているサイトはありません';
      list.appendChild(empty);
      return;
    }
    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = 'blacklist-row';

      const label = document.createElement('span');
      label.className = 'blacklist-entry';
      label.textContent = entry;

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.title = '削除';
      delBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6M14 11v6"/>
        <path d="M9 6V4h6v2"/>
      </svg>`;
      delBtn.addEventListener('click', async () => {
        currentConfig.reverseList = currentConfig.reverseList.filter(e => e !== entry);
        await saveConfig();
        renderReverseList();
      });

      row.appendChild(label);
      row.appendChild(delBtn);
      list.appendChild(row);
    }
  }
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
}
