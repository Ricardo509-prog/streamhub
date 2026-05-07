const fs = require('fs');
const path = require('path');

class StreamDeckEngine {
  constructor(io, platforms, obs, ai) {
    this.io = io;
    this.platforms = platforms;
    this.obs = obs;
    this.ai = ai;
    const dataDir = process.env.STREAMHUB_DATA || path.join(process.cwd(), 'config');
    this.configPath = path.join(dataDir, 'deck.json');
    this.buttons = this._load();
    console.log('[Deck] StreamDeck engine initialized');
  }

  _load() {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      }
    } catch (e) {}
    return this._defaults();
  }

  _save() {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.buttons, null, 2));
    } catch (e) { console.error('[Deck] Save error:', e.message); }
  }

  _defaults() {
    return [
      { id: 'b1',  label: 'Mark Clip',    icon: '✂',  color: '#00ff88', action: 'clip',       params: {} },
      { id: 'b2',  label: 'Hype Chat',    icon: '🔥', color: '#ff6600', action: 'broadcast',  params: { message: "Let's go! 🔥" } },
      { id: 'b3',  label: 'Welcome',      icon: '👋', color: '#00aaff', action: 'broadcast',  params: { message: 'Welcome everyone! 👋' } },
      { id: 'b4',  label: 'Sub Reminder', icon: '⭐', color: '#ffaa00', action: 'broadcast',  params: { message: "Don't forget to subscribe! ⭐" } },
      { id: 'b5',  label: 'Main Scene',   icon: '🎥', color: '#e05c08', action: 'obs-scene',  params: { scene: '' } },
      { id: 'b6',  label: 'BRB Scene',    icon: '⏸', color: '#e05c08', action: 'obs-scene',  params: { scene: 'BRB' } },
      { id: 'b7',  label: 'Cam Scene',    icon: '👤', color: '#e05c08', action: 'obs-scene',  params: { scene: 'Just Chatting' } },
      { id: 'b8',  label: 'Mute Mic',     icon: '🎙', color: '#ff4444', action: 'obs-mute',   params: { source: 'Mic/Aux' } },
      { id: 'b9',  label: 'Rec Toggle',   icon: '⏺', color: '#ff0000', action: 'obs-record', params: {} },
      { id: 'b10', label: 'AI Summary',   icon: '✦',  color: '#a855f7', action: 'ai-summary', params: {} },
      { id: 'b11', label: 'Flash Alert',  icon: '⚡', color: '#ffff00', action: 'alert',      params: { message: '⚡ HYPE MOMENT!' } },
      { id: 'b12', label: '',             icon: '+',  color: '#1e1e30', action: 'none',       params: {} },
    ];
  }

  async trigger(id) {
    const btn = this.buttons.find(b => b.id === id);
    if (!btn || btn.action === 'none') return { success: false, error: 'No action configured' };

    console.log(`[Deck] Trigger: "${btn.label || id}" (${btn.action})`);

    try {
      switch (btn.action) {
        case 'obs-scene':
          if (!this.obs.connected) throw new Error('OBS not connected');
          if (!btn.params.scene) throw new Error('No scene name set — edit this button');
          await this.obs.switchScene(btn.params.scene);
          break;

        case 'obs-mute':
          if (!this.obs.connected) throw new Error('OBS not connected');
          await this.obs.toggleMute(btn.params.source || 'Mic/Aux');
          break;

        case 'obs-record':
          if (!this.obs.connected) throw new Error('OBS not connected');
          await this.obs.toggleRecording();
          break;

        case 'broadcast': {
          const msg = btn.params.message;
          if (!msg) throw new Error('No message configured — edit this button');
          let sent = 0;
          for (const [, p] of Object.entries(this.platforms)) {
            if (p.connected && p.sendMessage) {
              await p.sendMessage(msg).catch(() => {});
              sent++;
            }
          }
          if (sent === 0) throw new Error('No connected platforms to send to');
          break;
        }

        case 'alert':
          this.io.emit('alert:show', {
            platform: 'deck',
            type: 'custom',
            data: { author: 'StreamDeck', message: btn.params.message || '⚡' },
            duration: 4000
          });
          break;

        case 'clip':
          this.io.emit('deck:clip-marked', {
            time: Date.now(),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            label: btn.params.label || 'Manual clip mark'
          });
          break;

        case 'ai-summary':
          this.io.emit('deck:action', { action: 'ai-summary' });
          break;
      }

      this.io.emit('deck:triggered', { id, label: btn.label, action: btn.action });
      return { success: true };
    } catch (err) {
      this.io.emit('deck:error', { id, error: err.message });
      return { success: false, error: err.message };
    }
  }

  updateButton(id, updates) {
    const btn = this.buttons.find(b => b.id === id);
    if (!btn) return false;
    if (updates.params && typeof updates.params === 'string') {
      // Parse params string into the right key based on action
      const action = updates.action || btn.action;
      const paramMap = {
        'broadcast':  { message: updates.params },
        'obs-scene':  { scene: updates.params },
        'obs-mute':   { source: updates.params },
        'alert':      { message: updates.params },
        'clip':       { label: updates.params }
      };
      updates.params = paramMap[action] || {};
    }
    Object.assign(btn, updates);
    this._save();
    return true;
  }

  getButtons() { return this.buttons; }
}

module.exports = StreamDeckEngine;
