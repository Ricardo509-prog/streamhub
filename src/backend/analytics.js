class AnalyticsEngine {
  constructor(io) {
    this.io = io;
    this.sessionStart = Date.now();

    // Time-series (30s resolution, max 60 ticks = 30 min)
    this.msgRateHistory = [];
    this.viewerHistory = [];

    // Aggregates
    this.totalMessages = 0;
    this.platformBreakdown = {};
    this.topChatters = {};
    this.donationsByPlatform = {};
    this.clipMoments = [];

    // Rolling clip detection window
    this.recentMsgTimestamps = [];
    this.tickMsgCount = 0;
    this.sessionAvgRate = 0;

    // Record a data point every 30s
    setInterval(() => this._tick(), 30000);
    // Push stats to UI every 10s
    setInterval(() => this._broadcast(), 10000);

    console.log('[Analytics] Engine initialized');
  }

  trackMessage(platform, msg) {
    this.totalMessages++;
    this.tickMsgCount++;
    this.recentMsgTimestamps.push(Date.now());

    // Keep only last 5 minutes
    const cutoff = Date.now() - 300000;
    while (this.recentMsgTimestamps.length && this.recentMsgTimestamps[0] < cutoff) {
      this.recentMsgTimestamps.shift();
    }

    this.platformBreakdown[platform] = (this.platformBreakdown[platform] || 0) + 1;
    if (msg.author) this.topChatters[msg.author] = (this.topChatters[msg.author] || 0) + 1;

    // Check for clip every 15 new messages
    if (this.totalMessages % 15 === 0) this._detectClip();
  }

  trackViewers(count) {
    const last = this.viewerHistory[this.viewerHistory.length - 1];
    if (last) last.viewers = count;
    this.io.emit('analytics:viewers', { count });
  }

  trackDonation(platform) {
    this.donationsByPlatform[platform] = (this.donationsByPlatform[platform] || 0) + 1;
  }

  _tick() {
    const count = this.tickMsgCount;
    this.tickMsgCount = 0;

    const now = Date.now();
    this.msgRateHistory.push({ time: now, count });
    if (this.msgRateHistory.length > 60) this.msgRateHistory.shift();

    this.viewerHistory.push({ time: now, viewers: 0 });
    if (this.viewerHistory.length > 60) this.viewerHistory.shift();

    const sum = this.msgRateHistory.reduce((s, r) => s + r.count, 0);
    this.sessionAvgRate = sum / this.msgRateHistory.length;

    this._detectClip(count);
  }

  _detectClip() {
    const windowStart = Date.now() - 30000;
    const recentCount = this.recentMsgTimestamps.filter(t => t > windowStart).length;
    const avg = this.sessionAvgRate || 1;

    if (recentCount >= 8 && recentCount > avg * 2.5) {
      const last = this.clipMoments[this.clipMoments.length - 1];
      if (last && Date.now() - last.time < 60000) return; // cooldown

      const moment = {
        time: Date.now(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        activity: recentCount,
        avg: Math.round(avg),
        label: `${recentCount} msgs in 30s (avg ${Math.round(avg)})`
      };

      this.clipMoments.push(moment);
      if (this.clipMoments.length > 30) this.clipMoments.shift();

      this.io.emit('analytics:clip-moment', moment);
      console.log(`[Analytics] Clip moment detected: ${moment.label}`);
    }
  }

  _broadcast() {
    this.io.emit('analytics:update', this.getStats());
  }

  getStats() {
    const topChatters = Object.entries(this.topChatters)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([author, count]) => ({ author, count }));

    return {
      sessionDuration: Date.now() - this.sessionStart,
      totalMessages: this.totalMessages,
      sessionAvgRate: Math.round(this.sessionAvgRate),
      msgRateHistory: this.msgRateHistory,
      viewerHistory: this.viewerHistory,
      platformBreakdown: this.platformBreakdown,
      donationsByPlatform: this.donationsByPlatform,
      topChatters,
      clipMoments: this.clipMoments
    };
  }
}

module.exports = AnalyticsEngine;
