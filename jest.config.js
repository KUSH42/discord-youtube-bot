export default {
  testEnvironment: 'node',
  transform: {
    '^.+\.js$': ['babel-jest', { presets: [['@babel/preset-env', { targets: { node: 'current' } }]] }],
  },
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    'index.js', // Include main entry point
    'x-scraper.js', // Include X/Twitter scraper
    'youtube-monitor.js', // Include YouTube monitor
    '!node_modules/**',
    '!coverage/**',
    '!jest.config.js',
    '!setup-encryption.js',
    '!tests/**',
    '!src/services/interfaces/**',
    '!src/setup/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'clover'],
  // coverageThreshold: {
  //   global: {
  //     statements: 15,
  //     branches: 19,
  //     functions: 15,
  //     lines: 15,
  //   },
  //   'src/core/': {
  //     statements: 4,
  //     branches: 1,
  //     functions: 13,
  //     lines: 4,
  //   },
  // },
  testMatch: [
    '**/tests/**/*.spec.js',
    '**/__tests__/**/*.js',
    '**/tests/unit/scraper-application.tweet-processing.test.js',
    '**/tests/unit/scraper-application.content-filtering.test.js',
    '**/tests/unit/scraper-application.polling.test.js',
    '**/tests/unit/scraper-application.duplicate-detector.test.js',
    '**/tests/unit/scraper-application.browser-initialization.test.js',
    '**/tests/unit/scraper-application.enhanced-scrolling.test.js',
    '**/tests/unit/scraper-application.search-retweet.test.js',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
  verbose: false,
  forceExit: true,
  detectOpenHandles: true,
  moduleFileExtensions: ['js', 'json'],
  transformIgnorePatterns: ['node_modules/(?!(.*\\.mjs$))'],
};
