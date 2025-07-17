/**
 * Unit tests for DiscordClientService
 * Tests Discord.js implementation of DiscordService interface including
 * message handling, channel operations, and event management.
 */

import { DiscordClientService } from '../../../src/services/implementations/discord-client-service.js';

describe('DiscordClientService', () => {
  let discordService;
  let mockClient;

  beforeEach(() => {
    // Create comprehensive Discord.js client mock
    mockClient = {
      login: jest.fn().mockResolvedValue(),
      destroy: jest.fn().mockResolvedValue(),
      channels: {
        fetch: jest.fn()
      },
      guilds: {
        fetch: jest.fn()
      },
      user: {
        id: '123456789',
        tag: 'TestBot#1234',
        username: 'TestBot'
      },
      on: jest.fn(),
      off: jest.fn(),
      removeAllListeners: jest.fn(),
      ws: {
        ping: 50
      },
      readyAt: new Date(),
      uptime: 3600000,
      user: {
        setPresence: jest.fn().mockResolvedValue()
      }
    };

    discordService = new DiscordClientService(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with Discord client', () => {
      expect(discordService.client).toBe(mockClient);
      expect(discordService.eventHandlers).toBeInstanceOf(Map);
    });

    test('should extend DiscordService interface', () => {
      expect(discordService.sendMessage).toBeDefined();
      expect(discordService.fetchChannel).toBeDefined();
      expect(discordService.login).toBeDefined();
    });
  });

  describe('Authentication', () => {
    test('should login with token', async () => {
      const token = 'test.token.here';
      
      await discordService.login(token);
      
      expect(mockClient.login).toHaveBeenCalledWith(token);
    });

    test('should handle login failure', async () => {
      const error = new Error('Invalid token');
      mockClient.login.mockRejectedValue(error);
      
      await expect(discordService.login('invalid')).rejects.toThrow('Invalid token');
    });

    test('should destroy client connection', async () => {
      await discordService.destroy();
      
      expect(mockClient.destroy).toHaveBeenCalled();
    });
  });

  describe('Channel Operations', () => {
    test('should fetch channel by ID', async () => {
      const mockChannel = { id: '123456789', name: 'test-channel' };
      mockClient.channels.fetch.mockResolvedValue(mockChannel);
      
      const channel = await discordService.fetchChannel('123456789');
      
      expect(channel).toBe(mockChannel);
      expect(mockClient.channels.fetch).toHaveBeenCalledWith('123456789');
    });

    test('should handle channel fetch failure', async () => {
      mockClient.channels.fetch.mockRejectedValue(new Error('Channel not found'));
      
      await expect(discordService.fetchChannel('invalid')).rejects.toThrow('Channel not found');
    });

    test('should send message to text channel', async () => {
      const mockChannel = {
        id: '123456789',
        isTextBased: jest.fn().mockReturnValue(true),
        send: jest.fn().mockResolvedValue({ id: 'message123' })
      };
      mockClient.channels.fetch.mockResolvedValue(mockChannel);
      
      const message = await discordService.sendMessage('123456789', 'Hello World');
      
      expect(message.id).toBe('message123');
      expect(mockChannel.send).toHaveBeenCalledWith('Hello World');
    });

    test('should handle non-text channel error', async () => {
      const mockChannel = {
        id: '123456789',
        isTextBased: jest.fn().mockReturnValue(false)
      };
      mockClient.channels.fetch.mockResolvedValue(mockChannel);
      
      await expect(discordService.sendMessage('123456789', 'Hello')).rejects.toThrow(
        'Channel 123456789 is not a valid text channel'
      );
    });

    test('should handle null channel', async () => {
      mockClient.channels.fetch.mockResolvedValue(null);
      
      await expect(discordService.sendMessage('123456789', 'Hello')).rejects.toThrow(
        'Channel 123456789 is not a valid text channel'
      );
    });
  });

  describe('Guild Operations', () => {
    test('should fetch guild by ID', async () => {
      const mockGuild = { id: '987654321', name: 'Test Guild' };
      mockClient.guilds.fetch.mockResolvedValue(mockGuild);
      
      const guild = await discordService.fetchGuild('987654321');
      
      expect(guild).toBe(mockGuild);
      expect(mockClient.guilds.fetch).toHaveBeenCalledWith('987654321');
    });

    test('should handle guild fetch failure', async () => {
      mockClient.guilds.fetch.mockRejectedValue(new Error('Guild not found'));
      
      await expect(discordService.fetchGuild('invalid')).rejects.toThrow('Guild not found');
    });
  });

  describe('Event Handling', () => {
    test('should register message event handler', () => {
      const handler = jest.fn();
      
      const cleanup = discordService.onMessage(handler);
      
      expect(mockClient.on).toHaveBeenCalledWith('messageCreate', expect.any(Function));
      expect(typeof cleanup).toBe('function');
    });

    test('should register ready event handler', () => {
      const handler = jest.fn();
      
      const cleanup = discordService.onReady(handler);
      
      expect(mockClient.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(typeof cleanup).toBe('function');
    });

    test('should register error event handler', () => {
      const handler = jest.fn();
      
      const cleanup = discordService.onError(handler);
      
      expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(typeof cleanup).toBe('function');
    });

    test('should cleanup event handlers', () => {
      const handler = jest.fn();
      
      const cleanup = discordService.onMessage(handler);
      cleanup();
      
      expect(mockClient.off).toHaveBeenCalledWith('messageCreate', expect.any(Function));
    });

    test('should handle event handler errors gracefully', () => {
      const handler = jest.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      
      // Register handler
      discordService.onMessage(handler);
      
      // Simulate event with error
      const wrappedHandler = mockClient.on.mock.calls[0][1];
      const mockMessage = { content: 'test' };
      
      expect(() => wrappedHandler(mockMessage)).not.toThrow();
      expect(handler).toHaveBeenCalledWith(mockMessage);
    });
  });

  describe('Client Status', () => {
    test('should check if client is ready', () => {
      mockClient.readyAt = new Date();
      
      expect(discordService.isReady()).toBe(true);
    });

    test('should return false when client not ready', () => {
      mockClient.readyAt = null;
      
      expect(discordService.isReady()).toBe(false);
    });

    test('should get client latency', () => {
      expect(discordService.getLatency()).toBe(50);
    });

    test('should get current user', async () => {
      const user = await discordService.getCurrentUser();
      
      expect(user).toBe(mockClient.user);
    });

    test('should handle missing user gracefully', async () => {
      mockClient.user = null;
      
      const user = await discordService.getCurrentUser();
      
      expect(user).toBeNull();
    });
  });

  describe('Presence Management', () => {
    test('should set bot presence', async () => {
      const presence = {
        activities: [{ name: 'Test Game', type: 0 }],
        status: 'online'
      };
      
      await discordService.setPresence(presence);
      
      expect(mockClient.user.setPresence).toHaveBeenCalledWith(presence);
    });

    test('should handle presence setting failure', async () => {
      mockClient.user.setPresence.mockRejectedValue(new Error('Presence failed'));
      
      await expect(discordService.setPresence({})).rejects.toThrow('Presence failed');
    });
  });

  describe('Complex Message Content', () => {
    beforeEach(() => {
      const mockChannel = {
        id: '123456789',
        isTextBased: jest.fn().mockReturnValue(true),
        send: jest.fn().mockResolvedValue({ id: 'message123' })
      };
      mockClient.channels.fetch.mockResolvedValue(mockChannel);
    });

    test('should send message with embed', async () => {
      const content = {
        content: 'Hello',
        embeds: [{ title: 'Test Embed' }]
      };
      
      await discordService.sendMessage('123456789', content);
      
      const mockChannel = await mockClient.channels.fetch('123456789');
      expect(mockChannel.send).toHaveBeenCalledWith(content);
    });

    test('should send message with components', async () => {
      const content = {
        content: 'Hello',
        components: [{ type: 1, components: [] }]
      };
      
      await discordService.sendMessage('123456789', content);
      
      const mockChannel = await mockClient.channels.fetch('123456789');
      expect(mockChannel.send).toHaveBeenCalledWith(content);
    });

    test('should send simple string message', async () => {
      await discordService.sendMessage('123456789', 'Simple message');
      
      const mockChannel = await mockClient.channels.fetch('123456789');
      expect(mockChannel.send).toHaveBeenCalledWith('Simple message');
    });
  });

  describe('Event Handler Management', () => {
    test('should store and manage multiple handlers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();
      
      const cleanup1 = discordService.onMessage(handler1);
      const cleanup2 = discordService.onReady(handler2);
      const cleanup3 = discordService.onError(handler3);
      
      expect(mockClient.on).toHaveBeenCalledTimes(3);
      
      cleanup1();
      cleanup2();
      cleanup3();
      
      expect(mockClient.off).toHaveBeenCalledTimes(3);
    });

    test('should handle duplicate handler registration', () => {
      const handler = jest.fn();
      
      const cleanup1 = discordService.onMessage(handler);
      const cleanup2 = discordService.onMessage(handler);
      
      expect(mockClient.on).toHaveBeenCalledTimes(2);
      
      cleanup1();
      cleanup2();
      
      expect(mockClient.off).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Scenarios', () => {
    test('should handle client destruction errors', async () => {
      mockClient.destroy.mockRejectedValue(new Error('Destroy failed'));
      
      await expect(discordService.destroy()).rejects.toThrow('Destroy failed');
    });

    test('should handle channel send errors', async () => {
      const mockChannel = {
        id: '123456789',
        isTextBased: jest.fn().mockReturnValue(true),
        send: jest.fn().mockRejectedValue(new Error('Send failed'))
      };
      mockClient.channels.fetch.mockResolvedValue(mockChannel);
      
      await expect(discordService.sendMessage('123456789', 'Hello')).rejects.toThrow('Send failed');
    });

    test('should handle missing client properties gracefully', () => {
      mockClient.ws = undefined;
      
      expect(discordService.getLatency()).toBe(0);
    });

    test('should handle event cleanup errors gracefully', () => {
      mockClient.off.mockImplementation(() => {
        throw new Error('Cleanup failed');
      });
      
      const handler = jest.fn();
      const cleanup = discordService.onMessage(handler);
      
      expect(() => cleanup()).not.toThrow();
    });
  });
});