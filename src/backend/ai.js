const Anthropic = require('@anthropic-ai/sdk');

/**
 * AI Chat Engine
 * Powers intelligent, context-aware responses to stream chat
 * Uses Claude claude-sonnet-4-20250514 for fast, high-quality responses
 */
class AIChatEngine {
  constructor(io) {
    this.io = io;
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.enabled = !!(process.env.ANTHROPIC_API_KEY);
    this.persona = process.env.AI_PERSONA || 'You are a friendly streaming assistant. Keep responses short and engaging.';
    this.autoRespondInterval = parseInt(process.env.AI_AUTO_RESPOND_INTERVAL || '0');
    this.messageCount = 0;
    this.recentMessages = []; // Rolling context window
    this.maxContext = 20;
    this.isResponding = false;

    console.log(`[AI] Engine initialized. Auto-respond every ${this.autoRespondInterval || 'N/A'} messages.`);
  }

  // Add a message to context (called by server for every chat message)
  addToContext(platform, message) {
    this.recentMessages.push({
      platform,
      author: message.author,
      text: message.message,
      time: new Date().toISOString()
    });

    // Keep only last N messages
    if (this.recentMessages.length > this.maxContext) {
      this.recentMessages.shift();
    }

    this.messageCount++;

    // Auto-respond based on interval
    if (this.autoRespondInterval > 0 && this.messageCount % this.autoRespondInterval === 0) {
      this.generateChatSummary(platform);
    }
  }

  // Generate a response to a specific message
  async respondToMessage(platform, message, targetPlatform) {
    if (!this.enabled) throw new Error('Anthropic API key not set in .env');
    if (this.isResponding) return;

    this.isResponding = true;

    try {
      const contextSummary = this.recentMessages
        .slice(-10)
        .map(m => `[${m.platform}] ${m.author}: ${m.text}`)
        .join('\n');

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        system: `${this.persona}\n\nYou are responding in a live stream chat. Be concise (1-2 sentences max). Current stream chat context:\n${contextSummary}`,
        messages: [
          {
            role: 'user',
            content: `Respond to this chat message from ${message.author} on ${platform}: "${message.message}"`
          }
        ]
      });

      const aiResponse = response.content[0].text;

      this.io.emit('ai:response', {
        platform: targetPlatform || platform,
        message: aiResponse,
        replyTo: message.author,
        originalMessage: message.message
      });

      return aiResponse;
    } catch (err) {
      console.error('[AI] Response error:', err.message);
      throw err;
    } finally {
      this.isResponding = false;
    }
  }

  // Generate a chat summary / engagement post
  async generateChatSummary(platform) {
    if (!this.enabled || this.isResponding) return;
    if (this.recentMessages.length < 5) return;

    this.isResponding = true;

    try {
      const contextSummary = this.recentMessages
        .map(m => `[${m.platform}] ${m.author}: ${m.text}`)
        .join('\n');

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 120,
        system: this.persona,
        messages: [
          {
            role: 'user',
            content: `Based on this recent stream chat, generate ONE engaging message to send to the audience (keep it under 100 chars, upbeat):\n\n${contextSummary}`
          }
        ]
      });

      const aiMessage = response.content[0].text;

      this.io.emit('ai:auto-message', {
        platform,
        message: aiMessage
      });

      console.log(`[AI] Auto-generated message: ${aiMessage}`);
      return aiMessage;
    } catch (err) {
      console.error('[AI] Summary error:', err.message);
    } finally {
      this.isResponding = false;
    }
  }

  // Generate a response to a custom prompt from the dashboard
  async generateCustom(prompt) {
    if (!this.enabled) throw new Error('Anthropic API key not set');

    const contextSummary = this.recentMessages
      .slice(-10)
      .map(m => `[${m.platform}] ${m.author}: ${m.text}`)
      .join('\n');

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: `${this.persona}\n\nRecent chat context:\n${contextSummary}`,
      messages: [{ role: 'user', content: prompt }]
    });

    return response.content[0].text;
  }

  // Generate a clip highlight title suggestion
  async suggestClipTitle(description) {
    if (!this.enabled) throw new Error('Anthropic API key not set');

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: `Suggest 3 catchy, viral-worthy clip titles for this stream moment: "${description}". Format as a numbered list.`
        }
      ]
    });

    return response.content[0].text;
  }

  async generateStreamSummary() {
    if (!this.enabled) throw new Error('Anthropic API key not set');
    if (this.recentMessages.length < 3) throw new Error('Not enough chat history yet');

    const context = this.recentMessages
      .map(m => `[${m.platform}] ${m.author}: ${m.text}`)
      .join('\n');

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Based on this stream chat history, write a short highlights summary with 3-5 bullet points covering the most notable or exciting moments:\n\n${context}`
      }]
    });

    return response.content[0].text;
  }

  getStatus() {
    return {
      enabled: this.enabled,
      messageCount: this.messageCount,
      contextSize: this.recentMessages.length,
      autoRespondInterval: this.autoRespondInterval
    };
  }
}

module.exports = AIChatEngine;
