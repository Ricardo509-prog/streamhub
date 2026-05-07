const axios = require('axios');

class FacebookPlatform {
  constructor(io) {
    this.io = io;
    this.name = 'facebook';
    this.connected = false;
    this.authenticated = false;
    this.accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '';
    this.pageId = process.env.FACEBOOK_PAGE_ID || '';
    this.appId = process.env.FACEBOOK_APP_ID || '';
    this.appSecret = process.env.FACEBOOK_APP_SECRET || '';
    this.redirectUri = process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:3001/auth/facebook/callback';
    this.liveVideoId = null;
    this.pollInterval = null;
    this.lastMessageTime = null;
    this.seenMessageIds = new Set();

    if (this.accessToken && this.pageId) this.authenticated = true;
  }

  getAuthUrl() {
    if (!this.appId) return null;
    const scopes = 'pages_show_list,pages_read_engagement,pages_manage_posts,live_video';
    return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${this.appId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&scope=${scopes}&response_type=code`;
  }

  async handleCallback(code) {
    const tokenRes = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id: this.appId,
        client_secret: this.appSecret,
        redirect_uri: this.redirectUri,
        code
      }
    });

    const userToken = tokenRes.data.access_token;

    // Exchange for long-lived page token
    const pagesRes = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
      params: { access_token: userToken }
    });

    const page = pagesRes.data.data?.[0];
    if (!page) throw new Error('No Facebook pages found for this account');

    this.accessToken = page.access_token;
    this.pageId = page.id;
    this.authenticated = true;

    this.io.emit('platform:authenticated', { platform: 'facebook' });
    console.log(`[Facebook] Authenticated as page: ${page.name}`);
  }

  async connect() {
    if (!this.accessToken) throw new Error('Facebook not authenticated. Click Auth first.');

    // Find the current live video
    const liveRes = await axios.get(`https://graph.facebook.com/v18.0/${this.pageId}/live_videos`, {
      params: {
        status: 'LIVE',
        access_token: this.accessToken,
        fields: 'id,title,status'
      }
    });

    const liveVideos = liveRes.data.data || [];
    if (liveVideos.length === 0) throw new Error('No active Facebook live stream found. Start a live stream first.');

    this.liveVideoId = liveVideos[0].id;
    const title = liveVideos[0].title || 'Facebook Live';

    this.connected = true;
    this.lastMessageTime = new Date().toISOString();

    console.log(`[Facebook] Connected to live video ${this.liveVideoId}: ${title}`);
    this.io.emit('platform:connected', { platform: 'facebook', streamTitle: title });

    this._startPolling();
  }

  _startPolling() {
    this.pollInterval = setInterval(() => this._fetchComments(), 5000);
    this._fetchComments();
  }

  async _fetchComments() {
    if (!this.liveVideoId || !this.connected) return;

    try {
      const res = await axios.get(`https://graph.facebook.com/v18.0/${this.liveVideoId}/comments`, {
        params: {
          access_token: this.accessToken,
          fields: 'id,message,from,created_time',
          order: 'chronological',
          limit: 25
        }
      });

      const comments = res.data.data || [];
      const newMessages = [];

      for (const comment of comments) {
        if (this.seenMessageIds.has(comment.id)) continue;
        this.seenMessageIds.add(comment.id);

        if (this.seenMessageIds.size > 1000) {
          const firstKey = this.seenMessageIds.values().next().value;
          this.seenMessageIds.delete(firstKey);
        }

        newMessages.push({
          id: comment.id,
          platform: 'facebook',
          author: comment.from?.name || 'Unknown',
          username: comment.from?.id || '',
          avatar: comment.from?.id
            ? `https://graph.facebook.com/${comment.from.id}/picture?type=small`
            : null,
          message: comment.message,
          timestamp: comment.created_time,
          type: 'chat'
        });
      }

      if (newMessages.length > 0) {
        this.io.emit('chat:messages', { platform: 'facebook', messages: newMessages });
      }
    } catch (err) {
      if (err.response?.data?.error?.code === 100) {
        // Live stream ended
        console.log('[Facebook] Live stream ended');
        this.disconnect();
      } else {
        console.error('[Facebook] Poll error:', err.message);
      }
    }
  }

  async sendMessage(text) {
    if (!this.liveVideoId || !this.connected) throw new Error('Not connected to a live stream');
    await axios.post(
      `https://graph.facebook.com/v18.0/${this.liveVideoId}/comments`,
      { message: text },
      { params: { access_token: this.accessToken } }
    );
  }

  disconnect() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.connected = false;
    this.liveVideoId = null;
    this.seenMessageIds.clear();
    this.io.emit('platform:disconnected', { platform: 'facebook' });
    console.log('[Facebook] Disconnected');
  }

  getStatus() {
    return {
      name: this.name,
      authenticated: this.authenticated,
      connected: this.connected,
      pageId: this.pageId
    };
  }
}

module.exports = FacebookPlatform;
