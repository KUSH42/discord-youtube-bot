import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Configuration } from '../../src/infrastructure/configuration.js';

// Mock the config-validator module
jest.mock('../../src/config-validator.js', () => ({
  validateEnvironmentVariables: jest.fn(() => true),
  validateDiscordChannelId: jest.fn(() => true),
  validateYouTubeChannelId: jest.fn(() => true)
}));

describe('Configuration', () => {
  let mockEnv;
  
  beforeEach(() => {
    mockEnv = {
      'DISCORD_BOT_TOKEN': 'test-token',
      'YOUTUBE_API_KEY': 'test-youtube-key',
      'YOUTUBE_CHANNEL_ID': 'UC123456789012345678901',
      'DISCORD_SUPPORT_CHANNEL_ID': '123456789012345678',
      'DISCORD_YOUTUBE_CHANNEL_ID': '123456789012345679',
      'DISCORD_X_CHANNEL_ID': '123456789012345680',
      'X_USER': 'testuser',
      'X_QUERY_INTERVALL_MIN': '300000',
      'ANNOUNCEMENT_ENABLED': 'true',
      'X_VX_TWITTER_CONVERSION': 'false'
    };
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Basic Configuration Operations', () => {
    it('should initialize with environment source', () => {
      const config = new Configuration(mockEnv);
      expect(config.env).toBe(mockEnv);
    });
    
    it('should get configuration values', () => {
      const config = new Configuration(mockEnv);
      
      expect(config.get('DISCORD_BOT_TOKEN')).toBe('test-token');
      expect(config.get('NON_EXISTENT')).toBeUndefined();
      expect(config.get('NON_EXISTENT', 'default')).toBe('default');
    });
    
    it('should get required configuration values', () => {
      const config = new Configuration(mockEnv);
      
      expect(config.getRequired('DISCORD_BOT_TOKEN')).toBe('test-token');
      expect(() => config.getRequired('NON_EXISTENT')).toThrow('Required configuration key \'NON_EXISTENT\' is missing');
    });
    
    it('should get numeric configuration values', () => {
      const config = new Configuration(mockEnv);
      
      expect(config.getNumber('X_QUERY_INTERVALL_MIN')).toBe(300000);
      expect(config.getNumber('NON_EXISTENT', 500)).toBe(500);
      expect(config.getNumber('NON_EXISTENT')).toBeUndefined();
    });
    
    it('should validate numeric values', () => {
      const invalidEnv = { ...mockEnv, 'X_QUERY_INTERVALL_MIN': 'not-a-number' };
      const config = new Configuration(invalidEnv);
      
      expect(() => config.getNumber('X_QUERY_INTERVALL_MIN')).toThrow('must be a valid number');
    });
    
    it('should get boolean configuration values', () => {
      const config = new Configuration(mockEnv);
      
      expect(config.getBoolean('ANNOUNCEMENT_ENABLED')).toBe(true);
      expect(config.getBoolean('X_VX_TWITTER_CONVERSION')).toBe(false);
      expect(config.getBoolean('NON_EXISTENT', true)).toBe(true);
    });
    
    it('should handle various boolean formats', () => {
      const booleanEnv = {
        'TRUE_1': 'true',
        'TRUE_2': 'TRUE',
        'TRUE_3': '1',
        'TRUE_4': 'yes',
        'FALSE_1': 'false',
        'FALSE_2': 'FALSE',
        'FALSE_3': '0',
        'FALSE_4': 'no'
      };
      
      const config = new Configuration(booleanEnv);
      
      expect(config.getBoolean('TRUE_1')).toBe(true);
      expect(config.getBoolean('TRUE_2')).toBe(true);
      expect(config.getBoolean('TRUE_3')).toBe(true);
      expect(config.getBoolean('TRUE_4')).toBe(true);
      expect(config.getBoolean('FALSE_1')).toBe(false);
      expect(config.getBoolean('FALSE_2')).toBe(false);
      expect(config.getBoolean('FALSE_3')).toBe(false);
      expect(config.getBoolean('FALSE_4')).toBe(false);
    });
    
    it('should validate boolean values', () => {
      const invalidEnv = { ...mockEnv, 'ANNOUNCEMENT_ENABLED': 'maybe' };
      const config = new Configuration(invalidEnv);
      
      expect(() => config.getBoolean('ANNOUNCEMENT_ENABLED')).toThrow('must be a boolean value');
    });
  });
  
  describe('Configuration Validation', () => {
    it('should validate all configuration on initialization', () => {
      const { validateEnvironmentVariables } = require('../../src/config-validator.js');
      const config = new Configuration(mockEnv);
      
      expect(validateEnvironmentVariables).toHaveBeenCalledWith(mockEnv);
      expect(config.validated).toBe(true);
    });
    
    it('should throw error on validation failure', () => {
      const { validateEnvironmentVariables } = require('../../src/config-validator.js');
      validateEnvironmentVariables.mockImplementation(() => {
        throw new Error('Validation failed');
      });
      
      expect(() => new Configuration(mockEnv)).toThrow('Configuration validation failed: Validation failed');
    });
    
    it('should validate Discord configuration', () => {
      // This should not throw with valid IDs
      expect(() => new Configuration(mockEnv)).not.toThrow();
    });
    
    it('should validate YouTube configuration', () => {
      const { validateYouTubeChannelId } = require('../../src/config-validator.js');
      validateYouTubeChannelId.mockReturnValue(false);
      
      expect(() => new Configuration(mockEnv)).toThrow('Invalid YouTube channel ID format');
    });
    
    it('should validate X configuration', () => {
      const invalidXEnv = { ...mockEnv, 'X_USER': '@invaliduser' };
      
      expect(() => new Configuration(invalidXEnv)).toThrow('X_USER should be username without @ symbol');
    });
    
    it('should warn about short intervals', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const shortIntervalEnv = { ...mockEnv, 'X_QUERY_INTERVALL_MIN': '30000' };
      
      new Configuration(shortIntervalEnv);
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('less than 1 minute'));
      consoleSpy.mockRestore();
    });
  });
  
  describe('Configuration Retrieval', () => {
    it('should get all configuration without secrets', () => {
      const config = new Configuration(mockEnv);
      const allConfig = config.getAllConfig(false);
      
      expect(allConfig['DISCORD_BOT_TOKEN']).toBe('[REDACTED]');
      expect(allConfig['YOUTUBE_API_KEY']).toBe('[REDACTED]');
      expect(allConfig['DISCORD_SUPPORT_CHANNEL_ID']).toBe('123456789012345678');
    });
    
    it('should get all configuration with secrets', () => {
      const config = new Configuration(mockEnv);
      const allConfig = config.getAllConfig(true);
      
      expect(allConfig['DISCORD_BOT_TOKEN']).toBe('test-token');
      expect(allConfig['YOUTUBE_API_KEY']).toBe('test-youtube-key');
    });
    
    it('should filter configuration keys', () => {
      const config = new Configuration({
        ...mockEnv,
        'UNRELATED_KEY': 'value',
        'ANOTHER_KEY': 'value'
      });
      
      const allConfig = config.getAllConfig(false);
      expect(allConfig['UNRELATED_KEY']).toBeUndefined();
      expect(allConfig['DISCORD_BOT_TOKEN']).toBeDefined();
    });
  });
  
  describe('Configuration Validation Methods', () => {
    it('should check if configuration is valid', () => {
      const config = new Configuration(mockEnv);
      expect(config.isValid()).toBe(true);
    });
    
    it('should return false for invalid configuration', () => {
      const { validateEnvironmentVariables } = require('../../src/config-validator.js');
      validateEnvironmentVariables.mockImplementation(() => {
        throw new Error('Invalid');
      });
      
      const config = new Configuration({});
      expect(config.isValid()).toBe(false);
    });
  });
  
  describe('Edge Cases and Error Handling', () => {
    it('should handle null environment source', () => {
      expect(() => new Configuration(null)).toThrow();
    });
    
    it('should handle empty environment', () => {
      const { validateEnvironmentVariables } = require('../../src/config-validator.js');
      validateEnvironmentVariables.mockImplementation(() => {
        throw new Error('Missing required variables');
      });
      
      expect(() => new Configuration({})).toThrow();
    });
    
    it('should handle undefined values gracefully', () => {
      const config = new Configuration({ 'KEY': undefined });
      
      expect(config.get('KEY')).toBeUndefined();
      expect(config.get('KEY', 'default')).toBe('default');
    });
    
    it('should handle numeric edge cases', () => {
      const edgeCaseEnv = {
        'ZERO': '0',
        'NEGATIVE': '-100',
        'FLOAT': '123.45'
      };
      
      const config = new Configuration(edgeCaseEnv);
      
      expect(config.getNumber('ZERO')).toBe(0);
      expect(config.getNumber('NEGATIVE')).toBe(-100);
      expect(config.getNumber('FLOAT')).toBe(123); // parseInt truncates
    });
    
    it('should handle boolean edge cases', () => {
      const edgeCaseEnv = {
        'EMPTY': '',
        'SPACE': ' ',
        'MIXED_CASE': 'TrUe'
      };
      
      const config = new Configuration(edgeCaseEnv);
      
      expect(() => config.getBoolean('EMPTY')).toThrow();
      expect(() => config.getBoolean('SPACE')).toThrow();
      expect(config.getBoolean('MIXED_CASE')).toBe(true);
    });
  });
  
  describe('Performance', () => {
    it('should handle large configuration objects efficiently', () => {
      const largeEnv = {};
      for (let i = 0; i < 1000; i++) {
        largeEnv[`KEY_${i}`] = `value_${i}`;
      }
      
      const startTime = Date.now();
      const config = new Configuration({ ...mockEnv, ...largeEnv });
      const endTime = Date.now();
      
      // Should complete within reasonable time (1 second)
      expect(endTime - startTime).toBeLessThan(1000);
      expect(config.get('KEY_500')).toBe('value_500');
    });
  });
});