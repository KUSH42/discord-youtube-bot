/**
 * Unit tests for Configuration
 * Tests centralized configuration management with validation, type conversion,
 * and security features for environment variables.
 */

import { Configuration } from '../../../src/infrastructure/configuration.js';

// Mock the config validator module
jest.mock('../../../src/config-validator.js', () => ({
  validateEnvironmentVariables: jest.fn().mockReturnValue(true),
  validateDiscordChannelId: jest.fn().mockReturnValue(true),
  validateYouTubeChannelId: jest.fn().mockReturnValue(true)
}));

import { validateEnvironmentVariables, validateDiscordChannelId, validateYouTubeChannelId } from '../../../src/config-validator.js';

describe('Configuration', () => {
  let mockEnv;
  let config;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockEnv = {
      DISCORD_BOT_TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dGVzdA.hash123',
      DISCORD_SUPPORT_CHANNEL_ID: '123456789012345678',
      DISCORD_YOUTUBE_CHANNEL_ID: '234567890123456789',
      DISCORD_X_CHANNEL_ID: '345678901234567890',
      YOUTUBE_API_KEY: 'AIzaSyDemoKeyForTestingPurposes12345',
      YOUTUBE_CHANNEL_ID: 'UCDemoChannelIdForTesting123456',
      X_USER: 'testuser',
      X_QUERY_INTERVALL_MIN: '120000',
      LOG_LEVEL: 'info',
      NODE_ENV: 'test'
    };
    
    validateEnvironmentVariables.mockReturnValue(true);
    validateDiscordChannelId.mockReturnValue(true);
    validateYouTubeChannelId.mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with process.env by default', () => {
      config = new Configuration();
      
      expect(config.env).toBeDefined();
      expect(validateEnvironmentVariables).toHaveBeenCalled();
    });

    test('should initialize with custom environment source', () => {
      config = new Configuration(mockEnv);
      
      expect(config.env).toBe(mockEnv);
      expect(validateEnvironmentVariables).toHaveBeenCalledWith(mockEnv);
    });

    test('should validate configuration on initialization', () => {
      config = new Configuration(mockEnv);
      
      expect(validateEnvironmentVariables).toHaveBeenCalledWith(mockEnv);
      expect(config.validated).toBe(true);
    });

    test('should throw error if validation fails', () => {
      validateEnvironmentVariables.mockImplementation(() => {
        throw new Error('Validation failed');
      });
      
      expect(() => new Configuration(mockEnv)).toThrow('Configuration validation failed: Validation failed');
    });
  });

  describe('Basic Configuration Access', () => {
    beforeEach(() => {
      config = new Configuration(mockEnv);
    });

    test('should get existing configuration value', () => {
      expect(config.get('LOG_LEVEL')).toBe('info');
      expect(config.get('NODE_ENV')).toBe('test');
    });

    test('should return default value for missing key', () => {
      expect(config.get('NON_EXISTENT_KEY', 'default')).toBe('default');
    });

    test('should return undefined for missing key without default', () => {
      expect(config.get('NON_EXISTENT_KEY')).toBeUndefined();
    });

    test('should get required configuration value', () => {
      expect(config.getRequired('LOG_LEVEL')).toBe('info');
    });

    test('should throw error for missing required key', () => {
      expect(() => config.getRequired('MISSING_REQUIRED_KEY')).toThrow(
        "Required configuration key 'MISSING_REQUIRED_KEY' is missing"
      );
    });
  });

  describe('Type Conversion', () => {
    beforeEach(() => {
      mockEnv = {
        ...mockEnv,
        PORT: '3000',
        TIMEOUT: '5000',
        INVALID_NUMBER: 'not-a-number',
        ENABLE_FEATURE: 'true',
        DISABLE_FEATURE: 'false',
        ENABLE_NUMERIC: '1',
        DISABLE_NUMERIC: '0',
        ENABLE_YES: 'yes',
        DISABLE_NO: 'no',
        INVALID_BOOLEAN: 'maybe'
      };
      config = new Configuration(mockEnv);
    });

    describe('getNumber', () => {
      test('should parse valid number strings', () => {
        expect(config.getNumber('PORT')).toBe(3000);
        expect(config.getNumber('TIMEOUT')).toBe(5000);
      });

      test('should return default for missing key', () => {
        expect(config.getNumber('MISSING_NUMBER', 42)).toBe(42);
      });

      test('should return undefined for missing key without default', () => {
        expect(config.getNumber('MISSING_NUMBER')).toBeUndefined();
      });

      test('should throw error for invalid number', () => {
        expect(() => config.getNumber('INVALID_NUMBER')).toThrow(
          "Configuration key 'INVALID_NUMBER' must be a valid number, got: not-a-number"
        );
      });
    });

    describe('getBoolean', () => {
      test('should parse true values', () => {
        expect(config.getBoolean('ENABLE_FEATURE')).toBe(true);
        expect(config.getBoolean('ENABLE_NUMERIC')).toBe(true);
        expect(config.getBoolean('ENABLE_YES')).toBe(true);
      });

      test('should parse false values', () => {
        expect(config.getBoolean('DISABLE_FEATURE')).toBe(false);
        expect(config.getBoolean('DISABLE_NUMERIC')).toBe(false);
        expect(config.getBoolean('DISABLE_NO')).toBe(false);
      });

      test('should return default for missing key', () => {
        expect(config.getBoolean('MISSING_BOOLEAN', true)).toBe(true);
      });

      test('should return undefined for missing key without default', () => {
        expect(config.getBoolean('MISSING_BOOLEAN')).toBeUndefined();
      });

      test('should throw error for invalid boolean', () => {
        expect(() => config.getBoolean('INVALID_BOOLEAN')).toThrow(
          "Configuration key 'INVALID_BOOLEAN' must be a boolean value, got: maybe"
        );
      });

      test('should handle case insensitive boolean values', () => {
        mockEnv.UPPER_TRUE = 'TRUE';
        mockEnv.MIXED_FALSE = 'False';
        config = new Configuration(mockEnv);
        
        expect(config.getBoolean('UPPER_TRUE')).toBe(true);
        expect(config.getBoolean('MIXED_FALSE')).toBe(false);
      });
    });
  });

  describe('Discord Configuration Validation', () => {
    beforeEach(() => {
      config = new Configuration(mockEnv);
    });

    test('should validate Discord channel IDs', () => {
      config.validateDiscordConfig();
      
      expect(validateDiscordChannelId).toHaveBeenCalledWith('123456789012345678');
      expect(validateDiscordChannelId).toHaveBeenCalledWith('234567890123456789');
      expect(validateDiscordChannelId).toHaveBeenCalledWith('345678901234567890');
    });

    test('should throw error for invalid Discord channel ID', () => {
      validateDiscordChannelId.mockReturnValue(false);
      
      expect(() => config.validateDiscordConfig()).toThrow('Invalid Discord support channel ID format');
    });

    test('should warn about invalid Discord token format', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockEnv.DISCORD_BOT_TOKEN = 'invalid-token-format';
      config = new Configuration(mockEnv);
      
      expect(consoleSpy).toHaveBeenCalledWith('Discord token format may be invalid');
      consoleSpy.mockRestore();
    });

    test('should handle missing Discord configuration gracefully', () => {
      delete mockEnv.DISCORD_SUPPORT_CHANNEL_ID;
      config = new Configuration(mockEnv);
      
      expect(() => config.validateDiscordConfig()).not.toThrow();
    });
  });

  describe('YouTube Configuration Validation', () => {
    beforeEach(() => {
      config = new Configuration(mockEnv);
    });

    test('should validate YouTube channel ID', () => {
      config.validateYouTubeConfig();
      
      expect(validateYouTubeChannelId).toHaveBeenCalledWith('UCDemoChannelIdForTesting123456');
    });

    test('should throw error for invalid YouTube channel ID', () => {
      validateYouTubeChannelId.mockReturnValue(false);
      
      expect(() => config.validateYouTubeConfig()).toThrow('Invalid YouTube channel ID format');
    });

    test('should warn about short YouTube API key', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockEnv.YOUTUBE_API_KEY = 'short';
      config = new Configuration(mockEnv);
      
      expect(consoleSpy).toHaveBeenCalledWith('YouTube API key seems too short');
      consoleSpy.mockRestore();
    });

    test('should handle missing YouTube configuration gracefully', () => {
      delete mockEnv.YOUTUBE_CHANNEL_ID;
      delete mockEnv.YOUTUBE_API_KEY;
      config = new Configuration(mockEnv);
      
      expect(() => config.validateYouTubeConfig()).not.toThrow();
    });
  });

  describe('X (Twitter) Configuration Validation', () => {
    beforeEach(() => {
      config = new Configuration(mockEnv);
    });

    test('should throw error for X user with @ symbol', () => {
      mockEnv.X_USER = '@testuser';
      
      expect(() => new Configuration(mockEnv)).toThrow(
        'Configuration validation failed: X_USER should be username without @ symbol and no spaces'
      );
    });

    test('should throw error for X user with spaces', () => {
      mockEnv.X_USER = 'test user';
      
      expect(() => new Configuration(mockEnv)).toThrow(
        'Configuration validation failed: X_USER should be username without @ symbol and no spaces'
      );
    });

    test('should warn about short X query interval', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockEnv.X_QUERY_INTERVALL_MIN = '30000';
      config = new Configuration(mockEnv);
      
      expect(consoleSpy).toHaveBeenCalledWith('X query interval less than 1 minute may cause rate limiting');
      consoleSpy.mockRestore();
    });

    test('should handle missing X configuration gracefully', () => {
      delete mockEnv.X_USER;
      delete mockEnv.X_QUERY_INTERVALL_MIN;
      config = new Configuration(mockEnv);
      
      expect(() => config.validateXConfig()).not.toThrow();
    });
  });

  describe('Configuration Retrieval and Security', () => {
    beforeEach(() => {
      config = new Configuration(mockEnv);
    });

    test('should get all configuration without secrets by default', () => {
      const allConfig = config.getAllConfig();
      
      expect(allConfig.LOG_LEVEL).toBe('info');
      expect(allConfig.DISCORD_SUPPORT_CHANNEL_ID).toBe('123456789012345678');
      expect(allConfig.DISCORD_BOT_TOKEN).toBe('[REDACTED]');
      expect(allConfig.YOUTUBE_API_KEY).toBe('[REDACTED]');
    });

    test('should get all configuration including secrets when requested', () => {
      const allConfig = config.getAllConfig(true);
      
      expect(allConfig.DISCORD_BOT_TOKEN).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dGVzdA.hash123');
      expect(allConfig.YOUTUBE_API_KEY).toBe('AIzaSyDemoKeyForTestingPurposes12345');
    });

    test('should only include relevant configuration keys', () => {
      mockEnv.IRRELEVANT_KEY = 'should-not-appear';
      config = new Configuration(mockEnv);
      
      const allConfig = config.getAllConfig(true);
      
      expect(allConfig.IRRELEVANT_KEY).toBeUndefined();
      expect(allConfig.DISCORD_BOT_TOKEN).toBeDefined();
    });

    test('should check configuration validity', () => {
      expect(config.isValid()).toBe(true);
    });

    test('should return false for invalid configuration', () => {
      validateEnvironmentVariables.mockImplementation(() => {
        throw new Error('Invalid config');
      });
      
      config = new Configuration(mockEnv);
      
      expect(config.isValid()).toBe(false);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty environment', () => {
      validateEnvironmentVariables.mockReturnValue(true);
      config = new Configuration({});
      
      expect(config.get('ANY_KEY')).toBeUndefined();
      expect(config.get('ANY_KEY', 'default')).toBe('default');
    });

    test('should handle null and undefined values', () => {
      mockEnv.NULL_VALUE = null;
      mockEnv.UNDEFINED_VALUE = undefined;
      config = new Configuration(mockEnv);
      
      expect(config.get('NULL_VALUE')).toBeNull();
      expect(config.get('UNDEFINED_VALUE')).toBeUndefined();
    });

    test('should handle numeric string edge cases', () => {
      mockEnv.ZERO_STRING = '0';
      mockEnv.NEGATIVE_STRING = '-42';
      mockEnv.FLOAT_STRING = '3.14';
      config = new Configuration(mockEnv);
      
      expect(config.getNumber('ZERO_STRING')).toBe(0);
      expect(config.getNumber('NEGATIVE_STRING')).toBe(-42);
      expect(config.getNumber('FLOAT_STRING')).toBe(3); // parseInt truncates
    });

    test('should handle boolean edge cases', () => {
      mockEnv.EMPTY_STRING = '';
      config = new Configuration(mockEnv);
      
      expect(() => config.getBoolean('EMPTY_STRING')).toThrow(
        "Configuration key 'EMPTY_STRING' must be a boolean value, got: "
      );
    });
  });
});