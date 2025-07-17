import baseConfig from './jest.config.js';

export default {
  ...baseConfig,
  // E2E tests focus on integration behavior, not source code coverage
  coverageThreshold: {
    global: {
      statements: 0,
      branches: 0,
      functions: 0,
      lines: 0
    }
  },
  // Only collect coverage if specifically requested
  collectCoverage: process.env.COLLECT_COVERAGE === 'true',
  testMatch: [
    '**/tests/e2e/**/*.test.js',
    '**/tests/e2e/**/*.spec.js'
  ],
  testTimeout: 60000
};