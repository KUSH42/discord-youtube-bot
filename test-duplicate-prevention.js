#!/usr/bin/env node
// Unit tests for duplicate prevention regex patterns and logic

import assert from 'assert';
import { describe, it, before } from 'node:test';

// Test data
const testData = {
    youtubeUrls: [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtu.be/dQw4w9WgXcQ',
        'https://youtube.com/shorts/dQw4w9WgXcQ',
        'https://www.youtube.com/embed/dQw4w9WgXcQ',
        'https://www.youtube.com/v/dQw4w9WgXcQ',
        'Check this out: https://www.youtube.com/watch?v=dQw4w9WgXcQ amazing!',
        'Multiple videos: https://youtu.be/abc12345678 and https://www.youtube.com/watch?v=def98765432'
    ],
    twitterUrls: [
        'https://x.com/user/status/1234567890123456789',
        'https://twitter.com/elonmusk/status/9876543210987654321',
        'https://vxtwitter.com/user/status/1111222233334444555',
        'https://fxtwitter.com/user/status/5555444433332222111',
        'https://nitter.net/user/status/9999888877776666555',
        'https://x.com/i/web/status/1234567890123456789',
        'Check this tweet: https://x.com/user/status/1234567890123456789 cool!',
        'Multiple tweets: https://x.com/user1/status/111 and https://twitter.com/user2/status/222'
    ],
    expectedYouTubeIds: [
        'dQw4w9WgXcQ', 'dQw4w9WgXcQ', 'dQw4w9WgXcQ', 'dQw4w9WgXcQ', 'dQw4w9WgXcQ',
        'dQw4w9WgXcQ', ['abc12345678', 'def98765432']
    ],
    expectedTwitterIds: [
        '1234567890123456789', '9876543210987654321', '1111222233334444555',
        '5555444433332222111', '9999888877776666555', '1234567890123456789',
        '1234567890123456789', ['111', '222']
    ]
};

describe('Regex Pattern Tests', () => {
    let videoUrlRegex, tweetUrlRegex;

    before(() => {
        // Use the exact same regex patterns from the codebase
        videoUrlRegex = /https?:\/\/(?:(?:www\.)?youtube\.com\/(?:watch\?v=|live\/|shorts\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
        tweetUrlRegex = /https?:\/\/(?:[\w-]+\.)*(?:x\.com|twitter\.com|vxtwitter\.com|fxtwitter\.com|nitter\.[^\/]+)\/(?:(?:i\/web\/)?status(?:es)?|[^\/]+\/status(?:es)?)\/(\d+)/g;
    });

    describe('YouTube URL Regex', () => {
        it('should extract correct video IDs from various YouTube URL formats', () => {
            testData.youtubeUrls.forEach((url, index) => {
                const matches = [...url.matchAll(videoUrlRegex)];
                
                if (Array.isArray(testData.expectedYouTubeIds[index])) {
                    // Multiple videos in one string
                    const extractedIds = matches.map(match => match[1]);
                    assert.deepStrictEqual(extractedIds, testData.expectedYouTubeIds[index], 
                        `Failed for URL: ${url}`);
                } else {
                    // Single video
                    assert.strictEqual(matches.length, 1, `Should find exactly 1 match for: ${url}`);
                    assert.strictEqual(matches[0][1], testData.expectedYouTubeIds[index], 
                        `Video ID mismatch for: ${url}`);
                }
            });
        });

        it('should use match[1] for YouTube video IDs', () => {
            const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
            const matches = [...testUrl.matchAll(videoUrlRegex)];
            
            assert.strictEqual(matches.length, 1);
            assert.strictEqual(matches[0][0], testUrl); // Full match
            assert.strictEqual(matches[0][1], 'dQw4w9WgXcQ'); // Video ID
            assert.strictEqual(matches[0][2], undefined); // Should be undefined
        });
    });

    describe('X/Twitter URL Regex', () => {
        it('should extract correct tweet IDs from various X/Twitter URL formats', () => {
            testData.twitterUrls.forEach((url, index) => {
                const matches = [...url.matchAll(tweetUrlRegex)];
                
                if (Array.isArray(testData.expectedTwitterIds[index])) {
                    // Multiple tweets in one string
                    const extractedIds = matches.map(match => match[1]);
                    assert.deepStrictEqual(extractedIds, testData.expectedTwitterIds[index], 
                        `Failed for URL: ${url}`);
                } else {
                    // Single tweet
                    assert.strictEqual(matches.length, 1, `Should find exactly 1 match for: ${url}`);
                    assert.strictEqual(matches[0][1], testData.expectedTwitterIds[index], 
                        `Tweet ID mismatch for: ${url}`);
                }
            });
        });

        it('should use match[1] for Twitter/X tweet IDs (NOT match[2])', () => {
            const testUrl = 'https://x.com/user/status/1234567890123456789';
            const matches = [...testUrl.matchAll(tweetUrlRegex)];
            
            assert.strictEqual(matches.length, 1);
            assert.strictEqual(matches[0][0], testUrl); // Full match
            assert.strictEqual(matches[0][1], '1234567890123456789'); // Tweet ID (CORRECT)
            assert.strictEqual(matches[0][2], undefined); // Should be undefined (ORIGINAL CODE BUG)
        });

        it('should confirm original code bug: match[2] is undefined', () => {
            testData.twitterUrls.forEach(url => {
                const matches = [...url.matchAll(tweetUrlRegex)];
                matches.forEach(match => {
                    assert.strictEqual(match[2], undefined, 
                        `match[2] should be undefined for: ${url}, but got: ${match[2]}`);
                    assert.notStrictEqual(match[1], undefined, 
                        `match[1] should contain tweet ID for: ${url}`);
                });
            });
        });
    });

    describe('Regex Capture Group Analysis', () => {
        it('should analyze YouTube regex capture groups', () => {
            const regexSource = videoUrlRegex.source;
            // Count non-capturing groups (?:...) vs capturing groups (...)
            const allGroups = regexSource.match(/\(/g) || [];
            const nonCapturingGroups = regexSource.match(/\(\?\:/g) || [];
            const capturingGroups = allGroups.length - nonCapturingGroups.length;
            
            assert.strictEqual(capturingGroups, 1, 'YouTube regex should have exactly 1 capturing group');
        });

        it('should analyze X/Twitter regex capture groups', () => {
            const regexSource = tweetUrlRegex.source;
            // Count non-capturing groups (?:...) vs capturing groups (...)
            const allGroups = regexSource.match(/\(/g) || [];
            const nonCapturingGroups = regexSource.match(/\(\?\:/g) || [];
            const capturingGroups = allGroups.length - nonCapturingGroups.length;
            
            assert.strictEqual(capturingGroups, 1, 'X/Twitter regex should have exactly 1 capturing group');
        });
    });
});

describe('Duplicate Prevention Logic Tests', () => {
    let knownVideoIds, knownTweetIds;

    before(() => {
        knownVideoIds = new Set();
        knownTweetIds = new Set();
    });

    describe('Set Behavior with undefined', () => {
        it('should handle undefined values in Set (original bug behavior)', () => {
            const testSet = new Set();
            
            // Simulate original bug: adding undefined values
            testSet.add(undefined);
            testSet.add(undefined);
            testSet.add('realId');
            testSet.add(undefined);
            
            assert.strictEqual(testSet.size, 2); // Only 1 undefined + 1 real ID
            assert.strictEqual(testSet.has(undefined), true);
            assert.strictEqual(testSet.has('realId'), true);
            assert.strictEqual(testSet.has('otherId'), false);
        });

        it('should demonstrate why original X/Twitter duplicate detection was broken', () => {
            const testUrls = [
                'First tweet: https://x.com/user/status/111',
                'Second tweet: https://x.com/user/status/222',
                'Third tweet: https://x.com/user/status/333'
            ];
            
            const tweetUrlRegex = /https?:\/\/(?:[\w-]+\.)*(?:x\.com|twitter\.com|vxtwitter\.com|fxtwitter\.com|nitter\.[^\/]+)\/(?:(?:i\/web\/)?status(?:es)?|[^\/]+\/status(?:es)?)\/(\d+)/g;
            const buggyKnownIds = new Set();
            const correctKnownIds = new Set();
            
            testUrls.forEach(url => {
                const matches = [...url.matchAll(tweetUrlRegex)];
                matches.forEach(match => {
                    // Original buggy behavior
                    const buggyId = match[2]; // undefined
                    buggyKnownIds.add(buggyId);
                    
                    // Correct behavior
                    const correctId = match[1]; // actual tweet ID
                    correctKnownIds.add(correctId);
                });
            });
            
            // Buggy behavior: all IDs are undefined, so only 1 entry in Set
            assert.strictEqual(buggyKnownIds.size, 1);
            assert.strictEqual(buggyKnownIds.has(undefined), true);
            
            // Correct behavior: 3 unique tweet IDs
            assert.strictEqual(correctKnownIds.size, 3);
            assert.strictEqual(correctKnownIds.has('111'), true);
            assert.strictEqual(correctKnownIds.has('222'), true);
            assert.strictEqual(correctKnownIds.has('333'), true);
        });
    });

    describe('Cross-platform duplicate detection', () => {
        it('should detect YouTube duplicates across different URL formats', () => {
            const videoId = 'dQw4w9WgXcQ';
            const urls = [
                'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                'https://youtu.be/dQw4w9WgXcQ',
                'https://youtube.com/shorts/dQw4w9WgXcQ'
            ];
            
            const videoUrlRegex = /https?:\/\/(?:(?:www\.)?youtube\.com\/(?:watch\?v=|live\/|shorts\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
            const seenVideos = new Set();
            let duplicateCount = 0;
            
            urls.forEach(url => {
                const matches = [...url.matchAll(videoUrlRegex)];
                matches.forEach(match => {
                    const extractedId = match[1];
                    if (seenVideos.has(extractedId)) {
                        duplicateCount++;
                    } else {
                        seenVideos.add(extractedId);
                    }
                });
            });
            
            assert.strictEqual(seenVideos.size, 1); // Only one unique video
            assert.strictEqual(duplicateCount, 2); // Two duplicates detected
            assert.strictEqual(seenVideos.has(videoId), true);
        });

        it('should detect X/Twitter duplicates across different platforms', () => {
            const tweetId = '1234567890123456789';
            const urls = [
                'https://x.com/user/status/1234567890123456789',
                'https://twitter.com/user/status/1234567890123456789',
                'https://vxtwitter.com/user/status/1234567890123456789'
            ];
            
            const tweetUrlRegex = /https?:\/\/(?:[\w-]+\.)*(?:x\.com|twitter\.com|vxtwitter\.com|fxtwitter\.com|nitter\.[^\/]+)\/(?:(?:i\/web\/)?status(?:es)?|[^\/]+\/status(?:es)?)\/(\d+)/g;
            const seenTweets = new Set();
            let duplicateCount = 0;
            
            urls.forEach(url => {
                const matches = [...url.matchAll(tweetUrlRegex)];
                matches.forEach(match => {
                    const extractedId = match[1]; // Using correct index
                    if (seenTweets.has(extractedId)) {
                        duplicateCount++;
                    } else {
                        seenTweets.add(extractedId);
                    }
                });
            });
            
            assert.strictEqual(seenTweets.size, 1); // Only one unique tweet
            assert.strictEqual(duplicateCount, 2); // Two duplicates detected
            assert.strictEqual(seenTweets.has(tweetId), true);
        });
    });
});

// Run the tests
console.log('🧪 Running Duplicate Prevention Unit Tests...\n');