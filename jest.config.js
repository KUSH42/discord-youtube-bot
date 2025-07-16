export default {
  testEnvironment: 'node',
  transform: {},
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '*.js',
    '!node_modules/**',
    '!coverage/**',
    '!jest.config.js',
    '!setup-encryption.js',
    '!tests/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'clover'],
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