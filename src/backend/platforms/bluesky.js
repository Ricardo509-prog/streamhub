const { BskyAgent } = require('@atproto/api');

/**
 * Bluesky Platform Adapter
 * Uses @atproto/api to monitor notifications and mentions
 * Polls every 15 seconds for new mentions/replies
 */
class BlueskyPlatform {
  constructor(io) {
    this.io = io;
    this.name = 'bluesky';
    this.connected = false;
    this.authenticated = false;
    this.agent = new BskyAgent({ service: 'https://bsky.social' });
    this.pollInterval = null;
    this.lastSeenAt = null;
    this.handle = process.env.BLUESKY_HANDLE || '';
    this.appPassword = process.env.BLUESKY_APP_PASSWORD || '';
  }

  getAuthUrl() { return 'https://bsky.app/settings/app-passwords'; }

  async handleCallback() {}

  async connect() {
    if (!this.handle || !this.appPassword) {
      throw new Error('Missing BLUESKY_HANDLE or BLUESKY_APP_PASSWORD in .env');
    }

    // Login to Bluesky
    await this.agent.login({
      identifier: this.handle,
      password: this.appPassword
    });

    this.authenticated = true;
    this.connected = true;
    this.lastSeenAt = new Date().toISOString();

    console.log(`[Bluesky] Logged in as ${this.handle}`);
    this.io.emit('platform:connected', {
      platform: 'bluesky',
      streamTitle: `@${this.handle} on Bluesky`
    });

    // Start polling notifications
    this._startPolling();
  }

  _startPolling() {
    this.pollInterval = setInterval(async () => {
      try {
        await this._fetchNotifications();
      } catch (err) {
        console.error('[Bluesky] Poll error:', err.message);
      }
    }, 15000); // Poll every 15 seconds

    // Also fetch immediately
    this._fetchNotifications();
  }

  async _fetchNotifications() {
    const response = await this.agent.listNotifications({ limit: 20 });
    const notifications = response.data.notifications || [];

    // Filter to only new ones since last check
    const newNotifs = notifications.filter(n =>
      !n.isRead || new Date(n.indexedAt) > new Date(this.lastSeenAt)
    );

    if (newNotifs.length > 0) {
      this.lastSeenAt = new Date().toISOString();
      await this.agent.updateSeenNotifications();
    }

    for (const notif of newNotifs) {
      if (notif.reason === 'mention' || notif.reason === 'reply') {
        const record = notif.record;
        const msg = {
          id: notif.uri,
          platform: 'bluesky',
          author: notif.author.displayName || notif.author.handle,
          username: notif.author.handle,
          avatar: notif.author.avatar || null,
          message: record?.text || '',
          timestamp: notif.indexedAt,
          type: notif.reason, // 'mention' or 'reply'
          url: `https://bsky.app/profile/${notif.author.handle}`
        };

        this.io.emit('chat:messages', { platform: 'bluesky', messages: [msg] });
      }

      if (notif.reason === 'like' || notif.reason === 'repost') {
        this.io.emit('alert:new', {
          platform: 'bluesky',
          type: notif.reason,
          author: notif.author.displayName || notif.author.handle,
          message: `${notif.author.handle} ${notif.reason}d your post`
        });
      }
    }
  }

  // Post a reply to Bluesky
  async sendMessage(text) {
    if (!this.agent.session) throw new Error('Not authenticated to Bluesky');
    await this.agent.post({ text });
  }

  disconnect() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.connected = false;
    this.io.emit('platform:disconnected', { platform: 'bluesky' });
    console.log('[Bluesky] Disconnected');
  }

  getStatus() {
    return {
      name: this.name,
      authenticated: this.authenticated,
      connected: this.connected,
      handle: this.handle
    };
  }
}

module.exports = BlueskyPlatform;
