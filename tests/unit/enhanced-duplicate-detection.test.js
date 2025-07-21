import { jest } from '@jest/globals';
import { DuplicateDetector } from '../../src/duplicate-detector.js';

describe('Enhanced Duplicate Detection with Fingerprinting', () => {
  let duplicateDetector;
  let mockPersistentStorage;
  let mockLogger;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock persistent storage
    mockPersistentStorage = {
      hasFingerprint: jest.fn().mockResolvedValue(false),
      storeFingerprint: jest.fn().mockResolvedValue(),
      hasUrl: jest.fn().mockResolvedValue(false),
      addUrl: jest.fn().mockResolvedValue(),
    };

    // Mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    duplicateDetector = new DuplicateDetector(mockPersistentStorage, mockLogger);
  });

  afterEach(() => {
    duplicateDetector.destroy();
  });

  describe('Content Fingerprinting', () => {
    test('should generate consistent fingerprints for same content', () => {
      const content = {
        title: 'Test Video Title',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        publishedAt: '2025-01-21T12:00:00Z',
      };

      const fingerprint1 = duplicateDetector.generateContentFingerprint(content);
      const fingerprint2 = duplicateDetector.generateContentFingerprint(content);

      expect(fingerprint1).toBe(fingerprint2);
      expect(fingerprint1).toBeTruthy();
      expect(fingerprint1).toMatch(/^dQw4w9WgXcQ:.+:\d+$/);
    });

    test('should generate different fingerprints for different content', () => {
      const content1 = {
        title: 'First Video',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        publishedAt: '2025-01-21T12:00:00Z',
      };

      const content2 = {
        title: 'Second Video',
        url: 'https://www.youtube.com/watch?v=abc123xyz',
        publishedAt: '2025-01-21T12:00:00Z',
      };

      const fingerprint1 = duplicateDetector.generateContentFingerprint(content1);
      const fingerprint2 = duplicateDetector.generateContentFingerprint(content2);

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    test('should normalize titles correctly', () => {
      const title1 = 'Test Video Title!!!';
      const title2 = 'test video title';
      const title3 = 'TEST   VIDEO    TITLE';

      const normalized1 = duplicateDetector.normalizeTitle(title1);
      const normalized2 = duplicateDetector.normalizeTitle(title2);
      const normalized3 = duplicateDetector.normalizeTitle(title3);

      expect(normalized1).toBe(normalized2);
      expect(normalized2).toBe(normalized3);
      expect(normalized1).toBe('test video title');
    });

    test('should extract content IDs from URLs', () => {
      const youtubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      const tweetUrl = 'https://x.com/user/status/1234567890';

      const videoId = duplicateDetector.extractContentId(youtubeUrl);
      const tweetId = duplicateDetector.extractContentId(tweetUrl);

      expect(videoId).toBe('dQw4w9WgXcQ');
      expect(tweetId).toBe('1234567890');
    });
  });

  describe('Enhanced Duplicate Detection', () => {
    test('should detect duplicates using fingerprinting without persistent storage', async () => {
      const content = {
        title: 'Test Video',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        publishedAt: '2025-01-21T12:00:00Z',
      };

      // First check should not be duplicate
      const isDuplicate1 = await duplicateDetector.isDuplicateWithFingerprint(content);
      expect(isDuplicate1).toBe(false);

      // Mark as seen
      await duplicateDetector.markAsSeenWithFingerprint(content);

      // Second check should be duplicate
      const isDuplicate2 = await duplicateDetector.isDuplicateWithFingerprint(content);
      expect(isDuplicate2).toBe(true);
    });

    test('should process content with fingerprinting', async () => {
      const content = {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Test Video',
        publishedAt: '2025-01-21T12:00:00Z',
      };

      const result = await duplicateDetector.processContentWithFingerprint(content);

      expect(result).toHaveProperty('videos');
      expect(result).toHaveProperty('tweets');
      expect(result).toHaveProperty('fingerprint');
      expect(result.fingerprint.enabled).toBe(true);
      expect(result.fingerprint.generated).toBeTruthy();
      expect(result.fingerprint.isDuplicate).toBe(false);
    });

    test('should detect fingerprint duplicates on second processing', async () => {
      const content = {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Test Video',
        publishedAt: '2025-01-21T12:00:00Z',
      };

      // First processing
      const result1 = await duplicateDetector.processContentWithFingerprint(content);
      expect(result1.fingerprint.isDuplicate).toBe(false);

      // Second processing - should detect as duplicate
      const result2 = await duplicateDetector.processContentWithFingerprint(content);
      expect(result2.fingerprint.isDuplicate).toBe(true);
    });
  });

  describe('URL Normalization', () => {
    test('should normalize YouTube URLs correctly', () => {
      const urls = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=123',
        'https://youtu.be/dQw4w9WgXcQ',
        'https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s',
      ];

      const normalized = urls.map(url => duplicateDetector.normalizeUrl(url));

      // All should normalize to the same format
      normalized.forEach(url => {
        expect(url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      });
    });

    test('should normalize X/Twitter URLs correctly', () => {
      const urls = [
        'https://twitter.com/user/status/1234567890',
        'https://x.com/user/status/1234567890',
        'https://vxtwitter.com/user/status/1234567890',
      ];

      const normalized = urls.map(url => duplicateDetector.normalizeUrl(url));

      // All should normalize to x.com format
      normalized.forEach(url => {
        expect(url).toBe('https://x.com/i/status/1234567890');
      });
    });
  });

  describe('Content Type Detection', () => {
    test('should determine content types correctly', () => {
      const youtubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      const tweetUrl = 'https://x.com/user/status/1234567890';
      const unknownUrl = 'https://example.com/content';

      expect(duplicateDetector.determineContentType(youtubeUrl)).toBe('youtube_video');
      expect(duplicateDetector.determineContentType(tweetUrl)).toBe('x_tweet');
      expect(duplicateDetector.determineContentType(unknownUrl)).toBe('unknown');
    });
  });

  describe('Enhanced Statistics', () => {
    test('should include fingerprint information in stats', () => {
      const content = {
        title: 'Test Video',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        publishedAt: '2025-01-21T12:00:00Z',
      };

      duplicateDetector.markAsSeenWithFingerprint(content);
      const stats = duplicateDetector.getEnhancedStats();

      expect(stats).toHaveProperty('fingerprints');
      expect(stats).toHaveProperty('fingerprintingEnabled');
      expect(stats.fingerprintingEnabled).toBe(true);
      expect(stats.fingerprints).toBe(1);
    });
  });

  describe('Memory Management', () => {
    test('should clean up fingerprints when memory gets large', async () => {
      // Create a small max size for testing
      duplicateDetector.maxSize = 5;

      // Add many fingerprints
      for (let i = 0; i < 10; i++) {
        const content = {
          title: `Test Video ${i}`,
          url: `https://www.youtube.com/watch?v=video${i}`,
          publishedAt: '2025-01-21T12:00:00Z',
        };
        await duplicateDetector.markAsSeenWithFingerprint(content);
      }

      const stats = duplicateDetector.getEnhancedStats();
      expect(stats.fingerprints).toBeLessThanOrEqual(duplicateDetector.maxSize);
    });
  });

  describe('Backwards Compatibility', () => {
    test('should work with string input for backwards compatibility', async () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

      const result = await duplicateDetector.processContentWithFingerprint(url);

      expect(result).toHaveProperty('videos');
      expect(result).toHaveProperty('tweets');
      expect(result).toHaveProperty('fingerprint');
      expect(result.fingerprint.enabled).toBe(false); // No title/publishedAt provided
    });

    test('should maintain existing isDuplicate functionality', () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

      // Should not be duplicate initially
      expect(duplicateDetector.isDuplicate(url)).toBe(false);

      // Mark as seen using existing method
      duplicateDetector.markAsSeen(url);

      // Should be duplicate now
      expect(duplicateDetector.isDuplicate(url)).toBe(true);
    });
  });
});
