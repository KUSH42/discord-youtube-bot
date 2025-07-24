/**
 * DetectionMonitor - Advanced anti-bot detection tracking and alerting system
 * Monitors and analyzes potential bot detection incidents for proactive response
 */
export class DetectionMonitor {
  constructor(logger, config = {}) {
    this.logger = logger;
    this.alertThreshold = config.alertThreshold || 3;
    this.monitoringWindow = config.monitoringWindow || 3600000; // 1 hour
    this.maxIncidentHistory = config.maxIncidentHistory || 1000;

    // Incident tracking
    this.incidents = [];
    this.patterns = new Map();

    // Metrics tracking
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      detectionIncidents: 0,
      lastIncidentTime: null,
      averageSuccessRate: 1.0,
      criticalFailures: 0,
    };

    // Detection patterns and signatures
    this.detectionSignatures = [
      // HTTP status codes
      { type: 'http_status', pattern: /40[13]/, weight: 0.8, description: 'Forbidden/Unauthorized response' },
      { type: 'http_status', pattern: /429/, weight: 1.0, description: 'Rate limit exceeded' },
      { type: 'http_status', pattern: /503/, weight: 0.6, description: 'Service unavailable' },

      // Response content patterns
      { type: 'content', pattern: /blocked|banned/i, weight: 0.9, description: 'Explicit blocking message' },
      { type: 'content', pattern: /captcha|challenge/i, weight: 1.0, description: 'CAPTCHA challenge' },
      { type: 'content', pattern: /bot.{0,10}detected/i, weight: 1.0, description: 'Bot detection message' },
      { type: 'content', pattern: /access.{0,10}denied/i, weight: 0.8, description: 'Access denied' },
      { type: 'content', pattern: /too.{0,10}many.{0,10}requests/i, weight: 0.9, description: 'Rate limiting message' },
      { type: 'content', pattern: /suspicious.{0,10}activity/i, weight: 0.9, description: 'Suspicious activity' },

      // Error messages
      { type: 'error', pattern: /automation.{0,10}detected/i, weight: 1.0, description: 'Automation detection' },
      { type: 'error', pattern: /browser.{0,10}not.{0,10}supported/i, weight: 0.7, description: 'Browser rejection' },
      { type: 'error', pattern: /connection.{0,10}refused/i, weight: 0.5, description: 'Connection issues' },
      { type: 'error', pattern: /timeout/i, weight: 0.3, description: 'Request timeout' },

      // Network-level indicators
      { type: 'network', pattern: /net::err_blocked_by_client/i, weight: 0.8, description: 'Client-side blocking' },
      { type: 'network', pattern: /net::err_access_denied/i, weight: 0.9, description: 'Network access denied' },
    ];

    // Initialize alert system
    this.alertCallbacks = [];
    this.lastAlertTime = 0;
    this.alertCooldown = 300000; // 5 minutes between alerts
  }

  /**
   * Record a request attempt for analysis
   * @param {boolean} successful - Whether the request was successful
   * @param {Object} context - Request context information
   */
  recordRequest(successful = true, context = {}) {
    this.metrics.totalRequests++;

    if (successful) {
      this.metrics.successfulRequests++;
    } else {
      this.recordDetectionIncident(context);
    }

    // Update rolling success rate
    this.updateSuccessRate();

    this.logger.debug('Request recorded for detection monitoring', {
      successful,
      totalRequests: this.metrics.totalRequests,
      successRate: this.metrics.averageSuccessRate,
      recentIncidents: this.getRecentIncidents().length,
    });
  }

  /**
   * Record a potential detection incident
   * @param {Object} context - Incident context information
   */
  recordDetectionIncident(context = {}) {
    const incident = {
      timestamp: Date.now(),
      id: this.generateIncidentId(),
      context: {
        url: context.url || 'unknown',
        userAgent: context.userAgent || 'unknown',
        errorMessage: context.errorMessage || '',
        httpStatus: context.httpStatus || null,
        responseContent: context.responseContent || '',
        ...context,
      },
      severity: this.calculateIncidentSeverity(context),
      detectionScore: this.calculateDetectionScore(context),
      patterns: this.analyzeDetectionPatterns(context),
    };

    this.incidents.push(incident);
    this.metrics.detectionIncidents++;
    this.metrics.lastIncidentTime = incident.timestamp;

    // Track patterns for analysis
    this.updatePatternTracking(incident);

    // Keep incident history within limits
    if (this.incidents.length > this.maxIncidentHistory) {
      this.incidents = this.incidents.slice(-this.maxIncidentHistory);
    }

    this.logger.warn('Detection incident recorded', {
      incidentId: incident.id,
      severity: incident.severity,
      detectionScore: incident.detectionScore,
      url: incident.context.url,
      patterns: incident.patterns.map(p => p.description),
    });

    // Check if we need to trigger alerts
    this.checkAlertThresholds(incident);

    return incident;
  }

  /**
   * Calculate incident severity based on context
   * @param {Object} context - Incident context
   * @returns {string} Severity level (low, medium, high, critical)
   */
  calculateIncidentSeverity(context) {
    const detectionScore = this.calculateDetectionScore(context);

    if (detectionScore >= 0.9) {
      return 'critical';
    }
    if (detectionScore >= 0.7) {
      return 'high';
    }
    if (detectionScore >= 0.5) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Calculate detection probability score
   * @param {Object} context - Incident context
   * @returns {number} Detection score (0.0 to 1.0)
   */
  calculateDetectionScore(context) {
    let totalScore = 0;
    let matchCount = 0;

    const textToAnalyze = [
      context.errorMessage || '',
      context.responseContent || '',
      context.httpStatus ? context.httpStatus.toString() : '',
    ].join(' ');

    for (const signature of this.detectionSignatures) {
      if (signature.pattern.test(textToAnalyze)) {
        totalScore += signature.weight;
        matchCount++;
      }
    }

    // Normalize score based on matches and context
    if (matchCount === 0) {
      return 0.1; // Base suspicion for any failure
    }

    const normalizedScore = Math.min(1.0, totalScore / matchCount);

    // Boost score for multiple pattern matches
    const multiPatternBoost = Math.min(0.3, (matchCount - 1) * 0.1);

    return Math.min(1.0, normalizedScore + multiPatternBoost);
  }

  /**
   * Analyze detection patterns in the incident
   * @param {Object} context - Incident context
   * @returns {Array} Matched patterns
   */
  analyzeDetectionPatterns(context) {
    const matchedPatterns = [];

    const textToAnalyze = [
      context.errorMessage || '',
      context.responseContent || '',
      context.httpStatus ? context.httpStatus.toString() : '',
    ].join(' ');

    for (const signature of this.detectionSignatures) {
      if (signature.pattern.test(textToAnalyze)) {
        matchedPatterns.push({
          type: signature.type,
          description: signature.description,
          weight: signature.weight,
          pattern: signature.pattern.source,
        });
      }
    }

    return matchedPatterns;
  }

  /**
   * Update pattern tracking for trend analysis
   * @param {Object} incident - Detection incident
   */
  updatePatternTracking(incident) {
    for (const pattern of incident.patterns) {
      const key = `${pattern.type}:${pattern.description}`;

      if (!this.patterns.has(key)) {
        this.patterns.set(key, {
          type: pattern.type,
          description: pattern.description,
          count: 0,
          firstSeen: incident.timestamp,
          lastSeen: incident.timestamp,
          totalWeight: 0,
        });
      }

      const patternData = this.patterns.get(key);
      patternData.count++;
      patternData.lastSeen = incident.timestamp;
      patternData.totalWeight += pattern.weight;
    }
  }

  /**
   * Check if alert thresholds have been exceeded
   * @param {Object} incident - Latest incident
   */
  checkAlertThresholds(incident) {
    const now = Date.now();
    const recentIncidents = this.getRecentIncidents();

    // Check incident count threshold
    if (recentIncidents.length >= this.alertThreshold) {
      this.triggerAlert('incident_threshold', {
        incidents: recentIncidents.length,
        timeWindow: this.monitoringWindow,
        threshold: this.alertThreshold,
        latestIncident: incident,
      });
    }

    // Check critical incident
    if (incident.severity === 'critical') {
      this.triggerAlert('critical_incident', {
        incident,
        detectionScore: incident.detectionScore,
        patterns: incident.patterns,
      });
    }

    // Check success rate drop
    if (this.metrics.averageSuccessRate < 0.5 && this.metrics.totalRequests > 10) {
      this.triggerAlert('success_rate_drop', {
        successRate: this.metrics.averageSuccessRate,
        totalRequests: this.metrics.totalRequests,
        successfulRequests: this.metrics.successfulRequests,
      });
    }
  }

  /**
   * Trigger an alert
   * @param {string} alertType - Type of alert
   * @param {Object} alertData - Alert data
   */
  triggerAlert(alertType, alertData) {
    const now = Date.now();

    // Apply cooldown to prevent spam
    if (now - this.lastAlertTime < this.alertCooldown) {
      return;
    }

    this.lastAlertTime = now;

    const alert = {
      type: alertType,
      timestamp: now,
      data: alertData,
      severity: this.getAlertSeverity(alertType),
    };

    this.logger.error(`Detection monitor alert: ${alertType}`, alert);

    // Notify registered callbacks
    for (const callback of this.alertCallbacks) {
      try {
        callback(alert);
      } catch (error) {
        this.logger.error('Error in alert callback', { error: error.message });
      }
    }
  }

  /**
   * Get alert severity level
   * @param {string} alertType - Alert type
   * @returns {string} Severity level
   */
  getAlertSeverity(alertType) {
    const severityMap = {
      critical_incident: 'critical',
      incident_threshold: 'high',
      success_rate_drop: 'high',
      pattern_anomaly: 'medium',
    };

    return severityMap[alertType] || 'medium';
  }

  /**
   * Register alert callback
   * @param {Function} callback - Alert callback function
   */
  registerAlertCallback(callback) {
    if (typeof callback === 'function') {
      this.alertCallbacks.push(callback);
    }
  }

  /**
   * Get recent incidents within monitoring window
   * @param {number} timeWindow - Time window in milliseconds
   * @returns {Array} Recent incidents
   */
  getRecentIncidents(timeWindow = this.monitoringWindow) {
    const cutoff = Date.now() - timeWindow;
    return this.incidents.filter(incident => incident.timestamp > cutoff);
  }

  /**
   * Update rolling success rate
   */
  updateSuccessRate() {
    if (this.metrics.totalRequests === 0) {
      this.metrics.averageSuccessRate = 1.0;
      return;
    }

    // Use recent requests for rolling average (last 100 requests)
    const recentWindow = Math.min(100, this.metrics.totalRequests);
    const recentSuccessful = Math.min(this.metrics.successfulRequests, recentWindow);

    this.metrics.averageSuccessRate = recentSuccessful / recentWindow;
  }

  /**
   * Generate unique incident ID
   * @returns {string} Incident ID
   */
  generateIncidentId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `DI_${timestamp}_${random}`;
  }

  /**
   * Get comprehensive detection analysis
   * @returns {Object} Detection analysis
   */
  getDetectionAnalysis() {
    const now = Date.now();
    const recentIncidents = this.getRecentIncidents();

    // Pattern frequency analysis
    const patternFrequency = Array.from(this.patterns.entries())
      .map(([key, data]) => ({
        pattern: key,
        ...data,
        frequency: data.count / Math.max(1, this.metrics.totalRequests),
        recentActivity: data.lastSeen > now - this.monitoringWindow,
      }))
      .sort((a, b) => b.count - a.count);

    // Severity distribution
    const severityDistribution = recentIncidents.reduce((acc, incident) => {
      acc[incident.severity] = (acc[incident.severity] || 0) + 1;
      return acc;
    }, {});

    // Time-based analysis
    const hourlyDistribution = this.getHourlyDistribution(recentIncidents);

    return {
      overview: {
        totalRequests: this.metrics.totalRequests,
        successfulRequests: this.metrics.successfulRequests,
        detectionIncidents: this.metrics.detectionIncidents,
        successRate: this.metrics.averageSuccessRate,
        recentIncidents: recentIncidents.length,
        lastIncidentTime: this.metrics.lastIncidentTime,
      },
      patterns: {
        totalPatterns: this.patterns.size,
        topPatterns: patternFrequency.slice(0, 10),
        recentPatterns: patternFrequency.filter(p => p.recentActivity),
      },
      severity: severityDistribution,
      temporal: {
        hourlyDistribution,
        peakHours: this.getPeakHours(hourlyDistribution),
      },
      recommendations: this.generateRecommendations(recentIncidents, patternFrequency),
    };
  }

  /**
   * Get hourly distribution of incidents
   * @param {Array} incidents - Incident array
   * @returns {Object} Hourly distribution
   */
  getHourlyDistribution(incidents) {
    const distribution = {};

    for (let hour = 0; hour < 24; hour++) {
      distribution[hour] = 0;
    }

    incidents.forEach(incident => {
      const hour = new Date(incident.timestamp).getUTCHours();
      distribution[hour]++;
    });

    return distribution;
  }

  /**
   * Get peak incident hours
   * @param {Object} hourlyDistribution - Hourly distribution data
   * @returns {Array} Peak hours
   */
  getPeakHours(hourlyDistribution) {
    const hours = Object.entries(hourlyDistribution)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return hours.filter(h => h.count > 0);
  }

  /**
   * Generate recommendations based on detection patterns
   * @param {Array} recentIncidents - Recent incidents
   * @param {Array} patternFrequency - Pattern frequency data
   * @returns {Array} Recommendations
   */
  generateRecommendations(recentIncidents, patternFrequency) {
    const recommendations = [];

    // High incident rate
    if (recentIncidents.length >= this.alertThreshold) {
      recommendations.push({
        type: 'rate_limiting',
        priority: 'high',
        message: 'Consider increasing rate limiting intervals due to high detection incidents',
        action: 'setEmergencyMode',
      });
    }

    // CAPTCHA patterns
    const captchaPatterns = patternFrequency.filter(
      p =>
        p.pattern.toLowerCase().includes('captcha') ||
        p.pattern.toLowerCase().includes('challenge') ||
        p.description.toLowerCase().includes('captcha') ||
        p.description.toLowerCase().includes('challenge')
    );
    if (captchaPatterns.length > 0 && captchaPatterns[0].count > 2) {
      recommendations.push({
        type: 'user_agent',
        priority: 'high',
        message: 'Frequent CAPTCHA challenges detected, rotate user agent',
        action: 'rotateUserAgent',
      });
    }

    // Bot detection patterns
    const botPatterns = patternFrequency.filter(
      p =>
        p.pattern.toLowerCase().includes('bot') ||
        p.pattern.toLowerCase().includes('automation') ||
        p.description.toLowerCase().includes('bot') ||
        p.description.toLowerCase().includes('automation')
    );
    if (botPatterns.length > 0) {
      recommendations.push({
        type: 'stealth_enhancement',
        priority: 'critical',
        message: 'Direct bot detection occurring, enhance stealth measures',
        action: 'enhanceStealthMode',
      });
    }

    // Rate limiting patterns
    const rateLimitPatterns = patternFrequency.filter(
      p =>
        p.pattern.toLowerCase().includes('rate') ||
        p.pattern.toLowerCase().includes('too many') ||
        p.description.toLowerCase().includes('rate') ||
        p.description.toLowerCase().includes('too many')
    );
    if (rateLimitPatterns.length > 0) {
      recommendations.push({
        type: 'interval_adjustment',
        priority: 'medium',
        message: 'Rate limiting detected, increase request intervals',
        action: 'adjustRateLimiting',
      });
    }

    // Low success rate
    if (this.metrics.averageSuccessRate < 0.7) {
      recommendations.push({
        type: 'profile_refresh',
        priority: 'medium',
        message: 'Low success rate, consider refreshing browser profile',
        action: 'refreshBrowserProfile',
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Get current monitoring status
   * @returns {Object} Monitoring status
   */
  getStatus() {
    const recentIncidents = this.getRecentIncidents();

    return {
      monitoring: {
        active: true,
        alertThreshold: this.alertThreshold,
        monitoringWindow: this.monitoringWindow,
        alertCallbacks: this.alertCallbacks.length,
      },
      metrics: { ...this.metrics },
      recent: {
        incidents: recentIncidents.length,
        highSeverityIncidents: recentIncidents.filter(i => ['high', 'critical'].includes(i.severity)).length,
        averageDetectionScore:
          recentIncidents.length > 0
            ? recentIncidents.reduce((sum, i) => sum + i.detectionScore, 0) / recentIncidents.length
            : 0,
      },
      alerts: {
        lastAlertTime: this.lastAlertTime,
        alertCooldown: this.alertCooldown,
      },
    };
  }

  /**
   * Reset monitoring state (for testing or recovery)
   */
  reset() {
    this.incidents = [];
    this.patterns.clear();
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      detectionIncidents: 0,
      lastIncidentTime: null,
      averageSuccessRate: 1.0,
      criticalFailures: 0,
    };
    this.lastAlertTime = 0;

    this.logger.info('Detection monitor state reset');
  }
}
