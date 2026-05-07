class AutomationEngine {
  constructor(io, platforms) {
    this.io = io;
    this.platforms = platforms;
    this.rules = this._defaultRules();
    this.messageCount = 0;
    this.donationCount = 0;
  }

  _defaultRules() {
    return [
      {
        id: 'welcome-new-viewer',
        name: 'Welcome New Viewers',
        trigger: 'First message in chat',
        action: 'Log welcome',
        enabled: true,
        seenUsers: new Set()
      },
      {
        id: 'banned-words',
        name: 'Word Filter',
        trigger: 'Message contains banned word',
        action: 'Flag message & log',
        enabled: true,
        words: (process.env.BANNED_WORDS || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean)
      },
      {
        id: 'donation-alert',
        name: 'Donation Alert Overlay',
        trigger: 'New donation / gift received',
        action: 'Show overlay alert for 6 seconds',
        enabled: true
      },
      {
        id: 'milestone-100',
        name: 'Chat Milestone (100 messages)',
        trigger: 'Every 100 chat messages',
        action: 'Log milestone to activity feed',
        enabled: true
      },
      {
        id: 'high-value-donation',
        name: 'High-Value Donation Alert',
        trigger: 'Super Chat / donation amount received',
        action: 'Pin message & flash alert',
        enabled: true
      }
    ];
  }

  processChatMessage(platform, msg) {
    this.messageCount++;

    // Welcome new viewer
    const welcomeRule = this.rules.find(r => r.id === 'welcome-new-viewer');
    if (welcomeRule?.enabled && msg.author && !welcomeRule.seenUsers.has(msg.author)) {
      welcomeRule.seenUsers.add(msg.author);
      if (welcomeRule.seenUsers.size > 1) {
        this._log(`Welcome: ${msg.author} on ${platform}`, 'success');
        if (process.env.AUTO_WELCOME === 'true' && process.env.WELCOME_MESSAGE) {
          const p = this.platforms[platform];
          if (p?.sendMessage) {
            p.sendMessage(process.env.WELCOME_MESSAGE).catch(() => {});
          }
        }
      }
    }

    // Word filter
    const filterRule = this.rules.find(r => r.id === 'banned-words');
    if (filterRule?.enabled && filterRule.words?.length > 0) {
      const lower = (msg.message || '').toLowerCase();
      const matched = filterRule.words.find(w => w && lower.includes(w));
      if (matched) {
        this._log(`[MOD] Flagged "${msg.author}" on ${platform}: matched word filter`, 'warn');
        this.io.emit('moderation:action', { platform, author: msg.author, message: msg.message, rule: 'word-filter' });
      }
    }

    // Milestone
    const milestoneRule = this.rules.find(r => r.id === 'milestone-100');
    if (milestoneRule?.enabled && this.messageCount % 100 === 0) {
      this._log(`Milestone: ${this.messageCount} messages in chat!`, 'success');
    }
  }

  processDonation(platform, donation) {
    this.donationCount++;

    // Donation alert overlay
    const alertRule = this.rules.find(r => r.id === 'donation-alert');
    if (alertRule?.enabled) {
      this.io.emit('alert:show', {
        platform,
        type: 'donation',
        data: { author: donation.author, message: donation.message || '' },
        duration: 6000
      });
    }

    const highValueRule = this.rules.find(r => r.id === 'high-value-donation');
    if (highValueRule?.enabled) {
      this._log(`[${platform.toUpperCase()}] Donation from ${donation.author}`, 'success');
    }
  }

  getRules() {
    return this.rules.map(({ seenUsers, words, ...r }) => r);
  }

  setRuleEnabled(id, enabled) {
    const rule = this.rules.find(r => r.id === id);
    if (!rule) return false;
    rule.enabled = enabled;
    this._log(`Rule "${rule.name}" ${enabled ? 'enabled' : 'disabled'}`, '');
    return true;
  }

  addRule(ruleData) {
    const id = `custom-${Date.now()}`;
    this.rules.push({ id, ...ruleData, enabled: true });
    return id;
  }

  _log(message, type) {
    this.io.emit('automation:log', { message, type, time: new Date().toISOString() });
    console.log(`[Automation] ${message}`);
  }
}

module.exports = AutomationEngine;
