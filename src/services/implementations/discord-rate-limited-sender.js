import { DiscordRateLimitedSenderAdapter } from './message-sender/discord-rate-limited-sender-adapter.js';

/**
 * Discord Rate-Limited Message Sender
 *
 * Phase 3: Implementation Replacement
 * This is now a re-export of the new event-driven architecture via the compatibility adapter.
 * The adapter maintains 100% API compatibility while using the improved internal architecture.
 *
 * The old infinite-loop based implementation has been replaced with:
 * - Event-driven architecture using EventEmitter patterns
 * - Testable components with proper separation of concerns
 * - Deterministic test execution with test mode support
 * - Proven patterns from Bull Queue, Express.js, and CQRS systems
 *
 * All existing code continues to work unchanged during this transition phase.
 */
export class DiscordRateLimitedSender extends DiscordRateLimitedSenderAdapter {
  constructor(logger, options = {}) {
    super(logger, options);
  }

  // All methods are inherited from DiscordRateLimitedSenderAdapter
  // The adapter maintains 100% backward compatibility while providing
  // the improved event-driven architecture internally.
}
