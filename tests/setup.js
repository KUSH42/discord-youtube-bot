import { jest } from '@jest/globals';

// Global test setup
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();

  // Reset environment variables
  delete process.env.DISCORD_TOKEN;
  delete process.env.YOUTUBE_API_KEY;
  delete process.env.X_USERNAME;
  delete process.env.X_PASSWORD;

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // Suppress logs during tests
});

afterEach(async () => {
  // Clean up any remaining mocks and timers as safety net
  jest.clearAllMocks();
  jest.clearAllTimers();

  // Clear any module registry entries that might be holding references
  jest.resetModules();

  // Clear global test helpers
  delete global.mockTimeSource;
  delete global.advanceAsyncTimers;

  // Force garbage collection if available (helps with memory leaks in tests)
  if (global.gc) {
    global.gc();
  }

  // Small delay to allow cleanup to complete
  await new Promise(resolve => setImmediate(resolve));
});

// Global error handler for unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
