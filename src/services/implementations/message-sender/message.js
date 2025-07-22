/**
 * Message class for Discord Rate-Limited Sender
 * Represents a single message to be sent through Discord
 */
export class Message {
  constructor(options = {}) {
    this.id = options.id || this.generateId();
    this.channel = options.channel;
    this.content = options.content;
    this.options = options.options || {};
    this.resolve = options.resolve || (() => {});
    this.reject = options.reject || (() => {});
    this.retryCount = options.retryCount || 0;
    this.createdAt = options.createdAt || Date.now();
    this.priority = options.priority || 0;
    this.maxRetries = options.maxRetries || 3;

    // Metadata
    this.attempts = [];
    this.status = 'pending'; // pending, processing, completed, failed
  }

  /**
   * Generate a unique message ID
   * @returns {string} Unique identifier
   */
  generateId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `msg_${timestamp}_${random}`;
  }

  /**
   * Check if this message can be retried
   * @returns {boolean} True if message can be retried
   */
  canRetry() {
    return this.retryCount < this.maxRetries;
  }

  /**
   * Increment retry count and record attempt
   * @param {Error} error - Error that caused the retry
   */
  recordRetry(error) {
    this.retryCount++;
    this.attempts.push({
      timestamp: Date.now(),
      error: error.message,
      retryCount: this.retryCount,
    });
  }

  /**
   * Mark message as processing
   */
  markProcessing() {
    this.status = 'processing';
    this.processingStarted = Date.now();
  }

  /**
   * Mark message as completed successfully
   * @param {Object} result - Result from Discord API
   */
  markCompleted(result) {
    this.status = 'completed';
    this.completedAt = Date.now();
    this.result = result;

    if (this.resolve) {
      this.resolve(result);
    }
  }

  /**
   * Mark message as permanently failed
   * @param {Error} error - Final error that caused failure
   */
  markFailed(error) {
    this.status = 'failed';
    this.failedAt = Date.now();
    this.finalError = error;

    this.attempts.push({
      timestamp: Date.now(),
      error: error.message,
      final: true,
    });

    if (this.reject) {
      this.reject(error);
    }
  }

  /**
   * Get age of message in milliseconds
   * @returns {number} Age in milliseconds
   */
  getAge() {
    return Date.now() - this.createdAt;
  }

  /**
   * Get processing time if completed
   * @returns {number|null} Processing time in milliseconds, or null if not completed
   */
  getProcessingTime() {
    if (this.status !== 'completed' || !this.processingStarted || !this.completedAt) {
      return null;
    }
    return this.completedAt - this.processingStarted;
  }

  /**
   * Convert message to JSON for logging/debugging
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      id: this.id,
      status: this.status,
      priority: this.priority,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      createdAt: this.createdAt,
      age: this.getAge(),
      processingTime: this.getProcessingTime(),
      channelId: this.channel?.id,
      contentType: typeof this.content,
      contentLength: typeof this.content === 'string' ? this.content.length : 0,
      attempts: this.attempts.length,
      hasOptions: Object.keys(this.options).length > 0,
    };
  }

  /**
   * Clone this message (useful for retries)
   * @param {Object} overrides - Properties to override in the clone
   * @returns {Message} New message instance
   */
  clone(overrides = {}) {
    return new Message({
      id: this.id,
      channel: this.channel,
      content: this.content,
      options: JSON.parse(JSON.stringify(this.options)), // Deep clone options
      resolve: this.resolve,
      reject: this.reject,
      retryCount: this.retryCount,
      createdAt: this.createdAt,
      priority: this.priority,
      maxRetries: this.maxRetries,
      ...overrides,
    });
  }
}
