import { DuplicateDetector } from '../duplicate-detector.js';

/**
 * X (Twitter) scraping application orchestrator
 * Coordinates browser automation, content classification, and announcements
 */
export class ScraperApplication {
  constructor(dependencies) {
    this.browser = dependencies.browserService;
    this.classifier = dependencies.contentClassifier;
    this.announcer = dependencies.contentAnnouncer;
    this.config = dependencies.config;
    this.state = dependencies.stateManager;
    this.discord = dependencies.discordService;
    this.eventBus = dependencies.eventBus;
    this.logger = dependencies.logger;
    
    // Scraper configuration
    this.xUser = this.config.getRequired('X_USER_HANDLE');
    this.twitterUsername = this.config.getRequired('TWITTER_USERNAME');
    this.twitterPassword = this.config.getRequired('TWITTER_PASSWORD');
    
    // Polling configuration
    this.minInterval = parseInt(this.config.get('X_QUERY_INTERVALL_MIN', '300000'), 10);
    this.maxInterval = parseInt(this.config.get('X_QUERY_INTERVALL_MAX', '600000'), 10);
    
    // State management
    this.duplicateDetector = new DuplicateDetector();
    this.isRunning = false;
    this.timerId = null;
    this.currentSession = null;
    
    // Statistics
    this.stats = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      totalTweetsFound: 0,
      totalTweetsAnnounced: 0,
      lastRunTime: null,
      lastError: null
    };
    this.nextPollTimestamp = null;
  }
  
  /**
   * Start X content monitoring
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Scraper application is already running');
    }
    
    try {
      this.logger.info('Starting X scraper application...');
      
      // Initialize browser
      await this.initializeBrowser();
      
      // Perform initial login
      await this.loginToX();
      
      // Start polling
      this.startPolling();
      
      this.isRunning = true;
      this.logger.info('✅ X scraper application started successfully');
      
      // Emit start event
      this.eventBus.emit('scraper.started', {
        startTime: new Date(),
        xUser: this.xUser,
        pollingInterval: this.getNextInterval()
      });
      
    } catch (error) {
      this.logger.error('Failed to start scraper application:', error);
      await this.stop();
      throw error;
    }
  }
  
  /**
   * Stop X content monitoring
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    try {
      this.logger.info('Stopping X scraper application...');
      
      // Stop polling
      this.stopPolling();
      
      // Close browser
      await this.closeBrowser();
      
      this.isRunning = false;
      this.logger.info('X scraper application stopped');
      
      // Emit stop event
      this.eventBus.emit('scraper.stopped', {
        stopTime: new Date(),
        stats: this.getStats()
      });
      
    } catch (error) {
      this.logger.error('Error stopping scraper application:', error);
    }
  }
  
  /**
   * Initialize browser for scraping
   * @returns {Promise<void>}
   */
  async initializeBrowser() {
    const browserOptions = {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    };
    
    // Add display if running in headless environment
    if (process.env.DISPLAY) {
      browserOptions.args.push(`--display=${process.env.DISPLAY}`);
    }
    
    await this.browser.launch(browserOptions);
    this.logger.info('Browser initialized for X scraping');

    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    await this.browser.setUserAgent(userAgent);
    this.logger.info(`User agent set to: ${userAgent}`);
  }
  
  /**
   * Close browser
   * @returns {Promise<void>}
   */
  async closeBrowser() {
    try {
      if (this.browser.isRunning()) {
        await this.browser.close();
        this.logger.info('Browser closed');
      }
    } catch (error) {
      this.logger.error('Error closing browser:', error);
    }
  }
  
  /**
   * Login to X (Twitter)
   * @returns {Promise<void>}
   */
  async loginToX() {
    try {
      this.logger.info('Logging into X...');
      
      // Try cookie authentication first if available
      const authCookies = this.config.get('TWITTER_AUTH_COOKIES');
      if (authCookies) {
        this.logger.info('Attempting cookie-based authentication...');
        try {
          this.logger.debug('Raw cookie string length:', authCookies.length);
          
          // Clean up the cookie string - remove outer quotes and normalize whitespace
          let cleanedCookies = authCookies.trim();
          if (cleanedCookies.startsWith("'") && cleanedCookies.endsWith("'")) {
            cleanedCookies = cleanedCookies.slice(1, -1);
          }
          if (cleanedCookies.startsWith('"') && cleanedCookies.endsWith('"')) {
            cleanedCookies = cleanedCookies.slice(1, -1);
          }
          
          const cookies = JSON.parse(cleanedCookies);
          this.logger.debug('Parsed cookies count:', cookies.length);
          this.logger.debug('First cookie name:', cookies[0]?.name);
          
          await this.browser.setCookies(cookies);
          
          // Navigate to home page to test authentication
          await this.browser.goto('https://x.com/home');
          
          // Check if we're logged in by looking for user-specific elements
          const isLoggedIn = await this.browser.waitForSelector('[data-testid="AppTabBar_Home_Link"], [aria-label="Home timeline"], [data-testid="SideNav_AccountSwitcher_Button"]', { timeout: 10000 })
            .then(() => true)
            .catch(() => false);
            
          if (isLoggedIn) {
            this.logger.info('✅ Cookie authentication successful');
            return;
          } else {
            this.logger.warn('Cookie authentication failed, falling back to credentials');
          }
        } catch (cookieError) {
          this.logger.warn('Cookie authentication error, falling back to credentials:', cookieError.message);
          this.logger.debug('Cookie error details:', cookieError);
        }
      }
      
      // Fallback to username/password login
      this.logger.info('Using credential-based authentication...');
      await this.browser.goto('https://x.com/i/flow/login');
      
      const maxSteps = 5;
      for (let step = 0; step < maxSteps; step++) {
        this.logger.info(`Login step ${step + 1}`);
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for page transition
        
        const pageState = await this.browser.evaluate(() => ({
          hasUsernameInput: !!document.querySelector('input[name="text"]'),
          hasPasswordInput: !!document.querySelector('input[name="password"]'),
          needsEmailVerification: document.body.innerText.toLowerCase().includes('phone or email') || !!document.querySelector('input[data-testid="ocfEnterTextTextInput"]'),
          isLoggedIn: !!document.querySelector('[data-testid="AppTabBar_Home_Link"]')
        }));
        
        if (pageState.isLoggedIn) {
          this.logger.info('✅ Login successful, already on home page');
          return;
        }
        
        if (pageState.hasUsernameInput) {
          this.logger.info('Entering username...');
          await this.browser.type('input[name="text"]', this.twitterUsername);
          await this.clickNextButton();
        } else if (pageState.needsEmailVerification) {
          this.logger.info('Email verification required...');
          await this.handleEmailVerification();
          await this.clickNextButton();
        } else if (pageState.hasPasswordInput) {
          this.logger.info('Entering password...');
          await this.browser.type('input[name="password"]', this.twitterPassword);
          await this.clickLoginButton();
          break;
        } else if (pageState.isLoggedIn) {
          this.logger.info('✅ Login successful, already on home page');
          return;
        } else {
          this.logger.warn('Unknown login state, attempting to click Next/Login');
          const clickedNext = await this.clickNextButton();
          if (!clickedNext) {
            await this.clickLoginButton();
          }
        }
      }
      
      // Final verification
      await this.verifyAuthentication();
      
    } catch (error) {
      this.logger.error('Failed to login to X:', error);
      
      // Take a screenshot for debugging if possible
      try {
        const currentUrl = await this.browser.page.url();
        this.logger.info(`Current page URL: ${currentUrl}`);
        
        // Don't take screenshot in production/CI to avoid issues
        if (process.env.NODE_ENV === 'development') {
          await this.browser.page.screenshot({ path: 'x-login-error.png' });
          this.logger.info('Screenshot saved as x-login-error.png');
        }
      } catch (debugError) {
        this.logger.debug('Could not capture debug info:', debugError.message);
      }
      
      throw new Error(`X login failed: ${error.message}`);
    }
  }

  /**
   * Click the "Next" button during login
   * @returns {Promise<boolean>} True if clicked
   */
  async clickNextButton() {
    const selectors = [
      'div[role="button"]:has-text("Next")',
      'button:has-text("Next")',
      '[data-testid="LoginForm_Login_Button"]',
    ];
    for (const selector of selectors) {
      try {
        await this.browser.waitForSelector(selector, { timeout: 5000 });
        await this.browser.click(selector);
        this.logger.info(`Clicked "Next" button with selector: ${selector}`);
        return true;
      } catch (err) {
        this.logger.debug(`"Next" button selector failed: ${selector}`);
      }
    }
    return false;
  }

  /**
   * Click the "Log in" button during login
   * @returns {Promise<boolean>} True if clicked
   */
  async clickLoginButton() {
    const selectors = [
      'div[role="button"]:has-text("Log in")',
      'button:has-text("Log in")',
      '[data-testid="LoginForm_Login_Button"]',
    ];
    for (const selector of selectors) {
      try {
        await this.browser.waitForSelector(selector, { timeout: 5000 });
        await this.browser.click(selector);
        this.logger.info(`Clicked "Log in" button with selector: ${selector}`);
        return true;
      } catch (err) {
        this.logger.debug(`"Log in" button selector failed: ${selector}`);
      }
    }
    return false;
  }
  
  /**
   * Start polling for new content
   */
  startPolling() {
    if (this.timerId) {
      this.stopPolling();
    }
    
    const runPolling = async () => {
      try {
        await this.pollXProfile();
        this.scheduleNextPoll();
      } catch (error) {
        this.logger.error('Error in polling cycle:', error);
        this.stats.failedRuns++;
        this.stats.lastError = error.message;
        
        // Emit error event
        this.eventBus.emit('scraper.error', {
          error,
          timestamp: new Date(),
          stats: this.getStats()
        });
        
        // Schedule retry with exponential backoff
        this.scheduleRetry();
      }
    };
    
    // Start first poll immediately
    runPolling();
  }
  
  /**
   * Stop polling
   */
  stopPolling() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
      this.nextPollTimestamp = null;
    }
  }
  
  /**
   * Schedule next polling cycle
   */
  scheduleNextPoll() {
    const interval = this.getNextInterval();
    this.nextPollTimestamp = Date.now() + interval;
    this.timerId = setTimeout(async () => {
      if (this.isRunning) {
        await this.pollXProfile();
        this.scheduleNextPoll();
      }
    }, interval);
    
    this.logger.debug(`Next X poll scheduled in ${interval}ms`);
  }
  
  /**
   * Schedule retry after error
   */
  scheduleRetry() {
    const retryInterval = Math.min(this.maxInterval, this.minInterval * 2);
    this.nextPollTimestamp = Date.now() + retryInterval;
    this.timerId = setTimeout(async () => {
      if (this.isRunning) {
        try {
          await this.pollXProfile();
          this.scheduleNextPoll(); // Resume normal scheduling on success
        } catch (error) {
          this.scheduleRetry(); // Continue retry on failure
        }
      }
    }, retryInterval);
    
    this.logger.info(`Retry scheduled in ${retryInterval}ms`);
  }
  
  /**
   * Get next polling interval with jitter
   * @returns {number} Interval in milliseconds
   */
  getNextInterval() {
    const jitter = Math.random() * 0.2 - 0.1; // ±10% jitter
    const baseInterval = this.minInterval + Math.random() * (this.maxInterval - this.minInterval);
    return Math.floor(baseInterval * (1 + jitter));
  }
  
  /**
   * Poll X profile for new content
   * @returns {Promise<void>}
   */
  async pollXProfile() {
    this.nextPollTimestamp = null;
    this.stats.totalRuns++;
    this.stats.lastRunTime = new Date();
    
    try {
      this.logger.info(`Polling X profile: @${this.xUser}`);
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const sinceDate = yesterday.toISOString().split('T')[0];

      // Verify authentication before searching
      await this.verifyAuthentication();
      
      // Always use search for normal post detection
      const searchUrl = `https://x.com/search?q=(from%3A${this.xUser})%20since%3A${sinceDate}&f=live&pf=on&src=typed_query`;
      this.logger.info(`Navigating to search URL: ${searchUrl}`);
      await this.browser.goto(searchUrl);
      
      // If enhanced retweet processing is enabled, we could add additional logic here
      // but the primary search should always run for normal posts
      const shouldProcessRetweets = this.shouldProcessRetweets();
      if (shouldProcessRetweets) {
        this.logger.info('Enhanced retweet detection enabled (search-based approach)');
      }
      
      // Wait for content to load - try multiple selectors
      const contentSelectors = [
        'article[data-testid="tweet"]',
        'article[role="article"]',
        'div[data-testid="cellInnerDiv"]',
        'main[role="main"]'
      ];
      
      let contentLoaded = false;
      for (const selector of contentSelectors) {
        try {
          await this.browser.waitForSelector(selector, { timeout: 5000 });
          this.logger.debug(`Content loaded, found selector: ${selector}`);
          contentLoaded = true;
          break;
        } catch (err) {
          this.logger.debug(`Selector not found: ${selector}`);
          continue;
        }
      }
      
      if (!contentLoaded) {
        this.logger.warn('No content selectors found, proceeding anyway');
      }
      
      // Scroll down to load more tweets
      for (let i = 0; i < 3; i++) {
        await this.browser.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for content to load
      }
      
      // Extract tweets
      const tweets = await this.extractTweets();
      this.stats.totalTweetsFound += tweets.length;
      
      this.logger.info(`Found ${tweets.length} tweets from @${this.xUser}`);
      
      // Process new tweets
      const newTweets = this.filterNewTweets(tweets);
      
      this.logger.info(`After filtering: ${newTweets.length} new tweets out of ${tweets.length} total tweets`);
      
      for (const tweet of newTweets) {
        try {
          await this.processNewTweet(tweet);
          this.stats.totalTweetsAnnounced++;
        } catch (error) {
          this.logger.error(`Error processing tweet ${tweet.tweetID}:`, error);
        }
      }
      
      this.stats.successfulRuns++;
      
      // Emit poll completion event
      this.eventBus.emit('scraper.poll.completed', {
        timestamp: new Date(),
        tweetsFound: tweets.length,
        newTweets: newTweets.length,
        stats: this.getStats()
      });

      const nextInterval = this.getNextInterval();
      const nextRunTime = new Date(Date.now() + nextInterval);
      
      const supportChannelId = this.config.get('DISCORD_BOT_SUPPORT_LOG_CHANNEL');
      if (supportChannelId) {
        this.discord.sendMessage(supportChannelId, `X scraper run finished. Next run in ~${Math.round(nextInterval / 60000)} minutes, at ${nextRunTime.toLocaleTimeString()}`);
      }
      
    } catch (error) {
      this.logger.error('Error polling X profile:', error);
      throw error;
    }
  }
  
  /**
   * Extract tweets from current page
   * @returns {Promise<Array>} Array of tweet objects
   */
  async extractTweets() {
    const shouldProcessRetweets = this.shouldProcessRetweets();
    
    // Debug: Log current page info
    const pageInfo = await this.browser.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        bodyText: document.body.innerText.substring(0, 500),
        hasLoginForm: !!document.querySelector('input[name="text"]'),
        hasErrorMessage: !!document.querySelector('[role="alert"]'),
        articleCount: document.querySelectorAll('article').length,
        divCount: document.querySelectorAll('div[data-testid="cellInnerDiv"]').length
      };
    });
    
    this.logger.info('Page debug info:', pageInfo);
    
    return await this.browser.evaluate((shouldProcessRetweets) => {
      const tweets = [];
      
      // Try multiple selectors for tweet articles (X keeps changing these)
      const articleSelectors = [
        'article[data-testid="tweet"]',
        'article[role="article"]',
        'div[data-testid="cellInnerDiv"] article',
        'article'
      ];
      
      let articles = [];
      for (const selector of articleSelectors) {
        articles = document.querySelectorAll(selector);
        if (articles.length > 0) {
          console.log(`Found ${articles.length} articles using selector: ${selector}`);
          break;
        }
      }
      
      if (articles.length === 0) {
        console.log('No tweet articles found with any selector');
        console.log('Page title:', document.title);
        console.log('Body text preview:', document.body.innerText.substring(0, 200));
        return tweets;
      }
      
      for (const article of articles) {
        try {
          // Extract tweet URL with multiple selectors
          const linkSelectors = [
            'a[href*="/status/"]',
            'time[datetime] + a',
            'a[role="link"][href*="/status/"]'
          ];
          
          let tweetLink = null;
          for (const selector of linkSelectors) {
            tweetLink = article.querySelector(selector);
            if (tweetLink) break;
          }
          
          if (!tweetLink) continue;
          
          const url = tweetLink.href;
          const tweetIdMatch = url.match(/status\/(\d+)/);
          if (!tweetIdMatch) continue;
          
          const tweetID = tweetIdMatch[1];
          
          // Extract author with multiple selectors
          const authorSelectors = [
            '[data-testid="User-Name"] a',
            '[data-testid="User-Names"] a',
            'a[role="link"][href^="/"]',
            'div[dir="ltr"] span'
          ];
          
          let author = 'Unknown';
          for (const selector of authorSelectors) {
            const authorElement = article.querySelector(selector);
            if (authorElement && authorElement.textContent.trim()) {
              author = authorElement.textContent.trim();
              break;
            }
          }
          
          // Extract text content with multiple selectors
          const textSelectors = [
            '[data-testid="tweetText"]',
            '[lang] span',
            'div[dir="ltr"]',
            'span[dir="ltr"]'
          ];
          
          let text = '';
          for (const selector of textSelectors) {
            const textElement = article.querySelector(selector);
            if (textElement && textElement.innerText) {
              text = textElement.innerText;
              break;
            }
          }
          
          // Extract timestamp
          const timeElement = article.querySelector('time');
          const timestamp = timeElement ? timeElement.getAttribute('datetime') : null;
          
          // Determine tweet category
          let tweetCategory = 'Post';
          
          // Check for reply indicators
          let isReply = text.startsWith('@');
          if (!isReply) {
            // Check for "Replying to" text content in the article
            const allText = article.innerText || '';
            isReply = allText.includes('Replying to') || allText.includes('Show this thread');
          }
          
          if (isReply) {
            tweetCategory = 'Reply';
          }
          
          // Check for quote tweet
          const quoteTweetBlock = article.querySelector('div[role="link"][tabindex="0"] a[href*="/status/"]');
          if (quoteTweetBlock && quoteTweetBlock.href !== url) {
            tweetCategory = 'Quote';
          }
          
          // Check for retweet
          if (text.includes('RT @') || text.startsWith('RT @')) {
            tweetCategory = 'Retweet';
          }
          
          const tweetData = {
            tweetID,
            url,
            author,
            text,
            timestamp,
            tweetCategory
          };
          
          // Add retweet metadata if available
          if (retweetMetadata) {
            tweetData.retweetMetadata = retweetMetadata;
          }
          
          tweets.push(tweetData);
          
          console.log(`Extracted tweet: ${tweetID} - ${tweetCategory} - ${text.substring(0, 50)}...`);
          
        } catch (error) {
          console.error('Error extracting tweet:', error);
        }
      }
      
      console.log(`Total tweets extracted: ${tweets.length}`);
      return tweets;
    }, shouldProcessRetweets);
  }
  
  /**
   * Filter tweets to only include new ones
   * @param {Array} tweets - All extracted tweets
   * @returns {Array} New tweets only
   */
  filterNewTweets(tweets) {
    const newTweets = [];
    let duplicateCount = 0;
    let oldContentCount = 0;
    
    this.logger.debug(`Starting to filter ${tweets.length} tweets`);
    
    for (const tweet of tweets) {
      if (!this.duplicateDetector.isDuplicate(tweet.url)) {
        // Mark as seen immediately to prevent future duplicates
        this.duplicateDetector.markAsSeen(tweet.url);
        
        // Check if tweet is new enough based on bot start time
        if (this.isNewContent(tweet)) {
          newTweets.push(tweet);
          this.logger.debug(`Added new tweet: ${tweet.tweetID} - ${tweet.text.substring(0, 50)}...`);
        } else {
          oldContentCount++;
          this.logger.debug(`Filtered out old tweet: ${tweet.tweetID} - timestamp: ${tweet.timestamp}`);
        }
      } else {
        duplicateCount++;
        this.logger.debug(`Filtered out duplicate tweet: ${tweet.tweetID}`);
      }
    }
    
    this.logger.info(`Filtering results: ${newTweets.length} new, ${duplicateCount} duplicates, ${oldContentCount} old content`);
    
    return newTweets;
  }
  
  /**
   * Check if content is new enough to announce
   * @param {Object} tweet - Tweet object
   * @returns {boolean} True if content is new
   */
  isNewContent(tweet) {
    const announceOldTweets = this.config.getBoolean('ANNOUNCE_OLD_TWEETS', false);
    
    // If configured to announce old tweets, consider all tweets as new
    if (announceOldTweets) {
      this.logger.debug(`ANNOUNCE_OLD_TWEETS=true, considering tweet ${tweet.tweetID} as new`);
      return true;
    }
    
    const botStartTime = this.state.get('botStartTime');
    if (!botStartTime) {
      this.logger.debug(`No bot start time set, considering tweet ${tweet.tweetID} as new`);
      return true; // If no start time set, consider all content new
    }
    
    if (!tweet.timestamp) {
      this.logger.debug(`No timestamp for tweet ${tweet.tweetID}, considering as new`);
      return true; // If no timestamp available, assume it's new
    }
    
    const tweetTime = new Date(tweet.timestamp);
    const isNew = tweetTime >= botStartTime;
    
    this.logger.debug(`Tweet ${tweet.tweetID}: tweetTime=${tweetTime.toISOString()}, botStartTime=${botStartTime.toISOString()}, isNew=${isNew}`);
    
    return isNew;
  }
  
  /**
   * Check if enhanced retweet processing should be enabled
   * @returns {boolean} True if retweet processing is enabled
   */
  shouldProcessRetweets() {
    return this.config.getBoolean('ENABLE_RETWEET_PROCESSING', true);
  }
  
  /**
   * Process a new tweet
   * @param {Object} tweet - Tweet object
   * @returns {Promise<void>}
   */
  async processNewTweet(tweet) {
    try {
      // Prepare metadata for classification
      const metadata = {
        timestamp: tweet.timestamp,
        author: tweet.author
      };
      
      // Add retweet metadata if available from enhanced detection
      if (tweet.retweetMetadata) {
        metadata.isRetweet = tweet.tweetCategory === 'Retweet';
        metadata.retweetDetection = tweet.retweetMetadata;
      }
      
      // Classify the tweet
      const classification = this.classifier.classifyXContent(tweet.url, tweet.text, metadata);
      
      // Create content object for announcement
      const content = {
        platform: 'x',
        type: classification.type,
        id: tweet.tweetID,
        url: tweet.url,
        author: tweet.author,
        text: tweet.text,
        timestamp: tweet.timestamp,
        isOld: !this.isNewContent(tweet)
      };
      
      // Announce the content
      const result = await this.announcer.announceContent(content);
      
      if (result.success) {
        this.logger.info(`Announced ${classification.type} from @${tweet.author}: ${tweet.tweetID}`);
      } else if (result.skipped) {
        this.logger.debug(`Skipped ${classification.type} from @${tweet.author}: ${result.reason}`);
      } else {
        this.logger.warn(`Failed to announce ${classification.type} from @${tweet.author}: ${result.reason}`);
      }
      
      // Emit tweet processed event
      this.eventBus.emit('scraper.tweet.processed', {
        tweet: content,
        classification,
        result,
        timestamp: new Date()
      });
      
    } catch (error) {
      this.logger.error(`Error processing tweet ${tweet.tweetID}:`, error);
      throw error;
    }
  }
  
  /**
   * Handle email verification screen
   * @returns {Promise<void>}
   */
  async handleEmailVerification() {
    try {
      this.logger.info('Handling email verification screen...');
      
      // Get email from configuration
      const email = this.config.get('TWITTER_EMAIL') || this.config.get('TWITTER_USERNAME');
      if (!email || !email.includes('@')) {
        this.logger.warn('No valid email found in configuration for email verification');
        throw new Error('Email verification required but no email configured');
      }
      
      // Look for email input field - X uses a generic text input for email/phone
      const emailInputSelectors = [
        'input[data-testid="ocfEnterTextTextInput"]',  // X's email verification input
        'input[name="text"]',                          // Fallback generic text input
        'input[name="email"]',
        'input[type="email"]',
        'input[placeholder*="email" i]'
      ];
      
      let emailInput = null;
      for (const selector of emailInputSelectors) {
        try {
          await this.browser.waitForSelector(selector, { timeout: 5000 });
          emailInput = selector;
          this.logger.debug(`Found email input with selector: ${selector}`);
          break;
        } catch (err) {
          this.logger.debug(`Email input selector failed: ${selector}`);
          continue;
        }
      }
      
      if (!emailInput) {
        this.logger.warn('Could not find email input field, proceeding anyway');
        return;
      }
      
      // Enter email
      await this.browser.type(emailInput, email);
      this.logger.info(`Entered email: ${email}`);
      
      // Look for and click continue/next button
      const continueButtonSelectors = [
        'div[role="button"]:has-text("Next")',
        'button:has-text("Next")',
        'div[role="button"]:has-text("Continue")',
        'button:has-text("Continue")',
        '[data-testid="ocf_submit_button"]',
        'button[type="submit"]'
      ];
      
      let continueClicked = false;
      for (const selector of continueButtonSelectors) {
        try {
          await this.browser.waitForSelector(selector, { timeout: 5000 });
          await this.browser.click(selector);
          this.logger.info(`Clicked continue button using selector: ${selector}`);
          continueClicked = true;
          break;
        } catch (err) {
          this.logger.debug(`Continue button selector failed: ${selector}`);
          continue;
        }
      }
      
      if (!continueClicked) {
        this.logger.warn('Could not find continue button after email entry');
      }
      
      // Wait a bit for the next screen to load
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      this.logger.error('Error handling email verification:', error.message);
      throw error;
    }
  }

  /**
   * Verify authentication status
   * @returns {Promise<void>}
   */
  async verifyAuthentication() {
    try {
      this.logger.debug('Verifying X authentication status...');
      
      // Navigate to home page to check authentication
      await this.browser.goto('https://x.com/home');
      
      // Check for login indicators vs authenticated indicators
      const authStatus = await this.browser.evaluate(() => {
        return {
          hasLoginForm: !!document.querySelector('input[name="text"]'),
          hasLoginButton: !!document.querySelector('[data-testid="LoginForm_Login_Button"]'),
          hasHomeTimeline: !!document.querySelector('[data-testid="AppTabBar_Home_Link"]'),
          hasUserMenu: !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]'),
          pageTitle: document.title,
          bodyText: document.body.innerText.substring(0, 200)
        };
      });
      
      this.logger.debug('Authentication status:', authStatus);
      
      if (authStatus.hasLoginForm || authStatus.hasLoginButton) {
        this.logger.warn('Not authenticated - login form detected, re-authenticating...');
        await this.loginToX();
      } else if (authStatus.hasHomeTimeline || authStatus.hasUserMenu) {
        this.logger.debug('✅ Authentication verified successfully');
      } else {
        this.logger.warn('Authentication status unclear, proceeding anyway');
      }
      
    } catch (error) {
      this.logger.warn('Authentication verification failed:', error.message);
      // Don't throw - let the search attempt continue
    }
  }

  /**
   * Refresh authentication cookies
   * @returns {Promise<void>}
   */
  async refreshAuth() {
    try {
      this.logger.info('Refreshing X authentication...');
      
      // Navigate to home page to refresh session
      await this.browser.goto('https://x.com/home');
      
      // Check if we're still logged in
      const isLoggedIn = await this.browser.evaluate(() => {
        return !document.querySelector('[data-testid="login"]');
      });
      
      if (!isLoggedIn) {
        this.logger.warn('Authentication expired, re-logging in...');
        await this.loginToX();
      }
      
      this.logger.info('Authentication refreshed successfully');
      
    } catch (error) {
      this.logger.error('Failed to refresh authentication:', error);
      throw error;
    }
  }
  
  /**
   * Check if scraper is running
   * @returns {boolean} True if running
   */
  isRunning() {
    return this.isRunning;
  }
  
  /**
   * Get scraper statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      xUser: this.xUser,
      pollingInterval: {
        min: this.minInterval,
        max: this.maxInterval,
        next: this.nextPollTimestamp,
      },
      ...this.stats,
      duplicateDetectorStats: this.duplicateDetector.getStats()
    };
  }
  
  /**
   * Perform enhanced scrolling for comprehensive content loading
   * @returns {Promise<void>}
   */
  async performEnhancedScrolling() {
    // Scroll down multiple times to load more content for retweet detection
    for (let i = 0; i < 5; i++) {
      await this.browser.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(resolve => setTimeout(resolve, 1500)); // Wait for content to load
    }
  }

  /**
   * Navigate to user profile timeline for retweet detection
   * @param {string} username - X username
   * @returns {Promise<void>}
   */
  async navigateToProfileTimeline(username) {
    const profileUrl = `https://x.com/${username}`;
    await this.browser.goto(profileUrl);

    // Wait for timeline to load
    await this.browser.waitForSelector('[data-testid="primaryColumn"]');

    // Perform deeper scrolling for retweets
    await this.performEnhancedScrolling();
  }

  /**
   * Dispose of resources
   * @returns {Promise<void>}
   */
  async dispose() {
    await this.stop();
  }
}