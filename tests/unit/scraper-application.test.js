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
        screenshot: jest.fn()
      }
    };

    // Mock content classifier
    mockContentClassifier = {
      classifyXContent: jest.fn(() => ({ type: 'post' }))
    };

    // Mock content announcer
    mockContentAnnouncer = {
      announceContent: jest.fn(() => Promise.resolve({ success: true }))
    };

    // Mock config
    mockConfig = {
      getRequired: jest.fn((key) => {
        const values = {
          'X_USER_HANDLE': 'testuser',
          'TWITTER_USERNAME': 'testuser',
          'TWITTER_PASSWORD': 'testpass'
        };
        return values[key] || `mock-${key}`;
      }),
      get: jest.fn((key, defaultValue) => {
        const values = {
          'X_QUERY_INTERVALL_MIN': '300000',
          'X_QUERY_INTERVALL_MAX': '600000'
        };
        return values[key] || defaultValue;
      }),
      getBoolean: jest.fn((key, defaultValue) => {
        const values = {
          'ANNOUNCE_OLD_TWEETS': false
        };
        return values[key] !== undefined ? values[key] : defaultValue;
      })
    };

    // Mock state manager
    mockStateManager = {
      get: jest.fn((key) => {
        const values = {
          'botStartTime': new Date('2024-01-01T00:00:00Z')
        };
        return values[key];
      }),
      set: jest.fn()
    };

    // Mock event bus
    mockEventBus = {
      emit: jest.fn()
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    // Create scraper application instance
    scraperApp = new ScraperApplication({
      browserService: mockBrowserService,
      contentClassifier: mockContentClassifier,
      contentAnnouncer: mockContentAnnouncer,
      config: mockConfig,
      stateManager: mockStateManager,
      eventBus: mockEventBus,
      logger: mockLogger
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
          tweetCategory: 'Post'
        },
        {
          tweetID: '1234567891',
          url: 'https://x.com/testuser/status/1234567891',
          author: 'testuser',
          text: 'Test tweet 2',
          timestamp: '2024-01-01T00:01:00Z', // After bot start time
          tweetCategory: 'Post'
        }
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
          tweetCategory: 'Post'
        }
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
          tweetCategory: 'Post'
        }
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
          tweetCategory: 'Post'
        }
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
        tweetCategory: 'Post'
      };

      await scraperApp.processNewTweet(mockTweet);

      // Should classify the tweet
      expect(mockContentClassifier.classifyXContent).toHaveBeenCalledWith(
        mockTweet.url,
        mockTweet.text,
        expect.objectContaining({
          timestamp: mockTweet.timestamp,
          author: mockTweet.author
        })
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
          isOld: false
        })
      );

      // Should emit event
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'scraper.tweet.processed',
        expect.objectContaining({
          tweet: expect.any(Object),
          classification: expect.any(Object),
          result: expect.any(Object),
          timestamp: expect.any(Date)
        })
      );
    });

    it('should handle announcement failures gracefully', async () => {
      const mockTweet = {
        tweetID: '1234567890',
        url: 'https://x.com/testuser/status/1234567890',
        author: 'testuser',
        text: 'Test tweet',
        timestamp: '2024-01-01T00:01:00Z',
        tweetCategory: 'Post'
      };

      mockContentAnnouncer.announceContent.mockResolvedValue({
        success: false,
        reason: 'Channel not found'
      });

      await scraperApp.processNewTweet(mockTweet);

      // Should still complete processing despite announcement failure
      expect(mockContentClassifier.classifyXContent).toHaveBeenCalled();
      expect(mockContentAnnouncer.announceContent).toHaveBeenCalled();
      expect(mockEventBus.emit).toHaveBeenCalledWith('scraper.tweet.processed', expect.any(Object));
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
          timestamp: '2023-12-31T23:59:59Z' // Before bot start time
        };

        const result = scraperApp.isNewContent(oldTweet);
        expect(result).toBe(true);
      });

      it('should return false for old tweets when ANNOUNCE_OLD_TWEETS is disabled', () => {
        mockConfig.getBoolean.mockReturnValue(false);

        const oldTweet = {
          tweetID: '1234567890',
          timestamp: '2023-12-31T23:59:59Z' // Before bot start time
        };

        const result = scraperApp.isNewContent(oldTweet);
        expect(result).toBe(false);
      });

      it('should return true for tweets after bot start time', () => {
        mockConfig.getBoolean.mockReturnValue(false);

        const newTweet = {
          tweetID: '1234567891',
          timestamp: '2024-01-01T00:01:00Z' // After bot start time
        };

        const result = scraperApp.isNewContent(newTweet);
        expect(result).toBe(true);
      });

      it('should return true when no bot start time is set', () => {
        mockStateManager.get.mockReturnValue(null);

        const tweet = {
          tweetID: '1234567890',
          timestamp: '2023-12-31T23:59:59Z'
        };

        const result = scraperApp.isNewContent(tweet);
        expect(result).toBe(true);
      });

      it('should return true when tweet has no timestamp', () => {
        const tweet = {
          tweetID: '1234567890',
          timestamp: null
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
        })
      );

      expect(mockBrowserService.setUserAgent).toHaveBeenCalledWith(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
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
        expect(mockBrowserService.evaluate).toHaveBeenCalledWith(
          expect.any(Function)
        );
      });

      it('should call evaluate with scroll function for each iteration', async () => {
        scraperApp.browser = mockBrowserService;
        mockBrowserService.evaluate.mockResolvedValue();

        await scraperApp.performEnhancedScrolling();

        // Verify the correct number of evaluate calls
        expect(mockBrowserService.evaluate).toHaveBeenCalledTimes(5);
        
        // Verify that each call is made with a function that performs scrolling
        mockBrowserService.evaluate.mock.calls.forEach(call => {
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

        expect(mockBrowserService.waitForSelector).toHaveBeenCalledWith([
          '[data-testid="primaryColumn"]',
          '[role="main"]',
          'article[data-testid="tweet"]'
        ]);
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

        await expect(scraperApp.navigateToProfileTimeline(username))
          .rejects.toThrow('Navigation failed');
      });

      it('should handle selector wait timeouts gracefully', async () => {
        const username = 'testuser';
        const selectorError = new Error('Selector timeout');
        
        mockBrowserService.waitForSelector.mockRejectedValue(selectorError);

        await expect(scraperApp.navigateToProfileTimeline(username))
          .rejects.toThrow('Selector timeout');
      });
    });
  });
});
