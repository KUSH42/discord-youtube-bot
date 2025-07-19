// This file runs before all your tests, thanks to the setupFiles config.
// It configures dotenvx to use your specific test environment file.

require('dotenvx').config({ path: 'tests/test.env' });
