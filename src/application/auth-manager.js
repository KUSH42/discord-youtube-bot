/**
 * Manages authentication for the scraper, handling cookies and login flows.
 */
export class AuthManager {
  constructor(dependencies) {
    this.browser = dependencies.browserService;
    this.config = dependencies.config;
    this.state = dependencies.stateManager;
    this.logger = dependencies.logger;
    this.twitterUsername = this.config.getRequired('TWITTER_USERNAME');
    this.twitterPassword = this.config.getRequired('TWITTER_PASSWORD');
  }

  /**
   * Ensures the user is authenticated, using cookies if available, otherwise performing a full login.
   * @param {Object} options - Configuration options
   * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
   * @param {number} options.baseDelay - Base delay between retries in ms (default: 2000)
   * @returns {Promise<void>}
   */
  async ensureAuthenticated(options = {}) {
    const { maxRetries = 3, baseDelay = 2000 } = options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.info(`Ensuring authentication... (attempt ${attempt}/${maxRetries})`);
        const savedCookies = this.state.get('x_session_cookies');

        if (savedCookies && this.validateCookieFormat(savedCookies)) {
          this.logger.info('Attempting to use saved session cookies');
          try {
            await this.browser.setCookies(savedCookies);
            await this.browser.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });

            if (await this.isAuthenticated()) {
              this.logger.info('✅ Successfully authenticated using saved cookies.');
              this.clearSensitiveData();
              return;
            } else {
              this.logger.warn('Saved cookies failed, attempting login');
              try {
                this.state.delete('x_session_cookies');
                this.logger.warn('Clearing expired session cookies');
              } catch (deleteError) {
                this.logger.error('Failed to delete session cookies from state:', deleteError);
              }
              await this.loginToX();
              this.logger.info('✅ Authentication successful');
              return;
            }
          } catch (error) {
            this.logger.error(
              'Error validating saved cookies, falling back to login:',
              this.sanitizeErrorMessage(error.message)
            );
            await this.loginToX();
            this.logger.info('✅ Authentication successful');
            return;
          }
        } else if (savedCookies) {
          this.logger.warn('Invalid saved cookies format, performing login');
          try {
            this.state.delete('x_session_cookies');
          } catch (deleteError) {
            this.logger.error('Failed to delete session cookies from state:', deleteError);
          }
          await this.loginToX();
          this.logger.info('✅ Authentication successful');
          return;
        } else {
          this.logger.info('No saved cookies found, performing login');
          await this.loginToX();
          this.logger.info('✅ Authentication successful');
          return;
        }
      } catch (error) {
        const sanitizedMessage =
          error && error.message
            ? this.sanitizeErrorMessage(error.message)
            : 'An unknown authentication error occurred.';

        if (attempt === maxRetries) {
          this.logger.error(`Authentication failed after ${maxRetries} attempts:`, sanitizedMessage);
          throw new Error('Authentication failed');
        }

        // Check if this is a recoverable error
        const isRecoverable = this.isRecoverableError(error);
        if (!isRecoverable) {
          this.logger.error('Non-recoverable authentication error:', sanitizedMessage);
          throw new Error('Authentication failed');
        }

        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        this.logger.warn(`Authentication attempt ${attempt} failed, retrying in ${delay}ms:`, sanitizedMessage);
        await this.delay(delay);
      }
    }
  }

  /**
   * Check if an authentication error is recoverable
   * @param {Error} error - The error to check
   * @returns {boolean} True if the error is recoverable
   */
  isRecoverableError(error) {
    const recoverableMessages = [
      'timeout',
      'network',
      'connection',
      'temporarily unavailable',
      'server error',
      'loading',
      'page crash',
      'navigation timeout',
      'protocol error',
    ];

    const errorMessage = error.message.toLowerCase();
    return recoverableMessages.some(msg => errorMessage.includes(msg));
  }

  /**
   * Delay helper function
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Performs the full login flow using credentials.
   * @returns {Promise<boolean>} True if login is successful.
   */
  async loginToX() {
    this.logger.info('Using credential-based authentication...');
    await this.browser.goto('https://x.com/i/flow/login');

    // Step 1: Enter username
    this.logger.info('Entering username...');
    await this.browser.waitForSelector('input[name="text"]', { timeout: 10000 });
    await this.browser.type('input[name="text"]', this.twitterUsername);
    await this.clickNextButton();
    await new Promise(resolve => setTimeout(resolve, 4000));

    // Step 2: Enter password
    this.logger.info('Entering password...');
    await this.browser.waitForSelector('input[name="password"]', { timeout: 10000 });
    await this.browser.type('input[name="password"]', this.twitterPassword);
    await this.clickLoginButton();
    await this.browser.waitForNavigation({ timeout: 15000 });

    if (await this.isAuthenticated()) {
      this.logger.info('✅ Login successful, a new session has been established.');
      await this.saveAuthenticationState();
      this.clearSensitiveData();
      return true;
    } else {
      this.logger.error('Credential-based login failed.');
      throw new Error('Authentication failed');
    }
  }

  /**
   * Clicks the "Next" button during the login flow.
   * @returns {Promise<void>}
   */
  async clickNextButton() {
    const nextButtonSelector = 'button:has-text("Next")';
    await this.browser.click(nextButtonSelector);
  }

  /**
   * Clicks the "Log in" button during the login flow.
   * @returns {Promise<void>}
   */
  async clickLoginButton() {
    const loginButtonSelector = 'button[data-testid="LoginForm_Login_Button"]';
    await this.browser.click(loginButtonSelector);
  }

  /**
   * Saves the current session cookies to the state manager.
   * @returns {Promise<void>}
   */
  async saveAuthenticationState() {
    try {
      this.logger.info('Saving session cookies to state...');
      const cookies = await this.browser.getCookies();
      if (this.validateCookieFormat(cookies)) {
        this.state.set('x_session_cookies', cookies);
        this.logger.info('Saved session cookies to state');
      } else {
        this.logger.warn('Could not find any valid cookies to save.');
      }
    } catch (error) {
      this.logger.error('Error saving session cookies:', error);
    }
  }

  /**
   * Checks if the current session is authenticated by verifying the URL.
   * @returns {Promise<boolean>}
   */
  async isAuthenticated() {
    if (!this.browser || !this.browser.page) {
      this.logger.warn('Browser service or page not available for authentication check.');
      return false;
    }
    try {
      // Check for X authentication cookies
      const cookies = await this.browser.getCookies();

      // X uses 'auth_token' and 'ct0' cookies for authentication
      const authToken = cookies.find(cookie => cookie.name === 'auth_token');
      const ct0Token = cookies.find(cookie => cookie.name === 'ct0');

      // Both cookies should be present and non-empty for valid authentication
      const hasValidCookies = authToken && authToken.value && ct0Token && ct0Token.value;

      this.logger.info(
        `Authentication check result: ${hasValidCookies ? 'authenticated (valid cookies)' : 'not authenticated (missing/invalid cookies)'}`
      );

      if (hasValidCookies) {
        // Optional: Do a quick navigation test to confirm cookies work
        try {
          await this.browser.goto('https://x.com/home', { timeout: 10000, waitUntil: 'domcontentloaded' });
          // If we can navigate to home without being redirected to login, we're good
          const currentUrl = await this.browser.getUrl();
          const isOnHomePage = currentUrl.includes('/home') || currentUrl === 'https://x.com/';

          this.logger.info(`Navigation check: ${isOnHomePage ? 'success' : 'redirected to login'}`);
          return isOnHomePage;
        } catch (navError) {
          this.logger.warn('Navigation test failed, but cookies present:', this.sanitizeErrorMessage(navError.message));
          // If navigation fails but cookies are present, assume authenticated
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.warn('Error checking authentication status:', this.sanitizeErrorMessage(error.message));
      return false;
    }
  }

  /**
   * Clears sensitive data from memory after successful authentication.
   * @returns {void}
   */
  clearSensitiveData() {
    // Clear credentials from memory after successful authentication
    this.twitterUsername = null;
    this.twitterPassword = null;
  }

  /**
   * Sanitizes error messages to remove sensitive credentials.
   * @param {string} message - Error message to sanitize
   * @returns {string} Sanitized error message
   */
  sanitizeErrorMessage(message) {
    if (typeof message !== 'string') {
      return 'An unknown error occurred';
    }
    let sanitized = message;

    // Get original credentials from config for sanitization
    const originalUsername = this.config.getRequired('TWITTER_USERNAME');
    const originalPassword = this.config.getRequired('TWITTER_PASSWORD');

    // Replace credentials with placeholders
    if (originalPassword) {
      sanitized = sanitized.replace(new RegExp(originalPassword, 'g'), '[REDACTED_PASSWORD]');
    }
    if (originalUsername) {
      sanitized = sanitized.replace(new RegExp(originalUsername, 'g'), '[REDACTED_USERNAME]');
    }

    return sanitized;
  }

  /**
   * Validates the format and security of cookies.
   * @param {any} cookies - The cookies to validate.
   * @returns {boolean} - True if the format is valid and secure, false otherwise.
   */
  validateCookieFormat(cookies) {
    if (!Array.isArray(cookies) || cookies.length === 0) {
      return false;
    }

    return cookies.every(cookie => {
      // Basic format validation
      if (!cookie || typeof cookie.name !== 'string' || typeof cookie.value !== 'string') {
        return false;
      }

      // Security validation - reject suspicious patterns
      const suspiciousPatterns = [
        /data:text\/html/i, // Data URLs with HTML
        /javascript:/i, // JavaScript URLs
        /vbscript:/i, // VBScript URLs
        /\$\(/, // Command substitution
        /`.*`/, // Backtick command execution
        /\.\.[/\\]/, // Path traversal patterns
        /<script/i, // Script tags
        /<iframe/i, // Iframe tags
        /eval\(/i, // eval() calls
        /document\./i, // DOM access
        /window\./i, // Window object access
      ];

      // Check cookie name and value against suspicious patterns
      const nameValue = cookie.name + cookie.value;
      return !suspiciousPatterns.some(pattern => pattern.test(nameValue));
    });
  }
}
