// /home/xush/Documents/prog/discord-youtube-bot/tests/integration/startup.test.js
import { jest } from '@jest/globals';
import { DependencyContainer } from '../../src/infrastructure/dependency-container.js';
import { Configuration } from '../../src/infrastructure/configuration.js';
import { setupProductionServices } from '../../src/setup/production-setup.js';

// Mock the applications to prevent them from starting their long-running processes
jest.mock('../src/application/bot-application.js', () => ({
  BotApplication: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(),
    stop: jest.fn().mockResolvedValue(),
  })),
}));

jest.mock('../src/application/monitor-application.js', () => ({
  MonitorApplication: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(),
    stop: jest.fn().mockResolvedValue(),
  })),
}));

jest.mock('../src/application/scraper-application.js', () => ({
    ScraperApplication: jest.fn().mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(),
      stop: jest.fn().mockResolvedValue(),
      startNonBlocking: jest.fn(),
    })),
}));

describe('Application Startup Integration Test', () => {
  let container;

  it('should initialize the dependency container and setup services without errors', async () => {
    let error;
    try {
      const configuration = new Configuration();
      container = new DependencyContainer();
      // This will throw an error if any services can't be created,
      // including ReferenceErrors for missing functions.
      await setupProductionServices(container, configuration);
    } catch (e) {
      error = e;
    }

    expect(error).toBeUndefined();

    // Verify that key services are registered
    expect(container.isRegistered('logger')).toBe(true);
    expect(container.isRegistered('discordService')).toBe(true);
    expect(container.isRegistered('botApplication')).toBe(true);

    if (container) {
        await container.dispose();
    }
  });
});
