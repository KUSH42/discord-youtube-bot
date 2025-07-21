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
 * Enhanced Duplicate Detector
 * Implements persistent, reliable duplicate detection with content fingerprinting
 */
export class DuplicateDetector {
  constructor(persistentStorage, logger) {
    if (!persistentStorage) {
      throw new Error('PersistentStorage is a required dependency for DuplicateDetector.');
    }
    this.storage = persistentStorage;
    this.logger = logger;
    // In-memory cache for performance
    this.fingerprintCache = new Set();
    this.urlCache = new Set();
  }

  /**
   * Generates a unique "fingerprint" for a piece of content.
   * This is more reliable than URLs, which can sometimes change.
   * @param {object} content - The content object.
   * @returns {string|null} A unique fingerprint string or null if not possible.
   * @private
   */
  _generateContentFingerprint(content) {
    if (!content || typeof content !== 'object') {
      return null;
    }
    const normalizedTitle = this._normalizeTitle(content.title || '');
    const contentId = this._extractContentId(content.url || '');
    const publishTime = content.publishedAt ? new Date(content.publishedAt).getTime() : 0;
    const timeSlot = Math.floor(publishTime / 60000); // 1-minute precision
    return `${contentId}:${normalizedTitle}:${timeSlot}`;
  }

  /**
   * The primary method to check for duplicates using a robust fingerprint.
   * @param {object} content - The content object.
   * @returns {Promise<boolean>} True if the content is a duplicate.
   */
  async isDuplicate(content) {
    const fingerprint = this._generateContentFingerprint(content);
    if (!fingerprint) {
      // Fallback to URL check if fingerprint cannot be generated
      return this.isDuplicateByUrl(content.url);
    }
    // Check in-memory cache first for speed
    if (this.fingerprintCache.has(fingerprint)) {
      return true;
    }
    // Check persistent storage
    const isDupe = await this.storage.hasFingerprint(fingerprint);
    if (isDupe) {
      this.fingerprintCache.add(fingerprint); // Cache for next time
    }
    return isDupe;
  }

  /**
   * Marks content as seen using its robust fingerprint.
   * @param {object} content - The content object.
   */
  async markAsSeen(content) {
    const fingerprint = this._generateContentFingerprint(content);
    if (fingerprint) {
      this.fingerprintCache.add(fingerprint);
      await this.storage.storeFingerprint(fingerprint, {
        url: content.url,
        title: content.title,
        publishedAt: content.publishedAt,
      });
    }
    // Also mark the URL as seen for fallback checks
    await this.markAsSeenByUrl(content.url);
  }

  /**
   * Fallback check using a normalized URL.
   * @param {string} url - The URL of the content.
   * @returns {Promise<boolean>} True if the URL has been seen.
   */
  async isDuplicateByUrl(url) {
    const normalizedUrl = this._normalizeUrl(url);
    if (this.urlCache.has(normalizedUrl)) {
      return true;
    }

    const exists = await this.storage.hasUrl(normalizedUrl);
    if (exists) {
      this.urlCache.add(normalizedUrl);
    }
    return exists;
  }

  /**
   * Fallback method to mark a normalized URL as seen.
   * @param {string} url - The URL of the content.
   */
  async markAsSeenByUrl(url) {
    const normalizedUrl = this._normalizeUrl(url);
    this.urlCache.add(normalizedUrl);
    await this.storage.addUrl(normalizedUrl);
  }

  _normalizeUrl(url) {
    const videoId = this._extractVideoId(url);
    if (videoId) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
    // Add normalizers for other platforms (e.g., Twitter) if needed
    return url;
  }

  _extractVideoId(url) {
    if (!url) {
      return null;
    }
    const youtubeRegex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
    const match = url.match(youtubeRegex);
    return match ? match[1] : null;
  }

  _extractContentId(url) {
    return this._extractVideoId(url) || url;
  }

  _normalizeTitle(title) {
    return (title || '')
      .toLowerCase()
      .replace(/[^\w\s]/gi, '') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
}
