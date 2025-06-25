# **Discord YouTube Announcement Bot**

This is a Node.js bot designed to automatically announce new video uploads and livestream starts from a specified YouTube channel to a Discord text channel. It leverages YouTube's PubSubHubbub protocol for efficient, push-based notifications, eliminating the need for constant polling.

## **Features**

*   **YouTube Activity Monitoring:** Watches a designated YouTube channel for new video uploads and livestreams.
*   **Discord Announcements:** Sends formatted messages to a specified Discord text channel when new content is detected.
*   **PubSubHubbub Integration:** Utilizes YouTube's PubSubHubbub (Atom/RSS feeds) for real-time notifications, reducing API quota usage compared to polling.
*   **Webhook Signature Verification:** Verifies incoming PubSubHubbub notifications using X-Hub-Signature to ensure their authenticity and integrity.
*   **Subscription Auto-Renewal:** Automatically renews the PubSubHubbub subscription before it expires, ensuring continuous monitoring without manual intervention.
*   **Comprehensive Logging:** Employs the `winston` logging library to output detailed logs to both the console and daily rotating files, aiding in monitoring and debugging.

## **Prerequisites**

Before running the bot, ensure you have the following:

*   **Node.js (v18.x or higher recommended):** Download from [nodejs.org](https://nodejs.org/ "null"). Version 18+ includes a native `fetch` API, which simplifies setup.
*   **npm (Node Package Manager):** Comes with Node.js.
*   **A Discord Account:** To create and manage your bot.
*   **A Google Cloud Project:** To enable the YouTube Data API v3 and get an API Key.
*   **A Publicly Accessible URL:** Your bot's server needs to be reachable from the internet for YouTube's PubSubHubbub hub to send notifications. This typically requires hosting on a VPS, cloud platform, or using a tunneling service like ngrok for local development. For production, a reverse proxy like Nginx is highly recommended.

## **Setup Instructions**

### **1\. Project Initialization**

**1\. Clone this repository:**
```
git clone https://github.com/KUSH42/youtube-discord-bot.git
```

**2\. Install dependencies:**
```
cd youtube-discord-bot
npm install
```

### **2\. Obtain API Keys and IDs**

#### **a) Discord Bot Token**

1.  Go to the [Discord Developer Portal](https://discord.com/developers/applications "null").
2.  Click "New Application" and give it a name.
3.  Navigate to the "Bot" tab on the left sidebar.
4.  Click "Add Bot" and confirm.
5.  Under "TOKEN," click "Reset Token" and copy the token. **Keep this token secret!**
6.  Under "Privileged Gateway Intents," enable **MESSAGE CONTENT INTENT**.
7.  Go to "OAuth2" -> "URL Generator."
8.  Select the `bot` scope.
9.  Under "Bot Permissions," grant at least `Send Messages` and `View Channels`.
10.  Copy the generated URL and paste it into your browser to invite the bot to your Discord server.

#### **b) YouTube Data API Key**

1.  Go to the [Google Cloud Console](https://console.cloud.google.com/ "null").
2.  Create a new project or select an existing one.
3.  Navigate to "APIs & Services" > "Enabled APIs & Services."
4.  Click "+ ENABLE APIS AND SERVICES" and search for "YouTube Data API v3." Enable it.
5.  Go to "APIs & Services" > "Credentials."
6.  Click "CREATE CREDENTIALS" > "API Key." Copy the generated key.

#### **c) YouTube Channel ID**

1.  Go to the YouTube channel you want to monitor in your web browser.
2.  Look at the URL. If it's `youtube.com/channel/YOUR_CHANNEL_ID`, the ID is directly in the URL.
3.  If the URL is `youtube.com/user/USERNAME` or `youtube.com/@CUSTOMNAME`, view the page source (Ctrl+U or Cmd+U) and search for `channelId`. It will be in a `<meta itemprop="channelId" content="UC...">` tag.

#### **d) Discord Announcement Channel ID**

1.  Open your Discord client.
2.  Go to "User Settings" > "App Settings" > "Advanced."
3.  Enable "Developer Mode."
4.  Right-click on the specific text channel in your server where you want the announcements to appear.
5.  Click "Copy ID."

### **3\. Configure Environment Variables**

Create a new file named `.env` in your project's root directory and add the following variables, replacing the placeholder values with the actual keys and IDs you obtained:
```
DISCORD_BOT_TOKEN=YOUR_DISCORD_BOT_TOKEN_HERE
YOUTUBE_API_KEY=YOUR_GOOGLE_YOUTUBE_API_KEY_HERE
YOUTUBE_CHANNEL_ID=YOUR_YOUTUBE_CHANNEL_ID_HERE
DISCORD_ANNOUNCEMENT_CHANNEL_ID=YOUR_DISCORD_ANNOUNCEMENT_CHANNEL_ID_HERE

# PubSubHubbub Configurations
PSH_SECRET=a_very_long_and_random_secret_string_for_security_never_share # Use a strong, random string
PSH_CALLBACK_URL=https://your-public-domain.com/webhook/youtube # IMPORTANT: This MUST be publicly accessible!
PSH_PORT=3000 # Port for the bot's web server (default is 3000)
PSH_VERIFY_TOKEN=your_optional_verify_token # An optional token for subscription challenge verification

# Logging Configurations
LOG_FILE_PATH=bot.log # Path to the log file (e.g., 'logs/bot.log')
LOG_LEVEL=info # Log level: error, warn, info, verbose, debug, silly
```

**Important Notes for `PSH_CALLBACK_URL`:**

*   This URL must be publicly accessible from the internet.
*   **For local development:** You'll need a tunneling service like [ngrok](https://ngrok.com/ "null"). Run `ngrok http 3000` (if your `PSH_PORT` is 3000) and use the `https` URL ngrok provides (e.g., `https://abcdef.ngrok.io/webhook/youtube`). Remember ngrok URLs change with each session unless you have a paid account.
*   **For production deployment (VPS/Cloud):** You **must** set up a reverse proxy (e.g., Nginx) on your server to forward traffic from standard web ports (80/443) to your bot's internal `PSH_PORT`. Your `PSH_CALLBACK_URL` should then be your public domain (e.g., `https://your-domain.com/webhook/youtube`).

## **Running the Bot**

1.  Open your terminal or command prompt.
2.  Navigate to your bot's project directory.
3.  Start the bot:
    ```
    node index.js
    ```

The bot will log messages to your console and also create log files (e.g., `bot.log-YYYY-MM-DD.log`) in the directory specified by `LOG_FILE_PATH`.

## **How it Works (PubSubHubbub)**

1.  **Subscription:** When the bot starts, it sends a subscription request to Google's PubSubHubbub hub for your specified YouTube channel. This request includes your bot's `PSH_CALLBACK_URL`.
2.  **Verification:** The PubSubHubbub hub sends a **GET** request (a "challenge") to your `PSH_CALLBACK_URL`. Your bot's Express server endpoint (`/webhook/youtube`) receives this challenge and responds with the `hub.challenge` string to confirm it's ready to receive notifications. The `PSH_VERIFY_TOKEN` (if set) is also checked here.
3.  **Notifications:** Once verified, whenever the YouTube channel uploads a new video or starts/ends a livestream, the PubSubHubbub hub sends an HTTP **POST** request to your `PSH_CALLBACK_URL` with an Atom feed XML payload containing the update.
4.  **Signature Verification:** Upon receiving a notification, the bot verifies the `X-Hub-Signature` header using your `PSH_SECRET`. This ensures that the notification genuinely came from the PubSubHubbub hub and hasn't been tampered with.
5.  **Processing & Announcement:** If the signature is valid, the bot parses the XML, extracts the video ID, fetches additional details from the YouTube Data API (using your `YOUTUBE_API_KEY`) to determine if it's an upload or a livestream, and then sends an appropriate announcement message to your Discord channel.
6.  **Auto-Renewal:** A timer is set after a successful subscription. Before the lease expires (e.g., 1 hour before the 10-day lease ends), the `subscribeToYouTubePubSubHubbub` function is called again to renew the subscription, ensuring continuous operation.

## **Troubleshooting**

*   **Bot not coming online in Discord:**
    *   Double-check your `DISCORD_BOT_TOKEN` in the `.env` file.
    *   Ensure your bot has the correct [Gateway Intents](https://discord.com/developers/docs/topics/gateway#privileged-intents "null") enabled in the Discord Developer Portal (especially "Message Content Intent").
    *   Verify the bot has been invited to your Discord server with the necessary permissions (`Send Messages`, `View Channels`).
*   **`Error: listen EADDRINUSE: address already in use :::3000`:**
    *   This means another instance of your bot (or another program) is already using port `3000`.
    *   **Solution:** Kill any previous Node.js processes. Use `sudo killall node` or find the PID with `sudo netstat -tulnp | grep 3000` and then `sudo kill -9 <PID>`.
*   **`TypeError: fetch is not a function`:**
    *   This often indicates an issue with `node-fetch` or your Node.js version.
    *   **Solution:**
        1.  Ensure you're running **Node.js v18 or higher** (recommended, as it has a native `fetch`). Check your version with `node -v`.
        2.  Perform a clean reinstallation of Node modules:
            ```
            npm cache clean --force
            rm -rf node_modules package-lock.json
            npm install
            ```
            Then restart your bot.
*   **No YouTube announcements:**
    *   **Check bot logs:** Look at the console output or the `bot.log` files for errors.
    *   **`PSH_CALLBACK_URL`:** This is a common issue. Ensure it's correct and _publicly accessible_ from the internet. If testing locally, is your ngrok tunnel active and pointing to the correct port?
    *   **Nginx/Reverse Proxy Configuration:** If deployed to a VPS/cloud, ensure your reverse proxy (e.g., Nginx) is correctly configured to forward requests from `https://your-domain.com/webhook/youtube` to `http://localhost:3000/webhook/youtube`. Common issues include:
        *   Nginx not running (`sudo systemctl status nginx`).
        *   Incorrect `ssl_certificate` or `ssl_certificate_key` paths in Nginx config (check `sudo nginx -t`).
        *   Server firewall blocking port 443 inbound (from Cloudflare) or port 3000 internally (from Nginx to Node.js). Use `sudo ufw status verbose` or `sudo firewall-cmd --list-all` to check. Pay attention to `(13: Permission denied)` errors in Nginx logs, which can point to SELinux.
    *   **`YOUTUBE_API_KEY`:** Ensure your YouTube Data API Key is correct and that the "YouTube Data API v3" is enabled for your Google Cloud project.
    *   **`YOUTUBE_CHANNEL_ID`:** Verify that the channel ID is correct.
    *   **`DISCORD_ANNOUNCEMENT_CHANNEL_ID`:** Confirm the Discord channel ID is correct and that the bot has permissions to send messages there.
    *   **`PSH_SECRET`:** Ensure the `PSH_SECRET` in your `.env` matches what you are using (and that it's a strong, random string). If signature verification fails, notifications will be rejected.
    *   **Subscription Status:** Check your logs to see if the `PubSubHubbub subscription request sent successfully.` message appears. If not, there's an issue with the subscription process itself.
*   **`X-Hub-Signature mismatch!` errors:**
    *   This indicates a problem with `PSH_SECRET` or how the raw body is being processed.
    *   Ensure `PSH_SECRET` is exactly the same on both your bot and what you registered with the PubSubHubbub hub.
    *   If this happens often, try resetting your `PSH_SECRET` to a new, strong string.

Feel free to contribute, open issues, or suggest improvements!