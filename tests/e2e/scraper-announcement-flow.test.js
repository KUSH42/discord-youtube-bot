import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import crypto from 'crypto';
import { MonitorApplication } from '../../src/application/monitor-application.js';
import { ScraperApplication } from '../../src/application/scraper-application.js';
import { ContentCoordinator } from '../../src/core/content-coordinator.js';
import { ContentStateManager } from '../../src/core/content-state-manager.js';
import { ContentAnnouncer } from '../../src/core/content-announcer.js';
import { ContentClassifier } from '../../src/core/content-classifier.js';
import { DuplicateDetector } from '../../src/duplicate-detector.js';

/**
 * End-to-End tests for the complete scraper announcement flow
 * Tests both YouTube Monitor and X Scraper applications with realistic scenarios
 */
describe('Scraper Announcement Flow E2E', () => {
  let monitorApp;
  let scraperApp;
  let contentCoordinator;
  let contentStateManager;
  let contentAnnouncer;
  let contentClassifier;
  let duplicateDetector;
  let mockDependencies;
  let mockDiscordService;
  let mockYouTubeService;
  let mockBrowserService;
  let mockAuthManager;
  let announcementCallLog;

  beforeEach(() => {
    // Track all announcement calls for analysis
    announcementCallLog = [];

    // Mock Discord service
    mockDiscordService = {
      sendMessage: jest.fn((channelId, message) => {
        announcementCallLog.push({
          type: 'discord_announcement',
          channelId,
          message,
          timestamp: new Date().toISOString(),
        });
        return Promise.resolve({ id: `msg_${Date.now()}` });
      }),
      fetchChannel: jest.fn(() => Promise.resolve({ name: 'test-channel' })),
    };

    // Mock YouTube service
    mockYouTubeService = {
      getChannelDetails: jest.fn(() =>
        Promise.resolve({
          snippet: { title: 'Test YouTube Channel' },
        })
      ),
      getVideoDetails: jest.fn(videoId => {
        const mockVideos = {
          new_video_123: {
            id: 'new_video_123',
            snippet: {
              title: 'New Test Video',
              channelTitle: 'Test Channel',
              publishedAt: new Date().toISOString(),
              liveBroadcastContent: 'none',
            },
          },
          live_stream_456: {
            id: 'live_stream_456',
            snippet: {
              title: 'Live Stream Test',
              channelTitle: 'Test Channel',
              publishedAt: new Date().toISOString(),
              liveBroadcastContent: 'live',
            },
          },
          old_video_789: {
            id: 'old_video_789',
            snippet: {
              title: 'Old Video',
              channelTitle: 'Test Channel',
              publishedAt: '2023-01-01T00:00:00Z',
              liveBroadcastContent: 'none',
            },
          },
        };
        return Promise.resolve(mockVideos[videoId] || null);
      }),
      getChannelVideos: jest.fn(() => Promise.resolve([])),
      getScheduledContent: jest.fn(() => Promise.resolve([])),
      checkScheduledContentStates: jest.fn(() => Promise.resolve([])),
    };

    // Mock Browser service
    mockBrowserService = {
      launch: jest.fn(() => Promise.resolve()),
      goto: jest.fn(() => Promise.resolve()),
      evaluate: jest.fn(() => Promise.resolve([])),
      waitForSelector: jest.fn(() => Promise.resolve()),
      type: jest.fn(() => Promise.resolve()),
      click: jest.fn(() => Promise.resolve()),
      close: jest.fn(() => Promise.resolve()),
      isRunning: jest.fn(() => true),
      isConnected: jest.fn(() => true),
      setUserAgent: jest.fn(() => Promise.resolve()),
    };

    // Mock Auth Manager
    mockAuthManager = {
      login: jest.fn(() => Promise.resolve()),
      isAuthenticated: jest.fn(() => Promise.resolve(true)),
      ensureAuthenticated: jest.fn(() => Promise.resolve()),
      clickNextButton: jest.fn(() => Promise.resolve(true)),
      clickLoginButton: jest.fn(() => Promise.resolve(true)),
    };

    // Mock HTTP service
    const mockHttpService = {
      post: jest.fn(() => Promise.resolve({ status: 202 })),
      isSuccessResponse: jest.fn(response => response.status >= 200 && response.status < 300),
    };

    // Mock configuration
    const mockConfig = {
      getRequired: jest.fn(key => {
        const values = {
          YOUTUBE_CHANNEL_ID: 'UCtest123',
          YOUTUBE_API_KEY: 'test_api_key',
          PSH_CALLBACK_URL: 'https://example.com/webhook',
          DISCORD_YOUTUBE_CHANNEL_ID: '123456789012345678',
          DISCORD_X_POSTS_CHANNEL_ID: '123456789012345679',
          DISCORD_X_REPLIES_CHANNEL_ID: '123456789012345680',
          DISCORD_X_QUOTES_CHANNEL_ID: '123456789012345681',
          DISCORD_X_RETWEETS_CHANNEL_ID: '123456789012345682',
          X_USER_HANDLE: 'testuser',
          TWITTER_USERNAME: 'test@example.com',
          TWITTER_PASSWORD: 'testpass123',
        };
        return values[key] || `mock-${key}`;
      }),
      get: jest.fn((key, defaultValue) => {
        const values = {
          PSH_SECRET: 'test_secret',
          PSH_VERIFY_TOKEN: 'test_verify',
          WEBHOOK_DEBUG_LOGGING: 'true',
          X_QUERY_INTERVAL_MIN: '60000',
          X_QUERY_INTERVAL_MAX: '120000',
          ANNOUNCE_OLD_TWEETS: 'false',
          CONTENT_BACKOFF_DURATION_HOURS: '2',
          MAX_CONTENT_AGE_HOURS: '24',
          DISCORD_X_RETWEETS_CHANNEL_ID: '123456789012345682',
          DISCORD_X_REPLIES_CHANNEL_ID: '123456789012345680',
          DISCORD_X_QUOTES_CHANNEL_ID: '123456789012345681',
        };
        return values[key] || defaultValue;
      }),
      getBoolean: jest.fn((key, defaultValue) => {
        const values = {
          WEBHOOK_DEBUG_LOGGING: true,
          ANNOUNCE_OLD_TWEETS: true,
          ENABLE_RETWEET_PROCESSING: true,
        };
        return values[key] !== undefined ? values[key] : defaultValue;
      }),
      getNumber: jest.fn((key, defaultValue) => {
        const values = {
          MAX_CONTENT_AGE_HOURS: 24,
          PROCESSING_LOCK_TIMEOUT_MS: 30000,
        };
        return values[key] !== undefined ? values[key] : defaultValue;
      }),
    };

    // Mock state manager
    const mockStateManager = {
      get: jest.fn((key, defaultValue) => {
        const state = {
          postingEnabled: true,
          announcementEnabled: true,
          vxTwitterConversionEnabled: false,
          botStartTime: new Date('2024-01-01T00:00:00Z'),
        };
        return state[key] !== undefined ? state[key] : defaultValue;
      }),
      set: jest.fn(),
    };

    // Mock persistent storage
    const mockPersistentStorage = {
      storeContentState: jest.fn(() => Promise.resolve()),
      getContentState: jest.fn(() => Promise.resolve(null)),
      getAllContentStates: jest.fn(() => Promise.resolve({})),
      removeContentStates: jest.fn(() => Promise.resolve()),
      clearAllContentStates: jest.fn(() => Promise.resolve()),
      markAsSeen: jest.fn(() => Promise.resolve()),
      isDuplicate: jest.fn(() => Promise.resolve(false)),
      hasUrl: jest.fn(() => Promise.resolve(false)),
      addUrl: jest.fn(() => Promise.resolve()),
      hasFingerprint: jest.fn(() => Promise.resolve(false)),
      storeFingerprint: jest.fn(() => Promise.resolve()),
      getSeenUrls: jest.fn(() => Promise.resolve([])),
      getStorageStats: jest.fn(() => Promise.resolve({ seenCount: 0 })),
    };

    // Mock event bus
    const mockEventBus = {
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    };

    // Mock logger with actual console output for debugging
    const mockLogger = {
      info: jest.fn((msg, ...args) => console.log('INFO:', msg, ...args)),
      warn: jest.fn((msg, ...args) => console.log('WARN:', msg, ...args)),
      error: jest.fn((msg, ...args) => console.log('ERROR:', msg, ...args)),
      debug: jest.fn((msg, ...args) => console.log('DEBUG:', msg, ...args)),
      verbose: jest.fn((msg, ...args) => console.log('VERBOSE:', msg, ...args)),
      child: jest.fn(() => mockLogger),
    };

    // Create core components
    contentClassifier = new ContentClassifier(mockConfig, mockLogger);
    duplicateDetector = new DuplicateDetector(mockPersistentStorage, mockLogger);
    contentStateManager = new ContentStateManager(mockConfig, mockPersistentStorage, mockLogger, mockStateManager);
    contentAnnouncer = new ContentAnnouncer(mockDiscordService, mockConfig, mockStateManager, mockLogger);
    contentCoordinator = new ContentCoordinator(
      contentStateManager,
      contentAnnouncer,
      duplicateDetector,
      mockLogger,
      mockConfig
    );

    // Set up mock dependencies
    mockDependencies = {
      youtubeService: mockYouTubeService,
      httpService: mockHttpService,
      browserService: mockBrowserService,
      discordService: mockDiscordService,
      contentClassifier,
      contentAnnouncer,
      contentCoordinator,
      contentStateManager,
      duplicateDetector,
      config: mockConfig,
      stateManager: mockStateManager,
      eventBus: mockEventBus,
      logger: mockLogger,
      authManager: mockAuthManager,
      persistentStorage: mockPersistentStorage,
      livestreamStateMachine: {
        transitionState: jest.fn(() => Promise.resolve()),
      },
      delay: ms => new Promise(resolve => setTimeout(resolve, ms)),
    };

    // Create application instances
    monitorApp = new MonitorApplication(mockDependencies);
    scraperApp = new ScraperApplication(mockDependencies);
  });

  afterEach(() => {
    jest.clearAllMocks();
    announcementCallLog = [];
  });

  describe('YouTube Monitor Application E2E', () => {
    it('should handle webhook notification and announce new video', async () => {
      // Simulate PubSubHubbub webhook notification
      const webhookRequest = {
        method: 'POST',
        headers: {
          'x-hub-signature': `sha1=${crypto
            .createHmac('sha1', 'test_secret')
            .update(
              `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <entry>
    <yt:videoId>new_video_123</yt:videoId>
    <media:title>New Test Video</media:title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=new_video_123"/>
  </entry>
</feed>`
            )
            .digest('hex')}`,
        },
        body: `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <entry>
    <yt:videoId>new_video_123</yt:videoId>
    <media:title>New Test Video</media:title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=new_video_123"/>
  </entry>
</feed>`,
        query: {},
      };

      const result = await monitorApp.handleWebhook(webhookRequest);

      expect(result.status).toBe(200);
      expect(mockYouTubeService.getVideoDetails).toHaveBeenCalledWith('new_video_123');
      expect(announcementCallLog).toHaveLength(1);
      expect(announcementCallLog[0]).toMatchObject({
        type: 'discord_announcement',
        channelId: '123456789012345678',
      });
      expect(announcementCallLog[0].message).toContain('New Test Video');
      expect(announcementCallLog[0].message).toContain('🎬');
    });

    it('should handle webhook notification for livestream and announce with live emoji', async () => {
      const webhookRequest = {
        method: 'POST',
        headers: {
          'x-hub-signature': `sha1=${crypto
            .createHmac('sha1', 'test_secret')
            .update(
              `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <entry>
    <yt:videoId>live_stream_456</yt:videoId>
    <media:title>Live Stream Test</media:title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=live_stream_456"/>
  </entry>
</feed>`
            )
            .digest('hex')}`,
        },
        body: `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <entry>
    <yt:videoId>live_stream_456</yt:videoId>
    <media:title>Live Stream Test</media:title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=live_stream_456"/>
  </entry>
</feed>`,
        query: {},
      };

      const result = await monitorApp.handleWebhook(webhookRequest);

      expect(result.status).toBe(200);
      expect(announcementCallLog).toHaveLength(1);
      expect(announcementCallLog[0].message).toContain('🔴');
      expect(announcementCallLog[0].message).toContain('is now live');
    });

    it('should skip old video content based on bot start time', async () => {
      const webhookRequest = {
        method: 'POST',
        headers: {
          'x-hub-signature': `sha1=${crypto
            .createHmac('sha1', 'test_secret')
            .update(
              `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <entry>
    <yt:videoId>old_video_789</yt:videoId>
    <media:title>Old Video</media:title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=old_video_789"/>
  </entry>
</feed>`
            )
            .digest('hex')}`,
        },
        body: `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <entry>
    <yt:videoId>old_video_789</yt:videoId>
    <media:title>Old Video</media:title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=old_video_789"/>
  </entry>
</feed>`,
        query: {},
      };

      const result = await monitorApp.handleWebhook(webhookRequest);

      expect(result.status).toBe(200);
      expect(announcementCallLog).toHaveLength(0); // Should not announce old content
    });

    it('should handle invalid webhook signature gracefully', async () => {
      const webhookRequest = {
        method: 'POST',
        headers: {
          'x-hub-signature': 'sha1=invalid_signature',
        },
        body: 'test body',
        query: {},
      };

      const result = await monitorApp.handleWebhook(webhookRequest);

      expect(result.status).toBe(403);
      expect(result.message).toBe('Invalid signature');
      expect(announcementCallLog).toHaveLength(0);
    });

    it('should handle verification request correctly', async () => {
      const verificationRequest = {
        method: 'GET',
        query: {
          'hub.mode': 'subscribe',
          'hub.challenge': 'test_challenge_string',
          'hub.verify_token': 'test_verify',
        },
        headers: {},
        body: '',
      };

      const result = await monitorApp.handleWebhook(verificationRequest);

      expect(result.status).toBe(200);
      expect(result.body).toBe('test_challenge_string');
    });
  });

  describe('X Scraper Application E2E', () => {
    beforeEach(() => {
      // Mock browser evaluation to return tweet data
      mockBrowserService.evaluate.mockImplementation(() => {
        return Promise.resolve([
          {
            tweetID: '1234567890',
            url: 'https://x.com/testuser/status/1234567890',
            author: 'testuser',
            text: 'This is a test tweet about something interesting',
            timestamp: new Date().toISOString(),
            tweetCategory: 'Post',
          },
          {
            tweetID: '1234567891',
            url: 'https://x.com/testuser/status/1234567891',
            author: 'testuser',
            text: '@someone This is a reply to someone',
            timestamp: new Date().toISOString(),
            tweetCategory: 'Reply',
          },
          {
            tweetID: '1234567892',
            url: 'https://x.com/testuser/status/1234567892',
            author: 'originaluser',
            text: 'RT @originaluser: This is a retweet',
            timestamp: new Date().toISOString(),
            tweetCategory: 'Retweet',
          },
          {
            tweetID: '1234567893',
            url: 'https://x.com/testuser/status/1234567893',
            author: 'testuser',
            text: 'Old tweet from yesterday',
            timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
            tweetCategory: 'Post',
          },
        ]);
      });

      // Since ScraperApplication uses ContentAnnouncer directly, we don't need to mock ContentCoordinator
      // Reset the ContentAnnouncer mock to track actual calls made by ScraperApplication

      // Ensure all mocks are cleared for this test suite
      jest.clearAllMocks();
      announcementCallLog.length = 0;
    });

    it('should scrape and announce new X posts', async () => {
      // Mock methods that could hang
      scraperApp.verifyAuthentication = jest.fn().mockResolvedValue();
      scraperApp.performEnhancedRetweetDetection = jest.fn().mockResolvedValue();
      scraperApp.delay = jest.fn().mockResolvedValue();

      await scraperApp.pollXProfile();

      // Allow promises to resolve
      await new Promise(resolve => setImmediate(resolve));

      expect(mockBrowserService.goto).toHaveBeenCalled();
      expect(mockBrowserService.evaluate).toHaveBeenCalled();

      // Should announce all tweets to their respective channels
      const postAnnouncements = announcementCallLog.filter(log => log.channelId === '123456789012345679');
      const replyAnnouncements = announcementCallLog.filter(log => log.channelId === '123456789012345680');
      const retweetAnnouncements = announcementCallLog.filter(log => log.channelId === '123456789012345682');

      expect(postAnnouncements).toHaveLength(2); // Current post + old post
      expect(postAnnouncements[0].message).toContain('🐦');
      expect(postAnnouncements[0].message).toContain('testuser');

      expect(replyAnnouncements).toHaveLength(1);
      expect(replyAnnouncements[0].message).toContain('↩️');

      expect(retweetAnnouncements).toHaveLength(1);
      expect(retweetAnnouncements[0].message).toContain('🔄');
    }, 30000);

    it('should filter out old tweets based on content age', async () => {
      // Mock to return only old tweets
      mockBrowserService.evaluate.mockImplementation(() => {
        return Promise.resolve([
          {
            tweetID: '1234567894',
            url: 'https://x.com/testuser/status/1234567894',
            author: 'testuser',
            text: 'Very old tweet',
            timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
            tweetCategory: 'Post',
          },
        ]);
      });

      await scraperApp.pollXProfile();

      // Should not announce old content (older than 24 hours by default)
      expect(announcementCallLog).toHaveLength(0);
    }, 30000);

    it('should handle authentication failures gracefully', async () => {
      mockAuthManager.isAuthenticated.mockResolvedValue(false);
      mockAuthManager.ensureAuthenticated.mockRejectedValue(new Error('Auth failed'));

      await expect(scraperApp.pollXProfile()).rejects.toThrow();
      expect(announcementCallLog).toHaveLength(0);
    });

    it('should handle browser extraction failures', async () => {
      mockBrowserService.evaluate.mockRejectedValue(new Error('Browser evaluation failed'));

      await expect(scraperApp.pollXProfile()).rejects.toThrow();
      expect(announcementCallLog).toHaveLength(0);
    });

    it('should perform enhanced retweet detection', async () => {
      // Mock profile timeline navigation
      mockBrowserService.evaluate
        .mockResolvedValueOnce([]) // First call for search
        .mockResolvedValueOnce([
          // Second call for profile timeline
          {
            tweetID: '1234567895',
            url: 'https://x.com/testuser/status/1234567895',
            author: 'anotheruser',
            text: 'RT @anotheruser: This is a retweet from profile',
            timestamp: new Date().toISOString(),
            tweetCategory: 'Retweet',
          },
        ]);

      await scraperApp.pollXProfile();

      // Should find and announce the retweet from enhanced detection
      const retweetAnnouncements = announcementCallLog.filter(log => log.channelId === '123456789012345682');
      expect(retweetAnnouncements).toHaveLength(1);
    }, 30000);
  });

  describe('Content Coordination Between Sources', () => {
    it('should handle duplicate content from multiple sources', async () => {
      // Simulate same content from both YouTube webhook and scraper
      const videoData = {
        id: 'duplicate_test_123',
        platform: 'youtube',
        type: 'video',
        url: 'https://www.youtube.com/watch?v=duplicate_test_123',
        title: 'Duplicate Test Video',
        channelTitle: 'Test Channel',
        publishedAt: new Date().toISOString(),
      };

      // Process from webhook first
      const firstResult = await contentCoordinator.processContent('duplicate_test_123', 'webhook', videoData);
      expect(firstResult.action).toBe('announced'); // Ensure first processing succeeded

      // Process from scraper second (should be skipped)
      const result = await contentCoordinator.processContent('duplicate_test_123', 'scraper', videoData);

      expect(result.action).toBe('skip');
      expect(result.reason).toBe('already_announced');
      expect(announcementCallLog).toHaveLength(1); // Only announced once
    });

    it('should respect source priority (webhook > api > scraper)', async () => {
      const videoData = {
        id: 'priority_test_123',
        platform: 'youtube',
        type: 'video',
        url: 'https://www.youtube.com/watch?v=priority_test_123',
        title: 'Priority Test Video',
        channelTitle: 'Test Channel',
        publishedAt: new Date().toISOString(),
      };

      // Process from scraper first (lowest priority)
      await contentCoordinator.processContent('priority_test_123', 'scraper', videoData);

      // Try to process from webhook (highest priority) - should be skipped since already announced
      const result = await contentCoordinator.processContent('priority_test_123', 'webhook', videoData);

      expect(result.action).toBe('skip');
      expect(result.reason).toBe('already_announced');
      expect(announcementCallLog).toHaveLength(1); // Only announced once from scraper
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle Discord API failures gracefully in YouTube flow', async () => {
      mockDiscordService.sendMessage.mockRejectedValue(new Error('Discord API rate limited'));

      const webhookBody = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <entry>
    <yt:videoId>error_test_123</yt:videoId>
    <media:title>Error Test Video</media:title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=error_test_123"/>
  </entry>
</feed>`;

      const webhookRequest = {
        method: 'POST',
        headers: {
          'x-hub-signature': `sha1=${crypto.createHmac('sha1', 'test_secret').update(webhookBody).digest('hex')}`,
        },
        body: webhookBody,
        query: {},
      };

      const result = await monitorApp.handleWebhook(webhookRequest);

      // Webhook should still return 200 to prevent retry spam
      expect(result.status).toBe(200);
      expect(announcementCallLog).toHaveLength(0);
    });

    it('should handle content processing errors in X scraper flow', async () => {
      // Mock content announcer to fail
      contentAnnouncer.announceContent = jest.fn().mockRejectedValue(new Error('Announcement failed'));

      await expect(scraperApp.pollXProfile()).rejects.toThrow();
      expect(announcementCallLog).toHaveLength(0);
    }, 30000);
  });

  describe('Posting Controls Integration', () => {
    it('should respect posting disabled state across both scrapers', async () => {
      // Disable posting
      mockDependencies.stateManager.get.mockImplementation((key, defaultValue) => {
        if (key === 'postingEnabled') {
          return false;
        }
        return defaultValue;
      });

      // Try YouTube webhook
      const webhookRequest = {
        method: 'POST',
        headers: {
          'x-hub-signature': `sha1=${crypto.createHmac('sha1', 'test_secret').update('test body').digest('hex')}`,
        },
        body: `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <entry>
    <yt:videoId>disabled_test_123</yt:videoId>
    <media:title>Disabled Test Video</media:title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=disabled_test_123"/>
  </entry>
</feed>`,
        query: {},
      };

      await monitorApp.handleWebhook(webhookRequest);

      // Try X scraper
      await scraperApp.pollXProfile();

      // Neither should announce
      expect(announcementCallLog).toHaveLength(0);
    });
  });

  describe('Content Analysis and Debug Information', () => {
    it('should provide detailed debug information for announcement failures', async () => {
      const mockLoggerWithCapture = {
        ...mockDependencies.logger,
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      // Replace logger in all components
      contentAnnouncer.logger = mockLoggerWithCapture;
      contentCoordinator.logger = mockLoggerWithCapture;
      contentStateManager.logger = mockLoggerWithCapture;

      // Process content that should be skipped
      const oldVideoData = {
        id: 'debug_test_123',
        platform: 'youtube',
        type: 'video',
        url: 'https://www.youtube.com/watch?v=debug_test_123',
        title: 'Debug Test Video',
        channelTitle: 'Test Channel',
        publishedAt: '2023-01-01T00:00:00Z', // Old content
      };

      await contentCoordinator.processContent('debug_test_123', 'webhook', oldVideoData);

      // Verify debug logging occurred
      expect(mockLoggerWithCapture.debug).toHaveBeenCalled();
      expect(mockLoggerWithCapture.info).toHaveBeenCalled();

      // Check that old content was not added to state (filtered out as too old)
      expect(contentStateManager.hasContent('debug_test_123')).toBe(false);
    });
  });
});
