import { jest } from '@jest/globals';
import { google } from 'googleapis';
import { YouTubeApiService } from '../../../src/services/implementations/youtube-api-service.js';

// Mock all YouTube API methods
const mockVideosList = jest.fn();
const mockChannelsList = jest.fn();
const mockPlaylistsList = jest.fn();
const mockPlaylistItemsList = jest.fn();
const mockSearchList = jest.fn();
const mockCommentThreadsList = jest.fn();

jest.spyOn(google, 'youtube').mockReturnValue({
  videos: { list: mockVideosList },
  channels: { list: mockChannelsList },
  playlists: { list: mockPlaylistsList },
  playlistItems: { list: mockPlaylistItemsList },
  search: { list: mockSearchList },
  commentThreads: { list: mockCommentThreadsList },
});

describe('YouTubeApiService', () => {
  let youtubeService;
  let mockLogger;
  let mockYouTubeApi;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    mockYouTubeApi = {
      videos: { list: mockVideosList },
      channels: { list: mockChannelsList },
      playlists: { list: mockPlaylistsList },
      playlistItems: { list: mockPlaylistItemsList },
      search: { list: mockSearchList },
      commentThreads: { list: mockCommentThreadsList },
    };

    youtubeService = new YouTubeApiService({
      logger: mockLogger,
      youtube: mockYouTubeApi,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided dependencies', () => {
      expect(youtubeService.logger).toBe(mockLogger);
      expect(youtubeService.youtube).toBe(mockYouTubeApi);
    });

    it('should create google youtube instance when not provided', () => {
      const originalEnv = process.env.YOUTUBE_API_KEY;
      process.env.YOUTUBE_API_KEY = 'test-api-key';

      const service = new YouTubeApiService({ logger: mockLogger });
      expect(service.youtube).toBeDefined();

      process.env.YOUTUBE_API_KEY = originalEnv;
    });
  });

  describe('getVideoDetails', () => {
    const validVideoId = 'dQw4w9WgXcQ';
    const mockVideoData = {
      items: [
        {
          id: validVideoId,
          snippet: {
            title: 'Test Video',
            channelTitle: 'Test Channel',
            description: 'Test description',
            publishedAt: '2023-01-01T00:00:00Z',
          },
          contentDetails: { duration: 'PT4M33S' },
          statistics: { viewCount: '1000', likeCount: '100' },
          liveStreamingDetails: { scheduledStartTime: new Date().toISOString() },
        },
      ],
    };

    it('should fetch video details successfully', async () => {
      mockVideosList.mockResolvedValue({ data: mockVideoData });

      const result = await youtubeService.getVideoDetails(validVideoId);

      expect(result).toEqual(mockVideoData.items[0]);
      expect(mockVideosList).toHaveBeenCalledWith({
        part: 'snippet,contentDetails,liveStreamingDetails,statistics',
        id: validVideoId,
      });
    });

    it('should return null when video not found', async () => {
      mockVideosList.mockResolvedValue({ data: { items: [] } });

      const result = await youtubeService.getVideoDetails(validVideoId);

      expect(result).toBeNull();
    });

    it('should throw error for invalid video ID', async () => {
      await expect(youtubeService.getVideoDetails('')).rejects.toThrow('Invalid video ID:');
      await expect(youtubeService.getVideoDetails(null)).rejects.toThrow('Invalid video ID:');
    });

    it('should handle API errors', async () => {
      const apiError = new Error('API quota exceeded');
      mockVideosList.mockRejectedValue(apiError);

      await expect(youtubeService.getVideoDetails(validVideoId)).rejects.toThrow(
        `Failed to fetch video details for ${validVideoId}: API quota exceeded`
      );
    });
  });

  describe('getChannelDetails', () => {
    const validChannelId = 'UC_x5XG1OV2P6uZZ5FSM9Ttw';
    const mockChannelData = {
      items: [
        {
          id: validChannelId,
          snippet: {
            title: 'Test Channel',
            description: 'Test channel description',
            customUrl: '@testchannel',
          },
          statistics: {
            subscriberCount: '1000000',
            videoCount: '500',
          },
        },
      ],
    };

    it('should fetch channel details successfully', async () => {
      mockChannelsList.mockResolvedValue({ data: mockChannelData });

      const result = await youtubeService.getChannelDetails(validChannelId);

      expect(result).toEqual(mockChannelData.items[0]);
      expect(mockChannelsList).toHaveBeenCalledWith({
        part: 'snippet,contentDetails,statistics',
        id: validChannelId,
      });
    });

    it('should return null when channel not found', async () => {
      mockChannelsList.mockResolvedValue({ data: { items: [] } });

      const result = await youtubeService.getChannelDetails(validChannelId);

      expect(result).toBeNull();
    });

    it('should throw error for invalid channel ID', async () => {
      await expect(youtubeService.getChannelDetails('')).rejects.toThrow('Invalid channel ID:');
    });

    it('should handle API errors', async () => {
      mockChannelsList.mockRejectedValue(new Error('Network error'));

      await expect(youtubeService.getChannelDetails(validChannelId)).rejects.toThrow('Failed to fetch channel details');
    });
  });

  describe('getChannelVideos', () => {
    const validChannelId = 'UC_x5XG1OV2P6uZZ5FSM9Ttw';
    const uploadPlaylistId = 'UU_x5XG1OV2P6uZZ5FSM9Ttw';

    const mockChannelResponse = {
      items: [
        {
          contentDetails: {
            relatedPlaylists: {
              uploads: uploadPlaylistId,
            },
          },
        },
      ],
    };

    const mockPlaylistResponse = {
      items: [
        {
          snippet: {
            resourceId: { videoId: 'video1' },
          },
        },
        {
          snippet: {
            resourceId: { videoId: 'video2' },
          },
        },
      ],
    };

    const mockVideosResponse = {
      items: [
        {
          id: 'video1',
          snippet: { title: 'Video 1' },
        },
        {
          id: 'video2',
          snippet: { title: 'Video 2' },
        },
      ],
    };

    it('should fetch channel videos successfully', async () => {
      mockChannelsList.mockResolvedValue({ data: mockChannelResponse });
      mockPlaylistItemsList.mockResolvedValue({ data: mockPlaylistResponse });
      mockVideosList.mockResolvedValue({ data: mockVideosResponse });

      const result = await youtubeService.getChannelVideos(validChannelId, 10);

      expect(result).toEqual(mockVideosResponse.items);
      expect(mockChannelsList).toHaveBeenCalledWith({
        part: 'contentDetails',
        id: validChannelId,
      });
      expect(mockPlaylistItemsList).toHaveBeenCalledWith({
        part: 'snippet',
        playlistId: uploadPlaylistId,
        maxResults: 10,
      });
      expect(mockVideosList).toHaveBeenCalledWith({
        part: 'snippet,contentDetails,liveStreamingDetails,statistics',
        id: 'video1,video2',
      });
    });

    it('should return empty array when no videos found', async () => {
      mockChannelsList.mockResolvedValue({ data: mockChannelResponse });
      mockPlaylistItemsList.mockResolvedValue({ data: { items: [] } });

      const result = await youtubeService.getChannelVideos(validChannelId);

      expect(result).toEqual([]);
      expect(mockVideosList).not.toHaveBeenCalled();
    });

    it('should throw error when channel not found', async () => {
      mockChannelsList.mockResolvedValue({ data: { items: [] } });

      await expect(youtubeService.getChannelVideos(validChannelId)).rejects.toThrow(
        `Channel ${validChannelId} not found`
      );
    });

    it('should limit maxResults to 50', async () => {
      mockChannelsList.mockResolvedValue({ data: mockChannelResponse });
      mockPlaylistItemsList.mockResolvedValue({ data: { items: [] } });

      await youtubeService.getChannelVideos(validChannelId, 100);

      expect(mockPlaylistItemsList).toHaveBeenCalledWith({
        part: 'snippet',
        playlistId: uploadPlaylistId,
        maxResults: 50,
      });
    });
  });

  describe('searchVideos', () => {
    const mockSearchResponse = {
      items: [
        {
          id: { videoId: 'search1' },
          snippet: { title: 'Search Result 1' },
        },
        {
          id: { videoId: 'search2' },
          snippet: { title: 'Search Result 2' },
        },
      ],
    };

    it('should search videos with basic query', async () => {
      mockSearchList.mockResolvedValue({ data: mockSearchResponse });

      const result = await youtubeService.searchVideos('test query');

      expect(result).toEqual(mockSearchResponse.items);
      expect(mockSearchList).toHaveBeenCalledWith({
        part: 'snippet',
        q: 'test query',
        type: 'video',
        maxResults: 10,
        order: 'relevance',
      });
    });

    it('should search videos with options', async () => {
      mockSearchList.mockResolvedValue({ data: mockSearchResponse });

      const options = {
        maxResults: 25,
        order: 'date',
        channelId: 'UC123',
        publishedAfter: '2023-01-01T00:00:00Z',
      };

      await youtubeService.searchVideos('test query', options);

      expect(mockSearchList).toHaveBeenCalledWith({
        part: 'snippet',
        q: 'test query',
        type: 'video',
        maxResults: 25,
        order: 'date',
        channelId: 'UC123',
        publishedAfter: '2023-01-01T00:00:00Z',
      });
    });

    it('should handle search API errors', async () => {
      mockSearchList.mockRejectedValue(new Error('Search failed'));

      await expect(youtubeService.searchVideos('test')).rejects.toThrow('Failed to search videos: Search failed');
    });
  });

  describe('getVideoStatistics', () => {
    const validVideoId = 'dQw4w9WgXcQ';
    const mockStatsResponse = {
      items: [
        {
          statistics: {
            viewCount: '1000000',
            likeCount: '50000',
            commentCount: '1000',
          },
        },
      ],
    };

    it('should fetch video statistics successfully', async () => {
      mockVideosList.mockResolvedValue({ data: mockStatsResponse });

      const result = await youtubeService.getVideoStatistics(validVideoId);

      expect(result).toEqual(mockStatsResponse.items[0].statistics);
      expect(mockVideosList).toHaveBeenCalledWith({
        part: 'statistics',
        id: validVideoId,
      });
    });

    it('should return null when video not found', async () => {
      mockVideosList.mockResolvedValue({ data: { items: [] } });

      const result = await youtubeService.getVideoStatistics(validVideoId);

      expect(result).toBeNull();
    });

    it('should throw error for invalid video ID', async () => {
      await expect(youtubeService.getVideoStatistics('')).rejects.toThrow('Invalid video ID:');
    });
  });

  describe('getPlaylistDetails', () => {
    const playlistId = 'PLtest123';
    const mockPlaylistResponse = {
      items: [
        {
          id: playlistId,
          snippet: {
            title: 'Test Playlist',
            description: 'Test playlist description',
          },
          contentDetails: {
            itemCount: 25,
          },
        },
      ],
    };

    it('should fetch playlist details successfully', async () => {
      mockPlaylistsList.mockResolvedValue({ data: mockPlaylistResponse });

      const result = await youtubeService.getPlaylistDetails(playlistId);

      expect(result).toEqual(mockPlaylistResponse.items[0]);
      expect(mockPlaylistsList).toHaveBeenCalledWith({
        part: 'snippet,contentDetails',
        id: playlistId,
      });
    });

    it('should return null when playlist not found', async () => {
      mockPlaylistsList.mockResolvedValue({ data: { items: [] } });

      const result = await youtubeService.getPlaylistDetails(playlistId);

      expect(result).toBeNull();
    });
  });

  describe('getPlaylistVideos', () => {
    const playlistId = 'PLtest123';
    const mockPlaylistVideosResponse = {
      items: [
        {
          snippet: {
            title: 'Playlist Video 1',
            resourceId: { videoId: 'video1' },
          },
        },
        {
          snippet: {
            title: 'Playlist Video 2',
            resourceId: { videoId: 'video2' },
          },
        },
      ],
    };

    it('should fetch playlist videos successfully', async () => {
      mockPlaylistItemsList.mockResolvedValue({ data: mockPlaylistVideosResponse });

      const result = await youtubeService.getPlaylistVideos(playlistId, 25);

      expect(result).toEqual(mockPlaylistVideosResponse.items);
      expect(mockPlaylistItemsList).toHaveBeenCalledWith({
        part: 'snippet',
        playlistId,
        maxResults: 25,
      });
    });

    it('should limit maxResults to 50', async () => {
      mockPlaylistItemsList.mockResolvedValue({ data: { items: [] } });

      await youtubeService.getPlaylistVideos(playlistId, 100);

      expect(mockPlaylistItemsList).toHaveBeenCalledWith({
        part: 'snippet',
        playlistId,
        maxResults: 50,
      });
    });
  });

  describe('isVideoLive', () => {
    const validVideoId = 'dQw4w9WgXcQ';

    it('should return true for live video', async () => {
      const mockLiveVideo = {
        snippet: { liveBroadcastContent: 'live' },
      };
      jest.spyOn(youtubeService, 'getVideoDetails').mockResolvedValue(mockLiveVideo);

      const result = await youtubeService.isVideoLive(validVideoId);

      expect(result).toBe(true);
    });

    it('should return false for non-live video', async () => {
      const mockRegularVideo = {
        snippet: { liveBroadcastContent: 'none' },
      };
      jest.spyOn(youtubeService, 'getVideoDetails').mockResolvedValue(mockRegularVideo);

      const result = await youtubeService.isVideoLive(validVideoId);

      expect(result).toBe(false);
    });

    it('should return false when video not found', async () => {
      jest.spyOn(youtubeService, 'getVideoDetails').mockResolvedValue(null);

      const result = await youtubeService.isVideoLive(validVideoId);

      expect(result).toBe(false);
    });

    it('should return false when error occurs', async () => {
      jest.spyOn(youtubeService, 'getVideoDetails').mockRejectedValue(new Error('API error'));

      const result = await youtubeService.isVideoLive(validVideoId);

      expect(result).toBe(false);
    });
  });

  describe('getLiveStreamDetails', () => {
    const validVideoId = 'dQw4w9WgXcQ';

    it('should return live stream details', async () => {
      const mockLiveStreamDetails = {
        scheduledStartTime: '2023-01-01T12:00:00Z',
        actualStartTime: '2023-01-01T12:01:00Z',
        concurrentViewers: '1000',
      };
      const mockVideo = {
        liveStreamingDetails: mockLiveStreamDetails,
      };
      jest.spyOn(youtubeService, 'getVideoDetails').mockResolvedValue(mockVideo);

      const result = await youtubeService.getLiveStreamDetails(validVideoId);

      expect(result).toEqual(mockLiveStreamDetails);
    });

    it('should return null when video has no live stream details', async () => {
      const mockVideo = { snippet: { title: 'Regular video' } };
      jest.spyOn(youtubeService, 'getVideoDetails').mockResolvedValue(mockVideo);

      const result = await youtubeService.getLiveStreamDetails(validVideoId);

      expect(result).toBeNull();
    });

    it('should return null when video not found', async () => {
      jest.spyOn(youtubeService, 'getVideoDetails').mockResolvedValue(null);

      const result = await youtubeService.getLiveStreamDetails(validVideoId);

      expect(result).toBeNull();
    });

    it('should return null when error occurs', async () => {
      jest.spyOn(youtubeService, 'getVideoDetails').mockRejectedValue(new Error('API error'));

      const result = await youtubeService.getLiveStreamDetails(validVideoId);

      expect(result).toBeNull();
    });
  });

  describe('getVideoComments', () => {
    const validVideoId = 'dQw4w9WgXcQ';
    const mockCommentsResponse = {
      items: [
        {
          snippet: {
            topLevelComment: {
              snippet: {
                textDisplay: 'Great video!',
                authorDisplayName: 'User1',
              },
            },
          },
        },
      ],
    };

    it('should fetch video comments successfully', async () => {
      mockCommentThreadsList.mockResolvedValue({ data: mockCommentsResponse });

      const result = await youtubeService.getVideoComments(validVideoId, 10);

      expect(result).toEqual(mockCommentsResponse.items);
      expect(mockCommentThreadsList).toHaveBeenCalledWith({
        part: 'snippet',
        videoId: validVideoId,
        maxResults: 10,
        order: 'time',
      });
    });

    it('should limit maxResults to 100', async () => {
      mockCommentThreadsList.mockResolvedValue({ data: { items: [] } });

      await youtubeService.getVideoComments(validVideoId, 200);

      expect(mockCommentThreadsList).toHaveBeenCalledWith({
        part: 'snippet',
        videoId: validVideoId,
        maxResults: 100,
        order: 'time',
      });
    });

    it('should throw error for invalid video ID', async () => {
      await expect(youtubeService.getVideoComments('')).rejects.toThrow('Invalid video ID:');
    });
  });

  describe('getChannelUploadPlaylist', () => {
    const validChannelId = 'UC_x5XG1OV2P6uZZ5FSM9Ttw';
    const uploadPlaylistId = 'UU_x5XG1OV2P6uZZ5FSM9Ttw';

    it('should get channel upload playlist ID', async () => {
      const mockResponse = {
        items: [
          {
            contentDetails: {
              relatedPlaylists: {
                uploads: uploadPlaylistId,
              },
            },
          },
        ],
      };
      mockChannelsList.mockResolvedValue({ data: mockResponse });

      const result = await youtubeService.getChannelUploadPlaylist(validChannelId);

      expect(result).toBe(uploadPlaylistId);
      expect(mockChannelsList).toHaveBeenCalledWith({
        part: 'contentDetails',
        id: validChannelId,
      });
    });

    it('should throw error when channel not found', async () => {
      mockChannelsList.mockResolvedValue({ data: { items: [] } });

      await expect(youtubeService.getChannelUploadPlaylist(validChannelId)).rejects.toThrow(
        `Channel ${validChannelId} not found`
      );
    });
  });

  describe('getQuotaUsage', () => {
    it('should return quota usage information', async () => {
      const result = await youtubeService.getQuotaUsage();

      expect(result).toEqual({
        used: 'unknown',
        remaining: 'unknown',
        resetTime: 'daily',
      });
    });
  });

  describe('validateApiKey', () => {
    it('should return true for valid API key', async () => {
      mockChannelsList.mockResolvedValue({ data: { items: [] } });

      const result = await youtubeService.validateApiKey();

      expect(result).toBe(true);
      expect(mockChannelsList).toHaveBeenCalledWith({
        part: 'id',
        mine: false,
        id: 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
      });
    });

    it('should return false for invalid API key', async () => {
      mockChannelsList.mockRejectedValue(new Error('Invalid API key'));

      const result = await youtubeService.validateApiKey();

      expect(result).toBe(false);
    });

    it('should return true for non-API key errors', async () => {
      mockChannelsList.mockRejectedValue(new Error('Network timeout'));

      const result = await youtubeService.validateApiKey();

      expect(result).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      const networkError = new Error('ECONNREFUSED');
      mockVideosList.mockRejectedValue(networkError);

      await expect(youtubeService.getVideoDetails('dQw4w9WgXcQ')).rejects.toThrow(
        'Failed to fetch video details for dQw4w9WgXcQ: ECONNREFUSED'
      );
    });

    it('should handle rate limiting errors', async () => {
      const rateLimitError = new Error('quotaExceeded');
      mockSearchList.mockRejectedValue(rateLimitError);

      await expect(youtubeService.searchVideos('test')).rejects.toThrow('Failed to search videos: quotaExceeded');
    });

    it('should handle malformed API responses', async () => {
      mockVideosList.mockResolvedValue({ data: null });

      await expect(youtubeService.getVideoDetails('dQw4w9WgXcQ')).rejects.toThrow();
    });
  });
});
