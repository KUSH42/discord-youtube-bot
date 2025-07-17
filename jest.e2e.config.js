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
  // Disable coverage for E2E tests by default since they don't exercise source code directly
  collectCoverage: false,
  testMatch: [
    '**/tests/e2e/**/*.test.js',
    '**/tests/e2e/**/*.spec.js'
  ],
  testTimeout: 60000
};