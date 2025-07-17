import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BotApplication } from '../../src/application/bot-application.js';

describe('BotApplication', () => {
  let botApp;
  let mockDiscordService;

  beforeEach(() => {
    mockDiscordService = {
      isReady: jest.fn().mockReturnValue(true),
    };

    const dependencies = {
      discordService: mockDiscordService,
      commandProcessor: {},
      eventBus: {},
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
      expect(embed.fields).toHaveLength(4);
      expect(embed.fields[0].name).toBe('🤖 Bot Application');
      expect(embed.fields[0].value).toContain('Status: Running');
      expect(embed.fields[1].name).toBe(' scrapes Scraper Application');
      expect(embed.fields[1].value).toContain('Total Runs: 10');
      expect(embed.fields[2].name).toBe('▶️ Monitor Application');
      expect(embed.fields[2].value).toContain('Subscriptions: 1');
      expect(embed.fields[3].name).toBe('⚙️ System');
      expect(embed.fields[3].value).toContain('Memory: 50 MB');
    });
  });
});
