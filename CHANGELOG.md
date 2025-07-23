# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Comprehensive migration documentation in
  `DISCORD-RATE-LIMITED-SENDER-MIGRATION.md`
- Event-driven message processing architecture with EventEmitter patterns
- Modern testing patterns for async operations and deterministic test execution

### Changed

- **MAJOR**: Replaced infinite-loop based Discord message processing with
  event-driven architecture
- Migrated from `DiscordRateLimitedSender` to `DiscordMessageSender` with
  backward compatibility
- Updated logger-utils.js to use new event-driven message sender directly
- Improved test reliability by eliminating hanging tests and implementing proper
  async handling

### Fixed

- Resolved hanging test issues caused by infinite while loops in rate limiting
  code
- Fixed Jest compatibility issues with EventEmitter async operations
- Eliminated race conditions and improved deterministic test execution
- Enhanced rate limiting with proper 429 error handling and burst allowances

## [2.1.0] - 2025-07-22 - Event-Driven Architecture Migration

### Added

- **MessageQueue**: Priority-based message management with comprehensive
  lifecycle tracking
- **RateLimiter**: Burst allowances and reactive rate limiting with Discord 429
  handling
- **MessageProcessor**: Command pattern implementation for processing lifecycle
  management
- **ProcessingScheduler**: Test vs production mode for deterministic testing
- **RetryHandler**: Exponential backoff with error classification
- **DiscordMessageSender**: Main event-driven class extending EventEmitter
- **DiscordRateLimitedSenderAdapter**: Backward compatibility layer for seamless
  migration

### Changed

- **BREAKING**: Internal architecture completely rewritten (API remains backward
  compatible)
- Replaced infinite `while` loop processing with EventEmitter-based patterns
- Implemented 4-phase migration strategy for zero-downtime transition
- Updated all async processing to use deterministic scheduling

### Performance

- Eliminated blocking infinite loops that caused test hangs
- Improved message processing efficiency with event-driven patterns
- Added proper test mode for faster, more reliable test execution
- Reduced memory usage and improved garbage collection

### Security

- Enhanced rate limiting with intelligent backoff strategies
- Improved error handling and recovery patterns
- Added comprehensive logging for debugging rate limiting issues

## [2.0.0] - 2025-07-21 - Content Detection & Testing Improvements

### Added

- Enhanced duplicate detection with content fingerprinting
- Persistent content state management across bot restarts
- Content coordinator for race condition prevention
- Comprehensive testing improvements and CI/CD optimizations
- Advanced retweet classification and routing

### Fixed

- Resolved hanging tests in timer-dependent code
- Fixed YouTube scraper service reliability issues
- Improved CI/CD pipeline execution time and reliability
- Enhanced Discord client service mock handling

## [1.5.0] - 2025-07 - Core Stability & Monitoring

### Added

- Persistent duplicate detection across restarts
- Enhanced content fingerprinting system
- Multi-source content detection with priority handling
- Livestream state machine for transition tracking
- ContentCoordinator for race condition prevention
- Advanced logging and monitoring capabilities

### Changed

- Improved YouTube content detection reliability
- Enhanced X (Twitter) scraping with better authentication
- Updated Discord bot commands with comprehensive validation
- Strengthened security with better credential encryption

### Fixed

- Various stability improvements and bug fixes
- Enhanced error handling across all components
- Improved test coverage and reliability

## [1.0.0] - 2024 - Initial Release

### Added

- Discord bot for YouTube and X content announcements
- Clean architecture with dependency injection
- PubSubHubbub webhook integration for real-time YouTube notifications
- X (Twitter) web scraping with Playwright
- Comprehensive testing suite
- Docker containerization
- CI/CD pipeline with GitHub Actions
- Health monitoring endpoints
- Discord command processing
- Rate limiting and queue management
- Credential encryption and security features

---

For detailed migration information, see:

- [`DISCORD-RATE-LIMITED-SENDER-MIGRATION.md`](./DISCORD-RATE-LIMITED-SENDER-MIGRATION.md) -
  Event-driven architecture migration
- [`docs/TEST-INFRASTRUCTURE-FIXES.md`](./docs/TEST-INFRASTRUCTURE-FIXES.md) -
  Testing improvements
- [`tests/README.md`](./tests/README.md) - Testing architecture guide
