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
- **Global Thresholds**: 25% statements/lines, 20% branches, 25% functions (enforced by Jest)
- **Core Module Coverage**: 50% statements/lines, 40% branches, 55% functions for `src/core/` modules
- **Critical Components**: 85-90% coverage for well-tested modules like `youtube-api-service` and `content-classifier`
- **New Code Coverage**: All new functions must have accompanying tests that meet component-specific thresholds
- **Enforcement**: Coverage thresholds are automatically enforced during test execution and CI/CD

### Test Configurations
- **Production Config (`jest.config.js`)**: Full coverage enforcement, parallel execution, quality gates
- **Development Config (`jest.dev.config.js`)**: Fast feedback, single worker, git-aware testing
- **Specialized Configs**: Separate configurations for E2E, security, and performance tests

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

### Async Testing & Mock Implementation Guidelines
When working with async code and complex mocks, follow these proven patterns:

**Async Callback Handling:**
```javascript
// For code using setImmediate (like StateManager notifications)
const flushPromises = async () => {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
};

it('should handle async callbacks', async () => {
  stateManager.subscribe('key', mockCallback);
  stateManager.set('key', 'value');
  
  await flushPromises(); // Wait for async notifications
  expect(mockCallback).toHaveBeenCalled();
});
```

**Proper Mock Setup:**
```javascript
// ✅ Correct: Use spies after instantiation
beforeEach(() => {
  authManager = new AuthManager(dependencies);
  jest.spyOn(authManager, 'isAuthenticated').mockResolvedValue(true);
});

// ❌ Avoid: Class.mockImplementation in tests
// This pattern should not be used in test files
```

**Timer Testing:**
```javascript
// Use async timer advancement for proper Promise handling
it('should handle delays', async () => {
  jest.useFakeTimers();
  const promise = authManager.loginToX();
  
  await jest.runAllTimersAsync(); // Handles both timers and promises
  
  const result = await promise;
  expect(result).toBe(true);
  jest.useRealTimers();
});
```

**Error Log Silencing in Tests:**
The project uses global console mocking in `tests/setup.js` to prevent false positive error logs during test execution. When testing error scenarios, follow these patterns:

```javascript
// ✅ Good: Test validates error handling without generating log noise
describe('Error Handling', () => {
  it('should handle API failures gracefully', async () => {
    mockApiService.getData.mockRejectedValue(new Error('API Error'));
    
    const result = await service.fetchData();
    
    // Error is handled gracefully, no console.error needed
    expect(result.success).toBe(false);
    expect(result.error).toBe('API Error');
  });
});

// ✅ Good: For tests that specifically validate error logging behavior
it('should log critical errors', async () => {
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  
  await service.handleCriticalError(new Error('Critical'));
  
  expect(consoleErrorSpy).toHaveBeenCalledWith(
    expect.stringContaining('Critical error:'),
    expect.any(Error)
  );
  
  consoleErrorSpy.mockRestore();
});

// ❌ Avoid: Adding console.error calls in test mock implementations
const mockHandler = async (data) => {
  try {
    return await processData(data);
  } catch (error) {
    console.error('Processing failed:', error.message); // This creates noise
    throw error;
  }
};

// ✅ Better: Silent error handling in test mocks
const mockHandler = async (data) => {
  try {
    return await processData(data);
  } catch (error) {
    // Silenced in tests - error is re-thrown for Jest to handle
    throw error;
  }
};
```

**Global Test Setup Benefits:**
- All `console.error` calls are automatically mocked to prevent log noise
- Tests that specifically validate logging behavior still work correctly
- Unhandled rejections are silenced in test environment
- Access to original console via `global.originalConsole` when needed for debugging

### CI/CD Test Execution
- **Automated Testing**: All tests run on GitHub Actions for every push and PR
- **Parallel Execution**: Tests run with 50% worker utilization for optimal performance
- **Coverage Enforcement**: Jest coverage thresholds enforced at the test execution level
- **Docker Integration**: Integration tests use cached Docker images for Playwright
- **Coverage Reporting**: Upload coverage to Codecov with merged reports
- **Quality Gates**: All tests must pass and meet coverage thresholds before merge approval
- **Performance Optimizations**: Caching and parallel execution reduce CI/CD execution time

## 6. Development Commands & Workflow

### Essential Commands
```bash
# Development
npm start                    # Start bot with validation
npm run decrypt             # Start with encrypted credentials
npm run validate            # Validate configuration only
npm run setup-encryption    # Set up credential encryption

# Testing - Essential Commands
npm test                    # Full test suite with coverage
npm run test:dev           # Development mode (fast feedback)
npm run test:watch         # Watch mode for development
npm run test:coverage      # Generate detailed coverage reports
npm run test:parallel      # Parallel execution (faster)

# Testing - Specific Types
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:e2e           # End-to-end tests
npm run test:performance   # Performance tests
npm run test:security      # Security tests

# Testing - Advanced Options
npm run test:changed       # Only test changed files (Git-aware)
npm run test:debug         # Debug mode with breakpoints
npm run test:runner unit   # Interactive test runner
npm run test:verbose       # Detailed test output
npm run test:bail          # Stop on first failure

# Code Quality
npm run lint               # Run ESLint
npm run lint:fix          # Fix ESLint issues
npm run format            # Check Prettier formatting
```

### Development Workflow
1. **Before Making Changes**: Run `npm test` to ensure baseline stability
2. **During Development**: Use `npm run test:dev` or `npm run test:watch` for immediate feedback
3. **Fast Iteration**: Use `npm run test:changed` to test only modified files
4. **Code Quality**: Run `npm run lint:fix` before committing
5. **Pre-commit**: Husky automatically runs linting and formatting checks
6. **Testing**: Add tests for new functionality before implementation
7. **Coverage Compliance**: Ensure new code meets coverage thresholds
8. **Documentation**: Update relevant documentation with changes

### Enhanced Testing Strategy
- **Development Phase**: Use `jest.dev.config.js` for rapid iteration
- **Debugging**: Utilize `npm run test:debug` with breakpoint support
- **Performance**: Leverage `npm run test:parallel` for faster execution
- **Quality Gates**: All code must meet established coverage thresholds
- **CI/CD**: Full test suite with coverage enforcement

### ⚠️ Critical Memory Leak Prevention

**IMPORTANT**: This project previously experienced severe memory leaks and hanging tests caused by tests calling real production `main()` functions that start infinite background processes. This has been resolved with comprehensive fixes.

**🛡️ Safety Guards in Place:**
All main() functions (`index.js`, `src/x-scraper.js`, `src/youtube-monitor.js`) now include:
```javascript
if (process.env.NODE_ENV === 'test') {
  throw new Error('main() should not be called in test environment - it starts infinite background processes');
}
```

**📋 For AI Agents and Developers:**
1. **NEVER call `main()` functions in tests** - They start production applications with infinite loops
2. **Use mock functions** instead of real entry points in integration tests
3. **Add explicit cleanup** (`stopMonitoring()`, `stopProcessing()`) in tests that start services
4. **Monitor memory usage** during test development
5. **Reference `docs/HANGING-TESTS-ANALYSIS.md`** for complete details on the resolution

**✅ Current Status**: All memory leak and hanging test issues have been resolved. Tests now complete in reasonable time without memory overflow.

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

### Multi-Source Detection System
The system uses a three-tier detection hierarchy with **Source Priority** to prevent conflicts:
1. **Webhooks** (Highest Priority) - PubSubHubbub push notifications from YouTube
2. **API Polling** (Medium Priority) - Direct YouTube Data API v3 queries
3. **Web Scraping** (Lowest Priority) - Playwright-based fallback monitoring

### YouTube Monitoring (PubSubHubbub)
- **Real-time Notifications**: Push-based webhook system for instant updates
- **Signature Verification**: HMAC-SHA1 validation of incoming webhooks
- **Fallback System**: Automatic switch to API polling if webhooks fail
- **Scheduled Content**: Monitors `scheduled → live → ended → published` transitions
- **Enhanced Duplicate Prevention**: Content fingerprinting with persistent storage

### YouTube API Enhancement
- **Scheduled Livestream Detection**: `getScheduledContent()` method for upcoming streams
- **State Polling**: `checkScheduledContentStates()` and `pollScheduledContent()` for real-time transitions
- **Livestream State Determination**: Intelligent state detection from API response data

### X (Twitter) Monitoring (Web Scraping)
- **Authentication**: Managed by `AuthManager` with persistent cookie storage
- **Content Classification**: Distinguish posts, replies, quotes, and retweets
- **Advanced Scraping**: Search-based scraping with enhanced scrolling
- **Rate Limiting**: Respectful scraping with configurable intervals

### Enhanced Content Processing Pipeline
1. **Multi-Source Detection**: Content detected by webhook, API, or scraper
2. **ContentCoordinator Processing**: Race condition prevention with processing locks
3. **Source Priority Resolution**: Higher priority sources override lower priority
4. **ContentStateManager**: Unified state tracking and age validation
5. **Enhanced Duplicate Detection**: Fingerprinting and URL normalization
6. **LivestreamStateMachine**: State transition management for livestreams
7. **Content Classification**: Determine content type and target Discord channel
8. **Announcement**: Format and send to appropriate Discord channels
9. **Persistent Tracking**: Store content states and fingerprints for restart persistence

### Key Components Added
- **ContentStateManager** (`src/core/content-state-manager.js`): Unified content state with persistent storage
- **LivestreamStateMachine** (`src/core/livestream-state-machine.js`): Handles livestream transitions
- **ContentCoordinator** (`src/core/content-coordinator.js`): Prevents race conditions between sources
- **PersistentStorage** (`src/infrastructure/persistent-storage.js`): File-based storage for content states
- **Enhanced DuplicateDetector**: Content fingerprinting with normalized titles and timestamps

## 9. Configuration & Environment Management

### Environment Variables
All configuration managed through `.env` file with validation at startup:
- **Discord**: `DISCORD_BOT_TOKEN`, channel IDs, user authorizations
- **YouTube**: `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID`, webhook configuration
- **X Monitoring**: `X_USER_HANDLE`, authentication credentials
- **Security**: `PSH_SECRET`, rate limiting configuration
- **Operations**: Logging levels, feature toggles, polling intervals
- **Content Detection**: `MAX_CONTENT_AGE_HOURS`, `ENABLE_CONTENT_FINGERPRINTING`, `CONTENT_STORAGE_DIR`, reliability settings

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