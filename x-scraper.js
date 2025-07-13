// x-scraper.js
// © 2025 Marco Keller. All rights reserved. This software and its content are proprietary and confidential. Unauthorized reproduction or distribution is strictly prohibited.
// This module contains the XScraper class, responsible for all X (Twitter) related monitoring and scraping.

import puppeteer from 'puppeteer-extra';
import { chromium } from 'playwright';
import { ChannelType } from 'discord.js';

class XScraper {
    constructor(options) {
        this.client = options.client;
        this.logger = options.logger;
        this.sendMirroredMessage = options.sendMirroredMessage; // Utility function from index.js
        this.isAnnouncementEnabled = () => options.isAnnouncementEnabled(); // Function to get the current state

        // --- Configuration Variables ---
        this.X_USER_HANDLE = process.env.X_USER_HANDLE;
        this.DISCORD_X_POSTS_CHANNEL_ID = process.env.DISCORD_X_POSTS_CHANNEL_ID;
        this.DISCORD_X_REPLIES_CHANNEL_ID = process.env.DISCORD_X_REPLIES_CHANNEL_ID;
        this.DISCORD_X_QUOTES_CHANNEL_ID = process.env.DISCORD_X_QUOTES_CHANNEL_ID;
        this.DISCORD_X_RETWEETS_CHANNEL_ID = process.env.DISCORD_X_RETWEETS_CHANNEL_ID;
        this.TWITTER_USERNAME = process.env.TWITTER_USERNAME;
        this.TWITTER_PASSWORD = process.env.TWITTER_PASSWORD;
        this.QUERY_INTERVALL_MIN = parseInt(process.env.X_QUERY_INTERVALL_MIN, 10) || 300000;
        this.QUERY_INTERVALL_MAX = parseInt(process.env.X_QUERY_INTERVALL_MAX, 10) || 600000;

        // --- Global State ---
        this.knownTweetIds = new Set();
        this.currentTwitterCookies = null;
        this.botStartTime = new Date(); // Set its own start time
    }

    /**
     * Refreshes the Twitter authentication cookies by performing a login simulation using Playwright.
     * Stores the new cookies in the `this.currentTwitterCookies` variable.
     */
    async refreshTwitterCookies() {
        this.logger.info('[X Scraper] Attempting to refresh Twitter cookies...');
        let browser = null;
        try {
            if (!this.TWITTER_USERNAME || !this.TWITTER_PASSWORD) {
                this.logger.error('[X Scraper] TWITTER_USERNAME or TWITTER_PASSWORD environment variables are not set. Cannot refresh cookies.');
                return false;
            }

            browser = await chromium.launch({
                headless: this.logger.level !== 'debug',
                args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
            });

            const context = await browser.newContext();
            const page = await context.newPage();
            page.on('console', (msg) => {
                if (this.logger.level === 'debug') {
                    for (const arg of msg.args()) {
                        arg.jsonValue().then(value => this.logger.info(`[Browser Console]: ${JSON.stringify(value)}`));
                    }
                }
            });

            this.logger.info('[X Scraper] Navigating to X login flow page.');
            await page.goto('https://x.com/i/flow/login', { timeout: 60000, waitUntil: 'domcontentloaded' });

            this.logger.info('[X Scraper] Typing username...');
            await page.locator('input[name="text"]').fill(this.TWITTER_USERNAME);
            
            this.logger.info('[X Scraper] Clicking Next button...');
            await page.locator('button').filter({ hasText: 'Next' }).click();

            this.logger.info('[X Scraper] Typing password...');
            await page.locator('input[name="password"]').fill(this.TWITTER_PASSWORD);

            this.logger.info('[X Scraper] Clicking Login button...');
            await page.locator('button[data-testid="LoginForm_Login_Button"]').click();

            await page.waitForURL('**/home', { waitUntil: 'networkidle', timeout: 30000 });

            const postLoginUrl = page.url();
            if (postLoginUrl.includes('/home')) {
                this.logger.info('[X Scraper] Login appeared successful. Retrieving cookies.');
                const cookies = await context.cookies();
                this.currentTwitterCookies = JSON.stringify(cookies);
                this.logger.info(`[X Scraper] Successfully retrieved ${cookies.length} new Twitter cookies.`);
                await browser.close();
                return true;
            } else {
                this.logger.error(`[X Scraper] Login failed or redirected to unexpected URL: ${postLoginUrl}.`);
                if (this.logger.level === 'debug') {
                    await page.screenshot({ path: './screenshot_login_failure.png', fullPage: true });
                }
                await browser.close();
                return false;
            }
        } catch (error) {
            this.logger.error('[X Scraper] Error during cookie refresh:', error);
            if (browser) await browser.close();
            return false;
        }
    }

    async populateInitialTweetIds() {
        const tweetUrlRegex = /https?:\/\/([\w]+\.)?x\.com\/\w+\/status\/(\d+)/g;
        const channelIds = [
            this.DISCORD_X_POSTS_CHANNEL_ID,
            this.DISCORD_X_REPLIES_CHANNEL_ID,
            this.DISCORD_X_QUOTES_CHANNEL_ID,
            this.DISCORD_X_RETWEETS_CHANNEL_ID
        ].filter(id => id);

        for (const channelId of channelIds) {
            try {
                const channel = await this.client.channels.fetch(channelId);
                if (channel && channel.type === ChannelType.GuildText) {
                    const messages = await channel.messages.fetch({ limit: 50 });
                    messages.forEach(msg => {
                        const matches = [...msg.content.matchAll(tweetUrlRegex)];
                        matches.forEach(match => this.knownTweetIds.add(match[2]));
                    });
                }
            } catch (error) {
                this.logger.error(`Could not fetch messages from channel ${channelId} to populate tweet IDs:`, error);
            }
        }
        this.logger.info(`Populated ${this.knownTweetIds.size} known tweet IDs from Discord history.`);
    }

    async announceXContent(tweet) {
        // Check if announcement posting is enabled before proceeding
         if (!isAnnouncementEnabled) {
            this.logger.info(`Announcement posting is disabled. Skipping X announcement for tweet ${tweet.tweetID}.`);
            return;
        }
    
        let channelId;
        let message;
        // Determine the target channel and message format based on tweet category
        switch (tweet.tweetCategory) {
            case 'Post':
                channelId = DISCORD_X_POSTS_CHANNEL_ID;
                message = `🐦 **New post by ${tweet.author}:**\n${tweet.url}`;
                break;
            case 'Reply':
                channelId = DISCORD_X_REPLIES_CHANNEL_ID;
                // Assuming 'text' contains the reply content. May need refinement based on actual scrape result.
                message = `↩️ **${tweet.author} replied:**\n${tweet.url}`;
                break;
            case 'Quote':
                channelId = DISCORD_X_QUOTES_CHANNEL_ID;
                // Assuming 'text' contains the quote content. May need refinement.
                message = `💬 **${tweet.author} quoted:**\n${tweet.url}`;
                break;
            case 'Retweet':
                channelId = DISCORD_X_RETWEETS_CHANNEL_ID;
                // Retweets from search results might not contain the original tweet's text easily.
                // Announcing with just the link for now, similar to the old 'retweet' logic.
                message = `🔄 **${tweet.author} retweeted:**\n${tweet.url}`;
                break;
            default:
                this.logger.warn(`Unknown tweet category: ${tweet.tweetCategory} for tweet ${tweet.tweetID}. Announcing as generic post.`);
                channelId = DISCORD_X_POSTS_CHANNEL_ID; // Fallback to posts channel
                message = `📄 **New activity by ${tweet.author}:**\n${tweet.url}`;
        }
    
        if (!channelId) {
            this.logger.warn(`No Discord channel configured for tweet category '${tweet.tweetCategory}'. Skipping announcement for tweet ${tweet.tweetID}.`);
            return;
        }
    
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel || !channel.isTextBased()) {
                this.logger.error(`Configured Discord channel ${channelId} for tweet category '${tweet.tweetCategory}' not found or is not a text channel. Skipping announcement for tweet ${tweet.tweetID}.`);
                return;
            }
    
            await sendMirroredMessage(channel, message);
            this.logger.info(`Announced tweet ${tweet.tweetID} from ${tweet.author} in channel ${channelId}. Category: ${tweet.tweetCategory}.`);
        } catch (error) {
            this.logger.error(`Failed to announce tweet ${tweet.tweetID} in channel ${channelId}:`, error);
        }
    }
    
    async pollXProfile() {
        let browser = null; // Declare browser outside try and initialize to null
        await this.populateInitialTweetIds(); // In case somebody else is also posting tweets on the channel
        try {
            this.logger.info(`[X Scraper] Launching browser instance for scraping.`);
            browser = await puppeteer.launch({
                headless: this.logger.level !== 'debug', // Run headless unless debug logging is enabled
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                ]
            });
    
    
            const page = await browser.newPage();
    
            // Listen for console messages from the browser context
            page.on('console', (msg) => {
                // Log console messages only when debug logging is enabled
                if (this.logger.level === 'debug') {
                    const msgArgs = msg.args();
                    for (let i = 0; i < msgArgs.length; ++i) {
                        msgArgs[i].jsonValue().then(value => {
                            // Log the browser console message with a prefix
                            this.logger.debug(`[Browser Console]: ${value}`);
                        }).catch(e => this.logger.error(`[Browser Console] Error getting console message value: ${e}`));
                    }
                }
            });
    
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1280, height: 1080 });
    
            // Ensure we have valid cookies before proceeding with scraping
            if (!this.currentTwitterCookies) {
                this.logger.info('[X Scraper] No current cookies available. Attempting to refresh.');
                const success = await this.refreshTwitterCookies();
                if (!success) {
                    this.logger.error('[X Scraper] Failed to obtain valid Twitter cookies. Skipping this poll cycle.');
                    // Schedule next poll even on failure to avoid getting stuck
                    const nextPollIn = this.QUERY_INTERVALL_MAX; // Use max interval on error
                    this.logger.info(`[X Scraper] Retrying in ${nextPollIn / 1000} seconds.`);
                    setTimeout(() => this.pollXProfile(), nextPollIn);
                    if (browser) { await browser.close(); }
                    return; // Exit the function if cookie refresh failed
                }
            } else {
                this.logger.info('[X Scraper] Using current Twitter cookies.');
            }
    
            // Set the obtained authentication cookies
            try {
                const cookies = JSON.parse(this.currentTwitterCookies);
                 // Process cookies to keep only standard Puppeteer cookie properties and ensure correct types
                const processedCookies = cookies.map(cookie => {
                    // Construct a new cookie object with properties expected by Puppeteer
                    const standardCookie = {
                        name: cookie.name,
                        value: cookie.value,
                        domain: cookie.domain,
                        path: cookie.path,
                        expires: typeof cookie.expires === 'number' ? cookie.expires : (cookie.expires ? new Date(cookie.expires).getTime() / 1000 : -1), // Convert to Unix timestamp in seconds, -1 for session cookies
                        httpOnly: cookie.httpOnly || false,
                        secure: cookie.secure || false,
                        sameSite: cookie.sameSite || 'None'
                    };
    
                    // Puppeteer requires 'url' for setCookie, construct it if missing or incomplete
                    if (!standardCookie.url && standardCookie.domain && standardCookie.path !== undefined) {
                         // Basic URL construction, adjust protocol if necessary (http vs https)
                         const protocol = standardCookie.secure ? 'https' : 'http';
                         standardCookie.url = `${protocol}://${standardCookie.domain}${standardCookie.path}`;
                    } else if (cookie.url) { // Prefer original url if provided
                         standardCookie.url = cookie.url;
                    }
    
                    // Filter out cookies that are critically missing required properties for Puppeteer
                    if (!standardCookie.name || standardCookie.value === undefined || !standardCookie.domain || standardCookie.path === undefined || !standardCookie.url) {
                         this.logger.warn('[X Scraper] Skipping potentially malformed cookie during set:', standardCookie);
                         return null; // Indicate this cookie should be filtered out
                    }
    
                    return standardCookie;
                }).filter(cookie => cookie !== null); // Filter out any null results from mapping
    
                await page.setCookie(...processedCookies);
                this.logger.info(`[X Scraper] Successfully set ${processedCookies.length} Twitter cookies for the page.`);
            } catch (e) {
                this.logger.error('[X Scraper] Failed to parse or set current Twitter authentication cookies:', e);
                 // If setting cookies fails, it's likely a critical issue, skip scraping.
                 await browser.close();
                 const nextPollIn = this.QUERY_INTERVALL_MAX;
                 this.logger.info(`[X Scraper] Retrying in ${nextPollIn / 1000} seconds after cookie set failure.`);
                 setTimeout(() => this.pollXProfile(), nextPollIn);
                 return; // Exit the function
            }
    
            // Calculate yesterday's date for the search query
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);
            const searchDateFrom = yesterday.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    
            // Construct the advanced search URL
            const searchUrl = `https://x.com/search?q=(from%3A${this.X_USER_HANDLE})%20since%3A${searchDateFrom}&f=live&pf=on&src=typed_query`;
    
            this.logger.info(`[X Scraper] Navigating to advanced search URL: ${searchUrl}`);
            // Navigate and wait for the main content to load, but not necessarily all network requests
            // Using 'networkidle2' might be more reliable for dynamic content than 'domcontentloaded'
            await page.goto(searchUrl, { waitUntil: 'networkidle2' });
    
            // Take a screenshot immediately after navigation to see the initial page state
            if (this.logger.level === 'debug') {
                const screenshotPathInitial = './screenshot_after_goto.png';
                await page.screenshot({ path: screenshotPathInitial, fullPage: true });
                this.logger.debug(`[X Scraper] Initial screenshot after navigation saved to ${screenshotPathInitial}`);
            }
    
            // Capture and log the full HTML content of the page after navigation (first 1000 chars)
            const htmlContent = await page.content();
            this.logger.debug(`[X Scraper] HTML content after navigation (first 1000 chars): ${htmlContent.substring(0, 1000)}...`);
    
            // Verify the current URL before attempting to scrape
            const currentUrl = page.url();
            this.logger.verbose(`[X Scraper] Current URL before scraping: ${currentUrl}`);
    
            // Check if the URL is still the search URL or if it navigated away
            if (!currentUrl.startsWith(`https://x.com/search`)) {
                this.logger.warn(`[X Scraper] Page navigated away from search results to: ${currentUrl}. Skipping scraping.`);
                // Skip the scraping part and proceed to the next poll cycle
                await browser.close();
                const nextPollIn = Math.floor(Math.random() * (this.QUERY_INTERVALL_MAX - this.QUERY_INTERVALL_MIN + 1)) + this.QUERY_INTERVALL_MIN;
                this.logger.info(`[X Scraper] Retrying in ${nextPollIn / 1000} seconds.`);
                setTimeout(() => this.pollXProfile(), nextPollIn);
                return; // Exit the function early
           }
    
            // Use a Map to store unique tweets found across all scrolls
            const uniqueTweetsMap = new Map();
    
            this.logger.info(`[X Scraper] Scrolling page and scraping incrementally.`);
    
            // Scroll down and scrape tweets in each step
            for (let i = 0; i < 3; i++) { // Scroll 3 times as search might yield more results
                // Wait for any potential loading indicators to disappear or for a short period
                await new Promise(resolve => setTimeout(resolve, 2500)); // Wait for loading
    
                const scrapedTweetsInStep = await page.$$eval('article[data-testid="tweet"]', (articles, targetUserHandle) => {
                    console.log(`[$$eval] Found ${articles.length} potential tweet articles in this step.`);
    
                const tweets = articles.map((article, index) => {
                    try {
                        console.log(`[$$eval] Processing article index ${index}...`);
                        // Extract tweet URL and ID
                        // Look for the primary link to the tweet's status page within the article
                        const tweetLink = article.querySelector('a[href*="/status/"]');
                        console.log(`[$$eval] Tweet link element found: ${!!tweetLink}`);
    
                        let tweetID = null;
                        let url = tweetLink ? tweetLink.href : null;
    
                        // Attempt to extract tweet ID from data attribute first (more reliable)
                        tweetID = article.getAttribute('data-tweet-id');
                        if (tweetID) {
                            console.log(`[$$eval] Extracted Tweet ID from data-tweet-id: ${tweetID}`);
                            // If ID is found via data attribute, construct URL if not available from link
                            if (!url && tweetID && targetUserHandle) {
                                 url = `https://x.com/${targetUserHandle}/status/${tweetID}`;
                                 console.log(`[$$eval] Constructed URL: ${url}`);
                            }
                        } else if (url) {
                        console.log(`[$$eval] data-tweet-id not found. Attempting to extract from URL: ${url}`);
                            // Fallback to extracting from URL if data-tweet-id is not present
                            // Using regex literal for matching tweet ID from URL
                            const idMatch = url.match(/\/status\/(\d+)/);
                            console.log(`[$$eval] ID match result from URL: ${idMatch ? idMatch[1] : 'null'}`);
                            if (idMatch && idMatch[1]) { // Ensure match and capture group exist
                                 tweetID = idMatch[1];
                                 console.log(`[$$eval] Extracted Tweet ID from URL: ${tweetID}`);
                            } else {
                                 console.log(`[$$eval] Could not extract tweet ID from URL ${url}. Skipping.`);
                                 return null;
                            }
                        } else {
                             console.log(`[$$eval] No tweet link or data-tweet-id found for article index ${index}. Skipping.`);
                             return null;
                        }
    
                        // Ensure tweetID is available before proceeding
                        if (!tweetID) {
                            console.log(`[$$eval] Tweet ID is null after extraction attempts for article index ${index}. Skipping.`);
                            return null;
                        }
    
                        // Extract timestamp
                        const timeElement = article.querySelector('time[datetime]');
                        console.log(`[$$eval] Time element found: ${!!timeElement}`);
                        if (!timeElement) {
                            console.log(`[$$eval] No time element found for article index ${index}. Skipping.`);
                            // Decide if a tweet without a timestamp is valid; for now, let's skip to be safe.
                            return null;
                        }
                        const timestamp = timeElement.getAttribute('datetime');
                        console.log(`[$$eval] Extracted Timestamp: ${timestamp}`);
    
                        // Extract tweet text content
                        // This selector should target the main text content block
                        const tweetTextElement = article.querySelector('div[data-testid="tweetText"]');
                        const text = tweetTextElement ? tweetTextElement.innerText : '';
                        console.log(`[$$eval] Extracted Text (partial): ${text.substring(0, 100)}...`);
                        
                        // Determine tweet category based on the presence of reply indicators
                        let tweetCategory = 'Post'; // Default to Post
    
                        // Check for indicators of a reply tweet by looking for the specific HTML structure:
                        // A div element containing the text "Replying to" and having a nested div > a > span structure.
                        let isReply = false;
                        const replyIndicatorDivs = article.querySelectorAll('div');
    
                        for (const div of replyIndicatorDivs) {
                            // Check if the div contains the "Replying to" text
                            if (div.textContent.trim().startsWith('Replying to')) {
                                // Check if it has the required nested structure: div > a > span
                                const nestedSpan = div.querySelector('div > a > span');
                                if (nestedSpan) {
                                    isReply = true;
                                    console.log(`[$$eval] Identified reply based on structural pattern.`);
                                    break; // Found the reply indicator, no need to check further divs
                                }
                            }
                        }
    
                        if (isReply) {
                             tweetCategory = 'Reply';
                        }
    
                        // Check for a quote tweet specific structure *only if* it's not already classified as a Reply
                        // This selector is a heuristic and might need adjustment
                        const quoteTweetBlock = article.querySelector('div[role="link"][tabindex="0"] a[href*="/status/"]');
                        console.log(`[$$eval] Quote tweet block found: ${!!quoteTweetBlock}`);
                        if (tweetCategory === 'Post' && quoteTweetBlock && tweetLink && quoteTweetBlock.href !== tweetLink.href) {
                            tweetCategory = 'Quote';
                             console.log(`[$$eval] Classified as Quote.`);
                        }
    
                        // The author is the target user handle for all relevant tweets in this search
                        // This is because the search is filtered by 'from:targetUserHandle'
                        const author = `@${targetUserHandle}`;
                        console.log(`[$$eval] Determined Author: ${author}`);
                        console.log(`[$$eval] Determined Category: ${tweetCategory}`);
    
                        const tweetData = { tweetID, author, timestamp, tweetCategory, text, url };
                        console.log(`[$$eval] Successfully extracted tweet data: ${JSON.stringify(tweetData)}`);
                        return tweetData;
                    } catch (e) {
                        console.error('[$$eval] Error processing tweet article:', e);
                        return null;
                    }
                }).filter(tweet => tweet !== null); // Filter out any null results from mapping
    
                console.log(`[$$eval] Finished processing articles. Found ${tweets.length} valid tweets.`);
                return tweets;
            }, this.X_USER_HANDLE);
    
            this.logger.verbose(`[X Scraper] Found ${scrapedTweetsInStep.length} tweets in scroll step ${i + 1}.`);
    
            for (const tweet of scrapedTweetsInStep) {
                // Ensure tweet and tweet.tweetID are not null/undefined before using has()
                 if (tweet && tweet.tweetID && !uniqueTweetsMap.has(tweet.tweetID)) {
                    uniqueTweetsMap.set(tweet.tweetID, tweet);
                } else {
                    this.logger.debug('[X Scraper] Skipping tweet with missing ID in scroll step', tweet);
                }
            }
    
            // Scroll down to load more content
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
        }
    
        this.logger.info(`[X Scraper] Finished scrolling and scraping. Total unique tweets found in session: ${uniqueTweetsMap.size}.`);
    
        // Convert the map values to an array
        const allScrapedTweetsInSession = Array.from(uniqueTweetsMap.values());
    
            // Filter for truly new tweets that haven't been announced before AND are newer than bot startup
            let newTweets = allScrapedTweetsInSession.filter(tweet => {
                 if (!tweet || !tweet.tweetID) {
                     this.logger.debug('[X Scraper] Skipping tweet with missing ID during filtering.', tweet);
                     return false; // Skip tweets with missing IDs
                 }
                 if (this.knownTweetIds.has(tweet.tweetID)) {
                     this.logger.debug(`[X Scraper] Skipping already known tweet ${tweet.tweetID}.`);
                     return false; // Skip already announced tweets
                 }
                 // Check if the tweet timestamp is after the bot started
                 if (this.botStartTime && tweet.timestamp) {
                     const tweetTime = new Date(tweet.timestamp);
                     if (tweetTime.getTime() < this.botStartTime.getTime()) {
                         // Log only if this old tweet hasn't been seen before in this session
                         if (!this.knownTweetIds.has(tweet.tweetID)) {
                              this.logger.info(`[X Scraper] Skipping old tweet ${tweet.tweetID} published before bot startup: ${tweet.timestamp}`);
                         }
                         this.knownTweetIds.add(tweet.tweetID); // Mark old tweets as known to prevent future checks
                         return false; // Skip tweets older than bot startup
                     }
                 } else if (!this.botStartTime) {
                     // If botStartTime is not set yet, cannot determine if old, announce for now.
                     this.logger.warn(`[X Scraper] Bot startup time not yet set, cannot determine if tweet ${tweet.tweetID} is old. Announcing.`);
                 }
                 return true; // This is a new tweet, not old, and hasn't been announced
            });
    
    
            if (newTweets.length > 0) {
                this.logger.info(`[X Scraper] Found ${newTweets.length} new tweets from search results that are newer than bot startup.`);
    
                // Sort by timestamp to ensure chronological order (oldest first)\n                newTweets.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    
                for (const tweet of newTweets) { // Process in chronological order
                    this.logger.info(`[X Scraper] Processing new tweet ${tweet.tweetID} from ${tweet.timestamp}, Category: ${tweet.tweetCategory}.`);
                    // Call announceXContent with the new tweet object structure
                    await announceXContent(tweet);
                    // Ensure tweet.tweetID exists before adding to knownTweetIds
                    if (tweet && tweet.tweetID) {
                        this.knownTweetIds.add(tweet.tweetID);
                    }
                }
            } else {
                this.logger.info(`[X Scraper] No new tweets found for @${this.X_USER_HANDLE} from search results after filtering.`);
            }
    
            // Schedule next poll with random jitter
            const nextPollIn = Math.floor(Math.random() * (this.QUERY_INTERVALL_MAX - this.QUERY_INTERVALL_MIN + 1)) + this.QUERY_INTERVALL_MIN;
            this.logger.info(`[X Scraper] Next check in ${nextPollIn / 1000} seconds.`);
            setTimeout(() => this.pollXProfile(), nextPollIn);
    
        } catch (error) {
            this.logger.error('[X Scraper] Error during polling:', error);
            // On error, wait the maximum interval before retrying to avoid rapid failed attempts
            const nextPollIn = this.QUERY_INTERVALL_MAX; // Use max interval on error
            this.logger.info(`[X Scraper] Retrying in ${nextPollIn / 1000} seconds.`);
            setTimeout(() => this.pollXProfile(), nextPollIn);
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }

    async initialize() {
        if (!this.X_USER_HANDLE || (!this.DISCORD_X_POSTS_CHANNEL_ID && !this.DISCORD_X_RETWEETS_CHANNEL_ID)) {
            this.logger.debug('[X Scraper] Not configured. Skipping.');
            return;
        }

        // Schedule periodic cookie refresh
        if (this.TWITTER_USERNAME && this.TWITTER_PASSWORD) {
            this.logger.info('[X Scraper] Initiating initial Twitter cookie refresh.');
            await this.refreshTwitterCookies();
            setInterval(() => {
                this.logger.info('[X Scraper] Initiating scheduled Twitter cookie refresh.');
                this.refreshTwitterCookies();
            }, 23 * 60 * 60 * 1000); // 23 hours
        }

        this.logger.info(`[X Scraper] Initializing monitor for X user: @${this.X_USER_HANDLE}`);
        this.pollXProfile();
    }

    resetState() {
        this.knownTweetIds.clear();
        this.botStartTime = new Date();
        this.logger.info('[X Scraper] State reset.');
    }
}

export default XScraper;