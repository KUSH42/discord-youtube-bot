import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ScraperApplication } from '../../src/application/scraper-application.js';
import { DuplicateDetector } from '../../src/duplicate-detector.js';

describe('ScraperApplication', () => {
  let scraperApp;
  let mockBrowserService;
  let mockContentClassifier;
  let mockContentAnnouncer;
  let mockConfig;
  let mockStateManager;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    // Mock browser service
    mockBrowserService = {
      launch: jest.fn(),
      close: jest.fn(),
      isRunning: jest.fn(() => true),
      goto: jest.fn(),
      waitForSelector: jest.fn(),
      type: jest.fn(),
      click: jest.fn(),
      waitForNavigation: jest.fn(),
      evaluate: jest.fn(),
      page: {
        url: jest.fn(() => 'https://x.com/home'),
        screenshot: jest.fn(),
      },
    };

    // Mock content classifier
    mockContentClassifier = {
      classifyXContent: jest.fn(() => ({ type: 'post' })),
    };

    // Mock content announcer
    mockContentAnnouncer = {
      announceContent: jest.fn(() => Promise.resolve({ success: true })),
    };

    // Mock config
    mockConfig = {
      getRequired: jest.fn((key) => {
        const values = {
          X_USER_HANDLE: 'testuser',
          TWITTER_USERNAME: 'testuser',
          TWITTER_PASSWORD: 'testpass',
        };
        return values[key] || `mock-${key}`;
      }),
      get: jest.fn((key, defaultValue) => {
        const values = {
          X_QUERY_INTERVALL_MIN: '300000',
          X_QUERY_INTERVALL_MAX: '600000',
        };
        return values[key] || defaultValue;
      }),
      getBoolean: jest.fn((key, defaultValue) => {
        const values = {
          ANNOUNCE_OLD_TWEETS: false,
        };
        return values[key] !== undefined ? values[key] : defaultValue;
      }),
    };

    // Mock state manager
    mockStateManager = {
      get: jest.fn((key) => {
        const values = {
          botStartTime: new Date('2024-01-01T00:00:00Z'),
        };
        return values[key];
      }),
      set: jest.fn(),
    };

    // Mock event bus
    mockEventBus = {
      emit: jest.fn(),
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    
    // Mock auth manager
    const mockAuthManager = {
      ensureAuthenticated: jest.fn(),
      isAuthenticated: jest.fn().mockResolvedValue(true),
    };

    // Create scraper application instance
    scraperApp = new ScraperApplication({
      browserService: mockBrowserService,
      contentClassifier: mockContentClassifier,
      contentAnnouncer: mockContentAnnouncer,
      config: mockConfig,
      stateManager: mockStateManager,
      eventBus: mockEventBus,
      logger: mockLogger,
      authManager: mockAuthManager,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Tweet Processing and Duplicate Detection', () => {
    it('should mark all non-duplicate tweets as seen regardless of announcement', async () => {
      const mockTweets = [
        {
          tweetID: '1234567890',
          url: 'https://x.com/testuser/status/1234567890',
          author: 'testuser',
          text: 'Test tweet 1',
          timestamp: '2023-12-31T23:59:59Z', // Before bot start time
          tweetCategory: 'Post',
        },
        {
          tweetID: '1234567891',
          url: 'https://x.com/testuser/status/1234567891',
          author: 'testuser',
          text: 'Test tweet 2',
          timestamp: '2024-01-01T00:01:00Z', // After bot start time
          tweetCategory: 'Post',
        },
      ];

      // Mock duplicate detector to track what gets marked as seen
      const markAsSeenSpy = jest.spyOn(scraperApp.duplicateDetector, 'markAsSeen');
      const isDuplicateSpy = jest.spyOn(scraperApp.duplicateDetector, 'isDuplicate').mockReturnValue(false);

      const result = scraperApp.filterNewTweets(mockTweets);

      // Should mark both tweets as seen
      expect(markAsSeenSpy).toHaveBeenCalledTimes(2);
      expect(markAsSeenSpy).toHaveBeenCalledWith('https://x.com/testuser/status/1234567890');
      expect(markAsSeenSpy).toHaveBeenCalledWith('https://x.com/testuser/status/1234567891');

      // Only the new tweet should be returned for announcement
      expect(result).toHaveLength(1);
      expect(result[0].tweetID).toBe('1234567891');
    });

    it('should respect ANNOUNCE_OLD_TWEETS configuration', async () => {
      mockConfig.getBoolean.mockImplementation((key, defaultValue) => {
        if (key === 'ANNOUNCE_OLD_TWEETS') return true;
        return defaultValue;
      });

      const mockTweets = [
        {
          tweetID: '1234567890',
          url: 'https://x.com/testuser/status/1234567890',
          author: 'testuser',
          text: 'Old tweet',
          timestamp: '2023-12-31T23:59:59Z', // Before bot start time
          tweetCategory: 'Post',
        },
      ];

      jest.spyOn(scraperApp.duplicateDetector, 'isDuplicate').mockReturnValue(false);

      const result = scraperApp.filterNewTweets(mockTweets);

      // Should include the old tweet when ANNOUNCE_OLD_TWEETS is true
      expect(result).toHaveLength(1);
      expect(result[0].tweetID).toBe('1234567890');
    });

    it('should filter out duplicate tweets without re-marking them', async () => {
      const mockTweets = [
        {
          tweetID: '1234567890',
          url: 'https://x.com/testuser/status/1234567890',
          author: 'testuser',
          text: 'Duplicate tweet',
          timestamp: '2024-01-01T00:01:00Z',
          tweetCategory: 'Post',
        },
      ];

      const markAsSeenSpy = jest.spyOn(scraperApp.duplicateDetector, 'markAsSeen');
      jest.spyOn(scraperApp.duplicateDetector, 'isDuplicate').mockReturnValue(true);

      const result = scraperApp.filterNewTweets(mockTweets);

      // Should not mark duplicate tweets as seen again
      expect(markAsSeenSpy).not.toHaveBeenCalled();

      // Should return empty array for duplicates
      expect(result).toHaveLength(0);
    });

    it('should handle tweets without timestamps gracefully', async () => {
      const mockTweets = [
        {
          tweetID: '1234567890',
          url: 'https://x.com/testuser/status/1234567890',
          author: 'testuser',
          text: 'Tweet without timestamp',
          timestamp: null,
          tweetCategory: 'Post',
        },
      ];

      jest.spyOn(scraperApp.duplicateDetector, 'isDuplicate').mockReturnValue(false);

      const result = scraperApp.filterNewTweets(mockTweets);

      // Should include tweets without timestamps (treated as new)
      expect(result).toHaveLength(1);
      expect(result[0].tweetID).toBe('1234567890');
    });
  });

  describe('Tweet Processing Pipeline', () => {
    it('should process new tweets through the complete pipeline', async () => {
      const mockTweet = {
        tweetID: '1234567890',
        url: 'https://x.com/testuser/status/1234567890',
        author: 'testuser',
        text: 'Test tweet',
        timestamp: '2024-01-01T00:01:00Z',
        tweetCategory: 'Post',
      };

      await scraperApp.processNewTweet(mockTweet);

      // Should classify the tweet
      expect(mockContentClassifier.classifyXContent).toHaveBeenCalledWith(
        mockTweet.url,
        mockTweet.text,
        expect.objectContaining({
          timestamp: mockTweet.timestamp,
          author: mockTweet.author,
        }),
      );

      // Should announce the content
      expect(mockContentAnnouncer.announceContent).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'x',
          type: 'post',
          id: mockTweet.tweetID,
          url: mockTweet.url,
          author: mockTweet.author,
          text: mockTweet.text,
          timestamp: mockTweet.timestamp,
          isOld: false,
        }),
      );

      // Should emit event
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'scraper.tweet.processed',
        expect.objectContaining({
          tweet: expect.any(Object),
          classification: expect.any(Object),
          result: expect.any(Object),
          timestamp: expect.any(Date),
        }),
      );
    });

    it('should handle announcement failures gracefully', async () => {
      const mockTweet = {
        tweetID: '1234567890',
        url: 'https://x.com/testuser/status/1234567890',
        author: 'testuser',
        text: 'Test tweet',
        timestamp: '2024-01-01T00:01:00Z',
        tweetCategory: 'Post',
      };

      mockContentAnnouncer.announceContent.mockResolvedValue({
        success: false,
        reason: 'Channel not found',
      });

      await scraperApp.processNewTweet(mockTweet);

      // Should still complete processing despite announcement failure
      expect(mockContentClassifier.classifyXContent).toHaveBeenCalled();
      expect(mockContentAnnouncer.announceContent).toHaveBeenCalled();
      expect(mockEventBus.emit).toHaveBeenCalledWith('scraper.tweet.processed', expect.any(Object));
    });

    it('should bypass classifier for author-based retweets', async () => {
      const mockRetweet = {
        tweetID: '1234567890',
        url: 'https://x.com/testuser/status/1234567890',
        author: 'differentuser', // Different from xUser
        text: 'Some retweet content',
        timestamp: '2024-01-01T00:01:00Z',
        tweetCategory: 'Retweet',
      };

      await scraperApp.processNewTweet(mockRetweet);

      // Should NOT call the classifier since it's an author-based retweet
      expect(mockContentClassifier.classifyXContent).not.toHaveBeenCalled();

      // Should still announce the content as a retweet with correct author
      expect(mockContentAnnouncer.announceContent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'retweet',
          author: 'testuser', // Should be the monitored user, not the original author
          originalAuthor: 'differentuser', // Original author stored separately
          platform: 'x',
        }),
      );
    });

    it('should use classifier for same-author tweets even if marked as retweet', async () => {
      const mockTweet = {
        tweetID: '1234567890',
        url: 'https://x.com/testuser/status/1234567890',
        author: 'testuser', // Same as xUser
        text: 'Some tweet content',
        timestamp: '2024-01-01T00:01:00Z',
        tweetCategory: 'Retweet',
      };

      await scraperApp.processNewTweet(mockTweet);

      // Should call the classifier since author matches xUser
      expect(mockContentClassifier.classifyXContent).toHaveBeenCalled();
      expect(mockContentAnnouncer.announceContent).toHaveBeenCalled();
    });

    it('should use classifier for Unknown author tweets', async () => {
      const mockTweet = {
        tweetID: '1234567890',
        url: 'https://x.com/testuser/status/1234567890',
        author: 'Unknown',
        text: 'Some tweet content',
        timestamp: '2024-01-01T00:01:00Z',
        tweetCategory: 'Retweet',
      };

      await scraperApp.processNewTweet(mockTweet);

      // Should call the classifier since author is Unknown
      expect(mockContentClassifier.classifyXContent).toHaveBeenCalled();
      expect(mockContentAnnouncer.announceContent).toHaveBeenCalled();
    });
  });

  describe('Content Filtering Logic', () => {
    describe('isNewContent', () => {
      it('should return true when ANNOUNCE_OLD_TWEETS is enabled', () => {
        mockConfig.getBoolean.mockImplementation((key) => {
          if (key === 'ANNOUNCE_OLD_TWEETS') return true;
          return false;
        });

        const oldTweet = {
          tweetID: '1234567890',
          timestamp: '2023-12-31T23:59:59Z', // Before bot start time
        };

        const result = scraperApp.isNewContent(oldTweet);
        expect(result).toBe(true);
      });

      it('should return false for old tweets when ANNOUNCE_OLD_TWEETS is disabled', () => {
        mockConfig.getBoolean.mockReturnValue(false);

        const oldTweet = {
          tweetID: '1234567890',
          timestamp: '2023-12-31T23:59:59Z', // Before bot start time
        };

        const result = scraperApp.isNewContent(oldTweet);
        expect(result).toBe(false);
      });

      it('should return true for tweets after bot start time', () => {
        mockConfig.getBoolean.mockReturnValue(false);

        const newTweet = {
          tweetID: '1234567891',
          timestamp: '2024-01-01T00:01:00Z', // After bot start time
        };

        const result = scraperApp.isNewContent(newTweet);
        expect(result).toBe(true);
      });

      it('should return true when no bot start time is set', () => {
        mockStateManager.get.mockReturnValue(null);

        const tweet = {
          tweetID: '1234567890',
          timestamp: '2023-12-31T23:59:59Z',
        };

        const result = scraperApp.isNewContent(tweet);
        expect(result).toBe(true);
      });

      it('should return true when tweet has no timestamp', () => {
        const tweet = {
          tweetID: '1234567890',
          timestamp: null,
        };

        const result = scraperApp.isNewContent(tweet);
        expect(result).toBe(true);
      });
    });
  });

  describe('Polling Logic', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should set and clear nextPollTimestamp correctly', () => {
      scraperApp.scheduleNextPoll();
      expect(scraperApp.nextPollTimestamp).not.toBeNull();

      scraperApp.stopPolling();
      expect(scraperApp.nextPollTimestamp).toBeNull();
    });
  });

  describe('Duplicate Detector Integration', () => {
    it('should initialize with a DuplicateDetector instance', () => {
      expect(scraperApp.duplicateDetector).toBeInstanceOf(DuplicateDetector);
    });

    it('should include duplicate detector stats in getStats()', () => {
      const stats = scraperApp.getStats();
      expect(stats).toHaveProperty('duplicateDetectorStats');
      expect(stats.duplicateDetectorStats).toHaveProperty('knownTweetIds');
      expect(stats.duplicateDetectorStats).toHaveProperty('totalKnownIds');
    });
  });

  describe('Browser Initialization', () => {
    it('should initialize the browser with the correct settings', async () => {
      mockBrowserService.setUserAgent = jest.fn();
      await scraperApp.initializeBrowser();

      expect(mockBrowserService.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: false,
          args: expect.any(Array),
        }),
      );

      expect(mockBrowserService.setUserAgent).toHaveBeenCalledWith(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      );
    });
  });

  describe('Enhanced Scrolling and Profile Navigation', () => {
    describe('performEnhancedScrolling', () => {
      beforeEach(() => {
        // Mock setTimeout to resolve immediately
        jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
          callback();
          return 123; // Return a mock timer ID
        });
      });

      afterEach(() => {
        global.setTimeout.mockRestore();
      });

      it('should perform multiple scroll operations', async () => {
        // Mock the browser service and set it on scraperApp
        scraperApp.browser = mockBrowserService;

        // Mock the evaluate method to resolve immediately
        mockBrowserService.evaluate.mockResolvedValue();

        await scraperApp.performEnhancedScrolling();

        expect(mockBrowserService.evaluate).toHaveBeenCalledTimes(5);
        expect(mockBrowserService.evaluate).toHaveBeenCalledWith(expect.any(Function));
      });

      it('should call evaluate with scroll function for each iteration', async () => {
        scraperApp.browser = mockBrowserService;
        mockBrowserService.evaluate.mockResolvedValue();

        await scraperApp.performEnhancedScrolling();

        // Verify the correct number of evaluate calls
        expect(mockBrowserService.evaluate).toHaveBeenCalledTimes(5);

        // Verify that each call is made with a function that performs scrolling
        mockBrowserService.evaluate.mock.calls.forEach((call) => {
          expect(call[0]).toBeInstanceOf(Function);
        });
      });
    });

    describe('navigateToProfileTimeline', () => {
      beforeEach(() => {
        scraperApp.browser = mockBrowserService;
        scraperApp.performEnhancedScrolling = jest.fn().mockResolvedValue();
      });

      it('should navigate to the correct profile URL', async () => {
        const username = 'testuser';

        await scraperApp.navigateToProfileTimeline(username);

        expect(mockBrowserService.goto).toHaveBeenCalledWith('https://x.com/testuser');
      });

      it('should wait for timeline content to load', async () => {
        const username = 'testuser';

        await scraperApp.navigateToProfileTimeline(username);

        expect(mockBrowserService.waitForSelector).toHaveBeenCalledWith('[data-testid="primaryColumn"]');
      });

      it('should perform enhanced scrolling after navigation', async () => {
        const username = 'testuser';

        await scraperApp.navigateToProfileTimeline(username);

        expect(scraperApp.performEnhancedScrolling).toHaveBeenCalledTimes(1);
      });

      it('should handle navigation errors gracefully', async () => {
        const username = 'testuser';
        const navigationError = new Error('Navigation failed');

        mockBrowserService.goto.mockRejectedValue(navigationError);

        await expect(scraperApp.navigateToProfileTimeline(username)).rejects.toThrow('Navigation failed');
      });

      it('should handle selector wait timeouts gracefully', async () => {
        const username = 'testuser';
        const selectorError = new Error('Selector timeout');

        mockBrowserService.waitForSelector.mockRejectedValue(selectorError);

        await expect(scraperApp.navigateToProfileTimeline(username)).rejects.toThrow('Selector timeout');
      });
    });
  });

  describe('Search and Retweet Logic', () => {
    let mockDiscordService;

    beforeEach(() => {
      // Mock discord service
      mockDiscordService = {
        sendMessage: jest.fn(),
      };

      // Set up browser and other dependencies
      scraperApp.browser = mockBrowserService;
      scraperApp.discord = mockDiscordService;

      // Mock methods that pollXProfile depends on
      jest.spyOn(scraperApp, 'extractTweets').mockResolvedValue([]);
      jest.spyOn(scraperApp, 'filterNewTweets').mockReturnValue([]);
      jest.spyOn(scraperApp, 'processNewTweet').mockResolvedValue();
      jest.spyOn(scraperApp, 'getNextInterval').mockReturnValue(300000);
      jest.spyOn(scraperApp, 'verifyAuthentication').mockResolvedValue();

      // Mock browser evaluate method for scrolling
      mockBrowserService.evaluate.mockResolvedValue({ isLoggedIn: true });
    });

    it('should always navigate to search URL regardless of retweet processing setting', async () => {
      // Test with retweet processing enabled
      jest.spyOn(scraperApp, 'shouldProcessRetweets').mockReturnValue(true);

      await scraperApp.pollXProfile();

      // Should navigate to search URL, not profile timeline
      expect(mockBrowserService.goto).toHaveBeenCalledWith(
        expect.stringMatching(/https:\/\/x.com\/search\?q=\(from%3Atestuser\)/),
      );

      // Clear mocks for next test
      jest.clearAllMocks();

      // Test with retweet processing disabled
      jest.spyOn(scraperApp, 'shouldProcessRetweets').mockReturnValue(false);

      await scraperApp.pollXProfile();

      // Should still navigate to search URL
      expect(mockBrowserService.goto).toHaveBeenCalledWith(
        expect.stringMatching(/https:\/\/x.com\/search\?q=\(from%3Atestuser\)/),
      );
    });

    it('should generate correct search URL with date parameter', async () => {
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() - 1);
      const expectedDateString = expectedDate.toISOString().split('T')[0];

      await scraperApp.pollXProfile();

      expect(mockBrowserService.goto).toHaveBeenCalledWith(
        `https://x.com/search?q=(from%3Atestuser)%20since%3A${expectedDateString}&f=live&pf=on&src=typed_query`,
      );
    });

    it('should log polling message when starting profile poll', async () => {
      await scraperApp.pollXProfile();

      expect(mockLogger.info).toHaveBeenCalledWith('Polling X profile: @testuser');
    });

    it('should not log enhanced retweet message when disabled', async () => {
      jest.spyOn(scraperApp, 'shouldProcessRetweets').mockReturnValue(false);

      await scraperApp.pollXProfile();

      expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('Enhanced retweet detection'));
    });

    it('should prioritize search URL navigation over retweet processing', async () => {
      // Mock shouldProcessRetweets to return different values
      jest.spyOn(scraperApp, 'shouldProcessRetweets').mockReturnValue(true);

      await scraperApp.pollXProfile();

      // Should navigate to search URL first, regardless of retweet processing setting
      expect(mockBrowserService.goto).toHaveBeenCalledWith(
        expect.stringMatching(/https:\/\/x.com\/search\?q=\(from%3Atestuser\)/),
      );

      // Should then check for retweet processing
      expect(scraperApp.shouldProcessRetweets).toHaveBeenCalled();
    });

    it('should wait for content selectors after navigation', async () => {
      await scraperApp.pollXProfile();

      // Should attempt to wait for content with multiple selectors
      expect(mockBrowserService.waitForSelector).toHaveBeenCalledWith('article[data-testid="tweet"]', {
        timeout: 5000,
      });
    });

    it('should perform scrolling to load more content', async () => {
      await scraperApp.pollXProfile();

      // Should call evaluate multiple times for scrolling and content extraction
      expect(mockBrowserService.evaluate).toHaveBeenCalled();
      expect(mockBrowserService.evaluate).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should extract and process tweets after navigation', async () => {
      const mockTweets = [
        {
          tweetID: '1234567890',
          url: 'https://x.com/testuser/status/1234567890',
          author: 'testuser',
          text: 'Test tweet',
          timestamp: '2024-01-01T00:01:00Z',
        },
      ];

      scraperApp.extractTweets.mockResolvedValue(mockTweets);
      scraperApp.filterNewTweets.mockReturnValue(mockTweets);

      await scraperApp.pollXProfile();

      expect(scraperApp.extractTweets).toHaveBeenCalled();
      expect(scraperApp.filterNewTweets).toHaveBeenCalledWith(mockTweets);
      expect(scraperApp.processNewTweet).toHaveBeenCalledWith(mockTweets[0]);
    });

    it('should emit poll completion event with correct data', async () => {
      const mockTweets = [{ tweetID: '123' }];
      const newTweets = [{ tweetID: '123' }];

      scraperApp.extractTweets.mockResolvedValue(mockTweets);
      scraperApp.filterNewTweets.mockReturnValue(newTweets);

      await scraperApp.pollXProfile();

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'scraper.poll.completed',
        expect.objectContaining({
          timestamp: expect.any(Date),
          tweetsFound: 1,
          newTweets: 1,
          stats: expect.any(Object),
        }),
      );
    });
  });
});
