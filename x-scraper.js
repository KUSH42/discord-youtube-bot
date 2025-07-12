// x-scraper.js
// © 2025 Marco Keller. All rights reserved. This software and its content are proprietary and confidential. Unauthorized reproduction or distribution is strictly prohibited.
// This module contains the XScraper class, responsible for all X (Twitter) related monitoring and scraping.

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
        const tweetUrlRegex = /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/\w+\/status\/(\d+)/g;
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
                        matches.forEach(match => this.knownTweetIds.add(match[1]));
                    });
                }
            } catch (error) {
                this.logger.error(`Could not fetch messages from channel ${channelId} to populate tweet IDs:`, error);
            }
        }
        this.logger.info(`Populated ${this.knownTweetIds.size} known tweet IDs from Discord history.`);
    }

    async announceXContent(tweet) {
        if (!this.isAnnouncementEnabled()) {
            this.logger.info(`Announcement posting is disabled. Skipping X announcement for tweet ${tweet.tweetID}.`);
            return;
        }

        let channelId;
        let message;
        switch (tweet.tweetCategory) {
            case 'Post':
                channelId = this.DISCORD_X_POSTS_CHANNEL_ID;
                message = `🐦 **New post by ${tweet.author}:**\n${tweet.url}`;
                break;
            case 'Reply':
                channelId = this.DISCORD_X_REPLIES_CHANNEL_ID;
                message = `↩️ **${tweet.author} replied:**\n${tweet.url}`;
                break;
            case 'Quote':
                channelId = this.DISCORD_X_QUOTES_CHANNEL_ID;
                message = `💬 **${tweet.author} quoted:**\n${tweet.url}`;
                break;
            case 'Retweet':
                channelId = this.DISCORD_X_RETWEETS_CHANNEL_ID;
                message = `🔄 **${tweet.author} retweeted:**\n${tweet.url}`;
                break;
            default:
                this.logger.warn(`Unknown tweet category: ${tweet.tweetCategory}. Announcing as generic post.`);
                channelId = this.DISCORD_X_POSTS_CHANNEL_ID;
                message = `📄 **New activity by ${tweet.author}:**\n${tweet.url}`;
        }

        if (!channelId) {
            this.logger.warn(`No Discord channel configured for tweet category '${tweet.tweetCategory}'.`);
            return;
        }

        try {
            const channel = await this.client.channels.fetch(channelId);
            if (channel && channel.isTextBased()) {
                await this.sendMirroredMessage(channel, message);
                this.logger.info(`Announced tweet ${tweet.tweetID} in channel ${channelId}.`);
            }
        } catch (error) {
            this.logger.error(`Failed to announce tweet ${tweet.tweetID} in channel ${channelId}:`, error);
        }
    }

    async pollXProfile() {
        let browser = null;
        try {
            this.logger.info(`[X Scraper] Launching browser for scraping.`);
            browser = await chromium.launch({
                headless: this.logger.level !== 'debug',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
            });

            const context = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
                viewport: { width: 1280, height: 1080 }
            });

            const page = await context.newPage();
            page.on('console', (msg) => {
                if (this.logger.level === 'debug') {
                    for (const arg of msg.args()) {
                        arg.jsonValue().then(value => this.logger.info(`[Browser Console]: ${JSON.stringify(value)}`));
                    }
                }
            });

            if (!this.currentTwitterCookies) {
                this.logger.info('[X Scraper] No current cookies. Refreshing...');
                if (!(await this.refreshTwitterCookies())) {
                    this.logger.error('[X Scraper] Failed to get cookies. Retrying poll later.');
                    setTimeout(() => this.pollXProfile(), this.QUERY_INTERVALL_MAX);
                    if (browser) await browser.close();
                    return;
                }
            }

            const cookies = JSON.parse(this.currentTwitterCookies);
            await context.addCookies(cookies);

            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const searchDateFrom = yesterday.toISOString().split('T')[0];
            const searchUrl = `https://x.com/search?q=(from%3A${this.X_USER_HANDLE})%20since%3A${searchDateFrom}&f=live&pf=on&src=typed_query`;

            await page.goto(searchUrl, { waitUntil: 'networkidle' });

            const uniqueTweetsMap = new Map();
            for (let i = 0; i < 3; i++) {
                await page.waitForTimeout(2500); // Wait for content to load
                const articles = await page.locator('article[data-testid="tweet"]').all();

                for (const article of articles) {
                    const link = await article.locator('a[href*="/status/"]').first().getAttribute('href');
                    if (!link) continue;

                    const idMatch = link.match(/\/status\/(\d+)/);
                    if (!idMatch) continue;

                    const tweetID = idMatch[1];
                    const timestamp = await article.locator('time[datetime]').getAttribute('datetime');

                    uniqueTweetsMap.set(tweetID, {
                        tweetID: tweetID,
                        author: `@${this.X_USER_HANDLE}`,
                        timestamp: timestamp,
                        tweetCategory: 'Post', // Simplified for now
                        url: `https://x.com${link}`
                    });
                }

                await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
            }

            const newTweets = Array.from(uniqueTweetsMap.values()).filter(tweet => {
                return !this.knownTweetIds.has(tweet.tweetID) && new Date(tweet.timestamp) >= this.botStartTime;
            });

            if (newTweets.length > 0) {
                newTweets.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                for (const tweet of newTweets) {
                    if (!this.knownTweetIds.has(tweet.tweetID)) {
                        await this.announceXContent(tweet);
                        this.knownTweetIds.add(tweet.tweetID);
                    }
                }
            }

        } catch (error) {
            this.logger.error('[X Scraper] Error during polling:', error);
        } finally {
            if (browser) await browser.close();
            const nextPollIn = Math.floor(Math.random() * (this.QUERY_INTERVALL_MAX - this.QUERY_INTERVALL_MIN + 1)) + this.QUERY_INTERVALL_MIN;
            this.logger.info(`[X Scraper] Next poll scheduled in ${nextPollIn / 1000} seconds.`);
            setTimeout(() => this.pollXProfile(), nextPollIn);
        }
    }

    async initialize() {
        if (!this.X_USER_HANDLE || (!this.DISCORD_X_POSTS_CHANNEL_ID && !this.DISCORD_X_RETWEETS_CHANNEL_ID)) {
            this.logger.debug('[X Scraper] Not configured. Skipping.');
            return;
        }
        this.logger.info(`[X Scraper] Initializing monitor for X user: @${this.X_USER_HANDLE}`);
        
        // Schedule periodic cookie refresh
        if (this.TWITTER_USERNAME && this.TWITTER_PASSWORD) {
            this.logger.info('[X Scraper] Initiating initial Twitter cookie refresh.');
            await this.refreshTwitterCookies(); // Initial refresh
            setInterval(() => {
                this.logger.info('[X Scraper] Initiating scheduled Twitter cookie refresh.');
                this.refreshTwitterCookies();
            }, 23 * 60 * 60 * 1000); // 23 hours
        }

        try {
            await this.populateInitialTweetIds();
            this.pollXProfile();
        } catch(error) {
            this.logger.error('[X Scraper] Initialization failed:', error);
        }
    }

    resetState() {
        this.knownTweetIds.clear();
        this.botStartTime = new Date();
        this.logger.info('[X Scraper] State reset.');
    }
}

export default XScraper;
