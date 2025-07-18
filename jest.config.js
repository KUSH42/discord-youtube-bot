export default {
  testEnvironment: 'node',
  transform: {},
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!node_modules/**',
    '!coverage/**',
    '!jest.config.js',
    '!setup-encryption.js',
    '!tests/**',
    '!src/services/interfaces/**',
    '!src/setup/**',
    '!index.js',
    '!x-scraper.js',
    '!youtube-monitor.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'clover'],
  coverageThreshold: {
    global: {
      statements: 15,
      branches: 20,
      functions: 15,
      lines: 15
    },
    'src/core/': {
      statements: 4,
      branches: 1,
      functions: 13,
      lines: 4
    }
  },
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js',
    '**/__tests__/**/*.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  moduleFileExtensions: ['js', 'json'],
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$))'
  ]
};