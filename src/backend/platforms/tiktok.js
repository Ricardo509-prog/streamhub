const { WebcastPushConnection } = require('tiktok-live-connector');

class TikTokPlatform {
  constructor(io) {
    this.io = io;
    this.name = 'tiktok';
    this.connected = false;
    this.authenticated = !!(process.env.TIKTOK_USERNAME);
    this.connection = null;
    this.username = process.env.TIKTOK_USERNAME || '';
  }

  getAuthUrl() { return null; }
  async handleCallback() {}

  async connect() {
    if (!this.username) throw new Error('Missing TIKTOK_USERNAME in .env');

    this.connection = new WebcastPushConnection(this.username, {
      processInitialData: true,
      enableExtendedGiftInfo: true,
      enableWebsocketUpgrade: true,
      requestPollingIntervalMs: 2000
    });

    this.connection.on('chat', (data) => {
      const msg = {
        id: data.msgId?.toString() || Date.now().toString(),
        platform: 'tiktok',
        author: data.nickname || data.uniqueId || 'Unknown',
        username: data.uniqueId || '',
        avatar: data.profilePictureUrl || null,
        message: data.comment,
        timestamp: new Date().toISOString(),
        type: 'chat'
      };
      this.io.emit('chat:messages', { platform: 'tiktok', messages: [msg] });
    });

    this.connection.on('gift', (data) => {
      if (data.giftType === 1 && !data.repeatEnd) return;
      const donation = {
        author: data.nickname || data.uniqueId,
        type: 'gift',
        giftCount: data.repeatCount || 1,
        giftName: data.giftName || 'Gift',
        message: '',
        timestamp: new Date().toISOString()
      };
      this.io.emit('donations:new', { platform: 'tiktok', donations: [donation] });
      this.io.emit('alert:show', { platform: 'tiktok', type: 'gift', data: { author: donation.author, message: `${donation.giftCount}x ${donation.giftName}` }, duration: 5000 });
    });

    this.connection.on('like', (data) => {
      console.log(`[TikTok] ${data.nickname} sent ${data.likeCount} likes`);
    });

    this.connection.on('roomUser', (data) => {
      this.io.emit('stats:update', { viewers: data.viewerCount });
    });

    this.connection.on('error', (err) => {
      console.error('[TikTok] Error:', err.message);
    });

    this.connection.on('disconnect', () => {
      if (this.connected) {
        console.log('[TikTok] Connection dropped, reconnecting...');
        setTimeout(() => this.connect().catch(console.error), 5000);
      }
    });

    const state = await this.connection.connect();
    this.connected = true;

    console.log(`[TikTok] Connected to @${this.username}`);
    this.io.emit('platform:connected', {
      platform: 'tiktok',
      streamTitle: `@${this.username}`,
      viewers: state.viewerCount
    });
  }

  async sendMessage() {
    throw new Error('TikTok does not support sending chat messages via API');
  }

  disconnect() {
    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
    }
    this.connected = false;
    this.io.emit('platform:disconnected', { platform: 'tiktok' });
    console.log('[TikTok] Disconnected');
  }

  getStatus() {
    return {
      name: this.name,
      authenticated: this.authenticated,
      connected: this.connected,
      username: this.username
    };
  }
}

module.exports = TikTokPlatform;
