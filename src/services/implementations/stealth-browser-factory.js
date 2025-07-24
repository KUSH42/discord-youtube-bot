import { EnhancedPlaywrightBrowserService } from './enhanced-playwright-browser-service.js';
import { DetectionMonitor } from '../browser-stealth/detection-monitor.js';
import { PerformanceMonitor } from '../browser-stealth/performance-monitor.js';

/**
 * StealthBrowserFactory - Factory for creating and configuring enhanced browser services
 * Provides easy setup and configuration of all anti-detection components
 */
export class StealthBrowserFactory {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.detectionMonitor = null;
    this.performanceMonitor = null;
    this.browserService = null;
  }

  /**
   * Create and configure an enhanced browser service with all stealth components
   * @param {Object} options - Factory options
   * @returns {Promise<EnhancedPlaywrightBrowserService>} Configured browser service
   */
  async createStealthBrowser(options = {}) {
    try {
      this.logger.info('Creating stealth browser service');

      // Initialize monitoring components if enabled
      await this.initializeMonitoring();

      // Create enhanced browser service
      this.browserService = new EnhancedPlaywrightBrowserService(this.config, this.logger);

      // Apply configuration overrides
      if (options.stealthConfig) {
        this.applyStealthConfiguration(options.stealthConfig);
      }

      // Initialize the browser service
      await this.browserService.initialize(options);

      // Wire up monitoring integration
      await this.setupMonitoringIntegration();

      this.logger.info('Stealth browser service created successfully', {
        stealthEnabled: this.browserService.stealthEnabled,
        behaviorSimulation: this.browserService.behaviorSimulationEnabled,
        detectionMonitoring: this.detectionMonitor !== null,
        performanceMonitoring: this.performanceMonitor !== null,
      });

      return this.browserService;
    } catch (error) {
      this.logger.error('Failed to create stealth browser service', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Initialize monitoring components
   */
  async initializeMonitoring() {
    // Initialize detection monitoring
    const detectionConfig = this.config.getDetectionMonitoringConfig();
    if (detectionConfig.enabled) {
      this.detectionMonitor = new DetectionMonitor(this.logger, detectionConfig);

      // Register alert callbacks
      this.detectionMonitor.registerAlertCallback(alert => {
        this.handleDetectionAlert(alert);
      });
    }

    // Initialize performance monitoring
    const performanceConfig = this.config.getPerformanceMonitoringConfig();
    if (performanceConfig.enabled) {
      this.performanceMonitor = new PerformanceMonitor(this.logger, performanceConfig);

      // Register alert callbacks
      this.performanceMonitor.registerAlertCallback(alert => {
        this.handlePerformanceAlert(alert);
      });

      // Start monitoring
      this.performanceMonitor.startMonitoring();
    }
  }

  /**
   * Apply stealth configuration to browser service
   * @param {Object} stealthConfig - Stealth configuration overrides
   */
  applyStealthConfiguration(stealthConfig) {
    // This would apply any runtime configuration changes
    if (this.browserService && stealthConfig.behaviorConfig) {
      this.browserService.updateBehaviorConfig(stealthConfig.behaviorConfig);
    }
  }

  /**
   * Setup integration between browser service and monitoring components
   */
  async setupMonitoringIntegration() {
    if (!this.browserService) {
      return;
    }

    // Override browser service navigation to include monitoring
    const originalGoto = this.browserService.goto.bind(this.browserService);
    this.browserService.goto = async (url, options = {}) => {
      const startTime = Date.now();
      let operationId = null;

      try {
        // Start performance tracking
        if (this.performanceMonitor) {
          operationId = this.performanceMonitor.startOperation('navigation', {
            url,
            userAgent: this.browserService.userAgentManager.getCurrentUserAgent(),
          });
        }

        // Record request for detection monitoring
        if (this.detectionMonitor) {
          this.detectionMonitor.recordRequest(true, { url });
        }

        const result = await originalGoto(url, options);

        // End successful operation tracking
        if (this.performanceMonitor && operationId) {
          this.performanceMonitor.endOperation(operationId, true, {
            responseStatus: result?.status(),
            responseTime: Date.now() - startTime,
          });
        }

        return result;
      } catch (error) {
        // Handle failed navigation
        if (this.detectionMonitor) {
          this.detectionMonitor.recordRequest(false, {
            url,
            errorMessage: error.message,
            httpStatus: error.status || null,
            userAgent: this.browserService.userAgentManager.getCurrentUserAgent(),
          });
        }

        // End failed operation tracking
        if (this.performanceMonitor && operationId) {
          this.performanceMonitor.endOperation(operationId, false, {
            error: error.message,
            responseTime: Date.now() - startTime,
          });
        }

        throw error;
      }
    };
  }

  /**
   * Handle detection alerts
   * @param {Object} alert - Detection alert
   */
  handleDetectionAlert(alert) {
    this.logger.warn('Detection alert received', alert);

    // Apply automatic responses based on alert type
    if (this.browserService && alert.type === 'incident_threshold') {
      this.logger.info('Activating emergency mode due to detection incidents');
      this.browserService.setEmergencyMode();
    }

    if (this.browserService && alert.type === 'critical_incident') {
      this.logger.info('Rotating user agent due to critical detection');
      this.browserService.rotateUserAgent();
    }

    // Additional automated responses could be added here
    this.executeAutomatedResponse(alert);
  }

  /**
   * Handle performance alerts
   * @param {Object} alert - Performance alert
   */
  handlePerformanceAlert(alert) {
    this.logger.warn('Performance alert received', alert);

    // Apply automatic performance optimizations
    if (alert.type === 'memory_usage' && this.browserService) {
      this.logger.info('Triggering profile cleanup due to memory usage');
      this.browserService.cleanupProfiles();
    }

    // Log performance recommendations
    if (this.performanceMonitor) {
      const report = this.performanceMonitor.getPerformanceReport();
      if (report.recommendations.length > 0) {
        this.logger.info('Performance recommendations available', {
          recommendations: report.recommendations.slice(0, 3), // Top 3 recommendations
        });
      }
    }
  }

  /**
   * Execute automated response to detection incidents
   * @param {Object} alert - Detection alert
   */
  executeAutomatedResponse(alert) {
    if (!this.browserService) {
      return;
    }

    // Get recommendations from detection monitor
    if (this.detectionMonitor) {
      const analysis = this.detectionMonitor.getDetectionAnalysis();

      for (const recommendation of analysis.recommendations.slice(0, 2)) {
        this.logger.info('Executing automated response', {
          type: recommendation.type,
          action: recommendation.action,
        });

        // Execute specific actions
        switch (recommendation.action) {
          case 'rotateUserAgent':
            this.browserService.rotateUserAgent();
            break;
          case 'setEmergencyMode':
            this.browserService.setEmergencyMode();
            break;
          case 'refreshBrowserProfile':
            // This could trigger a profile refresh
            this.logger.info('Browser profile refresh recommended');
            break;
          default:
            this.logger.debug('Unknown automated action', { action: recommendation.action });
        }
      }
    }
  }

  /**
   * Get comprehensive status of all components
   * @returns {Object} Combined status information
   */
  getStatus() {
    const status = {
      browserService: this.browserService ? this.browserService.getStatus() : null,
      detectionMonitor: this.detectionMonitor ? this.detectionMonitor.getStatus() : null,
      performanceMonitor: this.performanceMonitor ? this.performanceMonitor.getStatus() : null,
      integration: {
        monitoringSetup: this.detectionMonitor !== null || this.performanceMonitor !== null,
        automaticResponses: true,
        alertCallbacks: {
          detection: this.detectionMonitor ? this.detectionMonitor.alertCallbacks.length : 0,
          performance: this.performanceMonitor ? this.performanceMonitor.alertCallbacks.length : 0,
        },
      },
    };

    return status;
  }

  /**
   * Get detection analysis report
   * @returns {Object} Detection analysis
   */
  getDetectionAnalysis() {
    return this.detectionMonitor ? this.detectionMonitor.getDetectionAnalysis() : null;
  }

  /**
   * Get performance report
   * @returns {Object} Performance report
   */
  getPerformanceReport() {
    return this.performanceMonitor ? this.performanceMonitor.getPerformanceReport() : null;
  }

  /**
   * Cleanup all components
   */
  async cleanup() {
    try {
      this.logger.info('Cleaning up stealth browser factory');

      // Stop performance monitoring
      if (this.performanceMonitor) {
        this.performanceMonitor.stopMonitoring();
      }

      // Close browser service
      if (this.browserService) {
        await this.browserService.close();
      }

      // Reset references
      this.browserService = null;
      this.detectionMonitor = null;
      this.performanceMonitor = null;

      this.logger.info('Stealth browser factory cleanup completed');
    } catch (error) {
      this.logger.error('Error during stealth browser factory cleanup', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Create a simple stealth browser with minimal configuration
   * @param {Object} options - Simple options
   * @returns {Promise<EnhancedPlaywrightBrowserService>} Browser service
   */
  async createSimpleStealthBrowser(options = {}) {
    const simpleOptions = {
      purpose: options.purpose || 'general',
      stealthConfig: {
        behaviorConfig: {
          mouseMovements: { enabled: true },
          scrolling: { enabled: true },
          reading: { enabled: true },
          interaction: { enabled: true },
        },
      },
      monitoring: {
        detection: true,
        performance: true,
      },
      ...options,
    };

    return await this.createStealthBrowser(simpleOptions);
  }

  /**
   * Create a high-stealth browser for critical operations
   * @param {Object} options - High-stealth options
   * @returns {Promise<EnhancedPlaywrightBrowserService>} Browser service
   */
  async createHighStealthBrowser(options = {}) {
    const highStealthOptions = {
      purpose: options.purpose || 'high-stealth',
      stealthConfig: {
        behaviorConfig: {
          mouseMovements: {
            enabled: true,
            minMovements: 3,
            maxMovements: 8,
          },
          scrolling: {
            enabled: true,
            probability: 0.9,
          },
          reading: {
            enabled: true,
            comprehensionFactor: 0.8,
          },
          interaction: {
            enabled: true,
            hoverProbability: 0.5,
          },
        },
      },
      monitoring: {
        detection: true,
        performance: true,
      },
      ...options,
    };

    return await this.createStealthBrowser(highStealthOptions);
  }
}
