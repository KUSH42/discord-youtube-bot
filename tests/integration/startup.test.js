// /home/xush/Documents/prog/discord-youtube-bot/tests/integration/startup.test.js
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DependencyContainer } from '../../src/infrastructure/dependency-container.js';
import { Configuration } from '../../src/infrastructure/configuration.js';
import { setupProductionServices } from '../../src/setup/production-setup.js';

describe('Application Startup Integration Test', () => {
  let container;
  let BotApplication, MonitorApplication, ScraperApplication;

  beforeEach(async () => {
    // Dynamically import and mock the classes
    const botAppModule = await import('../../src/application/bot-application.js');
    BotApplication = botAppModule.BotApplication;
    jest.spyOn(BotApplication.prototype, 'start').mockResolvedValue();
    jest.spyOn(BotApplication.prototype, 'stop').mockResolvedValue();

    const monitorAppModule = await import('../../src/application/monitor-application.js');
    MonitorApplication = monitorAppModule.MonitorApplication;
    jest.spyOn(MonitorApplication.prototype, 'start').mockResolvedValue();
    jest.spyOn(MonitorApplication.prototype, 'stop').mockResolvedValue();

    const scraperAppModule = await import('../../src/application/scraper-application.js');
    ScraperApplication = scraperAppModule.ScraperApplication;
    jest.spyOn(ScraperApplication.prototype, 'start').mockResolvedValue();
    jest.spyOn(ScraperApplication.prototype, 'stop').mockResolvedValue();
  });

  afterEach(async () => {
    if (container) {
      await container.dispose();
    }
    jest.restoreAllMocks();
  });

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
  });
});
