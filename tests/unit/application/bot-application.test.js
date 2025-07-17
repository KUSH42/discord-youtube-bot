/**
 * Unit tests for BotApplication
 * Tests main bot application orchestrator including Discord integration,
 * command processing, event handling, and lifecycle management.
 */

import { BotApplication } from '../../../src/application/bot-application.js';

// Mock the rate limiter
jest.mock('../../../src/rate-limiter.js', () => ({
  CommandRateLimit: jest.fn().mockImplementation(() => ({
    isAllowed: jest.fn().mockReturnValue(true),
    getRemainingTime: jest.fn().mockReturnValue(0),
    getStats: jest.fn().mockReturnValue({ requests: 0, blocked: 0 })
  }))
}));

describe('BotApplication', () => {
  let botApp;
  let mockDependencies;

  beforeEach(() => {
    // Create comprehensive mocks for all dependencies
    mockDependencies = {
      discordService: {
        login: jest.fn().mockResolvedValue(),
        destroy: jest.fn().mockResolvedValue(),
        onMessage: jest.fn().mockReturnValue(() => {}),
        onReady: jest.fn().mockReturnValue(() => {}),
        onError: jest.fn().mockReturnValue(() => {}),
        isReady: jest.fn().mockReturnValue(true),
        getLatency: jest.fn().mockReturnValue(50),
        getCurrentUser: jest.fn().mockResolvedValue({ tag: 'TestBot#1234', id: '123456789' }),
        setPresence: jest.fn().mockResolvedValue()
      },
      commandProcessor: {
        processCommand: jest.fn().mockResolvedValue({ message: 'Command processed' }),
        getStats: jest.fn().mockReturnValue({ commandsProcessed: 10 })
      },
      eventBus: {
        emit: jest.fn(),
        getStats: jest.fn().mockReturnValue({ eventsEmitted: 5 })
      },
      config: {
        get: jest.fn((key, defaultValue) => {
          const values = {
            'COMMAND_PREFIX': '!',
            'DISCORD_BOT_SUPPORT_LOG_CHANNEL': '123456789012345678',
            'ALLOWED_USER_IDS': '111111111,222222222,333333333',
            'ANNOUNCEMENT_ENABLED': 'true',
            'X_VX_TWITTER_CONVERSION': 'false',
            'LOG_LEVEL': 'info',
            'DISCORD_BOT_TOKEN': 'test-token'
          };
          return values[key] !== undefined ? values[key] : defaultValue;
        }),
        getRequired: jest.fn((key) => {
          if (key === 'DISCORD_BOT_TOKEN') return 'test-token';
          throw new Error(`Required key ${key} not found`);
        }),
        getBoolean: jest.fn((key, defaultValue) => {
          const values = {
            'ANNOUNCEMENT_ENABLED': true,
            'X_VX_TWITTER_CONVERSION': false
          };
          return values[key] !== undefined ? values[key] : defaultValue;
        }),
        getAllConfig: jest.fn().mockReturnValue({ LOG_LEVEL: 'info' })
      },
      stateManager: {
        set: jest.fn(),
        get: jest.fn((key) => {
          const values = {
            'postingEnabled': true,
            'announcementEnabled': true,
            'vxTwitterConversionEnabled': false,
            'logLevel': 'info',
            'botStartTime': new Date('2023-01-01T00:00:00Z')
          };
          return values[key];
        }),
        subscribe: jest.fn().mockReturnValue(() => {}),
        getStats: jest.fn().mockReturnValue({ stateKeys: 5 })
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        level: 'info',
        transports: [{ level: 'info' }]
      }
    };
  });

  afterEach(() => {
    if (botApp && botApp.isRunning) {
      botApp.stop();
    }
    jest.clearAllMocks();
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with all dependencies', () => {
      botApp = new BotApplication(mockDependencies);
      
      expect(botApp.discord).toBe(mockDependencies.discordService);
      expect(botApp.commandProcessor).toBe(mockDependencies.commandProcessor);
      expect(botApp.eventBus).toBe(mockDependencies.eventBus);
      expect(botApp.config).toBe(mockDependencies.config);
      expect(botApp.state).toBe(mockDependencies.stateManager);
      expect(botApp.logger).toBe(mockDependencies.logger);
    });

    test('should initialize configuration values', () => {
      botApp = new BotApplication(mockDependencies);
      
      expect(botApp.commandPrefix).toBe('!');
      expect(botApp.supportChannelId).toBe('123456789012345678');
      expect(botApp.allowedUserIds).toEqual(['111111111', '222222222', '333333333']);
    });

    test('should initialize state with default values', () => {
      botApp = new BotApplication(mockDependencies);
      
      expect(mockDependencies.stateManager.set).toHaveBeenCalledWith('postingEnabled', true);
      expect(mockDependencies.stateManager.set).toHaveBeenCalledWith('announcementEnabled', true);
      expect(mockDependencies.stateManager.set).toHaveBeenCalledWith('vxTwitterConversionEnabled', false);
      expect(mockDependencies.stateManager.set).toHaveBeenCalledWith('logLevel', 'info');
      expect(mockDependencies.stateManager.set).toHaveBeenCalledWith('botStartTime', expect.any(Date));
    });

    test('should parse allowed user IDs correctly', () => {
      mockDependencies.config.get.mockReturnValue('111,222,333');
      botApp = new BotApplication(mockDependencies);
      
      expect(botApp.allowedUserIds).toEqual(['111', '222', '333']);
    });

    test('should handle empty allowed user IDs', () => {
      mockDependencies.config.get.mockReturnValue('');
      botApp = new BotApplication(mockDependencies);
      
      expect(botApp.allowedUserIds).toEqual([]);
    });

    test('should initialize as not running', () => {
      botApp = new BotApplication(mockDependencies);
      
      expect(botApp.isRunning).toBe(false);
    });
  });

  describe('Lifecycle Management', () => {
    beforeEach(() => {
      botApp = new BotApplication(mockDependencies);
    });

    describe('start()', () => {
      test('should start successfully', async () => {
        await botApp.start();
        
        expect(mockDependencies.discordService.login).toHaveBeenCalledWith('test-token');
        expect(mockDependencies.discordService.setPresence).toHaveBeenCalled();
        expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('bot.started', expect.any(Object));
        expect(botApp.isRunning).toBe(true);
      });

      test('should throw error if already running', async () => {
        botApp.isRunning = true;
        
        await expect(botApp.start()).rejects.toThrow('Bot application is already running');
      });

      test('should handle start failure gracefully', async () => {
        const error = new Error('Login failed');
        mockDependencies.discordService.login.mockRejectedValue(error);
        
        await expect(botApp.start()).rejects.toThrow('Login failed');
        expect(botApp.isRunning).toBe(false);
      });

      test('should setup event handlers on start', async () => {
        await botApp.start();
        
        expect(mockDependencies.discordService.onMessage).toHaveBeenCalled();
        expect(mockDependencies.discordService.onReady).toHaveBeenCalled();
        expect(mockDependencies.discordService.onError).toHaveBeenCalled();
        expect(mockDependencies.stateManager.subscribe).toHaveBeenCalled();
      });
    });

    describe('stop()', () => {
      test('should stop successfully when running', async () => {
        await botApp.start();
        await botApp.stop();
        
        expect(mockDependencies.discordService.destroy).toHaveBeenCalled();
        expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('bot.stopped', expect.any(Object));
        expect(botApp.isRunning).toBe(false);
      });

      test('should not throw when stopping already stopped bot', async () => {
        await expect(botApp.stop()).resolves.not.toThrow();
      });

      test('should handle stop errors gracefully', async () => {
        await botApp.start();
        mockDependencies.discordService.destroy.mockRejectedValue(new Error('Destroy failed'));
        
        await botApp.stop();
        
        expect(mockDependencies.logger.error).toHaveBeenCalledWith('Error stopping bot application:', expect.any(Error));
      });
    });

    describe('softRestart()', () => {
      test('should perform soft restart successfully', async () => {
        await botApp.start();
        await botApp.softRestart();
        
        expect(mockDependencies.stateManager.set).toHaveBeenCalledWith('postingEnabled', true);
        expect(mockDependencies.stateManager.set).toHaveBeenCalledWith('botStartTime', expect.any(Date));
        expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('bot.restarted', expect.any(Object));
      });

      test('should handle soft restart failure', async () => {
        mockDependencies.stateManager.set.mockImplementation(() => {
          throw new Error('State error');
        });
        
        await expect(botApp.softRestart()).rejects.toThrow('State error');
      });
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      botApp = new BotApplication(mockDependencies);
      await botApp.start();
    });

    test('should ignore bot messages', async () => {
      const message = {
        author: { bot: true, id: '123', tag: 'TestBot#1234' },
        content: '!test',
        channel: { id: '123456789012345678' },
        reply: jest.fn()
      };
      
      await botApp.handleMessage(message);
      
      expect(mockDependencies.commandProcessor.processCommand).not.toHaveBeenCalled();
    });

    test('should ignore non-command messages', async () => {
      const message = {
        author: { bot: false, id: '123', tag: 'User#1234' },
        content: 'hello world',
        channel: { id: '123456789012345678' },
        reply: jest.fn()
      };
      
      await botApp.handleMessage(message);
      
      expect(mockDependencies.commandProcessor.processCommand).not.toHaveBeenCalled();
    });

    test('should ignore messages from wrong channel', async () => {
      const message = {
        author: { bot: false, id: '123', tag: 'User#1234' },
        content: '!test',
        channel: { id: 'wrong-channel-id' },
        reply: jest.fn()
      };
      
      await botApp.handleMessage(message);
      
      expect(mockDependencies.commandProcessor.processCommand).not.toHaveBeenCalled();
    });

    test('should process valid command', async () => {
      const message = {
        author: { bot: false, id: '111111111', tag: 'User#1234' },
        content: '!test arg1 arg2',
        channel: { id: '123456789012345678' },
        reply: jest.fn()
      };
      
      await botApp.handleMessage(message);
      
      expect(mockDependencies.commandProcessor.processCommand).toHaveBeenCalledWith(
        'test',
        ['arg1', 'arg2'],
        '111111111'
      );
      expect(message.reply).toHaveBeenCalledWith('Command processed');
    });

    test('should handle rate limiting', async () => {
      // Mock rate limiter to block requests
      const mockRateLimit = require('../../../src/rate-limiter.js').CommandRateLimit;
      const rateLimitInstance = mockRateLimit.mock.instances[0];
      rateLimitInstance.isAllowed.mockReturnValue(false);
      rateLimitInstance.getRemainingTime.mockReturnValue(30000);
      
      const message = {
        author: { bot: false, id: '111111111', tag: 'User#1234' },
        content: '!test',
        channel: { id: '123456789012345678' },
        reply: jest.fn()
      };
      
      await botApp.handleMessage(message);
      
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit exceeded')
      );
      expect(mockDependencies.commandProcessor.processCommand).not.toHaveBeenCalled();
    });

    test('should handle invalid user object', async () => {
      const message = {
        author: null,
        content: '!test',
        channel: { id: '123456789012345678' },
        reply: jest.fn()
      };
      
      await botApp.handleMessage(message);
      
      expect(mockDependencies.logger.warn).toHaveBeenCalledWith('Received message from invalid user object');
      expect(mockDependencies.commandProcessor.processCommand).not.toHaveBeenCalled();
    });

    test('should handle command processing errors', async () => {
      const error = new Error('Command failed');
      mockDependencies.commandProcessor.processCommand.mockRejectedValue(error);
      
      const message = {
        author: { bot: false, id: '111111111', tag: 'User#1234' },
        content: '!test',
        channel: { id: '123456789012345678' },
        reply: jest.fn()
      };
      
      await botApp.handleMessage(message);
      
      expect(mockDependencies.logger.error).toHaveBeenCalledWith('Error processing message command:', error);
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('An error occurred while processing your command')
      );
    });
  });

  describe('Command Result Handling', () => {
    beforeEach(async () => {
      botApp = new BotApplication(mockDependencies);
      await botApp.start();
    });

    test('should handle basic command result', async () => {
      const message = { reply: jest.fn() };
      const result = { message: 'Test response' };
      const user = { tag: 'User#1234', id: '123' };
      
      await botApp.handleCommandResult(message, result, 'test', user);
      
      expect(message.reply).toHaveBeenCalledWith('Test response');
    });

    test('should handle health command result with embed', async () => {
      const message = { reply: jest.fn() };
      const result = {
        message: 'Health status',
        healthData: {
          uptime: '1 hour',
          memoryUsage: '100MB',
          postingStatus: 'Enabled',
          announcements: 'Enabled',
          vxTwitter: 'Disabled',
          timestamp: new Date(),
          botStartTime: 'Jan 1, 2023'
        }
      };
      const user = { tag: 'User#1234', id: '123' };
      
      await botApp.handleCommandResult(message, result, 'health', user);
      
      expect(message.reply).toHaveBeenCalledWith({ embeds: [expect.any(Object)] });
    });

    test('should handle restart command result', async () => {
      const message = { channel: { send: jest.fn() } };
      const result = { requiresRestart: true };
      const user = { tag: 'User#1234', id: '123' };
      
      await botApp.handleCommandResult(message, result, 'restart', user);
      
      expect(message.channel.send).toHaveBeenCalledWith('✅ Soft restart complete.');
      expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('bot.restarted', expect.any(Object));
    });

    test('should handle restart failure', async () => {
      mockDependencies.stateManager.set.mockImplementation(() => {
        throw new Error('Restart failed');
      });
      
      const message = { channel: { send: jest.fn() } };
      const result = { requiresRestart: true };
      const user = { tag: 'User#1234', id: '123' };
      
      await botApp.handleCommandResult(message, result, 'restart', user);
      
      expect(message.channel.send).toHaveBeenCalledWith('❌ Soft restart failed. Check logs for details.');
    });

    test('should handle log level change', async () => {
      const message = { reply: jest.fn() };
      const result = { newLogLevel: 'debug' };
      const user = { tag: 'User#1234', id: '123' };
      
      await botApp.handleCommandResult(message, result, 'loglevel', user);
      
      expect(mockDependencies.logger.level).toBe('debug');
      expect(mockDependencies.logger.transports[0].level).toBe('debug');
    });

    test('should log command execution', async () => {
      const message = { reply: jest.fn() };
      const result = { 
        message: 'Command processed',
        logMessage: 'Test action performed',
        userId: '123'
      };
      const user = { tag: 'User#1234', id: '123' };
      
      await botApp.handleCommandResult(message, result, 'test', user);
      
      expect(mockDependencies.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('User#1234 (123) executed !test command. Test action performed')
      );
    });
  });

  describe('Health Embed Creation', () => {
    beforeEach(async () => {
      botApp = new BotApplication(mockDependencies);
      await botApp.start();
    });

    test('should create health embed with all data', () => {
      const healthData = {
        uptime: '2 hours',
        memoryUsage: '150MB',
        postingStatus: 'Enabled',
        announcements: 'Enabled',
        vxTwitter: 'Disabled',
        timestamp: new Date('2023-01-01T12:00:00Z'),
        botStartTime: 'Jan 1, 2023 10:00 AM'
      };
      
      const embed = botApp.createHealthEmbed(healthData);
      
      expect(embed.title).toBe('🏥 Bot Health Status');
      expect(embed.color).toBe(0x00ff00); // Green when Discord is ready
      expect(embed.fields).toHaveLength(6);
      expect(embed.timestamp).toBe(healthData.timestamp);
      expect(embed.footer.text).toContain(healthData.botStartTime);
    });

    test('should show red color when Discord not ready', () => {
      mockDependencies.discordService.isReady.mockReturnValue(false);
      
      const healthData = {
        uptime: '1 hour',
        memoryUsage: '100MB',
        postingStatus: 'Disabled',
        announcements: 'Disabled',
        vxTwitter: 'Disabled',
        timestamp: new Date(),
        botStartTime: 'Jan 1, 2023'
      };
      
      const embed = botApp.createHealthEmbed(healthData);
      
      expect(embed.color).toBe(0xff0000); // Red when Discord not ready
    });
  });

  describe('Event Handling', () => {
    beforeEach(async () => {
      botApp = new BotApplication(mockDependencies);
      await botApp.start();
    });

    test('should handle Discord ready event', async () => {
      await botApp.handleReady();
      
      expect(mockDependencies.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Discord bot is ready! Logged in as TestBot#1234')
      );
      expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('discord.ready', expect.any(Object));
    });

    test('should handle Discord error event', () => {
      const error = new Error('Discord error');
      
      botApp.handleError(error);
      
      expect(mockDependencies.logger.error).toHaveBeenCalledWith('Discord client error:', error);
      expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('discord.error', expect.any(Object));
    });

    test('should handle log level change', () => {
      botApp.handleLogLevelChange('debug');
      
      expect(mockDependencies.logger.level).toBe('debug');
      expect(mockDependencies.logger.transports[0].level).toBe('debug');
      expect(mockDependencies.logger.info).toHaveBeenCalledWith('Log level changed to: debug');
    });
  });

  describe('Status and Statistics', () => {
    beforeEach(async () => {
      botApp = new BotApplication(mockDependencies);
      await botApp.start();
    });

    test('should get bot status', () => {
      const status = botApp.getStatus();
      
      expect(status).toEqual({
        isRunning: true,
        isDiscordReady: true,
        botStartTime: expect.any(Date),
        postingEnabled: true,
        announcementEnabled: true,
        vxTwitterEnabled: false,
        currentLogLevel: 'info',
        allowedUsers: 3,
        supportChannelId: '123456789012345678'
      });
    });

    test('should get bot statistics', () => {
      const stats = botApp.getStats();
      
      expect(stats).toEqual({
        isRunning: true,
        isDiscordReady: true,
        botStartTime: expect.any(Date),
        postingEnabled: true,
        announcementEnabled: true,
        vxTwitterEnabled: false,
        currentLogLevel: 'info',
        allowedUsers: 3,
        supportChannelId: '123456789012345678',
        commandRateLimit: { requests: 0, blocked: 0 },
        commandProcessor: { commandsProcessed: 10 },
        eventBusStats: { eventsEmitted: 5 },
        stateStats: { stateKeys: 5 }
      });
    });

    test('should get current user tag', async () => {
      const tag = await botApp.getCurrentUserTag();
      
      expect(tag).toBe('TestBot#1234');
    });

    test('should handle user tag retrieval failure', async () => {
      mockDependencies.discordService.getCurrentUser.mockRejectedValue(new Error('User error'));
      
      const tag = await botApp.getCurrentUserTag();
      
      expect(tag).toBe('Unknown');
    });
  });

  describe('Bot Presence', () => {
    beforeEach(() => {
      botApp = new BotApplication(mockDependencies);
    });

    test('should set bot presence successfully', async () => {
      await botApp.setBotPresence();
      
      expect(mockDependencies.discordService.setPresence).toHaveBeenCalledWith({
        activities: [{
          name: 'for new content',
          type: 3
        }],
        status: 'online'
      });
    });

    test('should handle presence setting failure', async () => {
      mockDependencies.discordService.setPresence.mockRejectedValue(new Error('Presence failed'));
      
      await botApp.setBotPresence();
      
      expect(mockDependencies.logger.warn).toHaveBeenCalledWith('Failed to set bot presence:', expect.any(Error));
    });
  });

  describe('Cleanup and Disposal', () => {
    beforeEach(async () => {
      botApp = new BotApplication(mockDependencies);
      await botApp.start();
    });

    test('should cleanup event handlers', () => {
      const mockCleanup = jest.fn();
      botApp.eventCleanup = [mockCleanup, mockCleanup, mockCleanup];
      
      botApp.cleanupEventHandlers();
      
      expect(mockCleanup).toHaveBeenCalledTimes(3);
      expect(botApp.eventCleanup).toHaveLength(0);
    });

    test('should handle cleanup errors gracefully', () => {
      const failingCleanup = jest.fn().mockImplementation(() => {
        throw new Error('Cleanup error');
      });
      botApp.eventCleanup = [failingCleanup];
      
      botApp.cleanupEventHandlers();
      
      expect(mockDependencies.logger.warn).toHaveBeenCalledWith('Error cleaning up event handler:', expect.any(Error));
    });

    test('should dispose properly', async () => {
      await botApp.dispose();
      
      expect(mockDependencies.discordService.destroy).toHaveBeenCalled();
      expect(botApp.isRunning).toBe(false);
    });
  });
});