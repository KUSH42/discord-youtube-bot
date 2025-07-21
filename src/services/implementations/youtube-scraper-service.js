import { PlaywrightBrowserService } from './playwright-browser-service.js';

/**
 * YouTube web scraper service for near-instantaneous content detection
 * Provides an alternative to API polling for faster notifications
 */
export class YouTubeScraperService {
  constructor(logger, config) {
    this.logger = logger;
    this.config = config;
    this.browserService = new PlaywrightBrowserService();
    this.videosUrl = null;
    this.liveStreamUrl = null;
    this.lastKnownContentId = null;
    this.isInitialized = false;
    this.isRunning = false;
    this.scrapingInterval = null;

    // Configuration
    this.minInterval = parseInt(config.get('YOUTUBE_SCRAPER_INTERVAL_MIN', '300000'), 10);
    this.maxInterval = parseInt(config.get('YOUTUBE_SCRAPER_INTERVAL_MAX', '600000'), 10);
    this.maxRetries = config.get('YOUTUBE_SCRAPER_MAX_RETRIES', 3);
    this.retryDelayMs = config.get('YOUTUBE_SCRAPER_RETRY_DELAY_MS', 5000);
    this.timeoutMs = config.get('YOUTUBE_SCRAPER_TIMEOUT_MS', 30000);

    // Metrics
    this.metrics = {
      totalScrapingAttempts: 0,
      successfulScrapes: 0,
      failedScrapes: 0,
      videosDetected: 0,
      lastSuccessfulScrape: null,
      lastError: null,
    };
  }

  /**
   * Initialize the scraper with channel URL
   * @param {string} channelHandle - YouTube channel handle (e.g., @channelname)
   * @returns {Promise<void>}
   */
  async initialize(channelHandle) {
    if (this.isInitialized) {
      throw new Error('YouTube scraper is already initialized');
    }

    // Construct channel URLs
    const baseUrl = `https://www.youtube.com/@${channelHandle}`;
    this.videosUrl = `${baseUrl}/videos`;
    this.liveStreamUrl = `${baseUrl}/live`;

    try {
      // Launch browser with optimized settings for scraping
      await this.browserService.launch({
        headless: false, // Run in headed mode for debugging
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
        ],
      });

      // Set user agent to appear as regular browser
      await this.browserService.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Set viewport
      await this.browserService.setViewport({ width: 1920, height: 1080 });

      // Mark as initialized before fetching to avoid circular dependency
      this.isInitialized = true;

      // Find and set the initial latest video
      const latestVideo = await this.fetchLatestVideo();
      if (latestVideo) {
        this.lastKnownContentId = latestVideo.id;
        this.logger.info('YouTube scraper initialized', {
          videosUrl: this.videosUrl,
          lastKnownContentId: this.lastKnownContentId,
          title: latestVideo.title,
        });
      } else {
        this.logger.warn('YouTube scraper initialized but no videos found', {
          videosUrl: this.videosUrl,
        });
      }
    } catch (error) {
      this.isInitialized = false;
      this.logger.error('Failed to initialize YouTube scraper', {
        error: error.message,
        stack: error.stack,
        videosUrl: this.videosUrl,
      });
      throw error;
    }
  }

  /**
   * Fetch the latest video from the channel
   * @returns {Promise<Object|null>} Latest video details or null if none found
   */
  async fetchLatestVideo() {
    if (!this.isInitialized) {
      throw new Error('YouTube scraper is not initialized');
    }

    this.metrics.totalScrapingAttempts++;

    try {
      // Navigate to channel videos page
      await this.browserService.goto(this.videosUrl, {
        waitUntil: 'networkidle',
        timeout: this.timeoutMs,
      });

      // Wait for the page to load and videos to appear
      await this.browserService.waitFor(2000);

      // Extract latest video information using multiple selector strategies
      const latestVideo = await this.browserService.evaluate(() => {
        // Strategy 1: Try modern YouTube layout
        // eslint-disable-next-line no-undef
        let videoElement = document.querySelector('ytd-rich-grid-media:first-child #video-title-link');

        // Strategy 2: Try alternate selector
        if (!videoElement) {
          // eslint-disable-next-line no-undef
          videoElement = document.querySelector('ytd-rich-item-renderer:first-child #video-title-link');
        }

        // Strategy 3: Try grid layout
        if (!videoElement) {
          // eslint-disable-next-line no-undef
          videoElement = document.querySelector('#contents ytd-rich-grid-media:first-child a#video-title');
        }

        // Strategy 4: Try list layout
        if (!videoElement) {
          // eslint-disable-next-line no-undef
          videoElement = document.querySelector('#contents ytd-video-renderer:first-child a#video-title');
        }

        if (!videoElement) {
          return null;
        }

        // Extract video ID from URL
        const videoUrl = videoElement.href;
        const videoIdMatch = videoUrl.match(/[?&]v=([^&]+)/);
        if (!videoIdMatch) {
          return null;
        }

        const videoId = videoIdMatch[1];
        const title = videoElement.textContent?.trim() || 'Unknown Title';

        // Try to get additional metadata
        const videoContainer = videoElement.closest('ytd-rich-grid-media, ytd-rich-item-renderer, ytd-video-renderer');
        let publishedText = 'Unknown';
        let viewsText = 'Unknown';
        let thumbnailUrl = null;

        if (videoContainer) {
          // Try to find published time
          const metadataElements = videoContainer.querySelectorAll(
            '#metadata-line span, #published-time-text, .ytd-video-meta-block span'
          );
          for (const element of metadataElements) {
            const text = element.textContent?.trim();
            if (
              text &&
              (text.includes('ago') ||
                text.includes('hour') ||
                text.includes('day') ||
                text.includes('week') ||
                text.includes('month'))
            ) {
              publishedText = text;
              break;
            }
          }

          // Try to find view count
          for (const element of metadataElements) {
            const text = element.textContent?.trim();
            if (text && (text.includes('view') || text.includes('watching'))) {
              viewsText = text;
              break;
            }
          }

          // Try to find thumbnail
          const thumbnail = videoContainer.querySelector('img[src*="i.ytimg.com"]');
          if (thumbnail) {
            thumbnailUrl = thumbnail.src;
          }
        }

        return {
          id: videoId,
          title,
          url: videoUrl,
          publishedText,
          viewsText,
          thumbnailUrl,
          type: 'video',
          scrapedAt: new Date().toISOString(),
        };
      });

      if (latestVideo) {
        this.metrics.successfulScrapes++;
        this.metrics.lastSuccessfulScrape = new Date();

        this.logger.debug('Successfully scraped latest video', {
          videoId: latestVideo.id,
          title: latestVideo.title,
          publishedText: latestVideo.publishedText,
        });
      } else {
        this.logger.warn('No videos found during scraping', {
          videosUrl: this.videosUrl,
        });
      }

      return latestVideo;
    } catch (error) {
      this.metrics.failedScrapes++;
      this.metrics.lastError = {
        message: error.message,
        timestamp: new Date(),
      };

      this.logger.error('Failed to scrape YouTube channel', {
        error: error.message,
        stack: error.stack,
        videosUrl: this.videosUrl,
        attempt: this.metrics.totalScrapingAttempts,
      });

      return null;
    }
  }

  /**
   * Fetch the active live stream from the channel's live tab
   * @returns {Promise<Object|null>} Active live stream details or null if none found
   */
  async fetchActiveLiveStream() {
    if (!this.isInitialized) {
      throw new Error('YouTube scraper is not initialized');
    }

    try {
      await this.browserService.goto(this.liveStreamUrl, {
        waitUntil: 'networkidle',
        timeout: this.timeoutMs,
      });

      const liveStream = await this.browserService.evaluate(() => {
        // eslint-disable-next-line no-undef
        const liveElement = document.querySelector('ytd-channel-featured-content-renderer a#video-title-link');
        if (!liveElement) {
          return null;
        }

        const url = liveElement.href;
        const videoIdMatch = url.match(/[?&]v=([^&]+)/);
        if (!videoIdMatch) {
          return null;
        }

        return {
          id: videoIdMatch[1],
          title: liveElement.getAttribute('title') || 'Live Stream',
          url,
          type: 'livestream',
          scrapedAt: new Date().toISOString(),
        };
      });

      if (liveStream) {
        this.logger.debug('Successfully scraped active live stream', {
          videoId: liveStream.id,
          title: liveStream.title,
        });
      }

      return liveStream;
    } catch (error) {
      this.logger.error('Failed to scrape for active live stream', {
        error: error.message,
        liveStreamUrl: this.liveStreamUrl,
      });
      return null;
    }
  }

  /**
   * Check for new videos since last check
   * @returns {Promise<Object|null>} New video object or null if none found
   */
  async checkForNewContent() {
    if (!this.isInitialized) {
      throw new Error('YouTube scraper is not initialized');
    }

    // Prioritize checking for a live stream
    const activeLiveStream = await this.fetchActiveLiveStream();
    if (activeLiveStream && activeLiveStream.id !== this.lastKnownContentId) {
      this.logger.info('New live stream detected via scraping', {
        contentId: activeLiveStream.id,
        title: activeLiveStream.title,
        previousContentId: this.lastKnownContentId,
      });
      this.lastKnownContentId = activeLiveStream.id;
      this.metrics.videosDetected++;
      return activeLiveStream;
    }

    // If no new live stream, check for the latest video
    const latestVideo = await this.fetchLatestVideo();
    if (latestVideo && latestVideo.id !== this.lastKnownContentId) {
      this.logger.info('New video detected via scraping', {
        contentId: latestVideo.id,
        title: latestVideo.title,
        previousContentId: this.lastKnownContentId,
      });
      this.lastKnownContentId = latestVideo.id;
      this.metrics.videosDetected++;
      return latestVideo;
    }

    return null;
  }

  /**
   * Start continuous monitoring for new videos
   * @param {Function} onNewVideo - Callback function for new videos
   * @returns {Promise<void>}
   */
  async startMonitoring(onNewContent) {
    if (!this.isInitialized) {
      throw new Error('YouTube scraper is not initialized');
    }

    if (this.isRunning) {
      this.logger.warn('YouTube scraper monitoring is already running');
      return;
    }

    this.isRunning = true;

    const monitoringLoop = async () => {
      if (!this.isRunning) {
        return;
      }

      try {
        const newContent = await this.checkForNewContent();
        if (newContent && typeof onNewContent === 'function') {
          await onNewContent(newContent);
        }
      } catch (error) {
        this.logger.error('Error in YouTube scraper monitoring loop', {
          error: error.message,
          stack: error.stack,
        });
      }

      // Schedule next check
      if (this.isRunning) {
        const nextInterval = this._getNextInterval();
        this.logger.debug(`Next YouTube scrape scheduled in ${nextInterval}ms`);
        this.scrapingInterval = setTimeout(monitoringLoop, nextInterval);
      }
    };

    // Start monitoring
    const firstInterval = this._getNextInterval();
    this.logger.info('Starting YouTube scraper monitoring', {
      nextCheckInMs: firstInterval,
    });
    this.scrapingInterval = setTimeout(monitoringLoop, firstInterval);
  }

  /**
   * Stop continuous monitoring
   * @returns {Promise<void>}
   */
  async stopMonitoring() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.scrapingInterval) {
      clearTimeout(this.scrapingInterval);
      this.scrapingInterval = null;
    }

    this.logger.info('YouTube scraper monitoring stopped');
  }

  /**
   * Get scraper metrics and health status
   * @returns {Object} Scraper metrics
   */
  getMetrics() {
    const successRate =
      this.metrics.totalScrapingAttempts > 0
        ? (this.metrics.successfulScrapes / this.metrics.totalScrapingAttempts) * 100
        : 0;

    return {
      ...this.metrics,
      successRate: Math.round(successRate * 100) / 100,
      isInitialized: this.isInitialized,
      isRunning: this.isRunning,
      lastKnownContentId: this.lastKnownContentId,
      videosUrl: this.videosUrl,
      liveStreamUrl: this.liveStreamUrl,
      configuration: {
        minInterval: this.minInterval,
        maxInterval: this.maxInterval,
        maxRetries: this.maxRetries,
        timeoutMs: this.timeoutMs,
      },
    };
  }

  /**
   * Update the known video ID (useful for initial sync)
   * @param {string} videoId - Video ID to set as last known
   */
  updateLastKnownContentId(contentId) {
    const previousId = this.lastKnownContentId;
    this.lastKnownContentId = contentId;

    this.logger.debug('Updated last known content ID', {
      previousId,
      newId: contentId,
    });
  }

  /**
   * Force a health check of the scraper
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    const health = {
      status: 'unknown',
      timestamp: new Date().toISOString(),
      details: {},
    };

    try {
      if (!this.isInitialized) {
        health.status = 'not_initialized';
        health.details.error = 'Scraper is not initialized';
        return health;
      }

      if (!this.browserService.isRunning()) {
        health.status = 'browser_not_running';
        health.details.error = 'Browser service is not running';
        return health;
      }

      // Try to fetch latest video as health check
      const testVideo = await this.fetchLatestVideo();

      if (testVideo) {
        health.status = 'healthy';
        health.details.lastContentId = testVideo.id;
        health.details.lastContentTitle = testVideo.title;
      } else {
        health.status = 'no_videos_found';
        health.details.warning = 'No videos found during health check';
      }
    } catch (error) {
      health.status = 'error';
      health.details.error = error.message;
    }

    health.details.metrics = this.getMetrics();

    return health;
  }

  /**
   * Clean up resources and close browser
   * @returns {Promise<void>}
   */
  async cleanup() {
    this.logger.info('Cleaning up YouTube scraper service');

    await this.stopMonitoring();

    if (this.browserService) {
      await this.browserService.close();
    }

    this.isInitialized = false;
    this.lastKnownContentId = null;
    this.videosUrl = null;
    this.liveStreamUrl = null;
  }

  /**
   * Get the next polling interval with jitter
   * @returns {number} Interval in milliseconds
   * @private
   */
  _getNextInterval() {
    const jitter = Math.random() * 0.2 - 0.1; // +/- 10% jitter
    const baseInterval = this.minInterval + Math.random() * (this.maxInterval - this.minInterval);
    return Math.floor(baseInterval * (1 + jitter));
  }
}
