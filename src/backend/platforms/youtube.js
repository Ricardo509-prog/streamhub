const { google } = require('googleapis');

class YouTubePlatform {
  constructor(io) {
    this.io = io;
    this.name = 'youtube';
    this.connected = false;
    this.authenticated = false;
    this.liveChatId = null;
    this.pollInterval = null;
    this.nextPageToken = null;

    this.oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI
    );

    this.youtube = google.youtube({
      version: 'v3',
      auth: this.oauth2Client
    });
  }

  // Step 1: Get the auth URL to redirect user to
  getAuthUrl() {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/youtube.force-ssl'
      ]
    });
  }

  // Step 2: Handle the OAuth callback
  async handleCallback(code) {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    this.authenticated = true;
    console.log('[YouTube] Authenticated successfully');
    this.io.emit('platform:authenticated', { platform: 'youtube' });
  }

  // Step 3: Connect - find active live stream and start polling chat
  async connect() {
    if (!this.authenticated) throw new Error('Not authenticated. Please connect your YouTube account first.');

    // Find active live broadcast
    const broadcasts = await this.youtube.liveBroadcasts.list({
      part: ['snippet', 'status'],
      broadcastStatus: 'active',
      maxResults: 5
    });

    if (!broadcasts.data.items || broadcasts.data.items.length === 0) {
      throw new Error('No active live stream found on YouTube.');
    }

    const broadcast = broadcasts.data.items[0];
    this.liveChatId = broadcast.snippet.liveChatId;
    this.connected = true;

    console.log(`[YouTube] Connected to live chat: ${broadcast.snippet.title}`);
    this.io.emit('platform:connected', {
      platform: 'youtube',
      streamTitle: broadcast.snippet.title
    });

    // Start polling chat messages
    this._startChatPolling();
  }

  // Poll YouTube chat every 5 seconds
  _startChatPolling() {
    this.pollInterval = setInterval(async () => {
      try {
        const params = {
          part: ['snippet', 'authorDetails'],
          liveChatId: this.liveChatId,
          maxResults: 200
        };
        if (this.nextPageToken) params.pageToken = this.nextPageToken;

        const response = await this.youtube.liveChatMessages.list(params);
        this.nextPageToken = response.data.nextPageToken;

        const messages = (response.data.items || []).map(item => ({
          id: item.id,
          platform: 'youtube',
          author: item.authorDetails.displayName,
          avatar: item.authorDetails.profileImageUrl,
          message: item.snippet.displayMessage,
          timestamp: item.snippet.publishedAt,
          isModerator: item.authorDetails.isChatModerator,
          isSponsor: item.authorDetails.isChatSponsor,
          type: item.snippet.type // 'textMessageEvent', 'superChatEvent', etc.
        }));

        if (messages.length > 0) {
          this.io.emit('chat:messages', { platform: 'youtube', messages });

          // Separate super chats (donations)
          const superChats = messages.filter(m => m.type === 'superChatEvent');
          if (superChats.length > 0) {
            this.io.emit('donations:new', { platform: 'youtube', donations: superChats });
          }
        }
      } catch (err) {
        console.error('[YouTube] Chat poll error:', err.message);
      }
    }, 5000);
  }

  disconnect() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.connected = false;
    this.liveChatId = null;
    this.nextPageToken = null;
    this.io.emit('platform:disconnected', { platform: 'youtube' });
    console.log('[YouTube] Disconnected');
  }

  async setTitle(title) {
    if (!this.authenticated) throw new Error('YouTube not authenticated');
    const broadcasts = await this.youtube.liveBroadcasts.list({
      part: ['id', 'snippet'],
      broadcastStatus: 'active',
      maxResults: 1
    });
    if (!broadcasts.data.items?.length) throw new Error('No active YouTube broadcast found');
    const broadcast = broadcasts.data.items[0];
    await this.youtube.liveBroadcasts.update({
      part: ['snippet'],
      requestBody: {
        id: broadcast.id,
        snippet: { ...broadcast.snippet, title }
      }
    });
    console.log(`[YouTube] Title updated to: ${title}`);
  }

  getStatus() {
    return {
      name: this.name,
      authenticated: this.authenticated,
      connected: this.connected,
      liveChatId: this.liveChatId
    };
  }
}

module.exports = YouTubePlatform;
