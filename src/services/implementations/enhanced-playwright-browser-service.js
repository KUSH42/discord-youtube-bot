import { chromium } from 'playwright';
import { BrowserService } from '../interfaces/browser-service.js';
import { UserAgentManager } from '../browser-stealth/user-agent-manager.js';
import { HumanBehaviorSimulator } from '../browser-stealth/human-behavior-simulator.js';
import { IntelligentRateLimiter } from '../browser-stealth/intelligent-rate-limiter.js';
import { BrowserProfileManager } from '../browser-stealth/browser-profile-manager.js';
import {
  STEALTH_SCRIPTS,
  STEALTH_BROWSER_ARGS,
  IGNORE_DEFAULT_ARGS,
  getStealthHeaders,
} from '../browser-stealth/stealth-scripts.js';

/**
 * Enhanced Playwright Browser Service with advanced anti-detection capabilities
 * Integrates all stealth components for maximum detection resilience
 */
export class EnhancedPlaywrightBrowserService extends BrowserService {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;

    // Core browser components
    this.browser = null;
    this.context = null;
    this.page = null;

    // Anti-detection components
    this.userAgentManager = new UserAgentManager();
    this.behaviorSimulator = null;
    this.rateLimiter = new IntelligentRateLimiter(config, logger);
    this.profileManager = new BrowserProfileManager('./browser-profiles', logger);

    // State management
    this.isInitialized = false;
    this.currentProfile = null;
    this.stealthEnabled = config.get('BROWSER_STEALTH_ENABLED', true);
    this.behaviorSimulationEnabled = config.get('BEHAVIOR_SIMULATION_ENABLED', true);

    // Performance monitoring
    this.metrics = {
      totalNavigations: 0,
      successfulNavigations: 0,
      detectionIncidents: 0,
      averageResponseTime: 0,
      totalResponseTime: 0,
    };
  }

  /**
   * Initialize the enhanced browser service
   * @param {Object} options - Initialization options
   * @returns {Promise<void>}
   */
  async initialize(options = {}) {
    try {
      this.logger.info('Initializing Enhanced Playwright Browser Service');

      // Initialize profile manager
      await this.profileManager.initialize();

      // Get or create profile for current purpose
      const purpose = options.purpose || 'x-monitoring';
      this.currentProfile = await this.profileManager.getOrCreateProfile(purpose, {
        userAgent: this.userAgentManager.getCurrentUserAgent(),
        viewport: this.userAgentManager.getMatchingViewport(),
      });

      // Launch browser with stealth configuration
      await this.launchBrowser();

      this.isInitialized = true;
      this.logger.info('Enhanced Browser Service initialized successfully', {
        profile: this.currentProfile,
        stealthEnabled: this.stealthEnabled,
        behaviorSimulationEnabled: this.behaviorSimulationEnabled,
      });
    } catch (error) {
      this.logger.error('Failed to initialize Enhanced Browser Service', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Launch browser with enhanced stealth configuration
   * @returns {Promise<void>}
   */
  async launchBrowser() {
    const userAgent = this.userAgentManager.getCurrentUserAgent();
    const viewport = this.userAgentManager.getMatchingViewport(userAgent);
    const acceptLanguage = this.userAgentManager.getAcceptLanguage(userAgent);

    // Get base browser options from profile manager
    const baseOptions = this.profileManager.getBrowserOptions(this.currentProfile);

    // Enhanced launch options with stealth features
    const launchOptions = {
      ...baseOptions,
      headless: this.config.get('BROWSER_HEADLESS', false), // Default to headful for better stealth
      args: [
        ...(baseOptions.args || []),
        ...(this.stealthEnabled ? STEALTH_BROWSER_ARGS : []),
        `--user-agent=${userAgent}`,
      ],
      ignoreDefaultArgs: this.stealthEnabled ? IGNORE_DEFAULT_ARGS : false,
    };

    this.logger.debug('Launching browser with stealth configuration', {
      userAgent,
      viewport,
      stealthEnabled: this.stealthEnabled,
      argsCount: launchOptions.args.length,
    });

    this.browser = await chromium.launch(launchOptions);

    // Create browser context with stealth headers
    this.context = await this.browser.newContext({
      userAgent,
      viewport,
      locale: 'en-US',
      colorScheme: 'light',
      extraHTTPHeaders: this.stealthEnabled ? getStealthHeaders(userAgent, acceptLanguage) : {},
      // Geolocation spoofing (New York coordinates)
      geolocation: { longitude: -74.006, latitude: 40.7128 },
      permissions: ['geolocation'],
    });

    // Create new page
    this.page = await this.context.newPage();

    // Apply stealth scripts if enabled
    if (this.stealthEnabled) {
      await this.page.addInitScript(STEALTH_SCRIPTS);
    }

    // Initialize behavior simulator
    if (this.behaviorSimulationEnabled) {
      this.behaviorSimulator = new HumanBehaviorSimulator(this.page, this.logger);
    }

    // Restore previous session
    await this.profileManager.restoreSession(this.currentProfile, this.page);
  }

  /**
   * Navigate to URL with intelligent rate limiting and behavior simulation
   * @param {string} url - URL to navigate to
   * @param {Object} options - Navigation options
   * @returns {Promise<Object>} Navigation response
   */
  async goto(url, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Enhanced Browser Service not initialized');
    }

    const startTime = Date.now();

    try {
      // Apply intelligent rate limiting
      await this.rateLimiter.waitForNextRequest();
      this.rateLimiter.recordRequest(true);

      let response;

      if (this.behaviorSimulationEnabled && this.behaviorSimulator) {
        // Use behavior simulator for realistic navigation
        response = await this.behaviorSimulator.simulateRealisticPageLoad(url, options);
      } else {
        // Standard navigation
        response = await this.page.goto(url, {
          waitUntil: 'networkidle0',
          timeout: 30000,
          ...options,
        });
      }

      // Update metrics
      const responseTime = Date.now() - startTime;
      this.updateMetrics(true, responseTime);

      // Save session periodically
      if (this.metrics.totalNavigations % 10 === 0) {
        await this.profileManager.saveSession(this.currentProfile, this.page);
      }

      this.logger.debug('Navigation completed', {
        url,
        responseTime,
        status: response?.status(),
        behaviorSimulation: this.behaviorSimulationEnabled,
      });

      return response;
    } catch (error) {
      // Handle potential detection incident
      this.handleNavigationError(error, url);

      // Update metrics
      const responseTime = Date.now() - startTime;
      this.updateMetrics(false, responseTime);

      throw error;
    }
  }

  /**
   * Handle navigation errors and potential detection incidents
   * @param {Error} error - Navigation error
   * @param {string} url - URL that failed
   */
  handleNavigationError(error, url) {
    const errorMessage = error.message.toLowerCase();

    // Check for potential detection indicators
    const detectionIndicators = [
      'blocked',
      'captcha',
      'forbidden',
      'access denied',
      'too many requests',
      'rate limit',
      'bot detected',
    ];

    const isPotentialDetection = detectionIndicators.some(indicator => errorMessage.includes(indicator));

    if (isPotentialDetection) {
      this.logger.warn('Potential detection incident detected', {
        url,
        error: error.message,
        userAgent: this.userAgentManager.getCurrentUserAgent(),
      });

      this.metrics.detectionIncidents++;
      this.rateLimiter.recordRequest(false); // Record as failed request
    } else {
      this.logger.error('Navigation error', {
        url,
        error: error.message,
      });
    }
  }

  /**
   * Update performance metrics
   * @param {boolean} successful - Whether the request was successful
   * @param {number} responseTime - Response time in milliseconds
   */
  updateMetrics(successful, responseTime) {
    this.metrics.totalNavigations++;
    this.metrics.totalResponseTime += responseTime;
    this.metrics.averageResponseTime = this.metrics.totalResponseTime / this.metrics.totalNavigations;

    if (successful) {
      this.metrics.successfulNavigations++;
    }
  }

  /**
   * Rotate user agent and refresh browser configuration
   * @returns {Promise<void>}
   */
  async rotateUserAgent() {
    const newUserAgent = this.userAgentManager.rotateUserAgent();
    const newViewport = this.userAgentManager.getMatchingViewport(newUserAgent);

    this.logger.info('Rotating user agent', {
      oldUserAgent: this.userAgentManager.userAgentPool[this.userAgentManager.currentIndex - 1],
      newUserAgent,
      newViewport,
    });

    // Update context user agent and viewport
    if (this.page) {
      await this.page.setExtraHTTPHeaders({
        'User-Agent': newUserAgent,
      });
      await this.page.setViewportSize(newViewport);
    }
  }

  /**
   * Force emergency mode for extended cooling period
   * @param {number} duration - Duration in milliseconds
   */
  setEmergencyMode(duration = 3600000) {
    this.rateLimiter.setEmergencyMode(true, duration);
    this.logger.warn('Emergency mode activated', { duration });
  }

  /**
   * Get comprehensive status information
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      healthy: this.isHealthy(),
      profile: this.currentProfile,
      userAgent: this.userAgentManager.getRotationStatus(),
      rateLimiter: this.rateLimiter.getStatus(),
      metrics: { ...this.metrics },
      profileStats: this.profileManager.getProfileStats(),
      stealthEnabled: this.stealthEnabled,
      behaviorSimulationEnabled: this.behaviorSimulationEnabled,
    };
  }

  /**
   * Update behavior configuration
   * @param {Object} config - New behavior configuration
   */
  updateBehaviorConfig(config) {
    if (this.behaviorSimulator) {
      this.behaviorSimulator.updateConfig(config);
      this.logger.info('Behavior configuration updated', { config });
    }
  }

  /**
   * Clean up expired profiles
   * @returns {Promise<number>} Number of profiles cleaned up
   */
  async cleanupProfiles() {
    return await this.profileManager.cleanupExpiredProfiles();
  }

  // Enhanced implementations of base class methods with stealth features

  /**
   * Type text with human-like behavior
   * @param {string} selector - CSS selector
   * @param {string} text - Text to type
   * @param {Object} options - Type options
   * @returns {Promise<void>}
   */
  async type(selector, text, options = {}) {
    if (!this.page) {
      throw new Error('No page available');
    }

    if (this.behaviorSimulationEnabled && this.behaviorSimulator) {
      await this.behaviorSimulator.simulateTyping(selector, text, options);
    } else {
      await this.page.fill(selector, text, options);
    }
  }

  /**
   * Click element with human-like behavior
   * @param {string} selector - CSS selector
   * @param {Object} options - Click options
   * @returns {Promise<void>}
   */
  async click(selector, options = {}) {
    if (!this.page) {
      throw new Error('No page available');
    }

    if (this.behaviorSimulationEnabled && this.behaviorSimulator) {
      await this.behaviorSimulator.simulateClick(selector, options);
    } else {
      await this.page.click(selector, options);
    }
  }

  /**
   * Wait for selector with enhanced error handling
   * @param {string} selector - CSS selector
   * @param {Object} options - Wait options
   * @returns {Promise<Object>} Element handle
   */
  async waitForSelector(selector, options = {}) {
    if (!this.page || this.page.isClosed()) {
      throw new Error('Page not available or closed');
    }
    return await this.page.waitForSelector(selector, options);
  }

  /**
   * Evaluate JavaScript with error handling
   * @param {string|Function} script - JavaScript code or function
   * @param {...*} args - Arguments to pass to the function
   * @returns {Promise<*>} Result of the script execution
   */
  async evaluate(script, ...args) {
    if (!this.page || this.page.isClosed()) {
      throw new Error('Page not available or closed');
    }
    return await this.page.evaluate(script, ...args);
  }

  /**
   * Get text content with error handling
   * @param {string} selector - CSS selector
   * @returns {Promise<string>} Text content
   */
  async getTextContent(selector) {
    if (!this.page || this.page.isClosed()) {
      throw new Error('Page not available or closed');
    }
    return await this.page.textContent(selector);
  }

  /**
   * Get attribute with error handling
   * @param {string} selector - CSS selector
   * @param {string} attribute - Attribute name
   * @returns {Promise<string|null>} Attribute value
   */
  async getAttribute(selector, attribute) {
    if (!this.page || this.page.isClosed()) {
      throw new Error('Page not available or closed');
    }
    return await this.page.getAttribute(selector, attribute);
  }

  /**
   * Get multiple elements with error handling
   * @param {string} selector - CSS selector
   * @returns {Promise<Array<Object>>} Array of element handles
   */
  async getElements(selector) {
    if (!this.page || this.page.isClosed()) {
      throw new Error('Page not available or closed');
    }
    return await this.page.$$(selector);
  }

  /**
   * Check if element exists with error handling
   * @param {string} selector - CSS selector
   * @returns {Promise<boolean>} True if element exists
   */
  async elementExists(selector) {
    if (!this.page || this.page.isClosed()) {
      return false;
    }
    try {
      await this.page.waitForSelector(selector, { timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current URL with error handling
   * @returns {Promise<string>} Current URL
   */
  async getCurrentUrl() {
    if (!this.page || this.page.isClosed()) {
      throw new Error('Page not available or closed');
    }
    return this.page.url();
  }

  /**
   * Get page content with error handling
   * @returns {Promise<string>} Page HTML content
   */
  async getContent() {
    if (!this.page || this.page.isClosed()) {
      throw new Error('Page not available or closed');
    }
    return await this.page.content();
  }

  /**
   * Set cookies with error handling
   * @param {Array<Object>} cookies - Array of cookie objects
   * @returns {Promise<void>}
   */
  async setCookies(cookies) {
    if (!this.context) {
      throw new Error('No browser context available');
    }
    await this.context.addCookies(cookies);
  }

  /**
   * Get cookies with error handling
   * @param {Array<string>} urls - URLs to get cookies for (optional)
   * @returns {Promise<Array<Object>>} Array of cookie objects
   */
  async getCookies(urls = []) {
    if (!this.context) {
      throw new Error('No browser context available');
    }
    return await this.context.cookies(urls);
  }

  /**
   * Take screenshot with error handling
   * @param {Object} options - Screenshot options
   * @returns {Promise<Buffer>} Screenshot buffer
   */
  async screenshot(options = {}) {
    if (!this.page || this.page.isClosed()) {
      throw new Error('Page not available or closed');
    }
    return await this.page.screenshot(options);
  }

  /**
   * Wait for specified time using setTimeout (safer than page.waitForTimeout)
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise<void>}
   */
  async waitFor(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if browser and page are healthy and ready for use
   * @returns {boolean} True if browser is healthy
   */
  isHealthy() {
    try {
      return (
        this.isInitialized &&
        this.browser &&
        this.browser.isConnected() &&
        this.context &&
        this.page &&
        !this.page.isClosed()
      );
    } catch {
      return false;
    }
  }

  /**
   * Check if browser is running
   * @returns {boolean} True if browser is running
   */
  isRunning() {
    return this.browser !== null && this.isInitialized;
  }

  /**
   * Close page with session saving
   * @returns {Promise<void>}
   */
  async closePage() {
    try {
      if (this.page && !this.page.isClosed()) {
        // Save session before closing
        if (this.currentProfile) {
          await this.profileManager.saveSession(this.currentProfile, this.page);
        }
        await this.page.close();
      }
    } catch (error) {
      this.logger.error('Error closing page', { error: error.message });
    } finally {
      this.page = null;
    }
  }

  /**
   * Close browser with cleanup
   * @returns {Promise<void>}
   */
  async close() {
    try {
      this.logger.info('Closing Enhanced Browser Service');

      // Save final session
      if (this.page && !this.page.isClosed() && this.currentProfile) {
        await this.profileManager.saveSession(this.currentProfile, this.page);
      }

      // Close page
      if (this.page && !this.page.isClosed()) {
        await this.page.close();
      }

      // Close context
      if (this.context) {
        await this.context.close();
      }

      // Close browser
      if (this.browser && this.browser.isConnected()) {
        await this.browser.close();
      }

      // Log final metrics
      this.logger.info('Enhanced Browser Service closed', {
        finalMetrics: this.metrics,
        profileUsed: this.currentProfile,
      });
    } catch (error) {
      this.logger.error('Error during browser cleanup', {
        error: error.message,
      });
    } finally {
      // Reset state
      this.page = null;
      this.context = null;
      this.browser = null;
      this.isInitialized = false;
      this.currentProfile = null;
      this.behaviorSimulator = null;
    }
  }
}
