import { jest } from '@jest/globals';
import { MonitorApplication } from '../../src/application/monitor-application.js';

jest.spyOn(MonitorApplication.prototype, 'start').mockResolvedValue();

describe('YouTube Monitor Entry Point', () => {
  let main;
  let originalEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = process.env;

    // Set required environment variables for tests
    process.env = {
      ...originalEnv,
      YOUTUBE_API_KEY: 'test-key',
      YOUTUBE_CHANNEL_ID: 'UCrAOyUwjSM5zzPz_FqsUhuQ',
      PSH_CALLBACK_URL: 'https://example.com/webhook',
      PSH_SECRET: 'test-secret',
      DISCORD_BOT_TOKEN: 'test-token',
      DISCORD_SUPPORT_CHANNEL_ID: '123456789012345678',
      DISCORD_ANNOUNCE_CHANNEL_ID: '123456789012345679',
      DISCORD_YOUTUBE_CHANNEL_ID: '123456789012345680',
      DISCORD_X_POSTS_CHANNEL_ID: '123456789012345681',
      DISCORD_X_REPLIES_CHANNEL_ID: '123456789012345682',
      DISCORD_X_QUOTES_CHANNEL_ID: '123456789012345683',
      DISCORD_X_RETWEETS_CHANNEL_ID: '123456789012345684',
    };

    const { main: mainFunc } = await import('../../youtube-monitor.js');
    main = mainFunc;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('should initialize and start the monitor application', async () => {
    const startSpy = jest.spyOn(MonitorApplication.prototype, 'start').mockResolvedValue();
    await main();
    expect(startSpy).toHaveBeenCalledTimes(1);
    startSpy.mockRestore();
  });
});
