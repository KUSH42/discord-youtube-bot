import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { DependencyContainer } from '../../src/infrastructure/dependency-container.js';
import { Configuration } from '../../src/infrastructure/configuration.js';
import { setupProductionServices } from '../../src/setup/production-setup.js';
import { ScraperApplication } from '../../src/application/scraper-application.js';

describe('Browser Service Dependency Injection', () => {
  let container;
  let config;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = process.env;
    
    // Set up test environment
    process.env = {
      ...originalEnv,
      DISCORD_BOT_TOKEN: 'test-token',
      YOUTUBE_API_KEY: 'test-key',
      YOUTUBE_CHANNEL_ID: 'UCabcdefghijklmnopqrstuv',
      DISCORD_YOUTUBE_CHANNEL_ID: '123456789012345678',
      DISCORD_X_POSTS_CHANNEL_ID: '123456789012345678',
      DISCORD_X_REPLIES_CHANNEL_ID: '123456789012345678',
      DISCORD_X_RETWEETS_CHANNEL_ID: '123456789012345678',
      DISCORD_X_QUOTES_CHANNEL_ID: '123456789012345678',
      DISCORD_BOT_SUPPORT_LOG_CHANNEL: '123456789012345678',
      ALLOWED_USER_IDS: '123456789012345678',
      PSH_SECRET: 'test-secret',
      PSH_CALLBACK_URL: 'http://test.com/webhook',
      X_USER_HANDLE: 'testuser',
      TWITTER_USERNAME: 'testuser',
      TWITTER_PASSWORD: 'testpass'
    };

    container = new DependencyContainer();
    config = new Configuration();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    
    // Clean up container
    if (container) {
      container.dispose();
    }
  });

  describe('Browser Service Registration', () => {
    it('should register browser service in container', async () => {
      await setupProductionServices(container, config);
      
      const browserService = container.resolve('browserService');
      expect(browserService).toBeDefined();
      expect(browserService).toHaveProperty('launch');
      expect(browserService).toHaveProperty('close');
      expect(browserService).toHaveProperty('isRunning');
    });

    it('should inject browser service into scraper application', async () => {
      await setupProductionServices(container, config);
      
      const scraperApp = container.resolve('scraperApplication');
      expect(scraperApp).toBeDefined();
      expect(scraperApp.browser).toBeDefined();
      expect(scraperApp.browser).not.toBeNull();
    });

    it('should provide browser service with required methods', async () => {
      await setupProductionServices(container, config);
      
      const browserService = container.resolve('browserService');
      
      // Check all required methods exist
      const requiredMethods = [
        'launch', 'newPage', 'goto', 'waitForSelector', 'waitForNavigation',
        'evaluate', 'type', 'click', 'getTextContent', 'getAttribute',
        'screenshot', 'setCookies', 'getCookies', 'setUserAgent',
        'setViewport', 'waitFor', 'getContent', 'getCurrentUrl',
        'elementExists', 'getElements', 'closePage', 'close', 'isRunning'
      ];
      
      for (const method of requiredMethods) {
        expect(browserService).toHaveProperty(method);
        expect(typeof browserService[method]).toBe('function');
      }
    });
  });

  describe('Scraper Application Browser Integration', () => {
    it('should fail gracefully when browser service is null', () => {
      // Test the old behavior to ensure we catch it
      expect(() => {
        new ScraperApplication({
          browserService: null,
          contentClassifier: {},
          contentAnnouncer: {},
          config: config,
          stateManager: { get: () => ({}) },
          eventBus: { emit: jest.fn() },
          logger: { info: jest.fn(), error: jest.fn() }
        });
      }).not.toThrow();
    });

    it('should throw error when trying to start with null browser service', async () => {
      const scraperApp = new ScraperApplication({
        browserService: null,
        contentClassifier: {},
        contentAnnouncer: {},
        config: config,
        stateManager: { get: () => ({}) },
        eventBus: { emit: jest.fn() },
        logger: { info: jest.fn(), error: jest.fn() }
      });

      await expect(scraperApp.start()).rejects.toThrow();
    });

    it('should successfully initialize with proper browser service', async () => {
      await setupProductionServices(container, config);
      
      const scraperApp = container.resolve('scraperApplication');
      expect(scraperApp.browser).toBeDefined();
      expect(scraperApp.browser).not.toBeNull();
      expect(typeof scraperApp.browser.launch).toBe('function');
    });
  });

  describe('Browser Service Lifecycle', () => {
    it('should start browser service in not running state', async () => {
      await setupProductionServices(container, config);
      
      const browserService = container.resolve('browserService');
      expect(browserService.isRunning()).toBe(false);
    });

    it('should handle browser service disposal', async () => {
      await setupProductionServices(container, config);
      
      const browserService = container.resolve('browserService');
      
      // Should not throw when disposing
      await expect(browserService.dispose()).resolves.not.toThrow();
    });
  });

  describe('Configuration Validation', () => {
    it('should validate X scraper configuration requirements', () => {
      expect(config.get('X_USER_HANDLE')).toBe('testuser');
      expect(config.get('TWITTER_USERNAME')).toBe('testuser');
      expect(config.get('TWITTER_PASSWORD')).toBe('testpass');
    });

    it('should catch missing browser service configuration', async () => {
      // Mock setupProductionServices to not register browser service
      const brokenContainer = new DependencyContainer();
      
      // Register everything except browser service
      brokenContainer.registerSingleton('scraperApplication', () => {
        return new ScraperApplication({
          browserService: null, // This should cause issues
          contentClassifier: {},
          contentAnnouncer: {},
          config: config,
          stateManager: { get: () => ({}) },
          eventBus: { emit: jest.fn() },
          logger: { info: jest.fn(), error: jest.fn() }
        });
      });
      
      const scraperApp = brokenContainer.resolve('scraperApplication');
      
      // Should fail when trying to start
      await expect(scraperApp.start()).rejects.toThrow();
    });
  });
});