// index.js
// © 2025 Marco Keller. All rights reserved. This software and its content are proprietary and confidential. Unauthorized reproduction or distribution is strictly prohibited.
// This script sets up a Discord bot that:
// 1. Polls a specific YouTube channel for new videos and livestreams.
// 2. Polls a specific X (Twitter) profile for new posts, replies, and reposts.
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
import xml2js from 'xml2js'; // For parsing the Atom feed XML
import fetch from 'node-fetch' ;
import * as winston  from 'winston';    // For logging
import 'winston-daily-rotate-file';    // For daily log rotation
import Transport from 'winston-transport';
import crypto from 'crypto';            // For cryptographic operations (HMAC verification)

// Load environment variables from .env file
dotenv.config();

// --- Configuration Variables ---
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
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
const DISCORD_X_POSTS_CHANNEL_ID = process.env.DISCORD_X_POSTS_CHANNEL_ID; // For original posts and replies
const DISCORD_X_REPOSTS_CHANNEL_ID = process.env.DISCORD_X_REPOSTS_CHANNEL_ID; // For reposts

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

// --- Utility Functions ---
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
    await targetChannel.send(content);
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
        this.flushInterval = opts.flushInterval || 5000; // 5 seconds
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

// --- YouTube Monitoring Section (Polling) ---
const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

async function populateInitialYouTubeHistory() {
    const videoUrlRegex = /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/g;
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
    try {
        await sendMirroredMessage(channel, messageContent);
        logger.info(`Announced YT content: ${item.title}`);
    } catch (error) {
        logger.error(`Error sending YT announcement for ${item.id}:`, error);
    }
}

async function pollYouTubeChannel() {
    try {
        logger.info(`[YouTube Poller] Checking for new videos for channel ${YOUTUBE_CHANNEL_ID}.`);
        const searchResponse = await youtube.search.list({
            part: 'id',
            channelId: YOUTUBE_CHANNEL_ID,
            order: 'date',
            maxResults: 10,
            type: 'video'
        });

        const videoIds = searchResponse.data.items.map(item => item.id.videoId).filter(id => !announcedVideos.has(id));

        if (videoIds.length > 0) {
            logger.info(`[YouTube Poller] Found ${videoIds.length} potential new videos. Fetching details.`);
            const detailsResponse = await youtube.videos.list({
                part: 'snippet,liveStreamingDetails',
                id: videoIds.join(','),
            });

            for (const video of detailsResponse.data.items.reverse()) { // Process oldest first
                if (!announcedVideos.has(video.id)) {
                    const type = video.snippet.liveBroadcastContent === 'live' || video.liveStreamingDetails?.actualStartTime ? 'livestream' : 'upload';
                    await announceYouTubeContent({
                        id: video.id,
                        title: video.snippet.title,
                        url: `https://www.youtube.com/watch?v=${video.id}`,
                        type: type
                    });
                    announcedVideos.add(video.id);
                }
            }
        } else {
            logger.info(`[YouTube Poller] No new videos found.`);
        }
    } catch (error) {
        logger.error('[YouTube Poller] Error during polling:', error);
    } finally {
        const nextPollIn = 10 * 60 * 1000; // 10 minutes
        logger.info(`[YouTube Poller] Next check in ${nextPollIn / 60000} minutes.`);
        setTimeout(pollYouTubeChannel, nextPollIn);
    }
}

async function initializeYouTubeMonitor() {
    if (!YOUTUBE_API_KEY || !YOUTUBE_CHANNEL_ID || !DISCORD_YOUTUBE_CHANNEL_ID) {
        logger.warn('[YouTube Poller] Not configured. Required env vars are missing. Skipping.');
        return;
    }
    logger.info(`[YouTube Poller] Initializing monitor for channel ID: ${YOUTUBE_CHANNEL_ID}`);
    await populateInitialYouTubeHistory();
    // Start polling as a fallback to PubSubHubbub
    pollYouTubeChannel();
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
let webhookPath = '/webhook/youtube-test'; // Default path
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
        logger.warn('Received unknown GET request to webhook endpoint.');
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
                        // Fetch additional details to see if it's a livestream or an upload
                        const videoDetailsResponse = await youtube.videos.list({
                            part: 'liveStreamingDetails,snippet',
                            id: videoId
                        });

                        const videoItem = videoDetailsResponse.data.items[0];
                        if (videoItem) {
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
                        } else {
                            logger.warn(`Could not fetch details for video ID: ${videoId}. Announcing as generic content.`);
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
        logger.warn('Received unknown POST request to webhook endpoint: Method=%s, URL=%s, Content-Type=%s', req.method, req.url, req.headers['content-type']);
        res.status(400).send('Bad Request');
    }
});

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
    const channelIds = [DISCORD_X_POSTS_CHANNEL_ID, DISCORD_X_REPOSTS_CHANNEL_ID].filter(id => id);

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
    // Route 'repost' types to the reposts channel, and all other types ('post') to the posts channel.
    const channelId = tweet.type === 'repost' ? DISCORD_X_REPOSTS_CHANNEL_ID : DISCORD_X_POSTS_CHANNEL_ID;
    if (!channelId) {
        logger.warn(`No channel configured for tweet type '${tweet.type}'. Skipping.`);
        return;
    }
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            logger.error(`X announcement channel ${channelId} not found or is not a text channel.`);
            return;
        }
        let message;
        if (tweet.type === 'repost') {
            message = `🔄 **${tweet.authorHandle} reposted:**\n${tweet.url}`;
        } else { // This handles 'post' type, which includes original tweets, replies, and quote tweets.
            message = `🐦 **New post by ${tweet.authorHandle}:**\n${tweet.text}\n${tweet.url}`;
        }
        await sendMirroredMessage(channel, message);
        logger.info(`Announced tweet ${tweet.id} from ${tweet.authorHandle}.`);
    } catch (error) {
        logger.error(`Failed to announce tweet ${tweet.id}:`, error);
    }
}

async function pollXProfile() {
    let browser;
    try {
        logger.info(`[X Scraper] Launching browser instance for scraping.`);
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 1080 });

         const urlsToScrape = [
            `https://x.com/${X_USER_HANDLE}`, // Main 'Posts' tab
            `https://x.com/${X_USER_HANDLE}/with_replies` // 'Replies' tab
        ];
        const allScrapedTweets = [];

        for (const url of urlsToScrape) {
            logger.info(`[X Scraper] Navigating to X page: ${url}`);
            try {
                await page.goto(url, { waitUntil: 'networkidle2' });

                // Scroll down to load more tweets
                logger.info(`[X Scraper] Scrolling page to load more tweets on ${url}.`);
                for (let i = 0; i < 3; i++) {
                    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for new tweets to load
        }

        await page.waitForSelector('article[data-testid="tweet"]', { timeout: 30000 });

        const tweetsFromPage = await page.$$eval('article[data-testid="tweet"]', (articles, targetUserHandle) => {
            return articles.map(article => {
                const socialContextEl = article.querySelector('div[data-testid="socialContext"]');
                const socialContextText = socialContextEl ? socialContextEl.innerText : '';
        
                // Ignore pinned tweets
                if (socialContextText.includes('Pinned')) {
                    return null;
                }
        
                const authorHandle = (article.querySelector('div[data-testid="User-Name"] a > div > span')?.innerText || '').trim();
                let type = 'post';
                let finalAuthorHandle = authorHandle;
                let isRelevant = false;
        
                // Case 1: It's a retweet by our target user.
                if (socialContextText.includes('reposted') && socialContextText.toLowerCase().includes(targetUserHandle.toLowerCase())) {
                    type = 'repost';
                    finalAuthorHandle = `@${targetUserHandle}`;
                    isRelevant = true;
                } 
                // Case 2: It's an original tweet, reply, or quote tweet by our target user.
                else if (authorHandle.toLowerCase() === `@${targetUserHandle}`.toLowerCase()) {
                    type = 'post'; // All non-reposts are treated as 'post' for routing.
                    isRelevant = true;
                }
                
                // If the tweet is not from or reposted by the target user, ignore it.
                if (!isRelevant) {
                    return null;
                }
        
                const links = Array.from(article.querySelectorAll('a'));
                const statusLink = links.find(a => a.href.includes('/status/'));
                if (!statusLink) return null;
        
                const url = statusLink.href;
                const idMatch = url.match(/\/status\/(\d+)/);
                if (!idMatch) return null;
                const id = idMatch[1];
                
                const text = article.querySelector('div[data-testid="tweetText"]')?.innerText || '';
                const timeEl = article.querySelector('time[datetime]');
                const timestamp = timeEl ? timeEl.getAttribute('datetime') : null;
                if (!timestamp) return null;
        
                return { id, text, url, authorHandle: finalAuthorHandle, type, timestamp };
        
            }).filter(t => t !== null);
                 }, X_USER_HANDLE);
                
                allScrapedTweets.push(...tweetsFromPage);

            } catch (pageError) {
                logger.warn(`[X Scraper] Could not fully process ${url}. It might be empty or had a loading issue. Error: ${pageError.message}`);
            }
        }
        
        if(browser) await browser.close();

        // Deduplicate tweets by ID, as replies can show up on the main timeline
        const uniqueTweetsMap = new Map();
        for (const tweet of allScrapedTweets) {
            if (!uniqueTweetsMap.has(tweet.id)) {
                uniqueTweetsMap.set(tweet.id, tweet);
            }
        }
        const uniqueScrapedTweets = Array.from(uniqueTweetsMap.values());
        let newTweets = uniqueScrapedTweets.filter(tweet => !knownTweetIds.has(tweet.id));
        if (newTweets.length > 0) {
            logger.info(`[X Scraper] Found ${newTweets.length} new tweets across all monitored tabs.`);

            // Sort by timestamp to ensure chronological order (oldest first)
            newTweets.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            for (const tweet of newTweets) { // Process in chronological order
                logger.info(`[X Scraper] Processing new tweet from ${tweet.timestamp}: ${tweet.url}`);
                await announceXContent(tweet);
                knownTweetIds.add(tweet.id);
            }
        } else {
            logger.info(`[X Scraper] No new tweets found for @${X_USER_HANDLE} across monitored tabs.`);
        }
        // Schedule next poll with random jitter
        const nextPollIn = (5 * 60 * 1000) + (Math.random() * 60 * 1000); // 5-6 minutes
        setTimeout(pollXProfile, nextPollIn);

    } catch (error) {
        logger.error('[X Scraper] Error during polling:', error);
        if(browser) await browser.close();
        const nextPollIn = 30 * 60 * 1000; // Wait 30 minutes on error
        logger.info(`[X Scraper] Retrying in ${nextPollIn / 60000} minutes.`);
        setTimeout(pollXProfile, nextPollIn);
    }
}

async function initializeXMonitor() {
    if (!X_USER_HANDLE || (!DISCORD_X_POSTS_CHANNEL_ID && !DISCORD_X_REPOSTS_CHANNEL_ID)) {
        logger.warn('[X Scraper] Not configured. X_USER_HANDLE and at least one DISCORD_X channel ID are required. Skipping.');
        return;
    }
    logger.info(`[X Scraper] Initializing monitor for X user: @${X_USER_HANDLE}`);
    await populateInitialTweetIds();
    pollXProfile(); // Start the first poll
}


// --- Main Bot Events ---
client.once('ready', async () => {
    logger.info(`Logged in as ${client.user.tag}!`);
    logger.info('Bot is ready to receive YouTube PubSubHubbub notifications.');
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

    // Initialize YouTube monitoring
    initializeYouTubeMonitor();

    // Initialize X (Twitter) monitoring
    initializeXMonitor();

    // Start the Express server
    app.listen(PSH_PORT, () => {
        logger.info(`PubSubHubbub server listening on port ${PSH_PORT}`);
        // Once the server is listening, subscribe to YouTube updates
        subscribeToYouTubePubSubHubbub();
    }).on('error', (err) => {
        // Corrected: Pass the Error object directly to logger.error
        logger.error('Failed to start Express server:', err);
        process.exit(1); // Exit if server cannot start
    });
});

client.on('error', error => {
    // Corrected: Pass the Error object directly to logger.error
    logger.error('A Discord client error occurred:', error);
});

// Login to Discord with your bot's token
client.login(DISCORD_BOT_TOKEN)
    .catch(error => logger.error('Failed to login to Discord:', error));