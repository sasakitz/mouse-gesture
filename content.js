// Guard against double-initialization
if (window.__mouseGestureLoaded) {
  // already loaded, skip
} else {
  window.__mouseGestureLoaded = true;

  const GestureEngine = (() => {
    // Constants
    const DIRECTION_THRESHOLD = 15;
    const ARROWS = { L: '←', R: '→', U: '↑', D: '↓' };
    const ACTION_LABELS = {
      back:         '戻る',
      forward:      '進む',
      reload:       'リロード',
      closeTab:     'タブを閉じる',
      scrollTop:    '最上部へスクロール',
      scrollBottom: '最下部へスクロール',
      none:         '(未割当)',
    };

    // State
    let config = null;
    let state = 'IDLE'; // IDLE | RECORDING | EXECUTING
    let points = [];
    let directions = '';
    let lastDirection = '';
    let gestureDistance = 0;
    let suppressNextContextMenu = false;
    let canvas = null;
    let ctx = null;
    let animFrameId = null;
    let fadeAlpha = 1.0;
    let isFading = false;

    // Auto-detection state
    const sessionReverseHosts = new Set(); // hosts detected as having custom right-click this session

    // ─── Initialization ───────────────────────────────────────────────────────

    async function init() {
      await loadConfig();

      // Listen for config changes from options page
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.gestureConfig) {
          config = changes.gestureConfig.newValue;
        }
      });

      // Capture phase listeners for maximum control
      document.addEventListener('mousedown', onMouseDown, true);
      document.addEventListener('contextmenu', onContextMenu, true);
      document.addEventListener('contextmenu', onContextMenuBubble, false);
    }

    async function loadConfig() {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
        config = response.config;
      } catch {
        // Service worker may not be ready yet; use fallback
        config = {
          enabled: true,
          minDistance: 30,
          trailColor: '#3b82f6',
          trailOpacity: 0.75,
          trailWidth: 3,
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
    }

    // ─── Event Handlers ───────────────────────────────────────────────────────

    function matchesSiteList(list) {
      if (!list || list.length === 0) return false;
      const hostname = window.location.hostname;
      const href = window.location.href;
      return list.some(entry => {
        entry = entry.trim();
        if (!entry) return false;
        if (hostname === entry || hostname.endsWith('.' + entry)) return true;
        if (href.startsWith(entry)) return true;
        return false;
      });
    }

    function isBlacklisted() {
      return matchesSiteList(config?.blacklist ?? []);
    }

    function isReverseListed() {
      return matchesSiteList(config?.reverseList ?? []);
    }

    function isReverseMode() {
      return isReverseListed() || sessionReverseHosts.has(window.location.hostname);
    }

    function onMouseDown(e) {
      if (e.button !== 2) return;
      if (!config?.enabled) return;
      if (isBlacklisted()) return;

      const menuKey = config?.contextMenuKey ?? 'shiftKey';

      if (isReverseMode()) {
        // Reverse mode: modifier key required to activate gesture
        if (menuKey === 'none' || !e[menuKey]) return; // allow site's context menu
      } else {
        // Normal mode: modifier key skips gesture and shows context menu
        if (menuKey !== 'none' && e[menuKey]) return;
      }

      // Set RECORDING immediately so contextmenu check works on Linux
      state = 'RECORDING';
      points = [{ x: e.clientX, y: e.clientY }];
      directions = '';
      lastDirection = '';
      gestureDistance = 0;
      suppressNextContextMenu = false;

      document.addEventListener('mousemove', onMouseMove, true);
      document.addEventListener('mouseup', onMouseUp, true);
    }

    function onMouseMove(e) {
      if (state !== 'RECORDING') return;

      const last = points[points.length - 1];
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      gestureDistance += dist;
      points.push({ x: e.clientX, y: e.clientY });

      // Quantize direction from the start point periodically
      const startPt = points[Math.max(0, points.length - 5)];
      const ddx = e.clientX - startPt.x;
      const ddy = e.clientY - startPt.y;
      const dir = quantizeDirection(ddx, ddy);
      if (dir && dir !== lastDirection) {
        directions += dir;
        lastDirection = dir;
      }

      if (gestureDistance > (config?.minDistance ?? 30)) {
        if (!canvas) createCanvas();
        drawTrail();
      }
    }

    function onMouseUp(e) {
      if (e.button !== 2) return;

      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('mouseup', onMouseUp, true);

      const minDist = config?.minDistance ?? 30;

      if (state === 'RECORDING' && gestureDistance > minDist && directions.length > 0) {
        // Suppress contextmenu that fires after mouseup on non-Linux platforms
        suppressNextContextMenu = true;
        setTimeout(() => { suppressNextContextMenu = false; }, 600);

        state = 'EXECUTING';
        const gesture = config?.gestures?.[directions];
        if (gesture && gesture.action !== 'none') {
          runGestureAction(gesture.action);
        }
        startFadeOut();
      } else {
        // No gesture made: clean up canvas silently
        removeCanvas();
        state = 'IDLE';
      }
    }

    function onContextMenu(e) {
      if (state === 'RECORDING') {
        // Always suppress contextmenu during gesture recording.
        // On Linux, contextmenu fires on mousedown; letting it through would open the native menu
        // and swallow subsequent mousemove/mouseup events, preventing gesture completion.
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (suppressNextContextMenu || gestureDistance > (config?.minDistance ?? 30)) {
        e.preventDefault();
        e.stopPropagation();
        suppressNextContextMenu = false;
      }
    }

    function onContextMenuBubble(e) {
      // Fires after page handlers. If page called preventDefault (and we didn't), it has custom right-click.
      if (!e.defaultPrevented) return;
      const hostname = window.location.hostname;
      if (!isReverseListed() && !sessionReverseHosts.has(hostname)) {
        sessionReverseHosts.add(hostname);
      }
    }

    // ─── Geometry ─────────────────────────────────────────────────────────────

    function quantizeDirection(dx, dy) {
      const magnitude = Math.sqrt(dx * dx + dy * dy);
      if (magnitude < DIRECTION_THRESHOLD) return null;

      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      // atan2: right=0, down=90, left=±180, up=-90
      if (angle >= -45 && angle < 45)   return 'R';
      if (angle >= 45  && angle < 135)  return 'D';
      if (angle >= 135 || angle < -135) return 'L';
      return 'U';
    }

    // ─── Canvas Overlay ───────────────────────────────────────────────────────

    function createCanvas() {
      canvas = document.createElement('canvas');
      canvas.id = 'mouse-gesture-canvas';
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      document.documentElement.appendChild(canvas);
      ctx = canvas.getContext('2d');
    }

    function drawTrail() {
      if (!ctx || points.length < 2) return;

      if (animFrameId) cancelAnimationFrame(animFrameId);
      animFrameId = requestAnimationFrame(() => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const color = config?.trailColor ?? '#3b82f6';
        const opacity = config?.trailOpacity ?? 0.75;
        const width = config?.trailWidth ?? 3;

        // Draw trail
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = color;
        ctx.shadowBlur = 4;

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();

        // Start dot
        ctx.beginPath();
        ctx.arc(points[0].x, points[0].y, width + 2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.restore();

        // Draw label near current position
        drawLabel();
      });
    }

    function drawLabel() {
      if (!ctx || points.length === 0) return;

      const current = points[points.length - 1];
      const arrowStr = directions.split('').map(d => ARROWS[d] || d).join(' ');
      const gesture = config?.gestures?.[directions];
      const actionLabel = gesture
        ? (ACTION_LABELS[gesture.action] || gesture.label || gesture.action)
        : '';

      const x = current.x + 20;
      const y = current.y + 20;

      ctx.save();
      ctx.font = 'bold 16px -apple-system, "Segoe UI", sans-serif';

      // Background box
      const line1 = arrowStr || '…';
      const line2 = actionLabel;
      const w1 = ctx.measureText(line1).width;
      const w2 = ctx.measureText(line2).width;
      const boxW = Math.max(w1, w2) + 16;
      const boxH = line2 ? 52 : 32;

      // Keep label within viewport
      const bx = Math.min(x, window.innerWidth - boxW - 4);
      const by = Math.min(y, window.innerHeight - boxH - 4);

      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      roundRect(ctx, bx - 4, by - 20, boxW, boxH, 6);
      ctx.fill();

      // Arrow sequence
      ctx.fillStyle = config?.trailColor ?? '#3b82f6';
      ctx.fillText(line1, bx, by);

      // Action name
      if (line2) {
        ctx.font = '13px -apple-system, "Segoe UI", sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(line2, bx, by + 20);
      }

      ctx.restore();
    }

    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }

    function startFadeOut() {
      if (!canvas) {
        state = 'IDLE';
        return;
      }
      isFading = true;
      fadeAlpha = 1.0;
      const duration = 400;
      const start = performance.now();

      function fade(now) {
        const elapsed = now - start;
        fadeAlpha = 1.0 - (elapsed / duration);
        if (fadeAlpha <= 0) {
          removeCanvas();
          state = 'IDLE';
          return;
        }
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.globalAlpha = fadeAlpha;
          // Redraw trail faded
          const color = config?.trailColor ?? '#3b82f6';
          const width = config?.trailWidth ?? 3;
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
          }
          ctx.stroke();
        }
        animFrameId = requestAnimationFrame(fade);
      }
      animFrameId = requestAnimationFrame(fade);
    }

    function removeCanvas() {
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      if (canvas) {
        canvas.remove();
        canvas = null;
        ctx = null;
      }
      isFading = false;
    }

    // ─── Action Execution ─────────────────────────────────────────────────────

    async function runGestureAction(action) {
      switch (action) {
        case 'scrollTop':
          window.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'scrollBottom':
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          break;
        default:
          try {
            await chrome.runtime.sendMessage({ type: 'EXECUTE_ACTION', action });
          } catch (err) {
            console.warn('[MouseGesture] Failed to execute action:', action, err);
          }
      }
    }

    return { init };
  })();

  GestureEngine.init();
}
