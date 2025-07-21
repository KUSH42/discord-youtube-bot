// duplicate-detector.js
// Duplicate detection utilities for YouTube videos and X/Twitter posts

/**
 * Regular expression for matching YouTube video URLs
 * Matches various YouTube URL formats and extracts the 11-character video ID
 */
export const videoUrlRegex =
  /https?:\/\/(?:(?:www\.)?youtube\.com\/(?:watch\?v=|live\/|shorts\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;

/**
 * Regular expression for matching X/Twitter post URLs
 * Matches URLs from x.com, twitter.com, vxtwitter.com, fxtwitter.com, and nitter instances
 */
export const tweetUrlRegex =
  /https?:\/\/(?:[\w-]+\.)*(?:x\.com|twitter\.com|vxtwitter\.com|fxtwitter\.com|nitter\.[^/]+)\/(?:(?:i\/web\/)?status(?:es)?|[^/]+\/status(?:es)?)\/(\d{10,})/g;
/**
 * Duplicate detector class for managing known content IDs
 */
export class DuplicateDetector {
  constructor(maxSize = 10000, cleanupInterval = 24 * 60 * 60 * 1000) {
    this.knownVideoIds = new Set();
    this.knownTweetIds = new Set();
    this.maxSize = maxSize;
    this.cleanupInterval = cleanupInterval;
    this.cleanupTimer = null;

    // Don't start periodic cleanup in test environment to prevent test timeouts
    if (process.env.NODE_ENV !== 'test') {
      this.startPeriodicCleanup();
    }
  }

  /**
   * Extract video IDs from text content
   * @param {string} content - Text content to search for video URLs
   * @returns {Array} - Array of extracted video IDs
   */
  extractVideoIds(content) {
    if (!content || typeof content !== 'string') {
      return [];
    }

    const matches = [...content.matchAll(videoUrlRegex)];
    return matches.map(match => match[1]).filter(id => id);
  }

  /**
   * Extract tweet IDs from text content
   * @param {string} content - Text content to search for tweet URLs
   * @returns {Array} - Array of extracted tweet IDs
   */
  extractTweetIds(content) {
    if (!content || typeof content !== 'string') {
      return [];
    }

    const matches = [...content.matchAll(tweetUrlRegex)];
    return matches.map(match => match[1]).filter(id => id);
  }

  /**
   * Check if a video ID is already known (duplicate) - PRIVATE METHOD
   * @private
   * @param {string} videoId - YouTube video ID to check
   * @returns {boolean} - True if the video is a duplicate
   */
  isVideoIdKnown(videoId) {
    return this.knownVideoIds.has(videoId);
  }

  /**
   * Check if a tweet ID is already known (duplicate) - PRIVATE METHOD
   * @private
   * @param {string} tweetId - X/Twitter post ID to check
   * @returns {boolean} - True if the tweet is a duplicate
   */
  isTweetIdKnown(tweetId) {
    return this.knownTweetIds.has(tweetId);
  }

  /**
   * Add a video ID to the known set
   * @param {string} videoId - YouTube video ID to add
   */
  addVideoId(videoId) {
    if (videoId && typeof videoId === 'string') {
      this.knownVideoIds.add(videoId);
      this.cleanupIfNeeded();
    }
  }

  /**
   * Add a tweet ID to the known set
   * @param {string} tweetId - X/Twitter post ID to add
   */
  addTweetId(tweetId) {
    if (tweetId && typeof tweetId === 'string') {
      this.knownTweetIds.add(tweetId);
      this.cleanupIfNeeded();
    }
  }

  /**
   * Add multiple video IDs to the known set
   * @param {Array} videoIds - Array of YouTube video IDs to add
   */
  addVideoIds(videoIds) {
    if (Array.isArray(videoIds)) {
      videoIds.forEach(id => this.addVideoId(id));
    }
  }

  /**
   * Add multiple tweet IDs to the known set
   * @param {Array} tweetIds - Array of X/Twitter post IDs to add
   */
  addTweetIds(tweetIds) {
    if (Array.isArray(tweetIds)) {
      tweetIds.forEach(id => this.addTweetId(id));
    }
  }

  /**
   * Process content and detect duplicates for both videos and tweets
   * @param {string} content - Text content to process
   * @returns {Object} - Object containing video and tweet duplicate information
   */
  processContent(content) {
    const videoIds = this.extractVideoIds(content);
    const tweetIds = this.extractTweetIds(content);

    const result = {
      videos: {
        found: videoIds,
        duplicates: videoIds.filter(id => this.isVideoIdKnown(id)),
        new: videoIds.filter(id => !this.isVideoIdKnown(id)),
      },
      tweets: {
        found: tweetIds,
        duplicates: tweetIds.filter(id => this.isTweetIdKnown(id)),
        new: tweetIds.filter(id => !this.isTweetIdKnown(id)),
      },
    };

    // Add new IDs to known sets
    result.videos.new.forEach(id => this.addVideoId(id));
    result.tweets.new.forEach(id => this.addTweetId(id));

    return result;
  }

  /**
   * Clean up memory by removing old entries if size exceeds limit
   */
  cleanupIfNeeded() {
    if (this.knownVideoIds.size > this.maxSize) {
      this.cleanupSet(this.knownVideoIds);
    }
    if (this.knownTweetIds.size > this.maxSize) {
      this.cleanupSet(this.knownTweetIds);
    }
  }

  /**
   * Clean up a Set by keeping only the most recent 80% of entries
   * @param {Set} set - Set to clean up
   */
  cleanupSet(set) {
    const array = Array.from(set);
    const keepCount = Math.floor(this.maxSize * 0.8);
    const toKeep = array.slice(-keepCount);

    set.clear();
    toKeep.forEach(item => set.add(item));
  }

  /**
   * Start periodic cleanup timer
   */
  startPeriodicCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupIfNeeded();
    }, this.cleanupInterval);
  }

  /**
   * Stop periodic cleanup timer
   */
  stopPeriodicCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Scan Discord channel history for YouTube video IDs and populate known set
   * @param {Object} discordChannel - Discord channel object to scan
   * @param {number} limit - Maximum number of messages to scan (default: 1000)
   * @returns {Promise<Object>} - Object containing scan results
   */
  async scanDiscordChannelForVideos(discordChannel, limit = 1000) {
    if (!discordChannel || typeof discordChannel.messages?.fetch !== 'function') {
      throw new Error('Invalid Discord channel provided');
    }

    const results = {
      messagesScanned: 0,
      videoIdsFound: [],
      videoIdsAdded: 0,
      errors: [],
    };

    try {
      let lastMessageId = null;
      let totalScanned = 0;
      const batchSize = 100; // Discord API limit per request

      while (totalScanned < limit) {
        const fetchOptions = { limit: Math.min(batchSize, limit - totalScanned) };
        if (lastMessageId) {
          fetchOptions.before = lastMessageId;
        }

        const messages = await discordChannel.messages.fetch(fetchOptions);

        if (messages.size === 0) {
          break; // No more messages
        }

        for (const message of messages.values()) {
          const videoIds = this.extractVideoIds(message.content);

          if (videoIds.length > 0) {
            results.videoIdsFound.push(...videoIds);

            // Add to known set
            videoIds.forEach(id => {
              if (!this.isVideoIdKnown(id)) {
                this.addVideoId(id);
                results.videoIdsAdded++;
              }
            });
          }

          lastMessageId = message.id;
          totalScanned++;
          results.messagesScanned++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      results.errors.push({
        type: 'fetch_error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }

    return results;
  }

  /**
   * Scan Discord channel history for tweet IDs and populate known set
   * @param {Object} discordChannel - Discord channel object to scan
   * @param {number} limit - Maximum number of messages to scan (default: 1000)
   * @returns {Promise<Object>} - Object containing scan results
   */
  async scanDiscordChannelForTweets(discordChannel, limit = 1000) {
    if (!discordChannel || typeof discordChannel.messages?.fetch !== 'function') {
      throw new Error('Invalid Discord channel provided');
    }

    const results = {
      messagesScanned: 0,
      tweetIdsFound: [],
      tweetIdsAdded: 0,
      errors: [],
    };

    try {
      let lastMessageId = null;
      let totalScanned = 0;
      const batchSize = 100; // Discord API limit per request

      while (totalScanned < limit) {
        const fetchOptions = { limit: Math.min(batchSize, limit - totalScanned) };
        if (lastMessageId) {
          fetchOptions.before = lastMessageId;
        }

        const messages = await discordChannel.messages.fetch(fetchOptions);

        if (messages.size === 0) {
          break; // No more messages
        }

        for (const message of messages.values()) {
          const tweetIds = this.extractTweetIds(message.content);

          if (tweetIds.length > 0) {
            results.tweetIdsFound.push(...tweetIds);

            // Add to known set
            tweetIds.forEach(id => {
              if (!this.isTweetIdKnown(id)) {
                this.addTweetId(id);
                results.tweetIdsAdded++;
              }
            });
          }

          lastMessageId = message.id;
          totalScanned++;
          results.messagesScanned++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      results.errors.push({
        type: 'fetch_error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }

    return results;
  }

  /**
   * Clear all known IDs
   */
  reset() {
    this.knownVideoIds.clear();
    this.knownTweetIds.clear();
  }

  /**
   * Check if a URL contains duplicate content (unified interface for all content types)
   * Supports YouTube video URLs and X/Twitter post URLs
   * @param {string} url - URL to check for duplicates
   * @returns {boolean} - True if URL contains known content (is a duplicate)
   */
  isDuplicate(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }

    // Check for video URLs
    const videoIds = this.extractVideoIds(url);
    if (videoIds.length > 0) {
      return videoIds.some(id => this.isVideoIdKnown(id));
    }

    // Check for tweet URLs
    const tweetIds = this.extractTweetIds(url);
    if (tweetIds.length > 0) {
      return tweetIds.some(id => this.isTweetIdKnown(id));
    }

    return false;
  }

  /**
   * Mark a URL as seen (unified interface for all content types)
   * Extracts and stores video/tweet IDs from YouTube and X/Twitter URLs
   * @param {string} url - URL to mark as seen
   */
  markAsSeen(url) {
    if (!url || typeof url !== 'string') {
      return;
    }

    // Add video IDs if found
    const videoIds = this.extractVideoIds(url);
    videoIds.forEach(id => this.addVideoId(id));

    // Add tweet IDs if found
    const tweetIds = this.extractTweetIds(url);
    tweetIds.forEach(id => this.addTweetId(id));
  }

  /**
   * Get statistics about known IDs
   * @returns {Object} - Statistics object
   */
  getStats() {
    return {
      knownVideoIds: this.knownVideoIds.size,
      knownTweetIds: this.knownTweetIds.size,
      totalKnownIds: this.knownVideoIds.size + this.knownTweetIds.size,
      maxSize: this.maxSize,
      cleanupInterval: this.cleanupInterval,
    };
  }

  /**
   * Generate content fingerprint for enhanced duplicate detection
   * @param {Object} content - Content object with title, url, publishedAt
   * @returns {string} Content fingerprint
   */
  generateContentFingerprint(content) {
    if (!content || typeof content !== 'object') {
      return null;
    }

    const normalizedTitle = this.normalizeTitle(content.title || '');
    const extractedId = this.extractContentId(content.url || '');
    const publishTime = content.publishedAt ? new Date(content.publishedAt).getTime() : 0;

    // Create fingerprint with minute precision to handle slight timing differences
    const timeSlot = Math.floor(publishTime / 60000); // minute precision

    return `${extractedId}:${normalizedTitle}:${timeSlot}`;
  }

  /**
   * Normalize title for fingerprinting
   * @param {string} title - Original title
   * @returns {string} Normalized title
   */
  normalizeTitle(title) {
    if (!title || typeof title !== 'string') {
      return '';
    }

    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 100); // Limit length
  }

  /**
   * Extract content ID from URL (video ID or tweet ID)
   * @param {string} url - Content URL
   * @returns {string} Extracted ID or empty string
   */
  extractContentId(url) {
    if (!url || typeof url !== 'string') {
      return '';
    }

    // Try to extract video ID
    const videoIds = this.extractVideoIds(url);
    if (videoIds.length > 0) {
      return videoIds[0];
    }

    // Try to extract tweet ID
    const tweetIds = this.extractTweetIds(url);
    if (tweetIds.length > 0) {
      return tweetIds[0];
    }

    return '';
  }

  /**
   * Check for duplicate using content fingerprinting
   * @param {Object} content - Content object to check
   * @param {Object} [persistentStorage] - Optional persistent storage for fingerprints
   * @returns {Promise<boolean>} True if content is duplicate
   */
  async isDuplicateWithFingerprint(content, persistentStorage = null) {
    // First check URL-based duplicates
    const urlDuplicate = this.isDuplicate(content.url);
    if (urlDuplicate) {
      return true;
    }

    // Then check fingerprint-based duplicates
    const fingerprint = this.generateContentFingerprint(content);
    if (!fingerprint) {
      return false;
    }

    // Check in-memory fingerprint cache
    if (this.contentFingerprints && this.contentFingerprints.has(fingerprint)) {
      return true;
    }

    // Check persistent storage if available
    if (persistentStorage && typeof persistentStorage.hasFingerprint === 'function') {
      try {
        const fingerprintExists = await persistentStorage.hasFingerprint(fingerprint);
        if (fingerprintExists) {
          // Cache in memory for faster future checks
          if (this.contentFingerprints) {
            this.contentFingerprints.add(fingerprint);
          }
          return true;
        }
      } catch (error) {
        // If persistent storage fails, continue with URL-only check
        console.warn('Fingerprint check failed, falling back to URL check:', error.message);
      }
    }

    return false;
  }

  /**
   * Mark content as seen with fingerprint
   * @param {Object} content - Content object to mark
   * @param {Object} [persistentStorage] - Optional persistent storage for fingerprints
   */
  async markAsSeenWithFingerprint(content, persistentStorage = null) {
    // Mark URL as seen using existing method
    if (content.url) {
      this.markAsSeen(content.url);
    }

    // Generate and store fingerprint
    const fingerprint = this.generateContentFingerprint(content);
    if (!fingerprint) {
      return;
    }

    // Store in memory cache
    if (!this.contentFingerprints) {
      this.contentFingerprints = new Set();
    }
    this.contentFingerprints.add(fingerprint);

    // Store in persistent storage if available
    if (persistentStorage && typeof persistentStorage.storeFingerprint === 'function') {
      try {
        await persistentStorage.storeFingerprint(fingerprint, {
          url: content.url,
          title: content.title,
          publishedAt: content.publishedAt,
          contentId: this.extractContentId(content.url),
          type: this.determineContentType(content.url),
        });
      } catch (error) {
        console.warn('Failed to store fingerprint persistently:', error.message);
      }
    }

    // Clean up memory if it gets too large
    if (this.contentFingerprints.size > (this.maxSize || 10000)) {
      this.cleanupFingerprints();
    }
  }

  /**
   * Determine content type from URL
   * @param {string} url - Content URL
   * @returns {string} Content type
   */
  determineContentType(url) {
    if (!url || typeof url !== 'string') {
      return 'unknown';
    }

    if (this.extractVideoIds(url).length > 0) {
      return 'youtube_video';
    }

    if (this.extractTweetIds(url).length > 0) {
      return 'x_tweet';
    }

    return 'unknown';
  }

  /**
   * Normalize URL for consistent duplicate detection
   * @param {string} url - Original URL
   * @returns {string} Normalized URL
   */
  normalizeUrl(url) {
    if (!url || typeof url !== 'string') {
      return url;
    }

    const videoIds = this.extractVideoIds(url);
    if (videoIds.length > 0) {
      return `https://www.youtube.com/watch?v=${videoIds[0]}`;
    }

    const tweetIds = this.extractTweetIds(url);
    if (tweetIds.length > 0) {
      // Normalize to x.com format
      return `https://x.com/i/status/${tweetIds[0]}`;
    }

    return url;
  }

  /**
   * Clean up memory-based fingerprints
   */
  cleanupFingerprints() {
    if (!this.contentFingerprints || this.contentFingerprints.size === 0) {
      return;
    }

    const fingerprintArray = Array.from(this.contentFingerprints);
    const keepCount = Math.floor((this.maxSize || 10000) * 0.8);
    const toKeep = fingerprintArray.slice(-keepCount);

    this.contentFingerprints.clear();
    toKeep.forEach(fingerprint => this.contentFingerprints.add(fingerprint));
  }

  /**
   * Enhanced process content with fingerprinting
   * @param {string|Object} content - Content to process (string or object with url/title/publishedAt)
   * @param {Object} [persistentStorage] - Optional persistent storage
   * @returns {Promise<Object>} Processing result with fingerprint information
   */
  async processContentWithFingerprint(content, persistentStorage = null) {
    let contentObj = content;

    // Handle string input (backwards compatibility)
    if (typeof content === 'string') {
      contentObj = { url: content };
    }

    // Check URL-based duplicates without marking as seen yet
    const videoIds = this.extractVideoIds(contentObj.url || '');
    const tweetIds = this.extractTweetIds(contentObj.url || '');

    const urlBasedResult = {
      videos: {
        found: videoIds,
        duplicates: videoIds.filter(id => this.isVideoIdKnown(id)),
        new: videoIds.filter(id => !this.isVideoIdKnown(id)),
      },
      tweets: {
        found: tweetIds,
        duplicates: tweetIds.filter(id => this.isTweetIdKnown(id)),
        new: tweetIds.filter(id => !this.isTweetIdKnown(id)),
      },
    };

    // Fingerprint-based checking
    let fingerprintDuplicate = false;
    let fingerprint = null;

    if (contentObj.title || contentObj.publishedAt) {
      fingerprint = this.generateContentFingerprint(contentObj);
      fingerprintDuplicate = await this.isDuplicateWithFingerprint(contentObj, persistentStorage);
    }

    // Mark as seen only if not a duplicate by either method
    const isUrlDuplicate = urlBasedResult.videos.duplicates.length > 0 || urlBasedResult.tweets.duplicates.length > 0;

    if (!fingerprintDuplicate && !isUrlDuplicate) {
      // Mark URL-based IDs as seen
      urlBasedResult.videos.new.forEach(id => this.addVideoId(id));
      urlBasedResult.tweets.new.forEach(id => this.addTweetId(id));

      // Mark fingerprint as seen if available
      if (fingerprint) {
        await this.markAsSeenWithFingerprint(contentObj, persistentStorage);
      }
    }

    return {
      ...urlBasedResult,
      fingerprint: {
        generated: fingerprint,
        isDuplicate: fingerprintDuplicate,
        enabled: !!fingerprint,
      },
    };
  }

  /**
   * Get enhanced statistics including fingerprint information
   * @returns {Object} Enhanced statistics object
   */
  getEnhancedStats() {
    const baseStats = this.getStats();

    return {
      ...baseStats,
      fingerprints: this.contentFingerprints ? this.contentFingerprints.size : 0,
      fingerprintingEnabled: !!this.contentFingerprints,
    };
  }

  /**
   * Reset enhanced duplicate detector
   */
  resetWithFingerprints() {
    this.reset();
    if (this.contentFingerprints) {
      this.contentFingerprints.clear();
    }
  }

  /**
   * Destroy the duplicate detector and clean up resources
   */
  destroy() {
    this.stopPeriodicCleanup();
    this.reset();
    if (this.contentFingerprints) {
      this.contentFingerprints.clear();
    }
  }
}

/**
 * Utility function to create a new duplicate detector instance
 * @param {Object} options - Configuration options
 * @returns {DuplicateDetector} - New duplicate detector instance
 */
export function createDuplicateDetector(options = {}) {
  return new DuplicateDetector(options.maxSize, options.cleanupInterval);
}
