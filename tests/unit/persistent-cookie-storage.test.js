/**
 * Test suite for persistent cookie storage functionality
 */
import { jest } from '@jest/globals';
import { ScraperApplication } from '../../src/application/scraper-application.js';

describe('Persistent Cookie Storage', () => {
  let scraperApp;
  let mockBrowserService;
  let mockConfig;
  let mockStateManager;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    // Mock browser service
    mockBrowserService = {
      launch: jest.fn(),
      close: jest.fn(),
      isRunning: jest.fn(() => true),
      goto: jest.fn(),
      waitForSelector: jest.fn(),
      type: jest.fn(),
      click: jest.fn(),
      waitForNavigation: jest.fn(),
      evaluate: jest.fn(),
      setCookies: jest.fn(),
      getCookies: jest.fn(),
      page: {
        url: jest.fn(() => 'https://x.com/home'),
        screenshot: jest.fn()
      }
    };

    // Mock config
    mockConfig = {
      getRequired: jest.fn((key) => {
        const values = {
          'X_USER_HANDLE': 'testuser',
          'TWITTER_USERNAME': 'testuser',
          'TWITTER_PASSWORD': 'testpass'
        };
        return values[key] || 'default';
      }),
      get: jest.fn((key) => {
        const values = {
          'X_USER_HANDLE': 'testuser',
          'TWITTER_USERNAME': 'testuser',
          'TWITTER_PASSWORD': 'testpass'
        };
        return values[key];
      }),
      getBoolean: jest.fn(() => true)
    };

    // Mock state manager
    mockStateManager = {
      get: jest.fn(),
      set: jest.fn(),
      has: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn()
    };

    // Mock event bus
    mockEventBus = {
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      once: jest.fn()
    };

    // Mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // Create scraper application instance
    scraperApp = new ScraperApplication({
      browserService: mockBrowserService,
      config: mockConfig,
      stateManager: mockStateManager,
      eventBus: mockEventBus,
      logger: mockLogger
    });
  });

  describe('Cookie Storage Management', () => {
    it('should save cookies to state after successful login', async () => {
      const mockCookies = [
        { name: 'auth_token', value: 'abc123', domain: '.x.com' },
        { name: 'ct0', value: 'def456', domain: '.x.com' }
      ];

      mockBrowserService.getCookies.mockResolvedValue(mockCookies);
      mockBrowserService.evaluate.mockResolvedValue({ isLoggedIn: true });

      // Mock successful login
      scraperApp.browser = mockBrowserService;
      jest.spyOn(scraperApp, 'loginToX').mockResolvedValue(true);

      await scraperApp.ensureAuthenticated();

      // Verify cookies were retrieved and stored
      expect(mockBrowserService.getCookies).toHaveBeenCalled();
      expect(mockStateManager.set).toHaveBeenCalledWith('x_session_cookies', mockCookies);
      expect(mockLogger.info).toHaveBeenCalledWith('Saved session cookies to state');
    });

    it('should attempt to use saved cookies before performing login', async () => {
      const savedCookies = [
        { name: 'auth_token', value: 'saved123', domain: '.x.com' },
        { name: 'ct0', value: 'saved456', domain: '.x.com' }
      ];

      mockStateManager.get.mockReturnValue(savedCookies);
      mockBrowserService.evaluate.mockResolvedValue({ isLoggedIn: true });

      scraperApp.browser = mockBrowserService;
      jest.spyOn(scraperApp, 'loginToX').mockResolvedValue(true);

      await scraperApp.ensureAuthenticated();

      // Verify cookies were set before checking authentication
      expect(mockBrowserService.setCookies).toHaveBeenCalledWith(savedCookies);
      expect(mockLogger.info).toHaveBeenCalledWith('Attempting to use saved session cookies');
      
      // Login should not be called since cookies worked
      expect(scraperApp.loginToX).not.toHaveBeenCalled();
    });

    it('should fallback to login when saved cookies fail', async () => {
      const savedCookies = [
        { name: 'auth_token', value: 'expired123', domain: '.x.com' }
      ];

      mockStateManager.get.mockReturnValue(savedCookies);
      mockBrowserService.evaluate
        .mockResolvedValueOnce({ isLoggedIn: false }) // First check fails
        .mockResolvedValueOnce({ isLoggedIn: true }); // After login succeeds

      scraperApp.browser = mockBrowserService;
      jest.spyOn(scraperApp, 'loginToX').mockResolvedValue(true);

      await scraperApp.ensureAuthenticated();

      // Verify cookies were tried first
      expect(mockBrowserService.setCookies).toHaveBeenCalledWith(savedCookies);
      expect(mockLogger.info).toHaveBeenCalledWith('Saved cookies failed, attempting login');
      
      // Login should be called as fallback
      expect(scraperApp.loginToX).toHaveBeenCalled();
    });

    it('should handle missing saved cookies gracefully', async () => {
      mockStateManager.get.mockReturnValue(null);
      mockBrowserService.evaluate.mockResolvedValue({ isLoggedIn: true });

      scraperApp.browser = mockBrowserService;
      jest.spyOn(scraperApp, 'loginToX').mockResolvedValue(true);

      await scraperApp.ensureAuthenticated();

      // Should not attempt to set cookies
      expect(mockBrowserService.setCookies).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('No saved cookies found, performing login');
      
      // Should perform login directly
      expect(scraperApp.loginToX).toHaveBeenCalled();
    });

    it('should handle invalid saved cookies gracefully', async () => {
      const invalidCookies = 'invalid_cookie_format';

      mockStateManager.get.mockReturnValue(invalidCookies);
      mockBrowserService.evaluate.mockResolvedValue({ isLoggedIn: true });

      scraperApp.browser = mockBrowserService;
      jest.spyOn(scraperApp, 'loginToX').mockResolvedValue(true);

      await scraperApp.ensureAuthenticated();

      // Should not attempt to set invalid cookies
      expect(mockBrowserService.setCookies).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith('Invalid saved cookies format, performing login');
      
      // Should perform login directly
      expect(scraperApp.loginToX).toHaveBeenCalled();
    });
  });

  describe('Cookie Validation', () => {
    it('should validate cookie format before setting', async () => {
      const validCookies = [
        { name: 'auth_token', value: 'abc123', domain: '.x.com' },
        { name: 'ct0', value: 'def456', domain: '.x.com' }
      ];

      mockStateManager.get.mockReturnValue(validCookies);
      mockBrowserService.evaluate.mockResolvedValue({ isLoggedIn: true });

      scraperApp.browser = mockBrowserService;

      const isValid = scraperApp.validateCookieFormat(validCookies);
      expect(isValid).toBe(true);
    });

    it('should reject invalid cookie format', async () => {
      const invalidCookies = [
        { name: 'auth_token' }, // Missing value
        { value: 'def456', domain: '.x.com' }, // Missing name
        'invalid_string' // Not an object
      ];

      scraperApp.browser = mockBrowserService;

      const isValid = scraperApp.validateCookieFormat(invalidCookies);
      expect(isValid).toBe(false);
    });

    it('should handle null or undefined cookies', async () => {
      scraperApp.browser = mockBrowserService;

      expect(scraperApp.validateCookieFormat(null)).toBe(false);
      expect(scraperApp.validateCookieFormat(undefined)).toBe(false);
      expect(scraperApp.validateCookieFormat([])).toBe(false);
    });
  });

  describe('Cookie Persistence Flow', () => {
    it('should follow correct priority order: saved cookies -> config file -> credentials', async () => {
      const loginAttempts = [];

      // Mock successful login with credentials
      jest.spyOn(scraperApp, 'loginToX').mockImplementation(() => {
        loginAttempts.push('credentials');
        return Promise.resolve(true);
      });

      // Mock failed saved cookies
      mockStateManager.get.mockReturnValue(null);
      mockBrowserService.evaluate.mockResolvedValue({ isLoggedIn: false });

      scraperApp.browser = mockBrowserService;

      await scraperApp.ensureAuthenticated();

      // Should have attempted login with credentials
      expect(loginAttempts).toEqual(['credentials']);
      expect(mockLogger.info).toHaveBeenCalledWith('No saved cookies found, performing login');
    });

    it('should update saved cookies after successful credential login', async () => {
      const newCookies = [
        { name: 'new_auth_token', value: 'new123', domain: '.x.com' },
        { name: 'new_ct0', value: 'new456', domain: '.x.com' }
      ];

      mockStateManager.get.mockReturnValue(null); // No saved cookies
      mockBrowserService.evaluate.mockResolvedValue({ isLoggedIn: true });
      mockBrowserService.getCookies.mockResolvedValue(newCookies);

      scraperApp.browser = mockBrowserService;
      jest.spyOn(scraperApp, 'loginToX').mockResolvedValue(true);

      await scraperApp.ensureAuthenticated();

      // Should save new cookies after successful login
      expect(mockStateManager.set).toHaveBeenCalledWith('x_session_cookies', newCookies);
      expect(mockLogger.info).toHaveBeenCalledWith('Saved session cookies to state');
    });

    it('should clear saved cookies on persistent authentication failure', async () => {
      const expiredCookies = [
        { name: 'expired_token', value: 'expired123', domain: '.x.com' }
      ];

      mockStateManager.get.mockReturnValue(expiredCookies);
      mockBrowserService.evaluate.mockResolvedValue({ isLoggedIn: false });
      jest.spyOn(scraperApp, 'loginToX').mockResolvedValue(false);

      scraperApp.browser = mockBrowserService;

      await expect(scraperApp.ensureAuthenticated()).rejects.toThrow('Authentication failed');

      // Should clear expired cookies
      expect(mockStateManager.delete).toHaveBeenCalledWith('x_session_cookies');
      expect(mockLogger.warn).toHaveBeenCalledWith('Clearing expired session cookies');
    });
  });

  describe('Error Handling', () => {
    it('should handle cookie setting errors gracefully', async () => {
      const savedCookies = [
        { name: 'auth_token', value: 'abc123', domain: '.x.com' }
      ];

      mockStateManager.get.mockReturnValue(savedCookies);
      mockBrowserService.setCookies.mockRejectedValue(new Error('Cookie setting failed'));
      mockBrowserService.evaluate.mockResolvedValue({ isLoggedIn: true });

      scraperApp.browser = mockBrowserService;
      jest.spyOn(scraperApp, 'loginToX').mockResolvedValue(true);

      await scraperApp.ensureAuthenticated();

      // Should log error and fallback to login
      expect(mockLogger.error).toHaveBeenCalledWith('Error setting saved cookies:', expect.any(Error));
      expect(scraperApp.loginToX).toHaveBeenCalled();
    });

    it('should handle cookie retrieval errors gracefully', async () => {
      mockStateManager.get.mockReturnValue(null);
      mockBrowserService.evaluate.mockResolvedValue({ isLoggedIn: true });
      mockBrowserService.getCookies.mockRejectedValue(new Error('Cookie retrieval failed'));

      scraperApp.browser = mockBrowserService;
      jest.spyOn(scraperApp, 'loginToX').mockResolvedValue(true);

      await scraperApp.ensureAuthenticated();

      // Should log error but continue
      expect(mockLogger.error).toHaveBeenCalledWith('Error saving session cookies:', expect.any(Error));
      expect(scraperApp.loginToX).toHaveBeenCalled();
    });

    it('should handle state manager errors gracefully', async () => {
      mockStateManager.get.mockImplementation(() => {
        throw new Error('State manager error');
      });
      mockBrowserService.evaluate.mockResolvedValue({ isLoggedIn: true });

      scraperApp.browser = mockBrowserService;
      jest.spyOn(scraperApp, 'loginToX').mockResolvedValue(true);

      await scraperApp.ensureAuthenticated();

      // Should log error and fallback to login
      expect(mockLogger.error).toHaveBeenCalledWith('Error retrieving saved cookies:', expect.any(Error));
      expect(scraperApp.loginToX).toHaveBeenCalled();
    });
  });
});