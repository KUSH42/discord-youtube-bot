// index.js
// This script sets up a Discord bot that monitors a specific YouTube channel
// for new video uploads and livestreams using YouTube's PubSubHubbub,
// and then announces them in a designated Discord text channel.
// It now also includes file logging using the winston library and webhook signature verification.
// Added auto-renewal for the PubSubHubbub subscription.

// --- Required Libraries ---
// You will need to install these packages:
// npm install discord.js googleapis dotenv express body-parser xml2js node-fetch winston winston-daily-rotate-file

const { Client, GatewayIntentBits } = require('discord.js');
const { google } = require('googleapis');
const dotenv = require('dotenv');
const express = require('express');
const bodyParser = require('body-parser');
const xml2js = require('xml2js'); // For parsing the Atom feed XML
const fetch = require('node-fetch'); // For making HTTP requests in Node.js
const winston = require('winston'); // For logging
require('winston-daily-rotate-file'); // For daily log rotation
const crypto = require('crypto'); // For cryptographic operations (HMAC verification)

// Load environment variables from .env file
dotenv.config();

// --- Configuration Variables ---
// IMPORTANT: Replace these placeholders with your actual values.
// It's recommended to use environment variables for sensitive data.

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY; // Still needed for initial channel info
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
const DISCORD_ANNOUNCEMENT_CHANNEL_ID = process.env.DISCORD_ANNOUNCEMENT_CHANNEL_ID;

// PubSubHubbub specific configurations
const PSH_SECRET = process.env.PSH_SECRET || 'your_super_secret_string_here'; // A secret string for verifying notification requests
const PSH_CALLBACK_URL = process.env.PSH_CALLBACK_URL; // IMPORTANT: Your bot's publicly accessible URL + /webhook/youtube
const PSH_PORT = process.env.PORT || 3000; // Port for the Express server to listen on
// Optional: A token sent with the subscription request and echoed back in the challenge for verification
const PSH_VERIFY_TOKEN = process.env.PSH_VERIFY_TOKEN || 'your_optional_verify_token';

// Logging configuration
const LOG_FILE_PATH = process.env.LOG_FILE_PATH || 'bot.log'; // Path to the log file
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // 'error', 'warn', 'info', 'verbose', 'debug', 'silly'

// --- Logger Setup ---
const logger = winston.createLogger({
    level: LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }), // Include stack trace for errors
        winston.format.splat(), // Allow string interpolation like console.log
        winston.format.json() // JSON format for file logs
    ),
    transports: [
        // Console transport
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(), // Colorize output for console
                winston.format.printf(
                    info => `${info.timestamp} ${info.level}: ${info.message}` +
                            (info.stack ? `\n${info.stack}` : '')
                )
            )
        }),
        // File transport with daily rotation
        new winston.transports.DailyRotateFile({
            filename: `${LOG_FILE_PATH}-%DATE%.log`, // e.g., bot.log-2023-10-27.log
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true, // Zip old log files
            maxSize: '20m', // Max size of a log file before rotation
            maxFiles: '14d' // Keep logs for 14 days
        })
    ],
    exceptionHandlers: [
        new winston.transports.DailyRotateFile({
            filename: `${LOG_FILE_PATH}-exceptions-%DATE%.log`,
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d'
        })
    ],
    rejectionHandlers: [
        new winston.transports.DailyRotateFile({
            filename: `${LOG_FILE_PATH}-rejections-%DATE%.log`,
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d'
        })
    ]
});


// --- Discord Client Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- YouTube API Client Setup (for initial channel info) ---
const youtube = google.youtube({
    version: 'v3',
    auth: YOUTUBE_API_KEY
});

// --- Data Storage for Tracked Videos/Livestreams ---
// In a real-world scenario, you would use a database to persist this data.
// For this example, we'll use an in-memory Set.
let announcedVideos = new Set();

// --- PubSubHubbub Auto-Renewal Timer ---
let subscriptionRenewalTimer = null;

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
// This endpoint will receive verification challenges and notifications from YouTube.
app.post('/webhook/youtube', async (req, res) => {
    // PubSubHubbub subscription verification
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.challenge']) {
        const challenge = req.query['hub.challenge'];
        const topic = req.query['hub.topic'];
        const leaseSeconds = req.query['hub.lease_seconds'];
        const verifyToken = req.query['hub.verify_token']; // Get the verify token from the query

        logger.info(`Received PubSubHubbub subscription challenge for topic: ${topic}`);
        logger.info(`Challenge: ${challenge}, Lease Seconds: ${leaseSeconds}`);

        // Verify the hub.verify_token if it was sent and matches our expected token
        if (PSH_VERIFY_TOKEN && verifyToken && verifyToken !== PSH_VERIFY_TOKEN) {
            logger.warn(`Subscription challenge rejected: hub.verify_token mismatch. Expected: ${PSH_VERIFY_TOKEN}, Received: ${verifyToken}`);
            return res.status(403).send('Forbidden: Verify token mismatch.');
        }

        res.status(200).send(challenge); // Respond with the challenge to verify
        logger.info('Responded to PubSubHubbub challenge.');
        return;
    }

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
                const link = entry.link.$.href; // Get the href attribute of the link tag
                // const published = new Date(entry.published); // Not directly used in announcement, but useful for logs

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
                            // Announce anyway if details couldn't be fetched, better than missing it.
                            await announceYouTubeContent({ id: videoId, title: title, url: link, type: 'unknown' });
                            announcedVideos.add(videoId);
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
            logger.error('Error parsing or processing PubSubHubbub notification:', error.message, error);
            res.status(500).send('Error processing notification.');
        }
    } else {
        logger.warn('Received unknown request to webhook endpoint: Method=%s, URL=%s, Content-Type=%s', req.method, req.url, req.headers['content-type']);
        res.status(400).send('Bad Request');
    }
});


/**
 * Announces a new video or livestream in the Discord channel.
 * @param {object} item - The video/livestream item object with id, title, url, type.
 */
async function announceYouTubeContent(item) {
    const channel = client.channels.cache.get(DISCORD_ANNOUNCEMENT_CHANNEL_ID);
    if (!channel) {
        logger.error(`Discord announcement channel with ID ${DISCORD_ANNOUNCEMENT_CHANNEL_CHANNEL_ID} not found.`);
        return;
    }

    let messageContent;
    if (item.type === 'upload') {
        messageContent = `🎬 **New Video Upload!**\n**${item.title}**\n${item.url}`;
    } else if (item.type === 'livestream') {
        messageContent = `🔴 **Livestream Started!**\n**${item.title}**\n${item.url}`;
    } else { // Fallback for unknown content type
        messageContent = `✨ **New YouTube Content!**\n**${item.title}**\n${item.url}`;
    }

    try {
        await channel.send(messageContent);
        logger.info(`Announced: ${item.title} (${item.type})`);
    } catch (error) {
        logger.error(`Error sending Discord message for ${item.id}:`, error.message, error);
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
            const errorText = await response.text();
            logger.error('Failed to subscribe to PubSubHubbub: Status=%d, Error=%s', response.status, errorText);
            // Consider a retry mechanism here for failed subscriptions
            // For example, retry after a short delay with exponential backoff
        }
    } catch (error) {
        logger.error('Error during PubSubHubbub subscription:', error.message, error);
        // Consider a retry mechanism for network errors
    }
}


// --- Discord Bot Events ---

client.once('ready', async () => {
    logger.info(`Logged in as ${client.user.tag}!`);
    logger.info('Bot is ready to receive YouTube PubSubHubbub notifications.');

    // Start the Express server
    app.listen(PSH_PORT, () => {
        logger.info(`PubSubHubbub server listening on port ${PSH_PORT}`);
        // Once the server is listening, subscribe to YouTube updates
        subscribeToYouTubePubSubHubbub();
    }).on('error', (err) => {
        logger.error('Failed to start Express server:', err.message, err);
        process.exit(1); // Exit if server cannot start
    });
});

client.on('error', error => {
    logger.error('A Discord client error occurred:', error.message, error);
});

// Login to Discord with your bot's token
client.login(DISCORD_BOT_TOKEN)
    .catch(error => logger.error('Failed to login to Discord:', error.message, error));

