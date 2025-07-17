import baseConfig from './jest.config.js';

export default {
  ...baseConfig,
  // Security tests focus on validation behavior, not source code coverage
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
    '**/tests/security/**/*.test.js',
    '**/tests/security/**/*.spec.js'
  ],
  testTimeout: 45000
};