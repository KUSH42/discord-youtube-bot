import { BotApplication } from '../../src/application/bot-application.js';
import { jest } from '@jest/globals';
import fs from 'fs';

describe('BotApplication', () => {
  let botApplication;
  let mockDiscordService;
  let mockCommandProcessor;
  let mockEventBus;
  let mockConfig;
  let mockStateManager;
  let mockLogger;
  let mockScraperApplication;
  let mockMonitorApplication;
  let mockYoutubeScraper;
  let mockExec;
  let dependencies;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDiscordService = {
      login: jest.fn().mockResolvedValue(),
      destroy: jest.fn().mockResolvedValue(),
      isReady: jest.fn().mockReturnValue(true),
      getLatency: jest.fn().mockReturnValue(123),
      getCurrentUser: jest.fn().mockResolvedValue({ tag: 'TestBot#1234', username: 'TestBot' }),
      fetchChannel: jest.fn().mockResolvedValue(null),
      setPresence: jest.fn().mockResolvedValue(),
      onMessage: jest.fn().mockReturnValue(() => {}),
      onReady: jest.fn().mockReturnValue(() => {}),
      onError: jest.fn().mockReturnValue(() => {}),
    };

    mockCommandProcessor = {
      processCommand: jest.fn().mockResolvedValue({ success: true, message: 'Command processed' }),
      getStats: jest.fn().mockReturnValue({ commandsExecuted: 10 }),
    };

    mockEventBus = {
      emit: jest.fn(),
      getStats: jest.fn().mockReturnValue({ eventsEmitted: 5 }),
    };

    mockConfig = {
      get: jest.fn((key, defaultValue) => {
        const config = {
          SYSTEMD_SERVICE_NAME: 'test-service',
          COMMAND_PREFIX: '!',
          DISCORD_BOT_SUPPORT_LOG_CHANNEL: 'support-channel',
          ALLOWED_USER_IDS: 'user1,user2,user3',
          LOG_LEVEL: 'info',
          DISCORD_BOT_TOKEN: 'test-token',
          YOUTUBE_CHANNEL_HANDLE: 'test-channel',
          DISCORD_YOUTUBE_CHANNEL_ID: 'youtube-channel-id',
          DISCORD_X_POSTS_CHANNEL_ID: 'x-posts-channel',
          DISCORD_X_REPLIES_CHANNEL_ID: 'x-replies-channel',
          DISCORD_X_QUOTES_CHANNEL_ID: 'x-quotes-channel',
          DISCORD_X_RETWEETS_CHANNEL_ID: 'x-retweets-channel',
        };
        return config[key] || defaultValue;
      }),
      getBoolean: jest.fn((key, defaultValue) => {
        const boolConfig = {
          ANNOUNCEMENT_ENABLED: false,
          X_VX_TWITTER_CONVERSION: true,
        };
        return boolConfig[key] !== undefined ? boolConfig[key] : defaultValue;
      }),
      getRequired: jest.fn(key => {
        if (key === 'DISCORD_BOT_TOKEN') {
          return 'test-token';
        }
        throw new Error(`Required config ${key} not found`);
      }),
      getAllConfig: jest.fn().mockReturnValue({ test: 'config' }),
    };

    mockStateManager = {
      set: jest.fn(),
      get: jest.fn(key => {
        const state = {
          postingEnabled: true,
          announcementEnabled: false,
          vxTwitterConversionEnabled: true,
          logLevel: 'info',
          botStartTime: new Date('2023-01-01'),
        };
        return state[key];
      }),
      subscribe: jest.fn().mockReturnValue(() => {}),
      getStats: jest.fn().mockReturnValue({ keysStored: 5 }),
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      level: 'info',
      transports: [{ level: 'info' }],
      child: jest.fn(() => mockLogger),
    };

    mockScraperApplication = {
      getStats: jest.fn().mockReturnValue({
        pollingInterval: { next: Date.now() + 60000 },
        isRunning: true,
        totalRuns: 10,
        successfulRuns: 9,
        failedRuns: 1,
        totalTweetsFound: 50,
        totalTweetsAnnounced: 25,
        lastError: null,
      }),
      duplicateDetector: {
        scanDiscordChannelForTweets: jest.fn().mockResolvedValue({
          messagesScanned: 100,
          tweetIdsAdded: 10,
          errors: [],
        }),
      },
    };

    mockMonitorApplication = {
      getStats: jest.fn().mockReturnValue({
        isRunning: true,
        subscriptions: 1,
        webhooksReceived: 5,
        videosProcessed: 8,
        videosAnnounced: 6,
        xmlParseFailures: 0,
        lastError: null,
      }),
      duplicateDetector: {
        scanDiscordChannelForVideos: jest.fn().mockResolvedValue({
          messagesScanned: 200,
          videoIdsAdded: 15,
          errors: [],
        }),
      },
    };

    mockYoutubeScraper = {
      initialize: jest.fn().mockResolvedValue(),
      startMonitoring: jest.fn().mockResolvedValue(),
      cleanup: jest.fn().mockResolvedValue(),
      getMetrics: jest.fn().mockReturnValue({
        isRunning: true,
        videosProcessed: 12,
      }),
    };

    mockExec = jest.fn();

    dependencies = {
      exec: mockExec,
      discordService: mockDiscordService,
      commandProcessor: mockCommandProcessor,
      eventBus: mockEventBus,
      config: mockConfig,
      stateManager: mockStateManager,
      logger: mockLogger,
      scraperApplication: mockScraperApplication,
      monitorApplication: mockMonitorApplication,
      youtubeScraperService: mockYoutubeScraper,
    };
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with all dependencies', () => {
      botApplication = new BotApplication(dependencies);

      expect(botApplication.exec).toBe(mockExec);
      expect(botApplication.discord).toBe(mockDiscordService);
      expect(botApplication.commandProcessor).toBe(mockCommandProcessor);
      expect(botApplication.eventBus).toBe(mockEventBus);
      expect(botApplication.config).toBe(mockConfig);
      expect(botApplication.state).toBe(mockStateManager);
      expect(botApplication.logger).toBe(mockLogger);
    });

    it('should initialize state with correct default values', () => {
      botApplication = new BotApplication(dependencies);

      expect(mockStateManager.set).toHaveBeenCalledWith('postingEnabled', true);
      expect(mockStateManager.set).toHaveBeenCalledWith('announcementEnabled', false);
      expect(mockStateManager.set).toHaveBeenCalledWith('vxTwitterConversionEnabled', true);
      expect(mockStateManager.set).toHaveBeenCalledWith('logLevel', 'info');
      expect(mockStateManager.set).toHaveBeenCalledWith('botStartTime', expect.any(Date));
    });

    it('should parse allowed user IDs correctly', () => {
      botApplication = new BotApplication(dependencies);

      expect(botApplication.allowedUserIds).toEqual(['user1', 'user2', 'user3']);
    });

    it('should handle empty allowed user IDs', () => {
      // Create a new config mock just for this test
      const testConfig = {
        ...mockConfig,
        get: jest.fn((key, defaultValue) => {
          if (key === 'ALLOWED_USER_IDS') {
            return '';
          }
          return mockConfig.get.getMockImplementation()(key, defaultValue);
        }),
      };

      const testDeps = { ...dependencies, config: testConfig };
      botApplication = new BotApplication(testDeps);
      expect(botApplication.allowedUserIds).toEqual([]);
    });

    it('should set isRunning to false initially', () => {
      botApplication = new BotApplication(dependencies);

      expect(botApplication.isRunning).toBe(false);
    });
  });

  describe('loadBuildInfo', () => {
    beforeEach(() => {
      botApplication = new BotApplication(dependencies);
    });

    it('should load build info from file successfully', () => {
      const buildInfo = { version: '1.2.3', build: '456' };
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(buildInfo));

      const result = botApplication.loadBuildInfo();

      expect(result).toEqual(buildInfo);
      expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('build-version.json'), 'utf8');
    });

    it('should return default build info on file read error', () => {
      jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = botApplication.loadBuildInfo();

      expect(result).toEqual({ version: 'N/A', build: 'N/A' });
      expect(mockLogger.error).toHaveBeenCalledWith('Could not load build information:', expect.any(Error));
    });
  });

  describe('Start and Stop Operations', () => {
    beforeEach(() => {
      botApplication = new BotApplication(dependencies);
    });

    describe('start', () => {
      it('should start successfully', async () => {
        await botApplication.start();

        expect(mockDiscordService.login).toHaveBeenCalledWith('test-token');
        expect(mockLogger.info).toHaveBeenCalledWith('Starting bot application...');
        expect(mockLogger.info).toHaveBeenCalledWith('Bot application started successfully');
        expect(botApplication.isRunning).toBe(true);
        expect(mockEventBus.emit).toHaveBeenCalledWith('bot.started', expect.any(Object));
      });

      it('should throw error if already running', async () => {
        botApplication.isRunning = true;

        await expect(botApplication.start()).rejects.toThrow('Bot application is already running');
      });

      it('should initialize YouTube scraper when channel handle is configured', async () => {
        await botApplication.start();

        expect(mockYoutubeScraper.initialize).toHaveBeenCalledWith('test-channel');
        expect(mockYoutubeScraper.startMonitoring).toHaveBeenCalled();
      });

      it('should skip YouTube scraper when no channel handle configured', async () => {
        const testConfig = {
          ...mockConfig,
          get: jest.fn((key, defaultValue) => {
            if (key === 'YOUTUBE_CHANNEL_HANDLE') {
              return null;
            }
            return mockConfig.get.getMockImplementation()(key, defaultValue);
          }),
        };

        const testBotApp = new BotApplication({ ...dependencies, config: testConfig });
        await testBotApp.start();

        expect(mockYoutubeScraper.initialize).not.toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith(
          'YOUTUBE_CHANNEL_HANDLE not configured, YouTube scraper will not start.'
        );

        await testBotApp.stop();
      });

      it('should handle YouTube scraper initialization error', async () => {
        mockYoutubeScraper.initialize.mockRejectedValue(new Error('Init failed'));

        await botApplication.start();

        expect(mockLogger.error).toHaveBeenCalledWith('❌ Failed to start YouTube Scraper:', expect.any(Error));
        expect(botApplication.isRunning).toBe(true);
      });

      it('should handle Discord login failure', async () => {
        mockDiscordService.login.mockRejectedValue(new Error('Login failed'));

        await expect(botApplication.start()).rejects.toThrow('Login failed');
        expect(mockLogger.error).toHaveBeenCalledWith('❌ Failed to start bot application:', expect.any(Error));
      });

      it('should set bot presence after starting', async () => {
        await botApplication.start();

        expect(mockDiscordService.setPresence).toHaveBeenCalledWith({
          activities: [
            {
              name: 'for new content',
              type: 3,
            },
          ],
          status: 'online',
        });
      });
    });

    describe('stop', () => {
      beforeEach(async () => {
        await botApplication.start();
      });

      it('should stop successfully', async () => {
        await botApplication.stop();

        expect(mockDiscordService.destroy).toHaveBeenCalled();
        expect(mockYoutubeScraper.cleanup).toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith('Stopping bot application...');
        expect(mockLogger.info).toHaveBeenCalledWith('Bot application stopped');
        expect(botApplication.isRunning).toBe(false);
        expect(mockEventBus.emit).toHaveBeenCalledWith('bot.stopped', expect.any(Object));
      });

      it('should not stop if not running', async () => {
        botApplication.isRunning = false;
        const initialDiscordDestroyCalls = mockDiscordService.destroy.mock.calls.length;

        await botApplication.stop();

        expect(mockDiscordService.destroy).toHaveBeenCalledTimes(initialDiscordDestroyCalls);
      });

      it('should handle errors during stop', async () => {
        mockDiscordService.destroy.mockRejectedValue(new Error('Destroy failed'));

        await botApplication.stop();

        expect(mockLogger.error).toHaveBeenCalledWith('Error stopping bot application:', expect.any(Error));
      });

      it('should stop without YouTube scraper if not available', async () => {
        botApplication.youtubeScraper = null;

        await botApplication.stop();

        expect(mockDiscordService.destroy).toHaveBeenCalled();
        expect(botApplication.isRunning).toBe(false);
      });
    });

    describe('softRestart', () => {
      beforeEach(() => {
        botApplication = new BotApplication(dependencies);
      });

      it('should emit a bot.request_restart event', () => {
        botApplication.softRestart();
        expect(mockEventBus.emit).toHaveBeenCalledWith('bot.request_restart');
        expect(mockLogger.info).toHaveBeenCalledWith('Requesting full bot restart...');
      });
    });

    describe('dispose', () => {
      it('should call stop', async () => {
        botApplication = new BotApplication(dependencies);
        jest.spyOn(botApplication, 'stop').mockResolvedValue();

        await botApplication.dispose();

        expect(botApplication.stop).toHaveBeenCalled();
      });
    });
  });

  describe('Update and Command Handling', () => {
    beforeEach(() => {
      botApplication = new BotApplication(dependencies);
    });

    describe('handleUpdate', () => {
      it('should call git pull', () => {
        const mockMessage = {
          reply: jest.fn().mockResolvedValue(),
        };

        mockExec.mockImplementation((command, callback) => {
          if (command === 'git pull') {
            callback(null, 'Already up to date.', '');
          }
        });

        botApplication.handleUpdate(mockMessage);

        expect(mockExec).toHaveBeenCalledWith('git pull', expect.any(Function));
      });

      it('should handle missing systemd service name', async () => {
        const testConfig = {
          ...mockConfig,
          get: jest.fn((key, defaultValue) => {
            if (key === 'SYSTEMD_SERVICE_NAME') {
              return null;
            }
            return mockConfig.get.getMockImplementation()(key, defaultValue);
          }),
        };

        const testBotApp = new BotApplication({ ...dependencies, config: testConfig });
        const mockMessage = {
          reply: jest.fn().mockResolvedValue(),
        };

        await testBotApp.handleUpdate(mockMessage);

        expect(mockLogger.error).toHaveBeenCalledWith('SYSTEMD_SERVICE_NAME is not configured.');
      });

      it('should handle update without message parameter', () => {
        mockExec.mockImplementation((command, callback) => {
          if (command === 'git pull') {
            callback(null, 'Updated successfully', '');
          }
        });

        expect(() => botApplication.handleUpdate()).not.toThrow();
        expect(mockExec).toHaveBeenCalledWith('git pull', expect.any(Function));
      });
    });
  });

  describe('Event Handlers', () => {
    beforeEach(() => {
      botApplication = new BotApplication(dependencies);
    });

    describe('setupEventHandlers', () => {
      it('should register Discord event handlers', () => {
        botApplication.setupEventHandlers();

        expect(mockDiscordService.onMessage).toHaveBeenCalled();
        expect(mockDiscordService.onReady).toHaveBeenCalled();
        expect(mockDiscordService.onError).toHaveBeenCalled();
        expect(mockStateManager.subscribe).toHaveBeenCalledWith('logLevel', expect.any(Function));
      });
    });

    describe('cleanupEventHandlers', () => {
      it('should call all cleanup functions', () => {
        const mockCleanup1 = jest.fn();
        const mockCleanup2 = jest.fn();
        botApplication.eventCleanup = [mockCleanup1, mockCleanup2];

        botApplication.cleanupEventHandlers();

        expect(mockCleanup1).toHaveBeenCalled();
        expect(mockCleanup2).toHaveBeenCalled();
        expect(botApplication.eventCleanup).toEqual([]);
      });

      it('should handle cleanup function errors', () => {
        const mockCleanup = jest.fn().mockImplementation(() => {
          throw new Error('Cleanup failed');
        });
        botApplication.eventCleanup = [mockCleanup];

        botApplication.cleanupEventHandlers();

        expect(mockLogger.warn).toHaveBeenCalledWith('Error cleaning up event handler:', expect.any(Error));
      });
    });

    describe('handleReady', () => {
      it('should handle Discord ready event', async () => {
        await botApplication.handleReady();

        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Discord bot is ready!'));
        expect(mockEventBus.emit).toHaveBeenCalledWith('discord.ready', expect.any(Object));
      });
    });

    describe('handleError', () => {
      it('should handle Discord error event', () => {
        const error = new Error('Discord error');

        botApplication.handleError(error);

        expect(mockLogger.error).toHaveBeenCalledWith('Discord client error:', error);
        expect(mockEventBus.emit).toHaveBeenCalledWith('discord.error', {
          error,
          timestamp: expect.any(Date),
        });
      });
    });

    describe('handleLogLevelChange', () => {
      it('should update logger level', () => {
        botApplication.handleLogLevelChange('debug');

        expect(mockLogger.level).toBe('debug');
        expect(mockLogger.transports[0].level).toBe('debug');
        expect(mockLogger.info).toHaveBeenCalledWith('Log level changed to: debug');
      });

      it('should handle logger without transports', () => {
        mockLogger.transports = null;

        expect(() => botApplication.handleLogLevelChange('debug')).not.toThrow();
      });

      it('should handle errors in log level change', () => {
        // Mock logger with throwing setter
        const errorLogger = {
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          transports: null,
        };

        Object.defineProperty(errorLogger, 'level', {
          set() {
            throw new Error('Level change failed');
          },
          get() {
            return 'info';
          },
          configurable: true,
        });

        botApplication.logger = errorLogger;
        botApplication.handleLogLevelChange('debug');

        expect(errorLogger.error).toHaveBeenCalledWith('Error changing log level:', expect.any(Error));
      });
    });
  });

  describe('Discord History Scanning', () => {
    beforeEach(() => {
      botApplication = new BotApplication(dependencies);
    });

    describe('initializeDiscordHistoryScanning', () => {
      it('should scan YouTube channel history', async () => {
        const mockChannel = { id: 'youtube-channel-id' };
        mockDiscordService.fetchChannel.mockResolvedValue(mockChannel);

        await botApplication.initializeDiscordHistoryScanning();

        expect(mockDiscordService.fetchChannel).toHaveBeenCalledWith('youtube-channel-id');
        expect(mockMonitorApplication.duplicateDetector.scanDiscordChannelForVideos).toHaveBeenCalledWith(
          mockChannel,
          1000
        );
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('YouTube channel scan completed'));
      });

      it('should scan X/Twitter channels history', async () => {
        const mockChannels = [
          { id: 'x-posts-channel' },
          { id: 'x-replies-channel' },
          { id: 'x-quotes-channel' },
          { id: 'x-retweets-channel' },
        ];
        mockDiscordService.fetchChannel.mockImplementation(id => Promise.resolve(mockChannels.find(c => c.id === id)));

        await botApplication.initializeDiscordHistoryScanning();

        expect(mockScraperApplication.duplicateDetector.scanDiscordChannelForTweets).toHaveBeenCalledTimes(4);
      });

      it('should handle missing duplicate detector', async () => {
        botApplication.monitorApplication = { duplicateDetector: null };

        await botApplication.initializeDiscordHistoryScanning();

        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Duplicate detector not available, skipping Discord history scanning'
        );
      });

      it('should handle channel fetch errors', async () => {
        mockDiscordService.fetchChannel.mockRejectedValue(new Error('Channel not found'));

        await botApplication.initializeDiscordHistoryScanning();

        expect(mockLogger.error).toHaveBeenCalledWith('Failed to scan YouTube channel history: Channel not found');
      });
    });
  });

  describe('Message Handling', () => {
    let mockMessage;

    beforeEach(() => {
      botApplication = new BotApplication(dependencies);
      mockMessage = {
        author: {
          bot: false,
          id: 'user123',
          tag: 'TestUser#1234',
        },
        content: '!test',
        channel: {
          id: 'support-channel',
          send: jest.fn().mockResolvedValue(),
        },
        reply: jest.fn().mockResolvedValue(),
      };
      botApplication.supportChannelId = 'support-channel';
      botApplication.commandPrefix = '!';
    });

    describe('handleMessage', () => {
      it('should ignore bot messages', async () => {
        mockMessage.author.bot = true;
        const result = await botApplication.handleMessage(mockMessage);
        expect(result).toBeUndefined();
        expect(mockCommandProcessor.processCommand).not.toHaveBeenCalled();
      });

      it('should ignore non-command messages', async () => {
        mockMessage.content = 'not a command';
        const result = await botApplication.handleMessage(mockMessage);
        expect(result).toBeUndefined();
        expect(mockCommandProcessor.processCommand).not.toHaveBeenCalled();
      });

      it('should ignore messages from invalid user objects', async () => {
        mockMessage.author = null;
        await botApplication.handleMessage(mockMessage);
        expect(mockCommandProcessor.processCommand).not.toHaveBeenCalled();
      });

      it('should process valid commands', async () => {
        mockMessage.content = '!test arg1 arg2';

        await botApplication.handleMessage(mockMessage);

        expect(mockCommandProcessor.processCommand).toHaveBeenCalledWith(
          'test',
          ['arg1', 'arg2'],
          'user123',
          expect.any(Object)
        );
        expect(mockMessage.reply).toHaveBeenCalledWith('Command processed');
      });

      it('should handle rate limiting', async () => {
        jest.spyOn(botApplication.commandRateLimit, 'isAllowed').mockReturnValue(false);
        jest.spyOn(botApplication.commandRateLimit, 'getRemainingTime').mockReturnValue(30000);

        await botApplication.handleMessage(mockMessage);

        expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('🚫 Rate limit exceeded'));
        expect(mockCommandProcessor.processCommand).not.toHaveBeenCalled();
      });

      it('should handle command processing errors', async () => {
        mockCommandProcessor.processCommand.mockRejectedValue(new Error('Command failed'));

        await botApplication.handleMessage(mockMessage);

        expect(mockLogger.error).toHaveBeenCalledWith('Error processing message command:', expect.any(Error));
        expect(mockMessage.reply).toHaveBeenCalledWith(
          '❌ An error occurred while processing your command. Please try again.'
        );
      });

      it('should handle reply errors', async () => {
        mockCommandProcessor.processCommand.mockRejectedValue(new Error('Command failed'));
        mockMessage.reply.mockRejectedValue(new Error('Reply failed'));

        await botApplication.handleMessage(mockMessage);

        expect(mockLogger.error).toHaveBeenCalledWith('Failed to send error reply:', expect.any(Error));
      });
    });

    describe('handleCommandResult', () => {
      it('should handle basic command result', async () => {
        const result = { success: true, message: 'Test response' };

        await botApplication.handleCommandResult(mockMessage, result, 'test', mockMessage.author);

        expect(mockMessage.reply).toHaveBeenCalledWith('Test response');
      });

      it('should handle health command result', async () => {
        const result = {
          success: true,
          message: 'Health OK',
          healthData: {
            uptime: '1d 2h 3m',
            memoryUsage: '150 MB',
            postingStatus: 'Enabled',
            announcements: 'Disabled',
            vxTwitter: 'Enabled',
            timestamp: new Date().toISOString(),
            botStartTime: 'Jan 1, 2023',
          },
        };

        await botApplication.handleCommandResult(mockMessage, result, 'health', mockMessage.author);

        expect(mockMessage.reply).toHaveBeenCalledWith({
          embeds: [expect.any(Object)],
        });
      });

      it('should handle restart request', async () => {
        const result = { success: true, requiresRestart: true };
        jest.spyOn(botApplication, 'softRestart').mockImplementation(() => {});

        await botApplication.handleCommandResult(mockMessage, result, 'restart', mockMessage.author);

        expect(mockMessage.channel.send).toHaveBeenCalledWith('✅ Full restart initiated. See you in a moment!');
        expect(botApplication.softRestart).toHaveBeenCalled();
      });

      it('should handle update request', async () => {
        const result = { success: true, requiresUpdate: true };
        jest.spyOn(botApplication, 'handleUpdate').mockImplementation(() => {});

        await botApplication.handleCommandResult(mockMessage, result, 'update', mockMessage.author);

        expect(botApplication.handleUpdate).toHaveBeenCalledWith(mockMessage);
      });

      it('should handle log level change', async () => {
        const result = { success: true, newLogLevel: 'debug' };
        jest.spyOn(botApplication, 'handleLogLevelChange').mockImplementation(() => {});

        await botApplication.handleCommandResult(mockMessage, result, 'loglevel', mockMessage.author);

        expect(botApplication.handleLogLevelChange).toHaveBeenCalledWith('debug');
      });
    });
  });

  describe('Health Embeds', () => {
    beforeEach(() => {
      botApplication = new BotApplication(dependencies);
      botApplication.buildInfo = { version: '1.0', build: '123' };
    });

    describe('createHealthEmbed', () => {
      it('should create basic health embed correctly', () => {
        const healthData = {
          uptime: '1d 2h 3m',
          memoryUsage: '150 MB',
          postingStatus: 'Enabled',
          announcements: 'Disabled',
          vxTwitter: 'Enabled',
          timestamp: new Date().toISOString(),
          botStartTime: 'Jan 1, 2023',
        };

        const embed = botApplication.createHealthEmbed(healthData);

        expect(embed.title).toBe('🏥 Bot Health Status');
        expect(embed.color).toBe(0x00ff00);
        expect(embed.fields).toHaveLength(6);
        expect(embed.footer.text).toContain('Bot v1.0 (Build 123)');
      });

      it('should show red color when Discord not ready', () => {
        mockDiscordService.isReady.mockReturnValue(false);
        const healthData = {
          uptime: '1d 2h 3m',
          memoryUsage: '150 MB',
          postingStatus: 'Enabled',
          announcements: 'Disabled',
          vxTwitter: 'Enabled',
          timestamp: new Date().toISOString(),
          botStartTime: 'Jan 1, 2023',
        };

        const embed = botApplication.createHealthEmbed(healthData);

        expect(embed.color).toBe(0xff0000);
      });
    });

    describe('createDetailedHealthEmbed', () => {
      it('should create a detailed health embed correctly', () => {
        const healthData = {
          bot: {
            isRunning: true,
            announcementEnabled: true,
            vxTwitterEnabled: false,
            botStartTime: new Date().toISOString(),
          },
          scraper: {
            isRunning: true,
            pollingInterval: { next: Date.now() + 60000 },
            totalRuns: 10,
            successfulRuns: 9,
            failedRuns: 1,
            totalTweetsFound: 100,
            totalTweetsAnnounced: 50,
            lastError: 'None',
          },
          monitor: {
            isRunning: true,
            subscriptions: 1,
            webhooksReceived: 5,
            videosProcessed: 5,
            videosAnnounced: 4,
            xmlParseFailures: 0,
            lastError: 'None',
          },
          youtubeScraper: {
            isRunning: false,
          },
          system: { uptime: 12345, memory: { heapUsed: 1024 * 1024 * 50 }, timestamp: new Date().toISOString() },
        };

        const embed = botApplication.createDetailedHealthEmbed(healthData);

        expect(embed.title).toBe('📊 Detailed Bot Health Status');
        expect(embed.fields).toHaveLength(13);
        expect(embed.color).toBe(0x00ff00);
      });

      it('should display "In progress..." for next X poll when scraper is running but no next poll time is set', () => {
        const healthData = {
          bot: {
            isRunning: true,
            announcementEnabled: true,
            vxTwitterEnabled: false,
            botStartTime: new Date().toISOString(),
          },
          scraper: {
            isRunning: true,
            pollingInterval: { next: null },
            totalRuns: 10,
            successfulRuns: 9,
            failedRuns: 1,
            totalTweetsFound: 100,
            totalTweetsAnnounced: 50,
            lastError: 'None',
          },
          monitor: {
            isRunning: true,
            subscriptions: 1,
            webhooksReceived: 5,
            videosProcessed: 5,
            videosAnnounced: 4,
            xmlParseFailures: 0,
            lastError: 'None',
          },
          system: { uptime: 12345, memory: { heapUsed: 1024 * 1024 * 50 }, timestamp: new Date().toISOString() },
        };

        const embed = botApplication.createDetailedHealthEmbed(healthData);
        const nextPollField = embed.fields.find(f => f.name === '⏳ Next X Poll');

        expect(nextPollField).toBeDefined();
        expect(nextPollField.value).toBe('In progress...');
      });
    });
  });

  describe('Utility Methods', () => {
    beforeEach(() => {
      botApplication = new BotApplication(dependencies);
    });

    describe('setBotPresence', () => {
      it('should set bot presence successfully', async () => {
        await botApplication.setBotPresence();

        expect(mockDiscordService.setPresence).toHaveBeenCalledWith({
          activities: [
            {
              name: 'for new content',
              type: 3,
            },
          ],
          status: 'online',
        });
      });

      it('should handle presence setting errors', async () => {
        mockDiscordService.setPresence.mockRejectedValue(new Error('Presence failed'));

        await botApplication.setBotPresence();

        expect(mockLogger.warn).toHaveBeenCalledWith('Failed to set bot presence:', expect.any(Error));
      });
    });

    describe('getCurrentUserTag', () => {
      it('should return user tag', async () => {
        const result = await botApplication.getCurrentUserTag();

        expect(result).toBe('TestBot#1234');
      });

      it('should return username if no tag', async () => {
        mockDiscordService.getCurrentUser.mockResolvedValue({ username: 'TestBot' });

        const result = await botApplication.getCurrentUserTag();

        expect(result).toBe('TestBot');
      });

      it('should return Unknown on error', async () => {
        mockDiscordService.getCurrentUser.mockRejectedValue(new Error('User fetch failed'));

        const result = await botApplication.getCurrentUserTag();

        expect(result).toBe('Unknown');
      });
    });

    describe('getStatus', () => {
      it('should return bot status', () => {
        const status = botApplication.getStatus();

        expect(status).toEqual({
          isRunning: false,
          isDiscordReady: true,
          botStartTime: new Date('2023-01-01'),
          postingEnabled: true,
          announcementEnabled: false,
          vxTwitterEnabled: true,
          currentLogLevel: 'info',
          allowedUsers: 3,
          supportChannelId: 'support-channel',
        });
      });
    });

    describe('getStats', () => {
      it('should return comprehensive bot statistics', () => {
        const stats = botApplication.getStats();

        expect(stats).toEqual(
          expect.objectContaining({
            isRunning: false,
            isDiscordReady: true,
            commandRateLimit: expect.any(Object),
            commandProcessor: { commandsExecuted: 10 },
            eventBusStats: { eventsEmitted: 5 },
            stateStats: { keysStored: 5 },
          })
        );
      });
    });
  });

  describe('_formatGitPullOutput', () => {
    const green = '\x1b[32m';
    const red = '\x1b[31m';
    const reset = '\x1b[0m';

    beforeEach(() => {
      botApplication = new BotApplication(dependencies);
    });

    it('should colorize addition and deletion lines', () => {
      const input = `
-  "version": "1.0.0",
+  "version": "1.0.1",
   "description": "A bot"
      `;
      const expected = `
${red}-  "version": "1.0.0",${reset}
${green}+  "version": "1.0.1",${reset}
   "description": "A bot"
      `;
      expect(botApplication._formatGitPullOutput(input)).toBe(expected);
    });

    it('should not colorize diff headers', () => {
      const input = `
--- a/file.js
+++ b/file.js
-  console.log('old');
+  console.log('new');
      `;
      const expected = `
--- a/file.js
+++ b/file.js
${red}-  console.log('old');${reset}
${green}+  console.log('new');${reset}
      `;
      expect(botApplication._formatGitPullOutput(input)).toBe(expected);
    });

    it('should correctly colorize git pull summary lines with mixed changes', () => {
      const input = ' src/bot.js | 4 ++--';
      const expected = ` src/bot.js | 4 ${green}++${reset}${red}--${reset}`;
      expect(botApplication._formatGitPullOutput(input)).toBe(expected);
    });

    it('should handle contiguous blocks of additions in summary', () => {
      const input = ' test.js | 5 +++++';
      const expected = ` test.js | 5 ${green}+++++${reset}`;
      expect(botApplication._formatGitPullOutput(input)).toBe(expected);
    });

    it('should handle empty and no-change strings gracefully', () => {
      expect(botApplication._formatGitPullOutput('')).toBe('');
      const noChangeString = 'Already up to date.';
      expect(botApplication._formatGitPullOutput(noChangeString)).toBe(noChangeString);
    });
  });
});
