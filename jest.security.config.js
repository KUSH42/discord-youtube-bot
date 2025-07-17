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
  // Disable coverage for security tests by default since they focus on input validation
  collectCoverage: false,
  testMatch: [
    '**/tests/security/**/*.test.js',
    '**/tests/security/**/*.spec.js'
  ],
  testTimeout: 45000
};