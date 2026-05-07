const axios = require('axios');

/**
 * Twitter/X Platform Adapter
 * Uses Twitter API v2 filtered stream to monitor mentions
 * and search results in real time.
 * 
 * Requirements: Twitter Developer account with Elevated access
 * Get token at: https://developer.twitter.com/en/portal/dashboard
 */
class TwitterPlatform {
  constructor(io) {
    this.io = io;
    this.name = 'twitter';
    this.connected = false;
    this.authenticated = !!(process.env.TWITTER_BEARER_TOKEN);
    this.streamRequest = null;
    this.username = process.env.TWITTER_USERNAME || '';
    this.bearerToken = process.env.TWITTER_BEARER_TOKEN || '';
    this.reconnectTimeout = null;
    this.reconnectDelay = 5000;
  }

  getAuthUrl() { return null; } // Token-based auth via .env

  async handleCallback() {}

  async connect() {
    if (!this.bearerToken) {
      throw new Error('Missing TWITTER_BEARER_TOKEN in .env');
    }

    // Set up filtered stream rules to track mentions of your username
    await this._setupStreamRules();

    // Connect to filtered stream
    await this._connectToStream();
  }

  async _setupStreamRules() {
    const headers = { Authorization: `Bearer ${this.bearerToken}` };

    // Delete existing rules first
    const existing = await axios.get(
      'https://api.twitter.com/2/tweets/search/stream/rules',
      { headers }
    );

    if (existing.data.data?.length > 0) {
      const ids = existing.data.data.map(r => r.id);
      await axios.post(
        'https://api.twitter.com/2/tweets/search/stream/rules',
        { delete: { ids } },
        { headers }
      );
    }

    // Add rules to track your username mentions
    const rules = [
      { value: `@${this.username}`, tag: 'mentions' },
      { value: `#${this.username}`, tag: 'hashtag' }
    ];

    await axios.post(
      'https://api.twitter.com/2/tweets/search/stream/rules',
      { add: rules },
      { headers }
    );

    console.log(`[Twitter] Stream rules set for @${this.username}`);
  }

  async _connectToStream() {
    const params = new URLSearchParams({
      'tweet.fields': 'created_at,author_id,text,public_metrics',
      'user.fields': 'name,username,profile_image_url',
      'expansions': 'author_id'
    });

    const response = await axios.get(
      `https://api.twitter.com/2/tweets/search/stream?${params}`,
      {
        headers: { Authorization: `Bearer ${this.bearerToken}` },
        responseType: 'stream',
        timeout: 0
      }
    );

    this.streamRequest = response;
    this.connected = true;
    this.reconnectDelay = 5000; // reset on success

    console.log(`[Twitter] Connected to filtered stream for @${this.username}`);
    this.io.emit('platform:connected', {
      platform: 'twitter',
      streamTitle: `@${this.username} mentions`
    });

    let buffer = '';

    response.data.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const data = JSON.parse(trimmed);
          if (data.data) this._handleTweet(data);
        } catch (e) {
          // Heartbeat or non-JSON line — ignore
        }
      }
    });

    response.data.on('error', (err) => {
      console.error('[Twitter] Stream error:', err.message);
      this._scheduleReconnect();
    });

    response.data.on('end', () => {
      console.log('[Twitter] Stream ended, reconnecting...');
      this._scheduleReconnect();
    });
  }

  _handleTweet(data) {
    const tweet = data.data;
    const users = data.includes?.users || [];
    const author = users.find(u => u.id === tweet.author_id);

    const msg = {
      id: tweet.id,
      platform: 'twitter',
      author: author?.name || 'Unknown',
      username: author?.username || '',
      avatar: author?.profile_image_url || null,
      message: tweet.text,
      timestamp: tweet.created_at || new Date().toISOString(),
      type: 'tweet',
      url: `https://twitter.com/${author?.username}/status/${tweet.id}`
    };

    console.log(`[Twitter] Tweet from @${msg.username}: ${msg.message}`);
    this.io.emit('chat:messages', { platform: 'twitter', messages: [msg] });
  }

  _scheduleReconnect() {
    if (!this.connected) return;
    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this._connectToStream();
      } catch (err) {
        console.error('[Twitter] Reconnect failed:', err.message);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60000);
        this._scheduleReconnect();
      }
    }, this.reconnectDelay);
  }

  disconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.streamRequest?.data) {
      this.streamRequest.data.destroy();
      this.streamRequest = null;
    }
    this.connected = false;
    this.io.emit('platform:disconnected', { platform: 'twitter' });
    console.log('[Twitter] Disconnected');
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

module.exports = TwitterPlatform;
