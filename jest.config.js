export default {
  testEnvironment: 'node',
  transform: {
    '^.+.js$': ['babel-jest', { presets: [['@babel/preset-env', { targets: { node: 'current' } }]] }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    'index.js', // Include main entry point
    'src/x-scraper.js', // Include X/Twitter scraper
    'src/youtube-monitor.js', // Include YouTube monitor
    '!node_modules/**',
    '!coverage/**',
    '!jest.config.js',
    '!scripts/setup-encryption.js',
    '!tests/**',
    '!src/services/interfaces/**',
    '!src/setup/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'clover'],
  coverageThreshold: {
    global: {
      statements: 25,
      branches: 20,
      functions: 25,
      lines: 25,
    },
    'src/core/': {
      statements: 50,
      branches: 40,
      functions: 55,
      lines: 50,
    },
    'src/services/implementations/youtube-api-service.js': {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90,
    },
    'src/core/content-classifier.js': {
      statements: 85,
      branches: 75,
      functions: 90,
      lines: 85,
    },
  },
  testMatch: ['**/tests/**/*.test.js', '**/tests/**/*.spec.js', '**/__tests__/**/*.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
  verbose: false,
  forceExit: true,
  detectOpenHandles: true,
  moduleFileExtensions: ['js', 'json'],
  transformIgnorePatterns: ['node_modules/(?!(.*\\.mjs$))'],
  // Performance optimizations
  maxWorkers: '50%',
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  clearMocks: true,
  restoreMocks: true,
  // Test result optimization
  bail: false,
  passWithNoTests: true,
  // Module resolution optimization
  haste: {
    computeSha1: true,
    throwOnModuleCollision: true,
  },
};
