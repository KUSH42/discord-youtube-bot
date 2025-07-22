import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { RetryHandler, RetryableError } from '../../../src/services/implementations/message-sender/retry-handler.js';

describe('RetryableError', () => {
  it('should create error with default values', () => {
    const originalError = new Error('Original error');
    const error = new RetryableError('Retry message', originalError);

    expect(error.message).toBe('Retry message');
    expect(error.name).toBe('RetryableError');
    expect(error.originalError).toBe(originalError);
    expect(error.retryAfter).toBe(1000);
    expect(error.isRetryableError).toBe(true);
  });

  it('should create error with custom values', () => {
    const originalError = new Error('Network error');
    const error = new RetryableError('Connection failed', originalError, 5000);

    expect(error.message).toBe('Connection failed');
    expect(error.originalError).toBe(originalError);
    expect(error.retryAfter).toBe(5000);
    expect(error.isRetryableError).toBe(true);
  });
});

describe('RetryHandler', () => {
  let retryHandler;
  let mockMessage;

  beforeEach(() => {
    retryHandler = new RetryHandler({
      maxRetries: 3,
      baseRetryDelay: 1000,
      backoffMultiplier: 2,
      maxBackoffDelay: 30000,
      jitterEnabled: false, // Disable for predictable tests
    });

    mockMessage = {
      retryCount: 0,
      retryHistory: [],
      recordRetry: jest.fn(() => {
        mockMessage.retryCount++;
        mockMessage.retryHistory.push(new Date());
      }),
    };
  });

  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const handler = new RetryHandler();

      expect(handler.maxRetries).toBe(3);
      expect(handler.baseRetryDelay).toBe(1000);
      expect(handler.backoffMultiplier).toBe(2);
      expect(handler.maxBackoffDelay).toBe(30000);
      expect(handler.jitterEnabled).toBe(true);
      expect(handler.jitterFactor).toBe(0.1);
    });

    it('should initialize with custom options', () => {
      const handler = new RetryHandler({
        maxRetries: 5,
        baseRetryDelay: 2000,
        backoffMultiplier: 3,
        maxBackoffDelay: 60000,
        jitterEnabled: false,
        jitterFactor: 0.2,
      });

      expect(handler.maxRetries).toBe(5);
      expect(handler.baseRetryDelay).toBe(2000);
      expect(handler.backoffMultiplier).toBe(3);
      expect(handler.maxBackoffDelay).toBe(60000);
      expect(handler.jitterEnabled).toBe(false);
      expect(handler.jitterFactor).toBe(0.2);
    });

    it('should initialize error code sets', () => {
      expect(retryHandler.retryableErrorCodes.has('ECONNRESET')).toBe(true);
      expect(retryHandler.retryableErrorCodes.has('ETIMEDOUT')).toBe(true);
      expect(retryHandler.retryableHttpCodes.has(500)).toBe(true);
      expect(retryHandler.retryableHttpCodes.has(429)).toBe(true);
      expect(retryHandler.nonRetryableDiscordCodes.has(50013)).toBe(true);
    });

    it('should initialize metrics', () => {
      expect(retryHandler.metrics).toEqual({
        totalRetryAttempts: 0,
        successfulRetries: 0,
        failedRetries: 0,
        averageRetryDelay: 0,
        maxRetryDelay: 0,
      });
    });
  });

  describe('shouldRetry', () => {
    it('should not retry when max retries exceeded', () => {
      const error = { code: 'ECONNRESET' };
      expect(retryHandler.shouldRetry(error, 3)).toBe(false);
      expect(retryHandler.shouldRetry(error, 5)).toBe(false);
    });

    it('should not retry non-retryable Discord errors', () => {
      const permissionError = { code: 50013 }; // Missing Permissions
      const unknownChannelError = { code: 10003 }; // Unknown Channel

      expect(retryHandler.shouldRetry(permissionError, 0)).toBe(false);
      expect(retryHandler.shouldRetry(unknownChannelError, 1)).toBe(false);
    });

    it('should retry rate limit errors (429)', () => {
      const rateLimitError1 = { code: 429 };
      const rateLimitError2 = { status: 429 };

      expect(retryHandler.shouldRetry(rateLimitError1, 1)).toBe(true);
      expect(retryHandler.shouldRetry(rateLimitError2, 2)).toBe(true);
    });

    it('should retry network errors', () => {
      const networkErrors = [
        { code: 'ECONNRESET' },
        { code: 'ETIMEDOUT' },
        { code: 'ENOTFOUND' },
        { code: 'ECONNREFUSED' },
        { code: 'EPIPE' },
      ];

      networkErrors.forEach(error => {
        expect(retryHandler.shouldRetry(error, 1)).toBe(true);
      });
    });

    it('should retry retryable HTTP status codes', () => {
      const httpErrors = [
        { status: 500 }, // Internal Server Error
        { status: 502 }, // Bad Gateway
        { status: 503 }, // Service Unavailable
        { status: 504 }, // Gateway Timeout
        { code: 500 }, // Also check code property
      ];

      httpErrors.forEach(error => {
        expect(retryHandler.shouldRetry(error, 1)).toBe(true);
      });
    });

    it('should retry errors with retryable message patterns', () => {
      const retryableMessages = [
        { message: 'Connection timeout occurred' },
        { message: 'Connection reset by peer' },
        { message: 'Connection refused' },
        { message: 'Network error detected' },
        { message: 'Temporary failure' },
        { message: 'Service unavailable' },
        { message: 'Internal server error' },
        { message: 'Bad gateway response' },
        { message: 'Gateway timeout' },
      ];

      retryableMessages.forEach(error => {
        expect(retryHandler.shouldRetry(error, 1)).toBe(true);
      });
    });

    it('should not retry unknown/unclassified errors', () => {
      const unknownErrors = [
        { code: 'UNKNOWN_ERROR' },
        { status: 400 }, // Bad Request
        { status: 404 }, // Not Found
        { message: 'Invalid input data' },
        { message: 'Validation failed' },
      ];

      unknownErrors.forEach(error => {
        expect(retryHandler.shouldRetry(error, 1)).toBe(false);
      });
    });
  });

  describe('calculateRetryDelay', () => {
    it('should calculate exponential backoff delays', () => {
      const delay1 = retryHandler.calculateRetryDelay(1);
      const delay2 = retryHandler.calculateRetryDelay(2);
      const delay3 = retryHandler.calculateRetryDelay(3);

      // Base: 1000, Multiplier: 2
      // Retry 1: 1000 * 2^0 = 1000ms
      // Retry 2: 1000 * 2^1 = 2000ms
      // Retry 3: 1000 * 2^2 = 4000ms
      expect(delay1).toBe(1000);
      expect(delay2).toBe(2000);
      expect(delay3).toBe(4000);
    });

    it('should cap delays at maxBackoffDelay', () => {
      // Test with large retry count to exceed max delay
      const delay = retryHandler.calculateRetryDelay(10);
      expect(delay).toBe(30000); // Should be capped at maxBackoffDelay
    });

    it('should handle rate limit errors with retry-after', () => {
      const rateLimitError = { code: 429, retryAfter: 5 }; // 5 seconds
      const delay = retryHandler.calculateRetryDelay(1, rateLimitError);

      expect(delay).toBe(5500); // 5000ms + 500ms buffer
    });

    it('should handle rate limit errors with retry_after', () => {
      const rateLimitError = { status: 429, retry_after: 3 }; // 3 seconds
      const delay = retryHandler.calculateRetryDelay(1, rateLimitError);

      expect(delay).toBe(3500); // 3000ms + 500ms buffer
    });

    it('should cap rate limit delays at maxBackoffDelay', () => {
      const rateLimitError = { code: 429, retryAfter: 100 }; // 100 seconds
      const delay = retryHandler.calculateRetryDelay(1, rateLimitError);

      expect(delay).toBe(30000); // Capped at maxBackoffDelay
    });

    it('should ensure minimum delay', () => {
      // Test with very small base delay
      const handler = new RetryHandler({
        baseRetryDelay: 10,
        jitterEnabled: false,
      });

      const delay = handler.calculateRetryDelay(1);
      expect(delay).toBeGreaterThanOrEqual(100); // Minimum 100ms
    });

    it('should update metrics when calculating delays', () => {
      // Mock totalRetryAttempts to test the average calculation
      retryHandler.metrics.totalRetryAttempts = 1;
      retryHandler.calculateRetryDelay(1);

      retryHandler.metrics.totalRetryAttempts = 2;
      retryHandler.calculateRetryDelay(2);

      expect(retryHandler.metrics.maxRetryDelay).toBe(2000);
      expect(retryHandler.metrics.averageRetryDelay).toBe(1500); // (1000 + 2000) / 2
    });
  });

  describe('handleRetry', () => {
    it('should handle retry and return retry information', () => {
      const error = { code: 'ECONNRESET' };

      const result = retryHandler.handleRetry(mockMessage, error);

      expect(result).toEqual({
        shouldRetry: true,
        retryDelay: 1000,
        retryCount: 1,
        maxRetries: 3,
      });

      expect(mockMessage.recordRetry).toHaveBeenCalledWith(error);
      expect(retryHandler.metrics.totalRetryAttempts).toBe(1);
    });

    it('should handle retry with non-retryable error', () => {
      const error = { code: 50013 }; // Missing Permissions

      const result = retryHandler.handleRetry(mockMessage, error);

      expect(result.shouldRetry).toBe(false);
      expect(result.retryDelay).toBe(1000);
      expect(result.retryCount).toBe(1);
      expect(result.maxRetries).toBe(3);
    });

    it('should handle retry at max retries', () => {
      mockMessage.retryCount = 2; // Already at 2 retries
      const error = { code: 'ECONNRESET' };

      const result = retryHandler.handleRetry(mockMessage, error);

      expect(result.shouldRetry).toBe(false); // Would be 3rd retry, which is max
      expect(result.retryCount).toBe(3);
    });
  });

  describe('markRetrySuccess and markRetryFailure', () => {
    it('should track successful retries', () => {
      retryHandler.markRetrySuccess();
      retryHandler.markRetrySuccess();

      expect(retryHandler.metrics.successfulRetries).toBe(2);
    });

    it('should track failed retries', () => {
      retryHandler.markRetryFailure();
      retryHandler.markRetryFailure();
      retryHandler.markRetryFailure();

      expect(retryHandler.metrics.failedRetries).toBe(3);
    });
  });

  describe('hasRetryableMessage', () => {
    it('should identify retryable message patterns', () => {
      const retryableMessages = [
        'Operation timeout',
        'Connection reset by server',
        'Connection refused by host',
        'Network error occurred',
        'Temporary failure detected',
        'Service unavailable right now',
        'Internal server error',
        'Bad gateway received',
        'Gateway timeout exceeded',
      ];

      retryableMessages.forEach(message => {
        expect(retryHandler.hasRetryableMessage(message)).toBe(true);
      });
    });

    it('should not identify non-retryable message patterns', () => {
      const nonRetryableMessages = [
        'Invalid input provided',
        'Authentication failed',
        'Permission denied',
        'Resource not found',
        'Validation error',
        'Malformed request',
      ];

      nonRetryableMessages.forEach(message => {
        expect(retryHandler.hasRetryableMessage(message)).toBe(false);
      });
    });
  });

  describe('updateDelayMetrics', () => {
    it('should update delay metrics correctly', () => {
      // Set up totalRetryAttempts to enable average calculation
      retryHandler.metrics.totalRetryAttempts = 1;
      retryHandler.updateDelayMetrics(1000);

      retryHandler.metrics.totalRetryAttempts = 2;
      retryHandler.updateDelayMetrics(2000);

      retryHandler.metrics.totalRetryAttempts = 3;
      retryHandler.updateDelayMetrics(1500);

      expect(retryHandler.metrics.maxRetryDelay).toBe(2000);
      expect(retryHandler.metrics.averageRetryDelay).toBe(1500); // (1000 + 2000 + 1500) / 3
    });

    it('should handle first delay correctly', () => {
      retryHandler.metrics.totalRetryAttempts = 1;
      retryHandler.updateDelayMetrics(500);

      expect(retryHandler.metrics.maxRetryDelay).toBe(500);
      expect(retryHandler.metrics.averageRetryDelay).toBe(500);
    });

    it('should not update average when totalRetryAttempts is 0', () => {
      retryHandler.updateDelayMetrics(1000);

      expect(retryHandler.metrics.maxRetryDelay).toBe(1000);
      expect(retryHandler.metrics.averageRetryDelay).toBe(0); // Should remain 0
    });
  });

  describe('getMetrics', () => {
    it('should return comprehensive metrics', () => {
      retryHandler.markRetrySuccess();
      retryHandler.markRetrySuccess();
      retryHandler.markRetryFailure();

      // Set up metrics with delay calculations
      retryHandler.metrics.totalRetryAttempts = 1;
      retryHandler.updateDelayMetrics(1000);
      retryHandler.metrics.totalRetryAttempts = 2;
      retryHandler.updateDelayMetrics(2000);

      const metrics = retryHandler.getMetrics();

      expect(metrics).toEqual({
        totalRetryAttempts: 2,
        successfulRetries: 2,
        failedRetries: 1,
        averageRetryDelay: 1500,
        maxRetryDelay: 2000,
        successRate: 100, // 2 successful / 2 total = 100%
        configuration: {
          maxRetries: 3,
          baseRetryDelay: 1000,
          backoffMultiplier: 2,
          maxBackoffDelay: 30000,
          jitterEnabled: false,
        },
      });
    });

    it('should calculate success rate correctly', () => {
      // Simulate some retry attempts
      retryHandler.metrics.totalRetryAttempts = 10;
      retryHandler.metrics.successfulRetries = 7;

      const metrics = retryHandler.getMetrics();
      expect(metrics.successRate).toBe(70); // 7/10 * 100 = 70%
    });

    it('should handle zero attempts for success rate', () => {
      const metrics = retryHandler.getMetrics();
      expect(metrics.successRate).toBe(0);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics to initial state', () => {
      // Set up some metrics
      retryHandler.markRetrySuccess();
      retryHandler.markRetryFailure();
      retryHandler.updateDelayMetrics(1000);
      retryHandler.metrics.totalRetryAttempts = 5;

      retryHandler.resetMetrics();

      expect(retryHandler.metrics).toEqual({
        totalRetryAttempts: 0,
        successfulRetries: 0,
        failedRetries: 0,
        averageRetryDelay: 0,
        maxRetryDelay: 0,
      });
    });
  });

  describe('static createRetryableError', () => {
    it('should create RetryableError with default retry time', () => {
      const error = RetryHandler.createRetryableError('Test error');

      expect(error).toBeInstanceOf(RetryableError);
      expect(error.message).toBe('Test error');
      expect(error.retryAfter).toBe(1000);
      expect(error.originalError).toBeInstanceOf(Error);
      expect(error.originalError.message).toBe('Test error');
    });

    it('should create RetryableError with custom retry time', () => {
      const error = RetryHandler.createRetryableError('Custom error', 5000);

      expect(error.message).toBe('Custom error');
      expect(error.retryAfter).toBe(5000);
    });
  });

  describe('Jitter Functionality', () => {
    it('should add jitter when enabled', () => {
      const handlerWithJitter = new RetryHandler({
        baseRetryDelay: 1000,
        jitterEnabled: true,
        jitterFactor: 0.1,
      });

      // Mock Math.random to return a predictable value
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.5);

      const delay = handlerWithJitter.calculateRetryDelay(1);

      // With jitter factor 0.1 and random 0.5:
      // jitter = 1000 * 0.1 * (0.5 - 0.5) = 0
      // delay = 1000 + 0 = 1000
      expect(delay).toBe(1000);

      // Test with different random value
      Math.random = jest.fn(() => 0.8);
      const delayWithJitter = handlerWithJitter.calculateRetryDelay(1);

      // jitter = 1000 * 0.1 * (0.8 - 0.5) = 30
      // delay = 1000 + 30 = 1030
      expect(delayWithJitter).toBe(1030);

      // Restore original Math.random
      Math.random = originalRandom;
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle multiple retry attempts with different errors', () => {
      const errors = [
        { code: 'ECONNRESET' },
        { status: 500 },
        { code: 429, retryAfter: 2 },
        { code: 50013 }, // Should not retry
      ];

      // Reset mockMessage for each error to test independently
      const messages = errors.map(() => ({
        retryCount: 0,
        retryHistory: [],
        recordRetry: jest.fn(function () {
          this.retryCount++;
          this.retryHistory.push(new Date());
        }),
      }));

      const results = errors.map((error, index) => retryHandler.handleRetry(messages[index], error));

      expect(results[0].shouldRetry).toBe(true); // Network error
      expect(results[1].shouldRetry).toBe(true); // HTTP 500
      expect(results[2].shouldRetry).toBe(true); // Rate limit
      expect(results[3].shouldRetry).toBe(false); // Permission error

      expect(retryHandler.metrics.totalRetryAttempts).toBe(4);
    });

    it('should handle progressive backoff across multiple retries', () => {
      const error = { code: 'ECONNRESET' };

      // First retry
      mockMessage.retryCount = 0;
      const result1 = retryHandler.handleRetry(mockMessage, error);
      expect(result1.retryDelay).toBe(1000);

      // Second retry
      const result2 = retryHandler.handleRetry(mockMessage, error);
      expect(result2.retryDelay).toBe(2000);

      // Third retry
      const result3 = retryHandler.handleRetry(mockMessage, error);
      expect(result3.retryDelay).toBe(4000);

      // Fourth retry (should not retry)
      const result4 = retryHandler.handleRetry(mockMessage, error);
      expect(result4.shouldRetry).toBe(false);
    });
  });
});
