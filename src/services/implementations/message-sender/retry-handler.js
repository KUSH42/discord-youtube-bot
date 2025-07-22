/**
 * Retry Handler for Discord Message Sending
 * Handles retry logic with exponential backoff and error classification
 */

/**
 * Custom error for retryable scenarios
 */
export class RetryableError extends Error {
  constructor(message, originalError, retryAfter = 1000) {
    super(message);
    this.name = 'RetryableError';
    this.originalError = originalError;
    this.retryAfter = retryAfter;
    this.isRetryableError = true;
  }
}

/**
 * Retry Handler Implementation
 */
export class RetryHandler {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.baseRetryDelay = options.baseRetryDelay || 1000;
    this.maxBackoffDelay = options.maxBackoffDelay || 30000;
    this.jitterEnabled = options.jitterEnabled !== false;
    this.jitterFactor = options.jitterFactor || 0.1;

    // Error classification
    this.retryableErrorCodes = new Set([
      'ENOTFOUND',
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'EPIPE',
      'EAI_AGAIN',
      'ECONNABORTED',
    ]);

    this.retryableHttpCodes = new Set([
      500, // Internal Server Error
      502, // Bad Gateway
      503, // Service Unavailable
      504, // Gateway Timeout
      429, // Too Many Requests (handled separately)
    ]);

    // Non-retryable Discord API errors
    this.nonRetryableDiscordCodes = new Set([
      50001, // Missing Access
      50013, // Missing Permissions
      50035, // Invalid Form Body
      10003, // Unknown Channel
      10004, // Unknown Guild
      10008, // Unknown Message
      10062, // Unknown Interaction
      50001, // Missing Access
      50013, // Missing Permissions
      50025, // Invalid OAuth2 Access Token
      50034, // Invalid DM Target
    ]);

    // Metrics
    this.metrics = {
      totalRetryAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      averageRetryDelay: 0,
      maxRetryDelay: 0,
    };
  }

  /**
   * Check if an error should be retried
   * @param {Error} error - Error to evaluate
   * @param {number} currentRetryCount - Current number of retries attempted
   * @returns {boolean} True if error should be retried
   */
  shouldRetry(error, currentRetryCount = 0) {
    // Exceeded max retries
    if (currentRetryCount >= this.maxRetries) {
      return false;
    }

    // Check for explicitly non-retryable Discord errors
    if (this.nonRetryableDiscordCodes.has(error.code)) {
      return false;
    }

    // Rate limit errors are handled separately (always retryable)
    if (error.code === 429 || error.status === 429) {
      return true;
    }

    // Network errors are retryable
    if (this.retryableErrorCodes.has(error.code)) {
      return true;
    }

    // HTTP status codes
    if (this.retryableHttpCodes.has(error.status) || this.retryableHttpCodes.has(error.code)) {
      return true;
    }

    // Check error message for retryable patterns
    if (error.message && this.hasRetryableMessage(error.message)) {
      return true;
    }

    // Default to non-retryable for unknown errors
    return false;
  }

  /**
   * Calculate retry delay using exponential backoff with jitter
   * @param {number} retryCount - Current retry attempt number (1-based)
   * @param {Error} error - Error that caused the retry
   * @returns {number} Delay in milliseconds
   */
  calculateRetryDelay(retryCount, error = null) {
    // For rate limit errors, use the retry-after if available
    if (error && (error.code === 429 || error.status === 429)) {
      let retryAfter = 1000;
      if (error.retryAfter) {
        retryAfter = error.retryAfter * 1000;
      } else if (error.retry_after) {
        retryAfter = error.retry_after * 1000;
      }
      return Math.min(retryAfter + 500, this.maxBackoffDelay); // Add buffer
    }

    // Exponential backoff: baseDelay * (multiplier ^ (retryCount - 1))
    let delay = this.baseRetryDelay * Math.pow(this.backoffMultiplier, retryCount - 1);

    // Cap at max delay
    delay = Math.min(delay, this.maxBackoffDelay);

    // Add jitter to prevent thundering herd
    if (this.jitterEnabled) {
      const jitter = delay * this.jitterFactor * (Math.random() - 0.5);
      delay = delay + jitter;
    }

    // Ensure minimum delay
    delay = Math.max(delay, 100);

    // Update metrics
    this.updateDelayMetrics(delay);

    return Math.floor(delay);
  }

  /**
   * Handle retry attempt
   * @param {Object} message - Message being retried
   * @param {Error} error - Error that caused the retry
   * @returns {Object} Retry information
   */
  handleRetry(message, error) {
    this.metrics.totalRetryAttempts++;

    const retryDelay = this.calculateRetryDelay(message.retryCount + 1, error);

    // Record the attempt
    message.recordRetry(error);

    return {
      shouldRetry: this.shouldRetry(error, message.retryCount),
      retryDelay,
      retryCount: message.retryCount,
      maxRetries: this.maxRetries,
    };
  }

  /**
   * Mark a retry as successful
   */
  markRetrySuccess() {
    this.metrics.successfulRetries++;
  }

  /**
   * Mark a retry as failed (exhausted all attempts)
   */
  markRetryFailure() {
    this.metrics.failedRetries++;
  }

  /**
   * Check if error message contains retryable patterns
   * @param {string} message - Error message
   * @returns {boolean} True if message indicates retryable error
   */
  hasRetryableMessage(message) {
    const retryablePatterns = [
      /timeout/i,
      /connection.*reset/i,
      /connection.*refused/i,
      /network.*error/i,
      /temporary.*failure/i,
      /service.*unavailable/i,
      /internal.*server.*error/i,
      /bad.*gateway/i,
      /gateway.*timeout/i,
    ];

    return retryablePatterns.some(pattern => pattern.test(message));
  }

  /**
   * Update delay metrics
   * @param {number} delay - Delay in milliseconds
   */
  updateDelayMetrics(delay) {
    this.metrics.maxRetryDelay = Math.max(this.metrics.maxRetryDelay, delay);

    // Calculate running average
    const totalAttempts = this.metrics.totalRetryAttempts;
    if (totalAttempts > 0) {
      const currentAverage = this.metrics.averageRetryDelay;
      this.metrics.averageRetryDelay = (currentAverage * (totalAttempts - 1) + delay) / totalAttempts;
    }
  }

  /**
   * Get retry handler metrics
   * @returns {Object} Metrics and statistics
   */
  getMetrics() {
    const totalAttempts = this.metrics.totalRetryAttempts;
    const successRate = totalAttempts > 0 ? (this.metrics.successfulRetries / totalAttempts) * 100 : 0;

    return {
      ...this.metrics,
      successRate: Math.round(successRate * 100) / 100,
      configuration: {
        maxRetries: this.maxRetries,
        baseRetryDelay: this.baseRetryDelay,
        backoffMultiplier: this.backoffMultiplier,
        maxBackoffDelay: this.maxBackoffDelay,
        jitterEnabled: this.jitterEnabled,
      },
    };
  }

  /**
   * Reset all metrics
   */
  resetMetrics() {
    this.metrics = {
      totalRetryAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      averageRetryDelay: 0,
      maxRetryDelay: 0,
    };
  }

  /**
   * Create a RetryableError for testing
   * @param {string} message - Error message
   * @param {number} retryAfter - Retry delay
   * @returns {RetryableError} Retryable error instance
   */
  static createRetryableError(message, retryAfter = 1000) {
    return new RetryableError(message, new Error(message), retryAfter);
  }
}
