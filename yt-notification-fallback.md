  Fallback Strategy Plan

  1. Notification Queue & Retry System

  PubSubHubbub Notification → Parse → Success? → Process
                                  ↓ No
                             Queue for Retry → API Fallback

  Components:
  - In-memory queue for failed notifications with timestamps
  - Exponential backoff retry (5s, 15s, 45s intervals)
  - Maximum 3 retry attempts before API fallback

  2. YouTube Data API Polling Fallback

  Trigger Conditions:
  - XML parsing fails completely
  - Missing critical fields (videoId, channelId)
  - Multiple rapid failures (>2 in 30 seconds)

  Implementation:
  - Schedule API call 10-30 seconds after failure
  - Poll /search endpoint for recent videos from monitored channel
  - Cross-reference with known video IDs to find new content
  - Use publishedAfter parameter set to last successful notification time

  3. Hybrid Detection Logic

  class NotificationFallback {
    constructor() {
      this.failedNotifications = new Map();
      this.lastSuccessfulCheck = new Date();
      this.apiPollTimer = null;
    }

    async handleFailedNotification(rawXML, error) {
      // Queue for retry
      this.queueRetry(rawXML);

      // Schedule API fallback if multiple failures
      if (this.getRecentFailureCount() >= 2) {
        this.scheduleApiFallback();
      }
    }

    async scheduleApiFallback() {
      if (this.apiPollTimer) return; // Already scheduled

      this.apiPollTimer = setTimeout(() => {
        this.performApiFallback();
        this.apiPollTimer = null;
      }, 15000); // 15 second delay
    }
  }

  4. Smart Recovery Features

  Deduplication:
  - Track processed video IDs across both notification and API methods
  - Prevent duplicate announcements when both systems work

  Gap Detection:
  - Compare API results with last known video
  - Detect if notifications were missed entirely
  - Backfill missing announcements in chronological order

  Rate Limiting Awareness:
  - Monitor API quota usage
  - Implement adaptive polling frequency
  - Fall back to less frequent checks if quota low

  5. Configuration Options

  # Fallback settings
  YOUTUBE_FALLBACK_ENABLED=true
  YOUTUBE_FALLBACK_DELAY_MS=15000
  YOUTUBE_FALLBACK_MAX_RETRIES=3
  YOUTUBE_API_POLL_INTERVAL_MS=300000  # 5 minutes
  YOUTUBE_FALLBACK_BACKFILL_HOURS=2    # How far back to check

  6. Implementation Priority

  1. Phase 1: Basic retry queue for malformed XML
  2. Phase 2: API fallback scheduling after multiple failures
  3. Phase 3: Intelligent gap detection and backfill
  4. Phase 4: Adaptive polling based on failure patterns

  7. Monitoring & Metrics

  - Track PubSubHubbub success/failure rates
  - Monitor API fallback usage
  - Alert on sustained notification failures
  - Log recovery success rates

  Benefits:
  - Resilient to YouTube's unreliable PubSubHubbub
  - Maintains real-time performance when possible
  - Graceful degradation to polling when needed
  - Prevents missed livestream/upload announcements
