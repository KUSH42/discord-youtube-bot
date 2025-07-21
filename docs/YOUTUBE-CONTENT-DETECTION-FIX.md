Comprehensive Plan: YouTube Content Detection Reliability Fix

  Phase 1: Foundation & State Management (Priority: Critical)

  1.1 Unified Content State System

  Goal: Replace dual-logic inconsistency with single source of truth

  Implementation:
  // New: src/core/content-state-manager.js
  class ContentStateManager {
    constructor() {
      this.contentStates = new Map(); // videoId -> ContentState
    }

    // Track content through its lifecycle
    addContent(videoId, initialState) {
      this.contentStates.set(videoId, {
        id: videoId,
        state: initialState, // 'scheduled', 'live', 'ended', 'published'
        firstSeen: new Date(),
        lastUpdated: new Date(),
        announced: false,
        source: 'webhook|scraper|api'
      });
    }

    // Unified "new content" logic
    isNewContent(videoId, publishedAt, detectionTime) {
      const config = this.configManager.get('CONTENT_DETECTION');
      const maxAge = config.MAX_CONTENT_AGE_HOURS * 3600 * 1000;
      return (detectionTime - publishedAt) <= maxAge;
    }
  }

  Changes Required:
  - Replace botStartTime logic in monitor-application.js:768-781
  - Replace lastKnownContentId logic in youtube-scraper-service.js:720-754
  - Add persistent storage for content states
  - Add configuration for content age thresholds

  1.2 Enhanced Configuration System

  Goal: Centralized, consistent configuration for all content detection

  New Configuration Structure:
  // In config/content-detection.js
  export const CONTENT_DETECTION_CONFIG = {
    MAX_CONTENT_AGE_HOURS: 24, // Unified across platforms
    DUPLICATE_DETECTION: {
      STORAGE: 'persistent', // vs 'memory'
      CLEANUP_INTERVAL_HOURS: 168, // 1 week
    },
    LIVESTREAM_TRACKING: {
      STATE_POLLING_INTERVAL: 30000, // 30 seconds
      TRANSITION_TIMEOUT: 300000, // 5 minutes
    },
    FALLBACK_SYSTEM: {
      MAX_RETRIES: 3,
      BACKOFF_MULTIPLIER: 2,
      BASE_DELAY_MS: 5000,
    }
  };

  Phase 2: Livestream State Management (Priority: Critical)

  2.1 Livestream State Machine

  Goal: Proper tracking of livestream state transitions

  Implementation:
  // New: src/core/livestream-state-machine.js
  class LivestreamStateMachine {
    constructor(contentStateManager, logger) {
      this.states = ['scheduled', 'live', 'ended', 'cancelled'];
      this.transitions = {
        'scheduled': ['live', 'cancelled'],
        'live': ['ended'],
        'ended': [], // terminal state
        'cancelled': [] // terminal state
      };
    }

    async transitionState(videoId, newState) {
      const current = this.contentStateManager.getContentState(videoId);

      if (this.isValidTransition(current.state, newState)) {
        await this.contentStateManager.updateContentState(videoId, {
          state: newState,
          lastUpdated: new Date()
        });

        // Trigger announcements based on transitions
        if (newState === 'live' && !current.announced) {
          await this.announceContent(videoId, 'livestream_started');
        }
      }
    }
  }

  Changes Required:
  - Enhance ContentClassifier.isYouTubeLivestream() to handle 'upcoming' state
  - Add state polling for scheduled streams
  - Implement transition detection logic
  - Add announcement triggers for state changes

  2.2 Scheduled Content Monitoring

  Goal: Active monitoring of scheduled/premiere content

  Implementation:
  // Enhanced: src/services/implementations/youtube-api-service.js
  class YouTubeApiService {
    async getScheduledContent(channelId) {
      const response = await this.youtube.search.list({
        part: ['snippet'],
        channelId: channelId,
        eventType: 'upcoming', // Scheduled livestreams
        type: 'video',
        maxResults: 50
      });

      return response.data.items.map(item => ({
        id: item.id.videoId,
        scheduledStartTime: item.liveStreamingDetails?.scheduledStartTime,
        state: 'scheduled'
      }));
    }

    async pollScheduledContent() {
      const scheduled = await this.getScheduledContent(this.channelId);

      for (const content of scheduled) {
        const now = new Date();
        const startTime = new Date(content.scheduledStartTime);

        // Check if scheduled content should be live
        if (now >= startTime) {
          await this.checkLivestreamState(content.id);
        }
      }
    }
  }

  Phase 3: Robust Duplicate Detection (Priority: High)

  3.1 Enhanced Duplicate Detection

  Goal: Persistent, reliable duplicate detection with content fingerprinting

  Implementation:
  // Enhanced: src/core/duplicate-detector.js
  class EnhancedDuplicateDetector {
    constructor(persistentStorage) {
      this.storage = persistentStorage; // Database or file-based
      this.contentFingerprints = new Map();
    }

    // Content fingerprinting for better duplicate detection
    generateContentFingerprint(content) {
      const normalizedTitle = this.normalizeTitle(content.title);
      const videoId = this.extractVideoId(content.url);
      const publishTime = new Date(content.publishedAt).getTime();

      return `${videoId}:${normalizedTitle}:${Math.floor(publishTime / 60000)}`; // minute precision
    }

    async isDuplicateWithFingerprint(content) {
      const fingerprint = this.generateContentFingerprint(content);
      const urlDuplicate = await this.isDuplicate(content.url);
      const fingerprintDuplicate = await this.storage.hasFingerprint(fingerprint);

      return urlDuplicate || fingerprintDuplicate;
    }

    // Handle URL variations
    normalizeUrl(url) {
      const videoId = this.extractVideoId(url);
      return videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;
    }
  }

  Storage Integration:
  // New: src/infrastructure/persistent-storage.js
  class PersistentStorage {
    async storeContentState(videoId, state) {
      // Store in file or lightweight DB
      await this.writeToStorage('content_states', videoId, state);
    }

    async getContentState(videoId) {
      return await this.readFromStorage('content_states', videoId);
    }

    async cleanup(olderThanDays = 7) {
      // Remove old entries to prevent storage bloat
      const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
      await this.removeEntriesOlderThan('content_states', cutoff);
    }
  }

  3.2 Cross-System Coordination

  Goal: Prevent race conditions between webhook and scraper systems

  Implementation:
  // New: src/core/content-coordinator.js
  class ContentCoordinator {
    constructor() {
      this.processingQueue = new Map(); // videoId -> Promise
      this.lockTimeout = 30000; // 30 seconds
    }

    async processContent(videoId, source, contentData) {
      // Prevent duplicate processing
      if (this.processingQueue.has(videoId)) {
        this.logger.debug(`Content ${videoId} already being processed, skipping`);
        return await this.processingQueue.get(videoId);
      }

      const processingPromise = this.doProcessContent(videoId, source, contentData);
      this.processingQueue.set(videoId, processingPromise);

      try {
        const result = await processingPromise;
        return result;
      } finally {
        this.processingQueue.delete(videoId);
      }
    }

    async doProcessContent(videoId, source, contentData) {
      // Unified content processing logic
      const existing = await this.contentStateManager.getContentState(videoId);

      if (existing && existing.announced) {
        return { action: 'skip', reason: 'already_announced' };
      }

      // Process based on source priority (webhook > api > scraper)
      const shouldProcess = this.shouldProcessFromSource(existing, source);
      if (!shouldProcess) {
        return { action: 'skip', reason: 'source_priority' };
      }

      return await this.announceContent(videoId, contentData);
    }
  }

  Phase 4: Enhanced Webhook System (Priority: High)

  4.1 Webhook Delivery Confirmation

  Goal: Ensure webhook notifications are properly received and processed

  Implementation:
  // Enhanced: src/application/monitor-application.js
  class EnhancedMonitorApplication {
    async processWebhookNotification(xmlBody) {
      const notificationId = this.generateNotificationId(xmlBody);

      try {
        // Process with delivery confirmation
        const result = await this.processNotificationWithRetry(xmlBody);

        // Log successful processing
        await this.logNotificationProcessed(notificationId, result);

        return result;
      } catch (error) {
        // Enhanced error handling with retry logic
        await this.handleNotificationError(notificationId, xmlBody, error);
        throw error;
      }
    }

    async processNotificationWithRetry(xmlBody, retries = 0) {
      const maxRetries = this.config.get('WEBHOOK_MAX_RETRIES') || 3;

      try {
        return await this.processXmlNotification(xmlBody);
      } catch (error) {
        if (retries < maxRetries) {
          const delay = Math.pow(2, retries) * 1000; // exponential backoff
          await this.delay(delay);
          return await this.processNotificationWithRetry(xmlBody, retries + 1);
        }
        throw error;
      }
    }
  }

  4.2 Robust XML Parsing

  Goal: Replace fragile regex with proper XML parsing

  Implementation:
  // Enhanced XML parsing in monitor-application.js
  import { XMLParser } from 'fast-xml-parser';

  class RobustXmlParser {
    constructor() {
      this.parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        textNodeName: '#text'
      });
    }

    parseWebhookNotification(xmlBody) {
      try {
        const parsed = this.parser.parse(xmlBody);

        // Robust extraction with fallbacks
        const entry = parsed.feed?.entry || parsed.entry;
        if (!entry) {
          throw new Error('No entry found in XML');
        }

        return {
          videoId: this.extractVideoId(entry),
          title: this.extractTitle(entry),
          publishedAt: this.extractPublishedAt(entry),
          channelId: this.extractChannelId(entry)
        };
      } catch (error) {
        this.logger.error('XML parsing failed:', { xmlBody, error: error.message });
        throw new Error(`Failed to parse webhook XML: ${error.message}`);
      }
    }
  }

  Phase 5: Scraper Resilience (Priority: Medium)

  5.1 Dynamic Selector Management

  Goal: Adaptive selectors that survive YouTube layout changes

  Implementation:
  // Enhanced: src/services/implementations/youtube-scraper-service.js
  class AdaptiveYouTubeScraper {
    constructor() {
      this.selectorStrategies = [
        {
          name: 'modern-2024',
          selectors: ['ytd-rich-grid-media:first-child #video-title-link'],
          validator: (element) => element.href.includes('/watch?v=')
        },
        {
          name: 'fallback-generic',
          selectors: ['a[href*="/watch?v="]:first-of-type'],
          validator: (element) => element.textContent.trim().length > 0
        },
        {
          name: 'shorts-format',
          selectors: ['a[href*="/shorts/"]:first-of-type'],
          validator: (element) => element.href.includes('/shorts/')
        }
      ];
    }

    async findLatestVideo() {
      for (const strategy of this.selectorStrategies) {
        try {
          const result = await this.tryStrategy(strategy);
          if (result && this.validateResult(result)) {
            this.logger.info(`Successful scrape with strategy: ${strategy.name}`);
            return result;
          }
        } catch (error) {
          this.logger.debug(`Strategy ${strategy.name} failed:`, error.message);
          continue;
        }
      }

      throw new Error('All scraping strategies failed');
    }
  }

  5.2 Authentication State Monitoring

  Goal: Proactive authentication health checks

  Implementation:
  // Enhanced authentication monitoring
  class AuthenticationMonitor {
    async validateSession() {
      try {
        // Check if still logged in by looking for user indicators
        const isLoggedIn = await this.browserService.evaluate(() => {
          // Look for YouTube account indicators
          const accountButton = document.querySelector('[aria-label*="Account menu"]');
          const signInButton = document.querySelector('a[aria-label*="Sign in"]');
          return accountButton && !signInButton;
        });

        if (!isLoggedIn) {
          this.logger.warn('YouTube session expired, attempting re-authentication');
          await this.authenticateWithYouTube();
        }

        return isLoggedIn;
      } catch (error) {
        this.logger.error('Session validation failed:', error.message);
        return false;
      }
    }

    // Periodic session health check
    startSessionMonitoring() {
      setInterval(async () => {
        await this.validateSession();
      }, 30 * 60 * 1000); // Every 30 minutes
    }
  }

  Phase 6: Monitoring & Metrics (Priority: Medium)

  6.1 Content Detection Metrics

  Goal: Track system reliability and identify issues

  Implementation:
  // New: src/infrastructure/content-metrics.js
  class ContentDetectionMetrics {
    constructor() {
      this.metrics = {
        webhookNotifications: 0,
        scraperDetections: 0,
        duplicatesFiltered: 0,
        contentAnnounced: 0,
        missedContent: 0,
        systemErrors: 0
      };
    }

    recordContentFlow(videoId, source, action) {
      this.metrics[`${source}Detections`]++;

      if (action === 'announced') {
        this.metrics.contentAnnounced++;
      } else if (action === 'duplicate') {
        this.metrics.duplicatesFiltered++;
      }

      // Store detailed flow for analysis
      this.logContentFlow(videoId, source, action, new Date());
    }

    async generateHealthReport() {
      return {
        detectionAccuracy: this.calculateDetectionAccuracy(),
        duplicateRate: this.calculateDuplicateRate(),
        systemReliability: this.calculateReliability(),
        recentErrors: await this.getRecentErrors(),
        recommendations: this.generateRecommendations()
      };
    }
  }

  6.2 Cross-System Validation

  Goal: Compare webhook vs scraper results to identify gaps

  Implementation:
  // New: src/core/content-validator.js
  class ContentValidator {
    async validateDetection(videoId) {
      // Check if content was detected by multiple systems
      const sources = await this.contentStateManager.getDetectionSources(videoId);

      if (sources.length === 1) {
        // Only detected by one system - potential reliability issue
        this.logger.warn(`Content ${videoId} only detected by ${sources[0]}`);

        // Trigger validation check
        await this.crossValidateContent(videoId);
      }
    }

    async crossValidateContent(videoId) {
      // Use API to verify content exists and get authoritative data
      try {
        const apiData = await this.youtubeApiService.getVideoDetails(videoId);
        const webData = await this.youtubeScraperService.getVideoDetails(videoId);

        // Compare results and flag discrepancies
        const discrepancies = this.compareContentData(apiData, webData);
        if (discrepancies.length > 0) {
          this.logger.error('Content validation discrepancies:', discrepancies);
        }
      } catch (error) {
        this.logger.error(`Cross-validation failed for ${videoId}:`, error.message);
      }
    }
  }

  Implementation Timeline & Phases

  Phase 1 (Week 1-2): Critical Foundation

  1. Implement ContentStateManager and unified configuration
  2. Replace dual-logic systems with single source of truth
  3. Add persistent storage for content states
  4. Deliverable: Consistent content age detection across all systems

  Phase 2 (Week 3-4): Livestream Reliability

  1. Implement LivestreamStateMachine
  2. Add scheduled content monitoring
  3. Implement state transition detection
  4. Deliverable: Reliable livestream state tracking and announcements

  Phase 3 (Week 5-6): Duplicate Detection

  1. Enhance DuplicateDetector with fingerprinting
  2. Implement ContentCoordinator for race condition prevention
  3. Add persistent duplicate detection storage
  4. Deliverable: Zero duplicate announcements and no missed content

  Phase 4 (Week 7-8): Webhook Robustness

  1. Add webhook delivery confirmation and retry logic
  2. Replace regex XML parsing with robust parser
  3. Implement notification queuing system
  4. Deliverable: 99%+ webhook processing reliability

  Phase 5 (Week 9-10): Scraper Resilience

  1. Implement adaptive selector strategies
  2. Add authentication state monitoring
  3. Create fallback scraping methods
  4. Deliverable: Scraper survives YouTube layout changes

  Phase 6 (Week 11-12): Monitoring & Validation

  1. Implement comprehensive metrics system
  2. Add cross-system validation
  3. Create health reporting dashboard
  4. Deliverable: Full visibility into system reliability

  Testing Strategy

  Unit Testing Requirements:

  - ContentStateManager state transitions
  - DuplicateDetector fingerprinting algorithms
  - XML parsing edge cases
  - Authentication state validation

  Integration Testing Requirements:

  - Webhook → Scraper coordination
  - State persistence across restarts
  - Cross-system content validation
  - Error recovery scenarios

  End-to-End Testing Requirements:

  - Scheduled livestream transitions
  - Multiple rapid content releases
  - System restart during active content
  - Authentication failure scenarios