// discord-utils.js
// Discord utility functions for message handling and posting

/**
 * Splits a string into multiple chunks of a specified maximum length, respecting line breaks.
 * @param {string} text - The text to split
 * @param {Object} options - Options for splitting
 * @param {number} options.maxLength - Maximum length of each chunk (default: 2000)
 * @returns {string[]} Array of text chunks
 */
export function splitMessage(text, { maxLength = 2000 } = {}) {
  if (text.length <= maxLength) {
    return [text];
  }
  const char = '\n';
  const chunks = [];
  const lines = text.split(char);
  let currentChunk = '';
  for (const line of lines) {
    if (line.length > maxLength) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
      }
      const lineChunks = line.match(new RegExp(`.{1,${maxLength}}`, 'g')) || [];
      chunks.push(...lineChunks);
      currentChunk = '';
      continue;
    }
    if (currentChunk.length + line.length + char.length > maxLength) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    currentChunk += line + char;
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}

/**
 * Discord manager class for handling Discord client operations
 */
export class DiscordManager {
  constructor(client, logger, config = {}) {
    this.client = client;
    this.logger = logger;
    this.isPostingEnabled = config.isPostingEnabled || false;
    this.mirrorMessage = config.mirrorMessage || false;
    this.supportChannelId = config.supportChannelId;
  }

  /**
   * Sends a message to a target channel and mirrors it to the support log channel.
   * @param {Object} targetChannel - Discord channel object
   * @param {string} content - Message content to send
   */
  async sendMirroredMessage(targetChannel, content) {
    if (!this.isPostingEnabled) {
      this.logger.info(`Posting is disabled. Skipping message to ${targetChannel.name}.`);
      if (this.supportChannelId && targetChannel.id !== this.supportChannelId) {
        try {
          const supportChannel = await this.client.channels.fetch(this.supportChannelId);
          if (supportChannel && supportChannel.isTextBased()) {
            await supportChannel.send(`(Posting is currently disabled. Skipped message to ${targetChannel.name})`);
          }
        } catch (err) {
          this.logger.error(`Failed to send disabled posting notification:`, err);
        }
      }
      return;
    }

    await targetChannel.send(content);

    // Optionally send a notification to the support channel that posting is disabled
    if (this.supportChannelId && this.mirrorMessage && targetChannel.id !== this.supportChannelId) {
      try {
        const supportChannel = await this.client.channels.fetch(this.supportChannelId);
        if (supportChannel && supportChannel.isTextBased()) {
          const mirrorContent = `[Bot message from #${targetChannel.name}]:\n>>> ${content}`;
          for (const part of splitMessage(mirrorContent)) {
            if (part) {
              await supportChannel.send(part);
            }
          }
        }
      } catch (err) {
        this.logger.error(`Failed to send mirrored message:`, err);
      }
    }
  }

  /**
   * Update posting enabled state
   * @param {boolean} enabled - Whether posting is enabled
   */
  setPostingEnabled(enabled) {
    this.isPostingEnabled = enabled;
  }

  /**
   * Update mirror message state
   * @param {boolean} enabled - Whether message mirroring is enabled
   */
  setMirrorMessage(enabled) {
    this.mirrorMessage = enabled;
  }
}

/**
 * Helper function to create a Discord manager instance
 * @param {Object} client - Discord client instance
 * @param {Object} logger - Winston logger instance
 * @param {Object} config - Configuration options
 * @returns {DiscordManager} New Discord manager instance
 */
export function createDiscordManager(client, logger, config = {}) {
  return new DiscordManager(client, logger, config);
}
