// index.js
// © 2025 Marco Keller. All rights reserved. This software and its content are proprietary and confidential. Unauthorized reproduction or distribution is strictly prohibited.

import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config } from '@dotenvx/dotenvx';
import express from 'express';
import bodyParser from 'body-parser';
import rateLimit from 'express-rate-limit';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import Transport from 'winston-transport';
import XScraper from './x-scraper.js';
import YouTubeMonitor from './youtube-monitor.js';

// Load environment variables with encryption support
config();

// --- Environment Variable Validation ---
function validateEnvironmentVariables() {
    const requiredVars = [
        'DISCORD_BOT_TOKEN',
        'YOUTUBE_API_KEY',
        'YOUTUBE_CHANNEL_ID', 
        'DISCORD_YOUTUBE_CHANNEL_ID',
        'PSH_CALLBACK_URL',
        'X_USER_HANDLE',
        'DISCORD_X_POSTS_CHANNEL_ID',
        'DISCORD_X_REPLIES_CHANNEL_ID',
        'DISCORD_X_QUOTES_CHANNEL_ID', 
        'DISCORD_X_RETWEETS_CHANNEL_ID',
        'TWITTER_USERNAME',
        'TWITTER_PASSWORD',
        'DISCORD_BOT_SUPPORT_LOG_CHANNEL'
    ];

    const optionalVars = [
        { name: 'COMMAND_PREFIX', defaultValue: '!' },
        { name: 'PSH_PORT', defaultValue: '3000' },
        { name: 'LOG_FILE_PATH', defaultValue: 'bot.log' },
        { name: 'LOG_LEVEL', defaultValue: 'info' },
        { name: 'PSH_SECRET', defaultValue: 'your_super_secret_string_here' },
        { name: 'PSH_VERIFY_TOKEN', defaultValue: 'your_optional_verify_token' },
        { name: 'ANNOUNCEMENT_ENABLED', defaultValue: 'false' },
        { name: 'X_VX_TWITTER_CONVERSION', defaultValue: 'false' },
        { name: 'X_QUERY_INTERVALL_MIN', defaultValue: '300000' },
        { name: 'X_QUERY_INTERVALL_MAX', defaultValue: '600000' },
        { name: 'ALLOWED_USER_IDS', defaultValue: null },
        { name: 'ANNOUNCE_OLD_TWEETS', defaultValue: 'false' }
    ];

    const missing = [];
    const warnings = [];

    // Check required variables
    for (const varName of requiredVars) {
        if (!process.env[varName]) {
            missing.push(varName);
        }
    }

    // Check optional variables and warn about security defaults
    for (const { name, defaultValue } of optionalVars) {
        if (!process.env[name]) {
            if (name === 'PSH_SECRET' || name === 'PSH_VERIFY_TOKEN') {
                warnings.push(`${name} not set - using default value (consider setting for security)`);
            } else if (name === 'ALLOWED_USER_IDS') {
                warnings.push(`${name} not set - restart command will be unavailable`);
            }
        }
    }

    // Report missing required variables
    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        missing.forEach(varName => console.error(`  - ${varName}`));
        console.error('\nThe bot cannot start without these variables. Please check your .env file.');
        process.exit(1);
    }

    // Report warnings for optional variables
    if (warnings.length > 0) {
        console.warn('⚠️  Environment variable warnings:');
        warnings.forEach(warning => console.warn(`  - ${warning}`));
    }

    console.log('✅ Environment variable validation passed');
}

// Validate environment variables before proceeding
validateEnvironmentVariables();

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || '!';
const DISCORD_BOT_SUPPORT_LOG_CHANNEL = process.env.DISCORD_BOT_SUPPORT_LOG_CHANNEL;
const PSH_PORT = process.env.PSH_PORT || 3000;
const LOG_FILE_PATH = process.env.LOG_FILE_PATH || 'bot.log';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

let botStartTime = null;
let isPostingEnabled = true;
let isAnnouncementEnabled = (process.env.ANNOUNCEMENT_ENABLED || 'false').toLowerCase() === 'true';
let isVxTwitterConversionEnabled = (process.env.X_VX_TWITTER_CONVERSION || 'false').toLowerCase() === 'true';
let mirrorMessage = false;
const allowedUserIds = process.env.ALLOWED_USER_IDS ? process.env.ALLOWED_USER_IDS.split(',').map(id => id.trim()) : [];

// --- Rate Limiting Configuration ---
// Webhook rate limiter (for PubSubHubbub and other webhooks)
const webhookLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many webhook requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Command rate limiter (in-memory store for Discord commands)
class CommandRateLimit {
    constructor(maxCommands = 5, windowMs = 60000) { // 5 commands per minute by default
        this.maxCommands = maxCommands;
        this.windowMs = windowMs;
        this.users = new Map();
    }

    isAllowed(userId) {
        const now = Date.now();
        const userData = this.users.get(userId) || { count: 0, resetTime: now + this.windowMs };

        // Reset if window has passed
        if (now >= userData.resetTime) {
            userData.count = 0;
            userData.resetTime = now + this.windowMs;
        }

        // Check if user has exceeded limit
        if (userData.count >= this.maxCommands) {
            return false;
        }

        // Increment counter
        userData.count++;
        this.users.set(userId, userData);

        // Clean up old entries periodically
        if (this.users.size > 1000) { // Arbitrary cleanup threshold
            this.cleanup();
        }

        return true;
    }

    cleanup() {
        const now = Date.now();
        for (const [userId, userData] of this.users.entries()) {
            if (now >= userData.resetTime) {
                this.users.delete(userId);
            }
        }
    }

    getRemainingTime(userId) {
        const userData = this.users.get(userId);
        if (!userData) return 0;
        return Math.max(0, userData.resetTime - Date.now());
    }
}

const commandRateLimit = new CommandRateLimit(5, 60000); // 5 commands per minute

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
        if (DISCORD_BOT_SUPPORT_LOG_CHANNEL && targetChannel.id !== DISCORD_BOT_SUPPORT_LOG_CHANNEL) {
            client.channels.fetch(DISCORD_BOT_SUPPORT_LOG_CHANNEL).then(supportChannel => {
                if (supportChannel && supportChannel.isTextBased()) {
                    supportChannel.send(`(Posting is currently disabled. Skipped message to ${targetChannel.name})`).catch(err => logger.error(`Failed to send disabled posting notification:`, err));
                }
            }).catch(() => logger.warn(`Could not fetch support channel ${DISCORD_BOT_SUPPORT_LOG_CHANNEL} to notify about skipped message.`));
        }
        return;
    }
    await targetChannel.send(content);
    
    // Optionally send a notification to the support channel that posting is disabled
    if (DISCORD_BOT_SUPPORT_LOG_CHANNEL && mirrorMessage && targetChannel.id !== DISCORD_BOT_SUPPORT_LOG_CHANNEL) {
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
        this.buffer = [];

        // Buffering options
        this.flushInterval = opts.flushInterval || 2000;    // 2 seconds
        this.maxBufferSize = opts.maxBufferSize || 20;      // 20 log entries
        this.flushTimer = null;
        this.isDestroyed = false;
        this.startFlushing();
    }

    startFlushing() {
        if (this.flushTimer) clearInterval(this.flushTimer);
        this.flushTimer = setInterval(() => {
            if (!this.isDestroyed) {
                this.flush();
            }
        }, this.flushInterval);
    }

    // Add cleanup method to prevent memory leaks
    close() {
        this.isDestroyed = true;
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        // Flush any remaining buffer before closing
        this.flush();
        this.emit('close');
    }

    // Override the Winston transport close method
    destroy() {
        this.close();
    }

    async log(info, callback) {
        setImmediate(() => this.emit('logged', info));
        // Channel initialization logic
        if (!this.client.isReady() || this.channel === 'errored') return callback();
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
        if (this.buffer.length >= this.maxBufferSize) await this.flush();
        callback();
    }

    async flush() {
        if (this.isDestroyed || this.buffer.length === 0 || !this.channel || this.channel === 'errored') return;
        const messagesToFlush = [...this.buffer];
        this.buffer = [];
        const combinedMessage = messagesToFlush.join('\n');
        try {
            for (const part of splitMessage(combinedMessage, { maxLength: 1980 })) {
                if (part && !this.isDestroyed) await this.channel.send(part);
            }
        } catch (error) {
            console.error('[DiscordTransport] Failed to flush log buffer to Discord:', error);
            // Re-add messages to buffer if sending failed and transport is still active
            if (!this.isDestroyed && messagesToFlush.length > 0) {
                this.buffer.unshift(...messagesToFlush);
            }
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

const app = express();

// Trust proxy headers (required for accurate rate limiting with X-Forwarded-For)
app.set('trust proxy', true);

// Apply rate limiting to all routes
app.use(webhookLimiter);

// --- Health Check Endpoints ---
// Basic health check endpoint
app.get('/health', (req, res) => {
    const healthStatus = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        discord: {
            connected: client.readyAt ? true : false,
            readyAt: client.readyAt?.toISOString() || null,
            ping: client.ws.ping
        },
        bot: {
            startTime: botStartTime?.toISOString() || null,
            postingEnabled: isPostingEnabled,
            announcementEnabled: isAnnouncementEnabled
        },
        memory: process.memoryUsage(),
        env: process.env.NODE_ENV || 'development'
    };
    
    res.json(healthStatus);
});

// Detailed health check with component status
app.get('/health/detailed', (req, res) => {
    const now = new Date();
    const detailedStatus = {
        status: 'ok',
        timestamp: now.toISOString(),
        components: {
            discord: {
                status: client.readyAt ? 'healthy' : 'unhealthy',
                connected: client.readyAt ? true : false,
                readyAt: client.readyAt?.toISOString() || null,
                ping: client.ws.ping,
                guilds: client.guilds.cache.size
            },
            youtube: {
                status: 'unknown', // YouTubeMonitor will update this
                lastCheck: null
            },
            xscraper: {
                status: 'unknown', // XScraper will update this  
                lastCheck: null
            },
            express: {
                status: 'healthy',
                port: PSH_PORT
            }
        },
        system: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            platform: process.platform,
            nodeVersion: process.version
        },
        configuration: {
            postingEnabled: isPostingEnabled,
            announcementEnabled: isAnnouncementEnabled,
            vxTwitterConversionEnabled: isVxTwitterConversionEnabled,
            logLevel: LOG_LEVEL
        }
    };
    
    res.json(detailedStatus);
});

// Readiness probe (for k8s/container orchestration)
app.get('/ready', (req, res) => {
    const ready = client.readyAt && botStartTime;
    res.status(ready ? 200 : 503).json({
        ready,
        message: ready ? 'Bot is ready' : 'Bot is not ready'
    });
});

const xScraper = new XScraper({
    client: client,
    logger: logger,
    sendMirroredMessage: sendMirroredMessage,
    isAnnouncementEnabled: () => isAnnouncementEnabled,
    isVxTwitterConversionEnabled: () => isVxTwitterConversionEnabled
});
const youTubeMonitor = new YouTubeMonitor({
    client: client,
    logger: logger,
    sendMirroredMessage: sendMirroredMessage,
    isAnnouncementEnabled: () => isAnnouncementEnabled,
    getBotStartTime: () => botStartTime,
    app: app,
});

client.once('ready', async () => {
    logger.info(`Logged in as ${client.user.tag}!`);
    botStartTime = new Date();
    logger.info(`Bot started at: ${botStartTime.toISOString()}`);

    if (DISCORD_BOT_SUPPORT_LOG_CHANNEL) {
        logger.add(new DiscordTransport({ level: LOG_LEVEL, client: client, channelId: DISCORD_BOT_SUPPORT_LOG_CHANNEL }));
    } else {
        logger.warn('DISCORD_BOT_SUPPORT_LOG_CHANNEL not set.');
    }

    youTubeMonitor.initialize();
    xScraper.initialize();

    app.listen(PSH_PORT, () => {
        logger.info(`PubSubHubbub server listening on port ${PSH_PORT}`);
    }).on('error', (err) => {
        logger.error('Failed to start Express server:', err);
        process.exit(1);
    });
});

async function softRestart() {
    try {
        logger.info('Initiating soft restart...');
        
        // Unsubscribe from YouTube PubSubHubbub with error handling
        try {
            await youTubeMonitor.unsubscribeFromYouTubePubSubHubbub();
        } catch (error) {
            logger.warn('Error during YouTube unsubscribe (continuing restart):', error);
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Reset states with error handling
        try {
            youTubeMonitor.resetState();
            xScraper.resetState();
        } catch (error) {
            logger.warn('Error during state reset (continuing restart):', error);
        }
        
        botStartTime = new Date();
        logger.info(`State reset. New bot start time: ${botStartTime.toISOString()}`);

        // Reinitialize services with error handling
        try {
            youTubeMonitor.initialize();
        } catch (error) {
            logger.error('Error reinitializing YouTube monitor:', error);
        }
        
        try {
            xScraper.initialize();
        } catch (error) {
            logger.error('Error reinitializing X scraper:', error);
        }

        isPostingEnabled = true;
        logger.info('Support log posting re-enabled.');
        logger.info('Soft restart complete.');
    } catch (error) {
        logger.error('Critical error during soft restart:', error);
        throw error; // Re-throw to let caller handle
    }
}

client.on('messageCreate', async message => {
    try {
        if (message.author.bot || !message.content.startsWith(COMMAND_PREFIX)) return;
        if (DISCORD_BOT_SUPPORT_LOG_CHANNEL && message.channel.id !== DISCORD_BOT_SUPPORT_LOG_CHANNEL) return;

        const args = message.content.slice(COMMAND_PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        const user = message.author;

        // Validate command and user inputs
        if (!command || command.length > 20) {
            await message.reply('❌ Invalid command format.');
            return;
        }

        if (!user || !user.id) {
            logger.warn('Received message from invalid user object');
            return;
        }

        // Rate limiting check
        if (!commandRateLimit.isAllowed(user.id)) {
            const remainingTime = Math.ceil(commandRateLimit.getRemainingTime(user.id) / 1000);
            await message.reply(`🚫 Rate limit exceeded. Please wait ${remainingTime} seconds before using another command.`);
            logger.warn(`Rate limit exceeded for user ${user.tag} (${user.id})`);
            return;
        }

    if (command === 'restart') {
        if (allowedUserIds.includes(user.id)) {
            await message.reply('🔄 Initiating soft restart...');
            try {
                await softRestart();
                await message.channel.send('✅ Soft restart complete.');
            } catch (error) {
                logger.error('Soft restart failed:', error);
                await message.channel.send('❌ Soft restart failed. Check logs for details.');
            }
        } else {
            await message.reply('🚫 You are not authorized to use this command.');
        }
    } else if (command === 'kill') {
        if (allowedUserIds.includes(user.id)) {
            isPostingEnabled = false;
            logger.warn(`${user.tag} (${user.id}) executed ${COMMAND_PREFIX}kill command. All Discord posting is now disabled.`);
            await message.reply('🛑 All Discord posting has been stopped.');
        } else {
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
    } else if (command === 'vxtwitter') {
        if (args.length === 0) {
            await message.reply(`Current vxtwitter conversion state: ${isVxTwitterConversionEnabled ? 'enabled' : 'disabled'}. Usage: ${COMMAND_PREFIX}vxtwitter <true|false>`);
            return;
        }
        const enableArg = args[0].toLowerCase();
        if (enableArg === 'true' || enableArg === 'false') {
            isVxTwitterConversionEnabled = enableArg === 'true';
            logger.info(`${user.tag} (${user.id}) executed ${COMMAND_PREFIX}vxtwitter command. URL conversion is now ${isVxTwitterConversionEnabled ? 'enabled' : 'disabled'}.`);
            await message.reply(`🐦 URL conversion to vxtwitter.com is now **${isVxTwitterConversionEnabled ? 'enabled' : 'disabled'}**.`);
        } else {
            await message.reply(`Invalid argument for ${COMMAND_PREFIX}vxtwitter. Use \`${COMMAND_PREFIX}vxtwitter true\` or \`${COMMAND_PREFIX}vxtwitter false\`.`);
        }
    } else if (command === 'loglevel') {
        if (args.length === 0) {
            await message.reply(`Current log level: ${logger.level}. Usage: ${COMMAND_PREFIX}loglevel <level>`);
            return;
        }
        const newLevel = args[0] ? args[0].toLowerCase().trim() : '';
        const validLevels = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];
        
        // Validate input length and characters
        if (!newLevel || newLevel.length > 10 || !/^[a-z]+$/.test(newLevel)) {
            await message.reply(`❌ Invalid log level format. Valid levels are: ${validLevels.join(', ')}.`);
            return;
        }
        
        if (validLevels.includes(newLevel)) {
            try {
                logger.level = newLevel;
                // Also update the level on all transports
                logger.transports.forEach(transport => {
                    transport.level = newLevel;
                });
                logger.warn(`${user.tag} (${user.id}) executed ${COMMAND_PREFIX}loglevel command. Log level changed to '${newLevel}'.`);
                await message.reply(`🔧 Log level has been changed to **${newLevel}**.`);
            } catch (error) {
                logger.error('Error changing log level:', error);
                await message.reply('❌ Failed to change log level. Please try again.');
            }
        } else {
            await message.reply(`❌ Invalid log level. Valid levels are: ${validLevels.join(', ')}.`);
        }
    } else if (command === 'health') {
        const uptime = Math.floor(process.uptime());
        const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`;
        const memUsage = process.memoryUsage();
        const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        
        const healthEmbed = {
            title: '🏥 Bot Health Status',
            color: client.readyAt ? 0x00ff00 : 0xff0000, // Green if ready, red if not
            fields: [
                {
                    name: '🤖 Discord Connection',
                    value: client.readyAt ? `✅ Connected (${client.ws.ping}ms ping)` : '❌ Disconnected',
                    inline: true
                },
                {
                    name: '⏱️ Uptime',
                    value: uptimeStr,
                    inline: true
                },
                {
                    name: '💾 Memory Usage',
                    value: `${memMB} MB`,
                    inline: true
                },
                {
                    name: '📡 Posting Status',
                    value: isPostingEnabled ? '✅ Enabled' : '❌ Disabled',
                    inline: true
                },
                {
                    name: '📢 Announcements',
                    value: isAnnouncementEnabled ? '✅ Enabled' : '❌ Disabled',
                    inline: true
                },
                {
                    name: '🐦 VX Twitter',
                    value: isVxTwitterConversionEnabled ? '✅ Enabled' : '❌ Disabled',
                    inline: true
                }
            ],
            timestamp: new Date().toISOString(),
            footer: {
                text: `Bot started: ${botStartTime ? botStartTime.toLocaleString() : 'Unknown'}`
            }
        };
        
        await message.reply({ embeds: [healthEmbed] });
    } else if (command === 'readme') {
        const commandList = [
            `**${COMMAND_PREFIX}kill**: Stops *all* bot posting to Discord channels (announcements and support log).`,
            `**${COMMAND_PREFIX}restart**: Performs a soft restart of the bot. Requires specific user authorization (\`ALLOWED_USER_IDS\`). Re-enables support log posting but retains the announcement toggle state.`,
            `**${COMMAND_PREFIX}announce <true|false>**: Toggles announcement posting to non-support channels.`,
            `**${COMMAND_PREFIX}vxtwitter <true|false>**: Toggles the conversion of \`x.com\` URLs to \`vxtwitter.com\` in announcements.`,
            `**${COMMAND_PREFIX}loglevel <level>**: Changes the bot's logging level (e.g., info, debug).`,
            `**${COMMAND_PREFIX}health**: Shows bot health status and system information.`,
            `**${COMMAND_PREFIX}readme**: Displays this command information.`,
        ];
        const readmeMessage = `**Discord Bot Message Commands**\n\nThese commands can only be used in the configured support channel.\n\n${commandList.join('\n')}`;
        await message.reply(readmeMessage);
    } else {
        await message.reply(`❓ Unknown command: \`${command}\`. Use \`${COMMAND_PREFIX}readme\` for help.`);
    }
    } catch (error) {
        logger.error('Error processing message command:', error);
        try {
            await message.reply('❌ An error occurred while processing your command. Please try again.');
        } catch (replyError) {
            logger.error('Failed to send error reply:', replyError);
        }
    }
});

client.on('error', error => logger.error('A Discord client error occurred:', error));
client.login(DISCORD_BOT_TOKEN).catch(error => logger.error('Failed to login to Discord:', error));
