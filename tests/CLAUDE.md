Option "testPathPattern" was replaced by "--testPathPatterns". "--testPathPatterns" is only available as a command-line option:
npm run test:unit --testPathPatterns="message-sender" -- --verbose

Only run individual test suites, never the full test, as this produces too much output.