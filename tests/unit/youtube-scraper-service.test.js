import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { YouTubeScraperService } from '../../src/services/implementations/youtube-scraper-service.js';

jest.mock('../../src/services/implementations/playwright-browser-service.js', () => {
  return jest.fn().mockImplementation(() => ({
    launch: jest.fn(),
    setUserAgent: jest.fn(),
    setViewport: jest.fn(),
    goto: jest.fn(),
    waitFor: jest.fn(),
    evaluate: jest.fn(),
    close: jest.fn(),
    isRunning: jest.fn(() => true),
  }));
});

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
        };
        return config[key] || defaultValue;
      }),
    };

    scraperService = new YouTubeScraperService(mockLogger, mockConfig);
    mockBrowserService = scraperService.browserService;
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
      expect(scraperService.channelUrl).toBe('https://www.youtube.com/@testchannel/videos');
      expect(scraperService.lastKnownVideoId).toBe('dQw4w9WgXcQ');
      expect(mockBrowserService.launch).toHaveBeenCalledWith({
        headless: true,
        args: expect.arrayContaining(['--no-sandbox', '--disable-setuid-sandbox']),
      });
      expect(mockLogger.info).toHaveBeenCalledWith('YouTube scraper initialized', {
        channelUrl: 'https://www.youtube.com/@testchannel/videos',
        lastKnownVideoId: 'dQw4w9WgXcQ',
        title: 'Test Video',
      });
    });

    it('should handle initialization when no videos are found', async () => {
      mockBrowserService.evaluate.mockResolvedValue(null);

      await scraperService.initialize('emptychannel');

      expect(scraperService.isInitialized).toBe(true);
      expect(scraperService.lastKnownVideoId).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith('YouTube scraper initialized but no videos found', {
        channelUrl: 'https://www.youtube.com/@emptychannel/videos',
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
        channelUrl: 'https://www.youtube.com/@testchannel/videos',
      });
    });
  });

  describe('Video Fetching', () => {
    beforeEach(async () => {
      mockBrowserService.evaluate.mockResolvedValue({
        id: 'initial123',
        title: 'Initial Video',
        url: 'https://www.youtube.com/watch?v=initial123',
      });
      await scraperService.initialize('testchannel');
      jest.clearAllMocks();
    });

    it('should fetch latest video successfully', async () => {
      const mockVideo = {
        id: 'latest456',
        title: 'Latest Video',
        url: 'https://www.youtube.com/watch?v=latest456',
        publishedText: '30 minutes ago',
        viewsText: '1.2K views',
        thumbnailUrl: 'https://i.ytimg.com/vi/latest456/hqdefault.jpg',
        scrapedAt: expect.any(String),
      };

      mockBrowserService.evaluate.mockResolvedValue(mockVideo);

      const result = await scraperService.fetchLatestVideo();

      expect(result).toEqual(mockVideo);
      expect(mockBrowserService.goto).toHaveBeenCalledWith('https://www.youtube.com/@testchannel/videos', {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
      expect(scraperService.metrics.totalScrapingAttempts).toBe(1);
      expect(scraperService.metrics.successfulScrapes).toBe(1);
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
        channelUrl: 'https://www.youtube.com/@testchannel/videos',
        attempt: 1,
      });
    });

    it('should throw error if not initialized', async () => {
      const uninitializedScraper = new YouTubeScraperService(mockLogger, mockConfig);

      await expect(uninitializedScraper.fetchLatestVideo()).rejects.toThrow('YouTube scraper is not initialized');
    });
  });

  describe('New Video Detection', () => {
    beforeEach(async () => {
      mockBrowserService.evaluate.mockResolvedValue({
        id: 'initial123',
        title: 'Initial Video',
        url: 'https://www.youtube.com/watch?v=initial123',
      });
      await scraperService.initialize('testchannel');
      jest.clearAllMocks();
    });

    it('should detect new video when video ID changes', async () => {
      const newVideo = {
        id: 'new456',
        title: 'New Video',
        url: 'https://www.youtube.com/watch?v=new456',
        publishedText: '5 minutes ago',
      };

      mockBrowserService.evaluate.mockResolvedValue(newVideo);

      const result = await scraperService.checkForNewVideo();

      expect(result).toEqual(newVideo);
      expect(scraperService.lastKnownVideoId).toBe('new456');
      expect(scraperService.metrics.videosDetected).toBe(1);
      expect(mockLogger.info).toHaveBeenCalledWith('New video detected via scraping', {
        videoId: 'new456',
        title: 'New Video',
        previousVideoId: 'initial123',
      });
    });

    it('should return null when no new video is found', async () => {
      const sameVideo = {
        id: 'initial123',
        title: 'Initial Video (updated)',
        url: 'https://www.youtube.com/watch?v=initial123',
      };

      mockBrowserService.evaluate.mockResolvedValue(sameVideo);

      const result = await scraperService.checkForNewVideo();

      expect(result).toBeNull();
      expect(scraperService.lastKnownVideoId).toBe('initial123');
      expect(scraperService.metrics.videosDetected).toBe(0);
    });

    it('should return null when fetching fails', async () => {
      mockBrowserService.goto.mockRejectedValue(new Error('Network error'));

      const result = await scraperService.checkForNewVideo();

      expect(result).toBeNull();
      expect(scraperService.metrics.failedScrapes).toBe(1);
    });
  });

  describe('Continuous Monitoring', () => {
    let onNewVideoCallback;

    beforeEach(async () => {
      onNewVideoCallback = jest.fn();
      mockBrowserService.evaluate.mockResolvedValue({
        id: 'initial123',
        title: 'Initial Video',
        url: 'https://www.youtube.com/watch?v=initial123',
      });
      await scraperService.initialize('testchannel');
      jest.clearAllMocks();
    });

    it('should start monitoring and detect new videos', async () => {
      const newVideo = {
        id: 'new789',
        title: 'New Monitored Video',
        url: 'https://www.youtube.com/watch?v=new789',
      };

      // First call returns same video, second call returns new video
      mockBrowserService.evaluate
        .mockResolvedValueOnce({
          id: 'initial123',
          title: 'Initial Video',
          url: 'https://www.youtube.com/watch?v=initial123',
        })
        .mockResolvedValueOnce(newVideo);

      await scraperService.startMonitoring(onNewVideoCallback);

      expect(scraperService.isRunning).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Starting YouTube scraper monitoring', {
        intervalMs: 15000,
        channelUrl: 'https://www.youtube.com/@testchannel/videos',
      });

      // Fast-forward time to trigger monitoring loop twice
      await jest.advanceTimersByTimeAsync(15000);
      await jest.advanceTimersByTimeAsync(15000);

      expect(onNewVideoCallback).toHaveBeenCalledWith(newVideo);
    });

    it('should stop monitoring when requested', async () => {
      await scraperService.startMonitoring(onNewVideoCallback);
      expect(scraperService.isRunning).toBe(true);

      await scraperService.stopMonitoring();

      expect(scraperService.isRunning).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('YouTube scraper monitoring stopped');
    });

    it('should handle errors in monitoring loop gracefully', async () => {
      mockBrowserService.goto.mockRejectedValue(new Error('Monitoring error'));

      await scraperService.startMonitoring(onNewVideoCallback);

      // Advance timer to trigger monitoring loop
      await jest.advanceTimersByTimeAsync(15000);

      expect(mockLogger.error).toHaveBeenCalledWith('Error in YouTube scraper monitoring loop', {
        error: 'Monitoring error',
        stack: expect.any(String),
      });
      expect(onNewVideoCallback).not.toHaveBeenCalled();
      expect(scraperService.isRunning).toBe(true); // Should continue running despite error
    });

    it('should warn if monitoring is already running', async () => {
      await scraperService.startMonitoring(onNewVideoCallback);

      await scraperService.startMonitoring(onNewVideoCallback);

      expect(mockLogger.warn).toHaveBeenCalledWith('YouTube scraper monitoring is already running');
    });

    it('should throw error if not initialized', async () => {
      const uninitializedScraper = new YouTubeScraperService(mockLogger, mockConfig);

      await expect(uninitializedScraper.startMonitoring(onNewVideoCallback)).rejects.toThrow(
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
    });

    it('should return accurate metrics', async () => {
      // Simulate some scraping activity
      mockBrowserService.evaluate.mockResolvedValue({
        id: 'test456',
        title: 'Test Video',
        url: 'https://www.youtube.com/watch?v=test456',
      });

      await scraperService.fetchLatestVideo(); // Success
      mockBrowserService.goto.mockRejectedValue(new Error('Network error'));
      await scraperService.fetchLatestVideo(); // Failure

      const metrics = scraperService.getMetrics();

      expect(metrics).toEqual({
        totalScrapingAttempts: 2,
        successfulScrapes: 1,
        failedScrapes: 1,
        videosDetected: 1, // Video ID changed from initial123 to test456
        lastSuccessfulScrape: expect.any(Date),
        lastError: {
          message: 'Network error',
          timestamp: expect.any(Date),
        },
        successRate: 50,
        isInitialized: true,
        isRunning: false,
        lastKnownVideoId: 'test456',
        channelUrl: 'https://www.youtube.com/@testchannel/videos',
        configuration: {
          scrapingIntervalMs: 15000,
          maxRetries: 3,
          timeoutMs: 30000,
        },
      });
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
      expect(health.details.lastVideoId).toBe('health123');
      expect(health.details.lastVideoTitle).toBe('Health Check Video');
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

      expect(health.status).toBe('error');
      expect(health.details.error).toBe('Health check failed');
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

    it('should update last known video ID', () => {
      scraperService.updateLastKnownVideoId('new789');

      expect(scraperService.lastKnownVideoId).toBe('new789');
      expect(mockLogger.debug).toHaveBeenCalledWith('Updated last known video ID', {
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
      expect(scraperService.lastKnownVideoId).toBeNull();
      expect(scraperService.channelUrl).toBeNull();
      expect(mockBrowserService.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Cleaning up YouTube scraper service');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle configuration with custom values', () => {
      const customConfig = {
        get: jest.fn((key, defaultValue) => {
          const config = {
            YOUTUBE_SCRAPER_INTERVAL_MS: 10000,
            YOUTUBE_SCRAPER_MAX_RETRIES: 5,
            YOUTUBE_SCRAPER_RETRY_DELAY_MS: 3000,
            YOUTUBE_SCRAPER_TIMEOUT_MS: 60000,
          };
          return config[key] || defaultValue;
        }),
      };

      const customScraper = new YouTubeScraperService(mockLogger, customConfig);

      expect(customScraper.scrapingIntervalMs).toBe(10000);
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
});
