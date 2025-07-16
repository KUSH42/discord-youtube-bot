// youtube-monitor.js
// © 2025 Marco Keller. All rights reserved. This software and its content are proprietary and confidential. Unauthorized reproduction or distribution is strictly prohibited.
// This module contains the YouTubeMonitor class, responsible for all YouTube and PubSubHubbub related monitoring.

import { google } from 'googleapis';
import xml2js from 'xml2js';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { ChannelType } from 'discord.js';
import express from 'express'; // Import express

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
        this.cleanupTimer = null;
        this.youtube = google.youtube({ version: 'v3', auth: this.YOUTUBE_API_KEY });
        
        // Configure memory management
        this.MAX_ANNOUNCED_VIDEOS = 10000; // Maximum number of video IDs to keep in memory
        this.CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
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
        this.logger.info('Received request to handlePubSubNotification.');
        this.logger.verbose('Received request with Content-Type:', req.headers['content-type']);
        this.logger.debug('req.rawBody is present:', !!req.rawBody);
        // PubSubHubbub notification (new video/livestream update)
        if (req.headers['content-type'] === 'application/atom+xml' && req.rawBody) {
            this.logger.info('Received PubSubHubbub notification.');

            // --- Verify X-Hub-Signature ---
            const signatureHeader = req.headers['x-hub-signature'];
            if (!signatureHeader) {
                this.logger.warn('Received PubSubHubbub notification without X-Hub-Signature header. Rejecting.');
                return res.status(403).send('Forbidden: Missing signature.');
            }

            const [algorithm, signature] = signatureHeader.split('=');

            if (algorithm !== 'sha1') {
                this.logger.warn('Unsupported signature algorithm: %s', algorithm);
                return res.status(400).send('Bad Request: Unsupported signature algorithm.');
            }

            const hmac = crypto.createHmac('sha1', this.PSH_SECRET);
            hmac.update(req.rawBody); // Use the raw buffer body for HMAC calculation
            const expectedSignature = hmac.digest('hex');

            // Use timing-safe comparison to prevent timing attacks
            if (!crypto.timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(signature, 'hex'))) {
                this.logger.warn('X-Hub-Signature mismatch detected');
                return res.status(403).send('Forbidden: Invalid signature.');
            }
            this.logger.info('X-Hub-Signature verified successfully.');
            // --- End X-Hub-Signature Verification ---

            try {
                // Debug log the received XML body (only in debug mode to avoid spam)
                this.logger.debug('Received XML notification body:', req.body);
                
                // Configure secure XML parser to prevent XXE attacks
                const parser = new xml2js.Parser({ 
                    explicitArray: false,
                    // Security settings to prevent XXE attacks
                    normalize: true,
                    normalizeTags: true,
                    trim: true,
                    // Disable external entity resolution
                    explicitRoot: false,
                    mergeAttrs: false,
                    includeWhiteChars: false,
                    ignoreAttrs: false,
                    // Prevent parser bombs
                    async: false,
                    strict: true,
                    // Character limits to prevent DoS
                    chunkSize: 10000,
                    emptyTag: '',
                    // Disable CDATA to prevent injection
                    cdata: false
                });
                const result = await parser.parseStringPromise(req.body); // Use string body for parsing

                // Add defensive checks for XML structure
                if (!result || !result.feed) {
                    this.logger.error('Invalid XML structure: missing feed element');
                    this.logger.error('Raw XML body received:', req.body);
                    this.logger.error('Parsed XML result:', JSON.stringify(result, null, 2));
                    this.logger.error('Request headers:', JSON.stringify(req.headers, null, 2));
                    res.status(400).send('Invalid XML format');
                    return;
                }

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
                    this.logger.info(`Extracted link: ${link}`);

                    // Check if the notification is for the channel we are monitoring
                    if (channelId === this.YOUTUBE_CHANNEL_ID) {
                        if (!this.announcedVideos.has(videoId)) {
                            this.logger.info(`New content detected: ${title} (${videoId})`);
                            
                            // Check if we need to cleanup memory before processing
                            this.cleanupAnnouncedVideosIfNeeded();
                            
                            // Fetch additional details to see if it's a livestream or an upload and get published date
                            const videoDetailsResponse = await this.youtube.videos.list({
                                part: 'liveStreamingDetails,snippet',
                                id: videoId
                            });

                            const videoItem = videoDetailsResponse.data.items[0];
                            if (videoItem) {
                                const publishedAt = new Date(videoItem.snippet.publishedAt);

                                // Only announce if the video was published after the bot started
                                if (this.getBotStartTime() && publishedAt.getTime() >= this.getBotStartTime().getTime()) {
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
                                    await this.announceYouTubeContent(content);
                                    this.announcedVideos.add(videoId); // Mark as announced
                                } else if (this.getBotStartTime() && publishedAt.getTime() < this.getBotStartTime().getTime()) {
                                    this.logger.info(`Skipping announcement for old YouTube content published before bot startup: ${title} (${videoId}) published on ${publishedAt.toISOString()}`);
                                    this.announcedVideos.add(videoId); // Still mark as known to prevent future checks
                                } else {
                                    // botStartTime might not be set yet if notification is received very early
                                    this.logger.warn(`Bot startup time not yet set, cannot determine if YouTube content is old. Announcing: ${title} (${videoId})`);
                                    let contentType = 'upload';
                                    if (videoItem.liveStreamingDetails && videoItem.liveStreamingDetails.actualStartTime) {
                                        contentType = 'livestream';
                                    } else if (videoItem.snippet.liveBroadcastContent === 'live' || videoItem.snippet.liveBroadcastContent === 'upcoming') {
                                        contentType = 'livestream';
                                    }
                                    await this.announceYouTubeContent({ id: videoId, title: title, url: link, type: contentType });
                                    this.announcedVideos.add(videoId);
                                }
                            } else {
                                this.logger.warn(`Could not fetch details for video ID: ${videoId}. Cannot determine if old. Announcing as generic content.`);
                                await this.announceYouTubeContent({ id: videoId, title: title, url: link, type: 'unknown' });
                                this.announcedVideos.add(videoId); // Mark as announced
                            }
                        } else {
                            this.logger.info(`Content already announced: ${title} (${videoId})`);
                        }
                    } else {
                        this.logger.info(`Notification for unknown channel ID: ${channelId}`);
                    }
                } else {
                    this.logger.info('No new entry in PubSubHubbub notification.');
                }
                res.status(200).send('Notification received and processed.');
            } catch (error) {
                // Log full context for debugging
                this.logger.error('Error parsing or processing PubSubHubbub notification:', error);
                this.logger.error('Raw XML body that caused error:', req.body);
                this.logger.error('Request headers:', JSON.stringify(req.headers, null, 2));
                this.logger.error('Request URL:', req.url);
                this.logger.error('Request method:', req.method);
                res.status(500).send('Error processing notification.');
            }
        } else {
            this.logger.info('Bad request: ', req.rawBody);
            res.status(400).send('Bad Request');
        }
    }
  

    handlePubSubVerification(req, res) {
        const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.topic': topic, 'hub.verify_token': verifyToken } = req.query;
        // Handle both 'subscribe' and 'unsubscribe' challenges as per PubSubHubbub spec
        if (mode === 'subscribe' || mode === 'unsubscribe') {
            // Verify the hub.verify_token if it was sent with the request
            if (this.PSH_VERIFY_TOKEN && verifyToken !== this.PSH_VERIFY_TOKEN) {
                this.logger.warn(`Subscription challenge rejected due to hub.verify_token mismatch.`);
                return res.status(403).send('Forbidden');
            }
            // Respond with the challenge string to confirm the subscription
            res.status(200).send(challenge);
            this.logger.info(`Successfully responded to PubSubHubbub challenge for topic: ${topic}`);
        } else {
            this.logger.info('Bad request: ', req.rawBody);
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
        this.startPeriodicCleanup();

        let webhookPath = '/webhook/youtube';
        if (this.PSH_CALLBACK_URL) {
            try {
                webhookPath = new URL(this.PSH_CALLBACK_URL).pathname;
                this.logger.info(`Webhook listener configured for path: ${webhookPath}`);
            } catch (error) {
                this.logger.error(`Invalid PSH_CALLBACK_URL. Using default path.`, error);
            }
        }

        // Middleware to get raw body for signature verification for the webhook path
        this.app.use(webhookPath, express.text({
            type: 'application/atom+xml',
            verify: (req, res, buf) => {
                req.rawBody = buf;
            }
        }));

        this.app.get(webhookPath, (req, res) => this.handlePubSubVerification(req, res));
        this.app.post(webhookPath, (req, res) => this.handlePubSubNotification(req, res));

        this.subscribeToYouTubePubSubHubbub();
    }

    cleanupAnnouncedVideosIfNeeded() {
        if (this.announcedVideos.size > this.MAX_ANNOUNCED_VIDEOS) {
            // Convert Set to Array, keep only the most recent 80% of entries
            const videosArray = Array.from(this.announcedVideos);
            const keepCount = Math.floor(this.MAX_ANNOUNCED_VIDEOS * 0.8);
            const videosToKeep = videosArray.slice(-keepCount);
            
            this.announcedVideos.clear();
            videosToKeep.forEach(videoId => this.announcedVideos.add(videoId));
            
            this.logger.info(`[YouTube Monitor] Cleaned up announced videos memory. Kept ${videosToKeep.length} of ${videosArray.length} entries.`);
        }
    }

    startPeriodicCleanup() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        
        this.cleanupTimer = setInterval(() => {
            this.cleanupAnnouncedVideosIfNeeded();
        }, this.CLEANUP_INTERVAL);
        
        this.logger.info('[YouTube Monitor] Started periodic memory cleanup timer.');
    }

    stopPeriodicCleanup() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
            this.logger.info('[YouTube Monitor] Stopped periodic memory cleanup timer.');
        }
    }

    resetState() {
        this.announcedVideos.clear();
        this.stopPeriodicCleanup();
        this.logger.info('[YouTube Monitor] State reset.');
    }
}

export default YouTubeMonitor;
