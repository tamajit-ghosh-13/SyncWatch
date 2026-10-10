// Holds WebSockets per tab and relays between the server and tabs.
const connections = new Map(); // tabId -> { ws, room, server, isOwner, pingTimer }

function disconnectTab(tabId) {
  const conn = connections.get(tabId);
  if (!conn) return;
  clearInterval(conn.pingTimer);
  if (conn.ws) {
    conn.ws.onclose = null;
    conn.ws.onerror = null;
    conn.ws.close();
  }
  connections.delete(tabId);
  chrome.tabs.sendMessage(tabId, { type: 'active', on: false, room: '', server: '', isOwner: false }).catch(() => {});
}

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

function connectTab(action, payload, tabId) {
  disconnectTab(tabId);

  const server = formatServerUrl(payload.server);
  let ws;
  try {
    ws = new WebSocket(server);
  } catch (err) {
    chrome.tabs.sendMessage(tabId, { type: 'connect_error', error: err.message }).catch(() => {});
    return;
  }

  const conn = { ws, room: payload.room || '', server, isOwner: action === 'create', pingTimer: null };
  connections.set(tabId, conn);

  ws.onopen = () => {
    // Send either 'create' or 'join' with initial state and URL
    ws.send(JSON.stringify({
      type: action,
      room: payload.room,
      url: payload.url,
      t: payload.t,
      paused: payload.paused,
      clientId: payload.clientId
    }));

    conn.pingTimer = setInterval(() => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' }));
    }, 20000);
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'created') {
        conn.room = msg.room;
        conn.isOwner = true;
        chrome.tabs.sendMessage(tabId, { type: 'created', ...msg }).catch(() => {});
        chrome.tabs.sendMessage(tabId, { type: 'active', on: true, room: msg.room, server, isOwner: true }).catch(() => {});
      } else if (msg.type === 'join_error') {
        disconnectTab(tabId);
        chrome.tabs.sendMessage(tabId, { type: 'join_error', ...msg }).catch(() => {});
      } else if (msg.type === 'state') {
        conn.room = msg.room || conn.room;
        conn.isOwner = !!msg.isOwner;
        chrome.tabs.sendMessage(tabId, { type: 'active', on: true, room: conn.room, server, isOwner: conn.isOwner }).catch(() => {});
        chrome.tabs.sendMessage(tabId, { type: 'remote', msg }).catch(() => {});
      } else if (msg.type === 'peer_joined' || msg.type === 'peer_left') {
        chrome.tabs.sendMessage(tabId, { type: msg.type, ...msg }).catch(() => {});
      } else {
        chrome.tabs.sendMessage(tabId, { type: 'remote', msg }).catch(() => {});
      }
    } catch {}
  };

  ws.onerror = () => {
    disconnectTab(tabId);
  };

  ws.onclose = () => {
    disconnectTab(tabId);
  };
}

// Clean up when a tab is closed in the browser
chrome.tabs.onRemoved.addListener((tabId) => {
  disconnectTab(tabId);
});

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  const tabId = (sender.tab && sender.tab.id != null) ? sender.tab.id : m.tabId;
  if (tabId == null) {
    if (reply) reply({ connected: false });
    return true;
  }

  if (m.type === 'create') {
    connectTab('create', m, tabId);
    if (reply) reply({ success: true });
    return true;
  }

  if (m.type === 'join') {
    connectTab('join', m, tabId);
    if (reply) reply({ success: true });
    return true;
  }

  if (m.type === 'leave') {
    disconnectTab(tabId);
    if (reply) reply({ success: true, connected: false });
    return true;
  }

  if (m.type === 'query' || m.type === 'status') {
    const conn = connections.get(tabId);
    const isConn = !!(conn && conn.ws && conn.ws.readyState === 1);
    if (reply) reply({
      connected: isConn,
      active: isConn,
      room: conn ? conn.room : '',
      server: conn ? conn.server : '',
      isOwner: conn ? conn.isOwner : false
    });
    return true;
  }

  if (m.from === 'content') {
    const conn = connections.get(tabId);
    if (conn && conn.ws && conn.ws.readyState === 1) {
      conn.ws.send(JSON.stringify(m.msg));
    }
  }

  return true;
});
