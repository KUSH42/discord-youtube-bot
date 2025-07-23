# Discord Logging Verbosity Improvements

This document outlines the improvements made to prevent Discord rate limiting
from excessive logging.

## Overview

The Discord bot uses Winston logging with a Discord transport that sends log
messages to a Discord channel. Without proper controls, this can lead to Discord
API rate limiting, especially during high-frequency operations like Twitter
scraping.

## Issues Identified

### 1. High-Frequency Debug Logging

- **Location**: `src/application/scraper-application.js`
- **Problem**: Debug logs for every tweet processed (potentially 50-100+ per
  scraping cycle)
- **Impact**: Could overwhelm Discord channel if debug level enabled

### 2. Webhook Debug Logging

- **Location**: `src/application/monitor-application.js`
- **Problem**: Extensive debug logging for every YouTube webhook (15+ messages
  per webhook)
- **Impact**: High volume when webhook debug enabled

### 3. Insufficient Rate Limiting Controls

- **Location**: `src/logger-utils.js`
- **Problem**: Default rate limiting not conservative enough for logging
  operations
- **Impact**: Potential Discord API rate limiting

## Solutions Implemented

### 1. Debug Log Sampling

Added configurable sampling rates to reduce high-frequency debug logging:

```javascript
// Configuration (environment variables)
X_DEBUG_SAMPLING_RATE=0.1        // 10% of debug logs (default)
X_VERBOSE_LOG_SAMPLING_RATE=0.05 // 5% of verbose logs (default)

// Implementation
shouldLogDebug() {
  return Math.random() < this.debugSamplingRate;
}

shouldLogVerbose() {
  return Math.random() < this.verboseLogSamplingRate;
}

// Usage
if (this.shouldLogDebug()) {
  this.logger.debug(`Added new tweet: ${tweet.tweetID}`);
}
```

### 2. Enhanced Rate-Limited Discord Sender

Improved the Discord transport with sophisticated rate limiting:

```javascript
// More conservative settings for Discord logging
{
  baseSendDelay: 2000,      // 2 seconds between sends (vs 1 second)
  burstAllowance: 2,        // Only 2 quick messages (vs 3)
  burstResetTime: 90000,    // 1.5 minutes burst reset (vs 1 minute)
  maxBackoffDelay: 60000,   // 1 minute max backoff for logging
}
```

### 3. Explicit 429 Error Handling

Enhanced the rate-limited sender with proper Discord API rate limit handling:

- **Retry-After Parsing**: Extracts retry delay from Discord 429 responses
- **Queue Pausing**: Pauses entire message queue during rate limiting
- **Exponential Backoff**: Implements exponential backoff for failed sends
- **Graceful Degradation**: Continues operation even during rate limiting

### 4. Improved Buffer Management

Enhanced the Discord transport buffering:

- **Larger Buffers**: Aggregate more messages before sending
- **Priority Handling**: Critical messages can be prioritized
- **Graceful Shutdown**: Properly handles remaining messages on shutdown

## Configuration Options

### Environment Variables

```bash
# Logging verbosity control
LOG_LEVEL=info                    # General log level
X_DEBUG_SAMPLING_RATE=0.1         # 10% debug log sampling
X_VERBOSE_LOG_SAMPLING_RATE=0.05  # 5% verbose log sampling

# Discord transport rate limiting
DISCORD_LOG_LEVEL=warn            # More restrictive Discord logging
DISCORD_BASE_SEND_DELAY=2000      # 2 seconds between sends
DISCORD_BURST_ALLOWANCE=2         # Only 2 quick messages
DISCORD_MAX_BUFFER_SIZE=30        # Larger buffer for aggregation
```

### Rate Limiter Configuration

```javascript
// Discord transport options
{
  level: 'warn',              // Only warn+ messages to Discord
  baseSendDelay: 2000,        // 2 second delay between sends
  burstAllowance: 2,          // Conservative burst allowance
  maxBufferSize: 30,          // Larger buffer for aggregation
  flushInterval: 5000,        // 5 second flush interval
}
```

## Monitoring and Metrics

### Rate Limiter Metrics

The enhanced rate-limited sender provides comprehensive metrics:

```javascript
{
  totalMessages: 150,         // Total messages processed
  successfulSends: 145,       // Successfully sent messages
  failedSends: 5,            // Failed messages
  rateLimitHits: 2,          // Number of 429 responses
  totalRetries: 8,           // Total retry attempts
  successRate: 96.67,        // Success percentage
  currentQueueSize: 3,       // Messages currently queued
  isPaused: false,           // Whether queue is paused
  lastRateLimitHit: null,    // Timestamp of last rate limit
}
```

### Health Check Integration

Added rate limiter health checks to command processor:

```javascript
// Include rate limiter metrics in !health-detailed
const rateLimiterMetrics = this.rateLimitedSender.getMetrics();
if (rateLimiterMetrics.rateLimitHits > 5) {
  this.logger.warn('Discord logging experiencing rate limits');
}
```

## Best Practices

### 1. Log Level Management

- Use `info` level for operational messages
- Use `warn` level for Discord transport to reduce volume
- Use debug sampling for high-frequency operations
- Reserve `error` level for genuine errors

### 2. Message Aggregation

- Batch related log messages when possible
- Use summary messages instead of individual item logs
- Implement periodic summary reports for high-volume operations

### 3. Rate Limit Awareness

- Monitor rate limiter metrics regularly
- Adjust sampling rates based on Discord API response
- Use prioritization for critical messages
- Implement graceful degradation during rate limiting

### 4. Testing and Validation

- Test with debug level enabled to verify sampling works
- Monitor Discord API response headers for rate limit warnings
- Use load testing to validate rate limiting effectiveness
- Verify graceful shutdown handles pending messages

## Migration Guide

### Existing Deployments

1. **Update Configuration**:

   ```bash
   # Add to .env file
   X_DEBUG_SAMPLING_RATE=0.1
   X_VERBOSE_LOG_SAMPLING_RATE=0.05
   DISCORD_LOG_LEVEL=warn
   ```

2. **Monitor After Deployment**:
   - Check `!health-detailed` for rate limiter metrics
   - Monitor Discord API response times
   - Verify no 429 errors in application logs

3. **Adjust Sampling Rates**:
   - Increase sampling if missing important debug info
   - Decrease sampling if still experiencing rate limits
   - Use environment variables for easy adjustment

## Testing

### Unit Tests

- Added comprehensive tests for `DiscordRateLimitedSender`
- Tests cover 429 error handling, retry logic, and metrics
- Validates proper queue management and graceful shutdown

### Integration Tests

- Enhanced Discord transport tests with rate limiting scenarios
- Tests verify proper buffering and message aggregation
- Validates sampling rate effectiveness

### Load Testing

- Simulate high-frequency logging scenarios
- Verify rate limiting prevents Discord API errors
- Test graceful degradation under rate limiting

## Future Improvements

### 1. Adaptive Sampling

- Adjust sampling rates based on Discord API response times
- Implement automatic backoff when rate limits detected
- Use machine learning to optimize sampling rates

### 2. Alternative Logging Channels

- Implement file-based logging fallback during rate limiting
- Support multiple Discord channels for load distribution
- Add webhook-based logging alternatives

### 3. Enhanced Monitoring

- Real-time rate limit monitoring dashboard
- Alerting for excessive rate limiting
- Automatic adjustment of logging verbosity

## Conclusion

These improvements significantly reduce the risk of Discord API rate limiting
while maintaining essential logging capabilities. The configurable sampling
approach allows fine-tuning based on operational needs, and the enhanced rate
limiting provides robust protection against API limits.

The implementation maintains backward compatibility while providing better
control over Discord logging verbosity, ensuring the bot remains stable even
during high-activity periods.
