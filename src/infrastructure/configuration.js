import {
  validateEnvironmentVariables,
  validateDiscordChannelId,
  validateYouTubeChannelId,
} from '../config-validator.js';

/**
 * Centralized configuration management with validation
 */
export class Configuration {
  constructor(source = process.env) {
    this.env = source;
    this.validated = this.validateAll();
  }

  /**
   * Get configuration value with optional default
   */
  get(key, defaultValue = undefined) {
    const value = this.env[key];
    return value !== undefined ? value : defaultValue;
  }

  /**
   * Get required configuration value, throws if missing
   */
  getRequired(key) {
    const value = this.env[key];
    if (value === undefined) {
      throw new Error(`Required configuration key '${key}' is missing`);
    }
    return value;
  }

  /**
   * Get numeric configuration value
   */
  getNumber(key, defaultValue = undefined) {
    const value = this.get(key, defaultValue);
    if (value === undefined) return undefined;

    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      throw new Error(`Configuration key '${key}' must be a valid number, got: ${value}`);
    }
    return parsed;
  }

  /**
   * Get boolean configuration value
   */
  getBoolean(key, defaultValue = undefined) {
    const value = this.get(key);
    if (value === undefined) return defaultValue;

    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;

    throw new Error(`Configuration key '${key}' must be a boolean value, got: ${value}`);
  }

  /**
   * Validate all required configuration
   */
  validateAll() {
    try {
      // Use existing validation from config-validator
      const validationResult = validateEnvironmentVariables(this.env);

      // Additional specific validations
      this.validateDiscordConfig();
      this.validateYouTubeConfig();
      this.validateXConfig();

      return validationResult;
    } catch (error) {
      throw new Error(`Configuration validation failed: ${error.message}`);
    }
  }

  /**
   * Validate Discord-specific configuration
   */
  validateDiscordConfig() {
    const token = this.get('DISCORD_BOT_TOKEN');
    if (token && !token.startsWith('Bot ') && !token.match(/^[A-Za-z0-9._-]{59}$/)) {
      console.warn('Discord token format may be invalid');
    }

    const supportChannelId = this.get('DISCORD_SUPPORT_CHANNEL_ID');
    if (supportChannelId && !validateDiscordChannelId(supportChannelId)) {
      throw new Error('Invalid Discord support channel ID format');
    }

    const youtubeChannelId = this.get('DISCORD_YOUTUBE_CHANNEL_ID');
    if (youtubeChannelId && !validateDiscordChannelId(youtubeChannelId)) {
      throw new Error('Invalid Discord YouTube channel ID format');
    }

    const xChannelId = this.get('DISCORD_X_CHANNEL_ID');
    if (xChannelId && !validateDiscordChannelId(xChannelId)) {
      throw new Error('Invalid Discord X channel ID format');
    }
  }

  /**
   * Validate YouTube-specific configuration
   */
  validateYouTubeConfig() {
    const channelId = this.get('YOUTUBE_CHANNEL_ID');
    if (channelId && !validateYouTubeChannelId(channelId)) {
      throw new Error('Invalid YouTube channel ID format');
    }

    const apiKey = this.get('YOUTUBE_API_KEY');
    if (apiKey && apiKey.length < 30) {
      console.warn('YouTube API key seems too short');
    }
  }

  /**
   * Validate X (Twitter) configuration
   */
  validateXConfig() {
    const xUser = this.get('X_USER_HANDLE');
    if (xUser && (xUser.startsWith('@') || xUser.includes(' '))) {
      throw new Error('X_USER_HANDLE should be username without @ symbol and no spaces');
    }

    const interval = this.getNumber('X_QUERY_INTERVALL_MIN');
    if (interval !== undefined && interval < 60000) {
      console.warn('X query interval less than 1 minute may cause rate limiting');
    }
  }

  /**
   * Get all configuration as object (for debugging)
   */
  getAllConfig(includeSecrets = false) {
    const config = {};
    const secretKeys = ['DISCORD_BOT_TOKEN', 'YOUTUBE_API_KEY', 'WEBHOOK_SECRET'];

    for (const [key, value] of Object.entries(this.env)) {
      if (
        key.startsWith('DISCORD_') ||
        key.startsWith('YOUTUBE_') ||
        key.startsWith('X_') ||
        key.startsWith('WEBHOOK_')
      ) {
        if (includeSecrets || !secretKeys.includes(key)) {
          config[key] = value;
        } else if (secretKeys.includes(key)) {
          config[key] = '[REDACTED]';
        }
      }
    }

    return config;
  }

  /**
   * Check if configuration is valid
   */
  isValid() {
    try {
      this.validateAll();
      return true;
    } catch {
      return false;
    }
  }
}
