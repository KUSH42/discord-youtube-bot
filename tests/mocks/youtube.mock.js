import { jest } from '@jest/globals';

// Mock YouTube Data API responses
export const mockVideoDetails = {
  id: 'dQw4w9WgXcQ',
  snippet: {
    title: 'Rick Astley - Never Gonna Give You Up (Official Video)',
    description: 'The official video for "Never Gonna Give You Up" by Rick Astley',
    channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
    channelTitle: 'Rick Astley',
    publishedAt: '2009-10-25T06:57:33Z',
    thumbnails: {
      high: {
        url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
      }
    }
  },
  statistics: {
    viewCount: '1000000000',
    likeCount: '10000000'
  },
  liveStreamingDetails: {
    actualStartTime: new Date().toISOString(),
    scheduledStartTime: new Date().toISOString()
  }
};

export const mockLiveStreamDetails = {
  id: 'live123456789',
  snippet: {
    title: 'Live Stream Test',
    description: 'Test live stream',
    channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
    channelTitle: 'Test Channel',
    publishedAt: new Date().toISOString(),
    liveBroadcastContent: 'live',
    thumbnails: {
      high: {
        url: 'https://i.ytimg.com/vi/live123456789/hqdefault_live.jpg'
      }
    }
  },
  liveStreamingDetails: {
    actualStartTime: new Date().toISOString(),
    concurrentViewers: '1000'
  }
};

// Mock PubSubHubbub notification payload
export const mockPubSubNotification = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <link rel="hub" href="https://pubsubhubbub.appspot.com"/>
  <link rel="self" href="https://www.youtube.com/xml/feeds/videos.xml?channel_id=UCuAXFkgsw1L7xaCfnd5JJOw"/>
  <title>YouTube video feed</title>
  <updated>2024-01-01T12:00:00+00:00</updated>
  <entry>
    <id>yt:video:dQw4w9WgXcQ</id>
    <yt:videoId>dQw4w9WgXcQ</yt:videoId>
    <yt:channelId>UCuAXFkgsw1L7xaCfnd5JJOw</yt:channelId>
    <title>Rick Astley - Never Gonna Give You Up (Official Video)</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/>
    <author>
      <name>Rick Astley</name>
      <uri>https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw</uri>
    </author>
    <published>2024-01-01T12:00:00+00:00</published>
    <updated>2024-01-01T12:00:00+00:00</updated>
  </entry>
</feed>`;

// Mock googleapis
export const mockYouTubeAPI = {
  videos: {
    list: jest.fn().mockResolvedValue({
      data: {
        items: [mockVideoDetails]
      }
    })
  }
};

export const mockGoogleAuth = {
  auth: {
    GoogleAuth: jest.fn(() => ({
      getClient: jest.fn().mockResolvedValue({}),
      getAccessToken: jest.fn().mockResolvedValue('mock-token')
    }))
  }
};

export const mockGoogleAPIs = {
  google: {
    youtube: jest.fn(() => mockYouTubeAPI),
    auth: mockGoogleAuth.auth
  }
};

// Mock subscription management
export const mockSubscriptionResponse = {
  status: 202,
  statusText: 'Accepted',
  headers: {
    'content-type': 'application/json'
  }
};

// Helper functions for creating test data
export const createMockVideoDetails = (overrides = {}) => ({
  ...mockVideoDetails,
  ...overrides,
  snippet: {
    ...mockVideoDetails.snippet,
    ...(overrides.snippet || {})
  }
});

export const createMockPubSubNotification = (videoId, channelId = 'UCuAXFkgsw1L7xaCfnd5JJOw') => 
  mockPubSubNotification
    .replace(/dQw4w9WgXcQ/g, videoId)
    .replace(/UCuAXFkgsw1L7xaCfnd5JJOw/g, channelId);

// Mock HMAC signature verification
export const mockHmacSignature = 'sha1=da39a3ee5e6b4b0d3255bfef95601890afd80709';

export const createMockSignature = (data, secret = 'test-secret') => {
  // Simple mock signature for testing
  return `sha1=${Buffer.from(data + secret).toString('hex').substring(0, 40)}`;
};