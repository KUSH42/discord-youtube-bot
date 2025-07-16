/**
 * Abstract Discord service interface
 * Defines the contract for Discord operations that can be mocked in tests
 */
export class DiscordService {
  /**
   * Login to Discord with bot token
   * @param {string} token - Discord bot token
   * @returns {Promise<void>}
   */
  async login(token) {
    throw new Error('Abstract method: login must be implemented');
  }
  
  /**
   * Send a message to a Discord channel
   * @param {string} channelId - Discord channel ID
   * @param {string|Object} content - Message content (string or embed object)
   * @returns {Promise<Object>} Message object
   */
  async sendMessage(channelId, content) {
    throw new Error('Abstract method: sendMessage must be implemented');
  }
  
  /**
   * Fetch a Discord channel
   * @param {string} channelId - Discord channel ID
   * @returns {Promise<Object>} Channel object
   */
  async fetchChannel(channelId) {
    throw new Error('Abstract method: fetchChannel must be implemented');
  }
  
  /**
   * Fetch a Discord guild
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<Object>} Guild object
   */
  async fetchGuild(guildId) {
    throw new Error('Abstract method: fetchGuild must be implemented');
  }
  
  /**
   * Register a message event handler
   * @param {Function} handler - Message handler function
   * @returns {Function} Unregister function
   */
  onMessage(handler) {
    throw new Error('Abstract method: onMessage must be implemented');
  }
  
  /**
   * Register a ready event handler
   * @param {Function} handler - Ready handler function
   * @returns {Function} Unregister function
   */
  onReady(handler) {
    throw new Error('Abstract method: onReady must be implemented');
  }
  
  /**
   * Register an error event handler
   * @param {Function} handler - Error handler function
   * @returns {Function} Unregister function
   */
  onError(handler) {
    throw new Error('Abstract method: onError must be implemented');
  }
  
  /**
   * Get current user information
   * @returns {Promise<Object>} User object
   */
  async getCurrentUser() {
    throw new Error('Abstract method: getCurrentUser must be implemented');
  }
  
  /**
   * Check if the bot is logged in and ready
   * @returns {boolean} True if ready
   */
  isReady() {
    throw new Error('Abstract method: isReady must be implemented');
  }
  
  /**
   * Get bot latency/ping
   * @returns {number} Latency in milliseconds
   */
  getLatency() {
    throw new Error('Abstract method: getLatency must be implemented');
  }
  
  /**
   * Destroy the Discord client connection
   * @returns {Promise<void>}
   */
  async destroy() {
    throw new Error('Abstract method: destroy must be implemented');
  }
  
  /**
   * Edit a message
   * @param {string} channelId - Discord channel ID
   * @param {string} messageId - Message ID to edit
   * @param {string|Object} newContent - New message content
   * @returns {Promise<Object>} Updated message object
   */
  async editMessage(channelId, messageId, newContent) {
    throw new Error('Abstract method: editMessage must be implemented');
  }
  
  /**
   * Delete a message
   * @param {string} channelId - Discord channel ID
   * @param {string} messageId - Message ID to delete
   * @returns {Promise<void>}
   */
  async deleteMessage(channelId, messageId) {
    throw new Error('Abstract method: deleteMessage must be implemented');
  }
  
  /**
   * Add a reaction to a message
   * @param {string} channelId - Discord channel ID
   * @param {string} messageId - Message ID
   * @param {string} emoji - Emoji to add
   * @returns {Promise<void>}
   */
  async addReaction(channelId, messageId, emoji) {
    throw new Error('Abstract method: addReaction must be implemented');
  }
  
  /**
   * Get user from guild
   * @param {string} guildId - Guild ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Guild member object
   */
  async getGuildMember(guildId, userId) {
    throw new Error('Abstract method: getGuildMember must be implemented');
  }
  
  /**
   * Check if user has permission in channel
   * @param {string} channelId - Channel ID
   * @param {string} userId - User ID
   * @param {string} permission - Permission to check
   * @returns {Promise<boolean>} True if user has permission
   */
  async hasPermission(channelId, userId, permission) {
    throw new Error('Abstract method: hasPermission must be implemented');
  }
  
  /**
   * Set bot presence/status
   * @param {Object} presence - Presence object
   * @returns {Promise<void>}
   */
  async setPresence(presence) {
    throw new Error('Abstract method: setPresence must be implemented');
  }
  
  /**
   * Dispose of resources
   * @returns {Promise<void>}
   */
  async dispose() {
    await this.destroy();
  }
}