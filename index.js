// index.js
// © 2025 Marco Keller. All rights reserved. This software and its content are proprietary and confidential. Unauthorized reproduction or distribution is strictly prohibited.
// This script sets up a Discord bot that:
// 1. Polls a specific YouTube channel for new videos and livestreams.
// 2. Polls a specific X (Twitter) profile for new posts, replies, and retweets.
// It announces new content in designated Discord channels using a polling architecture
// suitable for environments that do not support running a web server.
// Features include winston logging and forwarding all logs and messages to a dedicated support channel.
// for new video uploads and livestreams using YouTube's PubSubHubbub,
// and then announces them in a designated Discord text channel.
// It now also includes file logging using the winston library and webhook signature verification.
// Added auto-renewal for the PubSubHubbub subscription.
// Enhanced error logging for PubSubHubbub subscription attempts,
// focusing on explicit fetch response details and common error properties.

// --- Required Libraries ---
import { Client, GatewayIntentBits, Partials, ChannelType } from 'discord.js';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer';
import express from 'express';
import bodyParser from 'body-parser';
import xml2js from 'xml2js';            // For parsing the Atom feed XML
import fetch from 'node-fetch' ;
import * as winston  from 'winston';    // For logging
import 'winston-daily-rotate-file';     // For daily log rotation
import Transport from 'winston-transport';
import crypto from 'crypto';            // For cryptographic operations (HMAC verification)


// Load environment variables from .env file
dotenv.config();

// --- Configuration Variables ---
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || '!'; // Define a command prefix, default is '!'
const DISCORD_BOT_SUPPORT_LOG_CHANNEL = process.env.DISCORD_BOT_SUPPORT_LOG_CHANNEL; // For logging and message mirroring

// YouTube Monitoring Config
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY; // Still needed for initial channel info
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
const DISCORD_YOUTUBE_CHANNEL_ID = process.env.DISCORD_YOUTUBE_CHANNEL_ID; // For logging and message mirroring

// PubSubHubbub specific configurations
const PSH_SECRET = process.env.PSH_SECRET || 'your_super_secret_string_here'; // A secret string for verifying notification requests
const PSH_CALLBACK_URL = process.env.PSH_CALLBACK_URL; // IMPORTANT: Your bot's publicly accessible URL for the webhook (e.g., https://your.domain/webhook/youtube)
// Optional: A token sent with the subscription request and echoed back in the challenge for verification
const PSH_VERIFY_TOKEN = process.env.PSH_VERIFY_TOKEN || 'your_optional_verify_token';
const PSH_PORT = process.env.PORT || 3000; // Port for the Express server to listen on

// X (Twitter) Monitoring Config
const X_USER_HANDLE = process.env.X_USER_HANDLE;
const DISCORD_X_POSTS_CHANNEL_ID = process.env.DISCORD_X_POSTS_CHANNEL_ID; // For original posts
const DISCORD_X_REPLIES_CHANNEL_ID = process.env.DISCORD_X_REPLIES_CHANNEL_ID; // For replies
const DISCORD_X_QUOTES_CHANNEL_ID = process.env.DISCORD_X_QUOTES_CHANNEL_ID; // For quote tweets
const DISCORD_X_RETWEETS_CHANNEL_ID = process.env.DISCORD_X_RETWEETS_CHANNEL_ID; // For retweets

// X (Twitter) Authentication Credentials (for automatic cookie refresh)
const TWITTER_USERNAME = process.env.TWITTER_USERNAME;
const TWITTER_PASSWORD = process.env.TWITTER_PASSWORD;

// Twitter Authentication Cookies (will be obtained and managed automatically)
// const TWITTER_AUTH_COOKIES = process.env.TWITTER_AUTH_COOKIES; // Store serialized cookies here - no longer needed directly from env

// X (Twitter) Polling Interval (in milliseconds)
const QUERY_INTERVALL_MIN = parseInt(process.env.X_QUERY_INTERVALL_MIN, 10) || 300000; // Default to 5 minutes
const QUERY_INTERVALL_MAX = parseInt(process.env.X_QUERY_INTERVALL_MAX, 10) || 600000; // Default to 10 minutes

// Logging configuration
const LOG_FILE_PATH = process.env.LOG_FILE_PATH || 'bot.log'; // Path to the log file
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // 'error', 'warn', 'info', 'verbose', 'debug', 'silly'

// --- Global State ---
// --- Data Storage for Tracked Videos/Livestreams ---
// In a real-world scenario, you would use a database to persist this data.
// For this example, we'll use an in-memory Set.
let announcedVideos = new Set();
let knownTweetIds = new Set();
// --- PubSubHubbub Auto-Renewal Timer ---
let subscriptionRenewalTimer = null;

// --- Global State ---
let botStartTime = null; // To store the bot's startup time
let currentTwitterCookies = null; // Global variable to store active Twitter cookies
let isPostingEnabled = true; // Flag to control if the bot is allowed to post messages (affects all Discord output)
let isAnnouncementEnabled = false; // Flag to control if announcements are posted to non-support channels
const allowedUserIds = process.env.ALLOWED_USER_IDS ? process.env.ALLOWED_USER_IDS.split(',').map(id => id.trim()) : []; // List of User IDs allowed to restart

// --- Utility Functions ---
/**
 * Refreshes the Twitter authentication cookies by performing a login simulation using Puppeteer.
 * Stores the new cookies in the global `currentTwitterCookies` variable.
 */
async function refreshTwitterCookies() {
    logger.info('[X Scraper] Attempting to refresh Twitter cookies...');
    let browser = null;
    try {
        if (!TWITTER_USERNAME || !TWITTER_PASSWORD) {
            logger.error('[X Scraper] TWITTER_USERNAME or TWITTER_PASSWORD environment variables are not set. Cannot refresh cookies.');
            return false; // Indicate failure
        }

        browser = await puppeteer.launch({
            headless: logger.level !== 'debug',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
            ]
        });

        const page = await browser.newPage();

        // Listen for console messages from the browser context (optional, for debugging)
        page.on('console', (msg) => {
             if (logger.level === 'debug') {
                const msgArgs = msg.args();
                for (let i = 0; i < msgArgs.length; ++i) {
                    msgArgs[i].jsonValue().then(value => {
                        logger.info(`[Browser Console - Cookie Refresh]: ${value}`);
                    }).catch(e => logger.error(`[Browser Console - Cookie Refresh] Error getting console message value: ${e}`));
                }
            }
        });


        logger.info('[X Scraper] Navigating to Twitter login page.');
        // Navigate to the login page - use twitter.com as it might be more stable for login flow
        await page.goto('https://twitter.com/login', { waitUntil: 'networkidle2' });

        // Take a screenshot immediately after navigation for debugging
        if (logger.level === 'debug') {
            const screenshotPath = './screenshot_login_page.png';
            await page.screenshot({ path: screenshotPath, fullPage: true });
            logger.debug(`[X Scraper] Login page screenshot saved to ${screenshotPath}`);
        }


        // --- Login Form Filling ---
        // Wait for the username input field and type the username
        // Selector might need adjustment based on current X login page HTML
        const usernameSelector = 'input[name="text"]'; // Common selector for username/email input
        await page.waitForSelector(usernameSelector, { timeout: 10000 });
        await page.type(usernameSelector, TWITTER_USERNAME, { delay: 50 }); // Simulate typing

        // Add a short delay after typing the username
        await page.waitForTimeout(3000); // Wait for 3 seconds after typing username

        // Click the "Next" button after entering username
        // Selector might need adjustment
        // ; // Original selector
        // Attempting a more robust selector for the 'Next' button by looking for a span with the text.
        const nextButtonSelector = 'button:has(span:has-text("Next"))';

        logger.debug(`[X Scraper] Waiting for Next button with selector: ${nextButtonSelector}`);
        try {
            await page.waitForSelector(nextButtonSelector, { timeout: 30000 }); // Increased timeout to 30 seconds
            logger.debug('[X Scraper] Next button found. Clicking...');
            await page.click(nextButtonSelector);
            logger.debug('[X Scraper] Next button clicked.');
        } catch (error) {
            logger.error('[X Scraper] Error waiting for or clicking Next button:', error);
            // Capture screenshot and HTML on failure to wait for Next button
            if (logger.level === 'debug') {
                const screenshotPathNextButton = './screenshot_next_button_timeout.png';
                await page.screenshot({ path: screenshotPathNextButton, fullPage: true });
                logger.debug(`[X Scraper] Screenshot on Next button timeout saved to ${screenshotPathNextButton}`);

                const htmlContentOnTimeout = await page.content();
                logger.debug(`[X Scraper] HTML content on Next button timeout (first 2000 chars): ${htmlContentOnTimeout.substring(0, 2000)}...`);
            }
            // Re-throw the error or handle it appropriately, likely exiting this refresh attempt.
            throw error; // Re-throw to be caught by the main try/catch
        }

        // After clicking Next, check if we are still on the username input page
        const usernameInputSelector = 'input[name="text"]'; // Re-declare or ensure access to username selector
        const usernameInputStillVisible = await page.$(usernameInputSelector) !== null;
        const currentUrlAfterNextClick = page.url();
        if (usernameInputStillVisible || currentUrlAfterNextClick.includes('/login')) {
             logger.error('[X Scraper] After clicking "Next", still on login page or an intermediate page displaying username input. Check for unhandled intermediate steps.');
             // Optionally, add a screenshot here for debugging the intermediate state
             if (logger.level === 'debug') {
                 const screenshotPathIntermediate = './screenshot_after_next_click.png';
                 await page.screenshot({ path: screenshotPathIntermediate, fullPage: true });
                 logger.debug(`[X Scraper] Screenshot after clicking Next saved to ${screenshotPathIntermediate}`);
             }
             // Although we log an error, we will still attempt to wait for the password field
             // in case the page is just slow or the selector check was too early.
        }

        // After clicking Next, wait briefly and check if the password field is immediately available.
        // If not, it suggests a possible intermediate step (like phone verification, etc.).
        const passwordSelector = 'input[name="password"]'; // Common selector for password input

        logger.debug('[X Scraper] Waiting briefly for password input after clicking Next...');
        try {
            // Use a short timeout to check for the password field's presence quickly
            await page.waitForSelector(passwordSelector, { timeout: 5000, visible: true });
            logger.debug('[X Scraper] Password input field found immediately. Proceeding.');
        } catch (error) {
            // If the password field is not found quickly, log a warning about a potential intermediate step.
            logger.warn('[X Scraper] Password input field not immediately found after clicking Next (timed out after 5s). Likely an intermediate step is present. Will proceed to wait with main timeout.', error);
             // Optional: Add code here to attempt to identify specific intermediate elements if known.
             // For now, we just log the warning and let the main waitForSelector handle the rest.
        }

        // Add a longer fixed wait after potential intermediate step check and before the main password field wait
        await page.waitForTimeout(5000); // Increased fixed wait after typing username

        // Wait for the password input field with the main timeout (30 seconds now)
        await page.waitForSelector(passwordSelector, { timeout: 30000 }); // Main wait for password input
        await page.type(passwordSelector, TWITTER_PASSWORD, { delay: 50 });

        // Click the "Log in" button
        // Selector might need adjustment
        const loginButtonSelector = 'button[data-testid="LoginForm_Login_Button"]'; // Common selector for the login button
        await page.waitForSelector(loginButtonSelector, { timeout: 10000 });
        await page.click(loginButtonSelector);

        // --- Wait for Login Success ---
        // Wait for navigation to the main feed or a known post-login element
        // We can wait for the URL to change significantly or for a common element on the feed page.
        // Waiting for the URL to NOT be the login page is a simple check.
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }); // Wait up to 30 seconds for navigation after login attempt

        // Check if login was successful by verifying the URL or presence of a known element
        const postLoginUrl = page.url();
        if (postLoginUrl.includes('/home') || postLoginUrl === 'https://twitter.com/' || postLoginUrl === 'https://x.com/') { // Check for common post-login URLs
             logger.info('[X Scraper] Login appeared successful. Retrieving cookies.');

             // Retrieve all cookies after successful login
            const cookies = await page.cookies();
            // Store cookies in the global variable, serialized as JSON
            currentTwitterCookies = JSON.stringify(cookies);
            logger.info(`[X Scraper] Successfully retrieved ${cookies.length} new Twitter cookies.`);

             // Optional: Log a subset of cookie names for verification in debug mode
             if (logger.level === 'debug') {
                 logger.debug('[X Scraper] Retrieved cookie names:', cookies.map(c => c.name).join(', '));
             }

            await browser.close();
            return true; // Indicate success

        } else {
            // If we are still on a login-related page or an unexpected page after waiting
            logger.error(`[X Scraper] Login failed or redirected to unexpected URL: ${postLoginUrl}. Check credentials or login flow.`);
             // Capture screenshot on failure for debugging
            if (logger.level === 'debug') {
                const screenshotPath = './screenshot_login_failure.png';
                await page.screenshot({ path: screenshotPath, fullPage: true });
                logger.debug(`[X Scraper] Login failure screenshot saved to ${screenshotPath}`);
            }
            await browser.close();
            return false; // Indicate failure
        }

    } catch (error) {
        logger.error('[X Scraper] Error during cookie refresh:', error);
        if (browser) {
            await browser.close();
        }
        return false; // Indicate failure
    }
}

/**
 * Splits a string into multiple chunks of a specified maximum length, respecting line breaks.
 */
function splitMessage(text, { maxLength = 2000 } = {}) {
    if (text.length <= maxLength) return [text];
    const char = '\n';
    let chunks = [];
    const lines = text.split(char);
    let currentChunk = "";
    for (const line of lines) {
        if (line.length > maxLength) {
            if (currentChunk.length > 0) chunks.push(currentChunk.trim());
            const lineChunks = line.match(new RegExp(`.{1,${maxLength}}`, 'g')) || [];
            chunks.push(...lineChunks);
            currentChunk = "";
            continue;
        }
        if (currentChunk.length + line.length + char.length > maxLength) {
            chunks.push(currentChunk.trim());
            currentChunk = "";
        }
        currentChunk += line + char;
    }
    if (currentChunk.length > 0) chunks.push(currentChunk.trim());
    return chunks;
}

/**
 * Sends a message to a target channel and mirrors it to the support log channel.
 */
async function sendMirroredMessage(targetChannel, content) {
    if (!isPostingEnabled) {
        logger.info(`Posting is disabled. Skipping message to ${targetChannel.name}.`);
        // Optionally send a notification to the support channel that posting is disabled
         if (DISCORD_BOT_SUPPORT_LOG_CHANNEL && targetChannel.id !== DISCORD_BOT_SUPPORT_LOG_CHANNEL) {
             client.channels.fetch(DISCORD_BOT_SUPPORT_LOG_CHANNEL).then(supportChannel => {
                 if (supportChannel && supportChannel.isTextBased()) {
                     supportChannel.send(`(Posting is currently disabled. Skipped message to ${targetChannel.name})`).catch(err => logger.error(`Failed to send disabled posting notification:`, err));
                 }
             }).catch(() => logger.warn(`Could not fetch support channel ${DISCORD_BOT_SUPPORT_LOG_CHANNEL} to notify about skipped message.`));
         }
        return; // Do not send the message if posting is disabled
    }

    // Original logic for sending the message
    await targetChannel.send(content);

    // Mirroring logic
    if (DISCORD_BOT_SUPPORT_LOG_CHANNEL && targetChannel.id !== DISCORD_BOT_SUPPORT_LOG_CHANNEL) {
        client.channels.fetch(DISCORD_BOT_SUPPORT_LOG_CHANNEL).then(supportChannel => {
            if (supportChannel && supportChannel.isTextBased()) {
                const mirrorContent = `[Bot message from #${targetChannel.name}]:\n>>> ${content}`;
                for (const part of splitMessage(mirrorContent)) {
                    if (part) supportChannel.send(part).catch(err => logger.error(`Failed to send mirrored message part:`, err));
                }
            }
        }).catch(() => logger.warn(`Could not fetch support channel ${DISCORD_BOT_SUPPORT_LOG_CHANNEL} to mirror message.`));
    }
}

// --- Discord Transport for Winston ---
class DiscordTransport extends Transport {
    constructor(opts) {
        super(opts);
        this.client = opts.client;
        this.channelId = opts.channelId;
        this.channel = null;

        // Buffering options
        this.buffer = [];
        this.flushInterval = opts.flushInterval || 2000; // 2 seconds
        this.maxBufferSize = opts.maxBufferSize || 20;    // 20 log entries
        this.flushTimer = null;

        this.startFlushing();
    }

    startFlushing() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
    }

    async log(info, callback) {
        setImmediate(() => this.emit('logged', info));

        // Channel initialization logic
        if (!this.client.isReady() || this.channel === 'errored') {
            return callback();
        }
        if (this.channel === null) {
            try {
                const fetchedChannel = await this.client.channels.fetch(this.channelId);
                if (fetchedChannel && fetchedChannel.isTextBased()) {
                    this.channel = fetchedChannel;
                    // Send initialization message immediately, not buffered
                    this.channel.send('✅ **Winston logging transport initialized for this channel.**').catch(console.error);
                } else {
                    this.channel = 'errored';
                    console.error(`[DiscordTransport] Channel ${this.channelId} is not a valid text channel.`);
                }
            } catch (error) {
                this.channel = 'errored';
                console.error(`[DiscordTransport] Failed to fetch channel ${this.channelId}:`, error);
            }
        }
        if (!this.channel || this.channel === 'errored') return callback();

        
        // Buffering logic
        const { level, message, stack } = info;
        let logMessage = `**[${level.toUpperCase()}]**: ${message}`;
        if (stack) logMessage += `\n\`\`\`\n${stack}\n\`\`\``;
        
        this.buffer.push(logMessage);

        if (this.buffer.length >= this.maxBufferSize) {
            await this.flush();
        }

        callback();
    }

    async flush() {
        if (this.buffer.length === 0 || !this.channel || this.channel === 'errored') {
            return;
        }

        const messagesToFlush = [...this.buffer];
        this.buffer = [];

        const combinedMessage = messagesToFlush.join('\n');
        try {
            for (const part of splitMessage(combinedMessage, { maxLength: 1980 })) {
                if (part) await this.channel.send(part);
            }
        } catch (error) {
            console.error('[DiscordTransport] Failed to flush log buffer to Discord:', error);
            // Optional: re-add messages to buffer if flush fails.
            // For now, we'll drop the logs to prevent infinite loops on repeated errors.
        }
    }
}


// --- Logger Setup ---
// Helper for file log formatting to fix syntax errors from duplication and improve maintainability.
const fileLogFormat = winston.format.printf(
    (info) => {
        let logMessage = `${info.timestamp} ${info.level}: ${info.message}`;
        if (info.stack) {
            logMessage += `\nStack: ${info.stack}`;
        }
        // Add more specific error properties if they exist
        if (info.error && typeof info.error === 'object') {
            if (info.error.name) logMessage += `\nError Name: ${info.error.name}`;
            if (info.error.code) logMessage += `\nError Code: ${info.error.code}`;
            const otherErrorProps = { ...info.error };
            delete otherErrorProps.message;
            delete otherErrorProps.stack;
            delete otherErrorProps.name;
            delete otherErrorProps.code;
            if (Object.keys(otherErrorProps).length > 0) {
                logMessage += `\nError Details: ${JSON.stringify(otherErrorProps, null, 2)}`;
            }
        }
        return logMessage;
    }
);

const logger = winston.createLogger({
    level: LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp({ format: 'DD-MM-YYYY HH:mm:ss' }),
        winston.format.errors({ stack: true }), // Include stack trace for errors
        winston.format.splat(), // Allows string interpolation
        winston.format.json()
    ),
    transports: [
        // Console transport (uses colorize and printf)
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(), // Colorize output for console
                winston.format.printf(
                    info => `${info.timestamp} ${info.level}: ${info.message}` +
                        (info.stack ? `\n${info.stack}` : '') // Explicitly add stack
                )
            )
        }),
        // File transport with daily rotation
        new winston.transports.DailyRotateFile({
            filename: `${LOG_FILE_PATH}-%DATE%.log`,
            datePattern: 'DD-MM-YYYY',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
            format: winston.format.combine(fileLogFormat) // Use the shared format
        })
    ],
    exceptionHandlers: [
        new winston.transports.DailyRotateFile({
            filename: `${LOG_FILE_PATH}-exceptions-%DATE%.log`,
            datePattern: 'DD-MM-YYYY',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
            format: winston.format.combine(fileLogFormat) // Use the shared format
        })
    ],
    rejectionHandlers: [
        new winston.transports.DailyRotateFile({
            filename: `${LOG_FILE_PATH}-rejections-%DATE%.log`,
            datePattern: 'DD-MM-YYYY',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
            format: winston.format.combine(fileLogFormat) // Use the shared format
        })
    ]
});


// --- Discord Client Setup ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel]
});

// --- YouTube Monitoring Section ---
const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

async function populateInitialYouTubeHistory() {
    const videoUrlRegex = /https?:\/\/(?:(?:www\.)?youtube\.com\/(?:watch\?v=|live\/|shorts\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
    if (!DISCORD_YOUTUBE_CHANNEL_ID) return;

    try {
        const channel = await client.channels.fetch(DISCORD_YOUTUBE_CHANNEL_ID);
        if (channel && channel.type === ChannelType.GuildText) {
            const messages = await channel.messages.fetch({ limit: 50 });
            messages.forEach(msg => {
                const matches = [...msg.content.matchAll(videoUrlRegex)];
                matches.forEach(match => announcedVideos.add(match[1]));
            });
        }
    } catch (error) {
        logger.error(`Could not fetch messages from channel ${DISCORD_YOUTUBE_CHANNEL_ID} to populate YT history:`, error);
    }
    logger.info(`Populated ${announcedVideos.size} known YouTube video IDs from Discord history.`);
}

/**
 * Announces a new video or livestream in the Discord channel.
 * @param {object} item - The video/livestream item object with id, title, url, type.
 */
async function announceYouTubeContent(item) {
    const channel = client.channels.cache.get(DISCORD_YOUTUBE_CHANNEL_ID);
    if (!channel) {
        logger.error(`Discord announcement channel ${DISCORD_YOUTUBE_CHANNEL_ID} not found.`);
        return;
    }

    const messageContent = item.type === 'upload'
        ? `@everyone 🎬 New Video Upload!\n${item.title}\n${item.url}`
        : `@everyone 🔴 Livestream Started!\n${item.title}\n${item.url}`;

    // Check if announcement posting is enabled before proceeding
    if (!isAnnouncementEnabled) {
        announcedVideos.add(item.id);
        logger.info(`Announcement posting is disabled. Skipping YouTube announcement for ${item.title}.`);
        logger.info(messageContent);
        return;
    }
    try {
        // sendMirroredMessage already checks isPostingEnabled
        await sendMirroredMessage(channel, messageContent);
        logger.info(`Announced YT content: ${item.title}`);
    } catch (error) {
        logger.error(`Error sending YT announcement for ${item.id}:`, error);
    }
}

async function initializeYouTubeMonitor() {
    if (!YOUTUBE_API_KEY || !YOUTUBE_CHANNEL_ID || !DISCORD_YOUTUBE_CHANNEL_ID) {
        logger.warn('[YouTube Monitor] Not configured. Required env vars are missing. Skipping.');
        return;
    }
    logger.info(`[YouTube Monitor] Initializing monitor for channel ID: ${YOUTUBE_CHANNEL_ID}`);
    // Populate history to avoid re-announcing existing videos in the channel
    await populateInitialYouTubeHistory();
    // YouTube monitoring now relies solely on PubSubHubbub.
}


// --- Express Server Setup ---
const app = express();
// Raw body needed for HMAC verification later, so parse as buffer
app.use(bodyParser.raw({ type: 'application/atom+xml', limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true })); // For subscription challenges

// Middleware to convert raw body to text for XML parsing (after HMAC verification)
app.use((req, res, next) => {
    if (req.headers['content-type'] === 'application/atom+xml' && Buffer.isBuffer(req.body)) {
        req.rawBody = req.body; // Store raw body for HMAC verification
        req.body = req.body.toString('utf8'); // Convert to string for xml2js
    }
    next();
});


// --- PubSubHubbub Endpoint ---
// This endpoint will receive verification challenges AND notifications from YouTube.
let webhookPath = '/webhook/youtube'; // Default path
if (PSH_CALLBACK_URL) {
    try {
        const callbackUrlObject = new URL(PSH_CALLBACK_URL);
        webhookPath = callbackUrlObject.pathname;
        logger.info(`Webhook listener configured for path: ${webhookPath}`);
    } catch (error) {
        logger.error(`Invalid PSH_CALLBACK_URL ('${PSH_CALLBACK_URL}'). Could not parse URL. Using default path '${webhookPath}'.`, error);
    }
} else {
    logger.warn(`PSH_CALLBACK_URL is not set. Using default webhook path: '${webhookPath}'. PubSubHubbub will likely fail.`);
}

// Handles GET requests for PubSubHubbub subscription verification
app.get(webhookPath, (req, res) => {
    const mode = req.query['hub.mode'];
    const challenge = req.query['hub.challenge'];
    const topic = req.query['hub.topic'];
    const leaseSeconds = req.query['hub.lease_seconds'];
    const verifyToken = req.query['hub.verify_token'];

    // Handle both 'subscribe' and 'unsubscribe' challenges as per PubSubHubbub spec
    if ((mode === 'subscribe' || mode === 'unsubscribe') && challenge) {
        logger.info(`Received PubSubHubbub subscription challenge via GET for topic: ${topic}`);
        logger.info(`Mode: ${mode}, Challenge: ${challenge}, Lease Seconds: ${leaseSeconds || 'N/A'}`);

        // Optional: Verify the hub.verify_token if it was sent with the request
        if (PSH_VERIFY_TOKEN && verifyToken && verifyToken !== PSH_VERIFY_TOKEN) {
            logger.warn(`Subscription challenge rejected due to hub.verify_token mismatch. Expected: ${PSH_VERIFY_TOKEN}, Received: ${verifyToken}`);
            return res.status(403).send('Forbidden: Verify token mismatch.');
        }

        // Respond with the challenge string to confirm the subscription
        res.status(200).send(challenge);
        logger.info('Successfully responded to PubSubHubbub challenge.');
        return;
    }
    // Log details for unknown GET requests
    logger.warn('Received unknown GET request to webhook endpoint: Method=%s, URL=%s, Content-Type=%s', req.method, req.url, req.headers['content-type']);
    res.status(400).send('Bad Request');
});


// Handles POST requests for PubSubHubbub notifications
app.post(webhookPath, async (req, res) => {
     // PubSubHubbub notification (new video/livestream update)
    if (req.headers['content-type'] === 'application/atom+xml' && req.rawBody) {
        logger.info('Received PubSubHubbub notification.');

        // --- Verify X-Hub-Signature ---
        const signatureHeader = req.headers['x-hub-signature'];
        if (!signatureHeader) {
            logger.warn('Received PubSubHubbub notification without X-Hub-Signature header. Rejecting.');
            return res.status(403).send('Forbidden: Missing signature.');
        }

        const [algorithm, signature] = signatureHeader.split('=');

        if (algorithm !== 'sha1') {
            logger.warn('Unsupported signature algorithm: %s', algorithm);
            return res.status(400).send('Bad Request: Unsupported signature algorithm.');
        }

        const hmac = crypto.createHmac('sha1', PSH_SECRET);
        hmac.update(req.rawBody); // Use the raw buffer body for HMAC calculation
        const expectedSignature = hmac.digest('hex');

        if (expectedSignature !== signature) {
            logger.warn('X-Hub-Signature mismatch! Calculated: %s, Received: %s', expectedSignature, signature);
            return res.status(403).send('Forbidden: Invalid signature.');
        }
        logger.info('X-Hub-Signature verified successfully.');
        // --- End X-Hub-Signature Verification ---

        try {
            const parser = new xml2js.Parser({ explicitArray: false });
            const result = await parser.parseStringPromise(req.body); // Use string body for parsing

            const entry = result.feed.entry;

            if (entry) {
                const videoId = entry['yt:videoId'];
                const channelId = entry['yt:channelId'];
                const title = entry.title;
                let link = 'No Link Available';

                if (entry.link) {
                    if (typeof entry.link === 'string') {
                        link = entry.link;
                    } else if (Array.isArray(entry.link)) {
                        const alternateLink = entry.link.find(l => l.rel === 'alternate' || l.type === 'text/html');
                        if (alternateLink && alternateLink.href) {
                            link = alternateLink.href;
                        } else if (entry.link[0] && entry.link[0].href) {
                            link = entry.link[0].href;
                        } else if (entry.link[0] && entry.link[0].$ && entry.link[0].$.href) {
                            link = entry.link[0].$.href;
                        }
                    } else if (entry.link.href) { // Try this first if it's not an array and has href directly
                        link = entry.link.href;
                    } else if (entry.link.$ && entry.link.$.href) { // original approach
                        link = entry.link.$.href;
                    }
                }
                logger.info(`Extracted link: ${link}`);

                // Check if the notification is for the channel we are monitoring
                if (channelId === YOUTUBE_CHANNEL_ID) {
                    if (!announcedVideos.has(videoId)) {
                        logger.info(`New content detected: ${title} (${videoId})`);
                        // Fetch additional details to see if it's a livestream or an upload and get published date
                        const videoDetailsResponse = await youtube.videos.list({
                            part: 'liveStreamingDetails,snippet',
                            id: videoId
                        });

                        const videoItem = videoDetailsResponse.data.items[0];
                        if (videoItem) {
                            const publishedAt = new Date(videoItem.snippet.publishedAt);

                            // Only announce if the video was published after the bot started
                            if (botStartTime && publishedAt.getTime() >= botStartTime.getTime()) {
                                let contentType = 'upload';
                                // Check for livestream status based on YouTube Data API details
                                if (videoItem.liveStreamingDetails && videoItem.liveStreamingDetails.actualStartTime) {
                                    contentType = 'livestream'; // Is or was live
                                } else if (videoItem.snippet.liveBroadcastContent === 'live' || videoItem.snippet.liveBroadcastContent === 'upcoming') {
                                    contentType = 'livestream'; // Currently live or scheduled
                                }

                                const content = {
                                    id: videoId,
                                    title: title,
                                    url: link,
                                    type: contentType
                                };
                                await announceYouTubeContent(content);
                                announcedVideos.add(videoId); // Mark as announced
                            } else if (botStartTime && publishedAt.getTime() < botStartTime.getTime()) {
                                logger.info(`Skipping announcement for old YouTube content published before bot startup: ${title} (${videoId}) published on ${publishedAt.toISOString()}`);
                                announcedVideos.add(videoId); // Still mark as known to prevent future checks
                            } else {
                                // botStartTime might not be set yet if notification is received very early
                                logger.warn(`Bot startup time not yet set, cannot determine if YouTube content is old. Announcing: ${title} (${videoId})`);
                                let contentType = 'upload';
                                if (videoItem.liveStreamingDetails && videoItem.liveStreamingDetails.actualStartTime) {
                                    contentType = 'livestream';
                                } else if (videoItem.snippet.liveBroadcastContent === 'live' || videoItem.snippet.liveBroadcastContent === 'upcoming') {
                                    contentType = 'livestream';
                                }
                                await announceYouTubeContent({ id: videoId, title: title, url: link, type: contentType });
                                announcedVideos.add(videoId);
                            }
                        } else {
                            logger.warn(`Could not fetch details for video ID: ${videoId}. Cannot determine if old. Announcing as generic content.`);
                            await announceYouTubeContent({ id: videoId, title: title, url: link, type: 'unknown' });
                            announcedVideos.add(videoId); // Mark as announced
                        }
                    } else {
                        logger.info(`Content already announced: ${title} (${videoId})`);
                    }
                } else {
                    logger.info(`Notification for unknown channel ID: ${channelId}`);
                }
            } else {
                logger.info('No new entry in PubSubHubbub notification.');
            }
            res.status(200).send('Notification received and processed.');
        } catch (error) {
            // Corrected: Pass the Error object directly to logger.error
            logger.error('Error parsing or processing PubSubHubbub notification:', error);
            res.status(500).send('Error processing notification.');
        }
    } else {
        // This 'else' block from the original POST handler is still for unexpected requests
        logger.warn('Received unknown request to webhook endpoint: Method=%s, URL=%s, Content-Type=%s', req.method, req.url, req.headers['content-type']);
        res.status(400).send('Bad Request');
    }
});

/**
 * Subscribes to the YouTube channel's PubSubHubbub feed.
 * This needs to be called once when the bot starts, or manually if lease expires.
 * It also sets up a timer to auto-renew the subscription.
 */
/**
 * Unsubscribes from the YouTube channel's PubSubHubbub feed.
 */
async function unsubscribeFromYouTubePubSubHubbub() {
    const hubUrl = 'https://pubsubhubbub.appspot.com/'; // Google's PubSubHubbub hub
    const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;

    logger.info(`Attempting to unsubscribe from PubSubHubbub for channel: ${YOUTUBE_CHANNEL_ID}`);

    // Clear the renewal timer as we are manually unsubscribing
    if (subscriptionRenewalTimer) {
        clearTimeout(subscriptionRenewalTimer);
        subscriptionRenewalTimer = null;
        logger.info('Cleared PubSubHubbub subscription renewal timer during unsubscribe.');
    }

    const params = new URLSearchParams({
        'hub.mode': 'unsubscribe',
        'hub.callback': PSH_CALLBACK_URL,
        'hub.topic': topicUrl,
        'hub.secret': PSH_SECRET // Your shared secret
    });

    try {
        const response = await fetch(hubUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        if (response.ok) {
            logger.info('PubSubHubbub unsubscribe request sent successfully.');
        } else {
            const errorText = await response.text();
            logger.error('Failed to unsubscribe from PubSubHubbub: Status=%d, StatusText=%s, ErrorResponse=%s', response.status, response.statusText, errorText);
        }
    } catch (error) {
        logger.error('Error during PubSubHubbub unsubscribe:', error);
    }
}

/**
 * Subscribes to the YouTube channel's PubSubHubbub feed.
 * This needs to be called once when the bot starts, or manually if lease expires.
 * It also sets up a timer to auto-renew the subscription.
 */
async function subscribeToYouTubePubSubHubbub() {
    // The feed URL for a YouTube channel's uploads playlist
    const hubUrl = 'https://pubsubhubbub.appspot.com/'; // Google's PubSubHubbub hub
    const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;

    // Clear any existing renewal timer to prevent multiple subscriptions
    if (subscriptionRenewalTimer) {
        clearTimeout(subscriptionRenewalTimer);
        subscriptionRenewalTimer = null;
        logger.info('Cleared existing PubSubHubbub subscription renewal timer.');
    }

    const leaseSeconds = 864000; // 10 days, max is often 1296000 seconds (15 days)
    const renewalBufferSeconds = 3600; // Renew 1 hour before expiration for safety

    const params = new URLSearchParams({
        'hub.mode': 'subscribe',
        'hub.callback': PSH_CALLBACK_URL,
        'hub.topic': topicUrl,
        'hub.verify': 'sync', // or async, sync is simpler for initial setup
        'hub.secret': PSH_SECRET, // Your shared secret
        'hub.lease_seconds': leaseSeconds
    });

    // Add verify token if provided
    if (PSH_VERIFY_TOKEN) {
        params.append('hub.verify_token', PSH_VERIFY_TOKEN);
    }

    try {
        logger.info(`Attempting to subscribe to PubSubHubbub for channel: ${YOUTUBE_CHANNEL_ID}`);
        logger.info(`Callback URL: ${PSH_CALLBACK_URL}`);
        logger.info(`Topic URL: ${topicUrl}`);
        if (PSH_VERIFY_TOKEN) {
            logger.info(`Using hub.verify_token: ${PSH_VERIFY_TOKEN}`);
        }

        const response = await fetch(hubUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        if (response.ok) {
            logger.info('PubSubHubbub subscription request sent successfully.');
            // Schedule the renewal
            const renewalTimeMs = (leaseSeconds - renewalBufferSeconds) * 1000;
            if (renewalTimeMs > 0) {
                subscriptionRenewalTimer = setTimeout(() => {
                    logger.info('Initiating PubSubHubbub subscription renewal.');
                    subscribeToYouTubePubSubHubbub(); // Call itself to renew
                }, renewalTimeMs);
                logger.info(`PubSubHubbub subscription scheduled for renewal in ${renewalTimeMs / (1000 * 60 * 60)} hours.`);
            } else {
                logger.warn('Renewal time is non-positive, subscription will not be auto-renewed. Consider increasing lease_seconds or reducing renewal_buffer_seconds.');
            }
        } else {
            // Log full response details if not OK
            const errorText = await response.text();
            // Consider a retry mechanism here for failed subscriptions
            // For example, retry after a short delay with exponential backoff
            logger.error('Failed to subscribe to PubSubHubbub: Status=%d, StatusText=%s, ErrorResponse=%s', response.status, response.statusText, errorText);
        }
    } catch (error) {
        // Corrected: Pass the Error object directly to logger.error
        logger.error('Error during PubSubHubbub subscription:', error);
    }
}

// --- X (Twitter) Monitoring Section ---
async function populateInitialTweetIds() {
    const tweetUrlRegex = /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/\w+\/status\/(\d+)/g;
    // Include all potential X announcement channel IDs
    const channelIds = [DISCORD_X_POSTS_CHANNEL_ID, DISCORD_X_REPLIES_CHANNEL_ID, DISCORD_X_QUOTES_CHANNEL_ID, DISCORD_X_RETWEETS_CHANNEL_ID].filter(id => id);

    for (const channelId of channelIds) {
        try {
            const channel = await client.channels.fetch(channelId);
            if (channel && channel.type === ChannelType.GuildText) {
                const messages = await channel.messages.fetch({ limit: 50 });
                messages.forEach(msg => {
                    const matches = [...msg.content.matchAll(tweetUrlRegex)];
                    matches.forEach(match => knownTweetIds.add(match[1]));
                });
            }
        } catch (error) {
            logger.error(`Could not fetch messages from channel ${channelId} to populate tweet IDs:`, error);
        }
    }
    logger.info(`Populated ${knownTweetIds.size} known tweet IDs from Discord history.`);
}



async function announceXContent(tweet) {
    // Check if announcement posting is enabled before proceeding
     if (!isAnnouncementEnabled) {
        logger.info(`Announcement posting is disabled. Skipping X announcement for tweet ${tweet.tweetID}.`);
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
            logger.warn(`Unknown tweet category: ${tweet.tweetCategory} for tweet ${tweet.tweetID}. Announcing as generic post.`);
            channelId = DISCORD_X_POSTS_CHANNEL_ID; // Fallback to posts channel
            message = `📄 **New activity by ${tweet.author}:**\n${tweet.url}`;
    }

    if (!channelId) {
        logger.warn(`No Discord channel configured for tweet category '${tweet.tweetCategory}'. Skipping announcement for tweet ${tweet.tweetID}.`);
        return;
    }

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            logger.error(`Configured Discord channel ${channelId} for tweet category '${tweet.tweetCategory}' not found or is not a text channel. Skipping announcement for tweet ${tweet.tweetID}.`);
            return;
        }

        await sendMirroredMessage(channel, message);
        logger.info(`Announced tweet ${tweet.tweetID} from ${tweet.author} in channel ${channelId}. Category: ${tweet.tweetCategory}.`);
    } catch (error) {
        logger.error(`Failed to announce tweet ${tweet.tweetID} in channel ${channelId}:`, error);
    }
}

async function pollXProfile() {
    let browser = null; // Declare browser outside try and initialize to null
    await populateInitialTweetIds(); // In case somebody else is also posting tweets on the channel
    try {
        logger.info(`[X Scraper] Launching browser instance for scraping.`);
        browser = await puppeteer.launch({
            headless: logger.level !== 'debug', // Run headless unless debug logging is enabled
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
            if (logger.level === 'debug') {
                const msgArgs = msg.args();
                for (let i = 0; i < msgArgs.length; ++i) {
                    msgArgs[i].jsonValue().then(value => {
                        // Log the browser console message with a prefix
                        logger.info(`[Browser Console]: ${value}`);
                    }).catch(e => logger.error(`[Browser Console] Error getting console message value: ${e}`));
                }
            }
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 1080 });

        // Ensure we have valid cookies before proceeding with scraping
        if (!currentTwitterCookies) {
            logger.info('[X Scraper] No current cookies available. Attempting to refresh.');
            const success = await refreshTwitterCookies();
            if (!success) {
                logger.error('[X Scraper] Failed to obtain valid Twitter cookies. Skipping this poll cycle.');
                // Schedule next poll even on failure to avoid getting stuck
                const nextPollIn = QUERY_INTERVALL_MAX; // Use max interval on error
                logger.info(`[X Scraper] Retrying in ${nextPollIn / 1000} seconds.`);
                setTimeout(pollXProfile, nextPollIn);
                if (browser) { await browser.close(); }
                return; // Exit the function if cookie refresh failed
            }
        } else {
            logger.info('[X Scraper] Using current Twitter cookies.');
        }

        // Set the obtained authentication cookies
        try {
            const cookies = JSON.parse(currentTwitterCookies);
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
                     logger.warn('[X Scraper] Skipping potentially malformed cookie during set:', standardCookie);
                     return null; // Indicate this cookie should be filtered out
                }

                return standardCookie;
            }).filter(cookie => cookie !== null); // Filter out any null results from mapping

            await page.setCookie(...processedCookies);
            logger.info(`[X Scraper] Successfully set ${processedCookies.length} Twitter cookies for the page.`);
        } catch (e) {
            logger.error('[X Scraper] Failed to parse or set current Twitter authentication cookies:', e);
             // If setting cookies fails, it's likely a critical issue, skip scraping.
             await browser.close();
             const nextPollIn = QUERY_INTERVALL_MAX;
             logger.info(`[X Scraper] Retrying in ${nextPollIn / 1000} seconds after cookie set failure.`);
             setTimeout(pollXProfile, nextPollIn);
             return; // Exit the function
        }

        // Calculate yesterday's date for the search query
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const searchDateFrom = yesterday.toISOString().split('T')[0]; // Format as YYYY-MM-DD

        // Construct the advanced search URL
        const searchUrl = `https://x.com/search?q=(from%3A${X_USER_HANDLE})%20since%3A${searchDateFrom}&f=live&pf=on&src=typed_query`;

        logger.info(`[X Scraper] Navigating to advanced search URL: ${searchUrl}`);
        // Navigate and wait for the main content to load, but not necessarily all network requests
        // Using 'networkidle2' might be more reliable for dynamic content than 'domcontentloaded'
        await page.goto(searchUrl, { waitUntil: 'networkidle2' });

        // Take a screenshot immediately after navigation to see the initial page state
        if (logger.level === 'debug') {
            const screenshotPathInitial = './screenshot_after_goto.png';
            await page.screenshot({ path: screenshotPathInitial, fullPage: true });
            logger.debug(`[X Scraper] Initial screenshot after navigation saved to ${screenshotPathInitial}`);
        }

        // Capture and log the full HTML content of the page after navigation (first 1000 chars)
        const htmlContent = await page.content();
        logger.debug(`[X Scraper] HTML content after navigation (first 1000 chars): ${htmlContent.substring(0, 1000)}...`);

        // Verify the current URL before attempting to scrape
        const currentUrl = page.url();
        logger.info(`[X Scraper] Current URL before scraping: ${currentUrl}`);

        // Check if the URL is still the search URL or if it navigated away
        if (!currentUrl.startsWith(`https://x.com/search`)) {
            logger.warn(`[X Scraper] Page navigated away from search results to: ${currentUrl}. Skipping scraping.`);
            // Skip the scraping part and proceed to the next poll cycle
            await browser.close();
            const nextPollIn = Math.floor(Math.random() * (QUERY_INTERVALL_MAX - QUERY_INTERVALL_MIN + 1)) + QUERY_INTERVALL_MIN;
            logger.info(`[X Scraper] Retrying in ${nextPollIn / 1000} seconds.`);
            setTimeout(pollXProfile, nextPollIn);
            return; // Exit the function early
       }

        // Use a Map to store unique tweets found across all scrolls
        const uniqueTweetsMap = new Map();

        logger.info(`[X Scraper] Scrolling page and scraping incrementally.`);

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
        }, X_USER_HANDLE);

        logger.debug(`[X Scraper] Found ${scrapedTweetsInStep.length} tweets in scroll step ${i + 1}.`);

        for (const tweet of scrapedTweetsInStep) {
            // Ensure tweet and tweet.tweetID are not null/undefined before using has()
             if (tweet && tweet.tweetID && !uniqueTweetsMap.has(tweet.tweetID)) {
                uniqueTweetsMap.set(tweet.tweetID, tweet);
            } else {
                logger.debug('[X Scraper] Skipping tweet with missing ID in scroll step', tweet);
            }
        }

        // Scroll down to load more content
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    }

    logger.info(`[X Scraper] Finished scrolling and scraping. Total unique tweets found in session: ${uniqueTweetsMap.size}.`);

    // Convert the map values to an array
    const allScrapedTweetsInSession = Array.from(uniqueTweetsMap.values());

        // Filter for truly new tweets that haven't been announced before AND are newer than bot startup
        let newTweets = allScrapedTweetsInSession.filter(tweet => {
             if (!tweet || !tweet.tweetID) {
                 logger.debug('[X Scraper] Skipping tweet with missing ID during filtering.', tweet);
                 return false; // Skip tweets with missing IDs
             }
             if (knownTweetIds.has(tweet.tweetID)) {
                 logger.debug(`[X Scraper] Skipping already known tweet ${tweet.tweetID}.`);
                 return false; // Skip already announced tweets
             }
             // Check if the tweet timestamp is after the bot started
             if (botStartTime && tweet.timestamp) {
                 const tweetTime = new Date(tweet.timestamp);
                 if (tweetTime.getTime() < botStartTime.getTime()) {
                     // Log only if this old tweet hasn't been seen before in this session
                     if (!knownTweetIds.has(tweet.tweetID)) {
                          logger.info(`[X Scraper] Skipping old tweet ${tweet.tweetID} published before bot startup: ${tweet.timestamp}`);
                     }
                     knownTweetIds.add(tweet.tweetID); // Mark old tweets as known to prevent future checks
                     return false; // Skip tweets older than bot startup
                 }
             } else if (!botStartTime) {
                 // If botStartTime is not set yet, cannot determine if old, announce for now.
                 logger.warn(`[X Scraper] Bot startup time not yet set, cannot determine if tweet ${tweet.tweetID} is old. Announcing.`);
             }
             return true; // This is a new tweet, not old, and hasn't been announced
        });


        if (newTweets.length > 0) {
            logger.info(`[X Scraper] Found ${newTweets.length} new tweets from search results that are newer than bot startup.`);

            // Sort by timestamp to ensure chronological order (oldest first)
            newTweets.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());


            for (const tweet of newTweets) { // Process in chronological order
                logger.info(`[X Scraper] Processing new tweet ${tweet.tweetID} from ${tweet.timestamp}, Category: ${tweet.tweetCategory}.`);
                // Call announceXContent with the new tweet object structure
                await announceXContent(tweet);
                // Ensure tweet.tweetID exists before adding to knownTweetIds
                if (tweet && tweet.tweetID) {
                    knownTweetIds.add(tweet.tweetID);
                }
            }
        } else {
            logger.info(`[X Scraper] No new tweets found for @${X_USER_HANDLE} from search results after filtering.`);
        }

        // Schedule next poll with random jitter
        const nextPollIn = Math.floor(Math.random() * (QUERY_INTERVALL_MAX - QUERY_INTERVALL_MIN + 1)) + QUERY_INTERVALL_MIN;
        logger.info(`[X Scraper] Next check in ${nextPollIn / 1000} seconds.`);
        setTimeout(pollXProfile, nextPollIn);

    } catch (error) {
        logger.error('[X Scraper] Error during polling:', error);
        // On error, wait the maximum interval before retrying to avoid rapid failed attempts
        const nextPollIn = QUERY_INTERVALL_MAX; // Use max interval on error
        logger.info(`[X Scraper] Retrying in ${nextPollIn / 1000} seconds.`);
        setTimeout(pollXProfile, nextPollIn);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

async function initializeXMonitor() {
    if (!X_USER_HANDLE || (!DISCORD_X_POSTS_CHANNEL_ID && !DISCORD_X_RETWEETS_CHANNEL_ID)) {
        logger.debug('[X Scraper] Not configured. X_USER_HANDLE and at least one DISCORD_X channel ID are required. Skipping.');
        return;
    }
    logger.info(`[X Scraper] Initializing monitor for X user: @${X_USER_HANDLE}`);
    await populateInitialTweetIds();
    pollXProfile(); // Start the first poll
}

// --- Constants ---
const TWITTER_COOKIE_REFRESH_INTERVAL_MS = 23 * 60 * 60 * 1000; // 23 hours in milliseconds

// --- Main Bot Events ---
client.once('ready', async () => {
    logger.info(`Logged in as ${client.user.tag}!`);
    logger.info('Bot is ready to receive YouTube PubSubHubbub notifications.');

    // Set the bot startup time
    botStartTime = new Date();
    logger.info(`Bot started at: ${botStartTime.toISOString()}`);

    process.on('unhandledRejection', error => {
        logger.error('Unhandled Rejection:', error);
    });
    process.on('uncaughtException', error => {
        logger.error('Uncaught Exception:', error);
        // In a real-world scenario, you might want to gracefully shut down here.
        // For now, we log it to ensure visibility.
    });

    if (DISCORD_BOT_SUPPORT_LOG_CHANNEL) {
        logger.add(new DiscordTransport({ level: 'info', client: client, channelId: DISCORD_BOT_SUPPORT_LOG_CHANNEL }));
    } else {
        logger.warn('DISCORD_BOT_SUPPORT_LOG_CHANNEL not set. Discord logging is disabled.');
    }

    // Initialize YouTube monitoring (relies on PubSubHubbub)
    initializeYouTubeMonitor();

    // Initialize X (Twitter) monitoring (still uses polling)
    initializeXMonitor();

    // Perform initial cookie refresh and schedule periodic refresh for Twitter
    if (TWITTER_USERNAME && TWITTER_PASSWORD) {
        logger.info('[X Scraper] Initiating initial Twitter cookie refresh.');
        await refreshTwitterCookies(); // Initial refresh

        // Schedule periodic cookie refresh
        setInterval(() => {
            logger.info('[X Scraper] Initiating scheduled Twitter cookie refresh.');
            refreshTwitterCookies();
        }, TWITTER_COOKIE_REFRESH_INTERVAL_MS);
        logger.info(`[X Scraper] Scheduled Twitter cookie refresh every ${TWITTER_COOKIE_REFRESH_INTERVAL_MS / (1000 * 60 * 60)} hours.`);
    } else {
         logger.warn('[X Scraper] TWITTER_USERNAME or TWITTER_PASSWORD not set. Skipping automatic cookie refresh.');
    }

    // Start the Express server for PubSubHubbub
    app.listen(PSH_PORT, () => {
        logger.info(`PubSubHubbub server listening on port ${PSH_PORT}`);
        // Once the server is listening, subscribe to YouTube updates
        // The initial subscription will now happen as part of softRestart if enabled
        // subscribeToYouTubePubSubHubbub(); // Removed initial direct call
    }).on('error', (err) => {
        // Corrected: Pass the Error object directly to logger.error
        logger.error('Failed to start Express server:', err);
        process.exit(1); // Exit if server cannot start
    });
});

// Soft restart function
async function softRestart() {
    logger.info('Initiating soft restart...');

    // 1. Unsubscribe from existing PubSubHubbub subscription
    await unsubscribeFromYouTubePubSubHubbub();

    // Give YouTube a moment to process unsubscribe (optional but can help)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2. Reset relevant state (optional, but can help ensure a clean state)
    announcedVideos.clear();
    knownTweetIds.clear();
    botStartTime = new Date(); // Reset bot start time for filtering old content
    logger.info(`State reset. New bot start time: ${botStartTime.toISOString()}`);

    // 3. Re-initialize monitors and resubscribe
    logger.info('Re-initializing monitors and resubscribing...');
    initializeYouTubeMonitor(); // This will now include subscribing if enabled
    initializeXMonitor();

    // Re-enable support log posting on restart, but keep announcement state
    isPostingEnabled = true;
    logger.info('Support log posting re-enabled.');

    logger.info('Soft restart complete.');
}

// --- Message Command Handling ---
client.on('messageCreate', async message => {
    // Ignore bot messages to prevent loops or responding to non-commands
    if (message.author.bot) return;

    // Only process commands if a support channel is configured AND the message is in that channel
    if (DISCORD_BOT_SUPPORT_LOG_CHANNEL && message.channel.id !== DISCORD_BOT_SUPPORT_LOG_CHANNEL) {
        return; // Ignore messages from other channels
    }

    // Check if the message starts with the command prefix
    if (!message.content.startsWith(COMMAND_PREFIX)) {
        return; // Ignore messages that don't start with the prefix
    }

    // Extract command and arguments
    const args = message.content.slice(COMMAND_PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const user = message.author;

    logger.info(`${user.tag} (${user.id}) attempted command: ${COMMAND_PREFIX}${command} ${args.join(' ')}`);

    // --- Command Logic ---
    if (command === 'kill') {
        isPostingEnabled = false;
        logger.warn(`${user.tag} (${user.id}) executed ${COMMAND_PREFIX}kill command. All Discord posting is now disabled.`);
        await message.reply('🛑 All Discord posting has been stopped.');
    } else if (command === 'restart') {
        // Check if the user is authorized
        if (allowedUserIds.includes(user.id)) {
            logger.info(`${user.tag} (${user.id}) executed authorized ${COMMAND_PREFIX}restart command. Initiating soft restart.`);
            await message.reply('🔄 Initiating soft restart...');
            try {
                await softRestart();
                await message.channel.send('✅ Soft restart complete.'); // Confirm restart in support channel
            } catch (error) {
                logger.error('Error during soft restart:', error);
                await message.channel.send('❌ An error occurred during soft restart.');
            }
        } else {
            logger.warn(`${user.tag} (${user.id}) attempted unauthorized ${COMMAND_PREFIX}restart command.`);
            await message.reply('🚫 You are not authorized to use this command.');
        }
    } else if (command === 'announce') {
        if (args.length === 0) {
            await message.reply(`Current announcement state: ${isAnnouncementEnabled ? 'enabled' : 'disabled'}. Usage: ${COMMAND_PREFIX}announce <true|false>`);
            return;
        }
        const enableArg = args[0].toLowerCase();
        if (enableArg === 'true' || enableArg === 'false') {
            isAnnouncementEnabled = enableArg === 'true';
            logger.info(`${user.tag} (${user.id}) executed ${COMMAND_PREFIX}announce command. Announcement posting is now ${isAnnouncementEnabled ? 'enabled' : 'disabled'}.`);
            await message.reply(`📣 Announcement posting is now **${isAnnouncementEnabled ? 'enabled' : 'disabled'}**. (Support log is unaffected)`);
        } else {
            await message.reply(`Invalid argument for ${COMMAND_PREFIX}announce. Use \`${COMMAND_PREFIX}announce true\` or \`${COMMAND_PREFIX}announce false\`.`);
        }
    } else if (command === 'readme') {
            const commandList = [
            `**${COMMAND_PREFIX}kill**: Stops *all* bot posting to Discord channels (announcements and support log).`,
            `**${COMMAND_PREFIX}restart**: Performs a soft restart of the bot. Requires specific user authorization (\`ALLOWED_USER_IDS\`). Re-enables support log posting but retains the announcement toggle state.`,
            `**${COMMAND_PREFIX}announce <true|false>**: Toggles announcement posting to non-support channels. Does *not* affect the support log output.`,
            `**${COMMAND_PREFIX}readme**: Displays this command information.`,
            // You can set the command prefix using the COMMAND_PREFIX environment variable. Default is '!'.
        ];
        const readmeMessage = `**Discord Bot Message Commands**\n\nThese commands can only be used in the configured support channel.\n\n${commandList.join('\n')}`;
        await message.reply(readmeMessage);
      }
});



client.on('error', error => {
    // Corrected: Pass the Error object directly to logger.error
    logger.error('A Discord client error occurred:', error);
});

// Login to Discord with your bot's token
client.login(DISCORD_BOT_TOKEN)
    .catch(error => logger.error('Failed to login to Discord:', error));