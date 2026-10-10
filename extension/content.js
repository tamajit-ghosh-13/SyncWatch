// SyncWatch Content Script with Among Us Style Room Hierarchy (Host / Join) & Strict URL Verification
let active = false;
let suppress = false;
let isHost = false;
let currentRoom = '';
let currentServer = 'wss://sensitive-village-sincere.ngrok-free.dev';
let targetRoomUrl = '';
let clientCount = 1;
const hooked = new WeakSet();

function formatServerUrl(raw) {
  let s = (raw || '').trim();
  if (!s) return 'wss://sensitive-village-sincere.ngrok-free.dev';
  if (s.startsWith('https://')) s = s.replace(/^https:\/\//i, 'wss://');
  else if (s.startsWith('http://')) s = s.replace(/^http:\/\//i, 'ws://');
  else if (!s.startsWith('ws://') && !s.startsWith('wss://')) {
    s = (s.includes('localhost') || s.includes('127.0.0.1')) ? 'ws://' + s : 'wss://' + s;
  }
  return s.replace(/\/+$/, '');
}

// Persistent client ID
let myClientId = sessionStorage.getItem('sw_client_id');
if (!myClientId) {
  myClientId = 'usr_' + Math.random().toString(36).slice(2, 9);
  sessionStorage.setItem('sw_client_id', myClientId);
}

function bestVideo() {
  const videos = [...document.querySelectorAll('video')];
  if (!videos.length) return null;
  return videos.sort((a, b) => (b.videoWidth * b.videoHeight) - (a.videoWidth * a.videoHeight))[0];
}

function send(msg) {
  chrome.runtime.sendMessage({ from: 'content', msg }).catch(() => {});
}

function formatTime(sec) {
  if (isNaN(sec) || sec == null) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------
// Video Hooking & Remote State Application
// ---------------------------------------------------------------------
function hook(v) {
  if (hooked.has(v)) return;
  hooked.add(v);

  const emit = (type) => () => {
    updateWidgetPlaybackUI(v.paused, v.currentTime);
    if (!active || suppress) return;
    send({ type, t: v.currentTime });
  };

  v.addEventListener('play', emit('play'));
  v.addEventListener('pause', emit('pause'));
  v.addEventListener('seeked', emit('seek'));
  v.addEventListener('timeupdate', () => {
    updateWidgetTime(v.currentTime);
  });
}

function applyRemote(msg) {
  const v = bestVideo();
  if (!v) return;

  if (msg.type === 'hello') {
    // If a new peer joins, tell them current state
    send({ type: 'state', t: v.currentTime, paused: v.paused });
    return;
  }

  suppress = true;
  if (Math.abs(v.currentTime - msg.t) > 0.4) {
    v.currentTime = msg.t;
  }

  const shouldPlay = msg.type === 'play' || (msg.type === 'state' && !msg.paused);
  const shouldPause = msg.type === 'pause' || (msg.type === 'state' && msg.paused);

  if (shouldPlay) {
    v.play().catch(() => {
      showToast('⚠️ Click video once to enable autoplay sync');
    });
    const label = msg.source === 'host_sync' ? `👑 Synced to Host @ ${formatTime(msg.t)}` : `▶️ Resumed @ ${formatTime(msg.t)}`;
    showToast(label);
    updateWidgetPlaybackUI(false, msg.t);
  }
  if (shouldPause) {
    v.pause();
    const label = msg.source === 'host_sync' ? `👑 Synced to Host (Paused) @ ${formatTime(msg.t)}` : `⏸️ Paused @ ${formatTime(msg.t)}`;
    showToast(label);
    updateWidgetPlaybackUI(true, msg.t);
  }

  setTimeout(() => {
    suppress = false;
  }, 700);
}

// ---------------------------------------------------------------------
// Spacebar Keyboard Synchronization
// ---------------------------------------------------------------------
function toggleLocalAndRemotePlayback() {
  const v = bestVideo();
  if (!v) {
    showToast('⚠️ No <video> element found on this page');
    return;
  }

  if (v.paused) {
    v.play().then(() => {
      updateWidgetPlaybackUI(false, v.currentTime);
      showToast(`▶️ ${isHost ? '👑 Host' : '👤 You'} Resumed (Synced to Room)`);
      if (active && !suppress) {
        send({ type: 'play', t: v.currentTime });
      }
    }).catch(() => {
      showToast('⚠️ Click video once to grant browser playback permission');
    });
  } else {
    v.pause();
    updateWidgetPlaybackUI(true, v.currentTime);
    showToast(`⏸️ ${isHost ? '👑 Host' : '👤 You'} Paused (Synced to Room)`);
    if (active && !suppress) {
      send({ type: 'pause', t: v.currentTime });
    }
  }
}

function isInputActive() {
  const activeEl = document.activeElement;
  if (activeEl) {
    const tag = activeEl.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || activeEl.isContentEditable) {
      return true;
    }
  }
  if (widgetShadow && widgetShadow.activeElement) {
    const sTag = widgetShadow.activeElement.tagName.toLowerCase();
    if (sTag === 'input' || sTag === 'textarea' || sTag === 'select') return true;
  }
  return false;
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.key === ' ') {
    if (isInputActive()) return; // Don't interrupt typing in search, comments, or inputs

    const v = bestVideo();
    if (!v) return;

    e.preventDefault();
    e.stopPropagation();
    toggleLocalAndRemotePlayback();
  }
}, true);

// ---------------------------------------------------------------------
// In-Page Floating Extension Popup (Shadow DOM)
// ---------------------------------------------------------------------
let widgetHost = null;
let widgetShadow = null;
let toastTimeout = null;

function showToast(text) {
  if (!widgetShadow) return;
  const toast = widgetShadow.querySelector('#sw-toast');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2600);
}

function updateWidgetPlaybackUI(paused, time) {
  if (!widgetShadow) return;
  const statePill = widgetShadow.querySelector('#sw-state-pill');
  const toggleBtn = widgetShadow.querySelector('#sw-playpause-btn');
  const timeEl = widgetShadow.querySelector('#sw-time-display');

  if (timeEl && time != null) timeEl.textContent = formatTime(time);
  if (statePill) {
    statePill.textContent = paused ? '⏸️ PAUSED' : '▶️ PLAYING';
    statePill.className = 'status-badge ' + (paused ? 'badge-paused' : 'badge-playing');
  }
  if (toggleBtn) {
    toggleBtn.innerHTML = paused ? '▶️ Resume Video <span class="key-badge">Space</span>' : '⏸️ Pause Video <span class="key-badge">Space</span>';
    toggleBtn.className = 'action-btn ' + (paused ? 'btn-play' : 'btn-pause');
  }
}

function updateWidgetTime(time) {
  if (!widgetShadow) return;
  const timeEl = widgetShadow.querySelector('#sw-time-display');
  if (timeEl && time != null) timeEl.textContent = formatTime(time);
}

function setConnectedView(connected, room, isOwnerRole, count) {
  active = connected;
  if (room) currentRoom = room;
  if (isOwnerRole != null) isHost = isOwnerRole;
  if (count != null) clientCount = count;

  if (!widgetShadow) return;

  const dot = widgetShadow.querySelector('#sw-status-dot');
  const roomLabel = widgetShadow.querySelector('#sw-room-label');
  const activeBox = widgetShadow.querySelector('#sw-active-room-box');
  const formBox = widgetShadow.querySelector('#sw-lobby-form');
  const roleBadge = widgetShadow.querySelector('#sw-role-badge');
  const activeRoomCode = widgetShadow.querySelector('#sw-active-room-code');
  const memberCountEl = widgetShadow.querySelector('#sw-member-count');
  const urlMismatchCard = widgetShadow.querySelector('#sw-url-mismatch-card');

  if (urlMismatchCard) urlMismatchCard.style.display = 'none';

  if (connected) {
    dot.className = 'status-dot dot-online';
    roomLabel.textContent = `${isHost ? '👑' : '👤'} ${currentRoom}`;
    if (activeBox) activeBox.style.display = 'block';
    if (formBox) formBox.style.display = 'none';
    if (roleBadge) {
      roleBadge.textContent = isHost ? '👑 HOST (OWNER)' : '👤 CREW MEMBER';
      roleBadge.className = 'role-badge ' + (isHost ? 'role-host' : 'role-member');
    }
    if (activeRoomCode) activeRoomCode.textContent = currentRoom;
    if (memberCountEl) memberCountEl.textContent = `👥 ${clientCount} participant${clientCount > 1 ? 's' : ''}`;
  } else {
    dot.className = 'status-dot dot-offline';
    roomLabel.textContent = 'Lobby · Click to Join';
    if (activeBox) activeBox.style.display = 'none';
    if (formBox) formBox.style.display = 'block';
  }
}

function showUrlMismatchError(targetUrl, yourUrl) {
  if (!widgetShadow) return;
  const card = widgetShadow.querySelector('#sw-url-mismatch-card');
  const targetLink = widgetShadow.querySelector('#sw-target-url-link');
  const yourUrlEl = widgetShadow.querySelector('#sw-your-url-text');
  const openBtn = widgetShadow.querySelector('#sw-open-target-btn');

  targetRoomUrl = targetUrl;
  if (targetLink) {
    targetLink.textContent = targetUrl;
    targetLink.href = targetUrl;
  }
  if (yourUrlEl) yourUrlEl.textContent = yourUrl;
  if (openBtn) {
    openBtn.onclick = () => {
      window.location.href = targetUrl;
    };
  }
  if (card) {
    card.style.display = 'block';
  }
  showToast('❌ URL Mismatch with Host');
}

function toggleWidgetPopup(force) {
  if (!widgetShadow) return;
  const panel = widgetShadow.querySelector('#sw-panel');
  if (!panel) return;
  if (typeof force === 'boolean') {
    panel.classList.toggle('open', force);
  } else {
    panel.classList.toggle('open');
  }
}

function createFloatingWidget() {
  if (widgetHost || window !== window.top) return;

  widgetHost = document.createElement('div');
  widgetHost.id = 'syncwatch-root';
  widgetShadow = widgetHost.attachShadow({ mode: 'open' });

  widgetShadow.innerHTML = `
    <style>
      :host {
        all: initial;
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #f4f4f5;
        font-size: 13px;
        line-height: 1.4;
        box-sizing: border-box;
      }
      *, *::before, *::after {
        box-sizing: border-box;
      }

      /* Floating Trigger Pill */
      .trigger-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: rgba(18, 18, 22, 0.95);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #fff;
        padding: 8px 14px;
        border-radius: 999px;
        cursor: grab;
        user-select: none;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.45);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .trigger-pill:hover {
        transform: translateY(-2px);
        box-shadow: 0 14px 30px rgba(0, 0, 0, 0.6);
        border-color: rgba(255, 255, 255, 0.3);
      }
      .trigger-pill:active {
        cursor: grabbing;
      }

      .logo-title {
        font-weight: 700;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
      }
      .dot-offline { background: #71717a; }
      .dot-online {
        background: #22c55e;
        box-shadow: 0 0 8px #22c55e;
      }

      .status-badge {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 999px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .badge-playing {
        background: rgba(34, 197, 94, 0.2);
        color: #4ade80;
        border: 1px solid rgba(34, 197, 94, 0.4);
      }
      .badge-paused {
        background: rgba(239, 68, 68, 0.2);
        color: #f87171;
        border: 1px solid rgba(239, 68, 68, 0.4);
      }

      /* Toast Notification */
      .toast {
        position: absolute;
        bottom: 54px;
        right: 0;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid #38bdf8;
        color: #f0f9ff;
        padding: 6px 12px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transform: translateY(6px);
        transition: opacity 0.2s, transform 0.2s;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
      }
      .toast.show {
        opacity: 1;
        transform: translateY(0);
      }

      /* Expanded Popup Card */
      .panel {
        display: none;
        position: absolute;
        bottom: 52px;
        right: 0;
        width: 330px;
        background: #141418;
        border: 1px solid #2e2e38;
        border-radius: 14px;
        padding: 16px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.75);
        user-select: none;
      }
      .panel.open {
        display: block;
        animation: fadeIn 0.15s ease-out;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: scale(0.96) translateY(8px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid #27272a;
      }
      .panel-title {
        font-size: 14px;
        font-weight: 700;
        color: #fff;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .close-btn {
        background: transparent;
        border: none;
        color: #a1a1aa;
        font-size: 16px;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
      }
      .close-btn:hover {
        color: #fff;
        background: #27272a;
      }

      /* Among Us Mode Tabs */
      .mode-tabs {
        display: flex;
        gap: 6px;
        margin-bottom: 12px;
        background: #1c1c24;
        padding: 3px;
        border-radius: 8px;
      }
      .tab-btn {
        flex: 1;
        padding: 7px;
        border: none;
        background: transparent;
        color: #a1a1aa;
        font-size: 12px;
        font-weight: 700;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .tab-btn.active {
        background: #272733;
        color: #fff;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      }

      .form-group {
        margin-bottom: 10px;
      }
      .form-group label {
        display: block;
        font-size: 11px;
        color: #a1a1aa;
        margin-bottom: 4px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .input-text {
        width: 100%;
        padding: 8px 10px;
        background: #1c1c22;
        border: 1px solid #3f3f46;
        border-radius: 6px;
        color: #fff;
        font-size: 13px;
        outline: none;
      }
      .input-text:focus {
        border-color: #e50914;
      }

      .btn-primary {
        width: 100%;
        padding: 10px;
        border-radius: 6px;
        border: none;
        font-weight: 700;
        font-size: 13px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: filter 0.15s;
      }
      .btn-create {
        background: #e50914;
        color: #fff;
      }
      .btn-join-room {
        background: #2563eb;
        color: #fff;
      }
      .btn-leave-room {
        background: #3f3f46;
        color: #e4e4e7;
        margin-top: 10px;
      }

      /* Active Room Status Box */
      .active-room-box {
        display: none;
        background: #181820;
        border: 1px solid #2e2e38;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 12px;
      }
      .active-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }
      .role-badge {
        font-size: 10px;
        font-weight: 800;
        padding: 3px 8px;
        border-radius: 4px;
        text-transform: uppercase;
      }
      .role-host {
        background: #eab308;
        color: #422006;
      }
      .role-member {
        background: #3b82f6;
        color: #1e3a8a;
      }
      .code-display {
        font-family: monospace;
        font-size: 16px;
        font-weight: 700;
        color: #facc15;
        letter-spacing: 1px;
      }

      /* URL Mismatch Alert Card */
      .mismatch-card {
        display: none;
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid #ef4444;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 12px;
        font-size: 11px;
        color: #fecaca;
      }
      .mismatch-title {
        font-weight: 700;
        color: #f87171;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
      }
      .url-box {
        background: rgba(0, 0, 0, 0.3);
        padding: 6px;
        border-radius: 4px;
        word-break: break-all;
        margin: 4px 0;
        font-family: monospace;
      }
      .open-btn {
        width: 100%;
        margin-top: 6px;
        padding: 6px;
        background: #ef4444;
        border: none;
        border-radius: 4px;
        color: #fff;
        font-weight: 700;
        cursor: pointer;
      }

      /* Sync & Playback Card */
      .sync-box {
        background: #1a1a20;
        border: 1px solid #27272a;
        border-radius: 8px;
        padding: 12px;
      }
      .action-btn {
        width: 100%;
        padding: 10px;
        border-radius: 6px;
        border: none;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      .btn-play {
        background: #22c55e;
        color: #052e16;
      }
      .btn-pause {
        background: #e50914;
        color: #fff;
      }
      .key-badge {
        background: rgba(0, 0, 0, 0.25);
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-family: monospace;
        text-transform: uppercase;
      }
      .shortcut-hint {
        margin-top: 8px;
        font-size: 11px;
        color: #71717a;
        text-align: center;
      }
      .time-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 8px;
        font-size: 12px;
        color: #d4d4d8;
        font-family: monospace;
      }
    </style>

    <div class="toast" id="sw-toast">SyncWatch ready</div>

    <!-- Collapsible Popup Panel -->
    <div class="panel" id="sw-panel">
      <div class="panel-header">
        <div class="panel-title">🎬 SyncWatch</div>
        <button class="close-btn" id="sw-close-btn" title="Minimize">—</button>
      </div>

      <!-- URL Mismatch Warning (Shows if member joined from wrong URL) -->
      <div class="mismatch-card" id="sw-url-mismatch-card">
        <div class="mismatch-title">⚠️ URL MISMATCH WITH HOST</div>
        <div>Host is watching on:</div>
        <div class="url-box" id="sw-target-url-link"></div>
        <div>You are on:</div>
        <div class="url-box" id="sw-your-url-text"></div>
        <button class="open-btn" id="sw-open-target-btn">Open Host's Video URL</button>
      </div>

      <!-- Active Room Box (Shown when connected) -->
      <div class="active-room-box" id="sw-active-room-box">
        <div class="active-header">
          <span class="role-badge" id="sw-role-badge">👑 HOST</span>
          <span id="sw-member-count" style="font-size: 11px; color: #a1a1aa;">👥 1 Member</span>
        </div>
        <div style="font-size: 11px; color: #a1a1aa; margin-bottom: 2px;">ROOM CODE:</div>
        <div class="code-display" id="sw-active-room-code">PARTY</div>
        <button class="btn-primary btn-leave-room" id="sw-leave-btn">Leave Room</button>
      </div>

      <!-- Lobby Form (Shown when disconnected) -->
      <div id="sw-lobby-form">
        <div class="mode-tabs">
          <button class="tab-btn active" id="sw-tab-create">👑 Create Room</button>
          <button class="tab-btn" id="sw-tab-join">🚀 Join Room</button>
        </div>

        <div class="form-group">
          <label>Server</label>
          <input type="text" class="input-text" id="sw-server-input" value="wss://sensitive-village-sincere.ngrok-free.dev">
        </div>

        <!-- Create Section -->
        <div id="sw-create-section">
          <div class="form-group">
            <label>Custom Room Code (Optional)</label>
            <input type="text" class="input-text" id="sw-create-room-input" placeholder="e.g. PARTY">
          </div>
          <button class="btn-primary btn-create" id="sw-create-btn">
            👑 Create Room (Become Host)
          </button>
          <div style="font-size: 11px; color: #71717a; margin-top: 6px; text-align: center;">
            Members who join will snap directly to your current timestamp and URL.
          </div>
        </div>

        <!-- Join Section -->
        <div id="sw-join-section" style="display: none;">
          <div class="form-group">
            <label>Room Code to Join</label>
            <input type="text" class="input-text" id="sw-join-room-input" placeholder="e.g. PARTY">
          </div>
          <button class="btn-primary btn-join-room" id="sw-join-btn">
            🚀 Join Room (Sync to Host)
          </button>
          <div style="font-size: 11px; color: #71717a; margin-top: 6px; text-align: center;">
            You must be on the exact same video URL as the host.
          </div>
        </div>
      </div>

      <!-- Live Video Controls & Spacebar HUD -->
      <div class="sync-box" style="margin-top: 12px;">
        <button class="action-btn btn-pause" id="sw-playpause-btn">
          ⏸️ Pause Video <span class="key-badge">Space</span>
        </button>

        <div class="time-row">
          <span>Video Time:</span>
          <span id="sw-time-display">00:00</span>
        </div>

        <div class="shortcut-hint">
          ⌨️ <b>Spacebar synced:</b> Press Space on your keyboard to toggle playback across everyone's screen.
        </div>
      </div>
    </div>

    <!-- Draggable Floating Pill -->
    <div class="trigger-pill" id="sw-pill" title="Click to Open SyncWatch Controls">
      <span class="status-dot dot-offline" id="sw-status-dot"></span>
      <span class="logo-title">🎬 SyncWatch</span>
      <span class="status-badge badge-paused" id="sw-state-pill">⏸️ PAUSED</span>
      <span id="sw-room-label" style="font-size: 11px; opacity: 0.85;">Lobby · Click to Join</span>
    </div>
  `;

  document.body.appendChild(widgetHost);

  // Tab switching (Create vs Join)
  const tabCreate = widgetShadow.querySelector('#sw-tab-create');
  const tabJoin = widgetShadow.querySelector('#sw-tab-join');
  const createSec = widgetShadow.querySelector('#sw-create-section');
  const joinSec = widgetShadow.querySelector('#sw-join-section');

  tabCreate.addEventListener('click', () => {
    tabCreate.classList.add('active');
    tabJoin.classList.remove('active');
    createSec.style.display = 'block';
    joinSec.style.display = 'none';
  });

  tabJoin.addEventListener('click', () => {
    tabJoin.classList.add('active');
    tabCreate.classList.remove('active');
    joinSec.style.display = 'block';
    createSec.style.display = 'none';
  });

  // Query background for existing active room connection
  chrome.runtime.sendMessage({ type: 'query' }, (r) => {
    if (r && r.connected) {
      setConnectedView(true, r.room, r.isOwner);
    }
  });

  // Pill click & drag handling
  const pill = widgetShadow.querySelector('#sw-pill');
  let hasMoved = false;
  let startX = 0, startY = 0;
  let initLeft = 0, initTop = 0;

  pill.addEventListener('pointerdown', (e) => {
    hasMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = widgetHost.getBoundingClientRect();
    initLeft = rect.left;
    initTop = rect.top;

    const onPointerMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.hypot(dx, dy) > 8) {
        hasMoved = true;
        widgetHost.style.right = 'auto';
        widgetHost.style.bottom = 'auto';
        widgetHost.style.left = `${Math.max(10, Math.min(window.innerWidth - 180, initLeft + dx))}px`;
        widgetHost.style.top = `${Math.max(10, Math.min(window.innerHeight - 50, initTop + dy))}px`;
      }
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  });

  pill.addEventListener('click', () => {
    if (!hasMoved) {
      toggleWidgetPopup();
    }
  });

  widgetShadow.querySelector('#sw-close-btn').addEventListener('click', () => {
    toggleWidgetPopup(false);
  });

  // 1. CREATE ROOM BUTTON (Host)
  widgetShadow.querySelector('#sw-create-btn').addEventListener('click', () => {
    const serverVal = formatServerUrl(widgetShadow.querySelector('#sw-server-input').value);
    let roomVal = widgetShadow.querySelector('#sw-create-room-input').value.trim();
    if (!roomVal) {
      roomVal = 'ROOM-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    }

    const v = bestVideo();
    const currentTime = v ? v.currentTime : 0;
    const isPaused = v ? v.paused : true;

    chrome.runtime.sendMessage({
      type: 'create',
      server: serverVal,
      room: roomVal,
      url: window.location.href,
      t: currentTime,
      paused: isPaused,
      clientId: myClientId
    }, () => {
      setConnectedView(true, roomVal, true, 1);
      showToast(`👑 Created room "${roomVal}" as Host @ ${formatTime(currentTime)}`);
    });
  });

  // 2. JOIN ROOM BUTTON (Member)
  widgetShadow.querySelector('#sw-join-btn').addEventListener('click', () => {
    const serverVal = formatServerUrl(widgetShadow.querySelector('#sw-server-input').value);
    const roomVal = widgetShadow.querySelector('#sw-join-room-input').value.trim();

    if (!roomVal) {
      showToast('⚠️ Please enter a room code');
      return;
    }

    chrome.runtime.sendMessage({
      type: 'join',
      server: serverVal,
      room: roomVal,
      url: window.location.href,
      clientId: myClientId
    }, () => {
      showToast(`Connecting to "${roomVal}"...`);
    });
  });

  // 3. LEAVE ROOM BUTTON
  widgetShadow.querySelector('#sw-leave-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'leave' }, () => {
      setConnectedView(false);
      showToast('👋 Left room');
    });
  });

  // 4. Play/Pause Action Button inside Popup
  widgetShadow.querySelector('#sw-playpause-btn').addEventListener('click', () => {
    toggleLocalAndRemotePlayback();
  });
}

// ---------------------------------------------------------------------
// Message Listener from Background Script
// ---------------------------------------------------------------------
chrome.runtime.onMessage.addListener((m) => {
  if (m.type === 'created') {
    setConnectedView(true, m.room, true, m.clientCount || 1);
    showToast(`👑 You are Host of room "${m.room}"`);
  }

  if (m.type === 'active') {
    setConnectedView(m.on, m.room, m.isOwner);
  }

  if (m.type === 'join_error') {
    setConnectedView(false);
    if (m.code === 'URL_MISMATCH') {
      showUrlMismatchError(m.targetUrl, m.yourUrl);
    } else {
      showToast(`❌ ${m.message || 'Error joining room'}`);
    }
  }

  if (m.type === 'peer_joined') {
    clientCount = m.clientCount || clientCount + 1;
    setConnectedView(active, currentRoom, isHost, clientCount);
    showToast(`👥 A new member joined (Total: ${clientCount})`);
  }

  if (m.type === 'peer_left') {
    clientCount = m.clientCount || Math.max(1, clientCount - 1);
    setConnectedView(active, currentRoom, isHost, clientCount);
    showToast(`👋 A member left (Total: ${clientCount})`);
  }

  if (m.type === 'remote' && active) {
    applyRemote(m.msg);
  }
});

// Periodic Video Hooking & Initial Setup
setInterval(() => {
  const v = bestVideo();
  if (v) {
    hook(v);
    updateWidgetPlaybackUI(v.paused, v.currentTime);
  }
}, 1200);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createFloatingWidget);
} else {
  createFloatingWidget();
}
