import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BotApplication } from '../../src/application/bot-application.js';
import { exec } from 'child_process';

jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

describe('BotApplication', () => {
  let botApp;
  let mockDiscordService;
  let mockEventBus;
  let mockConfig;

  beforeEach(() => {
    mockDiscordService = {
      isReady: jest.fn().mockReturnValue(true),
    };

    mockEventBus = {
      emit: jest.fn(),
    };

    mockConfig = {
      get: jest.fn(),
      getBoolean: jest.fn(),
    };

    const dependencies = {
      discordService: mockDiscordService,
      commandProcessor: {},
      eventBus: mockEventBus,
      config: mockConfig,
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

  describe('softRestart', () => {
    it('should emit a bot.request_restart event', async () => {
      await botApp.softRestart();
      expect(mockEventBus.emit).toHaveBeenCalledWith('bot.request_restart');
    });
  });

  describe('handleUpdate', () => {
    it('should execute git pull and restart the service', () => {
      mockConfig.get.mockReturnValue('discord-bot.service');
      exec.mockImplementation((command, callback) => {
        callback(null, 'OK', '');
      });

      botApp.handleUpdate();

      expect(exec).toHaveBeenCalledWith('git pull', expect.any(Function));
      expect(exec).toHaveBeenCalledWith('sudo systemctl restart discord-bot.service', expect.any(Function));
    });
  });

  describe('createDetailedHealthEmbed', () => {
    it('should create a detailed health embed correctly', () => {
      const healthData = {
        bot: { isRunning: true, isDiscordReady: true },
        scraper: { isRunning: true, totalRuns: 10, successfulRuns: 9 },
        monitor: { isRunning: true, activeSubscriptions: 1, xmlParseFailures: 2 },
        system: {
          uptime: 3600,
          memory: { heapUsed: 1024 * 1024 * 50 },
          timestamp: new Date().toISOString(),
        },
      };

      const embed = botApp.createDetailedHealthEmbed(healthData);

      expect(embed.title).toBe('📊 Detailed Bot Health Status');
      expect(embed.color).toBe(0x00ff00);
      expect(embed.fields).toHaveLength(12);
      expect(embed.fields[0].name).toBe('🤖 Bot');
      expect(embed.fields[1].name).toBe('▶️ YouTube Monitor');
      expect(embed.fields[2].name).toBe('🐦 X Scraper');
      expect(embed.fields[3].name).toBe('📢 Announcements');
      expect(embed.fields[4].name).toBe('🔄 VX Twitter');
      expect(embed.fields[5].name).toBe('⏳ Next X Poll');
      expect(embed.fields[9].name).toBe('YouTube Stats');
      expect(embed.fields[9].value).toContain('Subs: 1');
      expect(embed.fields[10].name).toBe('X Stats');
      expect(embed.fields[10].value).toContain('Runs: 10');
      expect(embed.fields[11].name).toBe('Error Info');
      expect(embed.fields[11].value).toContain('XML Fails: 2');
    });

    it('should display "In progress..." for next X poll when scraper is running but no next poll time is set', () => {
        const healthData = {
            bot: { isRunning: true, isDiscordReady: true },
            scraper: { isRunning: true, pollingInterval: { next: null } },
            monitor: { isRunning: true, activeSubscriptions: 1 },
            system: {
                uptime: 3600,
                memory: { heapUsed: 1024 * 1024 * 50 },
                timestamp: new Date().toISOString(),
            },
        };
        const embed = botApp.createDetailedHealthEmbed(healthData);
        const nextPollField = embed.fields.find(f => f.name === '⏳ Next X Poll');
        expect(nextPollField.value).toBe('In progress...');
    });
  });
});
