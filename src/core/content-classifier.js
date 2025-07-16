/**
 * Pure business logic for classifying content from different platforms
 * No side effects - only analyzes input and returns classification results
 */
export class ContentClassifier {
  constructor() {
    // URL patterns for content classification
    this.patterns = {
      youtube: {
        video: /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
        channel: /youtube\.com\/channel\/([A-Za-z0-9_-]{24})/,
        playlist: /youtube\.com\/playlist\?list=([A-Za-z0-9_-]+)/
      },
      x: {
        status: /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/,
        profile: /(?:twitter\.com|x\.com)\/(\w+)(?:\/.*)?$/
      }
    };
  }
  
  /**
   * Classify X (Twitter) content based on URL and text analysis
   * @param {string} url - Tweet URL
   * @param {string} text - Tweet text content
   * @param {Object} metadata - Additional metadata about the tweet
   * @returns {Object} Classification result
   */
  classifyXContent(url, text = '', metadata = {}) {
    const result = {
      platform: 'x',
      type: 'unknown',
      confidence: 0,
      details: {}
    };
    
    // Validate inputs
    if (!url || typeof url !== 'string') {
      result.error = 'Invalid URL provided';
      return result;
    }
    
    // Check if it's a valid X/Twitter URL
    if (!this.isXUrl(url)) {
      result.error = 'URL is not from X (Twitter)';
      return result;
    }
    
    // Extract status ID
    const statusMatch = url.match(this.patterns.x.status);
    if (!statusMatch) {
      result.type = 'profile';
      result.confidence = 0.9;
      return result;
    }
    
    result.details.statusId = statusMatch[1];
    
    // Analyze content to determine type
    const classification = this.analyzeXContentType(text, metadata);
    result.type = classification.type;
    result.confidence = classification.confidence;
    result.details = { ...result.details, ...classification.details };
    
    return result;
  }
  
  /**
   * Analyze X content to determine if it's a post, reply, quote, or retweet
   * @param {string} text - Tweet text
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Type classification
   */
  analyzeXContentType(text = '', metadata = {}) {
    const result = {
      type: 'post',
      confidence: 0.8,
      details: {}
    };
    
    // Check for reply indicators
    if (this.isReply(text, metadata)) {
      result.type = 'reply';
      result.confidence = 0.9;
      result.details.replyIndicators = this.getReplyIndicators(text, metadata);
      return result;
    }
    
    // Check for retweet indicators
    if (this.isRetweet(text, metadata)) {
      result.type = 'retweet';
      result.confidence = 0.95;
      result.details.retweetIndicators = this.getRetweetIndicators(text, metadata);
      return result;
    }
    
    // Check for quote tweet indicators
    if (this.isQuoteTweet(text, metadata)) {
      result.type = 'quote';
      result.confidence = 0.85;
      result.details.quoteIndicators = this.getQuoteIndicators(text, metadata);
      return result;
    }
    
    // Default to post
    return result;
  }
  
  /**
   * Check if content is a reply
   * @param {string} text - Tweet text
   * @param {Object} metadata - Additional metadata
   * @returns {boolean} True if content is a reply
   */
  isReply(text, metadata) {
    // Check metadata first
    if (metadata && (metadata.isReply === true || metadata.inReplyTo)) {
      return true;
    }
    
    // Check text patterns
    if (typeof text === 'string') {
      // Starts with @username pattern
      if (/^@\w+/.test(text.trim())) {
        return true;
      }
      
      // Contains "Replying to" text
      if (text.includes('Replying to')) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check if content is a retweet
   * @param {string} text - Tweet text
   * @param {Object} metadata - Additional metadata
   * @returns {boolean} True if content is a retweet
   */
  isRetweet(text, metadata) {
    // Check metadata first
    if (metadata && (metadata.isRetweet === true || metadata.retweetedStatus)) {
      return true;
    }
    
    // Check text patterns
    if (typeof text === 'string') {
      // Starts with RT @ pattern
      if (/^RT @\w+/.test(text.trim())) {
        return true;
      }
      
      // Contains retweet indicators
      if (text.includes('retweeted') || text.includes('RT @')) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check if content is a quote tweet
   * @param {string} text - Tweet text
   * @param {Object} metadata - Additional metadata
   * @returns {boolean} True if content is a quote tweet
   */
  isQuoteTweet(text, metadata) {
    // Check metadata first
    if (metadata && (metadata.isQuote === true || metadata.quotedStatus || metadata.quoteTweetUrl)) {
      return true;
    }
    
    // Check for embedded tweet URL pattern
    if (typeof text === 'string') {
      const quoteTweetPattern = /https?:\/\/(?:twitter\.com|x\.com)\/\w+\/status\/\d+/;
      if (quoteTweetPattern.test(text)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Get reply indicators from content
   * @param {string} text - Tweet text
   * @param {Object} metadata - Additional metadata
   * @returns {Array} Array of reply indicators
   */
  getReplyIndicators(text, metadata) {
    const indicators = [];
    
    if (metadata.inReplyTo) {
      indicators.push(`Reply to ${metadata.inReplyTo}`);
    }
    
    if (typeof text === 'string') {
      const mentionMatch = text.match(/^@(\w+)/);
      if (mentionMatch) {
        indicators.push(`Mentions @${mentionMatch[1]}`);
      }
      
      if (text.includes('Replying to')) {
        indicators.push('Contains "Replying to" text');
      }
    }
    
    return indicators;
  }
  
  /**
   * Get retweet indicators from content
   * @param {string} text - Tweet text
   * @param {Object} metadata - Additional metadata
   * @returns {Array} Array of retweet indicators
   */
  getRetweetIndicators(text, metadata) {
    const indicators = [];
    
    if (metadata.retweetedStatus) {
      indicators.push('Has retweeted status metadata');
    }
    
    if (typeof text === 'string') {
      if (/^RT @\w+/.test(text.trim())) {
        indicators.push('Starts with RT @');
      }
    }
    
    return indicators;
  }
  
  /**
   * Get quote tweet indicators from content
   * @param {string} text - Tweet text
   * @param {Object} metadata - Additional metadata
   * @returns {Array} Array of quote indicators
   */
  getQuoteIndicators(text, metadata) {
    const indicators = [];
    
    if (metadata.quotedStatus) {
      indicators.push('Has quoted status metadata');
    }
    
    if (typeof text === 'string') {
      const quoteTweetPattern = /https?:\/\/(?:twitter\.com|x\.com)\/\w+\/status\/\d+/;
      const match = text.match(quoteTweetPattern);
      if (match) {
        indicators.push(`Contains embedded tweet URL: ${match[0]}`);
      }
    }
    
    return indicators;
  }
  
  /**
   * Classify YouTube content based on video details
   * @param {Object} video - YouTube video object
   * @returns {Object} Classification result
   */
  classifyYouTubeContent(video) {
    const result = {
      platform: 'youtube',
      type: 'video',
      confidence: 0.9,
      details: {}
    };
    
    // Validate input
    if (!video || typeof video !== 'object') {
      result.error = 'Invalid video object provided';
      result.confidence = 0;
      return result;
    }
    
    // Check for upcoming/scheduled content first
    if (this.isYouTubeUpcoming(video)) {
      result.type = 'upcoming';
      result.confidence = 0.9;
      result.details.scheduledTime = this.getYouTubeScheduledTime(video);
    }
    
    // Check for livestream indicators
    else if (this.isYouTubeLivestream(video)) {
      result.type = 'livestream';
      result.confidence = 0.95;
      result.details.liveStreamDetails = this.getYouTubeLiveDetails(video);
    }
    
    // Check for shorts
    else if (this.isYouTubeShort(video)) {
      result.type = 'short';
      result.confidence = 0.85;
    }
    
    // Default to regular video
    else {
      result.details.duration = this.getYouTubeDuration(video);
    }
    
    // Add common details
    result.details.videoId = video.id;
    result.details.title = video.snippet?.title;
    result.details.channelId = video.snippet?.channelId;
    result.details.publishedAt = video.snippet?.publishedAt;
    
    return result;
  }
  
  /**
   * Check if YouTube video is a livestream
   * @param {Object} video - YouTube video object
   * @returns {boolean} True if livestream
   */
  isYouTubeLivestream(video) {
    // Check live streaming details - only if actually started
    if (video.liveStreamingDetails && video.liveStreamingDetails.actualStartTime) {
      return true;
    }
    
    // Check snippet broadcast content - only if currently live
    const broadcastContent = video.snippet?.liveBroadcastContent;
    return broadcastContent === 'live';
  }
  
  /**
   * Check if YouTube video is upcoming/scheduled
   * @param {Object} video - YouTube video object
   * @returns {boolean} True if upcoming
   */
  isYouTubeUpcoming(video) {
    return video.snippet?.liveBroadcastContent === 'upcoming';
  }
  
  /**
   * Check if YouTube video is a short
   * @param {Object} video - YouTube video object
   * @returns {boolean} True if short
   */
  isYouTubeShort(video) {
    // YouTube Shorts are typically under 60 seconds
    const duration = this.parseYouTubeDuration(video.contentDetails?.duration);
    return duration > 0 && duration <= 60;
  }
  
  /**
   * Get YouTube live streaming details
   * @param {Object} video - YouTube video object
   * @returns {Object} Live streaming details
   */
  getYouTubeLiveDetails(video) {
    const details = {};
    
    if (video.liveStreamingDetails) {
      details.actualStartTime = video.liveStreamingDetails.actualStartTime;
      details.scheduledStartTime = video.liveStreamingDetails.scheduledStartTime;
      details.actualEndTime = video.liveStreamingDetails.actualEndTime;
      details.concurrentViewers = video.liveStreamingDetails.concurrentViewers;
    }
    
    return details;
  }
  
  /**
   * Get YouTube scheduled time
   * @param {Object} video - YouTube video object
   * @returns {string|null} Scheduled time
   */
  getYouTubeScheduledTime(video) {
    return video.liveStreamingDetails?.scheduledStartTime || 
           video.snippet?.publishedAt;
  }
  
  /**
   * Get YouTube video duration
   * @param {Object} video - YouTube video object
   * @returns {Object} Duration information
   */
  getYouTubeDuration(video) {
    const duration = video.contentDetails?.duration;
    if (!duration) return null;
    
    return {
      raw: duration,
      seconds: this.parseYouTubeDuration(duration)
    };
  }
  
  /**
   * Parse YouTube duration format (PT4M13S) to seconds
   * @param {string} duration - YouTube duration string
   * @returns {number} Duration in seconds
   */
  parseYouTubeDuration(duration) {
    if (!duration || typeof duration !== 'string') return 0;
    
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);
    
    return hours * 3600 + minutes * 60 + seconds;
  }
  
  /**
   * Check if URL is from X (Twitter)
   * @param {string} url - URL to check
   * @returns {boolean} True if X URL
   */
  isXUrl(url) {
    return /^https?:\/\/(?:twitter\.com|x\.com)\//.test(url);
  }
  
  /**
   * Check if URL is from YouTube
   * @param {string} url - URL to check
   * @returns {boolean} True if YouTube URL
   */
  isYouTubeUrl(url) {
    return /^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//.test(url);
  }
  
  /**
   * Extract content ID from URL
   * @param {string} url - Content URL
   * @returns {Object} Extracted ID information
   */
  extractContentId(url) {
    if (this.isYouTubeUrl(url)) {
      const videoMatch = url.match(this.patterns.youtube.video);
      if (videoMatch) {
        return { platform: 'youtube', type: 'video', id: videoMatch[1] };
      }
      
      const channelMatch = url.match(this.patterns.youtube.channel);
      if (channelMatch) {
        return { platform: 'youtube', type: 'channel', id: channelMatch[1] };
      }
    }
    
    if (this.isXUrl(url)) {
      const statusMatch = url.match(this.patterns.x.status);
      if (statusMatch) {
        return { platform: 'x', type: 'status', id: statusMatch[1] };
      }
      
      const profileMatch = url.match(this.patterns.x.profile);
      if (profileMatch) {
        return { platform: 'x', type: 'profile', id: profileMatch[1] };
      }
    }
    
    return { platform: 'unknown', type: 'unknown', id: null };
  }
  
  /**
   * Get classification statistics
   * @returns {Object} Classification statistics
   */
  getStats() {
    return {
      supportedPlatforms: ['youtube', 'x'],
      xContentTypes: ['post', 'reply', 'quote', 'retweet'],
      youtubeContentTypes: ['video', 'livestream', 'upcoming', 'short'],
      patterns: Object.keys(this.patterns)
    };
  }
}