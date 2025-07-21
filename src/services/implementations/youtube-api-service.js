import { google } from 'googleapis';
import { YouTubeService } from '../interfaces/youtube-service.js';

/**
 * YouTube Data API implementation of YouTubeService
 */
export class YouTubeApiService extends YouTubeService {
  constructor({ logger, youtube }) {
    super();
    this.logger = logger;
    this.youtube =
      youtube ||
      google.youtube({
        version: 'v3',
        auth: process.env.YOUTUBE_API_KEY,
      });
  }

  /**
   * Get video details by ID
   */
  async getVideoDetails(videoId) {
    if (!this.validateVideoId(videoId)) {
      throw new Error(`Invalid video ID: ${videoId}`);
    }

    try {
      const response = await this.youtube.videos.list({
        part: 'snippet,contentDetails,liveStreamingDetails,statistics',
        id: videoId,
      });

      return response.data.items[0] || null;
    } catch (error) {
      throw new Error(`Failed to fetch video details for ${videoId}: ${error.message}`);
    }
  }

  /**
   * Get channel details by ID
   */
  async getChannelDetails(channelId) {
    if (!this.validateChannelId(channelId)) {
      throw new Error(`Invalid channel ID: ${channelId}`);
    }

    try {
      const response = await this.youtube.channels.list({
        part: 'snippet,contentDetails,statistics',
        id: channelId,
      });

      return response.data.items[0] || null;
    } catch (error) {
      throw new Error(`Failed to fetch channel details for ${channelId}: ${error.message}`);
    }
  }

  /**
   * Get latest videos from a channel
   */
  async getChannelVideos(channelId, maxResults = 10) {
    if (!this.validateChannelId(channelId)) {
      throw new Error(`Invalid channel ID: ${channelId}`);
    }

    try {
      // First get the upload playlist ID
      const channelResponse = await this.youtube.channels.list({
        part: 'contentDetails',
        id: channelId,
      });

      if (!channelResponse.data.items[0]) {
        throw new Error(`Channel ${channelId} not found`);
      }

      const uploadPlaylistId = channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads;

      // Then get videos from the upload playlist
      const playlistResponse = await this.youtube.playlistItems.list({
        part: 'snippet',
        playlistId: uploadPlaylistId,
        maxResults: Math.min(maxResults, 50),
      });

      // Get detailed info for each video
      const videoIds = playlistResponse.data.items.map(item => item.snippet.resourceId.videoId);

      if (videoIds.length === 0) {
        return [];
      }

      const videosResponse = await this.youtube.videos.list({
        part: 'snippet,contentDetails,liveStreamingDetails,statistics',
        id: videoIds.join(','),
      });

      return videosResponse.data.items;
    } catch (error) {
      throw new Error(`Failed to fetch channel videos for ${channelId}: ${error.message}`);
    }
  }

  /**
   * Search for videos
   */
  async searchVideos(query, options = {}) {
    try {
      const searchParams = {
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: options.maxResults || 10,
        order: options.order || 'relevance',
      };

      if (options.channelId) {
        searchParams.channelId = options.channelId;
      }

      if (options.publishedAfter) {
        searchParams.publishedAfter = options.publishedAfter;
      }

      const response = await this.youtube.search.list(searchParams);
      return response.data.items;
    } catch (error) {
      throw new Error(`Failed to search videos: ${error.message}`);
    }
  }

  /**
   * Get video statistics
   */
  async getVideoStatistics(videoId) {
    if (!this.validateVideoId(videoId)) {
      throw new Error(`Invalid video ID: ${videoId}`);
    }

    try {
      const response = await this.youtube.videos.list({
        part: 'statistics',
        id: videoId,
      });

      return response.data.items[0]?.statistics || null;
    } catch (error) {
      throw new Error(`Failed to fetch video statistics for ${videoId}: ${error.message}`);
    }
  }

  /**
   * Get playlist details
   */
  async getPlaylistDetails(playlistId) {
    try {
      const response = await this.youtube.playlists.list({
        part: 'snippet,contentDetails',
        id: playlistId,
      });

      return response.data.items[0] || null;
    } catch (error) {
      throw new Error(`Failed to fetch playlist details for ${playlistId}: ${error.message}`);
    }
  }

  /**
   * Get videos from a playlist
   */
  async getPlaylistVideos(playlistId, maxResults = 50) {
    try {
      const response = await this.youtube.playlistItems.list({
        part: 'snippet',
        playlistId,
        maxResults: Math.min(maxResults, 50),
      });

      return response.data.items;
    } catch (error) {
      throw new Error(`Failed to fetch playlist videos for ${playlistId}: ${error.message}`);
    }
  }

  /**
   * Check if a video is live
   */
  async isVideoLive(videoId) {
    try {
      const video = await this.getVideoDetails(videoId);
      if (!video) {
        return false;
      }

      return video.snippet.liveBroadcastContent === 'live';
    } catch {
      return false;
    }
  }

  /**
   * Get live streaming details
   */
  async getLiveStreamDetails(videoId) {
    try {
      const video = await this.getVideoDetails(videoId);
      if (!video || !video.liveStreamingDetails) {
        return null;
      }

      return video.liveStreamingDetails;
    } catch {
      return null;
    }
  }

  /**
   * Get video comments
   */
  async getVideoComments(videoId, maxResults = 20) {
    if (!this.validateVideoId(videoId)) {
      throw new Error(`Invalid video ID: ${videoId}`);
    }

    try {
      const response = await this.youtube.commentThreads.list({
        part: 'snippet',
        videoId,
        maxResults: Math.min(maxResults, 100),
        order: 'time',
      });

      return response.data.items;
    } catch (error) {
      throw new Error(`Failed to fetch comments for ${videoId}: ${error.message}`);
    }
  }

  /**
   * Get channel's upload playlist ID
   */
  async getChannelUploadPlaylist(channelId) {
    if (!this.validateChannelId(channelId)) {
      throw new Error(`Invalid channel ID: ${channelId}`);
    }

    try {
      const response = await this.youtube.channels.list({
        part: 'contentDetails',
        id: channelId,
      });

      const channel = response.data.items[0];
      if (!channel) {
        throw new Error(`Channel ${channelId} not found`);
      }

      return channel.contentDetails.relatedPlaylists.uploads;
    } catch (error) {
      throw new Error(`Failed to get upload playlist for ${channelId}: ${error.message}`);
    }
  }

  /**
   * Get API quota usage information
   */
  async getQuotaUsage() {
    // YouTube API doesn't provide direct quota usage info
    // This would need to be tracked externally
    return {
      used: 'unknown',
      remaining: 'unknown',
      resetTime: 'daily',
    };
  }

  /**
   * Get scheduled livestreams from a channel
   * @param {string} channelId - Channel ID to search for scheduled content
   * @param {number} maxResults - Maximum number of results to return
   * @returns {Array} Array of scheduled livestreams
   */
  async getScheduledContent(channelId, maxResults = 50) {
    if (!this.validateChannelId(channelId)) {
      throw new Error(`Invalid channel ID: ${channelId}`);
    }

    try {
      const response = await this.youtube.search.list({
        part: ['snippet'],
        channelId,
        eventType: 'upcoming', // Scheduled livestreams
        type: 'video',
        maxResults: Math.min(maxResults, 50),
        order: 'date',
      });

      // Get detailed information for each scheduled video
      const videoIds = response.data.items.map(item => item.id.videoId).filter(id => id);

      if (videoIds.length === 0) {
        return [];
      }

      const detailsResponse = await this.youtube.videos.list({
        part: 'snippet,liveStreamingDetails,contentDetails',
        id: videoIds.join(','),
      });

      return detailsResponse.data.items.map(item => ({
        id: item.id,
        title: item.snippet.title,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        scheduledStartTime: item.liveStreamingDetails?.scheduledStartTime,
        actualStartTime: item.liveStreamingDetails?.actualStartTime,
        actualEndTime: item.liveStreamingDetails?.actualEndTime,
        liveBroadcastContent: item.snippet.liveBroadcastContent,
        state: this.determineLivestreamState(item),
        thumbnails: item.snippet.thumbnails,
        channelId: item.snippet.channelId,
        channelTitle: item.snippet.channelTitle,
      }));
    } catch (error) {
      this.logger.error('Failed to fetch scheduled content', {
        channelId,
        error: error.message,
      });
      throw new Error(`Failed to fetch scheduled content for ${channelId}: ${error.message}`);
    }
  }

  /**
   * Check the current state of scheduled content
   * @param {Array<string>} videoIds - Array of video IDs to check
   * @returns {Array} Array of video states
   */
  async checkScheduledContentStates(videoIds) {
    if (!Array.isArray(videoIds) || videoIds.length === 0) {
      return [];
    }

    try {
      const response = await this.youtube.videos.list({
        part: 'snippet,liveStreamingDetails',
        id: videoIds.join(','),
      });

      return response.data.items.map(item => ({
        id: item.id,
        state: this.determineLivestreamState(item),
        liveBroadcastContent: item.snippet.liveBroadcastContent,
        scheduledStartTime: item.liveStreamingDetails?.scheduledStartTime,
        actualStartTime: item.liveStreamingDetails?.actualStartTime,
        actualEndTime: item.liveStreamingDetails?.actualEndTime,
      }));
    } catch (error) {
      this.logger.error('Failed to check scheduled content states', {
        videoIds: videoIds.slice(0, 5), // Log first 5 IDs
        error: error.message,
      });
      throw new Error(`Failed to check content states: ${error.message}`);
    }
  }

  /**
   * Poll scheduled content for state changes
   * @param {Array<Object>} scheduledContent - Array of scheduled content to monitor
   * @returns {Array} Array of content that has changed state
   */
  async pollScheduledContent(scheduledContent) {
    if (!Array.isArray(scheduledContent) || scheduledContent.length === 0) {
      return [];
    }

    const now = new Date();
    const changedContent = [];

    try {
      // Get current states
      const videoIds = scheduledContent.map(content => content.id);
      const currentStates = await this.checkScheduledContentStates(videoIds);

      for (const currentState of currentStates) {
        const originalContent = scheduledContent.find(c => c.id === currentState.id);

        if (!originalContent) {
          continue;
        }

        // Check if scheduled content should now be live
        const scheduledStart = new Date(currentState.scheduledStartTime);
        const shouldBeLive = now >= scheduledStart;

        // Detect state changes
        if (originalContent.state !== currentState.state) {
          changedContent.push({
            ...originalContent,
            newState: currentState.state,
            oldState: originalContent.state,
            actualStartTime: currentState.actualStartTime,
            actualEndTime: currentState.actualEndTime,
            detectionTime: now,
            stateChangeDetected: true,
          });
        } else if (shouldBeLive && currentState.state === 'scheduled') {
          // Content should be live but still shows as scheduled - might need manual check
          this.logger.warn('Scheduled content may have started but API not updated', {
            videoId: currentState.id,
            scheduledStart: scheduledStart.toISOString(),
            currentTime: now.toISOString(),
          });
        }
      }

      return changedContent;
    } catch (error) {
      this.logger.error('Failed to poll scheduled content', {
        contentCount: scheduledContent.length,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Determine the current state of a livestream based on API data
   * @param {Object} videoData - Video data from YouTube API
   * @returns {string} Current state ('scheduled', 'live', 'ended', 'published')
   */
  determineLivestreamState(videoData) {
    const { liveBroadcastContent } = videoData.snippet;
    const liveDetails = videoData.liveStreamingDetails;

    switch (liveBroadcastContent) {
      case 'upcoming':
        return 'scheduled';
      case 'live':
        return 'live';
      case 'none':
        // Check if it was previously a livestream
        if (liveDetails && (liveDetails.actualStartTime || liveDetails.scheduledStartTime)) {
          return liveDetails.actualEndTime ? 'ended' : 'published';
        }
        return 'published';
      default:
        return 'unknown';
    }
  }

  /**
   * Check if API key is valid
   */
  async validateApiKey() {
    try {
      // Try a simple API call to validate the key
      await this.youtube.channels.list({
        part: 'id',
        mine: false,
        id: 'UC_x5XG1OV2P6uZZ5FSM9Ttw', // Google Developers channel
      });
      return true;
    } catch (error) {
      if (error.message.includes('API key')) {
        return false;
      }
      // Other errors might be network issues, so assume key is valid
      return true;
    }
  }
}
