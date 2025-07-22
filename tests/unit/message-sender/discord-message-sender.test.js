import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { DiscordMessageSender } from '../../../src/services/implementations/message-sender/discord-message-sender.js';

describe('DiscordMessageSender', () => {
  let sender;
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

    sender = new DiscordMessageSender(mockLogger, {
      testMode: true, // Enable test mode for synchronous processing
      autoStart: false, // Disable auto-start for manual control
      baseSendDelay: 0,
      burstAllowance: 5,
      maxRetries: 2,
    });
  });

  afterEach(() => {
    if (sender && sender.isProcessing) {
      sender.isProcessing = false; // Force stop in test mode
      sender.scheduler?.stop();
    }
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(sender.isProcessing).toBe(false);
      expect(sender.isPaused).toBe(false);
      expect(sender.testMode).toBe(true);
      expect(sender.queue.size()).toBe(0);
    });

    it('should initialize with auto-start when enabled', () => {
      sender = new DiscordMessageSender(mockLogger, {
        testMode: true,
        autoStart: true,
      });

      expect(sender.isProcessing).toBe(true);
    });
  });

  describe('Message Queuing and Processing', () => {
    it('should queue and process messages successfully in test mode', async () => {
      sender.startProcessing();

      const result = await sender.queueMessage(mockChannel, 'Test message');

      expect(result.id).toBe('message-123');
      expect(mockChannel.send).toHaveBeenCalledWith('Test message');
      expect(sender.queue.size()).toBe(0); // Processed immediately
    });

    it('should handle multiple messages in order', async () => {
      sender.startProcessing();

      const promises = [
        sender.queueMessage(mockChannel, 'Message 1'),
        sender.queueMessage(mockChannel, 'Message 2'),
        sender.queueMessage(mockChannel, 'Message 3'),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.id).toBe('message-123');
      });

      expect(mockChannel.send).toHaveBeenCalledTimes(3);
      expect(mockChannel.send).toHaveBeenNthCalledWith(1, 'Message 1');
      expect(mockChannel.send).toHaveBeenNthCalledWith(2, 'Message 2');
      expect(mockChannel.send).toHaveBeenNthCalledWith(3, 'Message 3');
    });

    it('should respect message priority', async () => {
      sender.startProcessing();

      // Queue messages with different priorities (higher number = higher priority)
      const promises = [
        sender.queueMessage(mockChannel, 'Low priority', { priority: 1 }),
        sender.queueMessage(mockChannel, 'High priority', { priority: 10 }),
        sender.queueMessage(mockChannel, 'Medium priority', { priority: 5 }),
      ];

      await Promise.all(promises);

      expect(mockChannel.send).toHaveBeenNthCalledWith(1, 'High priority');
      expect(mockChannel.send).toHaveBeenNthCalledWith(2, 'Medium priority');
      expect(mockChannel.send).toHaveBeenNthCalledWith(3, 'Low priority');
    });
  });

  describe('Immediate Sending', () => {
    it('should send messages immediately without queuing', async () => {
      const result = await sender.sendImmediate(mockChannel, 'Immediate message');

      expect(result.id).toBe('message-123');
      expect(mockChannel.send).toHaveBeenCalledWith('Immediate message');
      expect(sender.queue.size()).toBe(0);
    });

    it('should handle immediate send failures', async () => {
      const error = new Error('Immediate send failed');
      mockChannel.send.mockRejectedValue(error);

      await expect(sender.sendImmediate(mockChannel, 'Failed message')).rejects.toThrow('Immediate send failed');
    });
  });

  describe('Processing Control', () => {
    it('should start and stop processing', async () => {
      expect(sender.isProcessing).toBe(false);

      sender.startProcessing();
      expect(sender.isProcessing).toBe(true);

      await sender.stopProcessing();
      expect(sender.isProcessing).toBe(false);
    });

    it('should pause and resume processing', async () => {
      sender.startProcessing();
      expect(sender.isProcessing).toBe(true);
      expect(sender.isPaused).toBe(false);

      sender.pauseProcessing('Test pause');
      expect(sender.isPaused).toBe(true);

      sender.resumeProcessing();
      expect(sender.isPaused).toBe(false);
    });

    it('should warn when starting already running processing', () => {
      sender.startProcessing();
      sender.startProcessing(); // Second call

      expect(mockLogger.warn).toHaveBeenCalledWith('Message processing already running');
    });

    it('should warn when trying to start processing while paused', () => {
      sender.isPaused = true;
      sender.startProcessing();

      expect(mockLogger.warn).toHaveBeenCalledWith('Message processing is paused');
    });
  });

  describe('Error Handling', () => {
    it('should handle channel send errors', async () => {
      const sendError = new Error('Channel send failed');
      mockChannel.send.mockRejectedValue(sendError);

      sender.startProcessing();

      await expect(sender.queueMessage(mockChannel, 'Failed message')).rejects.toThrow('Channel send failed');
    });

    it('should handle rate limiting (429 errors)', async () => {
      const rateLimitError = new Error('Rate limited');
      rateLimitError.code = 429;
      rateLimitError.retryAfter = 1; // 1 second

      // Force rate limiter to be paused to test handling
      sender.rateLimiter.forceRateLimit(100, 'Test rate limit');

      mockChannel.send.mockResolvedValue({ id: 'success-after-rate-limit' });

      sender.startProcessing();

      // Wait a bit to let rate limit expire
      await new Promise(resolve => setTimeout(resolve, 150));

      const result = await sender.queueMessage(mockChannel, 'Rate limited message');
      expect(result.id).toBe('success-after-rate-limit');
    });

    it('should handle retryable errors', async () => {
      const networkError = new Error('ECONNRESET');
      networkError.code = 'ECONNRESET';

      mockChannel.send.mockRejectedValueOnce(networkError).mockResolvedValueOnce({ id: 'success-after-retry' });

      sender.startProcessing();

      const result = await sender.queueMessage(mockChannel, 'Retry test message');
      expect(result.id).toBe('success-after-retry');
      expect(mockChannel.send).toHaveBeenCalledTimes(2);
    });

    it('should fail permanently after max retries', async () => {
      const networkError = new Error('ECONNRESET');
      networkError.code = 'ECONNRESET';

      mockChannel.send.mockRejectedValue(networkError);

      sender.startProcessing();

      await expect(sender.queueMessage(mockChannel, 'Will fail permanently')).rejects.toThrow('ECONNRESET');
      expect(mockChannel.send).toHaveBeenCalledTimes(3); // Original + 2 retries
    });

    it('should not retry non-retryable errors', async () => {
      const permError = new Error('Missing permissions');
      permError.code = 50013; // Discord permission error

      mockChannel.send.mockRejectedValue(permError);

      sender.startProcessing();

      await expect(sender.queueMessage(mockChannel, 'Permission error test')).rejects.toThrow('Missing permissions');
      expect(mockChannel.send).toHaveBeenCalledTimes(1); // No retries
    });
  });

  describe('Queue Management', () => {
    it('should clear queue with reason', async () => {
      // Add messages to queue without processing (don't start processing)
      const promise1 = sender.queueMessage(mockChannel, 'Message 1').catch(() => {}); // Catch rejection
      const promise2 = sender.queueMessage(mockChannel, 'Message 2').catch(() => {}); // Catch rejection
      const promise3 = sender.queueMessage(mockChannel, 'Message 3').catch(() => {}); // Catch rejection

      // Wait a tick for messages to be queued
      await new Promise(resolve => setImmediate(resolve));
      expect(sender.queue.size()).toBe(3);

      const cleared = sender.clearQueue('Test clear');
      expect(sender.queue.size()).toBe(0);
      expect(cleared).toHaveLength(3);

      // Wait for promise rejections to be handled
      await Promise.allSettled([promise1, promise2, promise3]);
    });

    it('should reject cleared messages', async () => {
      const promise1 = sender.queueMessage(mockChannel, 'Message 1');
      const promise2 = sender.queueMessage(mockChannel, 'Message 2');

      // Wait a tick for messages to be queued
      await new Promise(resolve => setImmediate(resolve));

      sender.clearQueue('Test rejection');

      await expect(promise1).rejects.toThrow('Test rejection');
      await expect(promise2).rejects.toThrow('Test rejection');
    });
  });

  describe('Object Messages', () => {
    it('should handle object message content', async () => {
      const embedMessage = {
        embeds: [{ title: 'Test Embed', description: 'Test description' }],
      };

      sender.startProcessing();

      const result = await sender.queueMessage(mockChannel, embedMessage);
      expect(result.id).toBe('message-123');
      expect(mockChannel.send).toHaveBeenCalledWith(embedMessage);
    });

    it('should merge content and options for object messages', async () => {
      const content = { content: 'Hello' };
      const options = { ephemeral: true };

      sender.startProcessing();

      await sender.queueMessage(mockChannel, content, options);

      expect(mockChannel.send).toHaveBeenCalledWith({
        content: 'Hello',
        ephemeral: true,
      });
    });
  });

  describe('Metrics', () => {
    it('should track basic metrics', async () => {
      sender.startProcessing();

      await sender.queueMessage(mockChannel, 'Success 1');
      await sender.queueMessage(mockChannel, 'Success 2');

      // Mock a failure for non-retryable error
      const permanentError = new Error('Permanent failure');
      permanentError.code = 50013; // Discord permission error (non-retryable)
      mockChannel.send.mockRejectedValueOnce(permanentError);

      try {
        await sender.queueMessage(mockChannel, 'Will fail');
      } catch (_error) {
        // Expected to fail
      }

      const metrics = sender.getMetrics();
      expect(metrics.global.totalMessages).toBe(3);
      expect(metrics.global.successfulSends).toBe(2);
      expect(metrics.global.failedSends).toBe(1);
      expect(metrics.global.currentQueueSize).toBe(0);
      expect(metrics.global.isProcessing).toBe(true);
      expect(metrics.global.testMode).toBe(true);
    });

    it('should calculate messages per second', async () => {
      sender.startProcessing();

      await sender.queueMessage(mockChannel, 'Message 1');
      await sender.queueMessage(mockChannel, 'Message 2');

      const metrics = sender.getMetrics();
      expect(metrics.global.messagesPerSecond).toBeGreaterThan(0);
      expect(metrics.global.uptime).toBeGreaterThan(0);
    });
  });

  describe('Event Handling', () => {
    it('should emit processing events', async () => {
      const events = [];
      sender.on('processing-started', () => events.push('started'));
      sender.on('processing-stopped', () => events.push('stopped'));
      sender.on('message-queued', () => events.push('queued'));
      sender.on('message-processed', () => events.push('processed'));

      sender.startProcessing();
      await sender.queueMessage(mockChannel, 'Test message');
      await sender.stopProcessing();

      expect(events).toContain('started');
      expect(events).toContain('stopped');
      expect(events).toContain('queued');
      expect(events).toContain('processed');
    });

    it('should emit failure events', async () => {
      const failureEvents = [];
      sender.on('message-failed', (message, error) => {
        failureEvents.push({ messageId: message.id, error: error.message });
      });

      const permanentError = new Error('Test failure');
      permanentError.code = 50013; // Discord permission error (non-retryable)
      mockChannel.send.mockRejectedValue(permanentError);

      sender.startProcessing();

      try {
        await sender.queueMessage(mockChannel, 'Failing message');
      } catch (_error) {
        // Expected failure
      }

      expect(failureEvents).toHaveLength(1);
      expect(failureEvents[0].error).toBe('Test failure');
    });
  });

  describe('Graceful Shutdown', () => {
    it('should shutdown gracefully', async () => {
      sender.startProcessing();

      // Add messages to queue
      const promise1 = sender.queueMessage(mockChannel, 'Message 1');
      const promise2 = sender.queueMessage(mockChannel, 'Message 2');

      const shutdownPromise = sender.shutdown(5000);

      // Wait for both operations
      await Promise.all([promise1, promise2, shutdownPromise]);

      expect(sender.isProcessing).toBe(false);
      expect(sender.queue.size()).toBe(0);
      expect(mockChannel.send).toHaveBeenCalledTimes(2);
    });

    it('should clear remaining messages on shutdown timeout', async () => {
      sender = new DiscordMessageSender(mockLogger, {
        testMode: false, // Disable test mode to simulate timeout
        autoStart: false,
      });

      sender.startProcessing();

      // Add messages but don't let them process
      const promise1 = sender.queueMessage(mockChannel, 'Message 1');
      const promise2 = sender.queueMessage(mockChannel, 'Message 2');

      // Very short timeout to force cleanup
      await sender.shutdown(10);

      // Messages should be rejected due to timeout
      await expect(promise1).rejects.toThrow('Shutdown timeout reached');
      await expect(promise2).rejects.toThrow('Shutdown timeout reached');
    });
  });

  describe('Compatibility', () => {
    it('should provide generateTaskId method for compatibility', () => {
      const taskId = sender.generateTaskId();
      expect(taskId).toMatch(/^task_\d+_[a-z0-9]+$/);
    });

    it('should provide metrics structure similar to original', () => {
      const metrics = sender.getMetrics();

      // Check structure matches what tests expect
      expect(metrics.global).toBeDefined();
      expect(metrics.global.totalMessages).toBeDefined();
      expect(metrics.global.successfulSends).toBeDefined();
      expect(metrics.global.failedSends).toBeDefined();
      expect(metrics.global.currentQueueSize).toBeDefined();
      expect(metrics.global.isProcessing).toBeDefined();
    });
  });
});
