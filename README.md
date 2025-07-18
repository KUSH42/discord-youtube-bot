
# Discord Content Announcement Bot

![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/KUSH42/discord-youtube-bot/test.yml?branch=main&style=for-the-badge)
![Codecov](https://img.shields.io/codecov/c/github/KUSH42/discord-youtube-bot?style=for-the-badge&token=YOUR_CODECOV_TOKEN_IF_PRIVATE)
![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen?style=for-the-badge)
![Discord.js](https://img.shields.io/badge/discord.js-v14-7289DA?style=for-the-badge)
![License](https://img.shields.io/github/license/KUSH42/discord-youtube-bot?style=for-the-badge)

A robust, production-ready Discord bot for real-time content announcements from YouTube and X (formerly Twitter), built with Clean Architecture and a comprehensive testing suite.

## Overview

This Node.js bot monitors designated YouTube channels and X profiles, delivering real-time content announcements to your Discord channels. It is engineered for reliability, security, and extensibility, featuring a sophisticated fallback system for YouTube notifications, persistent duplicate detection, and secure credential management.

The project is designed with a clear separation of concerns, making it easy for developers (and AI agents) to maintain, test, and extend.

## Key Features

- **📺 Content Monitoring**
    - **Real-time YouTube Notifications**: Uses PubSubHubbub for instant upload and livestream announcements.
    - **Intelligent Fallback System**: Automatically switches to API polling if PubSubHubbub fails, ensuring no content is missed.
    - **X (Twitter) Scraping**: Monitors profiles for new posts, replies, quotes, and retweets.
    - **Persistent Duplicate Detection**: Scans channel history on startup to prevent re-announcing content across restarts.
    - **Advanced Retweet Classification**: Uses multiple strategies to accurately identify and route retweets.

- **🛡️ Security & Reliability**
    - **Credential Encryption**: Securely stores API keys and passwords using `.envx` encryption.
    - **Webhook Signature Verification**: Cryptographically validates incoming YouTube notifications.
    - **Rate Limiting**: Protects the bot from abuse on commands and webhooks.
    - **Configuration Validation**: Ensures all required configurations are present on startup.

- **🏗️ Architecture & Extensibility**
    - **Clean Architecture**: A modular design separating application, core logic, and infrastructure.
    - **Dependency Injection**: Manages services through a centralized container for easy mocking and maintenance.
    - **Event-Driven**: Decoupled components communicate via an event bus.

- **⚙️ Management & Monitoring**
    - **Discord Bot Commands**: Full control over the bot via chat commands.
    - **Health Check Endpoints**: HTTP endpoints for external monitoring (`/health`, `/ready`).
    - **Comprehensive Logging**: Rotates log files and can mirror logs to a Discord channel.

## Architecture

The bot follows clean architecture principles to ensure a clear separation of concerns, high testability, and maintainability.

```bash
src/
├── 🎯 application/           # Application layer (e.g., orchestrators)
├── 💼 core/                  # Business logic layer (e.g., command processing)
├── 🏗️ infrastructure/        # Foundation layer (e.g., config, DI container)
├── 🔧 services/              # External service layer (e.g., Discord, YouTube clients)
├── ⚙️ setup/                 # Production dependency wiring
└── 🛠️ utilities/             # Shared utilities (e.g., logger, validator)
```

## Getting Started (Quick Start)

Follow these steps to get the bot running quickly for local development.

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/KUSH42/discord-youtube-bot.git
    cd discord-youtube-bot
    ```

2.  **Install dependencies:**
    ```sh
    npm install
    ```

3.  **Create a configuration file:**
    ```sh
    cp .env.example .env
    ```

4.  **Fill in the `.env` file** with your API keys and channel IDs. See the [Configuration](#-configuration) and [Detailed Setup](#-detailed-setup-guide) sections for more details.

5.  **Start the bot:**
    ```sh
    npm start
    ```

## Detailed Setup Guide

### Prerequisites

-   [Node.js](https://nodejs.org/) (v16.x or higher)
-   A publicly accessible URL for YouTube's webhook (e.g., from a VPS or using [ngrok](https://ngrok.com/) for local testing).

### API Keys & Credentials

You'll need the following credentials:

-   **Discord Bot Token**:
    1.  Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create a new application.
    2.  Navigate to the "Bot" tab, click "Add Bot", and copy the **token**.
    3.  Enable the **Message Content Intent** under "Privileged Gateway Intents".
    4.  Generate an invite link from the "OAuth2" -> "URL Generator" tab with the `bot` scope and necessary permissions (e.g., `Send Messages`, `Read Message History`).
-   **YouTube Data API Key**:
    1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
    2.  Create or select a project and enable the **YouTube Data API v3**.
    3.  Create an **API Key** from the "Credentials" page.
-   **Discord Channel & User IDs**:
    1.  Enable Developer Mode in Discord (User Settings → Advanced).
    2.  Right-click on a channel or user and select "Copy ID".

### Secure Configuration (Recommended)

For production or secure environments, encrypt your credentials:

```sh
npm run setup-encryption
```

This interactive script will prompt you for sensitive values, encrypt them, and generate a `.env.keys` file. **Do not commit `.env.keys` to version control.** The bot will automatically decrypt the values at runtime when started with `npm run decrypt`.

## Configuration

All configuration is managed through the `.env` file.

| Variable                          | Description                                                                 | Required | Default            |
| --------------------------------- | --------------------------------------------------------------------------- | -------- | ------------------ |
| `DISCORD_BOT_TOKEN`               | Your Discord bot's token.                                                   | **Yes**  |                    |
| `DISCORD_BOT_SUPPORT_LOG_CHANNEL` | Channel ID for bot logs and health status commands.                         | **Yes**  |                    |
| `DISCORD_YOUTUBE_CHANNEL_ID`      | Channel ID for YouTube video announcements.                                 | **Yes**  |                    |
| `DISCORD_X_POSTS_CHANNEL_ID`      | Channel ID for X (Twitter) post announcements.                              | **Yes**  |                    |
| `DISCORD_X_REPLIES_CHANNEL_ID`    | Channel ID for X reply announcements.                                       | No       |                    |
| `DISCORD_X_QUOTES_CHANNEL_ID`     | Channel ID for X quote announcements.                                       | No       |                    |
| `DISCORD_X_RETWEETS_CHANNEL_ID`   | Channel ID for X retweet announcements.                                     | No       |                    |
| `YOUTUBE_API_KEY`                 | Your Google Cloud YouTube Data API v3 key.                                  | **Yes**  |                    |
| `YOUTUBE_CHANNEL_ID`              | The ID of the YouTube channel to monitor.                                   | **Yes**  |                    |
| `PSH_SECRET`                      | A strong, secret string for verifying PubSubHubbub webhooks.                | **Yes**  |                    |
| `PSH_CALLBACK_URL`                | The public URL of your bot's webhook endpoint.                              | **Yes**  |                    |
| `PSH_PORT`                        | The port for the webhook server to listen on.                               | No       | `3000`             |
| `X_USER_HANDLE`                   | The handle of the X user to monitor.                                        | **Yes**  |                    |
| `TWITTER_USERNAME`                | The username of the X account used for scraping.                            | **Yes**  |                    |
| `TWITTER_PASSWORD`                | The password for the scraping account.                                      | **Yes**  |                    |
| `ALLOWED_USER_IDS`                | Comma-separated list of Discord user IDs authorized for admin commands.     | **Yes**  |                    |
| `COMMAND_PREFIX`                  | The prefix for bot commands.                                                | No       | `!`                |
| `LOG_LEVEL`                       | Logging level (`info`, `debug`, `warn`, `error`).                           | No       | `info`             |
| `LOG_FILE_PATH`                   | Path to the log file.                                                       | No       | `bot.log`          |
| `ANNOUNCEMENT_ENABLED`            | Master toggle for all announcements.                                        | No       | `false`            |
| `X_VX_TWITTER_CONVERSION`         | Automatically convert `twitter.com` links to `vxtwitter.com`.               | No       | `false`            |
| `SYSTEMD_SERVICE_NAME`            | The name of the `systemd` service for the `!update` command.                | No       | `discord-bot.service` |

## Usage

### Running the Bot

-   **Standard start**: Validates configuration and starts the bot.
    ```sh
    npm start
    ```
-   **Start with encrypted credentials**:
    ```sh
    npm run decrypt
    ```

### Bot Commands

Commands are used in the channel specified by `DISCORD_BOT_SUPPORT_LOG_CHANNEL`.

| Command                  | Description                                                              | Authorization      |
| ------------------------ | ------------------------------------------------------------------------ | ------------------ |
| `!health`                | Shows a summary of the bot's health and status.                          | Anyone             |
| `!health-detailed`       | Shows a detailed breakdown of each component's status.                   | Anyone             |
| `!announce <true/false>` | Toggles all content announcements on or off.                             | Anyone             |
| `!vxtwitter <true/false>`| Toggles automatic `twitter.com` to `vxtwitter.com` URL conversion.       | Anyone             |
| `!loglevel <level>`      | Changes the logging level (`info`, `debug`, `warn`, `error`).            | Anyone             |
| `!readme`                | Displays a summary of available commands.                                | Anyone             |
| `!restart`               | Restarts the bot process, reloading all configurations.                  | Authorized Users   |
| `!update`                | Pulls the latest changes from git, installs dependencies, and restarts.  | Authorized Users   |
| `!kill`                  | Immediately stops all announcement-posting activities.                   | Authorized Users   |

## Deployment (Production)

For production, it is recommended to run the bot as a `systemd` service for automatic restarts and process management.

1.  **Create a service file** at `/etc/systemd/system/discord-bot.service`:
    ```ini
    [Unit]
    Description=Discord Content Announcement Bot
    After=network.target

    [Service]
    Type=simple
    # Replace 'your_bot_user' with the user the bot runs as
    User=your_bot_user
    # The start-bot.sh script handles finding the correct Node.js path
    ExecStart=/home/your_bot_user/discord-youtube-bot/start-bot.sh
    Restart=on-failure
    RestartSec=10s
    StandardOutput=syslog
    StandardError=syslog

    [Install]
    WantedBy=multi-user.target
    ```

2.  **Enable and start the service:**
    ```sh
    sudo systemctl daemon-reload
    sudo systemctl enable discord-bot.service
    sudo systemctl start discord-bot.service
    ```

3.  **Sudo Permissions for `!update` command (Optional):**
    To allow the `!update` command to restart the service, grant the bot's user passwordless `sudo` access. Run `sudo visudo` and add this line, replacing `your_bot_user` and the service name:
    ```
    your_bot_user ALL=(ALL) NOPASSWD: /bin/systemctl restart discord-bot.service
    ```

## Testing & Quality Assurance

This project is committed to high quality through a comprehensive and automated testing strategy. We maintain a suite of over 350 tests, including unit, integration, end-to-end (E2E), performance, and security tests.

Our testing philosophy emphasizes fast feedback, high confidence in critical paths, and maintainability. All tests are executed automatically on every push and pull request via GitHub Actions.

-   **Run all tests locally:**
    ```sh
    npm test
    ```
-   **Generate a coverage report:**
    ```sh
    npm run test:coverage
    ```

> For a complete guide to our testing architecture, CI/CD pipeline, code conventions, and instructions for contributing tests, please see the **[Testing README](./tests/README.md)**.

## Monitoring & Health

-   **HTTP Endpoints**:
    -   `GET /health`: Basic health status.
    -   `GET /health/detailed`: Detailed status of all internal components.
    -   `GET /ready`: Kubernetes-style readiness probe.
-   **Discord Commands**: Use `!health` and `!health-detailed` for real-time status updates in Discord.

## Troubleshooting

-   **`listen EADDRINUSE` Error**: The `PSH_PORT` is already in use by another application. Change the port or stop the conflicting process.
-   **No YouTube Announcements**: Ensure `PSH_CALLBACK_URL` is public and reachable. Verify your API key and check bot logs for any subscription errors.
-   **No X Announcements**: Double-check your X account credentials and ensure they are not locked or requiring a CAPTCHA. Review logs for scraping errors.
-   **Commands Not Working**: Confirm you are using the correct `COMMAND_PREFIX` in the designated support channel. Ensure your user ID is in `ALLOWED_USER_IDS` for admin commands.

## Contributing

Contributions are welcome! Please fork the repository, create a feature branch, and submit a pull request with a clear description of your changes. Ensure all tests pass before submitting.

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.
