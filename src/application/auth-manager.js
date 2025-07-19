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
   * @returns {Promise<void>}
   */
  async ensureAuthenticated() {
    try {
      this.logger.info('Ensuring authentication...');
      const savedCookies = this.state.get('x_session_cookies');

      if (savedCookies && this.validateCookieFormat(savedCookies)) {
        this.logger.info('Attempting to use saved session cookies');
        try {
          await this.browser.setCookies(savedCookies);
          await this.browser.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });

          if (await this.isAuthenticated()) {
            this.logger.info('✅ Successfully authenticated using saved cookies.');
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
          }
        } catch (error) {
          this.logger.error('Error validating saved cookies, falling back to login:', error);
          await this.loginToX();
        }
      } else if (savedCookies) {
        this.logger.warn('Invalid saved cookies format, performing login');
        try {
          this.state.delete('x_session_cookies');
        } catch (deleteError) {
          this.logger.error('Failed to delete session cookies from state:', deleteError);
        }
        await this.loginToX();
      } else {
        this.logger.info('No saved cookies found, performing login');
        await this.loginToX();
      }
    } catch (error) {
      this.logger.error('Authentication process failed:', error);
      throw new Error('Authentication failed');
    }
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
      throw new Error('Browser service is not available.');
    }
    try {
      const currentUrl = await this.browser.page.url();
      return currentUrl.includes('/home');
    } catch (error) {
      this.logger.warn('Could not determine authentication status from URL:', error);
      return false;
    }
  }

  /**
   * Validates the format of the cookies.
   * @param {any} cookies - The cookies to validate.
   * @returns {boolean} - True if the format is valid, false otherwise.
   */
  validateCookieFormat(cookies) {
    if (!Array.isArray(cookies) || cookies.length === 0) {
      return false;
    }
    return cookies.every(c => c && typeof c.name === 'string' && typeof c.value === 'string');
  }
}
