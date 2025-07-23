/**
 * UserAgentManager - Dynamic user agent rotation and management
 * Provides realistic browser fingerprints with matching viewport configurations
 */
export class UserAgentManager {
  constructor() {
    this.userAgentPool = [
      // Chrome on Windows
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',

      // Chrome on macOS
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',

      // Chrome on Linux
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',

      // Edge on Windows
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',

      // Firefox alternatives
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/121.0',
    ];

    this.currentIndex = Math.floor(Math.random() * this.userAgentPool.length);
    this.rotationInterval = 3600000; // 1 hour
    this.lastRotation = Date.now();
  }

  /**
   * Get current user agent with automatic rotation
   * @returns {string} Current user agent string
   */
  getCurrentUserAgent() {
    // Rotate user agent periodically
    if (Date.now() - this.lastRotation > this.rotationInterval) {
      this.rotateUserAgent();
    }
    return this.userAgentPool[this.currentIndex];
  }

  /**
   * Manually rotate to next user agent
   * @returns {string} New user agent string
   */
  rotateUserAgent() {
    this.currentIndex = (this.currentIndex + 1) % this.userAgentPool.length;
    this.lastRotation = Date.now();
    return this.userAgentPool[this.currentIndex];
  }

  /**
   * Get viewport dimensions that match the current user agent
   * @param {string} userAgent - User agent string (optional, uses current if not provided)
   * @returns {Object} Viewport dimensions {width, height}
   */
  getMatchingViewport(userAgent = null) {
    const ua = userAgent || this.getCurrentUserAgent();

    if (ua.includes('Windows')) {
      // Common Windows resolutions
      const windowsViewports = [
        { width: 1920, height: 1080 },
        { width: 1366, height: 768 },
        { width: 1536, height: 864 },
        { width: 1440, height: 900 },
      ];
      return windowsViewports[Math.floor(Math.random() * windowsViewports.length)];
    } else if (ua.includes('Macintosh')) {
      // Common macOS resolutions
      const macViewports = [
        { width: 1440, height: 900 },
        { width: 1680, height: 1050 },
        { width: 1280, height: 800 },
        { width: 1920, height: 1080 },
      ];
      return macViewports[Math.floor(Math.random() * macViewports.length)];
    } else if (ua.includes('X11; Linux')) {
      // Common Linux resolutions
      const linuxViewports = [
        { width: 1920, height: 1080 },
        { width: 1366, height: 768 },
        { width: 1600, height: 900 },
        { width: 1280, height: 1024 },
      ];
      return linuxViewports[Math.floor(Math.random() * linuxViewports.length)];
    }

    // Default fallback
    return { width: 1366, height: 768 };
  }

  /**
   * Get browser platform based on user agent
   * @param {string} userAgent - User agent string (optional, uses current if not provided)
   * @returns {string} Platform identifier (windows, macos, linux)
   */
  getPlatform(userAgent = null) {
    const ua = userAgent || this.getCurrentUserAgent();

    if (ua.includes('Windows')) {
      return 'windows';
    }
    if (ua.includes('Macintosh')) {
      return 'macos';
    }
    if (ua.includes('X11; Linux')) {
      return 'linux';
    }

    return 'unknown';
  }

  /**
   * Get browser name from user agent
   * @param {string} userAgent - User agent string (optional, uses current if not provided)
   * @returns {string} Browser name (chrome, firefox, edge)
   */
  getBrowserName(userAgent = null) {
    const ua = userAgent || this.getCurrentUserAgent();

    if (ua.includes('Edg/')) {
      return 'edge';
    }
    if (ua.includes('Firefox/')) {
      return 'firefox';
    }
    if (ua.includes('Chrome/')) {
      return 'chrome';
    }

    return 'unknown';
  }

  /**
   * Get Accept-Language header for user agent
   * @param {string} userAgent - User agent string (optional, uses current if not provided)
   * @returns {string} Accept-Language header value
   */
  getAcceptLanguage(userAgent = null) {
    const ua = userAgent || this.getCurrentUserAgent();

    // Vary language preferences slightly based on platform
    if (ua.includes('Windows')) {
      return 'en-US,en;q=0.9,es;q=0.8';
    } else if (ua.includes('Macintosh')) {
      return 'en-US,en;q=0.9,fr;q=0.8';
    } else if (ua.includes('X11; Linux')) {
      return 'en-US,en;q=0.9,de;q=0.8';
    }

    return 'en-US,en;q=0.9';
  }

  /**
   * Get current rotation status for monitoring
   * @returns {Object} Rotation status information
   */
  getRotationStatus() {
    return {
      currentIndex: this.currentIndex,
      currentUserAgent: this.getCurrentUserAgent(),
      platform: this.getPlatform(),
      browserName: this.getBrowserName(),
      lastRotation: this.lastRotation,
      nextRotation: this.lastRotation + this.rotationInterval,
      totalUserAgents: this.userAgentPool.length,
    };
  }

  /**
   * Force immediate rotation to specific user agent
   * @param {number} index - Index of user agent to use
   * @returns {string} Selected user agent string
   */
  setUserAgentByIndex(index) {
    if (index < 0 || index >= this.userAgentPool.length) {
      throw new Error(`Invalid user agent index: ${index}. Must be between 0 and ${this.userAgentPool.length - 1}`);
    }

    this.currentIndex = index;
    this.lastRotation = Date.now();
    return this.userAgentPool[this.currentIndex];
  }

  /**
   * Update rotation interval
   * @param {number} intervalMs - New rotation interval in milliseconds
   */
  setRotationInterval(intervalMs) {
    if (intervalMs < 60000) {
      // Minimum 1 minute
      throw new Error('Rotation interval must be at least 60000ms (1 minute)');
    }

    this.rotationInterval = intervalMs;
  }
}
