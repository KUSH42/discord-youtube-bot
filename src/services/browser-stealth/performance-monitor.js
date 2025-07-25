/**
 * PerformanceMonitor - Advanced resource usage and performance tracking system
 * Monitors browser automation performance impact and resource consumption
 */
export class PerformanceMonitor {
  constructor(logger, config = {}) {
    this.logger = logger;
    this.samplingInterval = config.samplingInterval || 30000; // 30 seconds
    this.maxSamples = config.maxSamples || 1000;
    this.alertThresholds = {
      memoryUsage: config.memoryThreshold || 1024 * 1024 * 1024, // 1GB
      cpuUsage: config.cpuThreshold || 80, // 80%
      responseTime: config.responseTimeThreshold || 30000, // 30 seconds
      ...config.alertThresholds,
    };

    // Performance data storage
    this.samples = [];
    this.operationHistory = [];
    this.alertHistory = [];

    // Current metrics
    this.currentMetrics = {
      memoryUsage: 0,
      cpuUsage: 0,
      browserInstances: 0,
      activeConnections: 0,
      lastSampleTime: 0,
    };

    // Operation tracking
    this.activeOperations = new Map();
    this.operationStats = {
      navigation: { count: 0, totalTime: 0, avgTime: 0, failures: 0 },
      interaction: { count: 0, totalTime: 0, avgTime: 0, failures: 0 },
      scraping: { count: 0, totalTime: 0, avgTime: 0, failures: 0 },
      browserLaunch: { count: 0, totalTime: 0, avgTime: 0, failures: 0 },
    };

    // Resource tracking
    this.resourceUsage = {
      peakMemory: 0,
      peakCpu: 0,
      totalBrowserTime: 0,
      browserLaunches: 0,
      browserCrashes: 0,
    };

    // Alert callbacks
    this.alertCallbacks = [];
    this.monitoringActive = false;
    this.monitoringInterval = null;

    // Performance grades and benchmarks
    this.performanceBenchmarks = {
      navigation: { excellent: 3000, good: 5000, poor: 10000 }, // milliseconds
      interaction: { excellent: 500, good: 1000, poor: 2000 },
      memory: { excellent: 256, good: 512, poor: 1024 }, // MB
      cpu: { excellent: 20, good: 40, poor: 70 }, // percentage
    };
  }

  /**
   * Start performance monitoring
   */
  startMonitoring() {
    if (this.monitoringActive) {
      return;
    }

    this.monitoringActive = true;
    this.monitoringInterval = setInterval(() => {
      this.collectPerformanceSample();
    }, this.samplingInterval);

    this.logger.info('Performance monitoring started', {
      samplingInterval: this.samplingInterval,
      alertThresholds: this.alertThresholds,
    });
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring() {
    if (!this.monitoringActive) {
      return;
    }

    this.monitoringActive = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.logger.info('Performance monitoring stopped');
  }

  /**
   * Collect current performance sample
   */
  async collectPerformanceSample() {
    try {
      const sample = {
        timestamp: Date.now(),
        memory: this.getMemoryUsage(),
        cpu: await this.getCpuUsage(),
        processes: this.getProcessInfo(),
        operations: this.getActiveOperationCount(),
        system: await this.getSystemMetrics(),
      };

      this.samples.push(sample);
      this.updateCurrentMetrics(sample);

      // Keep samples within limit
      if (this.samples.length > this.maxSamples) {
        this.samples = this.samples.slice(-this.maxSamples);
      }

      // Check alert thresholds
      this.checkPerformanceAlerts(sample);

      this.logger.debug('Performance sample collected', {
        memoryMB: Math.round(sample.memory.heapUsed / 1024 / 1024),
        cpuPercent: sample.cpu.usage,
        activeOperations: sample.operations,
      });
    } catch (error) {
      this.logger.error('Error collecting performance sample', { error: error.message });
    }
  }

  /**
   * Get current memory usage
   * @returns {Object} Memory usage information
   */
  getMemoryUsage() {
    const memUsage = process.memoryUsage();

    // Update peak memory tracking
    if (memUsage.heapUsed > this.resourceUsage.peakMemory) {
      this.resourceUsage.peakMemory = memUsage.heapUsed;
    }

    return {
      ...memUsage,
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      externalMB: Math.round(memUsage.external / 1024 / 1024),
      rssMB: Math.round(memUsage.rss / 1024 / 1024),
    };
  }

  /**
   * Get current CPU usage
   * @returns {Promise<Object>} CPU usage information
   */
  async getCpuUsage() {
    const startUsage = process.cpuUsage();
    const startTime = process.hrtime.bigint();

    // Wait a short time to measure CPU usage
    await new Promise(resolve => setTimeout(resolve, 100));

    const endUsage = process.cpuUsage(startUsage);
    const endTime = process.hrtime.bigint();

    const totalTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    const cpuTime = (endUsage.user + endUsage.system) / 1000; // Convert to milliseconds

    const usage = Math.min(100, (cpuTime / totalTime) * 100);

    // Update peak CPU tracking
    if (usage > this.resourceUsage.peakCpu) {
      this.resourceUsage.peakCpu = usage;
    }

    return {
      usage: Math.round(usage * 10) / 10, // Round to 1 decimal place
      user: endUsage.user,
      system: endUsage.system,
      total: endUsage.user + endUsage.system,
    };
  }

  /**
   * Get process information
   * @returns {Object} Process information
   */
  getProcessInfo() {
    return {
      pid: process.pid,
      uptime: process.uptime(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
    };
  }

  /**
   * Get system metrics
   * @returns {Promise<Object>} System metrics
   */
  async getSystemMetrics() {
    return {
      loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0],
      freeMemory: require('os').freemem(),
      totalMemory: require('os').totalmem(),
      cpuCount: require('os').cpus().length,
    };
  }

  /**
   * Get count of active operations
   * @returns {number} Active operation count
   */
  getActiveOperationCount() {
    return this.activeOperations.size;
  }

  /**
   * Update current metrics
   * @param {Object} sample - Performance sample
   */
  updateCurrentMetrics(sample) {
    this.currentMetrics = {
      memoryUsage: sample.memory.heapUsed,
      cpuUsage: sample.cpu.usage,
      browserInstances: 1, // Will be updated when browser tracking is implemented
      activeConnections: sample.operations,
      lastSampleTime: sample.timestamp,
    };
  }

  /**
   * Start tracking an operation
   * @param {string} operationType - Type of operation
   * @param {Object} context - Operation context
   * @returns {string} Operation ID
   */
  startOperation(operationType, context = {}) {
    const operationId = this.generateOperationId();
    const operation = {
      id: operationId,
      type: operationType,
      startTime: Date.now(),
      startMemory: process.memoryUsage(),
      startCpu: process.cpuUsage(),
      context,
    };

    this.activeOperations.set(operationId, operation);

    this.logger.debug('Operation started', {
      operationId,
      type: operationType,
      activeOperations: this.activeOperations.size,
    });

    return operationId;
  }

  /**
   * End tracking an operation
   * @param {string} operationId - Operation ID
   * @param {boolean} successful - Whether operation was successful
   * @param {Object} additionalContext - Additional context
   */
  endOperation(operationId, successful = true, additionalContext = {}) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      this.logger.warn('Attempted to end unknown operation', { operationId });
      return null;
    }

    const endTime = Date.now();
    const endMemory = process.memoryUsage();
    const endCpu = process.cpuUsage(operation.startCpu);

    const result = {
      ...operation,
      endTime,
      duration: endTime - operation.startTime,
      memoryDelta: endMemory.heapUsed - operation.startMemory.heapUsed,
      cpuTime: endCpu.user + endCpu.system,
      successful,
      ...additionalContext,
    };

    // Remove from active operations
    this.activeOperations.delete(operationId);

    // Add to operation history
    this.operationHistory.push(result);

    // Keep history within limits
    if (this.operationHistory.length > this.maxSamples) {
      this.operationHistory = this.operationHistory.slice(-this.maxSamples);
    }

    // Update operation statistics
    this.updateOperationStats(result);

    this.logger.debug('Operation completed', {
      operationId,
      type: operation.type,
      duration: result.duration,
      successful,
      memoryDeltaMB: Math.round(result.memoryDelta / 1024 / 1024),
    });

    return result;
  }

  /**
   * Update operation statistics
   * @param {Object} operation - Completed operation
   */
  updateOperationStats(operation) {
    const { type } = operation;
    if (!this.operationStats[type]) {
      this.operationStats[type] = { count: 0, totalTime: 0, avgTime: 0, failures: 0 };
    }

    const stats = this.operationStats[type];
    stats.count++;
    stats.totalTime += operation.duration;
    stats.avgTime = stats.totalTime / stats.count;

    if (!operation.successful) {
      stats.failures++;
    }
  }

  /**
   * Check performance alert thresholds
   * @param {Object} sample - Performance sample
   */
  checkPerformanceAlerts(sample) {
    const alerts = [];

    // Memory usage alert
    if (sample.memory.heapUsed > this.alertThresholds.memoryUsage) {
      alerts.push({
        type: 'memory_usage',
        severity: 'high',
        current: sample.memory.heapUsed,
        threshold: this.alertThresholds.memoryUsage,
        message: `Memory usage exceeded threshold: ${Math.round(sample.memory.heapUsed / 1024 / 1024)}MB`,
      });
    }

    // CPU usage alert
    if (sample.cpu.usage > this.alertThresholds.cpuUsage) {
      alerts.push({
        type: 'cpu_usage',
        severity: 'medium',
        current: sample.cpu.usage,
        threshold: this.alertThresholds.cpuUsage,
        message: `CPU usage exceeded threshold: ${sample.cpu.usage}%`,
      });
    }

    // Check operation response times
    const recentOperations = this.operationHistory.slice(-10);
    const slowOperations = recentOperations.filter(op => op.duration > this.alertThresholds.responseTime);

    if (slowOperations.length > 3) {
      alerts.push({
        type: 'slow_operations',
        severity: 'medium',
        current: slowOperations.length,
        threshold: 3,
        message: `Multiple slow operations detected: ${slowOperations.length} operations over ${this.alertThresholds.responseTime}ms`,
      });
    }

    // Trigger alerts
    for (const alert of alerts) {
      this.triggerPerformanceAlert(alert);
    }
  }

  /**
   * Trigger a performance alert
   * @param {Object} alert - Alert information
   */
  triggerPerformanceAlert(alert) {
    const alertRecord = {
      ...alert,
      timestamp: Date.now(),
      id: this.generateAlertId(),
    };

    this.alertHistory.push(alertRecord);

    // Keep alert history within limits
    if (this.alertHistory.length > 100) {
      this.alertHistory = this.alertHistory.slice(-100);
    }

    this.logger.warn('Performance alert triggered', alertRecord);

    // Notify callbacks
    for (const callback of this.alertCallbacks) {
      try {
        callback(alertRecord);
      } catch (error) {
        this.logger.error('Error in performance alert callback', { error: error.message });
      }
    }
  }

  /**
   * Register performance alert callback
   * @param {Function} callback - Alert callback function
   */
  registerAlertCallback(callback) {
    if (typeof callback === 'function') {
      this.alertCallbacks.push(callback);
    }
  }

  /**
   * Get performance report
   * @returns {Object} Comprehensive performance report
   */
  getPerformanceReport() {
    const recentSamples = this.samples.slice(-20); // Last 20 samples
    const recentOperations = this.operationHistory.slice(-50); // Last 50 operations

    return {
      overview: {
        monitoring: this.monitoringActive,
        sampleCount: this.samples.length,
        operationCount: this.operationHistory.length,
        alertCount: this.alertHistory.length,
        lastSampleTime: this.currentMetrics.lastSampleTime,
      },
      current: { ...this.currentMetrics },
      peaks: {
        memory: {
          value: this.resourceUsage.peakMemory,
          valueMB: Math.round(this.resourceUsage.peakMemory / 1024 / 1024),
        },
        cpu: {
          value: this.resourceUsage.peakCpu,
          percentage: Math.round(this.resourceUsage.peakCpu * 10) / 10,
        },
      },
      averages: this.calculateAverages(recentSamples),
      operations: {
        active: this.activeOperations.size,
        stats: { ...this.operationStats },
        recent: recentOperations.slice(-10),
        performance: this.analyzeOperationPerformance(),
      },
      trends: this.analyzeTrends(recentSamples),
      alerts: {
        recent: this.alertHistory.slice(-10),
        summary: this.summarizeAlerts(),
      },
      recommendations: this.generatePerformanceRecommendations(),
      grade: this.calculatePerformanceGrade(),
    };
  }

  /**
   * Calculate averages from samples
   * @param {Array} samples - Performance samples
   * @returns {Object} Average metrics
   */
  calculateAverages(samples) {
    if (samples.length === 0) {
      return { memory: 0, cpu: 0, operations: 0 };
    }

    const totals = samples.reduce(
      (acc, sample) => ({
        memory: acc.memory + sample.memory.heapUsed,
        cpu: acc.cpu + sample.cpu.usage,
        operations: acc.operations + sample.operations,
      }),
      { memory: 0, cpu: 0, operations: 0 }
    );

    return {
      memory: {
        value: totals.memory / samples.length,
        valueMB: Math.round(totals.memory / samples.length / 1024 / 1024),
      },
      cpu: {
        value: totals.cpu / samples.length,
        percentage: Math.round((totals.cpu / samples.length) * 10) / 10,
      },
      operations: Math.round(totals.operations / samples.length),
    };
  }

  /**
   * Analyze operation performance
   * @returns {Object} Operation performance analysis
   */
  analyzeOperationPerformance() {
    const analysis = {};

    for (const [type, stats] of Object.entries(this.operationStats)) {
      if (stats.count === 0) {
        continue;
      }

      const benchmark = this.performanceBenchmarks[type];
      let grade = 'unknown';

      if (benchmark) {
        if (stats.avgTime <= benchmark.excellent) {
          grade = 'excellent';
        } else if (stats.avgTime <= benchmark.good) {
          grade = 'good';
        } else if (stats.avgTime <= benchmark.poor) {
          grade = 'fair';
        } else {
          grade = 'poor';
        }
      }

      analysis[type] = {
        ...stats,
        successRate: stats.count > 0 ? (stats.count - stats.failures) / stats.count : 0,
        grade,
        benchmark: benchmark || null,
      };
    }

    return analysis;
  }

  /**
   * Analyze performance trends
   * @param {Array} samples - Recent samples
   * @returns {Object} Trend analysis
   */
  analyzeTrends(samples) {
    if (samples.length < 5) {
      return { memory: 'insufficient_data', cpu: 'insufficient_data' };
    }

    const midpoint = Math.floor(samples.length / 2);
    const firstHalf = samples.slice(0, midpoint);
    const secondHalf = samples.slice(midpoint);

    const firstMemory = firstHalf.reduce((sum, s) => sum + s.memory.heapUsed, 0) / firstHalf.length;
    const secondMemory = secondHalf.reduce((sum, s) => sum + s.memory.heapUsed, 0) / secondHalf.length;

    const firstCpu = firstHalf.reduce((sum, s) => sum + s.cpu.usage, 0) / firstHalf.length;
    const secondCpu = secondHalf.reduce((sum, s) => sum + s.cpu.usage, 0) / secondHalf.length;

    const getTrend = (first, second) => {
      const change = ((second - first) / first) * 100;
      if (Math.abs(change) < 5) {
        return 'stable';
      }
      return change > 0 ? 'increasing' : 'decreasing';
    };

    return {
      memory: {
        trend: getTrend(firstMemory, secondMemory),
        change: Math.round(((secondMemory - firstMemory) / firstMemory) * 100 * 10) / 10,
      },
      cpu: {
        trend: getTrend(firstCpu, secondCpu),
        change: Math.round(((secondCpu - firstCpu) / firstCpu) * 100 * 10) / 10,
      },
    };
  }

  /**
   * Summarize alert history
   * @returns {Object} Alert summary
   */
  summarizeAlerts() {
    const recentAlerts = this.alertHistory.filter(
      alert => Date.now() - alert.timestamp < 3600000 // Last hour
    );

    const byType = recentAlerts.reduce((acc, alert) => {
      acc[alert.type] = (acc[alert.type] || 0) + 1;
      return acc;
    }, {});

    const bySeverity = recentAlerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {});

    return {
      total: recentAlerts.length,
      byType,
      bySeverity,
      lastAlert: this.alertHistory.length > 0 ? this.alertHistory[this.alertHistory.length - 1] : null,
    };
  }

  /**
   * Generate performance recommendations
   * @returns {Array} Performance recommendations
   */
  generatePerformanceRecommendations() {
    const recommendations = [];
    const recentSamples = this.samples.slice(-10);

    // Memory recommendations
    const avgMemory =
      recentSamples.length > 0
        ? recentSamples.reduce((sum, s) => sum + s.memory.heapUsed, 0) / recentSamples.length
        : 0;

    if (avgMemory > this.alertThresholds.memoryUsage * 0.8) {
      recommendations.push({
        type: 'memory_optimization',
        priority: 'high',
        message: 'Memory usage is approaching threshold, consider optimizing browser profiles',
        action: 'optimize_memory_usage',
      });
    }

    // Operation performance recommendations
    for (const [type, stats] of Object.entries(this.operationStats)) {
      const benchmark = this.performanceBenchmarks[type];
      if (benchmark && stats.avgTime > benchmark.good && stats.count > 5) {
        recommendations.push({
          type: 'operation_optimization',
          priority: 'medium',
          message: `${type} operations are slower than expected (avg: ${Math.round(stats.avgTime)}ms)`,
          action: `optimize_${type}_operations`,
        });
      }
    }

    // Failure rate recommendations
    for (const [type, stats] of Object.entries(this.operationStats)) {
      if (stats.count > 0) {
        const failureRate = stats.failures / stats.count;
        if (failureRate > 0.1) {
          // More than 10% failure rate
          recommendations.push({
            type: 'reliability_improvement',
            priority: 'high',
            message: `High failure rate for ${type} operations (${Math.round(failureRate * 100)}%)`,
            action: `improve_${type}_reliability`,
          });
        }
      }
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Calculate overall performance grade
   * @returns {string} Performance grade (A-F)
   */
  calculatePerformanceGrade() {
    const factors = [];

    // Memory efficiency
    const memoryUsageMB = this.currentMetrics.memoryUsage / 1024 / 1024;
    if (memoryUsageMB < this.performanceBenchmarks.memory.excellent) {
      factors.push(90);
    } else if (memoryUsageMB < this.performanceBenchmarks.memory.good) {
      factors.push(75);
    } else if (memoryUsageMB < this.performanceBenchmarks.memory.poor) {
      factors.push(60);
    } else {
      factors.push(40);
    }

    // CPU efficiency
    if (this.currentMetrics.cpuUsage < this.performanceBenchmarks.cpu.excellent) {
      factors.push(90);
    } else if (this.currentMetrics.cpuUsage < this.performanceBenchmarks.cpu.good) {
      factors.push(75);
    } else if (this.currentMetrics.cpuUsage < this.performanceBenchmarks.cpu.poor) {
      factors.push(60);
    } else {
      factors.push(40);
    }

    // Operation performance
    let operationScore = 85; // Default good score
    for (const [type, stats] of Object.entries(this.operationStats)) {
      if (stats.count > 0) {
        const successRate = (stats.count - stats.failures) / stats.count;
        if (successRate < 0.9) {
          operationScore -= 15;
        } else if (successRate < 0.95) {
          operationScore -= 5;
        }
      }
    }
    factors.push(Math.max(0, operationScore));

    const average = factors.reduce((sum, score) => sum + score, 0) / factors.length;

    if (average >= 85) {
      return 'A';
    }
    if (average >= 75) {
      return 'B';
    }
    if (average >= 65) {
      return 'C';
    }
    if (average >= 55) {
      return 'D';
    }
    return 'F';
  }

  /**
   * Generate unique operation ID
   * @returns {string} Operation ID
   */
  generateOperationId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `OP_${timestamp}_${random}`;
  }

  /**
   * Generate unique alert ID
   * @returns {string} Alert ID
   */
  generateAlertId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `PA_${timestamp}_${random}`;
  }

  /**
   * Get current monitoring status
   * @returns {Object} Monitoring status
   */
  getStatus() {
    return {
      monitoring: this.monitoringActive,
      samples: this.samples.length,
      operations: {
        active: this.activeOperations.size,
        completed: this.operationHistory.length,
      },
      alerts: this.alertHistory.length,
      current: { ...this.currentMetrics },
      thresholds: { ...this.alertThresholds },
    };
  }

  /**
   * Reset performance monitoring state
   */
  reset() {
    this.samples = [];
    this.operationHistory = [];
    this.alertHistory = [];
    this.activeOperations.clear();

    // Reset statistics
    for (const type of Object.keys(this.operationStats)) {
      this.operationStats[type] = { count: 0, totalTime: 0, avgTime: 0, failures: 0 };
    }

    this.resourceUsage = {
      peakMemory: 0,
      peakCpu: 0,
      totalBrowserTime: 0,
      browserLaunches: 0,
      browserCrashes: 0,
    };

    this.logger.info('Performance monitor reset');
  }
}
