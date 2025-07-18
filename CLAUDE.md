# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Start the bot:**
```bash
npm start                    # Start normally with validation
npm run decrypt             # Start with explicit credential decryption
npm run validate            # Validate configuration only
npm run setup-encryption    # Set up credential encryption
# or directly
node index.js
```

**Start as systemd service:**
```bash
sudo systemctl start discord-bot.service
sudo systemctl status discord-bot.service
```

**Development with systemd:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable discord-bot.service
sudo systemctl stop discord-bot.service
```

**Check logs:**
```bash
# View service logs
sudo journalctl -u discord-bot.service -f

# View bot logs (configured via LOG_FILE_PATH)
tail -f bot.log
```

**Generate coverage reports locally:**
```bash
# Generate coverage-summary.json from existing lcov.info files
./scripts/generate-coverage-summary.sh

# View coverage report
open coverage/lcov-report/index.html
```

## Architecture Overview

This is a Discord bot that monitors YouTube channels and X (Twitter) profiles for new content and announces it to Discord channels. The bot uses:

- **PubSubHubbub** for real-time YouTube notifications (push-based)
- **Web scraping** with Puppeteer/Playwright for X monitoring (polling-based)
- **Express.js** server for webhook endpoints
- **Winston** for comprehensive logging
- **Discord.js** for Discord integration

### Core Components

**Main Entry Point (`index.js`):**
- Discord client setup and event handling
- Express server initialization
- Bot control commands (`!kill`, `!restart`, `!announce`, etc.)
- Logging infrastructure with Discord transport
- State management for posting controls

**YouTube Monitor (`youtube-monitor.js`):**
- PubSubHubbub subscription management
- Webhook signature verification using HMAC-SHA1
- YouTube Data API integration for video details
- Automatic subscription renewal
- Content filtering (only new content after bot startup)

**X Scraper (`x-scraper.js`):**
- Coordinates scraping tasks
- Relies on `AuthManager` for session handling
- Advanced search scraping with categorization (posts, replies, quotes, retweets)
- Content deduplication and timestamp filtering
- Configurable polling intervals with jitter
- VX Twitter URL conversion support

### Key Features

- **Content Filtering**: Only announces content created after bot startup
- **Signature Verification**: Validates PubSubHubbub notifications
- **Runtime Controls**: Commands to toggle announcements, logging, URL conversion
- **Dual Monitoring**: Separate channels for different content types
- **Automatic Recovery**: Handles failures with exponential backoff
- **Comprehensive Logging**: File rotation, Discord mirroring, multiple log levels
- **Credential Encryption**: Secure credential storage using dotenvx
- **Rate Limiting**: Command and webhook rate limiting for abuse prevention
- **Environment Validation**: Startup validation of required configuration
- **Health Monitoring**: HTTP endpoints and Discord commands for status checking
- **Pre-commit Hooks**: Automated syntax and security validation

### Configuration

The bot is configured entirely through environment variables in `.env`:
- Discord bot token and channel IDs
- YouTube API key and channel ID
- X user handle and credentials
- PubSubHubbub webhook URL and secret
- Polling intervals and feature toggles

### Bot Commands

All commands use the configured prefix (default `!`) and must be sent in the support channel:
- `!kill` - Disable all Discord posting
- `!restart` - Soft restart (requires authorization)
- `!announce <true|false>` - Toggle announcement posting
- `!vxtwitter <true|false>` - Toggle URL conversion
- `!loglevel <level>` - Change logging level
- `!health` - Show bot health status and system information
- `!readme` - Show command help

### Development Notes

- The bot requires a publicly accessible webhook URL for PubSubHubbub
- X scraping requires valid authentication, which is handled by the `AuthManager`
- Uses Xvfb for headless browser operations in production
- Implements proper error handling and graceful degradation
- All state is reset on soft restart, not just bot restart

### Health Endpoints

The bot exposes health check endpoints for monitoring:
- `GET /health` - Basic health status
- `GET /health/detailed` - Detailed component status
- `GET /ready` - Readiness probe

### Security & Rate Limiting

- Commands: 5 per minute per user
- Webhooks: 100 requests per 15 minutes per IP
- Pre-commit hooks validate syntax and security
- Environment variables validated on startup
- Credentials can be encrypted with dotenvx

## Testing Infrastructure

This project includes a comprehensive testing framework that should be used and maintained:

### Test Execution Commands
```bash
# Run all tests
npm test                    # Full test suite with coverage
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:e2e           # End-to-end tests only
npm run test:performance   # Performance benchmarks
npm run test:security      # Security auditing

# Development testing
npm run test:coverage      # Generate detailed coverage reports
npm run test:watch         # Watch mode for development
```

### Test Structure
- **Unit Tests**: Located in `tests/unit/` - Test individual functions and modules with mocking
- **Integration Tests**: Located in `tests/integration/` - Test service interactions and API endpoints
- **E2E Tests**: Located in `tests/e2e/` - Test complete user workflows
- **Performance Tests**: Located in `tests/performance/` - Load testing and benchmarking
- **Security Tests**: Automated security scans and dependency audits

### CI/CD Testing
- **Cached Docker Image**: Integration tests run in a cached Docker image to avoid reinstalling Playwright, significantly speeding up the CI process.
- Tests run automatically on GitHub Actions for all pushes and PRs.
- Multi-Node.js version testing (18, 20).
- **Fixed Coverage Reporting**: Industry-standard tools (`lcov-result-merger` + `nyc`).
- **Strategic Coverage Focus**: ~70% source code coverage with smart CI merging (no triple-counting).
- **Quality Gates**: Automated coverage validation with achievable thresholds (25% global, 85% core).
- **Infrastructure Testing**: Comprehensive testing of dependency injection and configuration.
- **Comprehensive Artifacts**: Merged coverage reports and detailed test summaries.

### When Modifying Tests
- Always maintain or improve test coverage
- Update tests when changing functionality
- Add new tests for new features
- Ensure tests pass locally before committing
- Check GitHub Actions for full CI validation

### Test Result Analysis
- Review `test-summary.md` for overall test health
- Check individual test artifacts in GitHub Actions
- Monitor coverage reports for code quality
- Address failing tests immediately

## Commit and PR Guidelines

**IMPORTANT**: When creating commit messages and pull requests, avoid references to AI assistance tools or automated code generation. Follow these guidelines:

### Commit Messages
1. Be descriptive and focus on the actual changes made
2. Use conventional commit format when appropriate (feat:, fix:, docs:, etc.)
3. Not mention AI tools, Claude, or automated assistance
4. Focus on the "what" and "why" of the changes

### Pull Requests
1. Apply the same guidelines as commit messages
2. Never include AI tool references in PR titles or descriptions
3. Focus on the technical changes and their benefits
4. Use clear, professional language describing the improvements

**Good examples:**
- `feat: Add credential encryption support with dotenvx`
- `fix: Implement rate limiting for Discord commands and webhooks`
- `docs: Update README with new security features`
- `docs: Comprehensive README improvements with strategic emoji usage`

**Avoid:**
- "Generated with Claude Code" or similar phrases