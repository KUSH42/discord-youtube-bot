import { DiscordMessageSender } from './discord-message-sender.js';

/**
 * Backward Compatibility Adapter for DiscordRateLimitedSender
 *
 * This adapter maintains the exact same API as the old DiscordRateLimitedSender
 * while internally using the new event-driven architecture. This allows existing
 * code to work unchanged during the migration period.
 *
 * Phase 2: Integration Layer - TEMPORARY COMPATIBILITY WRAPPER
 * This will be removed in Phase 4 after all code is migrated to new API.
 */
export class DiscordRateLimitedSenderAdapter {
  constructor(logger, options = {}) {
    this.logger = logger;

    // Store original options for compatibility
    this.originalOptions = { ...options };

    // Map old options to new architecture options
    const mappedOptions = this.mapOptionsToNewArchitecture(options);

    // Create the new architecture instance
    this.newSender = new DiscordMessageSender(logger, mappedOptions);

    // Expose properties that the old API exposed
    this.baseSendDelay = options.baseSendDelay || 1000;
    this.burstAllowance = options.burstAllowance || 5;
    this.burstResetTime = options.burstResetTime || 60000;
    this.maxRetries = options.maxRetries || 3;
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.maxBackoffDelay = options.maxBackoffDelay || 30000;
    this.autoStart = options.autoStart !== false;

    // Compatibility properties that delegate to new architecture
    this.timeSource = options.timeSource || (() => Date.now());
    this.enableDelays = options.enableDelays !== false;
    this.testMode = options.testMode || false;

    // Compatibility metrics structure
    this.compatibilityMetrics = {
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
    };

    // Setup event forwarding to maintain compatibility
    this.setupEventForwarding();

    // Auto-start if enabled (matching old behavior)
    if (this.autoStart) {
      this.startProcessing();
    }
  }

  /**
   * Map old configuration options to new architecture options
   * @param {Object} oldOptions - Original DiscordRateLimitedSender options
   * @returns {Object} Options for new DiscordMessageSender
   */
  mapOptionsToNewArchitecture(oldOptions) {
    // Determine if we're in test mode - either explicit testMode or enableDelays=false
    const isTestMode = oldOptions.testMode || oldOptions.enableDelays === false;

    return {
      // Core options - use testMode for deterministic testing
      testMode: isTestMode,
      autoStart: oldOptions.autoStart !== false,

      // Rate limiting options
      baseSendDelay: oldOptions.baseSendDelay || 1000,
      burstAllowance: oldOptions.burstAllowance || 5,
      burstResetTime: oldOptions.burstResetTime || 60000,

      // Retry options
      maxRetries: oldOptions.maxRetries || 3,
      backoffMultiplier: oldOptions.backoffMultiplier || 2,
      maxBackoffDelay: oldOptions.maxBackoffDelay || 30000,

      // Timing options for new architecture
      timeSource: oldOptions.timeSource,
      baseCheckInterval: isTestMode ? 0 : 100, // No delays in test mode
      idleCheckInterval: isTestMode ? 0 : 1000, // No delays in test mode

      // Test mode options
      enableJitter: !isTestMode, // No jitter in test mode
      maxConcurrentProcessing: 1,
    };
  }

  /**
   * Setup event forwarding to maintain compatibility metrics
   */
  setupEventForwarding() {
    // Forward events and update compatibility metrics
    this.newSender.on('message-queued', () => {
      this.compatibilityMetrics.totalMessages++;
    });

    this.newSender.on('message-processed', (message, _result) => {
      this.compatibilityMetrics.successfulSends++;
      this.updateQueueTimeMetrics(message);
    });

    this.newSender.on('message-failed', () => {
      this.compatibilityMetrics.failedSends++;
    });

    this.newSender.on('message-retry', () => {
      this.compatibilityMetrics.totalRetries++;
    });

    this.newSender.on('rate-limited', _info => {
      this.compatibilityMetrics.rateLimitHits++;
      this.compatibilityMetrics.lastRateLimitHit = this.timeSource();
    });

    this.newSender.on('processing-started', () => {
      this.compatibilityMetrics.processingStartTime = this.timeSource();
    });
  }

  /**
   * Update queue time metrics for compatibility
   * @param {Object} message - Processed message
   */
  updateQueueTimeMetrics(message) {
    if (message.createdAt) {
      const queueTime = this.timeSource() - message.createdAt;
      this.compatibilityMetrics.maxQueueTime = Math.max(this.compatibilityMetrics.maxQueueTime, queueTime);

      // Calculate running average
      const { totalMessages } = this.compatibilityMetrics;
      if (totalMessages > 0) {
        const currentAverage = this.compatibilityMetrics.averageQueueTime;
        this.compatibilityMetrics.averageQueueTime = (currentAverage * (totalMessages - 1) + queueTime) / totalMessages;
      }
    }
  }

  // =============================================================================
  // PUBLIC API - Exact compatibility with DiscordRateLimitedSender
  // =============================================================================

  /**
   * Queue a message for rate-limited sending
   * @param {Object} channel - Discord channel object
   * @param {string|Object} content - Message content
   * @param {Object} options - Message options (priority, etc.)
   * @returns {Promise<Object>} Promise that resolves when message is sent
   */
  async queueMessage(channel, content, options = {}) {
    return await this.newSender.queueMessage(channel, content, options);
  }

  /**
   * Send a message immediately without queuing
   * @param {Object} channel - Discord channel object
   * @param {string|Object} content - Message content
   * @returns {Promise<Object>} Discord API response
   */
  async sendImmediate(channel, content) {
    return await this.newSender.sendImmediate(channel, content);
  }

  /**
   * Start processing the message queue
   */
  startProcessing() {
    this.newSender.startProcessing();
  }

  /**
   * Stop processing the message queue
   * @returns {Promise<void>}
   */
  async stopProcessing() {
    await this.newSender.stopProcessing();
  }

  /**
   * Generate a unique task ID (for compatibility)
   * @returns {string} Unique task ID
   */
  generateTaskId() {
    return `msg_${this.timeSource()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delay execution for specified milliseconds (for compatibility)
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay(ms) {
    if (!this.enableDelays) {
      return Promise.resolve();
    }
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current metrics and status (maintains old structure)
   * @returns {Object} Sender metrics and status
   */
  getMetrics() {
    const newMetrics = this.newSender.getMetrics();

    // Update compatibility metrics from new architecture
    this.compatibilityMetrics.currentBurstCount = newMetrics.rateLimiter?.currentStatus?.burstCounter || 0;

    // Return metrics in old format
    return {
      ...this.compatibilityMetrics,
      currentQueueSize: newMetrics.global.currentQueueSize,
      isProcessing: newMetrics.global.isProcessing,
      isPaused: newMetrics.global.isPaused,
      pauseUntil: null, // New architecture doesn't expose pauseUntil directly
      successRate:
        this.compatibilityMetrics.totalMessages > 0
          ? (this.compatibilityMetrics.successfulSends / this.compatibilityMetrics.totalMessages) * 100
          : 0,
      configuration: {
        baseSendDelay: this.baseSendDelay,
        burstAllowance: this.burstAllowance,
        burstResetTime: this.burstResetTime,
        maxRetries: this.maxRetries,
      },
    };
  }

  /**
   * Clear the message queue
   * @param {string} reason - Reason for clearing queue
   */
  clearQueue(reason = 'Queue cleared') {
    const cleared = this.newSender.clearQueue(reason);
    this.logger.info('Queue cleared via compatibility adapter', {
      count: cleared.length,
      reason,
    });
  }

  /**
   * Graceful shutdown
   * @param {number} timeoutMs - Timeout for shutdown
   * @returns {Promise<void>}
   */
  async shutdown(timeoutMs = 30000) {
    this.logger.info('Initiating graceful shutdown via compatibility adapter', {
      queueSize: this.newSender.queue.size(),
      timeoutMs,
    });

    await this.newSender.shutdown(timeoutMs);

    this.logger.info('Compatibility adapter shutdown complete');
  }

  // =============================================================================
  // COMPATIBILITY GETTERS/SETTERS
  // =============================================================================

  /**
   * Get current processing state
   */
  get isProcessing() {
    return this.newSender.isProcessing;
  }

  /**
   * Get current pause state
   */
  get isPaused() {
    return this.newSender.isPaused;
  }

  /**
   * Get current queue (for compatibility - returns copy)
   */
  get messageQueue() {
    // Return a compatible representation of the queue
    return this.newSender.queue.toArray().map(message => ({
      id: message.id,
      channel: message.channel,
      content: message.content,
      options: message.options,
      retryCount: message.retryCount,
      createdAt: message.createdAt,
      priority: message.priority,
    }));
  }

  /**
   * Get pause until time (for compatibility)
   */
  get pauseUntil() {
    // The new architecture doesn't expose this directly
    // Return null for compatibility
    return null;
  }

  // =============================================================================
  // INTERNAL METHODS (for compatibility with any private usage)
  // =============================================================================

  /**
   * Update queue metrics (for compatibility)
   */
  updateQueueMetrics() {
    // This is handled automatically by event forwarding
    // Keep empty method for compatibility
  }

  /**
   * Check if error is retryable (for compatibility)
   * @param {Error} error - Error to check
   * @returns {boolean} True if retryable
   */
  isRetryableError(error) {
    // Use the new architecture's retry logic
    return this.newSender.retryHandler.shouldRetry(error, 0);
  }

  /**
   * Calculate retry delay (for compatibility)
   * @param {number} retryCount - Current retry count
   * @returns {number} Delay in milliseconds
   */
  calculateRetryDelay(retryCount) {
    return this.newSender.retryHandler.calculateRetryDelay(retryCount);
  }
}
