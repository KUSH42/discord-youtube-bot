import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ScraperApplication } from '../../src/application/scraper-application.js';

describe('Login Flow', () => {
  let scraperApp;
  let mockBrowserService;
  let mockConfig;
  let mockLogger;

  beforeEach(() => {
    mockBrowserService = {
      goto: jest.fn(),
      waitForSelector: jest.fn(),
      type: jest.fn(),
      click: jest.fn(),
      evaluate: jest.fn(),
      setCookies: jest.fn(),
      page: {
        url: jest.fn(() => 'https://x.com/home'),
      },
    };

    mockConfig = {
      getRequired: jest.fn((key) => {
        const values = {
          'X_USER_HANDLE': 'testuser',
          'TWITTER_USERNAME': 'testuser',
          'TWITTER_PASSWORD': 'testpass'
        };
        return values[key];
      }),
      get: jest.fn(),
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    scraperApp = new ScraperApplication({
      browserService: mockBrowserService,
      config: mockConfig,
      logger: mockLogger,
      eventBus: { emit: jest.fn() },
      stateManager: { get: jest.fn(), set: jest.fn() },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should handle multi-step login flow correctly', async () => {
    // Simulate the login flow by mocking the return values of evaluate
    mockBrowserService.evaluate
      .mockResolvedValueOnce({ hasUsernameInput: true }) // Step 1: Username
      .mockResolvedValueOnce({ needsEmailVerification: true }) // Step 2: Email verification
      .mockResolvedValueOnce({ hasPasswordInput: true }) // Step 3: Password
      .mockResolvedValue({ isLoggedIn: true }); // Final step: Logged in

    // Mock the helper functions to avoid testing their implementation here
    scraperApp.clickNextButton = jest.fn().mockResolvedValue(true);
    scraperApp.clickLoginButton = jest.fn().mockResolvedValue(true);
    scraperApp.handleEmailVerification = jest.fn().mockResolvedValue();
    scraperApp.verifyAuthentication = jest.fn().mockResolvedValue();


    await scraperApp.loginToX();

    expect(mockBrowserService.type).toHaveBeenCalledWith('input[name="text"]', 'testuser');
    expect(scraperApp.clickNextButton).toHaveBeenCalledTimes(2);
    expect(scraperApp.handleEmailVerification).toHaveBeenCalled();
    expect(mockBrowserService.type).toHaveBeenCalledWith('input[name="password"]', 'testpass');
    expect(scraperApp.clickLoginButton).toHaveBeenCalled();
    expect(scraperApp.verifyAuthentication).toHaveBeenCalled();
  });

  it('should use cookies for authentication if available', async () => {
    const mockCookies = JSON.stringify([{ name: 'auth_token', value: 'testtoken' }]);
    mockConfig.get.mockReturnValue(mockCookies);
    mockBrowserService.waitForSelector.mockResolvedValue(true);

    await scraperApp.loginToX();

    expect(mockBrowserService.setCookies).toHaveBeenCalledWith(JSON.parse(mockCookies));
    expect(mockBrowserService.goto).toHaveBeenCalledWith('https://x.com/home');
    expect(mockLogger.info).toHaveBeenCalledWith('✅ Cookie authentication successful');
  });
  
  it('should call clickNextButton and handle its failure', async () => {
    // Mock so that clickNextButton fails
    mockBrowserService.waitForSelector.mockRejectedValue(new Error('Selector not found'));
    const result = await scraperApp.clickNextButton();
    expect(result).toBe(false);
    expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Next" button selector failed'));
  });

  it('should call clickLoginButton and handle its failure', async () => {
    // Mock so that clickLoginButton fails
    mockBrowserService.waitForSelector.mockRejectedValue(new Error('Selector not found'));
    const result = await scraperApp.clickLoginButton();
    expect(result).toBe(false);
    expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('"Log in" button selector failed'));
  });

  it('should fall back to credential login if cookie authentication fails', async () => {
    const mockCookies = JSON.stringify([{ name: 'auth_token', value: 'testtoken' }]);
    mockConfig.get.mockReturnValue(mockCookies);
    
    // Simulate cookie auth failure
    mockBrowserService.waitForSelector.mockRejectedValue(new Error('Selector not found'));
    
    // Simulate successful credential login
    mockBrowserService.evaluate.mockResolvedValueOnce({ hasUsernameInput: true });
    mockBrowserService.evaluate.mockResolvedValueOnce({ hasPasswordInput: true });
    mockBrowserService.evaluate.mockResolvedValueOnce({ isLoggedIn: true });
    scraperApp.verifyAuthentication = jest.fn().mockResolvedValue();


    await scraperApp.loginToX();

    expect(mockLogger.warn).toHaveBeenCalledWith('Cookie authentication failed, falling back to credentials');
    expect(mockLogger.info).toHaveBeenCalledWith('Using credential-based authentication...');
    expect(scraperApp.verifyAuthentication).toHaveBeenCalled();
  });
});
