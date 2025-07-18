/**
 * Abstract YouTube service interface
 * Defines the contract for YouTube API operations that can be mocked in tests
 */
export class YouTubeService {
  /**
   * Get video details by ID
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<Object>} Video details object
   */
  async getVideoDetails(_videoId) {
    throw new Error('Abstract method: getVideoDetails must be implemented');
  }

  /**
   * Get channel details by ID
   * @param {string} channelId - YouTube channel ID
   * @returns {Promise<Object>} Channel details object
   */
  async getChannelDetails(_channelId) {
    throw new Error('Abstract method: getChannelDetails must be implemented');
  }

  /**
   * Get latest videos from a channel
   * @param {string} channelId - YouTube channel ID
   * @param {number} maxResults - Maximum number of results
   * @returns {Promise<Array<Object>>} Array of video objects
   */
  async getChannelVideos(_channelId) {
    throw new Error('Abstract method: getChannelVideos must be implemented');
  }

  /**
   * Search for videos
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array<Object>>} Array of video objects
   */
  async searchVideos(_query) {
    throw new Error('Abstract method: searchVideos must be implemented');
  }

  /**
   * Get video statistics
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<Object>} Video statistics object
   */
  async getVideoStatistics(_videoId) {
    throw new Error('Abstract method: getVideoStatistics must be implemented');
  }

  /**
   * Get playlist details
   * @param {string} playlistId - YouTube playlist ID
   * @returns {Promise<Object>} Playlist details object
   */
  async getPlaylistDetails(_playlistId) {
    throw new Error('Abstract method: getPlaylistDetails must be implemented');
  }

  /**
   * Get videos from a playlist
   * @param {string} playlistId - YouTube playlist ID
   * @param {number} maxResults - Maximum number of results
   * @returns {Promise<Array<Object>>} Array of video objects
   */
  async getPlaylistVideos(_playlistId) {
    throw new.Error('Abstract method: getPlaylistVideos must be implemented');
  }

  /**
   * Check if a video is live
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<boolean>} True if video is live
   */
  async isVideoLive(_videoId) {
    throw new Error('Abstract method: isVideoLive must be implemented');
  }

  /**
   * Get live streaming details
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<Object|null>} Live streaming details or null
   */
  async getLiveStreamDetails(_videoId) {
    throw new Error('Abstract method: getLiveStreamDetails must be implemented');
  }

  /**
   * Get video comments
   * @param {string} videoId - YouTube video ID
   * @param {number} maxResults - Maximum number of results
   * @returns {Promise<Array<Object>>} Array of comment objects
   */
  async getVideoComments(_videoId) {
    throw new Error('Abstract method: getVideoComments must be implemented');
  }

  /**
   * Get channel's upload playlist ID
   * @param {string} channelId - YouTube channel ID
   * @returns {Promise<string>} Upload playlist ID
   */
  async getChannelUploadPlaylist(_channelId) {
    throw new Error('Abstract method: getChannelUploadPlaylist must be implemented');
  }

  /**
   * Validate video ID format
   * @param {string} videoId - YouTube video ID
   * @returns {boolean} True if valid format
   */
  validateVideoId(videoId) {
    if (typeof videoId !== 'string') {
      return false;
    }

    // YouTube video IDs are 11 characters long and contain letters, numbers, hyphens, and underscores
    return /^[A-Za-z0-9_-]{11}$/.test(videoId);
  }

  /**
   * Validate channel ID format
   * @param {string} channelId - YouTube channel ID
   * @returns {boolean} True if valid format
   */
  validateChannelId(channelId) {
    if (typeof channelId !== 'string') {
      return false;
    }

    // YouTube channel IDs start with 'UC' and are 24 characters long
    return /^UC[A-Za-z0-9_-]{22}$/.test(channelId);
  }

  /**
   * Extract video ID from YouTube URL
   * @param {string} url - YouTube URL
   * @returns {string|null} Video ID or null if invalid
   */
  extractVideoId(url) {
    if (typeof url !== 'string') {
      return null;
    }

    // Handle various YouTube URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
      /youtube\.com\/v\/([A-Za-z0-9_-]{11})/,
      /youtube\.com\/.*[?&]v=([A-Za-z0-9_-]{11})/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && this.validateVideoId(match[1])) {
        return match[1];
      }
    }

    // Check if the string is already a video ID
    if (this.validateVideoId(url)) {
      return url;
    }

    return null;
  }

  /**
   * Extract channel ID from YouTube URL
   * @param {string} url - YouTube URL
   * @returns {string|null} Channel ID or null if invalid
   */
  extractChannelId(url) {
    if (typeof url !== 'string') {
      return null;
    }

    // Handle various YouTube channel URL formats
    const patterns = [
      /youtube\.com\/channel\/([A-Za-z0-9_-]{24})/,
      /youtube\.com\/c\/([A-Za-z0-9_-]+)/,
      /youtube\.com\/user\/([A-Za-z0-9_-]+)/,
      /youtube\.com\/@([A-Za-z0-9_-]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // Check if the string is already a channel ID
    if (this.validateChannelId(url)) {
      return url;
    }

    return null;
  }

  /**
   * Get API quota usage information
   * @returns {Promise<Object>} Quota usage details
   */
  async getQuotaUsage() {
    throw new Error('Abstract method: getQuotaUsage must be implemented');
  }

  /**
   * Check if API key is valid
   * @returns {Promise<boolean>} True if API key is valid
   */
  async validateApiKey() {
    throw new Error('Abstract method: validateApiKey must be implemented');
  }

  /**
   * Dispose of resources
   * @returns {Promise<void>}
   */
  async dispose() {
    // No resources to dispose by default
  }
}
