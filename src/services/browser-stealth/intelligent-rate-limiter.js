/**
 * IntelligentRateLimiter - Context-aware rate limiting optimized for timely updates with stealth
 * Balances quick content detection (1-2 minutes) with human-like browsing patterns
 * All time calculations use UTC to ensure timezone independence
 */

import { getCurrentHourUTC, getCurrentDayUTC, isNightTimeUTC, isWeekendUTC } from '../../utilities/utc-time.js';

export class IntelligentRateLimiter {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.sessionHistory = [];
    this.lastRequestTime = 0;

    // Optimized patterns for timely updates while maintaining stealth
    this.patterns = {
      human_active: {
        base: 60000, // 1 minute base interval for active periods
        variance: 30000, // ±30 seconds variance
        weight: 0.3,
      },
      human_idle: {
        base: 120000, // 2 minutes for idle periods (reduced for better coverage)
        variance: 60000, // ±1 minute variance
        weight: 0.4,
      },
      night_mode: {
        base: 300000, // 5 minutes during night (reduced for coverage)
        variance: 120000, // ±2 minutes variance
        weight: 0.2,
      },
      weekend: {
        base: 180000, // 3 minutes on weekends (reduced for consistency)
        variance: 90000, // ±1.5 minutes variance
        weight: 0.1,
      },
    };

    // Detection and burst management
    this.burstDetectionThreshold = 8; // Reduced from 10 for better balance
    this.maxPenaltyMultiplier = 1.5; // Reduced from 2.0 to maintain update frequency
    this.penaltyDecayTime = 1800000; // 30 minutes for penalty decay
    this.emergencyMode = false;
    this.emergencyModeTimeout = null;
  }

  /**
   * Calculate next optimal interval based on context and history
   * @returns {number} Next interval in milliseconds
   */
  calculateNextInterval() {
    const currentHour = getCurrentHourUTC();
    const isWeekend = isWeekendUTC();
    const isNightTime = isNightTimeUTC();

    let selectedPattern;

    // Select pattern based on time context
    if (this.emergencyMode) {
      // Emergency mode: significantly longer intervals
      selectedPattern = {
        base: 600000, // 10 minutes
        variance: 300000, // ±5 minutes
        weight: 1.0,
      };
    } else if (isNightTime) {
      selectedPattern = this.patterns.night_mode;
    } else if (isWeekend) {
      selectedPattern = this.patterns.weekend;
    } else if (this.isActiveSession()) {
      selectedPattern = this.patterns.human_active;
    } else {
      selectedPattern = this.patterns.human_idle;
    }

    // Apply burst detection penalty
    const burstPenalty = this.calculateBurstPenalty();

    // Calculate base interval with penalty
    const baseInterval = selectedPattern.base * (1 + burstPenalty);

    // Add variance for human-like randomness
    const variance = (Math.random() * 2 - 1) * selectedPattern.variance;

    // Ensure minimum interval for stealth (30 seconds)
    const calculatedInterval = Math.max(30000, baseInterval + variance);

    // Cap at 10 minutes for timely updates (except emergency mode)
    const finalInterval = this.emergencyMode ? calculatedInterval : Math.min(calculatedInterval, 600000);

    this.logger.debug('Calculated next interval', {
      pattern: this.getPatternName(selectedPattern),
      baseInterval,
      burstPenalty,
      variance,
      finalInterval,
      emergencyMode: this.emergencyMode,
      isActiveSession: this.isActiveSession(),
    });

    return finalInterval;
  }

  /**
   * Determine if current session shows active user behavior
   * @returns {boolean} True if session appears active
   */
  isActiveSession() {
    const recentRequests = this.sessionHistory.filter(
      timestamp => Date.now() - timestamp < 600000 // Last 10 minutes
    );
    return recentRequests.length > 3;
  }

  /**
   * Calculate burst penalty based on recent request frequency
   * @returns {number} Penalty multiplier (0.0 to maxPenaltyMultiplier)
   */
  calculateBurstPenalty() {
    const now = Date.now();
    const recentRequests = this.sessionHistory.filter(
      timestamp => now - timestamp < 300000 // Last 5 minutes
    );

    if (recentRequests.length <= this.burstDetectionThreshold) {
      return 0;
    }

    // Calculate penalty with decay for older requests
    let penaltyScore = 0;
    recentRequests.forEach(timestamp => {
      const age = now - timestamp;
      const decayFactor = 1 - age / this.penaltyDecayTime;
      penaltyScore += Math.max(0, decayFactor);
    });

    // Normalize penalty to multiplier
    const normalizedPenalty = (penaltyScore / this.burstDetectionThreshold) * this.maxPenaltyMultiplier;

    return Math.min(this.maxPenaltyMultiplier, normalizedPenalty);
  }

  /**
   * Record a request for rate limiting analysis
   * @param {boolean} successful - Whether the request was successful
   */
  recordRequest(successful = true) {
    const now = Date.now();
    this.sessionHistory.push(now);
    this.lastRequestTime = now;

    // Keep only last 100 requests for memory efficiency
    if (this.sessionHistory.length > 100) {
      this.sessionHistory = this.sessionHistory.slice(-100);
    }

    // Handle failed requests (potential detection)
    if (!successful) {
      this.handleDetectionIncident();
    }

    this.logger.debug('Request recorded', {
      successful,
      totalRequests: this.sessionHistory.length,
      recentRequests: this.getRecentRequestCount(),
      emergencyMode: this.emergencyMode,
    });
  }

  /**
   * Handle potential detection incident
   */
  handleDetectionIncident() {
    this.logger.warn('Potential detection incident recorded');

    // Enter emergency mode for extended cooling period
    this.emergencyMode = true;

    // Clear any existing timeout
    if (this.emergencyModeTimeout) {
      clearTimeout(this.emergencyModeTimeout);
    }

    // Exit emergency mode after extended period
    this.emergencyModeTimeout = setTimeout(() => {
      this.emergencyMode = false;
      this.logger.info('Emergency mode deactivated');
    }, 3600000); // 1 hour emergency mode
  }

  /**
   * Get count of recent requests for monitoring
   * @param {number} timeWindow - Time window in milliseconds (default: 10 minutes)
   * @returns {number} Number of recent requests
   */
  getRecentRequestCount(timeWindow = 600000) {
    const cutoff = Date.now() - timeWindow;
    return this.sessionHistory.filter(timestamp => timestamp > cutoff).length;
  }

  /**
   * Get pattern name for logging
   * @param {Object} pattern - Pattern object
   * @returns {string} Pattern name
   */
  getPatternName(pattern) {
    for (const [name, p] of Object.entries(this.patterns)) {
      if (p === pattern) {
        return name;
      }
    }
    return 'custom';
  }

  /**
   * Get current rate limiting status for monitoring
   * @returns {Object} Status information
   */
  getStatus() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const nextInterval = this.calculateNextInterval();

    return {
      sessionRequests: this.sessionHistory.length,
      recentRequests: this.getRecentRequestCount(),
      timeSinceLastRequest,
      nextInterval,
      emergencyMode: this.emergencyMode,
      isActiveSession: this.isActiveSession(),
      burstPenalty: this.calculateBurstPenalty(),
      currentPattern: this.getCurrentPatternName(),
      averageInterval: this.calculateAverageInterval(),
    };
  }

  /**
   * Get current pattern name based on context
   * @returns {string} Current pattern name
   */
  getCurrentPatternName() {
    const currentHour = getCurrentHourUTC();
    const isWeekend = isWeekendUTC();
    const isNightTime = currentHour < 6 || currentHour > 22;

    if (this.emergencyMode) {
      return 'emergency';
    }
    if (isNightTime) {
      return 'night_mode';
    }
    if (isWeekend) {
      return 'weekend';
    }
    if (this.isActiveSession()) {
      return 'human_active';
    }
    return 'human_idle';
  }

  /**
   * Calculate average interval from recent requests
   * @returns {number} Average interval in milliseconds
   */
  calculateAverageInterval() {
    if (this.sessionHistory.length < 2) {
      return 0;
    }

    const recentHistory = this.sessionHistory.slice(-10); // Last 10 requests
    let totalInterval = 0;

    for (let i = 1; i < recentHistory.length; i++) {
      totalInterval += recentHistory[i] - recentHistory[i - 1];
    }

    return totalInterval / (recentHistory.length - 1);
  }

  /**
   * Reset rate limiter state (for testing or recovery)
   */
  reset() {
    this.sessionHistory = [];
    this.lastRequestTime = 0;
    this.emergencyMode = false;

    if (this.emergencyModeTimeout) {
      clearTimeout(this.emergencyModeTimeout);
      this.emergencyModeTimeout = null;
    }

    this.logger.info('Rate limiter state reset');
  }

  /**
   * Wait for the calculated interval
   * @returns {Promise<number>} Resolves with the actual wait time
   */
  async waitForNextRequest() {
    const interval = this.calculateNextInterval();
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    const waitTime = Math.max(0, interval - timeSinceLastRequest);

    if (waitTime > 0) {
      this.logger.debug('Waiting for next request', {
        waitTime,
        interval,
        timeSinceLastRequest,
      });

      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    return waitTime;
  }

  /**
   * Update configuration patterns
   * @param {Object} newPatterns - New pattern configuration
   */
  updatePatterns(newPatterns) {
    this.patterns = { ...this.patterns, ...newPatterns };
    this.logger.info('Rate limiter patterns updated', { newPatterns });
  }

  /**
   * Set emergency mode manually (for testing or incident response)
   * @param {boolean} enabled - Whether to enable emergency mode
   * @param {number} duration - Duration in milliseconds (default: 1 hour)
   */
  setEmergencyMode(enabled, duration = 3600000) {
    this.emergencyMode = enabled;

    if (this.emergencyModeTimeout) {
      clearTimeout(this.emergencyModeTimeout);
      this.emergencyModeTimeout = null;
    }

    if (enabled && duration > 0) {
      this.emergencyModeTimeout = setTimeout(() => {
        this.emergencyMode = false;
        this.logger.info('Emergency mode automatically deactivated');
      }, duration);
    }

    this.logger.info('Emergency mode manually set', { enabled, duration });
  }
}
