import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BotApplication } from '../../src/application/bot-application.js';

describe('BotApplication', () => {
  let botApp;
  let mockDiscordService;
  let mockEventBus;

  beforeEach(() => {
    mockDiscordService = {
      isReady: jest.fn().mockReturnValue(true),
    };

    mockEventBus = {
      emit: jest.fn(),
    };

    const dependencies = {
      discordService: mockDiscordService,
      commandProcessor: {},
      eventBus: mockEventBus,
      config: {
        get: jest.fn(),
        getBoolean: jest.fn(),
      },
      stateManager: {
        get: jest.fn(),
        set: jest.fn(),
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      scraperApplication: {},
      monitorApplication: {},
    };

    botApp = new BotApplication(dependencies);
  describe('softRestart', () => {
    it('should emit a bot.request_restart event', async () => {
      await botApp.softRestart();
      expect(mockEventBus.emit).toHaveBeenCalledWith('bot.request_restart');
    });
  });
});

  describe('createDetailedHealthEmbed', () => {
    it('should create a detailed health embed correctly', () => {
      const healthData = {
        bot: { isRunning: true, isDiscordReady: true },
        scraper: { isRunning: true, totalRuns: 10, successfulRuns: 9 },
        monitor: { isRunning: true, activeSubscriptions: 1 },
        system: {
          uptime: 3600,
          memory: { heapUsed: 1024 * 1024 * 50 },
          timestamp: new Date().toISOString(),
        },
      };

      const embed = botApp.createDetailedHealthEmbed(healthData);

      expect(embed.title).toBe('📊 Detailed Bot Health Status');
      expect(embed.color).toBe(0x00ff00);
      expect(embed.fields).toHaveLength(9);
      expect(embed.fields[0].name).toBe('🤖 Bot');
      expect(embed.fields[1].name).toBe('▶️ YouTube Monitor');
      expect(embed.fields[2].name).toBe('🐦 X Scraper');
      expect(embed.fields[6].name).toBe('YouTube Stats');
      expect(embed.fields[6].value).toContain('Subs: 1');
      expect(embed.fields[7].name).toBe('X Stats');
      expect(embed.fields[7].value).toContain('Runs: 10');
      expect(embed.fields[8].name).toBe('Error Info');
    });
  });
});
