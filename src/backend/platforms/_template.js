/**
 * PLATFORM TEMPLATE
 * Use this as a base when adding new platforms (Twitch, TikTok, Facebook, etc.)
 * 
 * Copy this file, rename it to the platform name, and implement each method.
 */

class PlatformTemplate {
  constructor(io) {
    this.io = io;
    this.name = 'platform_name'; // Change this
    this.connected = false;
    this.authenticated = false;
  }

  // Return the OAuth URL or auth instructions for this platform
  getAuthUrl() {
    throw new Error('Not implemented');
  }

  // Handle OAuth callback and store credentials
  async handleCallback(code) {
    throw new Error('Not implemented');
  }

  // Connect to live stream data (chat, viewers, etc.)
  async connect() {
    throw new Error('Not implemented');
  }

  // Disconnect and clean up
  disconnect() {
    this.connected = false;
    this.io.emit('platform:disconnected', { platform: this.name });
  }

  // Return current status
  getStatus() {
    return {
      name: this.name,
      authenticated: this.authenticated,
      connected: this.connected
    };
  }
}

module.exports = PlatformTemplate;
