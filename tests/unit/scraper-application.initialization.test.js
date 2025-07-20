import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ScraperApplication } from '../../src/application/scraper-application.js';

describe('ScraperApplication Initialization', () => {
  let scraperApp;
  let mockDependencies;
  let mockConfig;
  let mockBrowserService;
  let mockClassifier;
  let mockAnnouncer;
  let mockStateManager;
  let mockLogger;
  let mockAuthManager;
  let mockEventBus;

  beforeEach(() => {
    // Mock all dependencies
    mockConfig = {
      getRequired: jest.fn(),
      get: jest.fn(),
      getBoolean: jest.fn(),
    };

    mockBrowserService = {
      launch: jest.fn(),
      close: jest.fn(),
      goto: jest.fn(),
      waitForSelector: jest.fn(),
      evaluate: jest.fn(),
      setUserAgent: jest.fn(),
      isRunning: jest.fn().mockReturnValue(false),
    };

    mockClassifier = {
      classifyXContent: jest.fn(),
    };

    mockAnnouncer = {
      announceContent: jest.fn(),
    };

    mockStateManager = {
      get: jest.fn(),
      set: jest.fn(),
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    mockAuthManager = {
      login: jest.fn(),
      ensureAuthenticated: jest.fn(),
    };

    mockEventBus = {
      emit: jest.fn(),
      on: jest.fn(),
    };

    mockDependencies = {
      browserService: mockBrowserService,
      contentClassifier: mockClassifier,
      contentAnnouncer: mockAnnouncer,
      config: mockConfig,
      stateManager: mockStateManager,
      discordService: {},
      eventBus: mockEventBus,
      logger: mockLogger,
      authManager: mockAuthManager,
    };

    // Setup config defaults
    mockConfig.getRequired.mockImplementation(key => {
      const values = {
        X_USER_HANDLE: 'testuser',
        TWITTER_USERNAME: 'testuser',
        TWITTER_PASSWORD: 'testpass',
      };
      return values[key];
    });

    mockConfig.get.mockImplementation((key, defaultValue) => {
      const values = {
        X_QUERY_INTERVAL_MIN: '300000',
        X_QUERY_INTERVAL_MAX: '600000',
        INITIALIZATION_WINDOW_HOURS: '24',
      };
      return values[key] || defaultValue;
    });

    mockConfig.getBoolean.mockImplementation((key, defaultValue) => {
      const values = {
        ANNOUNCE_OLD_TWEETS: false,
        ENABLE_RETWEET_PROCESSING: true,
      };
      return values[key] ?? defaultValue;
    });

    scraperApp = new ScraperApplication(mockDependencies);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeRecentContent', () => {
    it('should mark recent tweets as seen during initialization', async () => {
      // Mock recent tweets from the last 24 hours
      const now = new Date();
      const recentTweets = [
        {
          tweetID: '123456789',
          timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
          author: 'testuser',
          text: 'Recent tweet',
          url: 'https://x.com/testuser/status/123456789',
        },
        {
          tweetID: '987654321',
          timestamp: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago
          author: 'testuser',
          text: 'Another recent tweet',
          url: 'https://x.com/testuser/status/987654321',
        },
      ];

      // Mock browser navigation and tweet extraction
      mockBrowserService.goto.mockResolvedValue();
      mockBrowserService.evaluate.mockResolvedValue(recentTweets);

      // Mock the navigateToProfileTimeline method
      scraperApp.navigateToProfileTimeline = jest.fn().mockResolvedValue();

      await scraperApp.initializeRecentContent();

      // Verify navigation to profile
      expect(scraperApp.navigateToProfileTimeline).toHaveBeenCalledWith('testuser');

      // Verify tweets were marked as seen
      expect(scraperApp.duplicateDetector.isDuplicate('https://x.com/testuser/status/123456789')).toBe(true);
      expect(scraperApp.duplicateDetector.isDuplicate('https://x.com/testuser/status/987654321')).toBe(true);

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing with recent content to prevent old post announcements...'
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Found 2 recent tweets during initialization scan');
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringMatching(/marked 2 recent posts as seen/));
    });

    it('should filter out old tweets during initialization', async () => {
      const now = new Date();
      const tweets = [
        {
          tweetID: '123456789',
          timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago (recent)
          author: 'testuser',
          url: 'https://x.com/testuser/status/123456789',
        },
        {
          tweetID: '987654321',
          timestamp: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago (old)
          author: 'testuser',
          url: 'https://x.com/testuser/status/987654321',
        },
      ];

      mockBrowserService.goto.mockResolvedValue();
      mockBrowserService.evaluate.mockResolvedValue(tweets);
      scraperApp.navigateToProfileTimeline = jest.fn().mockResolvedValue();

      await scraperApp.initializeRecentContent();

      // Only recent tweet should be marked as seen
      expect(scraperApp.duplicateDetector.isDuplicate('https://x.com/testuser/status/123456789')).toBe(true);
      expect(scraperApp.duplicateDetector.isDuplicate('https://x.com/testuser/status/987654321')).toBe(false);
    });

    it('should handle initialization errors gracefully', async () => {
      mockBrowserService.goto.mockRejectedValue(new Error('Navigation failed'));
      scraperApp.navigateToProfileTimeline = jest.fn().mockRejectedValue(new Error('Navigation failed'));

      // Should not throw - initialization is best-effort
      await expect(scraperApp.initializeRecentContent()).resolves.not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith('Error during recent content initialization:', expect.any(Error));
      expect(mockLogger.warn).toHaveBeenCalledWith('Continuing with normal operation despite initialization error');
    });

    it('should use configurable initialization window', async () => {
      // Configure 6-hour window instead of default 24
      mockConfig.get.mockImplementation((key, defaultValue) => {
        if (key === 'INITIALIZATION_WINDOW_HOURS') {
          return '6';
        }
        return defaultValue;
      });

      const now = new Date();
      const tweets = [
        {
          tweetID: '123456789',
          timestamp: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago (within 6h window)
          url: 'https://x.com/testuser/status/123456789',
        },
        {
          tweetID: '987654321',
          timestamp: new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString(), // 8 hours ago (outside 6h window)
          url: 'https://x.com/testuser/status/987654321',
        },
      ];

      mockBrowserService.evaluate.mockResolvedValue(tweets);
      scraperApp.navigateToProfileTimeline = jest.fn().mockResolvedValue();

      await scraperApp.initializeRecentContent();

      // Only tweet within 6-hour window should be marked
      expect(scraperApp.duplicateDetector.isDuplicate('https://x.com/testuser/status/123456789')).toBe(true);
      expect(scraperApp.duplicateDetector.isDuplicate('https://x.com/testuser/status/987654321')).toBe(false);
    });
  });

  describe('isNewContent with improved logic', () => {
    it('should return false for already known tweets', () => {
      const tweet = {
        tweetID: '123456789',
        timestamp: new Date().toISOString(),
        url: 'https://x.com/testuser/status/123456789',
      };

      // Mark tweet as seen
      scraperApp.duplicateDetector.markAsSeen('https://x.com/testuser/status/123456789');

      expect(scraperApp.isNewContent(tweet)).toBe(false);
    });

    it('should return false for very old tweets', () => {
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days ago
      const tweet = { tweetID: '123456789', timestamp: oldDate.toISOString() };

      expect(scraperApp.isNewContent(tweet)).toBe(false);
    });

    it('should return true for recent unknown tweets', () => {
      const recentDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const tweet = { tweetID: '123456789', timestamp: recentDate.toISOString() };

      expect(scraperApp.isNewContent(tweet)).toBe(true);
    });

    it('should be permissive for tweets during bot startup period', () => {
      const botStartTime = new Date();
      const tweetBeforeStart = new Date(botStartTime.getTime() - 30 * 60 * 1000); // 30 mins before bot start

      mockStateManager.get.mockReturnValue(botStartTime);

      const tweet = { tweetID: '123456789', timestamp: tweetBeforeStart.toISOString() };

      // Should be permissive since bot just started
      expect(scraperApp.isNewContent(tweet)).toBe(true);
    });

    it('should respect ANNOUNCE_OLD_TWEETS setting', () => {
      mockConfig.getBoolean.mockImplementation(key => {
        if (key === 'ANNOUNCE_OLD_TWEETS') {
          return true;
        }
        return false;
      });

      const veryOldTweet = {
        tweetID: '123456789',
        timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
      };

      expect(scraperApp.isNewContent(veryOldTweet)).toBe(true);
    });
  });
});
