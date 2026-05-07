const fs = require('fs');
const path = require('path');

class ClipLogger {
  constructor(io) {
    this.io = io;
    const dataDir = process.env.STREAMHUB_DATA || path.join(process.cwd(), 'config');
    this.logPath = path.join(dataDir, 'clips.json');
    this._ensureDir();
    this.clips = this._load();
    console.log(`[Clips] Logger initialized — ${this.clips.length} clips on file`);
  }

  _ensureDir() {
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  _load() {
    try {
      if (fs.existsSync(this.logPath)) {
        return JSON.parse(fs.readFileSync(this.logPath, 'utf8'));
      }
    } catch (e) {}
    return [];
  }

  _persist() {
    try {
      fs.writeFileSync(this.logPath, JSON.stringify(this.clips, null, 2));
    } catch (e) { console.error('[Clips] Save error:', e.message); }
  }

  save(data) {
    const clip = {
      id: Date.now(),
      savedAt: new Date().toISOString(),
      timestamp: data.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      label: data.label || 'Clip moment',
      source: data.source || 'manual',
      context: data.context || ''
    };

    this.clips.push(clip);
    if (this.clips.length > 200) this.clips.shift();
    this._persist();

    console.log(`[Clips] Saved: "${clip.label}" [${clip.source}]`);
    this.io.emit('clips:saved', clip);
    return clip;
  }

  getAll() { return [...this.clips].reverse(); }
  getCount() { return this.clips.length; }

  delete(id) {
    const before = this.clips.length;
    this.clips = this.clips.filter(c => c.id !== id);
    if (this.clips.length !== before) { this._persist(); return true; }
    return false;
  }
}

module.exports = ClipLogger;
