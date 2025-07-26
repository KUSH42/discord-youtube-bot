import { DuplicateDetector } from '../duplicate-detector.js';
import { delay } from '../utils/delay.js';
import { nowUTC, toISOStringUTC, daysAgoUTC } from '../utilities/utc-time.js';
import { getXScrapingBrowserConfig } from '../utilities/browser-config.js';
import { createEnhancedLogger } from '../utilities/enhanced-logger.js';

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
    this.authManager = dependencies.authManager;
    this.delay = dependencies.delay || delay;

    // Create enhanced logger for this module
    this.logger = createEnhancedLogger(
      'scraper',
      dependencies.logger,
      dependencies.debugManager,
      dependencies.metricsManager
    );

    // Scraper configuration
    this.xUser = this.config.getRequired('X_USER_HANDLE');
    this.twitterUsername = this.config.getRequired('TWITTER_USERNAME');
    this.twitterPassword = this.config.getRequired('TWITTER_PASSWORD');

    // Polling configuration
    this.minInterval = parseInt(this.config.get('X_QUERY_INTERVAL_MIN', '300000'), 10);
    this.maxInterval = parseInt(this.config.get('X_QUERY_INTERVAL_MAX', '600000'), 10);

    // State management - accept duplicateDetector dependency
    this.duplicateDetector =
      dependencies.duplicateDetector ||
      new DuplicateDetector(
        dependencies.persistentStorage,
        dependencies.logger?.child({ service: 'DuplicateDetector' })
      );
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

    // Debug logging sampling configuration to prevent Discord spam
    this.debugSamplingRate = parseFloat(this.config.get('X_DEBUG_SAMPLING_RATE', '0.1')); // 10% default
    this.verboseLogSamplingRate = parseFloat(this.config.get('X_VERBOSE_LOG_SAMPLING_RATE', '0.05')); // 5% default
  }

  /**
   * Check if debug logging should be sampled to reduce Discord spam
   * @returns {boolean} True if debug logging should occur
   */
  shouldLogDebug() {
    return Math.random() < this.debugSamplingRate;
  }

  /**
   * Check if verbose logging should be sampled to reduce Discord spam
   * @returns {boolean} True if verbose logging should occur
   */
  shouldLogVerbose() {
    return Math.random() < this.verboseLogSamplingRate;
  }

  /**
   * Start X content monitoring
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Scraper application is already running');
    }

    const operation = this.logger.startOperation('startScraperApplication', {
      xUser: this.xUser,
      pollingInterval: { min: this.minInterval, max: this.maxInterval },
    });

    try {
      operation.progress('Initializing browser for X scraping');
      await this.initializeBrowser();

      operation.progress('Performing initial authentication');
      await this.ensureAuthenticated();

      operation.progress('Initializing with recent content to prevent old announcements');
      await this.initializeRecentContent();

      operation.progress('Starting polling and health monitoring');
      this.startPolling();
      this.startHealthMonitoring();

      this.isRunning = true;

      // Emit start event
      this.eventBus.emit('scraper.started', {
        startTime: nowUTC(),
        xUser: this.xUser,
        pollingInterval: this.getNextInterval(),
      });

      return operation.success('X scraper application started successfully', {
        xUser: this.xUser,
        pollingIntervalMs: this.getNextInterval(),
      });
    } catch (error) {
      operation.error(error, 'Failed to start scraper application');
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

      // Stop health monitoring
      this.stopHealthMonitoring();

      // Stop polling
      this.stopPolling();

      // Close browser
      await this.closeBrowser();

      this.isRunning = false;
      this.logger.info('X scraper application stopped');

      // Emit stop event
      this.eventBus.emit('scraper.stopped', {
        stopTime: nowUTC(),
        stats: this.getStats(),
      });
    } catch (error) {
      this.logger.error('Error stopping scraper application:', error);
    }
  }

  /**
   * Restart the scraper application with retry logic
   * @param {Object} options - Restart options
   * @param {number} options.maxRetries - Maximum restart attempts (default: 3)
   * @param {number} options.baseDelay - Base delay between restart attempts (default: 5000ms)
   * @returns {Promise<void>}
   */
  async restart(options = {}) {
    const { maxRetries = 3, baseDelay = 5000 } = options;

    this.logger.info('Restarting X scraper application...');

    // Stop current instance
    await this.stop();

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.info(`Restart attempt ${attempt}/${maxRetries}`);
        await this.start();
        this.logger.info('✅ Scraper application restarted successfully');
        return;
      } catch (error) {
        this.logger.error(`Restart attempt ${attempt} failed:`, error.message);

        if (attempt === maxRetries) {
          this.logger.error(`Failed to restart scraper after ${maxRetries} attempts`);
          throw new Error(`Scraper restart failed after ${maxRetries} attempts: ${error.message}`);
        }

        const delay = baseDelay * Math.pow(2, attempt - 1);
        this.logger.info(`Waiting ${delay}ms before next restart attempt...`);
        await this.delay(delay);
      }
    }
  }

  /**
   * Start periodic health monitoring with automatic recovery
   * @param {number} intervalMs - Health check interval in milliseconds (default: 300000 = 5 minutes)
   */
  startHealthMonitoring(intervalMs = 300000) {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.logger.info(`Starting health monitoring (check every ${intervalMs / 1000}s)`);

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        this.logger.error('Health check failed:', error.message);
        await this.handleHealthCheckFailure(error);
      }
    }, intervalMs);
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.logger.info('Health monitoring stopped');
    }
  }

  /**
   * Perform health check on the scraper
   * @returns {Promise<Object>} Health check results
   */
  async performHealthCheck() {
    const health = {
      timestamp: nowUTC(),
      isRunning: this.isRunning,
      authenticated: false,
      browserHealthy: false,
      errors: [],
    };

    try {
      // Check if application is running
      if (!this.isRunning) {
        health.errors.push('Application not running');
        return health;
      }

      // Check browser health
      if (this.browser && this.browser.isConnected()) {
        health.browserHealthy = true;
      } else {
        health.errors.push('Browser not available or closed');
      }

      // Check authentication status
      if (health.browserHealthy) {
        try {
          const authStatus = await this.authManager.isAuthenticated();
          health.authenticated = authStatus;
          if (!authStatus) {
            health.errors.push('Authentication verification failed');
          }
        } catch (error) {
          health.errors.push(`Authentication check failed: ${error.message}`);
        }
      }
    } catch (error) {
      health.errors.push(`Health check error: ${error.message}`);
    }

    return health;
  }

  /**
   * Handle health check failure with automatic recovery
   * @param {Error} error - The health check error
   */
  async handleHealthCheckFailure(error) {
    this.logger.warn('Attempting automatic recovery due to health check failure');

    try {
      // Attempt to restart the scraper
      await this.restart({ maxRetries: 2, baseDelay: 3000 });
      this.logger.info('✅ Automatic recovery successful');
    } catch (recoveryError) {
      this.logger.error('❌ Automatic recovery failed:', recoveryError.message);

      // Emit event for external monitoring
      this.eventBus.emit('scraper.recovery.failed', {
        originalError: error.message,
        recoveryError: recoveryError.message,
        timestamp: nowUTC(),
      });
    }
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
   * Initialize browser for scraping
   * @returns {Promise<void>}
   */
  async initializeBrowser() {
    const operation = this.logger.startOperation('initializeBrowser', {
      headless: false,
    });

    try {
      const browserOptions = getXScrapingBrowserConfig({
        headless: false,
      });

      operation.progress('Launching browser with X scraping configuration');
      await this.browser.launch(browserOptions);

      const userAgent =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

      operation.progress('Setting user agent for stealth browsing');
      await this.browser.setUserAgent(userAgent);

      operation.success('Browser initialized for X scraping', {
        userAgent: `${userAgent.substring(0, 50)}...`,
      });
    } catch (error) {
      operation.error(error, 'Failed to initialize browser');
      throw error;
    }
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
          timestamp: nowUTC(),
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
      if (!this.isRunning) {
        return;
      }
      try {
        await this.pollXProfile();
        this.scheduleNextPoll();
      } catch (error) {
        this.logger.error('Unhandled error in scheduled poll, rescheduling with retry:', error);
        this.scheduleRetry();
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
      if (!this.isRunning) {
        return;
      }
      try {
        await this.pollXProfile();
        this.scheduleNextPoll(); // Resume normal scheduling on success
      } catch (error) {
        this.logger.error('Unhandled error in scheduled retry, rescheduling:', error);
        this.scheduleRetry(); // Continue retry on failure
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
    this.stats.lastRunTime = nowUTC();

    const operation = this.logger.startOperation('pollXProfile', {
      xUser: this.xUser,
      runNumber: this.stats.totalRuns,
    });

    try {
      const yesterday = daysAgoUTC(1);
      yesterday.toISOString().split('T')[0]; // Used for search URL generation

      operation.progress('Verifying authentication before polling');
      await this.verifyAuthentication();

      operation.progress('Navigating to X search page');
      const searchUrl = this.generateSearchUrl(true);
      await this.browser.goto(searchUrl);

      operation.progress('Waiting for content to load');
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
          contentLoaded = true;
          break;
        } catch {
          continue;
        }
      }

      if (!contentLoaded) {
        operation.progress('No content selectors found, proceeding anyway');
      }

      operation.progress('Scrolling to load additional content');
      for (let i = 0; i < 3; i++) {
        /* eslint-disable no-undef */
        await this.browser.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        /* eslint-enable no-undef */
        await this.delay(3000);
      }

      operation.progress('Extracting tweets from page');
      const tweets = await this.extractTweets();
      this.stats.totalTweetsFound += tweets.length;

      operation.progress('Filtering for new tweets only');
      const newTweets = await this.filterNewTweets(tweets);

      operation.progress(`Processing ${newTweets.length} new tweets`);
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
        timestamp: nowUTC(),
        tweetsFound: tweets.length,
        newTweets: newTweets.length,
        stats: this.getStats(),
      });

      operation.progress('Performing enhanced retweet detection');
      await this.performEnhancedRetweetDetection();

      const nextInterval = this.getNextInterval();
      const nextRunTime = new Date(Date.now() + nextInterval);
      const nextRunTimeFormatted = nextRunTime.toISOString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      operation.success('X profile polling completed successfully', {
        tweetsFound: tweets.length,
        newTweets: newTweets.length,
        nextRunInMs: nextInterval,
        nextRunTime: nextRunTimeFormatted,
      });

      if (nextInterval < 180000) {
        this.logger.info(
          `X scraper run finished. Next run in ~${Math.round(nextInterval / 1000)} seconds, at ${nextRunTimeFormatted}`
        );
      } else {
        this.logger.info(
          `X scraper run finished. Next run in ~${Math.round(nextInterval / 60000)} minutes, at ${nextRunTimeFormatted}`
        );
      }
    } catch (error) {
      operation.error(error, 'Error polling X profile', {
        xUser: this.xUser,
        runNumber: this.stats.totalRuns,
      });
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
      this.logger.debug('Performing enhanced retweet detection...');
      await this.navigateToProfileTimeline(this.xUser);

      const tweets = await this.extractTweets();
      this.logger.info(`Found ${tweets.length} potential retweets on profile page.`);

      const newTweets = await this.filterNewTweets(tweets);
      this.logger.info(`Found ${newTweets.length} new tweets during enhanced retweet detection.`);

      for (const tweet of newTweets) {
        // Reduce debug frequency for tweet checking
        if (this.shouldLogDebug()) {
          this.logger.debug(`Checking tweet ${tweet.tweetID}, category: ${tweet.tweetCategory}`);
        }
        if (await this.isNewContent(tweet)) {
          this.logger.info(`✅ Found new tweet to process: ${tweet.url} (${tweet.tweetCategory})`);
          await this.processNewTweet(tweet);
          this.stats.totalTweetsAnnounced++;
        } else {
          // Reduce frequency of old tweet skip logs
          if (this.shouldLogVerbose()) {
            this.logger.debug(`Skipping tweet ${tweet.tweetID} as it is old.`);
          }
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
    try {
      const result = await this.browser.evaluate(monitoredUser => {
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
            break;
          }
        }

        if (articles.length === 0) {
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
          } catch (_err) {
            // console.error('Error extracting tweet:', _err);
          }
        }
        return tweets;
        /* eslint-enable no-undef */
      }, monitoredUser);

      // Ensure we always return an array, even if browser.evaluate returns undefined
      return Array.isArray(result) ? result : [];
    } catch (error) {
      this.logger.error('Error extracting tweets', { error: error.message, stack: error.stack });
      // Return empty array on error to prevent undefined issues
      return [];
    }
  }

  /**
   * Filter tweets to only include new ones
   * @param {Array} tweets - All extracted tweets
   * @returns {Promise<Array>} New tweets only
   */
  async filterNewTweets(tweets) {
    const newTweets = [];
    let duplicateCount = 0;
    let oldContentCount = 0;

    this.logger.debug(`Starting to filter ${tweets.length} tweets`);

    for (const tweet of tweets) {
      if (!(await this.duplicateDetector.isDuplicate(tweet.url))) {
        // Mark as seen immediately to prevent future duplicates
        this.duplicateDetector.markAsSeen(tweet.url);

        // Check if tweet is new enough based on bot start time
        if (await this.isNewContent(tweet)) {
          newTweets.push(tweet);
          this.logger.verbose(`Added new tweet: ${tweet.tweetID} - ${tweet.text.substring(0, 50)}...`);
        } else {
          oldContentCount++;
          // Reduce frequency of old tweet filtering logs
          this.logger.verbose(`Filtered out old tweet: ${tweet.tweetID} - timestamp: ${tweet.timestamp}`);
        }
      } else {
        duplicateCount++;
        // Reduce frequency of duplicate filtering logs
        this.logger.verbose(`Filtered out duplicate tweet: ${tweet.tweetID}`);
      }
    }

    this.logger.debug(
      `Filtering results: ${newTweets.length} new, ${duplicateCount} duplicates, ${oldContentCount} old content`
    );

    return newTweets;
  }

  /**
   * Check if content is new enough to announce
   * Uses duplicate detection and reasonable time windows instead of strict bot startup time
   * @param {Object} tweet - Tweet object
   * @returns {Promise<boolean>} True if content is new
   */
  async isNewContent(tweet) {
    const announceOldTweets = this.config.getBoolean('ANNOUNCE_OLD_TWEETS', false);

    // If configured to announce old tweets, consider all tweets as new
    if (announceOldTweets) {
      this.logger.debug(`ANNOUNCE_OLD_TWEETS=true, considering tweet ${tweet.tweetID} as new`);
      return true;
    }

    // Check: Have we seen this tweet before? (Primary duplicate detection)
    if (tweet.url && (await this.duplicateDetector.isDuplicate(tweet.url))) {
      this.logger.debug(`Tweet ${tweet.tweetID} already known (duplicate), not new`);
      return false;
    }

    // Check: Is the content too old based on configurable backoff duration?
    const backoffHours = this.config.get('CONTENT_BACKOFF_DURATION_HOURS', '2'); // Default 2 hours
    const backoffMs = parseInt(backoffHours) * 60 * 60 * 1000;
    const cutoffTime = new Date(Date.now() - backoffMs);

    if (tweet.timestamp) {
      const tweetTime = new Date(tweet.timestamp);
      if (tweetTime < cutoffTime) {
        this.logger.debug(
          `Tweet ${tweet.tweetID} is too old (${tweetTime.toISOString()} < ${cutoffTime.toISOString()}), not new`
        );
        return false;
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
    const operation = this.logger.startOperation('processNewTweet', {
      tweetId: tweet.tweetID,
      author: tweet.author,
      category: tweet.tweetCategory,
      monitoredUser: this.xUser,
    });

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

      operation.progress('Classifying tweet content');
      // Check if this is a retweet based on author comparison (bypass classifier)
      let classification;
      if (
        tweet.tweetCategory === 'Retweet' &&
        tweet.author !== this.xUser &&
        tweet.author !== `@${this.xUser}` &&
        tweet.author !== 'Unknown'
      ) {
        // Bypass classifier for author-based retweets - send directly to retweet channel
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
        classification = this.classifier.classifyXContent(tweet.url, tweet.text, metadata);
      }

      operation.progress('Creating content object for announcement');
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
        isOld: !(await this.isNewContent(tweet)),
      };

      operation.progress('Announcing content to Discord');
      const result = await this.announcer.announceContent(content);

      operation.progress('Marking tweet as seen to prevent reprocessing');
      if (tweet.url) {
        this.duplicateDetector.markAsSeen(tweet.url);
      }

      // Emit tweet processed event
      this.eventBus.emit('scraper.tweet.processed', {
        tweet: content,
        classification,
        result,
        timestamp: nowUTC(),
      });

      if (result.success) {
        operation.success(`Announced ${classification.type} from @${tweet.author}`, {
          tweetId: tweet.tweetID,
          classificationType: classification.type,
          announcementResult: result,
        });
      } else if (result.skipped) {
        operation.success(`Skipped ${classification.type} - ${result.reason}`, {
          tweetId: tweet.tweetID,
          skipReason: result.reason,
        });
      } else {
        operation.error(
          new Error(result.reason || 'Unknown announcement failure'),
          `Failed to announce ${classification.type}`,
          {
            tweetId: tweet.tweetID,
            author: tweet.author,
            classificationType: classification.type,
          }
        );
      }
    } catch (error) {
      operation.error(error, `Error processing tweet ${tweet.tweetID}`, {
        tweetId: tweet.tweetID,
        author: tweet.author,
        category: tweet.tweetCategory,
      });
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
      this.logger.info('Verifying X authentication status...');
      const isAuthenticated = await this.authManager.isAuthenticated();
      if (isAuthenticated) {
        this.logger.info('✅ Authentication verified successfully');
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
  async ensureAuthenticated(options = {}) {
    const defaultOptions = {
      maxRetries: 3,
      baseDelay: 2000,
      ...options,
    };

    try {
      await this.authManager.ensureAuthenticated(defaultOptions);
    } catch (err) {
      this.logger.error('Authentication failed after all retry attempts:', err);
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
      const yesterday = daysAgoUTC(1);
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
          if (tweet.url) {
            this.duplicateDetector.markAsSeen(tweet.url);
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

            if (tweetTime && tweetTime >= cutoffTime && tweet.url) {
              if (!this.duplicateDetector.isDuplicate(tweet.url)) {
                this.duplicateDetector.markAsSeen(tweet.url);
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
      this.logger.info(`Content posted after ${toISOStringUTC()} will be announced`);
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
