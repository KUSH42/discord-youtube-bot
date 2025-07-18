import { jest } from '@jest/globals';
import { google } from 'googleapis';
import { YouTubeApiService } from '../../../src/services/implementations/youtube-api-service.js';

const mockList = jest.fn();
jest.spyOn(google, 'youtube').mockReturnValue({
  videos: {
    list: mockList,
  },
});

describe('YouTube API Service', () => {
  let youtubeApiService;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
    };
    youtubeApiService = new YouTubeApiService({ logger: mockLogger });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch video details successfully', async () => {
    const mockVideoData = {
      items: [
        {
          snippet: { title: 'Test Video', channelTitle: 'Test Channel' },
          liveStreamingDetails: { scheduledStartTime: new Date().toISOString() },
        },
      ],
    };
    mockList.mockResolvedValue({ data: mockVideoData });

    const videoDetails = await youtubeApiService.getVideoDetails('dQw4w9WgXcQ');

    expect(videoDetails).toEqual(mockVideoData.items[0]);
    expect(mockList).toHaveBeenCalledWith({
      part: 'snippet,contentDetails,liveStreamingDetails,statistics',
      id: 'dQw4w9WgXcQ',
    });
  });

  it('should handle API errors when fetching video details', async () => {
    const mockError = new Error('API Error');
    mockList.mockRejectedValue(mockError);

    await expect(youtubeApiService.getVideoDetails('dQw4w9WgXcQ')).rejects.toThrow(
      'Failed to fetch video details for dQw4w9WgXcQ: API Error',
    );
  });

  it('should throw an error for invalid video IDs', async () => {
    await expect(youtubeApiService.getVideoDetails('invalid-id')).rejects.toThrow('Invalid video ID: invalid-id');
  });
});
