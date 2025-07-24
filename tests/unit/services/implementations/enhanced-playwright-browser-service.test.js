import { jest } from '@jest/globals';
import { EnhancedPlaywrightBrowserService } from '../../../../src/services/implementations/enhanced-playwright-browser-service.js';

// Mock Playwright
const mockPage = {
  goto: jest.fn(),
  addInitScript: jest.fn(),
  setExtraHTTPHeaders: jest.fn(),
  setViewportSize: jest.fn(),
  fill: jest.fn(),
  click: jest.fn(),
  waitForSelector: jest.fn(),
  evaluate: jest.fn(),
  textContent: jest.fn(),
  getAttribute: jest.fn(),
  $$: jest.fn(),
  url: jest.fn(),
  content: jest.fn(),
  screenshot: jest.fn(),
  close: jest.fn(),
  isClosed: jest.fn(() => false),
};

const mockContext = {
  newPage: jest.fn(() => mockPage),
  addCookies: jest.fn(),
  cookies: jest.fn(),
  close: jest.fn(),
};

const mockBrowser = {
  newContext: jest.fn(() => mockContext),
  isConnected: jest.fn(() => true),
  close: jest.fn(),
};

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn(() => mockBrowser),
  },
}));

// Mock stealth components
jest.mock('../../../../src/services/browser-stealth/user-agent-manager.js', () => ({
  UserAgentManager: jest.fn().mockImplementation(() => ({
    getCurrentUserAgent: jest.fn(() => 'test-user-agent'),
    getMatchingViewport: jest.fn(() => ({ width: 1920, height: 1080 })),
    getAcceptLanguage: jest.fn(() => 'en-US,en;q=0.9'),
    rotateUserAgent: jest.fn(() => 'new-user-agent'),
    getRotationStatus: jest.fn(() => ({ current: 'test-user-agent', rotationCount: 1 })),
    userAgentPool: ['agent1', 'agent2'],
    currentIndex: 1,
  })),
}));

jest.mock('../../../../src/services/browser-stealth/human-behavior-simulator.js', () => ({
  HumanBehaviorSimulator: jest.fn().mockImplementation(() => ({
    simulateRealisticPageLoad: jest.fn(),
    simulateTyping: jest.fn(),
    simulateClick: jest.fn(),
    updateConfig: jest.fn(),
  })),
}));

jest.mock('../../../../src/services/browser-stealth/intelligent-rate-limiter.js', () => ({
  IntelligentRateLimiter: jest.fn().mockImplementation(() => ({
    waitForNextRequest: jest.fn(),
    recordRequest: jest.fn(),
    setEmergencyMode: jest.fn(),
    getStatus: jest.fn(() => ({ enabled: true, mode: 'active' })),
  })),
}));

jest.mock('../../../../src/services/browser-stealth/browser-profile-manager.js', () => ({
  BrowserProfileManager: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    getOrCreateProfile: jest.fn(() => 'test-profile'),
    getBrowserOptions: jest.fn(() => ({ args: ['--test-arg'] })),
    restoreSession: jest.fn(),
    saveSession: jest.fn(),
    getProfileStats: jest.fn(() => ({ totalProfiles: 1 })),
    cleanupExpiredProfiles: jest.fn(() => 2),
  })),
}));

describe('EnhancedPlaywrightBrowserService', () => {
  let service;
  let mockConfig;
  let mockLogger;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      get: jest
        .fn()
        .mockReturnValueOnce(true) // BROWSER_STEALTH_ENABLED
        .mockReturnValueOnce(true) // BEHAVIOR_SIMULATION_ENABLED
        .mockReturnValueOnce(false), // BROWSER_HEADLESS
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    service = new EnhancedPlaywrightBrowserService(mockConfig, mockLogger);
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(service.config).toBe(mockConfig);
      expect(service.logger).toBe(mockLogger);
      expect(service.browser).toBeNull();
      expect(service.context).toBeNull();
      expect(service.page).toBeNull();
      expect(service.isInitialized).toBe(false);
      expect(service.currentProfile).toBeNull();
      expect(service.stealthEnabled).toBe(true);
      expect(service.behaviorSimulationEnabled).toBe(true);
    });

    it('should initialize metrics', () => {
      expect(service.metrics).toEqual({
        totalNavigations: 0,
        successfulNavigations: 0,
        detectionIncidents: 0,
        averageResponseTime: 0,
        totalResponseTime: 0,
      });
    });

    it('should create stealth components', () => {
      expect(service.userAgentManager).toBeDefined();
      expect(service.rateLimiter).toBeDefined();
      expect(service.profileManager).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('should initialize successfully with default options', async () => {
      await service.initialize();

      expect(service.profileManager.initialize).toHaveBeenCalled();
      expect(service.profileManager.getOrCreateProfile).toHaveBeenCalledWith('x-monitoring', {
        userAgent: 'test-user-agent',
        viewport: { width: 1920, height: 1080 },
      });
      expect(service.isInitialized).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Enhanced Browser Service initialized successfully', {
        profile: 'test-profile',
        stealthEnabled: true,
        behaviorSimulationEnabled: true,
      });
    });

    it('should initialize with custom purpose', async () => {
      await service.initialize({ purpose: 'general' });

      expect(service.profileManager.getOrCreateProfile).toHaveBeenCalledWith('general', {
        userAgent: 'test-user-agent',
        viewport: { width: 1920, height: 1080 },
      });
    });

    it('should handle initialization errors', async () => {
      const error = new Error('Profile initialization failed');
      service.profileManager.initialize.mockRejectedValue(error);

      await expect(service.initialize()).rejects.toThrow('Profile initialization failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to initialize Enhanced Browser Service', {
        error: error.message,
        stack: error.stack,
      });
    });
  });

  describe('launchBrowser', () => {
    beforeEach(() => {
      service.currentProfile = 'test-profile';
    });

    it('should launch browser with stealth configuration', async () => {
      await service.launchBrowser();

      expect(mockBrowser.newContext).toHaveBeenCalledWith({
        userAgent: 'test-user-agent',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        colorScheme: 'light',
        extraHTTPHeaders: expect.any(Object),
        geolocation: { longitude: -74.006, latitude: 40.7128 },
        permissions: ['geolocation'],
      });
      expect(mockPage.addInitScript).toHaveBeenCalled();
      expect(service.behaviorSimulator).toBeDefined();
    });

    it('should skip stealth features when disabled', async () => {
      service.stealthEnabled = false;
      service.behaviorSimulationEnabled = false;

      await service.launchBrowser();

      expect(mockBrowser.newContext).toHaveBeenCalledWith(
        expect.objectContaining({
          extraHTTPHeaders: {},
        })
      );
      expect(mockPage.addInitScript).not.toHaveBeenCalled();
      expect(service.behaviorSimulator).toBeNull();
    });

    it('should handle browser launch errors', async () => {
      const error = new Error('Browser launch failed');
      const { chromium } = await import('playwright');
      chromium.launch.mockRejectedValue(error);

      await expect(service.launchBrowser()).rejects.toThrow('Browser launch failed');
    });
  });

  describe('goto', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should navigate with behavior simulation enabled', async () => {
      const mockResponse = { status: () => 200 };
      service.behaviorSimulator.simulateRealisticPageLoad.mockResolvedValue(mockResponse);

      const result = await service.goto('https://example.com');

      expect(service.rateLimiter.waitForNextRequest).toHaveBeenCalled();
      expect(service.behaviorSimulator.simulateRealisticPageLoad).toHaveBeenCalledWith('https://example.com', {});
      expect(result).toBe(mockResponse);
      expect(service.metrics.totalNavigations).toBe(1);
      expect(service.metrics.successfulNavigations).toBe(1);
    });

    it('should navigate without behavior simulation when disabled', async () => {
      service.behaviorSimulationEnabled = false;
      service.behaviorSimulator = null;
      const mockResponse = { status: () => 200 };
      mockPage.goto.mockResolvedValue(mockResponse);

      const result = await service.goto('https://example.com');

      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });
      expect(result).toBe(mockResponse);
    });

    it('should save session periodically', async () => {
      service.metrics.totalNavigations = 9; // Next navigation will be 10th
      const mockResponse = { status: () => 200 };
      service.behaviorSimulator.simulateRealisticPageLoad.mockResolvedValue(mockResponse);

      await service.goto('https://example.com');

      expect(service.profileManager.saveSession).toHaveBeenCalledWith('test-profile', mockPage);
    });

    it('should handle navigation errors', async () => {
      const error = new Error('Navigation failed');
      service.behaviorSimulator.simulateRealisticPageLoad.mockRejectedValue(error);
      jest.spyOn(service, 'handleNavigationError').mockImplementation();

      await expect(service.goto('https://example.com')).rejects.toThrow('Navigation failed');
      expect(service.handleNavigationError).toHaveBeenCalledWith(error, 'https://example.com');
      expect(service.metrics.successfulNavigations).toBe(0);
    });

    it('should throw error when not initialized', async () => {
      service.isInitialized = false;

      await expect(service.goto('https://example.com')).rejects.toThrow('Enhanced Browser Service not initialized');
    });
  });

  describe('handleNavigationError', () => {
    it('should detect potential detection incidents', () => {
      const error = new Error('Access forbidden - bot detected');

      service.handleNavigationError(error, 'https://example.com');

      expect(mockLogger.warn).toHaveBeenCalledWith('Potential detection incident detected', {
        url: 'https://example.com',
        error: error.message,
        userAgent: 'test-user-agent',
      });
      expect(service.metrics.detectionIncidents).toBe(1);
      expect(service.rateLimiter.recordRequest).toHaveBeenCalledWith(false);
    });

    it('should handle regular navigation errors', () => {
      const error = new Error('Network timeout');

      service.handleNavigationError(error, 'https://example.com');

      expect(mockLogger.error).toHaveBeenCalledWith('Navigation error', {
        url: 'https://example.com',
        error: error.message,
      });
      expect(service.metrics.detectionIncidents).toBe(0);
    });

    it('should detect various detection indicators', () => {
      const detectionErrors = [
        'Request blocked by security policy',
        'Please complete the CAPTCHA',
        'HTTP 403 Forbidden',
        'Access denied to resource',
        'Too many requests from this IP',
        'Rate limit exceeded',
        'Bot activity detected',
      ];

      detectionErrors.forEach(errorMessage => {
        service.handleNavigationError(new Error(errorMessage), 'https://example.com');
        expect(service.metrics.detectionIncidents).toBeGreaterThan(0);
        service.metrics.detectionIncidents = 0; // Reset for next test
      });
    });
  });

  describe('updateMetrics', () => {
    it('should update metrics for successful request', () => {
      service.updateMetrics(true, 1500);

      expect(service.metrics.totalNavigations).toBe(1);
      expect(service.metrics.successfulNavigations).toBe(1);
      expect(service.metrics.totalResponseTime).toBe(1500);
      expect(service.metrics.averageResponseTime).toBe(1500);
    });

    it('should update metrics for failed request', () => {
      service.updateMetrics(false, 2000);

      expect(service.metrics.totalNavigations).toBe(1);
      expect(service.metrics.successfulNavigations).toBe(0);
      expect(service.metrics.totalResponseTime).toBe(2000);
      expect(service.metrics.averageResponseTime).toBe(2000);
    });

    it('should calculate correct average over multiple requests', () => {
      service.updateMetrics(true, 1000);
      service.updateMetrics(true, 2000);
      service.updateMetrics(false, 3000);

      expect(service.metrics.totalNavigations).toBe(3);
      expect(service.metrics.successfulNavigations).toBe(2);
      expect(service.metrics.averageResponseTime).toBe(2000); // (1000 + 2000 + 3000) / 3
    });
  });

  describe('rotateUserAgent', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should rotate user agent and update page', async () => {
      await service.rotateUserAgent();

      expect(service.userAgentManager.rotateUserAgent).toHaveBeenCalled();
      expect(mockPage.setExtraHTTPHeaders).toHaveBeenCalledWith({
        'User-Agent': 'new-user-agent',
      });
      expect(mockPage.setViewportSize).toHaveBeenCalledWith({ width: 1920, height: 1080 });
      expect(mockLogger.info).toHaveBeenCalledWith('Rotating user agent', {
        oldUserAgent: 'agent2',
        newUserAgent: 'new-user-agent',
        newViewport: { width: 1920, height: 1080 },
      });
    });

    it('should handle rotation when no page exists', async () => {
      service.page = null;

      await service.rotateUserAgent();

      expect(service.userAgentManager.rotateUserAgent).toHaveBeenCalled();
      expect(mockPage.setExtraHTTPHeaders).not.toHaveBeenCalled();
    });
  });

  describe('setEmergencyMode', () => {
    it('should activate emergency mode with default duration', () => {
      service.setEmergencyMode();

      expect(service.rateLimiter.setEmergencyMode).toHaveBeenCalledWith(true, 3600000);
      expect(mockLogger.warn).toHaveBeenCalledWith('Emergency mode activated', { duration: 3600000 });
    });

    it('should activate emergency mode with custom duration', () => {
      service.setEmergencyMode(7200000);

      expect(service.rateLimiter.setEmergencyMode).toHaveBeenCalledWith(true, 7200000);
      expect(mockLogger.warn).toHaveBeenCalledWith('Emergency mode activated', { duration: 7200000 });
    });
  });

  describe('getStatus', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return comprehensive status information', () => {
      const status = service.getStatus();

      expect(status).toMatchObject({
        initialized: true,
        healthy: true,
        profile: 'test-profile',
        userAgent: { current: 'test-user-agent', rotationCount: 1 },
        rateLimiter: { enabled: true, mode: 'active' },
        metrics: service.metrics,
        profileStats: { totalProfiles: 1 },
        stealthEnabled: true,
        behaviorSimulationEnabled: true,
      });
    });
  });

  describe('updateBehaviorConfig', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should update behavior configuration', () => {
      const config = { mouseMovements: { enabled: false } };

      service.updateBehaviorConfig(config);

      expect(service.behaviorSimulator.updateConfig).toHaveBeenCalledWith(config);
      expect(mockLogger.info).toHaveBeenCalledWith('Behavior configuration updated', { config });
    });

    it('should handle when behavior simulator is not available', () => {
      service.behaviorSimulator = null;

      service.updateBehaviorConfig({ test: true });

      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  describe('cleanupProfiles', () => {
    it('should clean up expired profiles', async () => {
      const result = await service.cleanupProfiles();

      expect(service.profileManager.cleanupExpiredProfiles).toHaveBeenCalled();
      expect(result).toBe(2);
    });
  });

  describe('Enhanced method implementations', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    describe('type', () => {
      it('should use behavior simulation when enabled', async () => {
        await service.type('#input', 'test text');

        expect(service.behaviorSimulator.simulateTyping).toHaveBeenCalledWith('#input', 'test text', {});
      });

      it('should use direct typing when behavior simulation disabled', async () => {
        service.behaviorSimulationEnabled = false;
        service.behaviorSimulator = null;

        await service.type('#input', 'test text');

        expect(mockPage.fill).toHaveBeenCalledWith('#input', 'test text', {});
      });

      it('should throw error when no page available', async () => {
        service.page = null;

        await expect(service.type('#input', 'test')).rejects.toThrow('No page available');
      });
    });

    describe('click', () => {
      it('should use behavior simulation when enabled', async () => {
        await service.click('#button');

        expect(service.behaviorSimulator.simulateClick).toHaveBeenCalledWith('#button', {});
      });

      it('should use direct clicking when behavior simulation disabled', async () => {
        service.behaviorSimulationEnabled = false;
        service.behaviorSimulator = null;

        await service.click('#button');

        expect(mockPage.click).toHaveBeenCalledWith('#button', {});
      });

      it('should throw error when no page available', async () => {
        service.page = null;

        await expect(service.click('#button')).rejects.toThrow('No page available');
      });
    });

    describe('waitForSelector', () => {
      it('should wait for selector successfully', async () => {
        const mockElement = {};
        mockPage.waitForSelector.mockResolvedValue(mockElement);

        const result = await service.waitForSelector('#element');

        expect(mockPage.waitForSelector).toHaveBeenCalledWith('#element', {});
        expect(result).toBe(mockElement);
      });

      it('should throw error when page is closed', async () => {
        mockPage.isClosed.mockReturnValue(true);

        await expect(service.waitForSelector('#element')).rejects.toThrow('Page not available or closed');
      });
    });

    describe('evaluate', () => {
      it('should evaluate script successfully', async () => {
        const script = '() => document.title';
        const result = 'Test Title';
        mockPage.evaluate.mockResolvedValue(result);

        const evalResult = await service.evaluate(script);

        expect(mockPage.evaluate).toHaveBeenCalledWith(script);
        expect(evalResult).toBe(result);
      });

      it('should pass arguments to script', async () => {
        const script = '(arg1, arg2) => arg1 + arg2';
        mockPage.evaluate.mockResolvedValue(5);

        await service.evaluate(script, 2, 3);

        expect(mockPage.evaluate).toHaveBeenCalledWith(script, 2, 3);
      });
    });

    describe('elementExists', () => {
      it('should return true when element exists', async () => {
        mockPage.waitForSelector.mockResolvedValue({});

        const exists = await service.elementExists('#element');

        expect(exists).toBe(true);
        expect(mockPage.waitForSelector).toHaveBeenCalledWith('#element', { timeout: 1000 });
      });

      it('should return false when element does not exist', async () => {
        mockPage.waitForSelector.mockRejectedValue(new Error('Timeout'));

        const exists = await service.elementExists('#element');

        expect(exists).toBe(false);
      });

      it('should return false when page is closed', async () => {
        mockPage.isClosed.mockReturnValue(true);

        const exists = await service.elementExists('#element');

        expect(exists).toBe(false);
      });
    });

    describe('setCookies and getCookies', () => {
      it('should set cookies successfully', async () => {
        const cookies = [{ name: 'test', value: 'value' }];

        await service.setCookies(cookies);

        expect(mockContext.addCookies).toHaveBeenCalledWith(cookies);
      });

      it('should get cookies successfully', async () => {
        const cookies = [{ name: 'test', value: 'value' }];
        mockContext.cookies.mockResolvedValue(cookies);

        const result = await service.getCookies();

        expect(mockContext.cookies).toHaveBeenCalledWith([]);
        expect(result).toBe(cookies);
      });

      it('should throw error when no context available', async () => {
        service.context = null;

        await expect(service.setCookies([])).rejects.toThrow('No browser context available');
        await expect(service.getCookies()).rejects.toThrow('No browser context available');
      });
    });
  });

  describe('Health and lifecycle methods', () => {
    describe('isHealthy', () => {
      beforeEach(async () => {
        await service.initialize();
      });

      it('should return true when all components are healthy', () => {
        expect(service.isHealthy()).toBe(true);
      });

      it('should return false when not initialized', () => {
        service.isInitialized = false;
        expect(service.isHealthy()).toBe(false);
      });

      it('should return false when browser is not connected', () => {
        mockBrowser.isConnected.mockReturnValue(false);
        expect(service.isHealthy()).toBe(false);
      });

      it('should return false when page is closed', () => {
        mockPage.isClosed.mockReturnValue(true);
        expect(service.isHealthy()).toBe(false);
      });

      it('should handle exceptions gracefully', () => {
        mockBrowser.isConnected.mockImplementation(() => {
          throw new Error('Connection error');
        });
        expect(service.isHealthy()).toBe(false);
      });
    });

    describe('isRunning', () => {
      it('should return true when browser is running and initialized', async () => {
        await service.initialize();
        expect(service.isRunning()).toBe(true);
      });

      it('should return false when not initialized', () => {
        expect(service.isRunning()).toBe(false);
      });

      it('should return false when browser is null', () => {
        service.browser = null;
        expect(service.isRunning()).toBe(false);
      });
    });

    describe('closePage', () => {
      beforeEach(async () => {
        await service.initialize();
      });

      it('should close page and save session', async () => {
        await service.closePage();

        expect(service.profileManager.saveSession).toHaveBeenCalledWith('test-profile', mockPage);
        expect(mockPage.close).toHaveBeenCalled();
        expect(service.page).toBeNull();
      });

      it('should handle errors gracefully', async () => {
        const error = new Error('Close failed');
        mockPage.close.mockRejectedValue(error);

        await service.closePage();

        expect(mockLogger.error).toHaveBeenCalledWith('Error closing page', {
          error: error.message,
        });
        expect(service.page).toBeNull();
      });

      it('should skip saving when no profile available', async () => {
        service.currentProfile = null;

        await service.closePage();

        expect(service.profileManager.saveSession).not.toHaveBeenCalled();
        expect(mockPage.close).toHaveBeenCalled();
      });
    });

    describe('close', () => {
      beforeEach(async () => {
        await service.initialize();
      });

      it('should close all components and reset state', async () => {
        await service.close();

        expect(service.profileManager.saveSession).toHaveBeenCalledWith('test-profile', mockPage);
        expect(mockPage.close).toHaveBeenCalled();
        expect(mockContext.close).toHaveBeenCalled();
        expect(mockBrowser.close).toHaveBeenCalled();

        expect(service.page).toBeNull();
        expect(service.context).toBeNull();
        expect(service.browser).toBeNull();
        expect(service.isInitialized).toBe(false);
        expect(service.currentProfile).toBeNull();
        expect(service.behaviorSimulator).toBeNull();

        expect(mockLogger.info).toHaveBeenCalledWith('Enhanced Browser Service closed', {
          finalMetrics: service.metrics,
          profileUsed: 'test-profile',
        });
      });

      it('should handle cleanup errors gracefully', async () => {
        const error = new Error('Cleanup failed');
        mockPage.close.mockRejectedValue(error);

        await service.close();

        expect(mockLogger.error).toHaveBeenCalledWith('Error during browser cleanup', {
          error: error.message,
        });
        expect(service.page).toBeNull(); // State should still be reset
      });

      it('should handle closed page gracefully', async () => {
        mockPage.isClosed.mockReturnValue(true);

        await service.close();

        expect(service.profileManager.saveSession).not.toHaveBeenCalled();
        expect(mockPage.close).not.toHaveBeenCalled();
      });
    });
  });

  describe('waitFor', () => {
    it('should wait for specified time using setTimeout', async () => {
      jest.useFakeTimers();

      const waitPromise = service.waitFor(1000);
      jest.advanceTimersByTime(1000);

      await waitPromise;

      jest.useRealTimers();
    });
  });
});
