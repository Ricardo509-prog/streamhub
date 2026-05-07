// ============================================
// STREAMHUB v3 — Frontend App Logic
// All 6 platforms + OBS + AI
// ============================================

const BACKEND = 'http://localhost:3001';
const socket = io(BACKEND);

// ---- State ----
let messageCount = 0;
let donationCount = 0;
let streamStartTime = null;
let uptimeInterval = null;
let currentFilter = 'all';
let allMessages = [];
let obsCurrentScene = null;
let lastAITargetMessage = null;

// ---- Socket Events ----

socket.on('connect', () => {
  console.log('[StreamHub v3] Connected');
  loadAutomationRules();
  checkAIStatus();
  loadAnalytics();
  loadDeck();
});

socket.on('platform:authenticated', ({ platform }) => {
  setStatus(platform, 'Authenticated ✓');
  const btn = document.getElementById(`btn-${pid(platform)}-connect`);
  if (btn) btn.disabled = false;
});

socket.on('platform:connected', ({ platform, streamTitle, viewers }) => {
  soundConnect();
  setStatus(platform, `LIVE: ${streamTitle || platform}`);
  document.getElementById(`card-${platform}`)?.classList.add(`active-${platform}`);
  togglePlatformBtns(platform, true);
  updateLiveIndicator(true);
  if (!streamStartTime) startUptime();
  if (viewers) document.getElementById('stat-viewers').textContent = viewers.toLocaleString();
  addLog(`Connected: ${platform} — ${streamTitle || ''}`, 'success');
});

socket.on('platform:disconnected', ({ platform }) => {
  setStatus(platform, 'Disconnected');
  document.getElementById(`card-${platform}`)?.classList.remove(`active-${platform}`);
  togglePlatformBtns(platform, false);
  addLog(`Disconnected: ${platform}`, 'warn');
});

socket.on('chat:messages', ({ platform, messages }) => {
  messages.forEach(msg => {
    allMessages.push(msg);
    if (currentFilter === 'all' || currentFilter === platform) {
      addChatMessage(msg);
    }
  });
  messageCount += messages.length;
  document.getElementById('stat-messages').textContent = messageCount;
});

socket.on('donations:new', ({ platform, donations }) => {
  soundDonation();
  donations.forEach(d => addDonation(platform, d));
  donationCount += donations.length;
  document.getElementById('stat-donations').textContent = donationCount;
  document.getElementById('totalDonations').textContent = donationCount;
});

socket.on('stats:update', ({ viewers }) => {
  if (viewers !== undefined) document.getElementById('stat-viewers').textContent = viewers.toLocaleString();
});

socket.on('moderation:action', ({ platform, author, message, rule }) => {
  addLog(`[MOD] Flagged: ${author} on ${platform} — ${rule}`, 'warn');
});

socket.on('automation:log', ({ message, type }) => {
  addLog(message, type);
});

socket.on('alert:show', ({ platform, type, data, duration }) => showAlert(platform, type, data, duration));
socket.on('alert:new', ({ platform, type, author, message }) => addLog(`[${platform.toUpperCase()}] ${message}`, 'success'));

// ---- OBS Events ----
socket.on('obs:connected', (data) => {
  updateOBSUI(data);
  document.getElementById('obsLabel').textContent = 'OBS Connected';
  document.getElementById('obsIndicator').classList.add('connected');
  document.getElementById('btnObsConnect').classList.add('hidden');
  document.getElementById('btnObsDisconnect').classList.remove('hidden');
  addLog('OBS WebSocket connected', 'success');
});

socket.on('obs:disconnected', () => {
  document.getElementById('obsLabel').textContent = 'OBS Disconnected';
  document.getElementById('obsIndicator').classList.remove('connected');
  document.getElementById('btnObsConnect').classList.remove('hidden');
  document.getElementById('btnObsDisconnect').classList.add('hidden');
  addLog('OBS disconnected', 'warn');
});

socket.on('obs:scene-changed', ({ scene }) => {
  obsCurrentScene = scene;
  document.querySelectorAll('.scene-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.scene === scene);
  });
  loadSceneSources(scene);
  addLog(`OBS Scene: ${scene}`, 'success');
});

socket.on('obs:stream-state', ({ streaming }) => {
  const badge = document.getElementById('obsStreamBadge');
  badge.textContent = streaming ? '⬤ LIVE' : '⬤ OFF AIR';
  badge.className = `stream-badge ${streaming ? 'live' : ''}`;
});

socket.on('obs:record-state', ({ recording }) => {
  const badge = document.getElementById('obsRecBadge');
  badge.textContent = recording ? '⏺ REC' : '⏺ NOT REC';
  badge.className = `rec-badge ${recording ? 'recording' : ''}`;
  document.getElementById('btnStartRec').classList.toggle('hidden', recording);
  document.getElementById('btnStopRec').classList.toggle('hidden', !recording);
});

socket.on('obs:mute-changed', ({ source, muted }) => {
  const btn = document.querySelector(`[data-source="${source}"]`);
  if (btn) {
    btn.textContent = muted ? '🔇' : '🔊';
    btn.classList.toggle('muted', muted);
  }
});

// ---- AI Events ----
socket.on('ai:response', ({ platform, message, replyTo }) => {
  addAIMessage(`Reply to ${replyTo} on ${platform}`, message);
});

socket.on('ai:auto-message', ({ platform, message }) => {
  addAIMessage(`Auto-message for ${platform}`, message);
});

// ---- Platform Auth ----

function authPlatform(platform) {
  const url = `${BACKEND}/auth/${platform}`;
  window.electronAPI?.openExternal(url) || window.open(url, '_blank');
}

async function connectPlatform(platform) {
  const btn = document.getElementById(`btn-${pid(platform)}-connect`);
  if (btn) { btn.textContent = '...'; btn.disabled = true; }

  try {
    const res = await fetch(`${BACKEND}/api/platform/${platform}/connect`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) {
      alert(`${platform}: ${data.error}`);
      if (btn) { btn.textContent = 'Connect'; btn.disabled = false; }
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
    if (btn) { btn.textContent = 'Connect'; btn.disabled = false; }
  }
}

async function disconnectPlatform(platform) {
  await fetch(`${BACKEND}/api/platform/${platform}/disconnect`, { method: 'POST' });
}

// ---- OBS Controls ----

async function connectOBS() {
  document.getElementById('btnObsConnect').textContent = 'Connecting...';
  try {
    const res = await fetch(`${BACKEND}/api/obs/connect`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) alert('OBS Error: ' + data.error);
  } catch (err) {
    alert('OBS connection failed: ' + err.message);
    document.getElementById('btnObsConnect').textContent = 'Connect to OBS';
  }
}

async function disconnectOBS() {
  await fetch(`${BACKEND}/api/obs/disconnect`, { method: 'POST' });
}

async function switchScene(sceneName) {
  await fetch(`${BACKEND}/api/obs/scene`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sceneName })
  });
}

async function toggleMute(sourceName) {
  await fetch(`${BACKEND}/api/obs/mute/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceName })
  });
}

async function toggleSourceVisible(sceneName, sourceName, visible, btn) {
  await fetch(`${BACKEND}/api/obs/source/visible`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sceneName, sourceName, visible: !visible })
  });
  btn.classList.toggle('hidden-source', visible);
  btn.dataset.visible = !visible;
}

async function startRecording() {
  await fetch(`${BACKEND}/api/obs/record/start`, { method: 'POST' });
}

async function stopRecording() {
  await fetch(`${BACKEND}/api/obs/record/stop`, { method: 'POST' });
}

function updateOBSUI(data) {
  const grid = document.getElementById('scenesGrid');
  grid.innerHTML = '';
  (data.scenes || []).forEach(scene => {
    const btn = document.createElement('button');
    btn.className = `scene-btn ${scene === data.currentScene ? 'active' : ''}`;
    btn.dataset.scene = scene;
    btn.textContent = scene;
    btn.onclick = () => switchScene(scene);
    grid.appendChild(btn);
  });

  obsCurrentScene = data.currentScene;

  const streamBadge = document.getElementById('obsStreamBadge');
  streamBadge.textContent = data.streaming ? '⬤ LIVE' : '⬤ OFF AIR';
  streamBadge.className = `stream-badge ${data.streaming ? 'live' : ''}`;

  const recBadge = document.getElementById('obsRecBadge');
  recBadge.textContent = data.recording ? '⏺ REC' : '⏺ NOT REC';
  recBadge.className = `rec-badge ${data.recording ? 'recording' : ''}`;

  document.getElementById('btnStartRec').classList.toggle('hidden', data.recording);
  document.getElementById('btnStopRec').classList.toggle('hidden', !data.recording);

  if (data.currentScene) loadSceneSources(data.currentScene);
}

async function loadSceneSources(sceneName) {
  try {
    const res = await fetch(`${BACKEND}/api/obs/sources/${encodeURIComponent(sceneName)}`);
    const sources = await res.json();

    const list = document.getElementById('sourcesList');
    list.innerHTML = '';

    sources.forEach(source => {
      const el = document.createElement('div');
      el.className = 'source-row';
      el.innerHTML = `
        <span class="source-name">${escHtml(source.name)}</span>
        <button class="btn-source-toggle ${source.visible ? '' : 'hidden-source'}"
          data-visible="${source.visible}"
          onclick="toggleSourceVisible('${escHtml(sceneName)}', '${escHtml(source.name)}', ${source.visible}, this)">
          ${source.visible ? '👁' : '👁‍🗨'}
        </button>
      `;
      list.appendChild(el);
    });

    renderAudioSources(sources);
  } catch (err) {
    console.error('[OBS] Could not load sources:', err.message);
  }
}

function renderAudioSources(sources) {
  const audioKinds = ['audio', 'mic', 'capture', 'input', 'output'];
  const audioSources = sources.filter(s =>
    audioKinds.some(k => (s.kind || '').toLowerCase().includes(k))
  );

  const list = document.getElementById('audioList');
  list.innerHTML = '';

  if (audioSources.length === 0) {
    list.innerHTML = '<div class="obs-empty">No audio sources found</div>';
    return;
  }

  audioSources.forEach(source => {
    const el = document.createElement('div');
    el.className = 'audio-row';
    el.innerHTML = `
      <span class="audio-name">${escHtml(source.name)}</span>
      <button class="btn-mute" data-source="${escHtml(source.name)}" onclick="toggleMute('${escHtml(source.name)}')">🔊</button>
    `;
    list.appendChild(el);
  });
}

// ---- AI Controls ----

async function checkAIStatus() {
  try {
    const res = await fetch(`${BACKEND}/api/ai/status`);
    const status = await res.json();
    document.getElementById('aiLabel').textContent = status.enabled
      ? `AI Ready — ${status.contextSize} messages in context`
      : 'AI Disabled (set ANTHROPIC_API_KEY in .env)';
    document.querySelector('.ai-dot').classList.toggle('enabled', status.enabled);
  } catch (err) {}
}

async function sendAIPrompt() {
  const input = document.getElementById('aiPromptInput');
  const prompt = input.value.trim();
  if (!prompt) return;

  const responseEl = document.getElementById('aiResponse');
  responseEl.innerHTML = '<div class="ai-thinking">✦ Thinking...</div>';

  try {
    const res = await fetch(`${BACKEND}/api/ai/custom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    if (data.response) {
      responseEl.innerHTML = `<div class="ai-result">${escHtml(data.response)}</div>`;
    } else {
      responseEl.innerHTML = `<div class="ai-error">Error: ${data.error}</div>`;
    }
  } catch (err) {
    responseEl.innerHTML = `<div class="ai-error">Error: ${err.message}</div>`;
  }
}

async function generateClipTitle() {
  const input = document.getElementById('clipDescription');
  const description = input.value.trim();
  if (!description) return;

  const responseEl = document.getElementById('clipTitleResponse');
  responseEl.innerHTML = '<div class="ai-thinking">✦ Generating titles...</div>';

  try {
    const res = await fetch(`${BACKEND}/api/ai/clip-title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description })
    });
    const data = await res.json();
    if (data.response) {
      responseEl.innerHTML = `<div class="ai-result">${escHtml(data.response).replace(/\n/g, '<br>')}</div>`;
    }
  } catch (err) {
    responseEl.innerHTML = `<div class="ai-error">Error: ${err.message}</div>`;
  }
}

async function aiReply() {
  const messages = allMessages.slice(-1);
  if (messages.length === 0) return alert('No messages to reply to yet');

  const lastMsg = messages[0];
  try {
    await fetch(`${BACKEND}/api/ai/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: lastMsg.platform,
        message: lastMsg,
        targetPlatform: document.getElementById('sendToPlatform').value
      })
    });
  } catch (err) {
    console.error('AI reply error:', err.message);
  }
}

function addAIMessage(label, message) {
  const log = document.getElementById('aiLog');
  const empty = log.querySelector('.chat-empty');
  if (empty) empty.remove();

  const el = document.createElement('div');
  el.className = 'ai-log-entry';
  el.innerHTML = `
    <div class="ai-log-label">${escHtml(label)}</div>
    <div class="ai-log-text">${escHtml(message)}</div>
  `;
  log.prepend(el);
}

// ---- Chat ----

function addChatMessage(msg) {
  const feed = document.getElementById('chatFeed');
  const empty = feed.querySelector('.chat-empty');
  if (empty) empty.remove();

  const el = document.createElement('div');
  el.className = 'chat-message';
  el.dataset.platform = msg.platform;
  el.dataset.author = msg.author;

  const initial = (msg.author || '?').charAt(0).toUpperCase();
  const avatarHtml = msg.avatar
    ? `<img src="${msg.avatar}" alt="" onerror="this.parentElement.textContent='${initial}'" />`
    : initial;

  el.innerHTML = `
    <div class="chat-avatar">${avatarHtml}</div>
    <div class="chat-content">
      <div class="chat-meta">
        <span class="chat-author">${escHtml(msg.author)}</span>
        <span class="platform-badge ${msg.platform}">${msg.platform}</span>
      </div>
      <div class="chat-text">${escHtml(msg.message)}</div>
    </div>
    <button class="btn-ai-msg" onclick="replyToMessage(event)" title="AI reply to this message">✦</button>
  `;

  el.querySelector('.btn-ai-msg').dataset.msgIndex = allMessages.length - 1;

  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;

  const msgs = feed.querySelectorAll('.chat-message');
  if (msgs.length > 500) msgs[0].remove();
}

async function replyToMessage(e) {
  const btn = e.currentTarget;
  const idx = parseInt(btn.dataset.msgIndex);
  const msg = allMessages[idx];
  if (!msg) return;

  try {
    await fetch(`${BACKEND}/api/ai/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: msg.platform, message: msg })
    });
    showTab('ai');
  } catch (err) {
    console.error('AI reply error:', err);
  }
}

function filterChat(platform) {
  currentFilter = platform;
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  document.getElementById(`filter-${platform}`)?.classList.add('active');

  const feed = document.getElementById('chatFeed');
  feed.innerHTML = '';

  const filtered = platform === 'all' ? allMessages : allMessages.filter(m => m.platform === platform);
  if (filtered.length === 0) {
    feed.innerHTML = '<div class="chat-empty"><div class="empty-icon">◈</div><p>No messages yet</p></div>';
    return;
  }
  filtered.slice(-200).forEach(msg => addChatMessage(msg));
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const platform = document.getElementById('sendToPlatform').value;
  const text = input.value.trim();
  if (!text) return;

  try {
    await fetch(`${BACKEND}/api/platform/${platform}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    input.value = '';
  } catch (err) {
    console.error('Send failed:', err);
  }
}

// ---- Donations ----

function addDonation(platform, donation) {
  const feed = document.getElementById('donationsFeed');
  const empty = feed.querySelector('.chat-empty');
  if (empty) empty.remove();

  const typeMap = {
    superChatEvent: '🔴 Super Chat',
    subscription: '⭐ Subscription',
    bits: `💜 ${donation.amount} Bits`,
    gift: `🎁 ${donation.giftCount}x ${donation.giftName}`
  };

  const el = document.createElement('div');
  el.className = 'donation-card';
  el.innerHTML = `
    <div class="donation-platform-badge ${platform}">${platform.toUpperCase()}</div>
    <div class="donation-author">${escHtml(donation.author)}</div>
    <div class="donation-type">${typeMap[donation.type] || '💰 Donation'}</div>
    ${donation.message ? `<div class="donation-msg">${escHtml(donation.message)}</div>` : ''}
  `;
  feed.prepend(el);
}

// ---- Automation ----

async function loadAutomationRules() {
  try {
    const res = await fetch(`${BACKEND}/api/automation/rules`);
    const rules = await res.json();
    const container = document.getElementById('rulesList');
    container.innerHTML = '';
    rules.forEach(rule => {
      const el = document.createElement('div');
      el.className = 'rule-card';
      el.innerHTML = `
        <button class="rule-toggle ${rule.enabled ? 'on' : ''}" onclick="toggleRule('${rule.id}', this)"></button>
        <div class="rule-info">
          <div class="rule-name">${rule.name}</div>
          <div class="rule-desc">${rule.trigger} → ${rule.action}</div>
        </div>
      `;
      container.appendChild(el);
    });
  } catch (err) {}
}

async function toggleRule(ruleId, btn) {
  const isOn = btn.classList.contains('on');
  btn.classList.toggle('on');
  try {
    await fetch(`${BACKEND}/api/automation/rules/${ruleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !isOn })
    });
  } catch (err) { btn.classList.toggle('on'); }
}

function addLog(message, type = '') {
  const feed = document.getElementById('logFeed');
  if (!feed) return;
  const el = document.createElement('div');
  el.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  el.textContent = `[${time}] ${message}`;
  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;
  const entries = feed.querySelectorAll('.log-entry');
  if (entries.length > 100) entries[0].remove();
}

// ---- Alert Overlay ----

let alertTimeout = null;

function showAlert(platform, type, data, duration = 5000) {
  document.getElementById('alertPlatform').textContent = platform.toUpperCase();
  document.getElementById('alertType').textContent = type === 'donation' ? '💰 New Donation!' : type;
  document.getElementById('alertAuthor').textContent = data.author || '';
  document.getElementById('alertMessage').textContent = data.message || '';
  document.getElementById('alertOverlay').classList.remove('hidden');
  if (alertTimeout) clearTimeout(alertTimeout);
  alertTimeout = setTimeout(() => document.getElementById('alertOverlay').classList.add('hidden'), duration);
}

// ---- Tabs ----

function showTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-content-${tab}`)?.classList.add('active');
  document.getElementById(`tab-${tab}`)?.classList.add('active');
}

// ---- UI Helpers ----

function updateLiveIndicator(isLive) {
  const indicator = document.getElementById('liveIndicator');
  const label = document.getElementById('liveLabel');
  indicator.classList.toggle('live', isLive);
  label.textContent = isLive ? 'LIVE' : 'OFFLINE';
}

function setStatus(platform, text) {
  const el = document.getElementById(`${pid(platform)}-status`);
  if (el) el.textContent = text;
}

function togglePlatformBtns(platform, isConnected) {
  const connectBtn = document.getElementById(`btn-${pid(platform)}-connect`);
  const disconnectBtn = document.getElementById(`btn-${pid(platform)}-disconnect`);
  if (connectBtn) connectBtn.classList.toggle('hidden', isConnected);
  if (disconnectBtn) disconnectBtn.classList.toggle('hidden', !isConnected);
}

function pid(platform) {
  const map = { youtube: 'yt', tiktok: 'tiktok', facebook: 'fb', twitter: 'twitter', bluesky: 'bluesky' };
  return map[platform] || platform;
}

function startUptime() {
  streamStartTime = Date.now();
  uptimeInterval = setInterval(() => {
    const elapsed = Date.now() - streamStartTime;
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    document.getElementById('stat-uptime').textContent =
      `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  }, 1000);
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---- Sound Alerts ----

let soundEnabled = true;
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, duration, type = 'sine', vol = 0.25) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

function soundDonation() {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.15, 'sine', 0.2), i * 75));
}

function soundConnect() {
  playTone(660, 0.08); setTimeout(() => playTone(880, 0.12), 90);
}

function soundClip() {
  playTone(1100, 0.04, 'square', 0.15); setTimeout(() => playTone(800, 0.09, 'square', 0.1), 55);
}

function soundDeckClick() {
  playTone(440, 0.06, 'sine', 0.12);
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  document.getElementById('btnSound').textContent = soundEnabled ? '🔊' : '🔇';
}

// ---- Stream Deck ----

let deckButtons = [];
let editingButtonId = null;

socket.on('deck:buttons', (buttons) => {
  deckButtons = buttons;
  renderDeck();
});

socket.on('deck:triggered', ({ id, label }) => {
  soundDeckClick();
  const btn = document.querySelector(`.deck-btn[data-id="${id}"]`);
  if (btn) {
    btn.classList.add('fired');
    setTimeout(() => btn.classList.remove('fired'), 400);
  }
  addLog(`Deck: ${label || id}`, 'success');
});

socket.on('deck:error', ({ id, error }) => {
  addLog(`Deck error: ${error}`, 'warn');
});

socket.on('deck:action', ({ action }) => {
  if (action === 'ai-summary') { showTab('ai'); generateStreamSummary(); }
});

socket.on('deck:clip-marked', (data) => {
  soundClip();
  addLog(`✂ Clip marked: ${data.label}`, 'success');
});

socket.on('clips:saved', (clip) => {
  prependSavedClip(clip);
  updateClipCount();
});

socket.on('clips:all', (clips) => {
  renderSavedClips(clips);
});

function renderDeck() {
  const grid = document.getElementById('deckGrid');
  if (!grid) return;
  grid.innerHTML = '';

  deckButtons.forEach(btn => {
    const el = document.createElement('div');
    el.className = `deck-btn${btn.action === 'none' ? ' empty' : ''}`;
    el.dataset.id = btn.id;
    el.style.setProperty('--btn-color', btn.color || '#1e1e30');

    el.innerHTML = `
      <div class="deck-btn-icon">${btn.icon || '+'}</div>
      <div class="deck-btn-label">${escHtml(btn.label)}</div>
      <button class="deck-edit-btn" onclick="openDeckEdit(event,'${btn.id}')" title="Edit">✎</button>
    `;

    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('deck-edit-btn')) return;
      triggerDeck(btn.id);
    });

    grid.appendChild(el);
  });
}

async function loadDeck() {
  try {
    const res = await fetch(`${BACKEND}/api/deck/buttons`);
    deckButtons = await res.json();
    renderDeck();
  } catch (err) {}
}

async function triggerDeck(id) {
  try {
    await fetch(`${BACKEND}/api/deck/trigger/${id}`, { method: 'POST' });
  } catch (err) {
    addLog(`Deck error: ${err.message}`, 'warn');
  }
}

function openDeckEdit(e, id) {
  e.stopPropagation();
  const btn = deckButtons.find(b => b.id === id);
  if (!btn) return;
  editingButtonId = id;

  document.getElementById('editIcon').value = btn.icon || '';
  document.getElementById('editLabel').value = btn.label || '';
  document.getElementById('editAction').value = btn.action || 'none';

  // Populate param field
  const params = btn.params || {};
  const paramVal = params.message || params.scene || params.source || params.label || '';
  document.getElementById('editParam').value = paramVal;

  document.getElementById('deckEditModal').classList.remove('hidden');
}

function closeDeckEdit() {
  editingButtonId = null;
  document.getElementById('deckEditModal').classList.add('hidden');
}

async function saveDeckEdit() {
  if (!editingButtonId) return;
  const updates = {
    icon:   document.getElementById('editIcon').value.trim() || '+',
    label:  document.getElementById('editLabel').value.trim(),
    action: document.getElementById('editAction').value,
    params: document.getElementById('editParam').value.trim()
  };

  try {
    await fetch(`${BACKEND}/api/deck/button/${editingButtonId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    closeDeckEdit();
  } catch (err) {
    addLog(`Deck save error: ${err.message}`, 'warn');
  }
}

// Close modal on outside click
document.addEventListener('click', (e) => {
  const modal = document.getElementById('deckEditModal');
  if (!modal.classList.contains('hidden') && e.target === modal) closeDeckEdit();
});

// ---- Saved Clips ----

function renderSavedClips(clips) {
  const list = document.getElementById('savedClipsList');
  if (!list) return;
  if (!clips?.length) {
    list.innerHTML = '<div class="obs-empty">No clips saved yet — mark a moment with the ✂ button</div>';
    updateClipCount(0);
    return;
  }
  list.innerHTML = '';
  clips.forEach(clip => prependSavedClip(clip, true));
  updateClipCount(clips.length);
}

function prependSavedClip(clip, append = false) {
  const list = document.getElementById('savedClipsList');
  if (!list) return;
  const empty = list.querySelector('.obs-empty');
  if (empty) empty.remove();

  const el = document.createElement('div');
  el.className = 'saved-clip-row';
  el.dataset.clipId = clip.id;
  el.innerHTML = `
    <span class="clip-time">${clip.timestamp}</span>
    <span class="clip-source-badge ${clip.source}">${clip.source}</span>
    <span class="saved-clip-label">${escHtml(clip.label)}</span>
    <button class="btn-clip-delete" onclick="deleteClip(${clip.id})" title="Delete">✕</button>
  `;
  if (append) list.appendChild(el);
  else list.prepend(el);
}

function updateClipCount(count) {
  const badge = document.getElementById('clipCountBadge');
  if (!badge) return;
  if (count === undefined) {
    badge.textContent = parseInt(badge.textContent || '0') + 1;
  } else {
    badge.textContent = count;
  }
}

async function deleteClip(id) {
  try {
    await fetch(`${BACKEND}/api/clips/${id}`, { method: 'DELETE' });
    const el = document.querySelector(`[data-clip-id="${id}"]`);
    if (el) el.remove();
    const count = document.querySelectorAll('.saved-clip-row').length;
    updateClipCount(count);
    if (count === 0) {
      document.getElementById('savedClipsList').innerHTML =
        '<div class="obs-empty">No clips saved yet — mark a moment with the ✂ button</div>';
    }
  } catch (err) { addLog('Delete clip error: ' + err.message, 'warn'); }
}

// ---- Broadcast ----

async function broadcastMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  const btn = document.querySelector('.btn-broadcast');
  btn.textContent = '...';

  try {
    const res = await fetch(`${BACKEND}/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    const data = await res.json();
    const sent = Object.values(data.results || {}).filter(v => v === 'sent').length;
    addLog(`📢 Broadcast to ${sent} platform(s): "${text}"`, 'success');
    input.value = '';
  } catch (err) {
    addLog('Broadcast error: ' + err.message, 'warn');
  } finally {
    btn.textContent = '📢';
  }
}

// ---- Analytics ----

socket.on('analytics:update', (stats) => renderAnalytics(stats));
socket.on('analytics:viewers', ({ count }) => {
  document.getElementById('stat-viewers').textContent = count.toLocaleString();
});
socket.on('analytics:clip-moment', (moment) => {
  soundClip();
  addClipMoment(moment);
  document.getElementById('an-clip-count').textContent =
    parseInt(document.getElementById('an-clip-count').textContent || '0') + 1;
  addLog(`✂ Clip moment: ${moment.label}`, 'success');
});

async function loadAnalytics() {
  try {
    const res = await fetch(`${BACKEND}/api/analytics`);
    const stats = await res.json();
    renderAnalytics(stats);
  } catch (err) {}
}

function renderAnalytics(stats) {
  // Stat cards
  document.getElementById('an-duration').textContent = formatDuration(stats.sessionDuration);
  document.getElementById('an-total-msgs').textContent = stats.totalMessages.toLocaleString();
  document.getElementById('an-avg-rate').textContent = stats.sessionAvgRate;
  document.getElementById('an-clip-count').textContent = (stats.clipMoments || []).length;

  // Chart
  renderMsgRateChart(stats.msgRateHistory || []);

  // Top chatters
  const chattersEl = document.getElementById('topChatters');
  if (stats.topChatters?.length) {
    const max = stats.topChatters[0].count;
    chattersEl.innerHTML = stats.topChatters.map((c, i) => `
      <div class="an-bar-row">
        <span class="an-bar-rank">${i + 1}</span>
        <span class="an-bar-label">${escHtml(c.author)}</span>
        <div class="an-bar-track">
          <div class="an-bar-fill" style="width:${(c.count / max * 100).toFixed(1)}%"></div>
        </div>
        <span class="an-bar-count">${c.count}</span>
      </div>
    `).join('');
  }

  // Platform breakdown
  const breakdownEl = document.getElementById('platformBreakdown');
  const platforms = Object.entries(stats.platformBreakdown || {});
  if (platforms.length) {
    const total = platforms.reduce((s, [, n]) => s + n, 0);
    breakdownEl.innerHTML = platforms
      .sort(([, a], [, b]) => b - a)
      .map(([p, n]) => `
        <div class="an-bar-row">
          <span class="an-bar-label platform-badge ${p}">${p}</span>
          <div class="an-bar-track">
            <div class="an-bar-fill ${p}" style="width:${(n / total * 100).toFixed(1)}%"></div>
          </div>
          <span class="an-bar-count">${n}</span>
        </div>
      `).join('');
  }

  // Clip moments
  const clipsEl = document.getElementById('clipMomentsList');
  if (stats.clipMoments?.length) {
    clipsEl.innerHTML = [...stats.clipMoments].reverse().map(m => `
      <div class="clip-moment">
        <span class="clip-time">${m.timestamp}</span>
        <span class="clip-label">${escHtml(m.label)}</span>
      </div>
    `).join('');
  }
}

function addClipMoment(moment) {
  const el = document.getElementById('clipMomentsList');
  const empty = el.querySelector('.obs-empty');
  if (empty) empty.remove();

  const item = document.createElement('div');
  item.className = 'clip-moment new';
  item.innerHTML = `
    <span class="clip-time">${moment.timestamp}</span>
    <span class="clip-label">${escHtml(moment.label)}</span>
  `;
  el.prepend(item);
  setTimeout(() => item.classList.remove('new'), 2000);
}

function renderMsgRateChart(data) {
  const svg = document.getElementById('msgRateChart');
  if (!svg) return;
  const W = svg.clientWidth || 600;
  const H = 70;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  if (!data.length) { svg.innerHTML = ''; return; }

  const max = Math.max(...data.map(d => d.count), 1);
  const step = W / Math.max(data.length - 1, 1);

  const points = data.map((d, i) => {
    const x = i * step;
    const y = H - 4 - ((d.count / max) * (H - 12));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const areaPoints = `0,${H} ` + points + ` ${((data.length - 1) * step).toFixed(1)},${H}`;

  svg.innerHTML = `
    <defs>
      <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#00ff88" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#00ff88" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polygon points="${areaPoints}" fill="url(#chartGrad)"/>
    <polyline points="${points}" fill="none" stroke="#00ff88" stroke-width="1.5" stroke-linejoin="round"/>
    <text x="${W - 4}" y="10" fill="#3a3a5c" font-size="9" text-anchor="end" font-family="monospace">${max} peak</text>
  `;
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

async function syncTitle() {
  const input = document.getElementById('titleSyncInput');
  const title = input.value.trim();
  const status = document.getElementById('titleSyncStatus');
  if (!title) return;

  status.textContent = 'Syncing...';
  status.className = 'title-sync-status';

  try {
    const res = await fetch(`${BACKEND}/api/youtube/title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    const data = await res.json();
    if (data.success) {
      status.textContent = '✓ Title updated on YouTube';
      status.className = 'title-sync-status ok';
    } else {
      status.textContent = '✕ ' + data.error;
      status.className = 'title-sync-status err';
    }
  } catch (err) {
    status.textContent = '✕ ' + err.message;
    status.className = 'title-sync-status err';
  }
}

async function generateStreamSummary() {
  const el = document.getElementById('streamSummaryResponse');
  el.innerHTML = '<div class="ai-thinking">✦ Generating stream summary...</div>';

  try {
    const res = await fetch(`${BACKEND}/api/ai/stream-summary`, { method: 'POST' });
    const data = await res.json();
    if (data.response) {
      el.innerHTML = `<div class="ai-result">${escHtml(data.response).replace(/\n/g, '<br>')}</div>`;
    } else {
      el.innerHTML = `<div class="ai-error">Error: ${data.error}</div>`;
    }
  } catch (err) {
    el.innerHTML = `<div class="ai-error">Error: ${err.message}</div>`;
  }
}

// ---- Keyboard Shortcuts ----
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement.id === 'chatInput') sendMessage();
  if (e.ctrlKey && e.key === '1') showTab('chat');
  if (e.ctrlKey && e.key === '2') showTab('obs');
  if (e.ctrlKey && e.key === '3') showTab('ai');
  if (e.ctrlKey && e.key === '4') showTab('donations');
  if (e.ctrlKey && e.key === '5') showTab('automation');
  if (e.ctrlKey && e.key === '6') showTab('analytics');
  if (e.ctrlKey && e.key === '7') showTab('deck');
});

// ---- Init ----
async function init() {
  try {
    const res = await fetch(`${BACKEND}/api/status`);
    const status = await res.json();
    for (const [platform, s] of Object.entries(status)) {
      if (s.authenticated) {
        setStatus(platform, 'Authenticated ✓');
        const btn = document.getElementById(`btn-${pid(platform)}-connect`);
        if (btn) btn.disabled = false;
      }
      if (s.connected) {
        document.getElementById(`card-${platform}`)?.classList.add(`active-${platform}`);
        togglePlatformBtns(platform, true);
        updateLiveIndicator(true);
        if (!streamStartTime) startUptime();
      }
    }
  } catch (err) {}
}

init();
