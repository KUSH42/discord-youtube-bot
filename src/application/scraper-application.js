import { DuplicateDetector } from '../duplicate-detector.js';
import { delay } from '../utils/delay.js';

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
    this.authManager = dependencies.authManager;
    this.delay = dependencies.delay || delay;

    // Scraper configuration
    this.xUser = this.config.getRequired('X_USER_HANDLE');
    this.twitterUsername = this.config.getRequired('TWITTER_USERNAME');
    this.twitterPassword = this.config.getRequired('TWITTER_PASSWORD');

    // Polling configuration
    this.minInterval = parseInt(this.config.get('X_QUERY_INTERVAL_MIN', '300000'), 10);
    this.maxInterval = parseInt(this.config.get('X_QUERY_INTERVAL_MAX', '600000'), 10);

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
      lastError: null,
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
      await this.ensureAuthenticated();

      // Initialize with recent content to prevent announcing old posts
      await this.initializeRecentContent();

      // Start polling
      this.startPolling();

      this.isRunning = true;
      this.logger.info('✅ X scraper application started successfully');

      // Emit start event
      this.eventBus.emit('scraper.started', {
        startTime: new Date(),
        xUser: this.xUser,
        pollingInterval: this.getNextInterval(),
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
        stats: this.getStats(),
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
        '--disable-gpu',
      ],
    };

    // Add display if running in headless environment
    if (process.env.DISPLAY) {
      browserOptions.args.push(`--display=${process.env.DISPLAY}`);
    }

    await this.browser.launch(browserOptions);
    this.logger.info('Browser initialized for X scraping');

    const userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
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
    return this.authManager.login();
  }

  /**
   * Clicks the "Next" button during login
   * @returns {Promise<boolean>}
   */
  async clickNextButton() {
    return this.authManager.clickNextButton();
  }

  /**
   * Clicks the "Log in" button
   * @returns {Promise<boolean>}
   */
  async clickLoginButton() {
    return this.authManager.clickLoginButton();
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
          stats: this.getStats(),
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
          this.logger.error('Error during retry scheduling:', error);
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
      const searchUrl = this.generateSearchUrl(true);
      this.logger.info(`Navigating to search URL: ${searchUrl}`);
      await this.browser.goto(searchUrl);

      // This is the search for normal tweets. Retweet logic should not be invoked here.
      this.logger.info('Executing search for new tweets.');

      // Wait for content to load - try multiple selectors
      const contentSelectors = [
        'article[data-testid="tweet"]',
        'article[role="article"]',
        'div[data-testid="cellInnerDiv"]',
        'main[role="main"]',
      ];

      let contentLoaded = false;
      for (const selector of contentSelectors) {
        try {
          await this.browser.waitForSelector(selector, { timeout: 5000 });
          this.logger.debug(`Content loaded, found selector: ${selector}`);
          contentLoaded = true;
          break;
        } catch {
          this.logger.debug(`Selector not found: ${selector}`);
          continue;
        }
      }

      if (!contentLoaded) {
        this.logger.warn('No content selectors found, proceeding anyway');
      }

      // Scroll down to load more tweets
      for (let i = 0; i < 3; i++) {
        /* eslint-disable no-undef */
        await this.browser.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        /* eslint-enable no-undef */
        await this.delay(3000); // Wait for content to load
      }

      // Extract tweets
      const tweets = await this.extractTweets();
      this.stats.totalTweetsFound += tweets.length;

      this.logger.info(`Found ${tweets.length} tweets from @${this.xUser}`);

      // Process new tweets
      const newTweets = this.filterNewTweets(tweets);

      this.logger.info(`After filtering: ${newTweets.length} new tweets out of ${tweets.length} total tweets`);

      if (newTweets.length > 0) {
        for (const tweet of newTweets) {
          try {
            await this.processNewTweet(tweet);
            this.stats.totalTweetsAnnounced++;
          } catch (error) {
            this.logger.error(`Error processing tweet ${tweet.tweetID}:`, error);
          }
        }
      }

      this.stats.successfulRuns++;

      // Emit poll completion event
      this.eventBus.emit('scraper.poll.completed', {
        timestamp: new Date(),
        tweetsFound: tweets.length,
        newTweets: newTweets.length,
        stats: this.getStats(),
      });

      const nextInterval = this.getNextInterval();
      const nextRunTime = new Date(Date.now() + nextInterval);

      this.logger.info(
        `X scraper run finished. Next run in ~${Math.round(nextInterval / 60000)} minutes, at ${nextRunTime.toLocaleTimeString()}`
      );

      // Perform the enhanced retweet detection as a separate, final step.
      await this.performEnhancedRetweetDetection();
    } catch (error) {
      this.logger.error('Error polling X profile:', error);
      // In case of a major failure, we still want to schedule the next poll
      // to avoid the scraper getting stuck in a failed state.
      this.scheduleNextPoll();
      throw error;
    }
  }

  /**
   * Performs a separate check for retweets by navigating to the user's profile.
   * This is designed to catch retweets that might be missed by the standard search.
   * @returns {Promise<void>}
   */
  async performEnhancedRetweetDetection() {
    try {
      if (!this.shouldProcessRetweets()) {
        return;
      }
      this.logger.info('Performing enhanced retweet detection...');
      await this.navigateToProfileTimeline(this.xUser);

      const tweets = await this.extractTweets();
      this.logger.info(`Found ${tweets.length} potential retweets on profile page.`);

      const newTweets = this.filterNewTweets(tweets);
      this.logger.info(`Found ${newTweets.length} new tweets during enhanced retweet detection.`);

      for (const tweet of newTweets) {
        this.logger.debug(`Checking tweet ${tweet.tweetID}, category: ${tweet.tweetCategory}`);
        if (this.isNewContent(tweet)) {
          this.logger.info(`✅ Found new tweet to process: ${tweet.url} (${tweet.tweetCategory})`);
          await this.processNewTweet(tweet);
          this.stats.totalTweetsAnnounced++;
        } else {
          this.logger.debug(`Skipping tweet ${tweet.tweetID} as it is old.`);
        }
      }
    } catch (error) {
      this.logger.error('Error during enhanced retweet detection:', error);
      // Do not rethrow, as a failure here should not stop the main polling cycle.
    }
  }

  /**
   * Extract tweets from current page
   * @returns {Promise<Array>} Array of tweet objects
   */
  async extractTweets() {
    const monitoredUser = this.xUser; // Pass the monitored user to browser context
    return await this.browser.evaluate(monitoredUser => {
      /* eslint-disable no-undef */
      const tweets = [];

      // Try multiple selectors for tweet articles (X keeps changing these)
      const articleSelectors = [
        'article[data-testid="tweet"]',
        'article[role="article"]',
        'div[data-testid="cellInnerDiv"] article',
        'article',
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
        return tweets;
      }

      for (const article of articles) {
        try {
          // Extract tweet URL with multiple selectors
          const linkSelectors = ['a[href*="/status/"]', 'time[datetime] + a', 'a[role="link"][href*="/status/"]'];

          let tweetLink = null;
          for (const selector of linkSelectors) {
            tweetLink = article.querySelector(selector);
            if (tweetLink) {
              break;
            }
          }

          if (!tweetLink) {
            continue;
          }

          const url = tweetLink.href;
          const tweetIdMatch = url.match(/status\/(\d+)/);
          if (!tweetIdMatch) {
            continue;
          }

          const tweetID = tweetIdMatch[1];

          // Extract author with multiple selectors
          const authorSelectors = [
            '[data-testid="User-Name"] a',
            '[data-testid="User-Names"] a',
            'a[role="link"][href^="/"]',
            'div[dir="ltr"] span',
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
          const textSelectors = ['[data-testid="tweetText"]', '[lang] span', 'div[dir="ltr"]', 'span[dir="ltr"]'];

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

          // Check for retweet - enhanced detection with author comparison
          let isRetweet = false;

          // Method 1: Check if author is different from monitored user
          if (author !== monitoredUser && author !== `@${monitoredUser}` && author !== 'Unknown') {
            isRetweet = true;
          }

          // Method 2: Check for social context element (modern retweet indicator)
          if (!isRetweet) {
            const socialContext = article.querySelector('[data-testid="socialContext"]');
            if (socialContext && socialContext.innerText.includes('reposted')) {
              isRetweet = true;
            }
          }

          // Method 3: Check for classic RT @ pattern
          if (!isRetweet && text.startsWith('RT @')) {
            isRetweet = true;
          }

          if (isRetweet) {
            tweetCategory = 'Retweet';
          }

          tweets.push({
            tweetID,
            url,
            author,
            text,
            timestamp,
            tweetCategory,
          });

          console.log(`Extracted tweet: ${tweetID} - ${tweetCategory} - ${text.substring(0, 50)}...`);
        } catch (err) {
          console.error('Error extracting tweet:', err);
        }
      }

      console.log(`Total tweets extracted: ${tweets.length}`);
      return tweets;
      /* eslint-enable no-undef */
    }, monitoredUser);
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

    this.logger.info(
      `Filtering results: ${newTweets.length} new, ${duplicateCount} duplicates, ${oldContentCount} old content`
    );

    return newTweets;
  }

  /**
   * Check if content is new enough to announce
   * Uses duplicate detection and reasonable time windows instead of strict bot startup time
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

    // First check: Have we seen this tweet before? (Primary duplicate detection)
    if (tweet.tweetID && this.duplicateDetector.isTweetIdKnown(tweet.tweetID)) {
      this.logger.debug(`Tweet ${tweet.tweetID} already known (duplicate), not new`);
      return false;
    }

    // Second check: Is the content too old to be relevant?
    // Use a reasonable time window (e.g., 7 days) instead of bot startup time
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    const cutoffTime = new Date(Date.now() - maxAge);

    if (tweet.timestamp) {
      const tweetTime = new Date(tweet.timestamp);
      if (tweetTime < cutoffTime) {
        this.logger.debug(
          `Tweet ${tweet.tweetID} is too old (${tweetTime.toISOString()} < ${cutoffTime.toISOString()}), not new`
        );
        return false;
      }
    }

    // Third check: For additional safety, still check bot startup time if available
    // but only as a fallback, not as the primary filter
    const botStartTime = this.state.get('botStartTime');
    if (botStartTime && tweet.timestamp) {
      const tweetTime = new Date(tweet.timestamp);

      // If the tweet is very recent (within last 2 hours of bot start), be more permissive
      const twoHoursAfterStart = new Date(botStartTime.getTime() + 2 * 60 * 60 * 1000);
      const now = new Date();

      if (tweetTime < botStartTime && now < twoHoursAfterStart) {
        this.logger.debug(`Tweet ${tweet.tweetID} predates bot start but bot started recently, accepting as new`);
        return true;
      }
    }

    // If no timestamp available, assume it's new (but will be caught by duplicate detection if seen again)
    if (!tweet.timestamp) {
      this.logger.debug(`No timestamp for tweet ${tweet.tweetID}, considering as new`);
      return true;
    }

    this.logger.debug(`Tweet ${tweet.tweetID} passed all checks, considering as new`);
    return true;
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
        author: tweet.author,
        monitoredUser: this.xUser,
      };

      // Add retweet metadata if available from enhanced detection
      if (tweet.retweetMetadata) {
        metadata.isRetweet = tweet.tweetCategory === 'Retweet';
        metadata.retweetDetection = tweet.retweetMetadata;
      }

      // Check if this is a retweet based on author comparison (bypass classifier)
      let classification;
      if (
        tweet.tweetCategory === 'Retweet' &&
        tweet.author !== this.xUser &&
        tweet.author !== `@${this.xUser}` &&
        tweet.author !== 'Unknown'
      ) {
        // Bypass classifier for author-based retweets - send directly to retweet channel
        this.logger.info(`Bypassing classifier for author-based retweet: ${tweet.author} != ${this.xUser}`);
        classification = {
          type: 'retweet',
          confidence: 0.99,
          platform: 'x',
          details: {
            statusId: tweet.tweetID,
            author: tweet.author,
            detectionMethod: 'author-based',
          },
        };
      } else {
        // Use classifier for other tweets
        this.logger.info(
          `Using classifier for tweet: category=${tweet.tweetCategory}, author=${tweet.author}, xUser=${this.xUser}`
        );
        classification = this.classifier.classifyXContent(tweet.url, tweet.text, metadata);
      }

      // Create content object for announcement
      const content = {
        platform: 'x',
        type: classification.type,
        id: tweet.tweetID,
        url: tweet.url,
        author: classification.type === 'retweet' ? this.xUser : tweet.author,
        originalAuthor: tweet.author, // Store original author for retweets
        text: tweet.text,
        timestamp: tweet.timestamp,
        isOld: !this.isNewContent(tweet),
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

      // Mark tweet as seen to prevent future re-processing
      if (tweet.tweetID) {
        this.duplicateDetector.addTweetId(tweet.tweetID);
        this.logger.debug(`Marked tweet ${tweet.tweetID} as seen`);
      }

      // Emit tweet processed event
      this.eventBus.emit('scraper.tweet.processed', {
        tweet: content,
        classification,
        result,
        timestamp: new Date(),
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
        'input[data-testid="ocfEnterTextTextInput"]', // X's email verification input
        'input[name="text"]', // Fallback generic text input
        'input[name="email"]',
        'input[type="email"]',
        'input[placeholder*="email" i]',
      ];

      let emailInput = null;
      for (const selector of emailInputSelectors) {
        try {
          await this.browser.waitForSelector(selector, { timeout: 5000 });
          emailInput = selector;
          this.logger.debug(`Found email input with selector: ${selector}`);
          break;
        } catch {
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
        'button[type="submit"]',
      ];

      let continueClicked = false;
      for (const selector of continueButtonSelectors) {
        try {
          await this.browser.waitForSelector(selector, { timeout: 5000 });
          await this.browser.click(selector);
          this.logger.info(`Clicked continue button using selector: ${selector}`);
          continueClicked = true;
          break;
        } catch {
          this.logger.debug(`Continue button selector failed: ${selector}`);
          continue;
        }
      }

      if (!continueClicked) {
        this.logger.warn('Could not find continue button after email entry');
      }

      // Wait a bit for the next screen to load
      await this.delay(3000);
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
      const isAuthenticated = await this.authManager.isAuthenticated();
      if (isAuthenticated) {
        this.logger.debug('✅ Authentication verified successfully');
        return;
      }

      this.logger.warn('Authentication check failed, re-authenticating...');
      await this.ensureAuthenticated();
    } catch (error) {
      this.logger.error('Authentication verification failed:', error);
      this.logger.info('Attempting to re-authenticate after verification failure...');
      await this.ensureAuthenticated();
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
        /* eslint-disable no-undef */
        return !document.querySelector('[data-testid="login"]');
        /* eslint-enable no-undef */
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
      duplicateDetectorStats: this.duplicateDetector.getStats(),
    };
  }

  /**
   * Perform enhanced scrolling for comprehensive content loading
   * @returns {Promise<void>}
   */
  async performEnhancedScrolling() {
    // Scroll down multiple times to load more content for retweet detection
    for (let i = 0; i < 5; i++) {
      /* eslint-disable no-undef */
      await this.browser.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      /* eslint-enable no-undef */
      await this.delay(1500); // Wait for content to load
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
   * Ensure user is authenticated (alias for loginToX)
   * @returns {Promise<void>}
   */
  async ensureAuthenticated() {
    try {
      await this.authManager.ensureAuthenticated();
    } catch (err) {
      this.logger.error('Authentication failed:', err);
      throw err;
    }
  }

  /**
   * Validate cookie format
   * @param {Array} cookies - Array of cookie objects
   * @returns {boolean} True if cookies are valid
   */
  validateCookieFormat(cookies) {
    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
      return false;
    }

    return cookies.every(cookie => {
      return (
        cookie && typeof cookie === 'object' && typeof cookie.name === 'string' && typeof cookie.value === 'string'
      );
    });
  }

  /**
   * Dispose of resources
   * @returns {Promise<void>}
   */
  /**
   * Generate X search URL
   * @param {boolean} includeDate - Whether to include the since date parameter
   * @returns {string} The search URL
   */
  generateSearchUrl(includeDate = true) {
    let searchUrl = `https://x.com/search?q=(from%3A${this.xUser})`;
    if (includeDate) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const sinceDate = yesterday.toISOString().split('T')[0];
      searchUrl += `%20since%3A${sinceDate}`;
    }
    searchUrl += '&f=live&pf=on&src=typed_query';
    return searchUrl;
  }

  /**
   * Initialize recent content on startup to prevent announcing old posts
   * This scans recent content and marks it as "seen" without announcing it
   * @returns {Promise<void>}
   */
  async initializeRecentContent() {
    try {
      this.logger.info('Initializing with recent content to prevent old post announcements...');

      // Scan recent content based on configuration to mark as seen
      const initializationHours = parseInt(this.config.get('INITIALIZATION_WINDOW_HOURS', '24'), 10);
      const initializationWindow = initializationHours * 60 * 60 * 1000; // Convert hours to milliseconds
      const cutoffTime = new Date(Date.now() - initializationWindow);

      // Navigate to user's profile to get recent content
      await this.navigateToProfileTimeline(this.xUser);

      // Extract recent tweets
      const tweets = await this.extractTweets();
      this.logger.info(`Found ${tweets.length} recent tweets during initialization scan`);

      let markedAsSeen = 0;
      for (const tweet of tweets) {
        // Only mark tweets that are within our initialization window
        const tweetTime = tweet.timestamp ? new Date(tweet.timestamp) : null;

        if (tweetTime && tweetTime >= cutoffTime) {
          // Mark as seen by adding to duplicate detector
          if (tweet.tweetID) {
            this.duplicateDetector.addTweetId(tweet.tweetID);
            markedAsSeen++;
            this.logger.debug(`Marked tweet ${tweet.tweetID} as seen (${tweetTime.toISOString()})`);
          }
        }
      }

      // Also scan for retweets separately to ensure we catch them
      if (this.shouldProcessRetweets()) {
        try {
          const retweetTweets = await this.extractTweets();
          for (const tweet of retweetTweets) {
            const tweetTime = tweet.timestamp ? new Date(tweet.timestamp) : null;

            if (tweetTime && tweetTime >= cutoffTime && tweet.tweetID) {
              if (!this.duplicateDetector.isTweetIdKnown(tweet.tweetID)) {
                this.duplicateDetector.addTweetId(tweet.tweetID);
                markedAsSeen++;
                this.logger.debug(`Marked retweet ${tweet.tweetID} as seen (${tweetTime.toISOString()})`);
              }
            }
          }
        } catch (error) {
          this.logger.warn('Error during retweet initialization scan:', error.message);
        }
      }

      this.logger.info(`✅ Initialization complete: marked ${markedAsSeen} recent posts as seen`);
      this.logger.info(`Content posted after ${new Date().toISOString()} will be announced`);
    } catch (error) {
      this.logger.error('Error during recent content initialization:', error);
      // Don't throw - this is a best-effort initialization
      this.logger.warn('Continuing with normal operation despite initialization error');
    }
  }

  async dispose() {
    await this.stop();
  }
}
