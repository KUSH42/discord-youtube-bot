import { jest } from '@jest/globals';
import { ScraperApplication } from '../../src/application/scraper-application.js';

jest.spyOn(ScraperApplication.prototype, 'start').mockResolvedValue();

describe('X Scraper Entry Point', () => {
  let main;
  let originalEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = process.env;

    // Set required environment variables for tests
    process.env = {
      ...originalEnv,
      X_USER_HANDLE: 'testuser',
      TWITTER_USERNAME: 'testuser',
      TWITTER_PASSWORD: 'testpass',
      DISCORD_BOT_TOKEN: 'test-token',
      DISCORD_SUPPORT_CHANNEL_ID: '123456789012345678',
      DISCORD_ANNOUNCE_CHANNEL_ID: '123456789012345679',
      YOUTUBE_API_KEY: 'test-key',
      YOUTUBE_CHANNEL_ID: 'UCrAOyUwjSM5zzPz_FqsUhuQ',
      PSH_CALLBACK_URL: 'https://example.com/webhook',
      PSH_SECRET: 'test-secret',
    };

    const { main: mainFunc } = await import('../../x-scraper.js');
    main = mainFunc;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('should initialize and start the scraper application', async () => {
    await main();
    expect(ScraperApplication.prototype.start).toHaveBeenCalledTimes(1);
  });
});
