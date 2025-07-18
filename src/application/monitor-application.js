import { DuplicateDetector } from '../duplicate-detector.js';
import crypto from 'crypto';

/**
 * YouTube monitoring application orchestrator
 * Coordinates PubSubHubbub subscriptions, webhook handling, and content announcements
 */
export class MonitorApplication {
  constructor(dependencies) {
    this.youtube = dependencies.youtubeService;
    this.http = dependencies.httpService;
    this.classifier = dependencies.contentClassifier;
    this.announcer = dependencies.contentAnnouncer;
    this.config = dependencies.config;
    this.state = dependencies.stateManager;
    this.eventBus = dependencies.eventBus;
    this.logger = dependencies.logger;

    // YouTube configuration
    this.youtubeChannelId = this.config.getRequired('YOUTUBE_CHANNEL_ID');
    this.youtubeApiKey = this.config.getRequired('YOUTUBE_API_KEY');

    // PubSubHubbub configuration
    this.callbackUrl = this.config.getRequired('PSH_CALLBACK_URL');
    this.webhookSecret = this.config.get('PSH_SECRET', 'your_super_secret_string_here');
    this.verifyToken = this.config.get('PSH_VERIFY_TOKEN', 'your_optional_verify_token');

    // Fallback polling configuration
    this.fallbackPollingInterval = this.config.getNumber('YOUTUBE_API_POLL_INTERVAL_MS', 300000); // Default 5 minutes
    this.fallbackEnabled = true;

    // State management
    this.duplicateDetector = new DuplicateDetector();
    this.isRunning = false;
    this.subscriptionActive = false;
    this.fallbackTimerId = null;

    // Statistics
    this.stats = {
      subscriptions: 0,
      webhooksReceived: 0,
      videosProcessed: 0,
      videosAnnounced: 0,
      fallbackPolls: 0,
      lastSubscriptionTime: null,
      lastWebhookTime: null,
      lastError: null,
      xmlParseFailures: 0,
    };
  }

  /**
   * Start YouTube content monitoring
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Monitor application is already running');
    }

    try {
      this.logger.info('Starting YouTube monitor application...');

      // Validate YouTube API access
      await this.validateYouTubeAccess();

      // Subscribe to PubSubHubbub
      await this.subscribeToPubSubHubbub();

      // Start fallback polling with a delay to allow webhook system to work first
      this.startFallbackPollingWithDelay();

      this.isRunning = true;
      this.logger.info('✅ YouTube monitor application started successfully');

      // Emit start event
      this.eventBus.emit('monitor.started', {
        startTime: new Date(),
        youtubeChannelId: this.youtubeChannelId,
        callbackUrl: this.callbackUrl,
        fallbackEnabled: this.fallbackEnabled,
      });
    } catch (error) {
      this.logger.error('Failed to start monitor application:', error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Stop YouTube content monitoring
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      this.logger.info('Stopping YouTube monitor application...');

      // Stop fallback polling
      this.stopFallbackPolling();

      // Unsubscribe from PubSubHubbub
      await this.unsubscribeFromPubSubHubbub();

      this.isRunning = false;
      this.logger.info('YouTube monitor application stopped');

      // Emit stop event
      this.eventBus.emit('monitor.stopped', {
        stopTime: new Date(),
        stats: this.getStats(),
      });
    } catch (error) {
      this.logger.error('Error stopping monitor application:', error);
    }
  }

  /**
   * Validate YouTube API access
   * @returns {Promise<void>}
   */
  async validateYouTubeAccess() {
    try {
      this.logger.info('Validating YouTube API access...');

      // Test API key by fetching channel details
      const channelDetails = await this.youtube.getChannelDetails(this.youtubeChannelId);

      if (!channelDetails) {
        throw new Error('Failed to fetch YouTube channel details');
      }

      this.logger.info(`YouTube API validated. Monitoring channel: ${channelDetails.snippet?.title || 'Unknown'}`);
    } catch (error) {
      this.logger.error('YouTube API validation failed:', error);
      throw new Error(`YouTube API validation failed: ${error.message}`);
    }
  }

  /**
   * Subscribe to PubSubHubbub for real-time notifications
   * @returns {Promise<void>}
   */
  async subscribeToPubSubHubbub() {
    try {
      this.logger.info('Subscribing to PubSubHubbub...');

      const hubUrl = 'https://pubsubhubbub.appspot.com/subscribe';
      const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${this.youtubeChannelId}`;

      const subscriptionData = new URLSearchParams({
        'hub.callback': this.callbackUrl,
        'hub.topic': topicUrl,
        'hub.verify': 'async',
        'hub.mode': 'subscribe',
        'hub.verify_token': this.verifyToken,
        'hub.lease_seconds': '86400', // 24 hours
      });

      const response = await this.http.post(hubUrl, subscriptionData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (this.http.isSuccessResponse(response)) {
        this.subscriptionActive = true;
        this.stats.subscriptions++;
        this.stats.lastSubscriptionTime = new Date();
        this.logger.info('Successfully subscribed to PubSubHubbub');

        // Schedule subscription renewal
        this.scheduleSubscriptionRenewal();
      } else {
        throw new Error(`Subscription failed with status: ${response.status}`);
      }
    } catch (error) {
      this.logger.error('PubSubHubbub subscription failed:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from PubSubHubbub
   * @returns {Promise<void>}
   */
  async unsubscribeFromPubSubHubbub() {
    if (!this.subscriptionActive) {
      return;
    }

    try {
      this.logger.info('Unsubscribing from PubSubHubbub...');

      const hubUrl = 'https://pubsubhubbub.appspot.com/subscribe';
      const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${this.youtubeChannelId}`;

      const unsubscriptionData = new URLSearchParams({
        'hub.callback': this.callbackUrl,
        'hub.topic': topicUrl,
        'hub.verify': 'async',
        'hub.mode': 'unsubscribe',
        'hub.verify_token': this.verifyToken,
      });

      const response = await this.http.post(hubUrl, unsubscriptionData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (this.http.isSuccessResponse(response)) {
        this.subscriptionActive = false;
        this.logger.info('Successfully unsubscribed from PubSubHubbub');
      } else {
        this.logger.warn(`Unsubscription failed with status: ${response.status}`);
      }
    } catch (error) {
      this.logger.error('PubSubHubbub unsubscription failed:', error);
    }
  }

  /**
   * Schedule automatic subscription renewal
   */
  scheduleSubscriptionRenewal() {
    // Renew subscription every 20 hours (4 hours before expiry)
    setTimeout(
      async () => {
        if (this.isRunning && this.subscriptionActive) {
          try {
            await this.subscribeToPubSubHubbub();
          } catch (error) {
            this.logger.error('Subscription renewal failed:', error);
          }
        }
      },
      20 * 60 * 60 * 1000,
    ); // 20 hours
  }

  /**
   * Start fallback polling with a delay to allow webhook system to work first
   */
  startFallbackPollingWithDelay() {
    if (!this.fallbackEnabled) {
      return;
    }

    // Wait 5 minutes before starting fallback polling to allow webhook system to work
    const delayMs = 5 * 60 * 1000; // 5 minutes

    this.logger.info(`Fallback polling will start in ${delayMs / 1000} seconds as backup to webhook system`);

    setTimeout(() => {
      if (this.isRunning) {
        this.startFallbackPolling();
      }
    }, delayMs);
  }

  /**
   * Start fallback polling for missed notifications
   */
  startFallbackPolling() {
    if (!this.fallbackEnabled) {
      return;
    }

    this.fallbackTimerId = setInterval(async () => {
      try {
        await this.performFallbackCheck();
      } catch (error) {
        this.logger.error('Fallback polling error:', error);
      }
    }, this.fallbackPollingInterval);

    this.logger.info(`Fallback polling started with ${this.fallbackPollingInterval}ms interval`);
  }

  /**
   * Stop fallback polling
   */
  stopFallbackPolling() {
    if (this.fallbackTimerId) {
      clearInterval(this.fallbackTimerId);
      this.fallbackTimerId = null;
      this.logger.info('Fallback polling stopped');
    }
  }

  /**
   * Perform fallback check for new videos
   * @returns {Promise<void>}
   */
  async performFallbackCheck() {
    try {
      this.stats.fallbackPolls++;
      this.logger.warn('Performing fallback check for new videos...');

      // Get latest videos from the channel
      const videos = await this.youtube.getChannelVideos(this.youtubeChannelId, 5);

      if (!videos || videos.length === 0) {
        this.logger.debug('No videos found in fallback check');
        return;
      }

      this.logger.warn(`Fallback check found ${videos.length} videos from YouTube API.`);

      // Process each video
      for (const video of videos) {
        try {
          this.logger.warn(`Processing video from fallback: ${video.snippet.title}`);
          await this.processVideo(video, 'fallback');
        } catch (error) {
          this.logger.error(`Error processing video ${video.id} in fallback:`, error);
        }
      }
    } catch (error) {
      this.logger.error('Fallback check failed:', error);
    }
  }

  /**
   * Handle PubSubHubbub webhook notification
   * @param {Object} request - Webhook request object
   * @returns {Promise<Object>} Response object
   */
  async handleWebhook(request) {
    try {
      this.stats.webhooksReceived++;
      this.stats.lastWebhookTime = new Date();

      this.logger.info('Received PubSubHubbub webhook notification');

      // Verify webhook signature
      const isValid = this.verifyWebhookSignature(request.body, request.headers);
      if (!isValid) {
        this.logger.warn('Webhook signature verification failed');
        return { status: 403, message: 'Invalid signature' };
      }

      // Handle verification request
      if (request.method === 'GET') {
        return this.handleVerificationRequest(request.query);
      }

      // Handle notification
      if (request.method === 'POST') {
        return await this.handleNotification(request.body);
      }

      return { status: 405, message: 'Method not allowed' };
    } catch (error) {
      this.logger.error('Webhook handling error:', error);
      this.stats.lastError = error.message;
      return { status: 500, message: 'Internal server error' };
    }
  }

  /**
   * Verify webhook signature
   * @param {string|Buffer} body - Request body
   * @param {Object} headers - Request headers
   * @returns {boolean} True if signature is valid
   */
  verifyWebhookSignature(body, headers) {
    const signature = headers['x-hub-signature'];
    if (!signature) {
      return false;
    }

    const expectedSignature = 'sha1=' + crypto.createHmac('sha1', this.webhookSecret).update(body).digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  /**
   * Handle verification request from PubSubHubbub hub
   * @param {Object} query - Query parameters
   * @returns {Object} Response object
   */
  handleVerificationRequest(query) {
    const challenge = query['hub.challenge'];
    const verifyToken = query['hub.verify_token'];
    const mode = query['hub.mode'];

    if (verifyToken !== this.verifyToken) {
      this.logger.warn('Verification token mismatch');
      return { status: 403, message: 'Invalid verify token' };
    }

    this.logger.info(`PubSubHubbub verification successful (mode: ${mode})`);
    return { status: 200, body: challenge };
  }

  /**
   * Handle notification from PubSubHubbub
   * @param {string} body - XML notification body
   * @returns {Promise<Object>} Response object
   */
  async handleNotification(body) {
    try {
      // Parse XML to extract video information
      const videoInfo = this.parseNotificationXML(body);

      if (!videoInfo) {
        this.logger.warn('Failed to parse notification XML');
        this.stats.xmlParseFailures++;
        return { status: 400, message: 'Invalid XML' };
      }

      // Fetch detailed video information
      const videoDetails = await this.youtube.getVideoDetails(videoInfo.videoId);

      if (!videoDetails) {
        this.logger.warn(`Could not fetch details for video: ${videoInfo.videoId}`);
        return { status: 200, message: 'OK' };
      }

      // Process the video
      await this.processVideo(videoDetails, 'webhook');

      this.logger.info(`Successfully processed webhook notification for video: ${videoDetails.snippet.title}`);
      return { status: 200, message: 'OK' };
    } catch (error) {
      this.logger.error('Notification processing error:', error);

      // Trigger fallback check on error
      if (this.fallbackEnabled) {
        setImmediate(() => this.performFallbackCheck());
      }

      return { status: 200, message: 'OK' }; // Always return 200 to prevent retry spam
    }
  }

  /**
   * Parse PubSubHubbub notification XML
   * @param {string} xmlBody - XML content
   * @returns {Object|null} Parsed video information
   */
  parseNotificationXML(xmlBody) {
    try {
      // Simple regex-based XML parsing for YouTube feeds
      const videoIdMatch = xmlBody.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
      const titleMatch = xmlBody.match(/<media:title>([^<]+)<\/media:title>/);
      const linkMatch = xmlBody.match(/<link rel="alternate" href="([^"]+)"/);

      if (!videoIdMatch) {
        return null;
      }

      return {
        videoId: videoIdMatch[1],
        title: titleMatch ? titleMatch[1] : null,
        link: linkMatch ? linkMatch[1] : null,
      };
    } catch (error) {
      this.logger.error('XML parsing error:', error);
      return null;
    }
  }

  /**
   * Process a video for potential announcement
   * @param {Object} video - Video object from YouTube API
   * @param {string} source - Source of the video ('webhook' or 'fallback')
   * @returns {Promise<void>}
   */
  async processVideo(video, source = 'unknown') {
    try {
      this.stats.videosProcessed++;

      const videoId = video.id;
      const title = video.snippet?.title || 'Unknown title';
      const url = `https://www.youtube.com/watch?v=${videoId}`;

      // Check for duplicates
      if (this.duplicateDetector.isDuplicate(url)) {
        this.logger.debug(`Duplicate video detected: ${title} (${videoId})`);
        return;
      }

      // Check if video is new enough
      if (!this.isNewContent(video)) {
        this.logger.debug(`Video is too old: ${title} (${videoId})`);
        return;
      }

      // Classify the video
      const classification = this.classifier.classifyYouTubeContent(video);

      // Create content object
      const content = {
        platform: 'youtube',
        type: classification.type,
        id: videoId,
        url: url,
        title: title,
        channelTitle: video.snippet?.channelTitle,
        publishedAt: video.snippet?.publishedAt,
        ...classification.details,
      };

      // Announce the content
      const result = await this.announcer.announceContent(content);

      if (result.success) {
        this.stats.videosAnnounced++;
        this.duplicateDetector.markAsSeen(url);
        this.logger.info(`Announced ${classification.type}: ${title} (${videoId}) via ${source}`);
      } else if (result.skipped) {
        this.logger.debug(`Skipped ${classification.type}: ${title} - ${result.reason}`);
      } else {
        this.logger.warn(`Failed to announce ${classification.type}: ${title} - ${result.reason}`);
      }

      // Emit video processed event
      this.eventBus.emit('monitor.video.processed', {
        video: content,
        classification,
        result,
        source,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error(`Error processing video ${video.id}:`, error);
      throw error;
    }
  }

  /**
   * Check if video content is new enough to announce
   * @param {Object} video - Video object
   * @returns {boolean} True if content is new
   */
  isNewContent(video) {
    const botStartTime = this.state.get('botStartTime');
    if (!botStartTime) {
      return true; // If no start time set, consider all content new
    }

    const publishedAt = video.snippet?.publishedAt;
    if (!publishedAt) {
      return true; // If no publish time available, assume it's new
    }

    const publishTime = new Date(publishedAt);
    return publishTime >= botStartTime;
  }

  /**
   * Check if monitor is running
   * @returns {boolean} True if running
   */
  isRunning() {
    return this.isRunning;
  }

  /**
   * Get monitor statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      subscriptionActive: this.subscriptionActive,
      youtubeChannelId: this.youtubeChannelId,
      callbackUrl: this.callbackUrl,
      fallbackEnabled: this.fallbackEnabled,
      fallbackInterval: this.fallbackPollingInterval,
      ...this.stats,
      duplicateDetectorStats: this.duplicateDetector.getStats(),
    };
  }

  /**
   * Dispose of resources
   * @returns {Promise<void>}
   */
  async dispose() {
    await this.stop();
  }
}
