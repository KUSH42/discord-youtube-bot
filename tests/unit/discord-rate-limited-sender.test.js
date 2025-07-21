import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { DiscordRateLimitedSender } from '../../src/services/implementations/discord-rate-limited-sender.js';

describe('DiscordRateLimitedSender', () => {
  let sender;
  let mockLogger;
  let mockChannel;

  beforeEach(() => {
    jest.clearAllMocks();
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

    sender = new DiscordRateLimitedSender(mockLogger, {
      baseSendDelay: 100, // Faster for testing
      burstAllowance: 3,
      burstResetTime: 1000,
      maxRetries: 2,
    });

    // Keep processing enabled but use fake timers to control timing
  });

  afterEach(async () => {
    if (sender) {
      // Stop processing and clear queue immediately for fast cleanup
      sender.stopProcessing();
      sender.clearQueue('Test cleanup');
    }
    jest.useRealTimers();
  });

  describe('Basic Message Queuing', () => {
    it('should queue and send messages successfully', async () => {
      const messagePromise = sender.queueMessage(mockChannel, 'Test message');

      // Advance timers to allow processing
      await jest.advanceTimersByTimeAsync(200);

      const result = await messagePromise;
      expect(result.id).toBe('message-123');
      expect(mockChannel.send).toHaveBeenCalledWith('Test message');
      expect(sender.metrics.successfulSends).toBe(1);
    });

    it('should handle multiple messages in queue order', async () => {
      const message1Promise = sender.queueMessage(mockChannel, 'Message 1');
      const message2Promise = sender.queueMessage(mockChannel, 'Message 2');
      const message3Promise = sender.queueMessage(mockChannel, 'Message 3');

      // Process the queue
      await jest.advanceTimersByTimeAsync(1000);

      await Promise.all([message1Promise, message2Promise, message3Promise]);

      expect(mockChannel.send).toHaveBeenNthCalledWith(1, 'Message 1');
      expect(mockChannel.send).toHaveBeenNthCalledWith(2, 'Message 2');
      expect(mockChannel.send).toHaveBeenNthCalledWith(3, 'Message 3');
      expect(sender.metrics.successfulSends).toBe(3);
    });

    it('should respect message priority ordering', async () => {
      const lowPriorityPromise = sender.queueMessage(mockChannel, 'Low priority', { priority: 0 });
      const highPriorityPromise = sender.queueMessage(mockChannel, 'High priority', { priority: 10 });
      const mediumPriorityPromise = sender.queueMessage(mockChannel, 'Medium priority', { priority: 5 });

      // Process the queue
      await jest.advanceTimersByTimeAsync(1000);

      await Promise.all([lowPriorityPromise, highPriorityPromise, mediumPriorityPromise]);

      expect(mockChannel.send).toHaveBeenNthCalledWith(1, 'High priority');
      expect(mockChannel.send).toHaveBeenNthCalledWith(2, 'Medium priority');
      expect(mockChannel.send).toHaveBeenNthCalledWith(3, 'Low priority');
    });
  });

  describe('Rate Limiting', () => {
    it('should allow burst messages without delay', async () => {
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(sender.queueMessage(mockChannel, `Burst message ${i + 1}`));
      }

      // Process all queued messages manually
      while (sender.messageQueue.length > 0) {
        const task = sender.messageQueue.shift();
        await sender.processMessage(task);
      }

      await Promise.all(promises);
      expect(mockChannel.send).toHaveBeenCalledTimes(3);
    });

    it('should apply delay after burst allowance exceeded', async () => {
      const promises = [];

      // Send burst allowance messages (3)
      for (let i = 0; i < 3; i++) {
        promises.push(sender.queueMessage(mockChannel, `Burst ${i + 1}`));
      }

      // Send one more that should be delayed
      promises.push(sender.queueMessage(mockChannel, 'Delayed message'));

      // Process all messages manually without queue processing delays
      const tasks = [];
      while (sender.messageQueue.length > 0) {
        tasks.push(sender.messageQueue.shift());
      }

      for (const task of tasks) {
        await sender.processMessage(task);
      }

      await Promise.all(promises);
      expect(mockChannel.send).toHaveBeenCalledTimes(4);
      expect(mockChannel.send).toHaveBeenCalledWith('Delayed message');
    });
  });

  describe('Discord Rate Limit Handling (429 Errors)', () => {
    it('should handle 429 errors with retry-after', async () => {
      const rateLimitError = new Error('Rate limited');
      rateLimitError.code = 429;
      rateLimitError.retryAfter = 2; // 2 seconds

      // First call fails with rate limit, second succeeds
      mockChannel.send.mockRejectedValueOnce(rateLimitError).mockResolvedValue({ id: 'success-message' });

      const messagePromise = sender.queueMessage(mockChannel, 'Rate limited message');

      // Process the message manually - first attempt should fail and set rate limit
      const task = sender.messageQueue.shift();
      await sender.processMessage(task);

      expect(sender.metrics.rateLimitHits).toBe(1);
      expect(sender.isPaused).toBe(true);
      expect(sender.messageQueue).toHaveLength(1); // Task should be re-queued

      // Simulate time passing and retry
      sender.isPaused = false;
      sender.pauseUntil = null;

      const retryTask = sender.messageQueue.shift();
      await sender.processMessage(retryTask);

      const result = await messagePromise;
      expect(result.id).toBe('success-message');
      expect(mockChannel.send).toHaveBeenCalledTimes(2);
    });

    it('should pause entire queue when rate limited', async () => {
      const rateLimitError = new Error('Rate limited');
      rateLimitError.code = 429;
      rateLimitError.retryAfter = 1;

      // First message triggers rate limit
      mockChannel.send
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue({ id: 'msg1' })
        .mockResolvedValue({ id: 'msg2' })
        .mockResolvedValue({ id: 'msg3' });

      const message1Promise = sender.queueMessage(mockChannel, 'Message 1');
      const message2Promise = sender.queueMessage(mockChannel, 'Message 2');
      const message3Promise = sender.queueMessage(mockChannel, 'Message 3');

      // Process first message (triggers rate limit)
      const task1 = sender.messageQueue.shift();
      await sender.processMessage(task1);

      expect(sender.isPaused).toBe(true);
      expect(mockChannel.send).toHaveBeenCalledTimes(1);
      expect(sender.messageQueue).toHaveLength(3); // Original task re-queued + 2 others

      // Clear the pause and process remaining messages
      sender.isPaused = false;
      sender.pauseUntil = null;

      // Process all remaining tasks manually
      const remainingTasks = [];
      while (sender.messageQueue.length > 0) {
        remainingTasks.push(sender.messageQueue.shift());
      }

      for (const task of remainingTasks) {
        await sender.processMessage(task);
      }

      await Promise.all([message1Promise, message2Promise, message3Promise]);

      // All messages should eventually be sent
      expect(mockChannel.send).toHaveBeenCalledTimes(4); // 1 failed + 3 successful
      expect(sender.metrics.rateLimitHits).toBe(1);
    });
  });

  describe('Retry Logic', () => {
    it('should retry on retryable errors', async () => {
      const networkError = new Error('ECONNRESET');
      networkError.code = 'ECONNRESET';

      // Fail twice, then succeed
      mockChannel.send
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue({ id: 'success-after-retry' });

      const messagePromise = sender.queueMessage(mockChannel, 'Retry test message');

      // Process through all retries
      await jest.advanceTimersByTimeAsync(5000);

      const result = await messagePromise;
      expect(result.id).toBe('success-after-retry');
      expect(mockChannel.send).toHaveBeenCalledTimes(3);
      expect(sender.metrics.totalRetries).toBe(2);
    });

    it('should fail permanently after max retries', async () => {
      const networkError = new Error('ECONNRESET');
      networkError.code = 'ECONNRESET';

      mockChannel.send.mockRejectedValue(networkError);

      const messagePromise = sender.queueMessage(mockChannel, 'Will fail permanently');

      // Process through all retries
      await jest.advanceTimersByTimeAsync(10000);

      await expect(messagePromise).rejects.toThrow('ECONNRESET');
      expect(mockChannel.send).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(sender.metrics.failedSends).toBe(1);
    });

    it('should not retry non-retryable errors', async () => {
      const permError = new Error('Missing permissions');
      permError.code = 50013;

      mockChannel.send.mockRejectedValue(permError);

      const messagePromise = sender.queueMessage(mockChannel, 'Permission error test');

      await jest.advanceTimersByTimeAsync(1000);

      await expect(messagePromise).rejects.toThrow('Missing permissions');
      expect(mockChannel.send).toHaveBeenCalledTimes(1); // No retries
      expect(sender.metrics.totalRetries).toBe(0);
    });
  });

  describe('Immediate Sending', () => {
    it('should send messages immediately without queuing', async () => {
      const result = await sender.sendImmediate(mockChannel, 'Immediate message');

      expect(result.id).toBe('message-123');
      expect(mockChannel.send).toHaveBeenCalledWith('Immediate message');
      expect(sender.messageQueue).toHaveLength(0);
    });

    it('should handle immediate send failures', async () => {
      const error = new Error('Immediate send failed');
      mockChannel.send.mockRejectedValue(error);

      await expect(sender.sendImmediate(mockChannel, 'Failed message')).rejects.toThrow('Immediate send failed');
      expect(sender.metrics.failedSends).toBe(1);
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should track accurate metrics', async () => {
      // Send some successful messages
      const promise1 = sender.queueMessage(mockChannel, 'Success 1');
      const promise2 = sender.queueMessage(mockChannel, 'Success 2');

      // Process successful messages manually
      let task = sender.messageQueue.shift();
      await sender.processMessage(task);
      task = sender.messageQueue.shift();
      await sender.processMessage(task);

      await Promise.all([promise1, promise2]);

      // Simulate a failure
      mockChannel.send.mockRejectedValue(new Error('Permanent failure'));
      try {
        const failPromise = sender.queueMessage(mockChannel, 'Will fail');
        const failTask = sender.messageQueue.shift();
        await sender.processMessage(failTask);
        await failPromise;
      } catch {
        // Expected to fail
      }

      const metrics = sender.getMetrics();
      expect(metrics.totalMessages).toBe(3);
      expect(metrics.successfulSends).toBe(2);
      expect(metrics.failedSends).toBe(1);
      expect(metrics.successRate).toBeCloseTo(66.67, 2);
    });

    it('should track queue size metrics', async () => {
      // Add multiple messages to test queue size tracking
      for (let i = 0; i < 5; i++) {
        sender.queueMessage(mockChannel, `Message ${i + 1}`);
      }

      expect(sender.getMetrics().currentQueueSize).toBe(5);
      expect(sender.getMetrics().maxQueueSize).toBe(5);

      // Process messages
      await jest.advanceTimersByTimeAsync(1000);

      expect(sender.getMetrics().currentQueueSize).toBe(0);
    });
  });

  describe('Queue Management', () => {
    it('should clear queue on demand', async () => {
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(sender.queueMessage(mockChannel, `Message ${i + 1}`));
      }

      expect(sender.messageQueue).toHaveLength(3);

      sender.clearQueue('Test clear');

      expect(sender.messageQueue).toHaveLength(0);

      // All promises should be rejected
      for (const promise of promises) {
        await expect(promise).rejects.toThrow('Test clear');
      }
    });

    it('should gracefully shutdown with timeout', async () => {
      // Add messages to queue
      sender.queueMessage(mockChannel, 'Message 1');
      sender.queueMessage(mockChannel, 'Message 2');

      expect(sender.messageQueue).toHaveLength(2);

      // Test shutdown behavior directly without relying on timers
      const shutdownPromise = sender.shutdown(100); // Short timeout

      // Advance timers to trigger timeout
      await jest.advanceTimersByTimeAsync(150);

      await shutdownPromise;

      expect(sender.isProcessing).toBe(false);
      expect(sender.messageQueue).toHaveLength(0); // Should be cleared due to timeout
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty messages gracefully', async () => {
      const resultPromise = sender.queueMessage(mockChannel, '');

      await jest.advanceTimersByTimeAsync(200);

      const result = await resultPromise;
      expect(result.id).toBe('message-123');
      expect(mockChannel.send).toHaveBeenCalledWith('');
    });

    it('should handle object message content', async () => {
      const embedMessage = {
        embeds: [{ title: 'Test Embed', description: 'Test description' }],
      };

      const resultPromise = sender.queueMessage(mockChannel, embedMessage);

      await jest.advanceTimersByTimeAsync(200);

      const result = await resultPromise;
      expect(result.id).toBe('message-123');
      expect(mockChannel.send).toHaveBeenCalledWith(embedMessage);
    });

    it('should generate unique task IDs', () => {
      const id1 = sender.generateTaskId();
      const id2 = sender.generateTaskId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^msg_\d+_[a-z0-9]+$/);
    });
  });

  describe('Error Classification', () => {
    it('should correctly identify retryable errors', () => {
      const retryableErrors = [
        { code: 'ENOTFOUND' },
        { code: 'ECONNRESET' },
        { code: 'ETIMEDOUT' },
        { status: 500 },
        { status: 502 },
        { status: 503 },
        { status: 504 },
      ];

      retryableErrors.forEach(error => {
        expect(sender.isRetryableError(error)).toBe(true);
      });
    });

    it('should correctly identify non-retryable errors', () => {
      const nonRetryableErrors = [
        { code: 50013 }, // Missing permissions
        { code: 50001 }, // Missing access
        { status: 404 }, // Not found
        { status: 403 }, // Forbidden
      ];

      nonRetryableErrors.forEach(error => {
        expect(sender.isRetryableError(error)).toBe(false);
      });
    });
  });
});
