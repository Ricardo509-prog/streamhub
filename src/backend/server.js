const path = require('path');

// In packaged builds, load .env from userData so users can store API keys there
const envPath = process.env.STREAMHUB_DATA
  ? require('path').join(process.env.STREAMHUB_DATA, '.env')
  : undefined;
require('dotenv').config(envPath ? { path: envPath } : undefined);
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// Platforms
const YouTubePlatform = require('./platforms/youtube');
const TikTokPlatform = require('./platforms/tiktok');
const FacebookPlatform = require('./platforms/facebook');
const TwitterPlatform = require('./platforms/twitter');
const BlueskyPlatform = require('./platforms/bluesky');

// Phase 3 modules
const OBSController = require('./obs');
const AIChatEngine = require('./ai');
const AutomationEngine = require('./automation');

// Phase 4 modules
const AnalyticsEngine = require('./analytics');

// Phase 5 modules
const StreamDeckEngine = require('./deck');
const ClipLogger = require('./clips');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- Initialize Modules ----
const platforms = {
  youtube: new YouTubePlatform(io),
  tiktok: new TikTokPlatform(io),
  facebook: new FacebookPlatform(io),
  twitter: new TwitterPlatform(io),
  bluesky: new BlueskyPlatform(io)
};

const obs = new OBSController(io);
const ai = new AIChatEngine(io);
const automation = new AutomationEngine(io, platforms);
const analytics = new AnalyticsEngine(io);
const clips = new ClipLogger(io);
const deck = new StreamDeckEngine(io, platforms, obs, ai);

// ---- Wire AI into chat stream ----
const originalEmit = io.emit.bind(io);
io.emit = (event, data, ...args) => {
  if (event === 'chat:messages' && data?.messages) {
    data.messages.forEach(msg => {
      automation.processChatMessage(data.platform, msg);
      ai.addToContext(data.platform, msg);
      analytics.trackMessage(data.platform, msg);
    });
  }
  if (event === 'donations:new' && data?.donations) {
    data.donations.forEach(d => {
      automation.processDonation(data.platform, d);
      analytics.trackDonation(data.platform);
    });
  }
  if (event === 'stats:update' && data?.viewers !== undefined) {
    analytics.trackViewers(data.viewers);
  }
  return originalEmit(event, data, ...args);
};

// ---- Socket.IO ----
// Auto-save analytics clip moments to disk
io.on('analytics:clip-moment', (moment) => {
  clips.save({ label: `Chat spike: ${moment.label}`, source: 'analytics', timestamp: moment.timestamp });
});

// Auto-save deck manual clip marks to disk
io.on('deck:clip-marked', (data) => {
  clips.save({ label: data.label || 'Manual clip mark', source: 'deck', timestamp: data.timestamp });
});

io.on('connection', (socket) => {
  console.log('[StreamHub] Dashboard connected');

  if (obs.connected) socket.emit('obs:connected', obs.getStatus());
  socket.emit('deck:buttons', deck.getButtons());
  socket.emit('clips:all', clips.getAll());

  socket.on('disconnect', () => {
    console.log('[StreamHub] Dashboard disconnected');
  });
});

// ---- Platform Routes ----
app.get('/health', (req, res) => res.json({ status: 'ok', version: '3.0.0' }));

// Auth
app.get('/auth/youtube', (req, res) => res.redirect(platforms.youtube.getAuthUrl()));
app.get('/auth/youtube/callback', async (req, res) => {
  try {
    await platforms.youtube.handleCallback(req.query.code);
    res.send('<script>window.close();</script><p>YouTube connected!</p>');
  } catch (err) { res.status(500).send('YouTube auth failed: ' + err.message); }
});

app.get('/auth/facebook', (req, res) => {
  const url = platforms.facebook.getAuthUrl();
  if (!url) return res.status(400).send('Set FACEBOOK_APP_ID in .env');
  res.redirect(url);
});
app.get('/auth/facebook/callback', async (req, res) => {
  try {
    await platforms.facebook.handleCallback(req.query.code);
    res.send('<script>window.close();</script><p>Facebook connected!</p>');
  } catch (err) { res.status(500).send('Facebook auth failed: ' + err.message); }
});

// Platform status & control
app.get('/api/status', (req, res) => {
  const status = {};
  for (const [name, p] of Object.entries(platforms)) status[name] = p.getStatus();
  res.json(status);
});

app.post('/api/platform/:name/connect', async (req, res) => {
  const p = platforms[req.params.name];
  if (!p) return res.status(404).json({ error: 'Platform not found' });
  try { await p.connect(); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/platform/:name/disconnect', (req, res) => {
  const p = platforms[req.params.name];
  if (!p) return res.status(404).json({ error: 'Platform not found' });
  p.disconnect();
  res.json({ success: true });
});

app.post('/api/platform/:name/send', async (req, res) => {
  const p = platforms[req.params.name];
  if (!p) return res.status(404).json({ error: 'Platform not found' });
  try { await p.sendMessage(req.body.message); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- OBS Routes ----
app.post('/api/obs/connect', async (req, res) => {
  try { await obs.connect(); res.json({ success: true, status: obs.getStatus() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/obs/disconnect', (req, res) => {
  obs.disconnect();
  res.json({ success: true });
});

app.get('/api/obs/status', (req, res) => res.json(obs.getStatus()));

app.get('/api/obs/scenes', async (req, res) => {
  try { res.json(await obs.getScenes()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/obs/scene', async (req, res) => {
  try { await obs.switchScene(req.body.sceneName); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/obs/mute', async (req, res) => {
  try { await obs.muteSource(req.body.sourceName, req.body.muted); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/obs/mute/toggle', async (req, res) => {
  try { await obs.toggleMute(req.body.sourceName); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/obs/source/visible', async (req, res) => {
  try {
    await obs.setSourceVisible(req.body.sceneName, req.body.sourceName, req.body.visible);
    res.json({ success: true });
  }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/obs/sources/:scene', async (req, res) => {
  try { res.json(await obs.getSceneSources(req.params.scene)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/obs/record/start', async (req, res) => {
  try { await obs.startRecording(); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/obs/record/stop', async (req, res) => {
  try { await obs.stopRecording(); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/obs/record/toggle', async (req, res) => {
  try { await obs.toggleRecording(); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- AI Routes ----
app.get('/api/ai/status', (req, res) => res.json(ai.getStatus()));

app.post('/api/ai/respond', async (req, res) => {
  try {
    const response = await ai.respondToMessage(req.body.platform, req.body.message, req.body.targetPlatform);
    res.json({ success: true, response });
  }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/ai/custom', async (req, res) => {
  try {
    const response = await ai.generateCustom(req.body.prompt);
    res.json({ success: true, response });
  }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/ai/clip-title', async (req, res) => {
  try {
    const response = await ai.suggestClipTitle(req.body.description);
    res.json({ success: true, response });
  }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- Analytics Routes ----
app.get('/api/analytics', (req, res) => res.json(analytics.getStats()));

// ---- YouTube Title Sync ----
app.post('/api/youtube/title', async (req, res) => {
  try {
    await platforms.youtube.setTitle(req.body.title);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- AI Stream Summary ----
app.post('/api/ai/stream-summary', async (req, res) => {
  try {
    const response = await ai.generateStreamSummary();
    res.json({ success: true, response });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- Automation Routes ----
app.get('/api/automation/rules', (req, res) => res.json(automation.getRules()));
app.patch('/api/automation/rules/:id', (req, res) => {
  res.json({ success: automation.setRuleEnabled(req.params.id, req.body.enabled) });
});
app.post('/api/automation/rules', (req, res) => {
  res.json({ success: true, id: automation.addRule(req.body) });
});

// ---- Broadcast ----
app.post('/api/broadcast', async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });
  const results = {};
  for (const [name, p] of Object.entries(platforms)) {
    if (p.connected && p.sendMessage) {
      try { await p.sendMessage(message); results[name] = 'sent'; }
      catch (err) { results[name] = `error: ${err.message}`; }
    }
  }
  res.json({ success: true, results });
});

// ---- Stream Deck ----
app.get('/api/deck/buttons', (req, res) => res.json(deck.getButtons()));

app.post('/api/deck/trigger/:id', async (req, res) => {
  const result = await deck.trigger(req.params.id);
  res.json(result);
});

app.patch('/api/deck/button/:id', (req, res) => {
  const ok = deck.updateButton(req.params.id, req.body);
  if (ok) {
    io.emit('deck:buttons', deck.getButtons());
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Button not found' });
  }
});

// ---- Clip Logger ----
app.get('/api/clips', (req, res) => res.json(clips.getAll()));

app.post('/api/clips', (req, res) => {
  const clip = clips.save({
    label: req.body.label || 'Manual clip',
    source: req.body.source || 'manual',
    context: req.body.context || '',
    timestamp: req.body.timestamp
  });
  res.json({ success: true, clip });
});

app.delete('/api/clips/:id', (req, res) => {
  const ok = clips.delete(parseInt(req.params.id));
  res.json({ success: ok });
});

// ---- Start ----
async function startBackend() {
  return new Promise((resolve) => {
    const port = process.env.PORT || 3001;
    server.listen(port, () => {
      console.log(`[StreamHub] Backend v3.0 running on port ${port}`);
      console.log('[StreamHub] Platforms: YouTube, TikTok, Facebook, Twitter, Bluesky');
      console.log('[StreamHub] Modules: OBS, AI, Automation, Analytics, StreamDeck, ClipLogger');
      resolve();
    });
  });
}

module.exports = { startBackend, io };
