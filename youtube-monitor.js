// youtube-monitor.js
// © 2025 Marco Keller. All rights reserved. This software and its content are proprietary and confidential. Unauthorized reproduction or distribution is strictly prohibited.
// This module contains the YouTubeMonitor class, responsible for all YouTube and PubSubHubbub related monitoring.

import { google } from 'googleapis';
import xml2js from 'xml2js';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { ChannelType } from 'discord.js';

class YouTubeMonitor {
    constructor(options) {
        this.client = options.client;
        this.logger = options.logger;
        this.sendMirroredMessage = options.sendMirroredMessage;
        this.isAnnouncementEnabled = () => options.isAnnouncementEnabled();
        this.getBotStartTime = () => options.getBotStartTime();
        this.app = options.app;

        // --- Configuration Variables ---
        this.YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
        this.YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
        this.DISCORD_YOUTUBE_CHANNEL_ID = process.env.DISCORD_YOUTUBE_CHANNEL_ID;
        this.PSH_SECRET = process.env.PSH_SECRET || 'your_super_secret_string_here';
        this.PSH_CALLBACK_URL = process.env.PSH_CALLBACK_URL;
        this.PSH_VERIFY_TOKEN = process.env.PSH_VERIFY_TOKEN || 'your_optional_verify_token';

        // --- Global State ---
        this.announcedVideos = new Set();
        this.subscriptionRenewalTimer = null;
        this.youtube = google.youtube({ version: 'v3', auth: this.YOUTUBE_API_KEY });
    }

    async populateInitialYouTubeHistory() {
        const videoUrlRegex = /https?:\/\/(?:(?:www\.)?youtube\.com\/(?:watch\?v=|live\/|shorts\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
        if (!this.DISCORD_YOUTUBE_CHANNEL_ID) return;

        try {
            const channel = await this.client.channels.fetch(this.DISCORD_YOUTUBE_CHANNEL_ID);
            if (channel && channel.type === ChannelType.GuildText) {
                const messages = await channel.messages.fetch({ limit: 50 });
                messages.forEach(msg => {
                    [...msg.content.matchAll(videoUrlRegex)].forEach(match => this.announcedVideos.add(match[1]));
                });
            }
        } catch (error) {
            this.logger.error(`Could not fetch messages from channel ${this.DISCORD_YOUTUBE_CHANNEL_ID} to populate YT history:`, error);
        }
        this.logger.info(`Populated ${this.announcedVideos.size} known YouTube video IDs from Discord history.`);
    }

    /**
    * Announces a new video or livestream in the Discord channel.
    * @param {object} item - The video/livestream item object with id, title, url, type.
    */
    async announceYouTubeContent(item) {
        const channel = this.client.channels.cache.get(this.DISCORD_YOUTUBE_CHANNEL_ID);
        if (!channel) {
            this.logger.error(`Discord announcement channel ${this.DISCORD_YOUTUBE_CHANNEL_ID} not found.`);
            return;
        }

        const messageContent = item.type === 'upload'
            ? `@everyone **🎬 New Video Upload!**\n${item.title}\n${item.url}`
            : `@everyone **🔴 Livestream Started!**\n${item.title}\n${item.url}`;

        // Check if announcement posting is enabled before proceeding
        if (!this.isAnnouncementEnabled()) {
            this.announcedVideos.add(item.id);
            this.logger.info(`Announcement posting is disabled. Skipping YouTube announcement for ${item.title}.`);
            return;
        }
        try {
            // sendMirroredMessage already checks isPostingEnabled
            await this.sendMirroredMessage(channel, messageContent);
            this.logger.info(`Announced YT content: ${item.title}`);
        } catch (error) {
            this.logger.error(`Error sending YT announcement for ${item.id}:`, error);
        }
    }

    async handlePubSubNotification(req, res) {
        if (req.headers['content-type'] === 'application/atom+xml' && req.rawBody) {
            const signatureHeader = req.headers['x-hub-signature'];
            if (!signatureHeader) return res.status(403).send('Forbidden');
            const [algorithm, signature] = signatureHeader.split('=');
            if (algorithm !== 'sha1') return res.status(400).send('Bad Request');

            const hmac = crypto.createHmac('sha1', this.PSH_SECRET);
            hmac.update(req.rawBody);
            if (hmac.digest('hex') !== signature) return res.status(403).send('Forbidden');

            try {
                const result = await new xml2js.Parser({ explicitArray: false }).parseStringPromise(req.body);
                const entry = result.feed.entry;
                if (entry && entry['yt:channelId'] === this.YOUTUBE_CHANNEL_ID && !this.announcedVideos.has(entry['yt:videoId'])) {
                    const videoDetails = await this.youtube.videos.list({ part: 'liveStreamingDetails,snippet', id: entry['yt:videoId'] });
                    const videoItem = videoDetails.data.items[0];
                    if (videoItem && new Date(videoItem.snippet.publishedAt) >= this.getBotStartTime()) {
                        const contentType = (videoItem.liveStreamingDetails && videoItem.liveStreamingDetails.actualStartTime) || videoItem.snippet.liveBroadcastContent === 'live' ? 'livestream' : 'upload';
                        await this.announceYouTubeContent({ id: entry['yt:videoId'], title: entry.title, url: entry.link.$.href, type: contentType });
                        this.announcedVideos.add(entry['yt:videoId']);
                    }
                }
                res.status(200).send('OK');
            } catch (error) {
                this.logger.error('Error processing PubSubHubbub notification:', error);
                res.status(500).send('Error');
            }
        } else {
            res.status(400).send('Bad Request');
        }
    }

    handlePubSubVerification(req, res) {
        const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.topic': topic, 'hub.verify_token': verifyToken } = req.query;
        if (mode === 'subscribe' || mode === 'unsubscribe') {
            if (this.PSH_VERIFY_TOKEN && verifyToken !== this.PSH_VERIFY_TOKEN) {
                this.logger.warn(`Subscription challenge rejected due to hub.verify_token mismatch.`);
                return res.status(403).send('Forbidden');
            }
            res.status(200).send(challenge);
            this.logger.info(`Successfully responded to PubSubHubbub challenge for topic: ${topic}`);
        } else {
            res.status(400).send('Bad Request');
        }
    }

    async unsubscribeFromYouTubePubSubHubbub() {
        const hubUrl = 'https://pubsubhubbub.appspot.com/';
        const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${this.YOUTUBE_CHANNEL_ID}`;

        this.logger.info(`Attempting to unsubscribe from PubSubHubbub for channel: ${this.YOUTUBE_CHANNEL_ID}`);

        if (this.subscriptionRenewalTimer) {
            clearTimeout(this.subscriptionRenewalTimer);
            this.subscriptionRenewalTimer = null;
            this.logger.info('Cleared PubSubHubbub subscription renewal timer during unsubscribe.');
        }

        const params = new URLSearchParams({
            'hub.mode': 'unsubscribe',
            'hub.callback': this.PSH_CALLBACK_URL,
            'hub.topic': topicUrl,
            'hub.secret': this.PSH_SECRET
        });

        try {
            const response = await fetch(hubUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            });

            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error('Failed to unsubscribe from PubSubHubbub: Status=%d, StatusText=%s, ErrorResponse=%s', response.status, response.statusText, errorText);
            } else {
                this.logger.info('PubSubHubbub unsubscribe request sent successfully.');
            }
        } catch (error) {
            this.logger.error('Error during PubSubHubbub unsubscribe:', error);
        }
    }


    async subscribeToYouTubePubSubHubbub() {
        const hubUrl = 'https://pubsubhubbub.appspot.com/';
        const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${this.YOUTUBE_CHANNEL_ID}`;

        if (this.subscriptionRenewalTimer) {
            clearTimeout(this.subscriptionRenewalTimer);
            this.subscriptionRenewalTimer = null;
            this.logger.info('Cleared existing PubSubHubbub subscription renewal timer.');
        }

        const leaseSeconds = 864000;
        const renewalBufferSeconds = 3600;

        const params = new URLSearchParams({
            'hub.mode': 'subscribe',
            'hub.callback': this.PSH_CALLBACK_URL,
            'hub.topic': topicUrl,
            'hub.verify': 'sync',
            'hub.secret': this.PSH_SECRET,
            'hub.lease_seconds': leaseSeconds
        });

        if (this.PSH_VERIFY_TOKEN) {
            params.append('hub.verify_token', this.PSH_VERIFY_TOKEN);
        }

        try {
            this.logger.info(`Attempting to subscribe to PubSubHubbub for channel: ${this.YOUTUBE_CHANNEL_ID}`);
            const response = await fetch(hubUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            });

            if (response.ok) {
                this.logger.info('PubSubHubbub subscription request sent successfully.');
                const renewalTimeMs = (leaseSeconds - renewalBufferSeconds) * 1000;
                if (renewalTimeMs > 0) {
                    this.subscriptionRenewalTimer = setTimeout(() => {
                        this.logger.info('Initiating PubSubHubbub subscription renewal.');
                        this.subscribeToYouTubePubSubHubbub();
                    }, renewalTimeMs);
                    this.logger.info(`PubSubHubbub subscription scheduled for renewal in ${renewalTimeMs / (1000 * 60 * 60)} hours.`);
                }
            } else {
                const errorText = await response.text();
                this.logger.error('Failed to subscribe to PubSubHubbub: Status=%d, ErrorResponse=%s', response.status, errorText);
            }
        } catch (error) {
            this.logger.error('Error during PubSubHubbub subscription:', error);
        }
    }

    async initialize() {
        if (!this.YOUTUBE_API_KEY || !this.YOUTUBE_CHANNEL_ID || !this.DISCORD_YOUTUBE_CHANNEL_ID) {
            this.logger.warn('[YouTube Monitor] Not configured. Skipping.');
            return;
        }
        this.logger.info(`[YouTube Monitor] Initializing monitor for channel ID: ${this.YOUTUBE_CHANNEL_ID}`);
        await this.populateInitialYouTubeHistory();

        let webhookPath = '/webhook/youtube';
        if (this.PSH_CALLBACK_URL) {
            try {
                webhookPath = new URL(this.PSH_CALLBACK_URL).pathname;
                this.logger.info(`Webhook listener configured for path: ${webhookPath}`);
            } catch (error) {
                this.logger.error(`Invalid PSH_CALLBACK_URL. Using default path.`, error);
            }
        }

        this.app.get(webhookPath, (req, res) => this.handlePubSubVerification(req, res));
        this.app.post(webhookPath, (req, res) => this.handlePubSubNotification(req, res));

        this.subscribeToYouTubePubSubHubbub();
    }

    resetState() {
        this.announcedVideos.clear();
        this.logger.info('[YouTube Monitor] State reset.');
    }
}

export default YouTubeMonitor;
