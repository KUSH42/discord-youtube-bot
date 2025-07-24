import { jest } from '@jest/globals';
import { UserAgentManager } from '../../../../src/services/browser-stealth/user-agent-manager.js';

describe('UserAgentManager', () => {
  let userAgentManager;

  beforeEach(() => {
    userAgentManager = new UserAgentManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrentUserAgent', () => {
    it('should return a valid user agent string', () => {
      const userAgent = userAgentManager.getCurrentUserAgent();

      expect(userAgent).toBeDefined();
      expect(typeof userAgent).toBe('string');
      expect(userAgent.length).toBeGreaterThan(50);
      expect(userAgent).toMatch(/Mozilla\/5\.0/);
    });

    it('should return consistent user agent within rotation interval', () => {
      const userAgent1 = userAgentManager.getCurrentUserAgent();
      const userAgent2 = userAgentManager.getCurrentUserAgent();

      expect(userAgent1).toBe(userAgent2);
    });

    it('should rotate user agent after interval expires', () => {
      const originalUserAgent = userAgentManager.getCurrentUserAgent();

      // Simulate time passage beyond rotation interval
      userAgentManager.lastRotation = timestampUTC() - (userAgentManager.rotationInterval + 1000);

      const newUserAgent = userAgentManager.getCurrentUserAgent();

      // Note: There's a small chance they could be the same due to random selection
      // But we can test that rotation logic was triggered
      expect(userAgentManager.lastRotation).toBeGreaterThan(timestampUTC() - 1000);
    });
  });

  describe('rotateUserAgent', () => {
    it('should change to next user agent in pool', () => {
      const initialIndex = userAgentManager.currentIndex;
      const initialUserAgent = userAgentManager.getCurrentUserAgent();

      const newUserAgent = userAgentManager.rotateUserAgent();

      expect(userAgentManager.currentIndex).toBe((initialIndex + 1) % userAgentManager.userAgentPool.length);
      expect(newUserAgent).toBeDefined();
      expect(typeof newUserAgent).toBe('string');
    });

    it('should wrap around to beginning of pool', () => {
      // Set to last index
      userAgentManager.currentIndex = userAgentManager.userAgentPool.length - 1;

      userAgentManager.rotateUserAgent();

      expect(userAgentManager.currentIndex).toBe(0);
    });

    it('should update last rotation timestamp', () => {
      const beforeRotation = timestampUTC();

      userAgentManager.rotateUserAgent();

      expect(userAgentManager.lastRotation).toBeGreaterThanOrEqual(beforeRotation);
    });
  });

  describe('getMatchingViewport', () => {
    it('should return appropriate viewport for Windows user agent', () => {
      const windowsUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

      const viewport = userAgentManager.getMatchingViewport(windowsUA);

      expect(viewport).toHaveProperty('width');
      expect(viewport).toHaveProperty('height');
      expect(viewport.width).toBeGreaterThan(0);
      expect(viewport.height).toBeGreaterThan(0);
      expect([1920, 1366, 1536, 1440]).toContain(viewport.width);
    });

    it('should return appropriate viewport for macOS user agent', () => {
      const macUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

      const viewport = userAgentManager.getMatchingViewport(macUA);

      expect(viewport).toHaveProperty('width');
      expect(viewport).toHaveProperty('height');
      expect([1440, 1680, 1280, 1920]).toContain(viewport.width);
    });

    it('should return appropriate viewport for Linux user agent', () => {
      const linuxUA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36';

      const viewport = userAgentManager.getMatchingViewport(linuxUA);

      expect(viewport).toHaveProperty('width');
      expect(viewport).toHaveProperty('height');
      expect([1920, 1366, 1600, 1280]).toContain(viewport.width);
    });

    it('should return default viewport for unknown user agent', () => {
      const unknownUA = 'Unknown Browser';

      const viewport = userAgentManager.getMatchingViewport(unknownUA);

      expect(viewport).toEqual({ width: 1366, height: 768 });
    });

    it('should use current user agent when none provided', () => {
      const viewport = userAgentManager.getMatchingViewport();

      expect(viewport).toHaveProperty('width');
      expect(viewport).toHaveProperty('height');
    });
  });

  describe('getPlatform', () => {
    it('should identify Windows platform', () => {
      const windowsUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

      const platform = userAgentManager.getPlatform(windowsUA);

      expect(platform).toBe('windows');
    });

    it('should identify macOS platform', () => {
      const macUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

      const platform = userAgentManager.getPlatform(macUA);

      expect(platform).toBe('macos');
    });

    it('should identify Linux platform', () => {
      const linuxUA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36';

      const platform = userAgentManager.getPlatform(linuxUA);

      expect(platform).toBe('linux');
    });

    it('should return unknown for unrecognized platform', () => {
      const unknownUA = 'Unknown Browser';

      const platform = userAgentManager.getPlatform(unknownUA);

      expect(platform).toBe('unknown');
    });
  });

  describe('getBrowserName', () => {
    it('should identify Chrome browser', () => {
      const chromeUA =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

      const browser = userAgentManager.getBrowserName(chromeUA);

      expect(browser).toBe('chrome');
    });

    it('should identify Edge browser', () => {
      const edgeUA =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';

      const browser = userAgentManager.getBrowserName(edgeUA);

      expect(browser).toBe('edge');
    });

    it('should identify Firefox browser', () => {
      const firefoxUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0';

      const browser = userAgentManager.getBrowserName(firefoxUA);

      expect(browser).toBe('firefox');
    });

    it('should return unknown for unrecognized browser', () => {
      const unknownUA = 'Unknown Browser';

      const browser = userAgentManager.getBrowserName(unknownUA);

      expect(browser).toBe('unknown');
    });
  });

  describe('getAcceptLanguage', () => {
    it('should return Windows-specific Accept-Language', () => {
      const windowsUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

      const acceptLanguage = userAgentManager.getAcceptLanguage(windowsUA);

      expect(acceptLanguage).toBe('en-US,en;q=0.9,es;q=0.8');
    });

    it('should return macOS-specific Accept-Language', () => {
      const macUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

      const acceptLanguage = userAgentManager.getAcceptLanguage(macUA);

      expect(acceptLanguage).toBe('en-US,en;q=0.9,fr;q=0.8');
    });

    it('should return Linux-specific Accept-Language', () => {
      const linuxUA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36';

      const acceptLanguage = userAgentManager.getAcceptLanguage(linuxUA);

      expect(acceptLanguage).toBe('en-US,en;q=0.9,de;q=0.8');
    });

    it('should return default Accept-Language for unknown platform', () => {
      const unknownUA = 'Unknown Browser';

      const acceptLanguage = userAgentManager.getAcceptLanguage(unknownUA);

      expect(acceptLanguage).toBe('en-US,en;q=0.9');
    });
  });

  describe('getRotationStatus', () => {
    it('should return comprehensive rotation status', () => {
      const status = userAgentManager.getRotationStatus();

      expect(status).toHaveProperty('currentIndex');
      expect(status).toHaveProperty('currentUserAgent');
      expect(status).toHaveProperty('platform');
      expect(status).toHaveProperty('browserName');
      expect(status).toHaveProperty('lastRotation');
      expect(status).toHaveProperty('nextRotation');
      expect(status).toHaveProperty('totalUserAgents');

      expect(typeof status.currentIndex).toBe('number');
      expect(typeof status.currentUserAgent).toBe('string');
      expect(typeof status.platform).toBe('string');
      expect(typeof status.browserName).toBe('string');
      expect(typeof status.lastRotation).toBe('number');
      expect(typeof status.nextRotation).toBe('number');
      expect(typeof status.totalUserAgents).toBe('number');

      expect(status.totalUserAgents).toBe(userAgentManager.userAgentPool.length);
    });
  });

  describe('setUserAgentByIndex', () => {
    it('should set user agent to specific index', () => {
      const targetIndex = 2;

      const userAgent = userAgentManager.setUserAgentByIndex(targetIndex);

      expect(userAgentManager.currentIndex).toBe(targetIndex);
      expect(userAgent).toBe(userAgentManager.userAgentPool[targetIndex]);
    });

    it('should update last rotation timestamp', () => {
      const beforeSet = timestampUTC();

      userAgentManager.setUserAgentByIndex(1);

      expect(userAgentManager.lastRotation).toBeGreaterThanOrEqual(beforeSet);
    });

    it('should throw error for invalid index', () => {
      expect(() => {
        userAgentManager.setUserAgentByIndex(-1);
      }).toThrow('Invalid user agent index');

      expect(() => {
        userAgentManager.setUserAgentByIndex(userAgentManager.userAgentPool.length);
      }).toThrow('Invalid user agent index');
    });
  });

  describe('setRotationInterval', () => {
    it('should update rotation interval', () => {
      const newInterval = 1800000; // 30 minutes

      userAgentManager.setRotationInterval(newInterval);

      expect(userAgentManager.rotationInterval).toBe(newInterval);
    });

    it('should throw error for interval less than minimum', () => {
      expect(() => {
        userAgentManager.setRotationInterval(30000); // 30 seconds
      }).toThrow('Rotation interval must be at least 60000ms');
    });
  });

  describe('user agent pool diversity', () => {
    it('should have diverse user agents from different platforms', () => {
      const platforms = new Set();
      const browsers = new Set();

      for (const ua of userAgentManager.userAgentPool) {
        platforms.add(userAgentManager.getPlatform(ua));
        browsers.add(userAgentManager.getBrowserName(ua));
      }

      expect(platforms.size).toBeGreaterThan(1);
      expect(platforms.has('windows')).toBe(true);
      expect(platforms.has('macos')).toBe(true);
      expect(platforms.has('linux')).toBe(true);

      expect(browsers.has('chrome')).toBe(true);
      expect(browsers.has('firefox')).toBe(true);
      expect(browsers.has('edge')).toBe(true);
    });

    it('should have reasonable pool size', () => {
      expect(userAgentManager.userAgentPool.length).toBeGreaterThan(5);
      expect(userAgentManager.userAgentPool.length).toBeLessThan(50);
    });
  });
});
