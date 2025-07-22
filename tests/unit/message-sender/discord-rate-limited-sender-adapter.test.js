import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { DiscordRateLimitedSenderAdapter } from '../../../src/services/implementations/message-sender/discord-rate-limited-sender-adapter.js';

describe('DiscordRateLimitedSenderAdapter (Backward Compatibility)', () => {
  let adapter;
  let mockLogger;
  let mockChannel;

  beforeEach(() => {
    jest.useFakeTimers();

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockChannel = {
      id: 'test-channel-123',
      name: 'test-channel',
      send: jest.fn().mockResolvedValue({ id: 'message-123' }),
    };

    adapter = new DiscordRateLimitedSenderAdapter(mockLogger, {
      testMode: true,
      autoStart: false,
      baseSendDelay: 1000,
      burstAllowance: 5,
      maxRetries: 3,
    });
  });

  afterEach(() => {
    if (adapter && adapter.isProcessing) {
      adapter.newSender.isProcessing = false;
      adapter.newSender.scheduler?.stop();
    }
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with original DiscordRateLimitedSender options', () => {
      expect(adapter.baseSendDelay).toBe(1000);
      expect(adapter.burstAllowance).toBe(5);
      expect(adapter.maxRetries).toBe(3);
      expect(adapter.testMode).toBe(true);
      expect(adapter.autoStart).toBe(false);
    });

    it('should create new architecture instance with mapped options', () => {
      expect(adapter.newSender).toBeDefined();
      expect(adapter.newSender.testMode).toBe(true);
      expect(adapter.newSender.isProcessing).toBe(false);
    });

    it('should setup compatibility metrics structure', () => {
      expect(adapter.compatibilityMetrics).toEqual({
        totalMessages: 0,
        successfulSends: 0,
        failedSends: 0,
        rateLimitHits: 0,
        totalRetries: 0,
        averageQueueTime: 0,
        maxQueueTime: 0,
        currentBurstCount: 0,
        lastRateLimitHit: null,
        processingStartTime: null,
      });
    });

    it('should auto-start when enabled', () => {
      const autoStartAdapter = new DiscordRateLimitedSenderAdapter(mockLogger, {
        testMode: true,
        autoStart: true,
      });

      expect(autoStartAdapter.isProcessing).toBe(true);
    });
  });

  describe('API Compatibility - queueMessage', () => {
    it('should queue and process messages like original', async () => {
      adapter.startProcessing();

      const result = await adapter.queueMessage(mockChannel, 'Test message');

      expect(result.id).toBe('message-123');
      expect(mockChannel.send).toHaveBeenCalledWith('Test message');
    });

    it('should handle priority options like original', async () => {
      adapter.startProcessing();

      const promises = [
        adapter.queueMessage(mockChannel, 'Low priority', { priority: 1 }),
        adapter.queueMessage(mockChannel, 'High priority', { priority: 10 }),
        adapter.queueMessage(mockChannel, 'Medium priority', { priority: 5 }),
      ];

      await Promise.all(promises);

      expect(mockChannel.send).toHaveBeenNthCalledWith(1, 'High priority');
      expect(mockChannel.send).toHaveBeenNthCalledWith(2, 'Medium priority');
      expect(mockChannel.send).toHaveBeenNthCalledWith(3, 'Low priority');
    });

    it('should handle object content like original', async () => {
      const embedContent = {
        embeds: [{ title: 'Test', description: 'Test embed' }],
      };

      adapter.startProcessing();

      const result = await adapter.queueMessage(mockChannel, embedContent);

      expect(result.id).toBe('message-123');
      expect(mockChannel.send).toHaveBeenCalledWith(embedContent);
    });
  });

  describe('API Compatibility - sendImmediate', () => {
    it('should send immediately like original', async () => {
      const result = await adapter.sendImmediate(mockChannel, 'Immediate message');

      expect(result.id).toBe('message-123');
      expect(mockChannel.send).toHaveBeenCalledWith('Immediate message');
    });

    it('should handle errors like original', async () => {
      const error = new Error('Send failed');
      mockChannel.send.mockRejectedValue(error);

      await expect(adapter.sendImmediate(mockChannel, 'Failed message')).rejects.toThrow('Send failed');
    });
  });

  describe('API Compatibility - Processing Control', () => {
    it('should start and stop processing like original', async () => {
      expect(adapter.isProcessing).toBe(false);

      adapter.startProcessing();
      expect(adapter.isProcessing).toBe(true);

      await adapter.stopProcessing();
      expect(adapter.isProcessing).toBe(false);
    });

    it('should expose isProcessing property like original', () => {
      expect(typeof adapter.isProcessing).toBe('boolean');

      adapter.startProcessing();
      expect(adapter.isProcessing).toBe(true);
    });

    it('should expose isPaused property like original', () => {
      expect(typeof adapter.isPaused).toBe('boolean');
      expect(adapter.isPaused).toBe(false);
    });
  });

  describe('API Compatibility - Metrics', () => {
    it('should provide metrics in original format', () => {
      const metrics = adapter.getMetrics();

      // Check structure matches original
      expect(metrics).toHaveProperty('totalMessages');
      expect(metrics).toHaveProperty('successfulSends');
      expect(metrics).toHaveProperty('failedSends');
      expect(metrics).toHaveProperty('rateLimitHits');
      expect(metrics).toHaveProperty('totalRetries');
      expect(metrics).toHaveProperty('averageQueueTime');
      expect(metrics).toHaveProperty('maxQueueTime');
      expect(metrics).toHaveProperty('currentQueueSize');
      expect(metrics).toHaveProperty('isProcessing');
      expect(metrics).toHaveProperty('isPaused');
      expect(metrics).toHaveProperty('pauseUntil');
      expect(metrics).toHaveProperty('successRate');
      expect(metrics).toHaveProperty('configuration');

      // Check configuration structure
      expect(metrics.configuration).toHaveProperty('baseSendDelay');
      expect(metrics.configuration).toHaveProperty('burstAllowance');
      expect(metrics.configuration).toHaveProperty('burstResetTime');
      expect(metrics.configuration).toHaveProperty('maxRetries');
    });

    it('should update metrics when processing messages', async () => {
      adapter.startProcessing();

      await adapter.queueMessage(mockChannel, 'Test message');

      const metrics = adapter.getMetrics();
      expect(metrics.totalMessages).toBe(1);
      expect(metrics.successfulSends).toBe(1);
      expect(metrics.currentQueueSize).toBe(0);
    });

    it('should calculate success rate like original', async () => {
      adapter.startProcessing();

      // Send successful message
      await adapter.queueMessage(mockChannel, 'Success');

      // Mock failure
      const failError = new Error('Permanent failure');
      failError.code = 50013; // Non-retryable
      mockChannel.send.mockRejectedValueOnce(failError);

      try {
        await adapter.queueMessage(mockChannel, 'Fail');
      } catch (_error) {
        // Expected failure
      }

      const metrics = adapter.getMetrics();
      expect(metrics.successRate).toBe(50); // 1 success out of 2 total
    });
  });

  describe('API Compatibility - Queue Management', () => {
    it('should expose messageQueue property like original', async () => {
      // Add some messages without processing
      const promise1 = adapter.queueMessage(mockChannel, 'Message 1').catch(() => {});
      const promise2 = adapter.queueMessage(mockChannel, 'Message 2').catch(() => {});

      // Wait for messages to be queued
      await new Promise(resolve => setImmediate(resolve));

      const queue = adapter.messageQueue;
      expect(Array.isArray(queue)).toBe(true);
      expect(queue).toHaveLength(2);

      // Check structure matches original
      expect(queue[0]).toHaveProperty('id');
      expect(queue[0]).toHaveProperty('channel');
      expect(queue[0]).toHaveProperty('content');
      expect(queue[0]).toHaveProperty('options');
      expect(queue[0]).toHaveProperty('retryCount');
      expect(queue[0]).toHaveProperty('createdAt');
      expect(queue[0]).toHaveProperty('priority');

      // Clean up
      adapter.clearQueue('Test cleanup');
      await Promise.allSettled([promise1, promise2]);
    });

    it('should clear queue like original', async () => {
      const promise1 = adapter.queueMessage(mockChannel, 'Message 1').catch(() => {});
      const promise2 = adapter.queueMessage(mockChannel, 'Message 2').catch(() => {});

      // Wait for messages to be queued
      await new Promise(resolve => setImmediate(resolve));

      expect(adapter.messageQueue).toHaveLength(2);

      adapter.clearQueue('Test clear');

      expect(adapter.messageQueue).toHaveLength(0);

      // Wait for promise rejections
      await Promise.allSettled([promise1, promise2]);
    });
  });

  describe('API Compatibility - Utility Methods', () => {
    it('should generate task IDs like original', () => {
      const taskId = adapter.generateTaskId();

      expect(taskId).toMatch(/^msg_\d+_[a-z0-9]+$/);
      expect(typeof taskId).toBe('string');
    });

    it('should provide delay method like original', async () => {
      const start = Date.now();
      await adapter.delay(100);
      const end = Date.now();

      // In test mode with fake timers, delay should resolve immediately
      expect(end - start).toBeLessThan(50);
    });

    it('should respect enableDelays option in delay method', async () => {
      const noDelayAdapter = new DiscordRateLimitedSenderAdapter(mockLogger, {
        enableDelays: false,
      });

      const delayPromise = noDelayAdapter.delay(1000);
      await expect(delayPromise).resolves.toBeUndefined();
    });
  });

  describe('API Compatibility - Shutdown', () => {
    it('should shutdown gracefully like original', async () => {
      adapter.startProcessing();

      const promise1 = adapter.queueMessage(mockChannel, 'Message 1');
      const promise2 = adapter.queueMessage(mockChannel, 'Message 2');

      const shutdownPromise = adapter.shutdown(5000);

      await Promise.all([promise1, promise2, shutdownPromise]);

      expect(adapter.isProcessing).toBe(false);
      expect(mockChannel.send).toHaveBeenCalledTimes(2);
    });
  });

  describe('API Compatibility - Error Handling', () => {
    it('should handle retryable errors like original', () => {
      const networkError = new Error('ECONNRESET');
      networkError.code = 'ECONNRESET';

      expect(adapter.isRetryableError(networkError)).toBe(true);
    });

    it('should handle non-retryable errors like original', () => {
      const permError = new Error('Missing permissions');
      permError.code = 50013;

      expect(adapter.isRetryableError(permError)).toBe(false);
    });

    it('should calculate retry delay like original', () => {
      const delay1 = adapter.calculateRetryDelay(1);
      const delay2 = adapter.calculateRetryDelay(2);

      expect(delay1).toBeGreaterThan(0);
      expect(delay2).toBeGreaterThan(delay1); // Exponential backoff
    });
  });

  describe('Event Forwarding and Metrics Updates', () => {
    it('should update compatibility metrics from events', async () => {
      adapter.startProcessing();

      // Queue a message to trigger events
      await adapter.queueMessage(mockChannel, 'Test message');

      // Check that compatibility metrics were updated
      expect(adapter.compatibilityMetrics.totalMessages).toBe(1);
      expect(adapter.compatibilityMetrics.successfulSends).toBe(1);
    });

    it('should forward rate limit events', () => {
      // This is tested implicitly through the metrics system
      // The event forwarding setup is verified in constructor tests
      expect(adapter.newSender.listenerCount('message-queued')).toBeGreaterThan(0);
      expect(adapter.newSender.listenerCount('message-processed')).toBeGreaterThan(0);
      expect(adapter.newSender.listenerCount('message-failed')).toBeGreaterThan(0);
    });
  });

  describe('Options Mapping', () => {
    it('should map old options to new architecture correctly', () => {
      const testAdapter = new DiscordRateLimitedSenderAdapter(mockLogger, {
        baseSendDelay: 2000,
        burstAllowance: 10,
        burstResetTime: 120000,
        maxRetries: 5,
        backoffMultiplier: 3,
        maxBackoffDelay: 60000,
        testMode: false,
        autoStart: false,
      });

      expect(testAdapter.baseSendDelay).toBe(2000);
      expect(testAdapter.burstAllowance).toBe(10);
      expect(testAdapter.burstResetTime).toBe(120000);
      expect(testAdapter.maxRetries).toBe(5);
      expect(testAdapter.backoffMultiplier).toBe(3);
      expect(testAdapter.maxBackoffDelay).toBe(60000);
      expect(testAdapter.testMode).toBe(false);
      expect(testAdapter.autoStart).toBe(false);
    });
  });

  describe('Compatibility Properties', () => {
    it('should provide pauseUntil property (always null)', () => {
      expect(adapter.pauseUntil).toBeNull();
    });

    it('should provide updateQueueMetrics method (no-op)', () => {
      // Should not throw
      expect(() => adapter.updateQueueMetrics()).not.toThrow();
    });
  });
});
