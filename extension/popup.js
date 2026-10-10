const $ = (id) => document.getElementById(id);

let tabCreate = $('tab-create');
let tabJoin = $('tab-join');
let secCreate = $('sec-create');
let secJoin = $('sec-join');

tabCreate.onclick = () => {
  tabCreate.classList.add('active');
  tabJoin.classList.remove('active');
  secCreate.style.display = 'block';
  secJoin.style.display = 'none';
};

tabJoin.onclick = () => {
  tabJoin.classList.add('active');
  tabCreate.classList.remove('active');
  secJoin.style.display = 'block';
  secCreate.style.display = 'none';
};

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

chrome.storage.local.get(['server'], (s) => {
  $('server').value = s.server || 'wss://sensitive-village-sincere.ngrok-free.dev';
});

// Check current status
chrome.runtime.sendMessage({ type: 'status' }, (r) => {
  if (r && r.connected) {
    $('st').textContent = `🟢 In room "${r.room}" (${r.isOwner ? '👑 Host' : '👤 Member'})`;
    $('role-tag').textContent = r.isOwner ? '👑 Host' : '👤 Member';
    $('leave').style.display = 'block';
  }
});

// Create Room
$('btn-create').onclick = async () => {
  const server = $('server').value.trim() || 'ws://localhost:8080';
  let room = $('create-room').value.trim() || 'ROOM-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  chrome.storage.local.set({ server });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.runtime.sendMessage({
    from: 'popup',
    type: 'create',
    server,
    room,
    url: tab.url,
    tabId: tab.id
  }, () => {
    $('st').textContent = `👑 Created room "${room}" as Host.`;
    $('leave').style.display = 'block';
  });
};

// Join Room
$('btn-join').onclick = async () => {
  const server = $('server').value.trim() || 'ws://localhost:8080';
  const room = $('join-room').value.trim();
  if (!room) return ($('st').textContent = '⚠️ Please enter room code.');
  chrome.storage.local.set({ server });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.runtime.sendMessage({
    from: 'popup',
    type: 'join',
    server,
    room,
    url: tab.url,
    tabId: tab.id
  }, () => {
    $('st').textContent = `Connecting to room "${room}"...`;
    $('leave').style.display = 'block';
  });
};

$('leave').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.runtime.sendMessage({ from: 'popup', type: 'leave', tabId: tab.id }, () => {
    $('st').textContent = 'Left room.';
    $('leave').style.display = 'none';
    $('role-tag').textContent = 'Lobby';
  });
};
