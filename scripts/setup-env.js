// This script runs before your tests, loading the correct environment file.
// Note: I'm putting this in a `scripts` directory for organization.

const dotenvx = require('@dotenvx/dotenvx');
dotenvx.config({ path: './tests/test.env' });
