# CLAUDE.md

# Discord Content Announcement Bot - AI Agent Development Guide

This document serves as the authoritative guide for Claude and other AI agents contributing to this Discord bot project. It defines the development mandate, architectural guidelines, coding standards, and operational protocols required to maintain and enhance this production-ready system.

## 1. Introduction & Purpose

This CLAUDE.md file functions as the definitive design document and best practices repository for AI agents working on the Discord Content Announcement Bot. It ensures that AI-generated code and documentation adhere to the highest standards, integrate seamlessly with existing systems, and contribute to the project's long-term scalability and maintainability.

This document, alongside `README.md` (general project overview) and `tests/README.md` (testing framework), forms the core knowledge base for autonomous AI operations within this codebase.

## 2. Claude's Mandate & Scope of Influence

### Primary Responsibilities
- **Feature Development**: Implement new content monitoring capabilities, Discord integration features, and bot commands
- **Bug Resolution**: Diagnose and fix issues in monitoring, scraping, command processing, and Discord communication
- **Refactoring**: Improve code quality, performance, and maintainability while preserving existing functionality
- **Test Generation**: Create comprehensive unit, integration, E2E, performance, and security tests
- **Documentation Maintenance**: Update inline documentation, README files, and architectural decision records
- **Performance Optimization**: Enhance monitoring efficiency, reduce memory usage, and optimize API calls
- **Security Hardening**: Implement secure credential handling, input validation, and rate limiting improvements

### Technology Stack Expertise Required
- **Primary Languages**: JavaScript (ES6+ modules), Node.js
- **Core Frameworks**: Discord.js v14, Express.js, Winston logging, Jest testing
- **External Services**: YouTube Data API v3, PubSubHubbub webhooks, X (Twitter) web scraping
- **Browser Automation**: Playwright, Puppeteer for X content monitoring
- **Infrastructure**: Systemd services, Docker containers, GitHub Actions CI/CD
- **Security**: dotenvx credential encryption, HMAC signature verification, rate limiting

### Autonomy Boundaries
**Requires Human Review:**
- Changes to core authentication mechanisms (`AuthManager`, credential handling)
- Modifications to PubSubHubbub webhook security verification
- Breaking changes to Discord command interfaces
- Major architectural shifts affecting dependency injection container
- Production deployment configurations and systemd service definitions
- Changes to environment variable validation or configuration structure

**Full Autonomy Granted:**
- Adding new bot commands within existing command processor framework
- Implementing content filtering and classification improvements
- Enhancing duplicate detection algorithms
- Adding new test cases and improving test coverage
- Documentation updates and code comments
- Performance optimizations that don't affect external APIs

## 3. Architectural Guidelines for AI-Generated Code

### Design Principles
1. **Clean Architecture**: Maintain strict separation between application, core business logic, and infrastructure layers
2. **Dependency Injection**: Use the `DependencyContainer` for all service management and testing isolation
3. **Event-Driven Design**: Leverage the `EventBus` for decoupled component communication
4. **State Management**: Use `StateManager` for runtime configuration and bot state persistence
5. **Error Resilience**: Implement exponential backoff, circuit breakers, and graceful degradation
6. **Security-First**: Validate all inputs, encrypt sensitive data, and implement rate limiting

### Existing System Integration
- **Service Layer**: All external API interactions must implement service interfaces (`src/services/interfaces/`)
- **Application Layer**: Business orchestration occurs in application classes (`src/application/`)
- **Core Layer**: Pure business logic resides in core modules (`src/core/`)
- **Infrastructure Layer**: Configuration, dependency management, and cross-cutting concerns (`src/infrastructure/`)

### Code Organization Standards
```
src/
├── application/          # Application orchestration (MonitorApplication, ScraperApplication)
├── core/                 # Business logic (CommandProcessor, ContentAnnouncer, ContentClassifier)
├── infrastructure/       # DI container, configuration, event bus, state management
├── services/             # External service abstractions and implementations
├── setup/                # Production dependency wiring
└── utilities/            # Shared utilities (logger, delay functions)
```

### Data Flow Patterns
- **Commands**: Discord message → CommandProcessor → StateManager → Response
- **YouTube**: PubSubHubbub webhook → MonitorApplication → ContentAnnouncer → Discord
- **X Monitoring**: ScraperApplication → AuthManager → Browser → ContentClassifier → Discord
- **Health Checks**: HTTP endpoint → Application stats → JSON response

## 4. Best Practices & Coding Standards

### Code Style & Formatting
- **ESLint Configuration**: Follow `eslint.config.mjs` rules strictly
- **Prettier Integration**: All code must pass `prettier --check .`
- **ES6+ Modules**: Use `import/export` syntax, no CommonJS `require()`
- **File Extensions**: Use `.js` for all JavaScript files
- **Line Length**: Maximum 120 characters per line

### Naming Conventions
- **Classes**: PascalCase (`CommandProcessor`, `DependencyContainer`)
- **Methods/Functions**: camelCase (`processCommand`, `validateInput`)
- **Variables**: camelCase (`botStartTime`, `announcementEnabled`)
- **Constants**: SCREAMING_SNAKE_CASE (`DEFAULT_LOG_LEVEL`, `MAX_RETRY_ATTEMPTS`)
- **Files**: kebab-case (`command-processor.js`, `youtube-api-service.js`)
- **Directories**: kebab-case (`src/core`, `tests/integration`)

### Documentation Requirements
- **JSDoc Comments**: Required for all public methods, classes, and complex functions
- **Parameter Documentation**: Document types, descriptions, and validation rules
- **Return Value Documentation**: Specify return types and possible values
- **Example Usage**: Include examples for complex APIs or non-obvious functionality

```javascript
/**
 * Process a Discord command and return execution result
 * @param {string} command - Command name (without prefix)
 * @param {Array<string>} args - Command arguments
 * @param {string} userId - Discord user ID who issued the command
 * @param {Object} [appStats] - Optional application statistics for health commands
 * @returns {Promise<Object>} Command result with success, message, and metadata
 * @example
 * const result = await processor.processCommand('health', [], '123456789');
 * console.log(result.message); // Health status information
 */
```

### Error Handling Standards
- **Async/Await**: Use async/await over Promise chains
- **Error Propagation**: Catch errors at appropriate boundaries, not everywhere
- **Logging Integration**: Use Winston logger with appropriate log levels
- **User-Friendly Messages**: Provide clear error messages for Discord users
- **System Errors**: Log detailed technical errors for debugging

```javascript
try {
  const result = await this.youtubeService.getVideoDetails(videoId);
  return result;
} catch (error) {
  this.logger.error('Failed to fetch YouTube video details', {
    videoId,
    error: error.message,
    stack: error.stack
  });
  throw new Error(`Unable to retrieve video information: ${error.message}`);
}
```

### Security Implementation
- **Input Validation**: Validate all user inputs using appropriate sanitization
- **Secret Management**: Never log sensitive data; use dotenvx encryption for production
- **Rate Limiting**: Implement rate limiting for all user-facing endpoints and commands
- **HMAC Verification**: Verify webhook signatures using crypto module
- **SQL Injection Prevention**: Use parameterized queries (if database is added)

### Performance Guidelines
- **Memory Management**: Monitor memory usage, implement cleanup for long-running processes
- **API Efficiency**: Batch API calls when possible, implement caching for repeated requests
- **Async Operations**: Use Promise.all() for parallel operations when safe
- **Resource Cleanup**: Implement disposal patterns for browser instances and network connections

## 5. Testing & Validation Standards

### Test Coverage Requirements
- **Minimum Global Coverage**: 25% (enforced by CI)
- **Core Module Coverage**: 85% for `src/core/` modules
- **Critical Path Coverage**: 100% for authentication, command processing, and webhook verification
- **New Code Coverage**: All new functions must have accompanying tests

### Test Organization
- **Unit Tests**: `tests/unit/` - Test individual functions and classes with mocking
- **Integration Tests**: `tests/integration/` - Test service interactions and API endpoints
- **E2E Tests**: `tests/e2e/` - Test complete user workflows and external service integration
- **Performance Tests**: `tests/performance/` - Benchmark critical operations and identify bottlenecks
- **Security Tests**: `tests/security/` - Validate input sanitization and security controls

### Test Implementation Standards
```javascript
import { jest } from '@jest/globals';
import { CommandProcessor } from '../../src/core/command-processor.js';

describe('CommandProcessor', () => {
  let processor;
  let mockConfig;
  let mockStateManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = {
      get: jest.fn()
    };
    mockStateManager = {
      get: jest.fn(),
      set: jest.fn(),
      setValidator: jest.fn()
    };
    processor = new CommandProcessor(mockConfig, mockStateManager);
  });

  describe('processCommand', () => {
    it('should process health command successfully', async () => {
      mockConfig.get.mockReturnValue('!');
      mockStateManager.get.mockReturnValue(true);

      const result = await processor.processCommand('health', [], 'user123');

      expect(result.success).toBe(true);
      expect(result.healthData).toBeDefined();
    });
  });
});
```

### CI/CD Test Execution
- **Automated Testing**: All tests run on GitHub Actions for every push and PR
- **Docker Integration**: Integration tests use cached Docker images for Playwright
- **Coverage Reporting**: Upload coverage to Codecov with merged reports
- **Quality Gates**: All tests must pass before merge approval

## 6. Development Commands & Workflow

### Essential Commands
```bash
# Development
npm start                    # Start bot with validation
npm run decrypt             # Start with encrypted credentials
npm run validate            # Validate configuration only
npm run setup-encryption    # Set up credential encryption

# Testing
npm test                    # Full test suite with coverage
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:e2e           # End-to-end tests
npm run test:coverage      # Generate detailed coverage reports
npm run test:watch         # Watch mode for development

# Code Quality
npm run lint               # Run ESLint
npm run lint:fix          # Fix ESLint issues
npm run format            # Check Prettier formatting
```

### Development Workflow
1. **Before Making Changes**: Run `npm test` to ensure baseline stability
2. **During Development**: Use `npm run test:watch` for immediate feedback
3. **Code Quality**: Run `npm run lint:fix` before committing
4. **Pre-commit**: Husky automatically runs linting and formatting checks
5. **Testing**: Add tests for new functionality before implementation
6. **Documentation**: Update relevant documentation with changes

## 7. Discord Bot Command System

### Command Processing Architecture
- **Entry Point**: Discord message events in `index.js`
- **Business Logic**: `CommandProcessor` class in `src/core/command-processor.js`
- **State Management**: Runtime state stored in `StateManager`
- **Authorization**: User-based permissions from `ALLOWED_USER_IDS` environment variable

### Available Commands
- `!health` - Basic health status and system information
- `!health-detailed` - Comprehensive component status
- `!announce <true|false>` - Toggle announcement posting
- `!vxtwitter <true|false>` - Toggle URL conversion
- `!loglevel <level>` - Change logging level
- `!restart` - Full bot restart (authorized users only)
- `!kill` - Stop all Discord posting (authorized users only)
- `!update` - Git pull and restart (authorized users only)
- `!readme` - Display command help

### Command Implementation Guidelines
When adding new commands:
1. Add command name to `processCommand` switch statement
2. Implement handler method (e.g., `handleNewCommand`)
3. Add input validation in `validateCommand` method
4. Update `getStats()` method with new command
5. Add command to `handleReadme()` documentation
6. Create comprehensive unit tests

## 8. Content Monitoring Architecture

### YouTube Monitoring (PubSubHubbub)
- **Real-time Notifications**: Push-based webhook system for instant updates
- **Signature Verification**: HMAC-SHA1 validation of incoming webhooks
- **Fallback System**: Automatic switch to API polling if webhooks fail
- **Duplicate Prevention**: Track announced content to prevent re-posting

### X (Twitter) Monitoring (Web Scraping)
- **Authentication**: Managed by `AuthManager` with persistent cookie storage
- **Content Classification**: Distinguish posts, replies, quotes, and retweets
- **Advanced Scraping**: Search-based scraping with enhanced scrolling
- **Rate Limiting**: Respectful scraping with configurable intervals

### Content Processing Pipeline
1. **Content Detection**: PubSubHubbub webhook or scraper discovery
2. **Validation**: Verify content is new and meets filtering criteria
3. **Classification**: Determine content type and target Discord channel
4. **Announcement**: Format and send to appropriate Discord channels
5. **Tracking**: Record announced content for duplicate prevention

## 9. Configuration & Environment Management

### Environment Variables
All configuration managed through `.env` file with validation at startup:
- **Discord**: `DISCORD_BOT_TOKEN`, channel IDs, user authorizations
- **YouTube**: `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID`, webhook configuration
- **X Monitoring**: `X_USER_HANDLE`, authentication credentials
- **Security**: `PSH_SECRET`, rate limiting configuration
- **Operations**: Logging levels, feature toggles, polling intervals

### Configuration Validation
- **Startup Validation**: `src/config-validator.js` validates required variables
- **Type Checking**: Ensure proper data types and formats
- **Security Checks**: Verify sensitive values are properly encrypted
- **Default Values**: Provide sensible defaults where appropriate

### Credential Security
- **Encryption**: Use dotenvx for production credential encryption
- **Environment Separation**: Different configurations for development and production
- **Secret Scanning**: Pre-commit hooks check for accidental secret exposure

## 10. Monitoring & Health Checks

### Health Check Endpoints
- `GET /health` - Basic health status with uptime and memory usage
- `GET /health/detailed` - Comprehensive status of all components
- `GET /ready` - Kubernetes-style readiness probe

### Discord Health Commands
- `!health` - Real-time status in Discord chat
- `!health-detailed` - Comprehensive component status via Discord

### Monitoring Metrics
- **System**: Memory usage, uptime, process health
- **Application**: Component status, error rates, performance metrics
- **Business**: Content monitoring stats, command usage, announcement counts

## 11. Deployment & Production Operations

### Systemd Service Management
```bash
# Service Operations
sudo systemctl start discord-bot.service
sudo systemctl status discord-bot.service
sudo systemctl stop discord-bot.service

# Development
sudo systemctl daemon-reload
sudo systemctl enable discord-bot.service
```

### Logging Infrastructure
- **File Logging**: Winston with daily rotation
- **Discord Logging**: Optional log mirroring to Discord channel
- **Log Levels**: error, warn, info, http, verbose, debug, silly
- **Structured Logging**: JSON format with contextual metadata

### Production Considerations
- **Process Management**: Systemd service with automatic restart
- **Resource Monitoring**: Memory and CPU usage tracking
- **Error Recovery**: Exponential backoff and circuit breaker patterns
- **Graceful Shutdown**: Proper cleanup of resources and connections

## 12. Knowledge Acquisition & Continuous Learning

### Primary Learning Sources
1. **Codebase Analysis**: Understand patterns from existing implementations
2. **Documentation**: README.md, tests/README.md, and this CLAUDE.md
3. **Test Results**: Learn from test failures and coverage reports
4. **Production Logs**: Analyze real-world usage patterns and errors

### Self-Improvement Protocols
- **Code Review**: Analyze human feedback on generated code
- **Error Analysis**: Study failed tests and production incidents
- **Performance Monitoring**: Learn from performance test results
- **Security Assessment**: Understand security scan results and vulnerabilities

### Feedback Integration
- **Human Review**: Incorporate code review comments into future implementations
- **CI/CD Results**: Learn from automated test failures and linting errors
- **Production Metrics**: Analyze real-world performance and reliability data
- **User Behavior**: Study Discord command usage patterns and user feedback

## 13. Quality Assurance & Validation

### Pre-Commit Validation
- **Syntax Checking**: ESLint validation with project-specific rules
- **Security Scanning**: Check for hardcoded secrets and vulnerabilities
- **Test Execution**: Run relevant tests for changed code
- **Documentation**: Ensure code changes include documentation updates

### Code Review Criteria
- **Functionality**: Does the code work as intended?
- **Security**: Are there any security vulnerabilities?
- **Performance**: Are there any performance implications?
- **Maintainability**: Is the code easy to understand and modify?
- **Testing**: Are there adequate tests for the changes?

### Deployment Readiness
- **Configuration**: All required environment variables documented
- **Dependencies**: Package.json updated with new dependencies
- **Migration**: Any required data or configuration migrations
- **Rollback**: Ensure changes can be safely reverted if needed

## 14. Interaction & Collaboration Protocols

### Communication Standards
- **Clear Signaling**: Explicitly indicate task completion and next steps
- **Context Provision**: Include relevant technical details for review
- **Change Documentation**: Explain what was changed and why
- **Impact Assessment**: Describe potential effects of changes

### Change Proposal Format
```markdown
## Change Summary
Brief description of what was implemented

## Technical Details
- Files modified: list of changed files
- New dependencies: any added packages
- Configuration changes: environment variable updates

## Testing
- Test coverage: percentage and scope
- Test results: summary of test execution
- Manual testing: any manual verification performed

## Impact Analysis
- Breaking changes: any backward compatibility issues
- Performance impact: expected performance changes
- Security considerations: security implications
```

### Conflict Resolution
- **Ambiguous Requirements**: Request clarification with specific questions
- **Conflicting Instructions**: Highlight conflicts and request priority guidance
- **Technical Constraints**: Explain limitations and propose alternatives
- **Resource Constraints**: Identify bottlenecks and suggest solutions

## 15. Versioning & Evolution

### Document Maintenance
This CLAUDE.md is a living document that must evolve with the project. Claude is expected to:
- **Propose Updates**: Suggest improvements based on development experience
- **Reflect Changes**: Update guidelines when project architecture evolves
- **Maintain Accuracy**: Ensure all information remains current and correct
- **Enhance Clarity**: Improve explanations and examples based on usage

### Change Management
- **Version Control**: All changes tracked through Git commits
- **Review Process**: Significant changes require human review
- **Backward Compatibility**: Maintain compatibility with existing development patterns
- **Migration Guidance**: Provide migration paths for breaking changes

### Future Enhancements
- **Scalability**: Prepare for potential multi-server deployment
- **Integration**: Plan for additional content sources and Discord features
- **Monitoring**: Enhanced observability and alerting capabilities
- **Security**: Continuous security improvements and threat mitigation

---

*This document supersedes any previous Claude-specific guidelines and serves as the authoritative source for AI agent contributions to this project. It should be referenced for all development decisions and updated as the project evolves.*