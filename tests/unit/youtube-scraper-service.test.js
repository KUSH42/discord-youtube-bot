import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { YouTubeScraperService } from '../../src/services/implementations/youtube-scraper-service.js';

describe('YouTubeScraperService', () => {
  let scraperService;
  let mockLogger;
  let mockConfig;
  let mockBrowserService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    mockConfig = {
      get: jest.fn((key, defaultValue) => {
        const config = {
          YOUTUBE_SCRAPER_INTERVAL_MS: 15000,
          YOUTUBE_SCRAPER_MAX_RETRIES: 3,
          YOUTUBE_SCRAPER_RETRY_DELAY_MS: 5000,
          YOUTUBE_SCRAPER_TIMEOUT_MS: 30000,
          YOUTUBE_AUTHENTICATION_ENABLED: 'false',
          YOUTUBE_USERNAME: '',
          YOUTUBE_PASSWORD: '',
        };
        return config[key] || defaultValue;
      }),
      getBoolean: jest.fn((key, defaultValue) => {
        const config = {
          YOUTUBE_AUTHENTICATION_ENABLED: false,
        };
        return config[key] !== undefined ? config[key] : defaultValue;
      }),
    };

    scraperService = new YouTubeScraperService(mockLogger, mockConfig);

    // Replace the real browser service with a mock
    mockBrowserService = {
      launch: jest.fn(),
      setUserAgent: jest.fn(),
      setViewport: jest.fn(),
      goto: jest.fn(),
      waitFor: jest.fn(),
      evaluate: jest.fn(),
      waitForSelector: jest.fn(),
      type: jest.fn(),
      click: jest.fn(),
      setCookies: jest.fn(),
      close: jest.fn(),
      isRunning: jest.fn(() => true),
    };
    scraperService.browserService = mockBrowserService;
  });

  afterEach(async () => {
    await scraperService.cleanup();
    jest.useRealTimers();
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid channel handle', async () => {
      const mockVideo = {
        id: 'dQw4w9WgXcQ',
        title: 'Test Video',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        publishedText: '1 hour ago',
      };

      mockBrowserService.evaluate.mockResolvedValue(mockVideo);

      await scraperService.initialize('testchannel');

      expect(scraperService.isInitialized).toBe(true);
      expect(scraperService.videosUrl).toBe('https://www.youtube.com/@testchannel/videos');
      expect(scraperService.liveStreamUrl).toBe('https://www.youtube.com/@testchannel/live');
      expect(scraperService.lastKnownContentId).toBe('dQw4w9WgXcQ');
      expect(mockBrowserService.launch).toHaveBeenCalledWith({
        headless: true,
        args: expect.arrayContaining(['--no-sandbox', '--disable-setuid-sandbox']),
      });
      expect(mockLogger.info).toHaveBeenCalledWith('YouTube scraper initialized', {
        videosUrl: 'https://www.youtube.com/@testchannel/videos',
        lastKnownContentId: 'dQw4w9WgXcQ',
        title: 'Test Video',
      });
    });

    it('should handle initialization when no videos are found', async () => {
      mockBrowserService.evaluate.mockResolvedValue(null);

      await scraperService.initialize('emptychannel');

      expect(scraperService.isInitialized).toBe(true);
      expect(scraperService.lastKnownContentId).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith('YouTube scraper initialized but no videos found', {
        videosUrl: 'https://www.youtube.com/@emptychannel/videos',
      });
    });

    it('should throw error if already initialized', async () => {
      mockBrowserService.evaluate.mockResolvedValue({
        id: 'test123',
        title: 'Test',
        url: 'https://www.youtube.com/watch?v=test123',
      });

      await scraperService.initialize('testchannel');

      await expect(scraperService.initialize('anotherchannel')).rejects.toThrow(
        'YouTube scraper is already initialized'
      );
    });

    it('should handle browser launch failures', async () => {
      const launchError = new Error('Failed to launch browser');
      mockBrowserService.launch.mockRejectedValue(launchError);

      await expect(scraperService.initialize('testchannel')).rejects.toThrow('Failed to launch browser');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to initialize YouTube scraper', {
        error: 'Failed to launch browser',
        stack: expect.any(String),
        videosUrl: 'https://www.youtube.com/@testchannel/videos',
      });
    });
  });

  describe('Video Fetching', () => {
    beforeEach(async () => {
      // Ensure evaluate resolves with a valid video object for initialization
      mockBrowserService.evaluate.mockResolvedValue({
        success: true,
        id: 'initial123',
        title: 'Initial Video',
        url: 'https://www.youtube.com/watch?v=initial123',
      });
      await scraperService.initialize('testchannel');
      jest.clearAllMocks();

      // Reset metrics after initialization for clean test state
      scraperService.metrics.totalScrapingAttempts = 0;
      scraperService.metrics.successfulScrapes = 0;
      scraperService.metrics.failedScrapes = 0;
    });

    it('should fetch latest video successfully', async () => {
      const mockVideo = {
        success: true,
        id: 'latest456',
        title: 'Latest Video',
      };

      mockBrowserService.evaluate.mockReset();
      mockBrowserService.evaluate.mockResolvedValue(mockVideo);

      try {
        const result = await scraperService.fetchLatestVideo();
        expect(result).not.toBeNull();
        expect(result.id).toBe(mockVideo.id);
        expect(scraperService.metrics.successfulScrapes).toBe(1);
      } catch (error) {
        console.error('Test failed with error:', error);
        throw error;
      }
    });

    it('should handle scraping failures gracefully', async () => {
      const scrapingError = new Error('Page timeout');
      mockBrowserService.goto.mockRejectedValue(scrapingError);

      const result = await scraperService.fetchLatestVideo();

      expect(result).toBeNull();
      expect(scraperService.metrics.failedScrapes).toBe(1);
      expect(scraperService.metrics.lastError).toEqual({
        message: 'Page timeout',
        timestamp: expect.any(Date),
      });
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to scrape YouTube channel', {
        error: 'Page timeout',
        stack: expect.any(String),
        videosUrl: 'https://www.youtube.com/@testchannel/videos',
        attempt: 1,
      });
    });

    it('should throw error if not initialized', async () => {
      const uninitializedScraper = new YouTubeScraperService(mockLogger, mockConfig);

      await expect(uninitializedScraper.fetchLatestVideo()).rejects.toThrow('YouTube scraper is not initialized');
    });
  });

  describe('Live Stream Fetching', () => {
    beforeEach(async () => {
      mockBrowserService.evaluate.mockResolvedValue({
        id: 'initial123',
        title: 'Initial Video',
        url: 'https://www.youtube.com/watch?v=initial123',
      });
      await scraperService.initialize('testchannel');
      jest.clearAllMocks();
    });

    it('should fetch active live stream successfully', async () => {
      const mockLiveStream = {
        id: 'live123',
        title: '🔴 Now Live!',
        url: 'https://www.youtube.com/watch?v=live123',
        type: 'livestream',
        scrapedAt: expect.any(String),
      };
      mockBrowserService.evaluate.mockResolvedValue(mockLiveStream);

      const result = await scraperService.fetchActiveLiveStream();

      expect(result).toEqual(mockLiveStream);
      expect(mockBrowserService.goto).toHaveBeenCalledWith('https://www.youtube.com/@testchannel/live', {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
      expect(mockLogger.debug).toHaveBeenCalledWith('Successfully scraped active live stream', {
        videoId: 'live123',
        title: '🔴 Now Live!',
      });
    });

    it('should return null when no live stream is active', async () => {
      mockBrowserService.evaluate.mockResolvedValue(null);
      const result = await scraperService.fetchActiveLiveStream();
      expect(result).toBeNull();
    });

    it('should handle errors during live stream fetching', async () => {
      mockBrowserService.goto.mockRejectedValue(new Error('Live page error'));
      const result = await scraperService.fetchActiveLiveStream();
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to scrape for active live stream', {
        error: 'Live page error',
        liveStreamUrl: 'https://www.youtube.com/@testchannel/live',
      });
    });
  });

  describe('New Content Detection', () => {
    beforeEach(async () => {
      mockBrowserService.evaluate.mockResolvedValue({
        id: 'initial123',
        title: 'Initial Video',
        url: 'https://www.youtube.com/watch?v=initial123',
      });
      await scraperService.initialize('testchannel');
      jest.clearAllMocks();

      // Reset metrics after initialization for clean test state
      scraperService.metrics.totalScrapingAttempts = 0;
      scraperService.metrics.successfulScrapes = 0;
      scraperService.metrics.failedScrapes = 0;
      scraperService.metrics.videosDetected = 0;
    });

    it('should detect new video when video ID changes', async () => {
      const newVideo = {
        id: 'new456',
        title: 'New Video',
        url: 'https://www.youtube.com/watch?v=new456',
        publishedText: '5 minutes ago',
        type: 'video',
      };

      // Mock live stream to return null to force video check
      scraperService.fetchActiveLiveStream = jest.fn().mockResolvedValue(null);
      mockBrowserService.evaluate.mockResolvedValue(newVideo);

      const result = await scraperService.checkForNewContent();

      expect(result).toEqual(newVideo);
      expect(scraperService.lastKnownContentId).toBe('new456');
      expect(scraperService.metrics.videosDetected).toBe(1);
      expect(mockLogger.info).toHaveBeenCalledWith('New video detected via scraping', {
        contentId: 'new456',
        title: 'New Video',
        previousContentId: 'initial123',
      });
    });

    it('should return null when no new video is found', async () => {
      const sameVideo = {
        id: 'initial123',
        title: 'Initial Video (updated)',
        url: 'https://www.youtube.com/watch?v=initial123',
      };

      mockBrowserService.evaluate.mockResolvedValue(sameVideo);

      const result = await scraperService.checkForNewContent();

      expect(result).toBeNull();
      expect(scraperService.lastKnownContentId).toBe('initial123');
      expect(scraperService.metrics.videosDetected).toBe(0);
    });

    it('should return null when fetching fails', async () => {
      mockBrowserService.goto.mockRejectedValue(new Error('Network error'));

      const result = await scraperService.checkForNewContent();

      expect(result).toBeNull();
      expect(scraperService.metrics.failedScrapes).toBe(1);
    });

    it('should prioritize a new live stream over a new video', async () => {
      const liveStream = { id: 'live123', title: 'Live Stream', type: 'livestream' };
      const newVideo = { id: 'newVideo456', title: 'New Video', type: 'video' };

      // Mock both fetches
      scraperService.fetchActiveLiveStream = jest.fn().mockResolvedValue(liveStream);
      scraperService.fetchLatestVideo = jest.fn().mockResolvedValue(newVideo);

      const result = await scraperService.checkForNewContent();

      expect(result).toEqual(liveStream); // Live stream should be returned
      expect(scraperService.lastKnownContentId).toBe('live123');
      expect(scraperService.fetchLatestVideo).not.toHaveBeenCalled(); // Should not even check for videos
    });

    it('should fall back to video check when no live stream is active', async () => {
      const newVideo = { id: 'newVideo456', title: 'New Video', type: 'video' };
      scraperService.fetchActiveLiveStream = jest.fn().mockResolvedValue(null);
      scraperService.fetchLatestVideo = jest.fn().mockResolvedValue(newVideo);

      const result = await scraperService.checkForNewContent();
      expect(result).toEqual(newVideo);
      expect(scraperService.lastKnownContentId).toBe('newVideo456');
    });

    it('should return null if live stream is found but is not new', async () => {
      const liveStream = { id: 'initial123', title: 'Live Stream', type: 'livestream' };
      scraperService.lastKnownContentId = 'initial123';
      scraperService.fetchActiveLiveStream = jest.fn().mockResolvedValue(liveStream);
      scraperService.fetchLatestVideo = jest.fn();

      const result = await scraperService.checkForNewContent();
      expect(result).toBeNull();
      // Should fall back and check for videos
      expect(scraperService.fetchLatestVideo).toHaveBeenCalled();
    });
  });

  describe('Continuous Monitoring', () => {
    let onNewContentCallback;

    beforeEach(async () => {
      onNewContentCallback = jest.fn();
      mockBrowserService.evaluate.mockResolvedValue({
        id: 'initial123',
        title: 'Initial Video',
        url: 'https://www.youtube.com/watch?v=initial123',
      });
      await scraperService.initialize('testchannel');
      jest.clearAllMocks();

      // Reset metrics after initialization for clean test state
      scraperService.metrics.totalScrapingAttempts = 0;
      scraperService.metrics.successfulScrapes = 0;
      scraperService.metrics.failedScrapes = 0;
    });

    it('should start monitoring and detect new videos', async () => {
      const newVideo = {
        success: true,
        id: 'new789',
        title: 'New Monitored Video',
        url: 'https://www.youtube.com/watch?v=new789',
        type: 'video',
      };

      // Mock the sequence of fetches
      scraperService.checkForNewContent = jest
        .fn()
        .mockResolvedValueOnce(null) // First check finds nothing new
        .mockResolvedValueOnce(newVideo); // Second check finds the new video

      await scraperService.startMonitoring(onNewContentCallback);

      expect(scraperService.isRunning).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Starting YouTube scraper monitoring', {
        nextCheckInMs: expect.any(Number),
      });

      // Fast-forward time to trigger monitoring loop twice
      await jest.advanceTimersByTimeAsync(scraperService.maxInterval * 2 + 5000);

      expect(onNewContentCallback).toHaveBeenCalledWith(newVideo);
      expect(onNewContentCallback).toHaveBeenCalledTimes(1);
    });

    it('should stop monitoring when requested', async () => {
      await scraperService.startMonitoring(onNewContentCallback);
      expect(scraperService.isRunning).toBe(true);

      await scraperService.stopMonitoring();

      expect(scraperService.isRunning).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('YouTube scraper monitoring stopped');
    });

    it('should handle errors in monitoring loop gracefully', async () => {
      mockBrowserService.goto.mockRejectedValue(new Error('Monitoring error'));

      await scraperService.startMonitoring(onNewContentCallback);

      // Advance timer to trigger monitoring loop
      await jest.advanceTimersByTimeAsync(scraperService.maxInterval);

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to scrape'), expect.any(Object));
      expect(onNewContentCallback).not.toHaveBeenCalled();
      expect(scraperService.isRunning).toBe(true); // Should continue running despite error
    });

    it('should warn if monitoring is already running', async () => {
      await scraperService.startMonitoring(onNewContentCallback);

      await scraperService.startMonitoring(onNewContentCallback);

      expect(mockLogger.warn).toHaveBeenCalledWith('YouTube scraper monitoring is already running');
    });

    it('should throw error if not initialized', async () => {
      const uninitializedScraper = new YouTubeScraperService(mockLogger, mockConfig);

      await expect(uninitializedScraper.startMonitoring(onNewContentCallback)).rejects.toThrow(
        'YouTube scraper is not initialized'
      );
    });
  });

  describe('Metrics and Health', () => {
    beforeEach(async () => {
      mockBrowserService.evaluate.mockResolvedValue({
        id: 'initial123',
        title: 'Initial Video',
        url: 'https://www.youtube.com/watch?v=initial123',
      });
      await scraperService.initialize('testchannel');
      jest.clearAllMocks();

      // Don't reset metrics here as this section tests the metrics functionality
    });

    it('should return accurate metrics', async () => {
      // Reset metrics to a known state before the test
      scraperService.metrics = {
        totalScrapingAttempts: 0,
        successfulScrapes: 0,
        failedScrapes: 0,
        lastSuccessfulScrape: null,
        lastError: null,
      };

      // Mock a successful fetch
      mockBrowserService.evaluate.mockReset();
      mockBrowserService.evaluate.mockResolvedValue({
        success: true,
        id: 'test456',
        title: 'Test Video',
      });
      await scraperService.fetchLatestVideo(); // Success

      // Mock a failed fetch
      mockBrowserService.goto.mockRejectedValue(new Error('Network error'));
      await scraperService.fetchLatestVideo(); // Failure

      const metrics = scraperService.getMetrics();
      expect(metrics.successfulScrapes).toBe(1);
      expect(metrics.failedScrapes).toBe(1);
    });

    it('should perform health check successfully', async () => {
      const mockVideo = {
        id: 'health123',
        title: 'Health Check Video',
        url: 'https://www.youtube.com/watch?v=health123',
      };

      mockBrowserService.evaluate.mockResolvedValue(mockVideo);

      const health = await scraperService.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.details.lastContentId).toBe('health123');
      expect(health.details.lastContentTitle).toBe('Health Check Video');
      expect(health.details.metrics).toBeDefined();
    });

    it('should detect unhealthy state when not initialized', async () => {
      const uninitializedScraper = new YouTubeScraperService(mockLogger, mockConfig);

      const health = await uninitializedScraper.healthCheck();

      expect(health.status).toBe('not_initialized');
      expect(health.details.error).toBe('Scraper is not initialized');
    });

    it('should detect unhealthy state when browser is not running', async () => {
      mockBrowserService.isRunning.mockReturnValue(false);

      const health = await scraperService.healthCheck();

      expect(health.status).toBe('browser_not_running');
      expect(health.details.error).toBe('Browser service is not running');
    });

    it('should handle health check errors', async () => {
      mockBrowserService.goto.mockRejectedValue(new Error('Health check failed'));

      const health = await scraperService.healthCheck();

      expect(health.status).toBe('no_videos_found');
      expect(health.details.warning).toBe('No videos found during health check');
    });
  });

  describe('Utility Methods', () => {
    beforeEach(async () => {
      mockBrowserService.evaluate.mockResolvedValue({
        id: 'initial123',
        title: 'Initial Video',
        url: 'https://www.youtube.com/watch?v=initial123',
      });
      await scraperService.initialize('testchannel');
      jest.clearAllMocks();
    });

    it('should update last known content ID', () => {
      scraperService.updateLastKnownContentId('new789');

      expect(scraperService.lastKnownContentId).toBe('new789');
      expect(mockLogger.debug).toHaveBeenCalledWith('Updated last known content ID', {
        previousId: 'initial123',
        newId: 'new789',
      });
    });

    it('should cleanup resources properly', async () => {
      await scraperService.startMonitoring(jest.fn());
      expect(scraperService.isRunning).toBe(true);

      await scraperService.cleanup();

      expect(scraperService.isRunning).toBe(false);
      expect(scraperService.isInitialized).toBe(false);
      expect(scraperService.lastKnownContentId).toBeNull();
      expect(scraperService.videosUrl).toBeNull();
      expect(scraperService.liveStreamUrl).toBeNull();
      expect(mockBrowserService.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Cleaning up YouTube scraper service');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle configuration with custom values', () => {
      const customConfig = {
        get: jest.fn((key, defaultValue) => {
          const config = {
            YOUTUBE_SCRAPER_INTERVAL_MIN: '10000',
            YOUTUBE_SCRAPER_INTERVAL_MAX: '20000',
            YOUTUBE_SCRAPER_MAX_RETRIES: 5,
            YOUTUBE_SCRAPER_RETRY_DELAY_MS: 3000,
            YOUTUBE_SCRAPER_TIMEOUT_MS: 60000,
          };
          return config[key] || defaultValue;
        }),
        getBoolean: jest.fn(() => false),
      };

      const customScraper = new YouTubeScraperService(mockLogger, customConfig);

      expect(customScraper.minInterval).toBe(10000);
      expect(customScraper.maxInterval).toBe(20000);
      expect(customScraper.maxRetries).toBe(5);
      expect(customScraper.retryDelayMs).toBe(3000);
      expect(customScraper.timeoutMs).toBe(60000);
    });

    it('should handle null/undefined callback in monitoring', async () => {
      mockBrowserService.evaluate.mockResolvedValue({
        id: 'initial123',
        title: 'Initial Video',
        url: 'https://www.youtube.com/watch?v=initial123',
      });
      await scraperService.initialize('testchannel');

      // Should not throw error with null callback
      await expect(scraperService.startMonitoring(null)).resolves.not.toThrow();

      // Advance timer to trigger monitoring loop
      mockBrowserService.evaluate.mockResolvedValue({
        id: 'new123',
        title: 'New Video',
        url: 'https://www.youtube.com/watch?v=new123',
      });

      await jest.advanceTimersByTimeAsync(15000);

      // Should not have thrown error despite null callback
      expect(scraperService.isRunning).toBe(true);
    });
  });

  describe('YouTube Authentication', () => {
    let authenticatedService;
    let authConfig;

    beforeEach(() => {
      jest.clearAllMocks();

      authConfig = {
        get: jest.fn((key, defaultValue) => {
          const config = {
            YOUTUBE_SCRAPER_INTERVAL_MIN: '30000',
            YOUTUBE_SCRAPER_INTERVAL_MAX: '60000',
            YOUTUBE_SCRAPER_MAX_RETRIES: 3,
            YOUTUBE_SCRAPER_RETRY_DELAY_MS: 5000,
            YOUTUBE_SCRAPER_TIMEOUT_MS: 30000,
            YOUTUBE_AUTHENTICATION_ENABLED: 'true',
            YOUTUBE_USERNAME: 'test@example.com',
            YOUTUBE_PASSWORD: 'testpassword',
          };
          return config[key] || defaultValue;
        }),
        getBoolean: jest.fn((key, defaultValue) => {
          const config = {
            YOUTUBE_AUTHENTICATION_ENABLED: true,
          };
          return config[key] !== undefined ? config[key] : defaultValue;
        }),
      };

      authenticatedService = new YouTubeScraperService(mockLogger, authConfig);
      authenticatedService.browserService = mockBrowserService;
    });

    afterEach(async () => {
      await authenticatedService.cleanup();
    });

    describe('Authentication Configuration', () => {
      it('should initialize with authentication enabled', () => {
        expect(authenticatedService.authEnabled).toBe(true);
        expect(authenticatedService.youtubeUsername).toBe('test@example.com');
        expect(authenticatedService.youtubePassword).toBe('testpassword');
        expect(authenticatedService.isAuthenticated).toBe(false);
      });

      it('should disable authentication when not configured', () => {
        const noAuthConfig = {
          get: jest.fn(() => ''),
          getBoolean: jest.fn(() => false),
        };
        const noAuthService = new YouTubeScraperService(mockLogger, noAuthConfig);
        expect(noAuthService.authEnabled).toBe(false);
      });

      it('should include auth status in metrics', () => {
        const metrics = authenticatedService.getMetrics();
        expect(metrics.authEnabled).toBe(true);
        expect(metrics.isAuthenticated).toBe(false);
        expect(metrics.configuration.authEnabled).toBe(true);
      });
    });

    describe('Main Authentication Flow', () => {
      it('should perform successful authentication', async () => {
        // Mock individual helper methods instead of complex waitForSelector chains
        jest.spyOn(authenticatedService, 'handleCookieConsent').mockResolvedValue();
        jest.spyOn(authenticatedService, 'handleAccountChallenges').mockResolvedValue(true);
        jest.spyOn(authenticatedService, 'handle2FA').mockResolvedValue(true);
        jest.spyOn(authenticatedService, 'handleCaptcha').mockResolvedValue(true);
        jest.spyOn(authenticatedService, 'handleDeviceVerification').mockResolvedValue();

        // Mock the basic browser operations
        mockBrowserService.waitForSelector.mockResolvedValue();
        mockBrowserService.evaluate.mockResolvedValueOnce(true); // Sign-in detection

        await authenticatedService.authenticateWithYouTube();

        expect(mockBrowserService.goto).toHaveBeenCalledWith(
          'https://accounts.google.com/signin/v2/identifier?service=youtube'
        );
        expect(mockBrowserService.type).toHaveBeenCalledWith('input[type="email"]', 'test@example.com');
        expect(mockBrowserService.type).toHaveBeenCalledWith('input[type="password"]', 'testpassword');
        expect(mockBrowserService.click).toHaveBeenCalledWith('#identifierNext');
        expect(mockBrowserService.click).toHaveBeenCalledWith('#passwordNext');
        expect(authenticatedService.isAuthenticated).toBe(true);
        expect(mockLogger.info).toHaveBeenCalledWith('✅ Successfully authenticated with YouTube');
      });

      it('should skip authentication when disabled', async () => {
        authenticatedService.authEnabled = false;

        await authenticatedService.authenticateWithYouTube();

        expect(mockBrowserService.goto).not.toHaveBeenCalled();
        expect(mockLogger.debug).toHaveBeenCalledWith('YouTube authentication is disabled');
      });

      it('should skip authentication when credentials missing', async () => {
        authenticatedService.youtubeUsername = '';
        authenticatedService.youtubePassword = '';

        await authenticatedService.authenticateWithYouTube();

        expect(mockBrowserService.goto).not.toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalledWith('YouTube authentication enabled but credentials not provided');
      });

      it('should handle authentication failures gracefully', async () => {
        mockBrowserService.goto.mockRejectedValue(new Error('Navigation failed'));

        await authenticatedService.authenticateWithYouTube();

        expect(authenticatedService.isAuthenticated).toBe(false);
        expect(mockLogger.error).toHaveBeenCalledWith('Failed to authenticate with YouTube:', {
          error: 'Navigation failed',
          stack: expect.any(String),
        });
        expect(mockLogger.warn).toHaveBeenCalledWith('Continuing without YouTube authentication');
      });

      it('should warn when authentication may have failed', async () => {
        // Mock helper methods to succeed
        jest.spyOn(authenticatedService, 'handleCookieConsent').mockResolvedValue();
        jest.spyOn(authenticatedService, 'handleAccountChallenges').mockResolvedValue(true);
        jest.spyOn(authenticatedService, 'handle2FA').mockResolvedValue(true);
        jest.spyOn(authenticatedService, 'handleCaptcha').mockResolvedValue(true);
        jest.spyOn(authenticatedService, 'handleDeviceVerification').mockResolvedValue();

        // Mock basic operations to succeed but sign-in detection fails
        mockBrowserService.waitForSelector.mockResolvedValue();
        mockBrowserService.evaluate.mockResolvedValueOnce(false); // Sign-in detection fails

        await authenticatedService.authenticateWithYouTube();

        expect(authenticatedService.isAuthenticated).toBe(false);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'YouTube authentication may have failed - proceeding without authentication'
        );
      });
    });

    describe('Cookie Consent Handling', () => {
      it('should handle cookie consent successfully', async () => {
        mockBrowserService.waitForSelector.mockResolvedValueOnce(); // Cookie consent found
        mockBrowserService.click.mockResolvedValueOnce();

        await authenticatedService.handleCookieConsent();

        expect(mockBrowserService.waitForSelector).toHaveBeenCalledWith('button:has-text("Accept all")', {
          timeout: 3000,
        });
        expect(mockBrowserService.click).toHaveBeenCalled();
        expect(mockLogger.debug).toHaveBeenCalledWith('Clicked cookie consent button: button:has-text("Accept all")');
      });

      it('should handle no cookie consent banner gracefully', async () => {
        mockBrowserService.waitForSelector.mockRejectedValue(new Error('Selector timeout'));

        await authenticatedService.handleCookieConsent();

        expect(mockLogger.debug).toHaveBeenCalledWith('No cookie consent banner found');
      });

      it('should try multiple consent selectors', async () => {
        // First selector fails, second succeeds
        mockBrowserService.waitForSelector.mockRejectedValueOnce(new Error('Not found')).mockResolvedValueOnce();

        await authenticatedService.handleCookieConsent();

        expect(mockBrowserService.waitForSelector).toHaveBeenCalledTimes(2);
        expect(mockBrowserService.click).toHaveBeenCalled();
      });
    });

    describe('Account Security Challenges', () => {
      it('should detect email verification challenge', async () => {
        mockBrowserService.waitForSelector.mockResolvedValueOnce(); // Email challenge found

        const result = await authenticatedService.handleAccountChallenges();

        expect(result).toBe(false);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Email verification challenge detected - requires manual intervention'
        );
        expect(mockLogger.info).toHaveBeenCalledWith('Please check your email and complete verification manually');
      });

      it('should detect phone verification challenge', async () => {
        mockBrowserService.waitForSelector
          .mockRejectedValueOnce(new Error('Email not found')) // No email challenge
          .mockRejectedValueOnce(new Error('Email not found')) // No email challenge
          .mockRejectedValueOnce(new Error('Email not found')) // No email challenge
          .mockResolvedValueOnce(); // Phone challenge found

        const result = await authenticatedService.handleAccountChallenges();

        expect(result).toBe(false);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Phone verification challenge detected - requires manual intervention'
        );
      });

      it('should return true when no challenges detected', async () => {
        mockBrowserService.waitForSelector.mockRejectedValue(new Error('Not found'));

        const result = await authenticatedService.handleAccountChallenges();

        expect(result).toBe(true);
      });
    });

    describe('2FA/MFA Handling', () => {
      it('should detect 2FA challenge', async () => {
        mockBrowserService.waitForSelector.mockResolvedValueOnce(); // 2FA input found

        const result = await authenticatedService.handle2FA();

        expect(result).toBe(false);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          '2FA challenge detected - authentication cannot proceed automatically'
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Please disable 2FA for this account or handle authentication manually'
        );
      });

      it('should return true when no 2FA present', async () => {
        mockBrowserService.waitForSelector.mockRejectedValue(new Error('Not found'));

        const result = await authenticatedService.handle2FA();

        expect(result).toBe(true);
      });

      it('should try multiple 2FA selectors', async () => {
        mockBrowserService.waitForSelector
          .mockRejectedValueOnce(new Error('Not found'))
          .mockRejectedValueOnce(new Error('Not found'))
          .mockResolvedValueOnce(); // Third selector succeeds

        const result = await authenticatedService.handle2FA();

        expect(result).toBe(false);
        expect(mockBrowserService.waitForSelector).toHaveBeenCalledTimes(3);
      });
    });

    describe('CAPTCHA Detection', () => {
      it('should detect CAPTCHA challenge', async () => {
        mockBrowserService.waitForSelector.mockResolvedValueOnce(); // CAPTCHA found

        const result = await authenticatedService.handleCaptcha();

        expect(result).toBe(false);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'CAPTCHA challenge detected - authentication cannot proceed automatically'
        );
        expect(mockLogger.info).toHaveBeenCalledWith('Manual intervention required to complete CAPTCHA verification');
      });

      it('should return true when no CAPTCHA present', async () => {
        mockBrowserService.waitForSelector.mockRejectedValue(new Error('Not found'));

        const result = await authenticatedService.handleCaptcha();

        expect(result).toBe(true);
      });

      it('should detect various CAPTCHA types', async () => {
        // Test different CAPTCHA selectors
        const captchaSelectors = [
          '[data-sitekey]',
          '.g-recaptcha',
          '#recaptcha',
          '[src*="captcha"]',
          'iframe[src*="recaptcha"]',
        ];

        for (let i = 0; i < captchaSelectors.length; i++) {
          mockBrowserService.waitForSelector.mockImplementation(selector => {
            if (selector === captchaSelectors[i]) {
              return Promise.resolve();
            }
            return Promise.reject(new Error('Not found'));
          });

          const result = await authenticatedService.handleCaptcha();
          expect(result).toBe(false);
        }
      });
    });

    describe('Device Verification Handling', () => {
      it('should handle device verification prompts', async () => {
        mockBrowserService.waitForSelector.mockResolvedValueOnce();
        mockBrowserService.click.mockResolvedValueOnce();

        await authenticatedService.handleDeviceVerification();

        expect(mockBrowserService.click).toHaveBeenCalled();
        expect(mockLogger.debug).toHaveBeenCalledWith('Handled device verification: button:has-text("Not now")');
      });

      it('should try multiple device verification selectors', async () => {
        mockBrowserService.waitForSelector.mockRejectedValueOnce(new Error('Not found')).mockResolvedValueOnce();

        await authenticatedService.handleDeviceVerification();

        expect(mockBrowserService.waitForSelector).toHaveBeenCalledTimes(2);
        expect(mockBrowserService.click).toHaveBeenCalled();
      });

      it('should handle when no device verification present', async () => {
        mockBrowserService.waitForSelector.mockRejectedValue(new Error('Not found'));

        // Should not throw error
        await expect(authenticatedService.handleDeviceVerification()).resolves.not.toThrow();
        expect(mockBrowserService.click).not.toHaveBeenCalled();
      });
    });

    describe('Integration with Initialization', () => {
      it('should call authentication during initialization when enabled', async () => {
        const authSpy = jest.spyOn(authenticatedService, 'authenticateWithYouTube').mockResolvedValue();
        mockBrowserService.evaluate.mockResolvedValue({
          id: 'test123',
          title: 'Test Video',
          url: 'https://www.youtube.com/watch?v=test123',
        });

        await authenticatedService.initialize('testchannel');

        expect(authSpy).toHaveBeenCalled();
        expect(authenticatedService.isInitialized).toBe(true);
      });

      it('should skip authentication during initialization when disabled', async () => {
        const noAuthService = new YouTubeScraperService(mockLogger, mockConfig);
        noAuthService.browserService = mockBrowserService;
        const authSpy = jest.spyOn(noAuthService, 'authenticateWithYouTube');

        mockBrowserService.evaluate.mockResolvedValue({
          id: 'test123',
          title: 'Test Video',
          url: 'https://www.youtube.com/watch?v=test123',
        });

        await noAuthService.initialize('testchannel');

        expect(authSpy).not.toHaveBeenCalled();
        expect(noAuthService.isInitialized).toBe(true);
      });
    });

    describe('Health Check with Authentication', () => {
      it('should include authentication status in health check', async () => {
        authenticatedService.isAuthenticated = true;
        mockBrowserService.evaluate.mockResolvedValue({
          id: 'health123',
          title: 'Health Video',
          url: 'https://www.youtube.com/watch?v=health123',
        });

        await authenticatedService.initialize('testchannel');
        const health = await authenticatedService.healthCheck();

        expect(health.status).toBe('healthy');
        expect(health.details.metrics.authEnabled).toBe(true);
        expect(health.details.metrics.isAuthenticated).toBe(true);
      });

      it('should provide authentication failure hints when enabled but not authenticated', async () => {
        authenticatedService.isAuthenticated = false;
        mockBrowserService.evaluate.mockResolvedValue(null); // No videos found

        await authenticatedService.initialize('testchannel');
        const health = await authenticatedService.healthCheck();

        expect(health.status).toBe('no_videos_found');
        expect(health.details.possibleCause).toBe('Authentication enabled but not authenticated');
      });

      it('should log detailed error information during health check failures', async () => {
        // Initialize first
        mockBrowserService.evaluate.mockResolvedValueOnce({
          id: 'init123',
          title: 'Init Video',
        });
        await authenticatedService.initialize('testchannel');

        // Clear previous mocks and make health check goto fail with error
        jest.clearAllMocks();
        const healthError = new Error('Health check network error');
        mockBrowserService.goto.mockRejectedValue(healthError);

        const health = await authenticatedService.healthCheck();

        // The health check catches the error and returns 'no_videos_found' status
        // but logs the error details
        expect(health.status).toBe('no_videos_found');
        expect(health.details.warning).toBe('No videos found during health check');
        expect(mockLogger.error).toHaveBeenCalledWith('Failed to scrape YouTube channel', {
          error: 'Health check network error',
          stack: expect.any(String),
          videosUrl: 'https://www.youtube.com/@testchannel/videos',
          attempt: expect.any(Number),
        });
      });
    });
  });
});
