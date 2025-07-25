import { describe, it, expect } from '@jest/globals';
import {
  getXScrapingBrowserConfig,
  getYouTubeScrapingBrowserConfig,
  getProfileBrowserConfig,
  validateBrowserArgs,
  SAFE_BROWSER_ARGS,
  DANGEROUS_BROWSER_ARGS,
} from '../../../src/utilities/browser-config.js';

describe('Browser Configuration Utility', () => {
  describe('getXScrapingBrowserConfig', () => {
    it('should return default X scraping configuration', () => {
      const config = getXScrapingBrowserConfig();

      expect(config).toHaveProperty('headless', false);
      expect(config).toHaveProperty('args');
      expect(config.args).toEqual(expect.arrayContaining(SAFE_BROWSER_ARGS));
    });

    it('should accept custom headless option', () => {
      const config = getXScrapingBrowserConfig({ headless: true });
      expect(config.headless).toBe(true);
    });

    it('should include additional args when provided', () => {
      const additionalArgs = ['--custom-arg', '--another-arg'];
      const config = getXScrapingBrowserConfig({ additionalArgs });

      expect(config.args).toEqual(expect.arrayContaining(additionalArgs));
    });
  });

  describe('getYouTubeScrapingBrowserConfig', () => {
    it('should return default YouTube scraping configuration', () => {
      const config = getYouTubeScrapingBrowserConfig();

      expect(config).toHaveProperty('headless', false);
      expect(config).toHaveProperty('args');
      expect(config.args).toEqual(expect.arrayContaining(SAFE_BROWSER_ARGS));
    });
  });

  describe('getProfileBrowserConfig', () => {
    it('should return default profile configuration', () => {
      const config = getProfileBrowserConfig();

      expect(config).toHaveProperty('headless', true);
      expect(config).toHaveProperty('args');
      expect(config.args).toEqual(expect.arrayContaining(SAFE_BROWSER_ARGS));
    });

    it('should include userDataDir when provided', () => {
      const userDataDir = '/path/to/profile';
      const config = getProfileBrowserConfig({ userDataDir });

      expect(config.userDataDir).toBe(userDataDir);
    });
  });

  describe('validateBrowserArgs', () => {
    it('should validate safe args as valid', () => {
      const result = validateBrowserArgs(SAFE_BROWSER_ARGS);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.dangerousArgs).toHaveLength(0);
    });

    it('should identify dangerous args', () => {
      const result = validateBrowserArgs(['--disable-web-security']);

      expect(result.isValid).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.dangerousArgs).toContain('--disable-web-security');
    });

    it('should provide warnings for dangerous args', () => {
      const result = validateBrowserArgs(['--disable-extensions']);

      expect(result.warnings[0]).toContain('Dangerous argument detected');
      expect(result.warnings[0]).toContain('--disable-extensions');
    });
  });

  describe('Constants', () => {
    it('should export SAFE_BROWSER_ARGS', () => {
      expect(SAFE_BROWSER_ARGS).toBeDefined();
      expect(Array.isArray(SAFE_BROWSER_ARGS)).toBe(true);
      expect(SAFE_BROWSER_ARGS.length).toBeGreaterThan(0);
    });

    it('should export DANGEROUS_BROWSER_ARGS', () => {
      expect(DANGEROUS_BROWSER_ARGS).toBeDefined();
      expect(Array.isArray(DANGEROUS_BROWSER_ARGS)).toBe(true);
      expect(DANGEROUS_BROWSER_ARGS.length).toBeGreaterThan(0);
    });

    it('should have safe args that do not overlap with dangerous args', () => {
      const overlap = SAFE_BROWSER_ARGS.filter(arg => DANGEROUS_BROWSER_ARGS.includes(arg));
      expect(overlap).toHaveLength(0);
    });
  });
});
