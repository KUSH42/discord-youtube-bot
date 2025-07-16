import { jest } from '@jest/globals';

// Mock Discord.js client and components
export const mockChannel = {
  id: 'test-channel-id',
  name: 'test-channel',
  send: jest.fn().mockResolvedValue({ id: 'message-id' }),
  type: 0, // GUILD_TEXT
  guild: { id: 'test-guild-id' }
};

export const mockGuild = {
  id: 'test-guild-id',
  name: 'Test Guild',
  channels: {
    cache: new Map([['test-channel-id', mockChannel]])
  }
};

export const mockUser = {
  id: 'test-user-id',
  username: 'testuser',
  tag: 'testuser#1234',
  bot: false
};

export const mockMessage = {
  id: 'test-message-id',
  content: 'test message content',
  author: mockUser,
  channel: mockChannel,
  guild: mockGuild,
  createdTimestamp: Date.now(),
  reply: jest.fn().mockResolvedValue({ id: 'reply-id' }),
  react: jest.fn().mockResolvedValue(true)
};

export const mockClient = {
  user: { id: 'bot-user-id', username: 'TestBot' },
  guilds: {
    cache: new Map([['test-guild-id', mockGuild]])
  },
  channels: {
    cache: new Map([['test-channel-id', mockChannel]]),
    fetch: jest.fn().mockResolvedValue(mockChannel)
  },
  login: jest.fn().mockResolvedValue('token'),
  destroy: jest.fn().mockResolvedValue(),
  on: jest.fn(),
  once: jest.fn(),
  emit: jest.fn(),
  isReady: () => true
};

// Mock Discord.js module
export const discordMock = {
  Client: jest.fn(() => mockClient),
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 512,
    MessageContent: 32768
  },
  ChannelType: {
    GuildText: 0
  },
  Events: {
    Ready: 'ready',
    MessageCreate: 'messageCreate'
  }
};

// Helper to create fresh mock instances
export const createMockClient = () => ({
  ...mockClient,
  channels: {
    cache: new Map([['test-channel-id', { ...mockChannel }]]),
    fetch: jest.fn().mockResolvedValue({ ...mockChannel })
  },
  login: jest.fn().mockResolvedValue('token'),
  destroy: jest.fn().mockResolvedValue(),
  on: jest.fn(),
  once: jest.fn(),
  emit: jest.fn()
});

export const createMockChannel = (overrides = {}) => ({
  ...mockChannel,
  send: jest.fn().mockResolvedValue({ id: 'message-id' }),
  ...overrides
});

export const createMockMessage = (overrides = {}) => ({
  ...mockMessage,
  reply: jest.fn().mockResolvedValue({ id: 'reply-id' }),
  react: jest.fn().mockResolvedValue(true),
  ...overrides
});