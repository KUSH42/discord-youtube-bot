import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DuplicateDetector, videoUrlRegex, tweetUrlRegex, createDuplicateDetector } from '../../src/duplicate-detector.js';

describe('Duplicate Detection Logic Tests', () => {
  let knownVideoIds, knownTweetIds;
  let duplicateDetector;

  beforeEach(() => {
    knownVideoIds = new Set();
    knownTweetIds = new Set();
    duplicateDetector = new DuplicateDetector();
  });

  afterEach(() => {
    if (duplicateDetector) {
      duplicateDetector.destroy();
    }
  });

  describe('Set-based Duplicate Detection', () => {
    it('should detect YouTube duplicates correctly', () => {
      const videoId = 'dQw4w9WgXcQ';
      const urls = [
        `Check this out: https://www.youtube.com/watch?v=${videoId}`,
        `Short link: https://youtu.be/${videoId}`,
        `Shorts format: https://youtube.com/shorts/${videoId}`,
        `Embedded: https://www.youtube.com/embed/${videoId}`
      ];

      let duplicateCount = 0;
      let uniqueCount = 0;

      urls.forEach(url => {
        const matches = [...url.matchAll(videoUrlRegex)];
        matches.forEach(match => {
          const extractedId = match[1];
          if (knownVideoIds.has(extractedId)) {
            duplicateCount++;
          } else {
            knownVideoIds.add(extractedId);
            uniqueCount++;
          }
        });
      });

      expect(uniqueCount).toBe(1);
      expect(duplicateCount).toBe(3);
      expect(knownVideoIds.size).toBe(1);
      expect(knownVideoIds.has(videoId)).toBe(true);
    });

    it('should detect Twitter duplicates correctly', () => {
      const tweetId = '1234567890123456789';
      const urls = [
        `Original: https://x.com/user/status/${tweetId}`,
        `Twitter: https://twitter.com/user/status/${tweetId}`,
        `VX: https://vxtwitter.com/user/status/${tweetId}`,
        `FX: https://fxtwitter.com/user/status/${tweetId}`
      ];

      let duplicateCount = 0;
      let uniqueCount = 0;

      urls.forEach(url => {
        const matches = [...url.matchAll(tweetUrlRegex)];
        matches.forEach(match => {
          const extractedId = match[1];
          if (knownTweetIds.has(extractedId)) {
            duplicateCount++;
          } else {
            knownTweetIds.add(extractedId);
            uniqueCount++;
          }
        });
      });

      expect(uniqueCount).toBe(1);
      expect(duplicateCount).toBe(3);
      expect(knownTweetIds.size).toBe(1);
      expect(knownTweetIds.has(tweetId)).toBe(true);
    });

    it('should handle multiple unique IDs correctly', () => {
      const videoIds = ['dQw4w9WgXcQ', 'jNQXAC9IVRw', 'oHg5SJYRHA0'];
      const urls = videoIds.map(id => `https://youtu.be/${id}`);

      urls.forEach(url => {
        const matches = [...url.matchAll(videoUrlRegex)];
        matches.forEach(match => {
          knownVideoIds.add(match[1]);
        });
      });

      expect(knownVideoIds.size).toBe(3);
      videoIds.forEach(id => {
        expect(knownVideoIds.has(id)).toBe(true);
      });
    });
  });

  describe('Original Bug Demonstration', () => {
    it('should demonstrate the original Twitter bug with match[2]', () => {
      const buggyKnownIds = new Set();
      const correctKnownIds = new Set();
      
      const testUrls = [
        'First: https://x.com/user/status/1111111111',
        'Second: https://x.com/user/status/2222222222',
        'Third: https://x.com/user/status/3333333333'
      ];

      testUrls.forEach(url => {
        const matches = [...url.matchAll(tweetUrlRegex)];
        matches.forEach(match => {
          // Original buggy behavior (using match[2])
          const buggyId = match[2]; // undefined
          buggyKnownIds.add(buggyId);
          
          // Correct behavior (using match[1])
          const correctId = match[1]; // actual tweet ID
          correctKnownIds.add(correctId);
        });
      });

      // Buggy behavior: all undefined values collapse to single Set entry
      expect(buggyKnownIds.size).toBe(1);
      expect(buggyKnownIds.has(undefined)).toBe(true);
      
      // Correct behavior: 3 unique tweet IDs
      expect(correctKnownIds.size).toBe(3);
      expect(correctKnownIds.has('1111111111')).toBe(true);
      expect(correctKnownIds.has('2222222222')).toBe(true);
      expect(correctKnownIds.has('3333333333')).toBe(true);
    });

    it('should show how undefined values break duplicate detection', () => {
      const testSet = new Set();
      
      // Simulate adding undefined values (original bug)
      testSet.add(undefined);
      testSet.add(undefined);
      testSet.add('realId1');
      testSet.add(undefined);
      testSet.add('realId2');
      testSet.add(undefined);

      // Set deduplicates undefined values, making duplicate detection fail
      expect(testSet.size).toBe(3); // 1 undefined + 2 real IDs
      expect(testSet.has(undefined)).toBe(true);
      expect(testSet.has('realId1')).toBe(true);
      expect(testSet.has('realId2')).toBe(true);
    });
  });

  describe('Cross-platform Duplicate Detection', () => {
    it('should detect duplicates across different URL formats', () => {
      const sameVideoId = 'dQw4w9WgXcQ';
      const urls = [
        `https://www.youtube.com/watch?v=${sameVideoId}`,
        `https://youtu.be/${sameVideoId}`,
        `https://youtube.com/shorts/${sameVideoId}`,
        `https://www.youtube.com/embed/${sameVideoId}?autoplay=1`
      ];

      const detectedVideos = new Set();
      let totalMatches = 0;

      urls.forEach(url => {
        const matches = [...url.matchAll(videoUrlRegex)];
        totalMatches += matches.length;
        matches.forEach(match => {
          detectedVideos.add(match[1]);
        });
      });

      expect(totalMatches).toBe(4); // 4 URLs matched
      expect(detectedVideos.size).toBe(1); // But only 1 unique video
      expect(detectedVideos.has(sameVideoId)).toBe(true);
    });

    it('should detect duplicates across different Twitter platforms', () => {
      const sameTweetId = '1234567890123456789';
      const urls = [
        `https://x.com/user/status/${sameTweetId}`,
        `https://twitter.com/user/status/${sameTweetId}`,
        `https://vxtwitter.com/user/status/${sameTweetId}`,
        `https://fxtwitter.com/user/status/${sameTweetId}`,
        `https://nitter.net/user/status/${sameTweetId}`
      ];

      const detectedTweets = new Set();
      let totalMatches = 0;

      urls.forEach(url => {
        const matches = [...url.matchAll(tweetUrlRegex)];
        totalMatches += matches.length;
        matches.forEach(match => {
          detectedTweets.add(match[1]);
        });
      });

      expect(totalMatches).toBe(5); // 5 URLs matched
      expect(detectedTweets.size).toBe(1); // But only 1 unique tweet
      expect(detectedTweets.has(sameTweetId)).toBe(true);
    });
  });

  describe('Memory Management and Cleanup', () => {
    it('should handle large sets efficiently', () => {
      const largeSet = new Set();
      const numberOfIds = 10000;

      // Add many unique IDs
      for (let i = 0; i < numberOfIds; i++) {
        largeSet.add(`video${i.toString().padStart(7, '0')}`);
      }

      expect(largeSet.size).toBe(numberOfIds);

      // Test duplicate detection performance
      const start = performance.now();
      const duplicateTest = largeSet.has('video0005000');
      const end = performance.now();

      expect(duplicateTest).toBe(true);
      expect(end - start).toBeLessThan(1); // Should be very fast
    });

    it('should handle Set clear operation', () => {
      knownVideoIds.add('video1');
      knownVideoIds.add('video2');
      knownVideoIds.add('video3');

      expect(knownVideoIds.size).toBe(3);

      knownVideoIds.clear();

      expect(knownVideoIds.size).toBe(0);
      expect(knownVideoIds.has('video1')).toBe(false);
    });

    it('should handle Set deletion operation', () => {
      const videoIds = ['video1', 'video2', 'video3'];
      videoIds.forEach(id => knownVideoIds.add(id));

      expect(knownVideoIds.size).toBe(3);

      // Delete specific entries
      knownVideoIds.delete('video2');

      expect(knownVideoIds.size).toBe(2);
      expect(knownVideoIds.has('video1')).toBe(true);
      expect(knownVideoIds.has('video2')).toBe(false);
      expect(knownVideoIds.has('video3')).toBe(true);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty strings gracefully', () => {
      const emptyText = '';
      const videoMatches = [...emptyText.matchAll(videoUrlRegex)];
      const tweetMatches = [...emptyText.matchAll(tweetUrlRegex)];

      expect(videoMatches).toHaveLength(0);
      expect(tweetMatches).toHaveLength(0);
    });

    it('should handle text without URLs gracefully', () => {
      const noUrlText = 'This is just regular text without any URLs';
      const videoMatches = [...noUrlText.matchAll(videoUrlRegex)];
      const tweetMatches = [...noUrlText.matchAll(tweetUrlRegex)];

      expect(videoMatches).toHaveLength(0);
      expect(tweetMatches).toHaveLength(0);
    });

    it('should handle malformed URLs gracefully', () => {
      const malformedUrls = [
        'https://youtube.com/watch?v=',
        'https://x.com/user/status/',
        'https://youtube.com/watch?v=invalid',
        'https://x.com/user/status/notanumber'
      ];

      malformedUrls.forEach(url => {
        const videoMatches = [...url.matchAll(videoUrlRegex)];
        const tweetMatches = [...url.matchAll(tweetUrlRegex)];
        
        expect(videoMatches).toHaveLength(0);
        expect(tweetMatches).toHaveLength(0);
      });
    });

    it('should handle null and undefined values in Set operations', () => {
      const testSet = new Set();
      
      testSet.add(null);
      testSet.add(undefined);
      testSet.add('validId');
      testSet.add(null); // Duplicate null
      testSet.add(undefined); // Duplicate undefined

      expect(testSet.size).toBe(3); // null, undefined, 'validId'
      expect(testSet.has(null)).toBe(true);
      expect(testSet.has(undefined)).toBe(true);
      expect(testSet.has('validId')).toBe(true);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle concurrent duplicate checks efficiently', () => {
      const ids = Array.from({ length: 1000 }, (_, i) => `id${i}`);
      const duplicateIds = [...ids, ...ids]; // Create duplicates

      const uniqueSet = new Set();
      let duplicateCount = 0;

      const start = performance.now();
      
      duplicateIds.forEach(id => {
        if (uniqueSet.has(id)) {
          duplicateCount++;
        } else {
          uniqueSet.add(id);
        }
      });

      const end = performance.now();

      expect(uniqueSet.size).toBe(1000); // 1000 unique IDs
      expect(duplicateCount).toBe(1000); // 1000 duplicates detected
      expect(end - start).toBeLessThan(50); // Should complete quickly
    });

    it('should maintain constant-time lookup performance', () => {
      const largeSet = new Set();
      
      // Add 50,000 items
      for (let i = 0; i < 50000; i++) {
        largeSet.add(`item${i}`);
      }

      // Test lookup times at different positions
      const lookupTimes = [];
      const testItems = ['item1', 'item25000', 'item49999', 'nonexistent'];

      testItems.forEach(item => {
        const start = performance.now();
        largeSet.has(item);
        const end = performance.now();
        lookupTimes.push(end - start);
      });

      // All lookups should be roughly the same time (constant time)
      const maxTime = Math.max(...lookupTimes);
      const minTime = Math.min(...lookupTimes);
      expect(maxTime - minTime).toBeLessThan(1); // Difference should be minimal
    });
  });
});