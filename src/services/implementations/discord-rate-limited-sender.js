import { delay } from '../../utils/delay.js';

/**
 * Discord Rate-Limited Message Sender
 * Implements a sophisticated queue and retry system for Discord API rate limiting
 */
export class DiscordRateLimitedSender {
  constructor(logger, options = {}) {
    this.logger = logger;

    // Queue configuration
    this.messageQueue = [];
    this.isProcessing = false;
    this.isPaused = false;
    this.pauseUntil = null;
    this.processingPromise = null;
    this._processingResolve = null;

    // Rate limiting configuration
    this.baseSendDelay = options.baseSendDelay || 1000; // 1 second between sends
    this.burstAllowance = options.burstAllowance || 5; // Allow 5 quick sends
    this.burstResetTime = options.burstResetTime || 60000; // Reset burst counter every minute
    this.maxRetries = options.maxRetries || 3;
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.maxBackoffDelay = options.maxBackoffDelay || 30000; // 30 seconds max backoff
    this.autoStart = options.autoStart !== false; // Default true, allow disabling for tests

    // Time source abstraction for testing
    this.timeSource = options.timeSource || (() => Date.now());

    // Delay behavior control for testing
    this.enableDelays = options.enableDelays !== false; // Default true, can disable for tests

    // Delay function (make the imported delay available as instance method)
    this.delay = delay;

    // Burst tracking
    this.burstCounter = 0;
    this.lastBurstReset = this.timeSource();

    // Metrics
    this.metrics = {
      totalMessages: 0,
      successfulSends: 0,
      failedSends: 0,
      rateLimitHits: 0,
      totalRetries: 0,
      averageQueueSize: 0,
      maxQueueSize: 0,
      lastRateLimitHit: null,
    };

    // Start processing queue (unless disabled for testing)
    if (this.autoStart) {
      this.startProcessing();
    }
  }

  /**
   * Add a message to the sending queue
   * @param {Object} channel - Discord channel object
   * @param {string|Object} content - Message content or options object
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Promise that resolves when message is sent
   */
  async queueMessage(channel, content, options = {}) {
    return new Promise((resolve, reject) => {
      const messageTask = {
        id: this.generateTaskId(),
        channel,
        content,
        options,
        resolve,
        reject,
        retryCount: 0,
        createdAt: this.timeSource(),
        priority: options.priority || 0, // Higher priority = sent first
      };

      // Insert message based on priority
      const insertIndex = this.messageQueue.findIndex(task => task.priority < messageTask.priority);
      if (insertIndex === -1) {
        this.messageQueue.push(messageTask);
      } else {
        this.messageQueue.splice(insertIndex, 0, messageTask);
      }

      this.metrics.totalMessages++;
      this.updateQueueMetrics();

      this.logger.debug('Message queued for rate-limited sending', {
        taskId: messageTask.id,
        queueSize: this.messageQueue.length,
        priority: messageTask.priority,
        isPaused: this.isPaused,
      });
    });
  }

  /**
   * Send a message immediately without queuing (use with caution)
   * @param {Object} channel - Discord channel object
   * @param {string|Object} content - Message content or options object
   * @returns {Promise<Object>} Discord message response
   */
  async sendImmediate(channel, content) {
    try {
      const response = await this.attemptSend(channel, content);
      this.metrics.successfulSends++;
      return response;
    } catch (error) {
      this.metrics.failedSends++;
      throw error;
    }
  }

  /**
   * Start processing the message queue
   */
  startProcessing() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.processingPromise = new Promise(resolve => {
      this._processingResolve = resolve;
    });
    this.processQueue();
  }

  /**
   * Stop processing the message queue
   */
  async stopProcessing() {
    this.isProcessing = false;
    if (this.processingPromise) {
      // Allow the loop to complete one final time and exit
      // Add timeout to prevent hanging in tests
      const timeoutPromise = new Promise(resolve => {
        setTimeout(resolve, 1000); // 1 second timeout
      });
      await Promise.race([this.processingPromise, timeoutPromise]);
    }
  }

  /**
   * Process messages in the queue
   */
  async processQueue() {
    while (this.isProcessing) {
      // Check if we need to wait due to rate limiting
      if (this.isPaused && this.pauseUntil && this.timeSource() < this.pauseUntil) {
        const remainingPause = this.pauseUntil - this.timeSource();
        this.logger.debug('Queue processing paused due to rate limit', {
          remainingMs: remainingPause,
        });
        if (this.enableDelays) {
          await this.delay(Math.min(remainingPause, 1000)); // Check every second
        }
        continue;
      }

      // Clear pause if time has elapsed
      if (this.isPaused && this.pauseUntil && this.timeSource() >= this.pauseUntil) {
        this.isPaused = false;
        this.pauseUntil = null;
        this.logger.info('Rate limit pause cleared, resuming queue processing');
      }

      // Process next message if available
      if (this.messageQueue.length > 0) {
        const task = this.messageQueue.shift();
        await this.processMessage(task);
        this.updateQueueMetrics();
      } else {
        // No messages to process, wait a bit.
        // The loop will pause here until timers are advanced in tests.
        if (this.enableDelays) {
          await this.delay(100);
        } else {
          // In test mode with delays disabled, yield control briefly
          await Promise.resolve();
        }
      }
    }

    if (this._processingResolve) {
      this._processingResolve();
    }
  }

  /**
   * Process a single message task
   * @param {Object} task - Message task
   */
  async processMessage(task) {
    try {
      // Apply rate limiting delays
      await this.applyRateLimit();

      // Attempt to send the message
      const response = await this.attemptSend(task.channel, task.content, task.options);

      // Success
      this.metrics.successfulSends++;
      task.resolve(response);

      this.logger.debug('Message sent successfully', {
        taskId: task.id,
        messageId: response.id,
        channel: task.channel.name || task.channel.id,
      });
    } catch (error) {
      await this.handleSendError(task, error);
    }
  }

  /**
   * Attempt to send a message with Discord API
   * @param {Object} channel - Discord channel
   * @param {string|Object} content - Message content
   * @param {Object} options - Send options
   * @returns {Promise<Object>} Discord message response
   */
  async attemptSend(channel, content, options = {}) {
    if (typeof content === 'string') {
      return await channel.send(content);
    } else {
      return await channel.send({ ...content, ...options });
    }
  }

  /**
   * Handle send errors with retry logic and rate limit detection
   * @param {Object} task - Message task
   * @param {Error} error - Error that occurred
   */
  async handleSendError(task, error) {
    this.logger.debug('Message send failed', {
      taskId: task.id,
      error: error.message,
      retryCount: task.retryCount,
      code: error.code,
    });

    // Handle Discord API rate limiting (429)
    if (error.code === 429 || error.status === 429) {
      this.handleRateLimit(error, task);
      return;
    }

    // Handle other retryable errors
    if (this.isRetryableError(error) && task.retryCount < this.maxRetries) {
      task.retryCount++;
      this.metrics.totalRetries++;

      const retryDelay = this.calculateRetryDelay(task.retryCount);

      this.logger.warn('Retrying message send after error', {
        taskId: task.id,
        retryCount: task.retryCount,
        maxRetries: this.maxRetries,
        retryDelayMs: retryDelay,
        error: error.message,
      });

      // Add back to queue with delay (or immediately if delays disabled)
      if (this.enableDelays) {
        setTimeout(() => {
          this.messageQueue.unshift(task); // Add to front for priority
        }, retryDelay);
      } else {
        // For testing, add immediately but still track the delay would have happened
        this.messageQueue.unshift(task);
      }

      return;
    }

    // Permanent failure
    this.metrics.failedSends++;
    task.reject(error);

    this.logger.error('Message send permanently failed', {
      taskId: task.id,
      retryCount: task.retryCount,
      error: error.message,
      code: error.code,
    });
  }

  /**
   * Handle Discord API rate limiting
   * @param {Error} error - Rate limit error
   * @param {Object} task - Current task
   */
  handleRateLimit(error, task) {
    this.metrics.rateLimitHits++;
    this.metrics.lastRateLimitHit = this.timeSource();

    // Extract retry-after from error
    let retryAfterMs = 1000; // Default 1 second

    if (error.retryAfter) {
      retryAfterMs = error.retryAfter * 1000; // Convert seconds to milliseconds
    } else if (error.retry_after) {
      retryAfterMs = error.retry_after * 1000;
    } else if (error.headers && error.headers['retry-after']) {
      retryAfterMs = parseInt(error.headers['retry-after']) * 1000;
    }

    // Add some buffer to avoid hitting rate limit again immediately
    retryAfterMs += 500;

    this.logger.warn('Discord rate limit hit, pausing queue', {
      taskId: task.id,
      retryAfterMs,
      currentQueueSize: this.messageQueue.length,
    });

    // Pause the entire queue
    this.isPaused = true;
    this.pauseUntil = this.timeSource() + retryAfterMs;

    // Re-queue the current task
    this.messageQueue.unshift(task);
  }

  /**
   * Apply rate limiting delays between messages
   */
  async applyRateLimit() {
    const now = this.timeSource();

    // Reset burst counter if time has elapsed
    if (now - this.lastBurstReset > this.burstResetTime) {
      this.burstCounter = 0;
      this.lastBurstReset = now;
    }

    // If we're within burst allowance, send immediately
    if (this.burstCounter < this.burstAllowance) {
      this.burstCounter++;
      return;
    }

    // Apply base delay if we've exceeded burst allowance (only if delays are enabled)
    if (this.enableDelays) {
      await this.delay(this.baseSendDelay);
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   * @param {number} retryCount - Current retry attempt
   * @returns {number} Delay in milliseconds
   */
  calculateRetryDelay(retryCount) {
    const baseDelay = 1000; // 1 second
    const delay = baseDelay * Math.pow(this.backoffMultiplier, retryCount - 1);
    return Math.min(delay, this.maxBackoffDelay);
  }

  /**
   * Check if an error is retryable
   * @param {Error} error - Error to check
   * @returns {boolean} True if error is retryable
   */
  isRetryableError(error) {
    // Network-related errors that might be temporary
    const retryableErrors = ['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE'];

    // Discord API errors that might be temporary
    const retryableCodes = [
      500, // Internal Server Error
      502, // Bad Gateway
      503, // Service Unavailable
      504, // Gateway Timeout
    ];

    return (
      retryableErrors.some(
        errorType => error.code === errorType || (error.message && error.message.includes(errorType))
      ) ||
      retryableCodes.includes(error.status) ||
      retryableCodes.includes(error.code)
    );
  }

  /**
   * Update queue size metrics
   */
  updateQueueMetrics() {
    const currentSize = this.messageQueue.length;
    this.metrics.maxQueueSize = Math.max(this.metrics.maxQueueSize, currentSize);

    // Simple running average for queue size
    this.metrics.averageQueueSize = this.metrics.averageQueueSize * 0.9 + currentSize * 0.1;
  }

  /**
   * Generate unique task ID
   * @returns {string} Unique task ID
   */
  generateTaskId() {
    return `msg_${this.timeSource()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delay execution for specified milliseconds
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current metrics and status
   * @returns {Object} Sender metrics and status
   */
  getMetrics() {
    return {
      ...this.metrics,
      currentQueueSize: this.messageQueue.length,
      isProcessing: this.isProcessing,
      isPaused: this.isPaused,
      pauseUntil: this.pauseUntil,
      successRate:
        this.metrics.totalMessages > 0 ? (this.metrics.successfulSends / this.metrics.totalMessages) * 100 : 0,
      configuration: {
        baseSendDelay: this.baseSendDelay,
        burstAllowance: this.burstAllowance,
        burstResetTime: this.burstResetTime,
        maxRetries: this.maxRetries,
      },
    };
  }

  /**
   * Clear the message queue (useful for shutdown)
   * @param {string} reason - Reason for clearing queue
   */
  clearQueue(reason = 'Queue cleared') {
    const clearedTasks = this.messageQueue.length;

    // Reject all pending tasks
    this.messageQueue.forEach(task => {
      task.reject(new Error(reason));
    });

    this.messageQueue = [];

    this.logger.info('Message queue cleared', {
      clearedTasks,
      reason,
    });
  }

  /**
   * Graceful shutdown
   * @param {number} timeoutMs - Maximum time to wait for queue to empty
   * @returns {Promise<void>}
   */
  async shutdown(timeoutMs = 30000) {
    this.logger.info('Initiating graceful shutdown of rate-limited sender', {
      queueSize: this.messageQueue.length,
      timeoutMs,
    });

    const startTime = this.timeSource();

    // Wait for queue to empty or timeout
    while (this.messageQueue.length > 0 && this.timeSource() - startTime < timeoutMs) {
      if (this.enableDelays) {
        // Use smaller delay than timeout to avoid immediate timeout
        const checkInterval = Math.min(100, timeoutMs / 10);
        await this.delay(checkInterval);
      } else {
        // In testing, just yield control
        await Promise.resolve();
      }
    }

    // Stop processing
    await this.stopProcessing();

    // Clear any remaining messages
    if (this.messageQueue.length > 0) {
      this.clearQueue('Shutdown timeout reached');
    }

    this.logger.info('Rate-limited sender shutdown complete');
  }
}
