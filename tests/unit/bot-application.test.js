import { BotApplication } from '../../src/application/bot-application.js';
import { jest } from '@jest/globals';

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
  let mockExec;

  beforeEach(() => {
    mockDiscordService = {};
    mockCommandProcessor = {};
    mockEventBus = {
      emit: jest.fn(),
    };
    mockConfig = {
      get: jest.fn((key, defaultValue) => {
        if (key === 'SYSTEMD_SERVICE_NAME') return 'test-service';
        return defaultValue;
      }),
      getBoolean: jest.fn(),
      getRequired: jest.fn(),
    };
    mockStateManager = {
      set: jest.fn(),
      get: jest.fn(),
    };
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      child: jest.fn(() => mockLogger),
    };
    mockScraperApplication = {};
    mockMonitorApplication = {};
    mockExec = jest.fn();

    botApplication = new BotApplication({
      exec: mockExec,
      discordService: mockDiscordService,
      commandProcessor: mockCommandProcessor,
      eventBus: mockEventBus,
      config: mockConfig,
      stateManager: mockStateManager,
      logger: mockLogger,
      scraperApplication: mockScraperApplication,
      monitorApplication: mockMonitorApplication,
    });
  });

  describe('handleUpdate', () => {
    it('should execute git pull and systemctl restart', () => {
      botApplication.handleUpdate();

      // Simulate successful git pull
      const gitPullCallback = mockExec.mock.calls[0][1];
      gitPullCallback(null, 'Git pull successful', '');

      expect(mockExec).toHaveBeenCalledWith('git pull', expect.any(Function));
      expect(mockExec).toHaveBeenCalledWith('sudo systemctl restart test-service', expect.any(Function));
    });
  });
});
