import { jest } from '@jest/globals';

// Mock the dependencies that require external services
jest.unstable_mockModule('discord.js', () => ({
  Client: jest.fn(() => ({
    channels: {
      fetch: jest.fn().mockResolvedValue({ isTextBased: () => true, send: jest.fn() }),
    },
    isReady: jest.fn(() => true),
  })),
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 512,
    MessageContent: 32768,
  },
  Partials: {
    Message: 'Message',
    Channel: 'Channel',
    Reaction: 'Reaction',
  },
}));

jest.unstable_mockModule('googleapis', () => ({
  google: {
    youtube: jest.fn(() => ({})),
  },
}));

const { Configuration } = await import('../../../src/infrastructure/configuration.js');
const { DependencyContainer } = await import('../../../src/infrastructure/dependency-container.js');
const { setupProductionServices } = await import('../../../src/setup/production-setup.js');

describe('Production Setup', () => {
  let container;
  let config;

  beforeEach(() => {
    // Create a mock configuration
    const configMap = new Map([
      ['NODE_ENV', 'test'],
      ['DISCORD_BOT_TOKEN', 'test-token'],
      ['YOUTUBE_API_KEY', 'test-api-key'],
      ['YOUTUBE_CHANNEL_ID', 'UC-test-channel'],
      ['DISCORD_YOUTUBE_CHANNEL_ID', '1234567890'],
      ['PSH_CALLBACK_URL', 'http://localhost:3000/youtube-webhook'],
      ['LOG_LEVEL', 'info'],
    ]);
    
    config = new Configuration(configMap);
    container = new DependencyContainer();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should set up all production services without errors', async () => {
    await expect(setupProductionServices(container, config)).resolves.not.toThrow();
  });

  it('should register all required services in the container', async () => {
    await setupProductionServices(container, config);

    // List of services that should be registered
    const expectedServices = [
      'config',
      'eventBus',
      'stateManager',
      'discordService',
      'youtubeService',
      'httpService',
      'expressApp',
      'commandProcessor',
      'contentClassifier',
      'contentAnnouncer',
      'botApplication',
      'scraperApplication',
      'monitorApplication',
      'logger',
    ];

    for (const serviceName of expectedServices) {
      expect(() => container.resolve(serviceName)).not.toThrow();
    }
  });

  it('should handle optional discord logging channel', async () => {
    // Test without the optional channel
    await expect(setupProductionServices(container, config)).resolves.not.toThrow();

    // Test with the optional channel
    const newConfigMap = new Map(config.config);
    newConfigMap.set('DISCORD_BOT_SUPPORT_LOG_CHANNEL', '0987654321');
    const newConfig = new Configuration(newConfigMap);
    const newContainer = new DependencyContainer();

    await expect(setupProductionServices(newContainer, newConfig)).resolves.not.toThrow();
  });
});
