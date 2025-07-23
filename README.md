
# Discord Content Announcement Bot

![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/KUSH42/discord-bot/test.yml?branch=master&style=for-the-badge)
![Codecov](https://img.shields.io/codecov/c/github/KUSH42/discord-bot?style=for-the-badge)
![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=for-the-badge)
![Discord.js](https://img.shields.io/badge/discord.js-v14-7289DA?style=for-the-badge)
![License](https://img.shields.io/github/license/KUSH42/discord-bot?style=for-the-badge)

A robust, production-ready Discord bot for real-time content announcements from YouTube and X (formerly Twitter), built with Clean Architecture and a comprehensive testing suite.

## Overview

This Node.js bot monitors designated YouTube channels and X profiles, delivering real-time content announcements to your Discord channels. It is engineered for reliability, security, and extensibility, featuring a sophisticated fallback system for YouTube notifications, persistent duplicate detection, and secure credential management.

The project is designed with a clear separation of concerns, making it easy for developers (and AI agents) to maintain, test, and extend.

## Key Features

- **📺 Content Monitoring**
    - **Real-time YouTube Notifications**: Uses PubSubHubbub for instant upload and livestream announcements.
    - **Intelligent Fallback System**: Automatically switches to API polling if PubSubHubbub fails, ensuring no content is missed.
    - **YouTube Web Scraping**: Near-instantaneous content detection (15-second polling) using Playwright for backup monitoring.
    - **Multi-Source Detection with Priority**: Webhook notifications override API polling, which overrides scraper detection for optimal reliability.
    - **Livestream State Management**: Tracks scheduled → live → ended transitions with proper announcement timing.
    - **Enhanced Content Fingerprinting**: Advanced duplicate detection using title normalization and timestamp precision, preventing duplicates even with URL variations.
    - **Persistent Content State**: Content states survive bot restarts with file-based storage and automatic cleanup.
    - **Race Condition Prevention**: ContentCoordinator ensures same content from multiple sources doesn't cause duplicate announcements.
    - **X (Twitter) Scraping**: Monitors profiles for new posts, replies, quotes, and retweets with enhanced authentication.
    - **Persistent Duplicate Detection**: Scans channel history on startup to prevent re-announcing content across restarts.
    - **Advanced Retweet Classification**: Uses multiple strategies to accurately identify and route retweets.

- **🛡️ Security & Reliability**
    - **Credential Encryption**: Securely stores API keys and passwords using `.envx` encryption.
    - **Webhook Signature Verification**: Cryptographically validates incoming YouTube notifications.
    - **Advanced Rate Limiting**: Modern event-driven Discord API rate limiting with burst allowances, 429 error handling, and exponential backoff.
    - **Event-Driven Message Processing**: Replaces infinite-loop architecture with EventEmitter patterns for better testing and reliability.
    - **Queue Management**: Priority-based message queue with deterministic test execution and graceful degradation.
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
├── 💼 core/                  # Business logic layer
│   ├── command-processor.js  # Discord command processing
│   ├── content-announcer.js  # Content announcement formatting and routing
│   ├── content-classifier.js # Content type classification and validation
│   ├── content-coordinator.js # Multi-source content coordination with race condition prevention (100% test coverage)
│   ├── content-state-manager.js # Unified content state management and persistence (100% test coverage)
│   └── livestream-state-machine.js # Livestream transition tracking (scheduled → live → ended) (95% test coverage)
├── 🏗️ infrastructure/        # Foundation layer
│   ├── configuration.js      # Environment configuration management  
│   ├── dependency-container.js # Dependency injection container
│   ├── event-bus.js          # Event-driven communication
│   ├── persistent-storage.js # File-based content state and fingerprint storage
│   └── state-manager.js      # Runtime state management
├── 🔧 services/              # External service layer (e.g., Discord, YouTube clients)
├── ⚙️ config/                # Configuration modules
│   └── content-detection.js  # Content detection reliability configuration
├── ⚙️ setup/                 # Production dependency wiring
└── 🛠️ utilities/             # Shared utilities (e.g., logger, validator)
```

## YouTube Content Detection Reliability

The bot features a sophisticated multi-layered system for reliable YouTube content detection, designed to prevent missed content and eliminate duplicate announcements.

### Content Detection Sources & Priority

The system uses **Source Priority** to handle the same content being detected by multiple systems:

1. **🔗 Webhooks** (Highest Priority) - Real-time PubSubHubbub push notifications from YouTube
2. **📡 API Polling** (Medium Priority) - Direct YouTube Data API v3 queries  
3. **🕷️ Web Scraping** (Lowest Priority) - Playwright-based fallback scraping

When the same video is detected by multiple sources, the higher priority source wins, ensuring the most reliable data is used while preventing duplicate announcements.

### Enhanced Content State Management

- **Unified State Tracking**: Single source of truth for all content states, replacing previous dual-logic inconsistencies
- **Persistent Storage**: Content states survive bot restarts with automatic cleanup of old entries
- **Livestream Transitions**: Proper tracking of `scheduled → live → ended → published` state changes with appropriate announcements

### Advanced Duplicate Detection

- **Content Fingerprinting**: Uses normalized titles and timestamp precision to detect duplicates even when URLs vary
- **URL Normalization**: Handles different YouTube URL formats (`youtu.be`, `youtube.com`, query parameters)
- **Cross-Restart Persistence**: Duplicate detection data survives bot restarts
- **Memory Management**: Automatic cleanup prevents memory bloat in long-running instances

### Race Condition Prevention

The **ContentCoordinator** prevents issues when multiple detection systems find the same content simultaneously:

- **Processing Locks**: Ensures same content isn't processed multiple times concurrently
- **Source Coordination**: Manages conflicts between webhook, API, and scraper detections
- **Unified Processing**: Single pipeline for all content regardless of detection source

### Configuration

All reliability features are configurable through environment variables (see [Configuration](#-configuration) section):

- `MAX_CONTENT_AGE_HOURS=2` - Only announce content newer than 2 hours
- `ENABLE_CONTENT_FINGERPRINTING=true` - Enable advanced duplicate detection
- `ENABLE_LIVESTREAM_MONITORING=true` - Enable livestream state tracking
- `CONTENT_STORAGE_DIR=data` - Directory for persistent storage

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
| `WEBHOOK_DEBUG_LOGGING`           | Enable detailed webhook debugging logs for PubSubHubbub troubleshooting.    | No       | `false`            |
| `SYSTEMD_SERVICE_NAME`            | The name of the `systemd` service for the `!update` command.                | No       | `discord-bot.service` |
| `YOUTUBE_SCRAPER_INTERVAL_MS`     | YouTube web scraper polling interval in milliseconds.                       | No       | `15000` (15 sec)   |
| `YOUTUBE_SCRAPER_MAX_RETRIES`     | Maximum retry attempts for YouTube scraper failures.                        | No       | `3`                |
| `YOUTUBE_SCRAPER_TIMEOUT_MS`      | Timeout for YouTube scraper page operations in milliseconds.                | No       | `30000` (30 sec)   |
| `X_DEBUG_SAMPLING_RATE`           | Sampling rate for debug logs to reduce Discord spam (0.0-1.0).              | No       | `0.1` (10%)        |
| `X_VERBOSE_LOG_SAMPLING_RATE`     | Sampling rate for verbose logs to reduce Discord spam (0.0-1.0).            | No       | `0.05` (5%)        |
| `DISCORD_BASE_SEND_DELAY`         | Base delay between Discord message sends in milliseconds.                   | No       | `2000` (2 sec)     |
| `DISCORD_BURST_ALLOWANCE`         | Number of quick Discord messages allowed per burst period.                  | No       | `2`                |
| `DISCORD_MAX_BUFFER_SIZE`         | Maximum Discord log message buffer size before flushing.                    | No       | `30`               |
| **Content Detection Reliability** |                                                                              |          |                    |
| `MAX_CONTENT_AGE_HOURS`           | Maximum age in hours for content to be considered "new" and announced.       | No       | `2`                |
| `ENABLE_CONTENT_FINGERPRINTING`   | Enable enhanced duplicate detection using content fingerprinting.            | No       | `true`             |
| `ENABLE_LIVESTREAM_MONITORING`    | Enable scheduled livestream state monitoring and transitions.                | No       | `true`             |
| `ENABLE_CROSS_VALIDATION`         | Enable cross-system content validation between detection sources.            | No       | `true`             |
| `CONTENT_STORAGE_DIR`             | Directory for persistent content state storage.                             | No       | `data`             |
| `DUPLICATE_CLEANUP_INTERVAL_HOURS`| Hours between duplicate detection cleanup operations.                        | No       | `168` (1 week)     |
| `LIVESTREAM_POLLING_INTERVAL_MS`  | Interval in milliseconds for polling scheduled livestream state changes.    | No       | `30000` (30 sec)   |
| `WEBHOOK_MAX_RETRIES`             | Maximum retry attempts for failed webhook processing.                       | No       | `3`                |
| `PROCESSING_LOCK_TIMEOUT_MS`      | Timeout in milliseconds for content processing locks to prevent deadlocks.  | No       | `30000` (30 sec)   |

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
    ExecStart=/home/your_bot_user/discord-youtube-bot/scripts/start-bot.sh
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

### Docker Deployment

The bot includes optimized Docker support with multi-stage builds for both development and production environments.

#### Quick Start with Docker

1. **Build and run the production image:**
   ```sh
   docker build -t discord-youtube-bot --target production .
   docker run -d --name bot --env-file .env -p 3000:3000 discord-youtube-bot
   ```

2. **Using Docker Compose (recommended):**
   ```yaml
   # docker-compose.yml
   version: '3.8'
   services:
     discord-bot:
       build:
         context: .
         target: production
       env_file: .env
       ports:
         - "3000:3000"
       restart: unless-stopped
       healthcheck:
         test: ["CMD", "node", "-e", "console.log('Health check passed')"]
         interval: 30s
         timeout: 10s
         retries: 3
   ```

#### Docker Image Optimization

The Docker setup uses a **3-stage multi-stage build** for optimal performance:

- **`dependencies`**: Production dependencies only (~100MB)
- **`test-runner`**: Full test environment with Playwright (~600MB)
- **`production`**: Minimal runtime image (~200MB)

**Performance Benefits:**
- **Build Speed**: 90% faster builds with layer caching
- **Image Size**: 70% smaller production images
- **Security**: Non-root user, minimal attack surface
- **CI/CD**: Intelligent caching reduces bandwidth by 95%

#### Docker Build Targets

```sh
# Production runtime (default)
docker build -t bot:prod --target production .

# Development with tests
docker build -t bot:test --target test-runner .

# Dependencies only
docker build -t bot:deps --target dependencies .
```

## Testing & Quality Assurance

This project is committed to high quality through a comprehensive and automated testing strategy. We maintain a suite of over 400 tests, including unit, integration, end-to-end (E2E), performance, and security tests.

Our testing philosophy emphasizes fast feedback, high confidence in critical paths, and maintainability. All tests are executed automatically on every push and pull request via GitHub Actions.

**Recent Testing Enhancements:**
- **Critical Component Coverage**: Achieved 95%+ test coverage for core content pipeline components (LivestreamStateMachine, ContentCoordinator, ContentStateManager)
- **Event-Driven Architecture**: Modern testing patterns for EventEmitter-based message processing
- **Deterministic Test Execution**: Eliminated hanging tests with proper async timer handling and test mode support
- **Clean Test Output**: Implemented global console mocking to eliminate false positive error logs during test execution
- **Rate Limiting Testing**: Comprehensive tests for burst allowances, 429 handling, and exponential backoff
- **Message Queue Testing**: Priority-based queuing, processing lifecycle, and graceful shutdown testing
- **Enhanced Duplicate Detection**: Comprehensive tests for content fingerprinting, URL normalization, and cross-restart persistence
- **Content State Management**: Tests for unified state tracking, livestream transitions, and persistent storage
- **Race Condition Prevention**: Tests for ContentCoordinator's processing locks and source priority handling
- **Comprehensive Command Testing**: Complete workflow tests for all Discord bot commands (!health, !announce, !restart, etc.)
- **YouTube Content Monitoring**: End-to-end tests for the complete YouTube announcement pipeline
- **Fallback Recovery**: Tests for YouTube API failure scenarios and recovery mechanisms

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
-   **No YouTube Announcements**: Ensure `PSH_CALLBACK_URL` is public and reachable. Verify your API key and check bot logs for any subscription errors. Enable `WEBHOOK_DEBUG_LOGGING=true` for detailed webhook diagnostics.
-   **Duplicate Announcements**: The enhanced duplicate detection should prevent this, but if it occurs, check the `data/` directory for proper content state persistence and verify `ENABLE_CONTENT_FINGERPRINTING=true`.
-   **Missing Livestream Transitions**: Ensure `ENABLE_LIVESTREAM_MONITORING=true` and check logs for livestream state polling activity. Verify `LIVESTREAM_POLLING_INTERVAL_MS` is appropriate for your needs.
-   **Content Too Old Errors**: Adjust `MAX_CONTENT_AGE_HOURS` if legitimate content is being rejected as too old. The default is 2 hours.
-   **Storage Issues**: If the bot can't write to the storage directory, ensure the `CONTENT_STORAGE_DIR` path is writable and has sufficient disk space.
-   **No X Announcements**: Double-check your X account credentials and ensure they are not locked or requiring a CAPTCHA. Review logs for scraping errors.
-   **Commands Not Working**: Confirm you are using the correct `COMMAND_PREFIX` in the designated support channel. Ensure your user ID is in `ALLOWED_USER_IDS` for admin commands.
-   **Webhook Issues**: Set `WEBHOOK_DEBUG_LOGGING=true` in your `.env` file to get comprehensive debugging information about PubSubHubbub webhooks, including request details, signature verification, and processing flow.

## Development & Code Quality

This project maintains high code quality standards through automated tooling and comprehensive testing:

### Code Quality Tools
- **ESLint**: Modern flat configuration with comprehensive rules for code quality, security, and performance
- **Prettier**: Consistent code formatting with file-specific rules for `.js`, `.md`, `.json`, and `.yml` files  
- **Babel**: Modern JavaScript transpilation with Node.js 18+ targeting and polyfill management
- **Husky**: Pre-commit hooks for automated code quality checks

### Development Commands
```bash
# Code quality
npm run lint              # Run ESLint checks
npm run lint:fix          # Auto-fix ESLint issues
npm run format            # Check Prettier formatting

# Development workflow
npm run test:watch        # Run tests in watch mode
npm run test:coverage     # Generate detailed coverage reports
```

### Pre-commit Workflow
The project uses automated pre-commit hooks that:
1. Run ESLint with auto-fix for code quality
2. Apply Prettier formatting consistently
3. Validate environment configuration
4. Increment build numbers automatically
5. Run syntax validation

All commits automatically trigger these quality checks to maintain code standards.

## Contributing

Contributions are welcome! Please follow this process:

1. **Fork the repository** and create a feature branch
2. **Make your changes** following the established patterns in the codebase
3. **Run quality checks**: `npm run lint:fix && npm run format`
4. **Add tests** for new functionality (see [Testing README](./tests/README.md))
5. **Commit your changes** - pre-commit hooks will run automatically
6. **Submit a pull request** with a clear description of your changes

The automated CI/CD pipeline will validate your changes across multiple Node.js versions with comprehensive testing.

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.
