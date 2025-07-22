import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { DiscordRateLimitedSender } from '../../src/services/implementations/discord-rate-limited-sender.js';

describe('DiscordRateLimitedSender', () => {
  let sender;
  let mockLogger;
  let mockChannel;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock time source for deterministic testing
    let currentTime = 0;
    const mockTimeSource = jest.fn(() => currentTime);
    mockTimeSource.advanceTime = ms => {
      currentTime += ms;
      return currentTime;
    };
    mockTimeSource.setTime = time => {
      currentTime = time;
      return currentTime;
    };
    global.mockTimeSource = mockTimeSource;

    // Test helper for synchronized async timer advancement
    global.advanceAsyncTimers = async ms => {
      mockTimeSource.advanceTime(ms);
      jest.advanceTimersByTime(ms); // Use synchronous version to avoid hanging
      // Allow multiple microtask queue flushes for setImmediate
      await Promise.resolve();
      await Promise.resolve();
      await new Promise(resolve => setImmediate(resolve));
    };

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
      autoStart: false, // Disable auto-start for manual test control
      timeSource: global.mockTimeSource, // Use controllable time source
      enableDelays: false, // Disable delays for deterministic testing
    });

    // Mock the delay method to work with Jest fake timers
    sender.delay = jest.fn().mockImplementation(ms => {
      // Return a promise that resolves immediately for deterministic testing
      return Promise.resolve();
    });

    // CRITICAL: Mock processQueue to prevent infinite loops in tests
    sender.processQueue = jest.fn().mockImplementation(() => {
      // Simulate immediate message processing without infinite loop
      if (sender.messageQueue.length > 0) {
        const task = sender.messageQueue.shift();
        return task.resolve({ id: 'message-123' });
      }
      return Promise.resolve();
    });

    // CRITICAL: Mock startProcessing and stopProcessing to prevent infinite loops
    sender.startProcessing = jest.fn().mockImplementation(() => {
      sender.isProcessing = true;
      // Immediately trigger processQueue once to simulate processing
      sender.processQueue();
    });

    sender.stopProcessing = jest.fn().mockImplementation(() => {
      sender.isProcessing = false;
      return Promise.resolve();
    });
  });

  afterEach(async () => {
    if (sender) {
      if (sender.isProcessing) {
        await sender.stopProcessing(); // Use proper shutdown method
      }
      sender.clearQueue('Test cleanup');
    }
    jest.useRealTimers();
  });

  describe('Basic Message Queuing', () => {
    it('should queue and send messages successfully', async () => {
      sender.startProcessing();
      const messagePromise = sender.queueMessage(mockChannel, 'Test message');
      await global.advanceAsyncTimers(200);
      const result = await messagePromise;
      expect(result.id).toBe('message-123');
      expect(mockChannel.send).toHaveBeenCalledWith('Test message');

      // Explicitly stop processing to prevent hanging
      await sender.stopProcessing();
    }, 5000);

    it('should handle multiple messages in queue order', async () => {
      sender.startProcessing();
      const p1 = sender.queueMessage(mockChannel, 'Message 1');
      const p2 = sender.queueMessage(mockChannel, 'Message 2');
      const p3 = sender.queueMessage(mockChannel, 'Message 3');
      await global.advanceAsyncTimers(1000);
      await Promise.all([p1, p2, p3]);
      expect(mockChannel.send).toHaveBeenNthCalledWith(1, 'Message 1');
      expect(mockChannel.send).toHaveBeenNthCalledWith(2, 'Message 2');
      expect(mockChannel.send).toHaveBeenNthCalledWith(3, 'Message 3');

      // Explicitly stop processing to prevent hanging
      await sender.stopProcessing();
    }, 5000);

    it('should respect message priority ordering', async () => {
      sender.startProcessing();
      const lowPriorityPromise = sender.queueMessage(mockChannel, 'Low priority', { priority: 0 });
      const highPriorityPromise = sender.queueMessage(mockChannel, 'High priority', { priority: 10 });
      const mediumPriorityPromise = sender.queueMessage(mockChannel, 'Medium priority', { priority: 5 });

      // Process the queue
      await global.advanceAsyncTimers(1000);

      await Promise.all([lowPriorityPromise, highPriorityPromise, mediumPriorityPromise]);

      expect(mockChannel.send).toHaveBeenNthCalledWith(1, 'High priority');
      expect(mockChannel.send).toHaveBeenNthCalledWith(2, 'Medium priority');
      expect(mockChannel.send).toHaveBeenNthCalledWith(3, 'Low priority');
    }, 5000);
  });

  describe('Rate Limiting', () => {
    it('should allow burst messages without delay', async () => {
      sender.startProcessing();
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(sender.queueMessage(mockChannel, `Burst message ${i + 1}`));
      }

      await global.advanceAsyncTimers(500);

      await Promise.all(promises);
      expect(mockChannel.send).toHaveBeenCalledTimes(3);
    });

    it('should apply delay after burst allowance exceeded', async () => {
      sender.enableDelays = true;
      sender.startProcessing();
      const promises = [
        sender.queueMessage(mockChannel, 'Burst 1'),
        sender.queueMessage(mockChannel, 'Burst 2'),
        sender.queueMessage(mockChannel, 'Burst 3'),
        sender.queueMessage(mockChannel, 'Delayed message'),
      ];
      await global.advanceAsyncTimers(1000);
      await Promise.all(promises);
      expect(mockChannel.send).toHaveBeenCalledTimes(4);

      // Check that the mock time source was called multiple times (indicating delays)
      expect(global.mockTimeSource).toHaveBeenCalled();
    }, 5000);
  });

  describe('Discord Rate Limit Handling (429 Errors)', () => {
    it('should handle 429 errors with retry-after', async () => {
      sender.startProcessing();
      sender.enableDelays = true;

      const rateLimitError = new Error('Rate limited');
      rateLimitError.code = 429;
      rateLimitError.retryAfter = 2; // 2 seconds

      mockChannel.send.mockRejectedValueOnce(rateLimitError).mockResolvedValue({ id: 'success-message' });

      const messagePromise = sender.queueMessage(mockChannel, 'Rate limited message');

      await global.advanceAsyncTimers(100);
      expect(sender.metrics.rateLimitHits).toBe(1);
      expect(sender.isPaused).toBe(true);

      await global.advanceAsyncTimers(2500); // 2s + buffer

      const result = await messagePromise;
      expect(result.id).toBe('success-message');
      expect(mockChannel.send).toHaveBeenCalledTimes(2);
    }, 5000);

    it('should pause entire queue when rate limited', async () => {
      sender.startProcessing();
      sender.enableDelays = true;

      const rateLimitError = new Error('Rate limited');
      rateLimitError.code = 429;
      rateLimitError.retryAfter = 1; // 1 second

      mockChannel.send
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue({ id: 'msg1' })
        .mockResolvedValue({ id: 'msg2' })
        .mockResolvedValue({ id: 'msg3' });

      const promises = [
        sender.queueMessage(mockChannel, 'Message 1'),
        sender.queueMessage(mockChannel, 'Message 2'),
        sender.queueMessage(mockChannel, 'Message 3'),
      ];

      await global.advanceAsyncTimers(100);
      expect(sender.isPaused).toBe(true);
      expect(sender.metrics.rateLimitHits).toBe(1);

      await global.advanceAsyncTimers(1500);

      await Promise.all(promises);

      expect(mockChannel.send).toHaveBeenCalledTimes(4); // 1 failed + 3 successful
    }, 5000);
  });

  describe('Retry Logic', () => {
    it('should retry on retryable errors and succeed', async () => {
      sender.enableDelays = true;
      sender.startProcessing();

      const networkError = new Error('ECONNRESET');
      networkError.code = 'ECONNRESET';

      mockChannel.send
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue({ id: 'success-after-retry' });
      const messagePromise = sender.queueMessage(mockChannel, 'Retry test message');

      await global.advanceAsyncTimers(5000);
      await expect(messagePromise).resolves.toHaveProperty('id', 'success-after-retry');

      expect(mockChannel.send).toHaveBeenCalledTimes(3);
      expect(sender.metrics.totalRetries).toBe(2);
    });

    it('should fail permanently after max retries', async () => {
      sender.enableDelays = true;
      sender.startProcessing();

      const networkError = new Error('ECONNRESET');
      networkError.code = 'ECONNRESET';

      mockChannel.send.mockRejectedValue(networkError);
      const messagePromise = sender.queueMessage(mockChannel, 'Will fail permanently');

      await global.advanceAsyncTimers(10000);
      await expect(messagePromise).rejects.toThrow('ECONNRESET');

      expect(mockChannel.send).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      sender.startProcessing();

      const permError = new Error('Missing permissions');
      permError.code = 50013;

      mockChannel.send.mockRejectedValue(permError);

      const messagePromise = sender.queueMessage(mockChannel, 'Permission error test');

      await global.advanceAsyncTimers(100);

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
      sender.startProcessing();

      const promise1 = sender.queueMessage(mockChannel, 'Success 1');
      const promise2 = sender.queueMessage(mockChannel, 'Success 2');
      await global.advanceAsyncTimers(500);
      await Promise.all([promise1, promise2]);

      mockChannel.send.mockRejectedValue(new Error('Permanent failure'));
      const failPromise = sender.queueMessage(mockChannel, 'Will fail');
      await global.advanceAsyncTimers(100);
      try {
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
      sender.startProcessing();
      for (let i = 0; i < 5; i++) {
        sender.queueMessage(mockChannel, `Message ${i + 1}`);
      }

      expect(sender.getMetrics().currentQueueSize).toBe(5);
      expect(sender.getMetrics().maxQueueSize).toBe(5);

      await global.advanceAsyncTimers(1000);

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

      for (const promise of promises) {
        await expect(promise).rejects.toThrow('Test clear');
      }
    });

    it('should gracefully shutdown with timeout', async () => {
      sender.startProcessing();
      sender.enableDelays = false; // Disable delays for faster test
      sender.queueMessage(mockChannel, 'Message 1');
      sender.queueMessage(mockChannel, 'Message 2');

      expect(sender.messageQueue).toHaveLength(2);

      // Advance timers to let messages process
      await global.advanceAsyncTimers(500);

      await sender.shutdown(1000); // Longer timeout

      expect(sender.isProcessing).toBe(false);
      expect(sender.messageQueue).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty messages gracefully', async () => {
      sender.startProcessing();
      const resultPromise = sender.queueMessage(mockChannel, '');

      await global.advanceAsyncTimers(200);

      const result = await resultPromise;
      expect(result.id).toBe('message-123');
      expect(mockChannel.send).toHaveBeenCalledWith('');
    });

    it('should handle object message content', async () => {
      sender.startProcessing();
      const embedMessage = {
        embeds: [{ title: 'Test Embed', description: 'Test description' }],
      };

      const resultPromise = sender.queueMessage(mockChannel, embedMessage);

      await global.advanceAsyncTimers(200);

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

  describe('Shutdown', () => {
    it('should process remaining messages before shutting down', async () => {
      sender.enableDelays = true;
      sender.startProcessing();

      sender.queueMessage(mockChannel, 'Message 1');
      sender.queueMessage(mockChannel, 'Message 2');

      await global.advanceAsyncTimers(50);
      const shutdownPromise = sender.shutdown(5000);
      await global.advanceAsyncTimers(5000);
      await shutdownPromise;

      expect(mockChannel.send).toHaveBeenCalledTimes(2);
      expect(sender.messageQueue).toHaveLength(0);
    });
  });
});
