# **Discord Content Announcement Bot**

This is a Node.js bot designed to automatically announce new video uploads and livestream starts from a specified YouTube channel and new posts from a specified X (formerly Twitter) profile to designated Discord text channels. It leverages YouTube's PubSubHubbub protocol for efficient, push-based notifications and Playwright for X scraping.

## **Features**

* **YouTube Activity Monitoring:** Watches a designated YouTube channel for *new* video uploads and livestreams using PubSubHubbub.
* **X (Twitter) Activity Monitoring:** Watches a designated X profile for *new* posts, replies, quotes, and retweets using scraping.
* **Discord Announcements:** Sends formatted messages to specified Discord text channels when new content is detected.
*   **New Content Filtering:** Only announces content (YouTube and X) created or published *after* the bot was started.
* **PubSubHubbub Integration:** Utilizes YouTube's PubSubHubbub (Atom/RSS feeds) for real-time notifications.
* **Webhook Signature Verification:** Verifies incoming PubSubHubbub notifications using X-Hub-Signature to ensure their authenticity and integrity.
* **Subscription Auto-Renewal:** Automatically renews the YouTube PubSubHubbub subscription.
*   **Message Control Commands:** Allows control of the bot's posting behavior via prefix-based commands in a designated support channel.
* **Comprehensive Logging:** Employs the winston logging library for detailed logging to both the console and daily rotating files.
## **Prerequisites**

Before running the bot, ensure you have the following:

* **Node.js (v16.x or higher recommended):** Download from [nodejs.org](https://nodejs.org/).  
* **npm (Node Package Manager):** Comes with Node.js.  
* **A Discord Account:** To create and manage your bot.  
* **A Google Cloud Project:** To enable the YouTube Data API v3 and get an API Key.  
* **A Publicly Accessible URL:** Your bot's server needs to be reachable from the internet for YouTube's PubSubHubbub hub to send notifications. This typically requires hosting on a VPS, cloud platform (e.g., Heroku, Railway, Render), or using a tunneling service like ngrok for local development.

## **Setup Instructions**

### **1. Project Initialization**

**1. Clone this repository:**  
```
git clone https://github.com/KUSH42/discord-youtube-bot.git
```

**2. Install dependencies:**  
```
npm install
```

### **2. Obtain API Keys and IDs**

#### **a) Discord Bot Token**

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).  
2. Click "New Application" and give it a name.  
3. Navigate to the "Bot" tab on the left sidebar.  
4. Click "Add Bot" and confirm.  
5. Under "TOKEN," click "Reset Token" and copy the token. **Keep this token secret!**  
6. Under "Privileged Gateway Intents," enable **MESSAGE CONTENT INTENT** (and PRESENCE INTENT if you want to add more features later).  
7. Go to "OAuth2" -> "URL Generator."  
8. Select the bot scope.  
9. Under "Bot Permissions," grant at least Send Messages and View Channels.  
10. Copy the generated URL and paste it into your browser to invite the bot to your Discord server.

#### **b) YouTube Data API Key**

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).  
2. Create a new project or select an existing one.  
3. Navigate to "APIs & Services" > "Enabled APIs & Services."  
4. Click "+ ENABLE APIS AND SERVICES" and search for "YouTube Data API v3." Enable it.  
5. Go to "APIs & Services" > "Credentials."  
6. Click "CREATE CREDENTIALS" > "API Key." Copy the generated key.

#### **c) YouTube Channel ID**

1. Go to the YouTube channel you want to monitor in your web browser.  
2. Look at the URL. If it's youtube.com/channel/YOUR_CHANNEL_ID, the ID is directly in the URL.  
3. If the URL is youtube.com/user/USERNAME or youtube.com/@CUSTOMNAME, view the page source (Ctrl+U or Cmd+U) and search for channelId. It will be in a <meta itemprop="channelId" content="UC..."> tag.

#### **d) Discord Announcement Channel ID**

1. Open your Discord client.  
2. Go to "User Settings" > "App Settings" > "Advanced."  
3. Enable "Developer Mode."  
4. Right-click on the specific text channel in your server where you want the announcements to appear.  
5. Click "Copy ID."

### **3. Configure Environment**

Create a new file named `.env` in your project's root directory and add the following variables, replacing the placeholder values with the actual keys and IDs you obtained:

```env
DISCORD_BOT_TOKEN=YOUR_DISCORD_BOT_TOKEN_HERE
DISCORD_BOT_SUPPORT_LOG_CHANNEL=YOUR_DISCORD_SUPPORT_CHANNEL_ID # ID of the channel for logs and control commands

# YouTube Monitoring Config
YOUTUBE_API_KEY=YOUR_GOOGLE_YOUTUBE_API_KEY_HERE # Still needed for initial channel info (for detail fetching)
YOUTUBE_CHANNEL_ID=YOUR_YOUTUBE_CHANNEL_ID_HERE
DISCORD_YOUTUBE_CHANNEL_ID=YOUR_DISCORD_YOUTUBE_CHANNEL_ID_HERE # Channel ID for YouTube announcements

# PubSubHubbub specific configurations
PSH_SECRET=a_very_long_and_random_secret_string_for_security_never_share # Use a strong, random string
PSH_CALLBACK_URL=https://your-public-domain.com/webhook/youtube # IMPORTANT: This MUST be publicly accessible! This is the URL YouTube's PubSubHubbub hub will send notifications to.
PSH_PORT=3000 # Port for the bot's web server (default is 3000) - Ensure your firewall and reverse proxy (if any) forward external traffic on your chosen webhook port to this internal port.
PSH_VERIFY_TOKEN=your_optional_verify_token # An optional token sent with the subscription request and echoed back in the challenge for verification

# X (Twitter) Monitoring Config
X_USER_HANDLE=YOUR_X_USER_HANDLE # The @handle of the X user to monitor (e.g., 'ItsTheEnforcer')
DISCORD_X_POSTS_CHANNEL_ID=YOUR_DISCORD_X_POSTS_CHANNEL_ID # Discord Channel ID for X original posts (optional)
DISCORD_X_REPLIES_CHANNEL_ID=YOUR_DISCORD_X_REPLIES_CHANNEL_ID # Discord Channel ID for X replies (optional)
DISCORD_X_QUOTES_CHANNEL_ID=YOUR_DISCORD_X_QUOTES_CHANNEL_ID # Discord Channel ID for X quote tweets (optional)
DISCORD_X_RETWEETS_CHANNEL_ID=YOUR_DISCORD_X_RETWEETS_CHANNEL_ID # Discord Channel ID for X retweets (optional)
TWITTER_USERNAME=YOUR_TWITTER_USERNAME # Required for automatic login and cookie refresh
TWITTER_PASSWORD=YOUR_TWITTER_PASSWORD # Required for automatic login and cookie refresh

# X (Twitter) Polling Interval (in milliseconds) - Only for X, YouTube uses PubSubHubbub
X_QUERY_INTERVALL_MIN=300000 # Minimum polling interval for X (default 5 minutes)
X_QUERY_INTERVALL_MAX=600000 # Maximum polling interval for X (default 10 minutes)

# Bot Control and Logging Configurations
COMMAND_PREFIX=! # Prefix for message commands in the support channel (default is !)
ALLOWED_USER_IDS=user_id_1,user_id_2 # Comma-separated list of Discord User IDs allowed to use the restart command
ANNOUNCEMENT_ENABLED=false # Controls if announcement posting is enabled on startup (true/false)
X_VX_TWITTER_CONVERSION=false # If true, converts x.com URLs to vxtwitter.com for better embeds
LOG_FILE_PATH=bot.log # Path to the log file (e.g., 'logs/bot.log')
LOG_LEVEL=info # Default log level: error, warn, info, verbose, debug, silly

# X (Twitter) Monitoring Config
# Whether to announce tweets older than the bot startup time (true/false). Defaults to false.
ANNOUNCE_OLD_TWEETS=false
```

### **4. Run the bot**

To run the bot as a systemd service, follow these steps:

   1.  Create a service file (e.g., `/etc/systemd/system/discord-youtube-bot.service`) with the following content (adjust paths and user accordingly):

```
[Unit]
Description=Discord Announcement Bot Service
After=network.target

[Service]
Type=simple
User=$USER  # Replace with your actual user
WorkingDirectory=~/discord-youtube-bot
Environment="DISPLAY=:99"  # Important for Xvfb
ExecStart=~/discord-youtube-bot/start-bot.sh
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

   2.  Make the script executable:

```bash
sudo chmod 755 ~/discord-youtube-bot/start-bot.sh
```

   3.  Reload systemd:

```bash
sudo systemctl daemon-reload
```

   4.  Enable the service:

```bash
sudo systemctl enable discord-youtube-bot.service
```

   5.  Start the service:

```bash
sudo systemctl start discord-youtube-bot.service
```

   6.  Check the status:

```bash
sudo systemctl status discord-youtube-bot.service
```

Alternatively, to run the bot directly from the command line:

```bash
node index.js
```


**Important Notes:**

*   Get your Discord Channel ID by enabling Developer Mode in Discord User Settings (Advanced) and right-clicking the channel.
*   Get your Discord User ID similarly by right-clicking on your username.

**Important Notes for PSH_CALLBACK_URL:** This **MUST** be publicly accessible! This is the URL YouTube's PubSubHubbub hub will send notifications to.

## **How it Works**

The bot monitors YouTube and X for new content and announces it in Discord. It includes control commands for management within a designated support channel.

### **YouTube Monitoring (PubSubHubbub)**

1. **Subscription:** When the bot starts (or performs a soft restart), it sends a subscription request to Google's PubSubHubbub hub for your specified YouTube channel. This request includes your bot's `PSH_CALLBACK_URL`.
2. **Verification:** The PubSubHubbub hub sends a GET request (a "challenge") to your `PSH_CALLBACK_URL`. Your bot's Express server endpoint (`/webhook/youtube` or your configured path) receives this challenge and responds with the `hub.challenge` string to confirm it's ready. The `PSH_VERIFY_TOKEN` (if set) is also checked.
3. **Notifications:** Once verified, whenever the YouTube channel uploads a new video or starts/ends a livestream, the PubSubHubbub hub sends an HTTP POST request to your `PSH_CALLBACK_URL` with an Atom feed XML payload.
4. **Signature Verification:** The bot verifies the `X-Hub-Signature` header using your `PSH_SECRET` to ensure authenticity.
5. **Processing & Filtering:** If the signature is valid, the bot parses the XML, extracts the video ID and published date, fetches additional details from the YouTube Data API (using your `YOUTUBE_API_KEY`), and **only** processes content published *after* the bot's current startup time.
6. **Announcement:** If the content is new and announcement posting (`isAnnouncementEnabled`) is enabled, the bot sends a formatted message to your designated Discord YouTube channel (`DISCORD_YOUTUBE_CHANNEL_ID`).
7. **Auto-Renewal:** The PubSubHubbub subscription is automatically renewed before it expires.

### **X (Twitter) Monitoring (Scraping)**

1. **Polling:** The bot periodically scrapes the specified X user's profile (`X_USER_HANDLE`) for recent posts based on the configured intervals (`X_QUERY_INTERVALL_MIN`, `X_QUERY_INTERVALL_MAX`).
2. **Filtering:** Scraped posts are checked against a list of already announced tweets (`knownTweetIds`). By default, only posts created *after* the bot's current startup time are considered new. This behavior can be changed with the `ANNOUNCE_OLD_TWEETS` environment variable.
3. **Announcement:** If a post is new (based on the filtering logic and the `ANNOUNCE_OLD_TWEETS` setting) and announcement posting (`isAnnouncementEnabled`) is enabled, the bot sends a formatted message to the designated Discord X channel(s) (`DISCORD_X_*_CHANNEL_ID`) based on the post type (original post, reply, quote, retweet).

### **Bot Control Commands (Message Based)**

These commands are used to manage the bot's operation and are only processed when sent in the channel specified by `DISCORD_BOT_SUPPORT_LOG_CHANNEL`. They are triggered by the `COMMAND_PREFIX` (default is `!`):

*   `!kill`: Stops *all* bot posting to Discord channels, including announcements and the support log.
*   `!restart`: Performs a soft restart of the bot. This command requires the user's ID to be listed in the `ALLOWED_USER_IDS` environment variable. The soft restart includes unsubscribing/resubscribing to PubSubHubbub, resetting known content lists, and re-enabling support log posting (announcement state is preserved).
*   `!announce <true|false>`: Toggles announcement posting to the YouTube and X announcement channels. `true` enables announcements, `false` disables them. The initial state is set by `ANNOUNCEMENT_ENABLED` in the `.env` file.
*   `!vxtwitter <true|false>`: Toggles the conversion of `x.com` URLs to `vxtwitter.com` for improved Discord embeds. The initial state is set by `X_VX_TWITTER_CONVERSION`.
*   `!loglevel <level>`: Changes the bot's logging level at runtime. Valid levels are: `error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly`.
*   `!readme`: Displays this command information within the support channel.

## **Troubleshooting**

*   **`listen EADDRINUSE` error:** This means the port specified in `PSH_PORT` is already in use. Ensure no other process is using this port or change the `PSH_PORT` in your `.env`.
*   **Nginx/Reverse Proxy Configuration:** If deployed to a VPS/cloud, ensure your reverse proxy (e.g., Nginx) is correctly configured to forward requests to your bot's `PSH_PORT` and `webhookPath`. Common issues include:
    *   Nginx not running (`sudo systemctl status nginx`).
    *   Incorrect `ssl_certificate` or `ssl_certificate_key` paths in Nginx config (check `sudo nginx -t`).
    *   Server firewall blocking relevant ports (e.g., 443 inbound for HTTPS, `PSH_PORT` internally). Use `sudo ufw status verbose` or `sudo firewall-cmd --list-all` to check.
*   **Command not working:**
    *   Ensure you are using the correct `COMMAND_PREFIX` (default is `!`) at the beginning of your message in the support channel.
    *   Verify that you are using the commands in the channel specified by `DISCORD_BOT_SUPPORT_LOG_CHANNEL`.
    *   Check the bot's logs for messages indicating command attempts or errors (`[INFO]` or `[WARN]` messages related to commands).
    *   For the `!restart` command, ensure your Discord user ID is correctly listed in the comma-separated `ALLOWED_USER_IDS` environment variable.
    *   Ensure the bot has the "Message Content Intent" enabled in the Discord Developer Portal.

*   **No YouTube announcements:**
    *   **Check logs:** Look at the console output or the log files (`bot.log`) for errors related to YouTube or PubSubHubbub.
    *   **`PSH_CALLBACK_URL`:** This is crucial. Ensure it's correct and *publicly accessible* from the internet. If testing locally, is your ngrok tunnel active and pointing to the correct port? YouTube's hub must be able to reach this URL.
    *   **`YOUTUBE_API_KEY`:** Ensure your YouTube Data API Key is correct and that the "YouTube Data API v3" is enabled for your Google Cloud project.
    *   **`YOUTUBE_CHANNEL_ID`:** Verify that the channel ID is correct.
    *   **`DISCORD_YOUTUBE_CHANNEL_ID`:** Confirm the Discord channel ID is correct and that the bot has permissions to send messages there.
    *   **`PSH_SECRET`:** Ensure the `PSH_SECRET` in your `.env` matches what you are using. If signature verification fails, notifications will be rejected.
    *   **Subscription Status:** Check your logs to see if the `Attempting to subscribe to PubSubHubbub...` and `PubSubHubbub subscription request sent successfully.` messages appear after the bot starts or restarts.
    *   **Old Content Filtering:** Remember that only content published *after* the bot's last startup will be announced. Check the logs for messages indicating old content was skipped (`Skipping announcement for old YouTube content...`).
    *   **Announcement Toggle:** Ensure announcement posting is enabled using the `!announce true` command if it was previously disabled.

*   **No X (Twitter) announcements:**
    *   **Check logs:** Look for errors related to the X scraper (`[X Scraper]`).
    *   **`X_USER_HANDLE`:** Verify the X user handle is correct.
    *   **Discord Channel IDs:** Ensure the `DISCORD_X_*_CHANNEL_ID` variables are set correctly and the bot has permissions to post in those channels.
    *   **`TWITTER_AUTH_COOKIES`:** If the profile is protected or scraping is inconsistent, ensure your authentication cookies are valid and correctly formatted in the `.env` file.
    *   **Old Content Filtering:** Similar to YouTube, only tweets posted *after* the bot's last startup will be announced. Check the logs for messages indicating old content was skipped (`Skipping old tweet...`).
    *   **Announcement Toggle:** Ensure announcement posting is enabled using the `!announce true` command if it was previously disabled.


*Feel free to contribute, open issues, or suggest improvements!*
