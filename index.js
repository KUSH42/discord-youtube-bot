// index.js
// © 2025 Marco Keller. All rights reserved. This software and its content are proprietary and confidential. Unauthorized reproduction or distribution is strictly prohibited.

import { Client, GatewayIntentBits, Partials } from 'discord.js';
import dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import Transport from 'winston-transport';
import XScraper from './x-scraper.js';
import YouTubeMonitor from './youtube-monitor.js';

dotenv.config();

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || '!';
const DISCORD_BOT_SUPPORT_LOG_CHANNEL = process.env.DISCORD_BOT_SUPPORT_LOG_CHANNEL;
const PSH_PORT = process.env.PSH_PORT || 3000;
const LOG_FILE_PATH = process.env.LOG_FILE_PATH || 'bot.log';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

let botStartTime = null;
let isPostingEnabled = true;
let isAnnouncementEnabled = false;
let mirrorMessage = false;
const allowedUserIds = process.env.ALLOWED_USER_IDS ? process.env.ALLOWED_USER_IDS.split(',').map(id => id.trim()) : [];

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
        this.startFlushing();
    }

    startFlushing() {
        if (this.flushTimer) clearInterval(this.flushTimer);
        this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
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
        if (this.buffer.length === 0 || !this.channel || this.channel === 'errored') return;
        const messagesToFlush = [...this.buffer];
        this.buffer = [];
        const combinedMessage = messagesToFlush.join('\n');
        try {
            for (const part of splitMessage(combinedMessage, { maxLength: 1980 })) {
                if (part) await this.channel.send(part);
            }
        } catch (error) {
            console.error('[DiscordTransport] Failed to flush log buffer to Discord:', error);
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
const xScraper = new XScraper({
    client: client,
    logger: logger,
    sendMirroredMessage: sendMirroredMessage,
    isAnnouncementEnabled: () => isAnnouncementEnabled,
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
    logger.info('Initiating soft restart...');
    await youTubeMonitor.unsubscribeFromYouTubePubSubHubbub();
    await new Promise(resolve => setTimeout(resolve, 2000));

    youTubeMonitor.resetState();
    xScraper.resetState();
    botStartTime = new Date();
    logger.info(`State reset. New bot start time: ${botStartTime.toISOString()}`);

    youTubeMonitor.initialize();
    xScraper.initialize();

    isPostingEnabled = true;
    logger.info('Support log posting re-enabled.');
    logger.info('Soft restart complete.');
}

client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith(COMMAND_PREFIX)) return;
    if (DISCORD_BOT_SUPPORT_LOG_CHANNEL && message.channel.id !== DISCORD_BOT_SUPPORT_LOG_CHANNEL) return;

    const args = message.content.slice(COMMAND_PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const user = message.author;

    if (command === 'restart') {
        if (allowedUserIds.includes(user.id)) {
            await message.reply('🔄 Initiating soft restart...');
            await softRestart();
            await message.channel.send('✅ Soft restart complete.');
        } else {
            await message.reply('🚫 You are not authorized to use this command.');
        }
    } else if (command === 'kill') {
        isPostingEnabled = false;
        logger.warn(`${user.tag} (${user.id}) executed ${COMMAND_PREFIX}kill command. All Discord posting is now disabled.`);
        await message.reply('🛑 All Discord posting has been stopped.');
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
    ];
    const readmeMessage = `**Discord Bot Message Commands**\n\nThese commands can only be used in the configured support channel.\n\n${commandList.join('\n')}`;
    await message.reply(readmeMessage);
  }
});

client.on('error', error => logger.error('A Discord client error occurred:', error));
client.login(DISCORD_BOT_TOKEN).catch(error => logger.error('Failed to login to Discord:', error));
