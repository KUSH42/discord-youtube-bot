import { jest } from '@jest/globals';
import {
  STEALTH_SCRIPTS,
  STEALTH_BROWSER_ARGS,
  IGNORE_DEFAULT_ARGS,
  getStealthHeaders,
} from '../../../../src/services/browser-stealth/stealth-scripts.js';

describe('StealthScripts', () => {
  describe('STEALTH_SCRIPTS', () => {
    it('should be a string containing JavaScript code', () => {
      expect(typeof STEALTH_SCRIPTS).toBe('string');
      expect(STEALTH_SCRIPTS.length).toBeGreaterThan(1000);
      expect(STEALTH_SCRIPTS).toContain('navigator');
      expect(STEALTH_SCRIPTS).toContain('webdriver');
    });

    it('should contain webdriver property removal', () => {
      expect(STEALTH_SCRIPTS).toContain('navigator.webdriver');
      expect(STEALTH_SCRIPTS).toContain('get: () => undefined');
    });

    it('should contain chrome automation detection removal', () => {
      expect(STEALTH_SCRIPTS).toContain('window.chrome.runtime.onConnect');
      expect(STEALTH_SCRIPTS).toContain('window.chrome.loadTimes');
    });

    it('should contain cdc_ property removal', () => {
      expect(STEALTH_SCRIPTS).toContain('cdc_');
      expect(STEALTH_SCRIPTS).toContain('startsWith');
    });

    it('should contain plugin spoofing', () => {
      expect(STEALTH_SCRIPTS).toContain('Chrome PDF Plugin');
      expect(STEALTH_SCRIPTS).toContain('Chromium PDF Plugin');
      expect(STEALTH_SCRIPTS).toContain('Microsoft Edge PDF Plugin');
    });

    it('should contain permission API override', () => {
      expect(STEALTH_SCRIPTS).toContain('navigator.permissions.query');
      expect(STEALTH_SCRIPTS).toContain('notifications');
    });

    it('should contain language spoofing', () => {
      expect(STEALTH_SCRIPTS).toContain('navigator.languages');
      expect(STEALTH_SCRIPTS).toContain('en-US');
    });

    it('should contain canvas fingerprint protection', () => {
      expect(STEALTH_SCRIPTS).toContain('HTMLCanvasElement.prototype.toDataURL');
      expect(STEALTH_SCRIPTS).toContain('getImageData');
      expect(STEALTH_SCRIPTS).toContain('Math.random()');
    });

    it('should contain WebGL parameter spoofing', () => {
      expect(STEALTH_SCRIPTS).toContain('WebGLRenderingContext.prototype.getParameter');
      expect(STEALTH_SCRIPTS).toContain('37445'); // UNMASKED_VENDOR_WEBGL
      expect(STEALTH_SCRIPTS).toContain('37446'); // UNMASKED_RENDERER_WEBGL
      expect(STEALTH_SCRIPTS).toContain('Intel Inc.');
    });

    it('should contain audio context protection', () => {
      expect(STEALTH_SCRIPTS).toContain('AudioContext');
      expect(STEALTH_SCRIPTS).toContain('webkitAudioContext');
    });

    it('should contain screen property spoofing', () => {
      expect(STEALTH_SCRIPTS).toContain('window.screen');
      expect(STEALTH_SCRIPTS).toContain('availWidth');
      expect(STEALTH_SCRIPTS).toContain('window.innerWidth');
    });

    it('should contain iframe detection hiding', () => {
      expect(STEALTH_SCRIPTS).toContain('window.top');
      expect(STEALTH_SCRIPTS).toContain('window.self');
    });

    it('should contain performance timing spoofing', () => {
      expect(STEALTH_SCRIPTS).toContain('window.performance.timing');
      expect(STEALTH_SCRIPTS).toContain('navigationStart');
      expect(STEALTH_SCRIPTS).toContain('domainLookupStart');
    });

    it('should contain battery API spoofing', () => {
      expect(STEALTH_SCRIPTS).toContain('navigator.getBattery');
      expect(STEALTH_SCRIPTS).toContain('charging: true');
      expect(STEALTH_SCRIPTS).toContain('level: 1');
    });
  });

  describe('STEALTH_BROWSER_ARGS', () => {
    it('should be an array of browser arguments', () => {
      expect(Array.isArray(STEALTH_BROWSER_ARGS)).toBe(true);
      expect(STEALTH_BROWSER_ARGS.length).toBeGreaterThan(20);
    });

    it('should contain core stealth arguments', () => {
      expect(STEALTH_BROWSER_ARGS).toContain('--disable-blink-features=AutomationControlled');
      expect(STEALTH_BROWSER_ARGS).toContain('--exclude-switches=enable-automation');
      expect(STEALTH_BROWSER_ARGS).toContain('--disable-component-extensions-with-background-pages');
    });

    it('should contain fingerprinting resistance arguments', () => {
      expect(STEALTH_BROWSER_ARGS).toContain('--disable-client-side-phishing-detection');
      expect(STEALTH_BROWSER_ARGS).toContain('--disable-sync');
      expect(STEALTH_BROWSER_ARGS).toContain('--disable-features=TranslateUI');
    });

    it('should contain performance optimization arguments', () => {
      expect(STEALTH_BROWSER_ARGS).toContain('--disable-background-timer-throttling');
      expect(STEALTH_BROWSER_ARGS).toContain('--disable-renderer-backgrounding');
      expect(STEALTH_BROWSER_ARGS).toContain('--run-all-compositor-stages-before-draw');
    });

    it('should contain security and detection bypass arguments', () => {
      expect(STEALTH_BROWSER_ARGS).toContain('--disable-web-security');
      expect(STEALTH_BROWSER_ARGS).toContain('--no-first-run');
      expect(STEALTH_BROWSER_ARGS).toContain('--disable-extensions');
    });

    it('should contain networking and privacy arguments', () => {
      expect(STEALTH_BROWSER_ARGS).toContain('--disable-background-networking');
      expect(STEALTH_BROWSER_ARGS).toContain('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
      expect(STEALTH_BROWSER_ARGS).toContain('--no-proxy-server');
    });

    it('should contain UI and interaction arguments', () => {
      expect(STEALTH_BROWSER_ARGS).toContain('--hide-scrollbars');
      expect(STEALTH_BROWSER_ARGS).toContain('--mute-audio');
      expect(STEALTH_BROWSER_ARGS).toContain('--disable-popup-blocking');
    });

    it('should all be valid command line arguments', () => {
      STEALTH_BROWSER_ARGS.forEach(arg => {
        expect(typeof arg).toBe('string');
        expect(arg).toMatch(/^--.+/);
      });
    });

    it('should not contain duplicate arguments', () => {
      const uniqueArgs = [...new Set(STEALTH_BROWSER_ARGS)];
      expect(uniqueArgs).toHaveLength(STEALTH_BROWSER_ARGS.length);
    });
  });

  describe('IGNORE_DEFAULT_ARGS', () => {
    it('should be an array of arguments to ignore', () => {
      expect(Array.isArray(IGNORE_DEFAULT_ARGS)).toBe(true);
      expect(IGNORE_DEFAULT_ARGS.length).toBeGreaterThan(0);
    });

    it('should contain automation-related arguments to ignore', () => {
      expect(IGNORE_DEFAULT_ARGS).toContain('--enable-automation');
      expect(IGNORE_DEFAULT_ARGS).toContain('--enable-blink-features=AutomationControlled');
      expect(IGNORE_DEFAULT_ARGS).toContain('--disable-component-extensions-with-background-pages');
    });

    it('should contain extension and app arguments to ignore', () => {
      expect(IGNORE_DEFAULT_ARGS).toContain('--disable-default-apps');
      expect(IGNORE_DEFAULT_ARGS).toContain('--disable-extensions');
    });

    it('should all be valid command line arguments', () => {
      IGNORE_DEFAULT_ARGS.forEach(arg => {
        expect(typeof arg).toBe('string');
        expect(arg).toMatch(/^--.+/);
      });
    });

    it('should not contain duplicate arguments', () => {
      const uniqueArgs = [...new Set(IGNORE_DEFAULT_ARGS)];
      expect(uniqueArgs).toHaveLength(IGNORE_DEFAULT_ARGS.length);
    });
  });

  describe('getStealthHeaders', () => {
    it('should return proper HTTP headers with provided user agent', () => {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
      const headers = getStealthHeaders(userAgent);

      expect(headers).toMatchObject({
        'User-Agent': userAgent,
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Accept: expect.stringContaining('text/html'),
        'Cache-Control': 'max-age=0',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      });
    });

    it('should use default accept-language when not provided', () => {
      const userAgent = 'test-agent';
      const headers = getStealthHeaders(userAgent);

      expect(headers['Accept-Language']).toBe('en-US,en;q=0.9');
    });

    it('should use custom accept-language when provided', () => {
      const userAgent = 'test-agent';
      const acceptLanguage = 'de-DE,de;q=0.8,en;q=0.6';
      const headers = getStealthHeaders(userAgent, acceptLanguage);

      expect(headers['Accept-Language']).toBe(acceptLanguage);
    });

    it('should include Chrome security headers', () => {
      const headers = getStealthHeaders('test-agent');

      expect(headers).toHaveProperty('sec-ch-ua');
      expect(headers).toHaveProperty('sec-ch-ua-mobile');
      expect(headers).toHaveProperty('sec-ch-ua-platform');
      expect(headers['sec-ch-ua']).toContain('Chromium');
      expect(headers['sec-ch-ua-mobile']).toBe('?0');
      expect(headers['sec-ch-ua-platform']).toBe('"Windows"');
    });

    it('should include proper Accept header for HTML documents', () => {
      const headers = getStealthHeaders('test-agent');

      expect(headers.Accept).toContain('text/html');
      expect(headers.Accept).toContain('application/xhtml+xml');
      expect(headers.Accept).toContain('image/webp');
      expect(headers.Accept).toContain('*/*');
    });

    it('should include proper Sec-Fetch headers', () => {
      const headers = getStealthHeaders('test-agent');

      expect(headers['Sec-Fetch-Dest']).toBe('document');
      expect(headers['Sec-Fetch-Mode']).toBe('navigate');
      expect(headers['Sec-Fetch-Site']).toBe('none');
      expect(headers['Sec-Fetch-User']).toBe('?1');
    });

    it('should include proper caching headers', () => {
      const headers = getStealthHeaders('test-agent');

      expect(headers['Cache-Control']).toBe('max-age=0');
      expect(headers['Upgrade-Insecure-Requests']).toBe('1');
    });

    it('should include proper encoding headers', () => {
      const headers = getStealthHeaders('test-agent');

      expect(headers['Accept-Encoding']).toBe('gzip, deflate, br');
    });

    it('should handle empty user agent', () => {
      const headers = getStealthHeaders('');

      expect(headers['User-Agent']).toBe('');
      expect(headers).toHaveProperty('Accept-Language');
      expect(headers).toHaveProperty('Accept-Encoding');
    });

    it('should handle special characters in user agent', () => {
      const userAgent = 'Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.20';
      const headers = getStealthHeaders(userAgent);

      expect(headers['User-Agent']).toBe(userAgent);
    });

    it('should return object with all expected properties', () => {
      const headers = getStealthHeaders('test-agent');
      const expectedProperties = [
        'User-Agent',
        'Accept-Language',
        'Accept-Encoding',
        'Accept',
        'Cache-Control',
        'Sec-Fetch-Dest',
        'Sec-Fetch-Mode',
        'Sec-Fetch-Site',
        'Sec-Fetch-User',
        'Upgrade-Insecure-Requests',
        'sec-ch-ua',
        'sec-ch-ua-mobile',
        'sec-ch-ua-platform',
      ];

      expectedProperties.forEach(prop => {
        expect(headers).toHaveProperty(prop);
        expect(typeof headers[prop]).toBe('string');
      });
    });
  });

  describe('Script Integration Tests', () => {
    it('should have stealth args that complement ignore args', () => {
      // Check that args we ignore are not in stealth args
      IGNORE_DEFAULT_ARGS.forEach(ignoreArg => {
        expect(STEALTH_BROWSER_ARGS).not.toContain(ignoreArg);
      });
    });

    it('should have consistent approach to automation detection', () => {
      // Both should target automation indicators
      expect(STEALTH_SCRIPTS).toContain('AutomationControlled');
      expect(STEALTH_BROWSER_ARGS).toContain('--disable-blink-features=AutomationControlled');
      expect(IGNORE_DEFAULT_ARGS).toContain('--enable-blink-features=AutomationControlled');
    });

    it('should provide comprehensive stealth coverage', () => {
      // Should cover major detection vectors
      const detectionVectors = [
        'webdriver', // Navigator property
        'chrome', // Chrome runtime
        'cdc_', // ChromeDriver properties
        'plugins', // Plugin fingerprinting
        'canvas', // Canvas fingerprinting
        'WebGL', // WebGL fingerprinting
        'AudioContext', // Audio fingerprinting
        'performance', // Timing fingerprinting
      ];

      detectionVectors.forEach(vector => {
        expect(STEALTH_SCRIPTS).toContain(vector);
      });
    });

    it('should maintain realistic browser behavior', () => {
      // Should provide realistic values, not just remove properties
      expect(STEALTH_SCRIPTS).toContain('Intel Inc.'); // Realistic GPU vendor
      expect(STEALTH_SCRIPTS).toContain('Chrome PDF Plugin'); // Realistic plugin
      expect(STEALTH_SCRIPTS).toContain('en-US'); // Realistic language
      expect(STEALTH_SCRIPTS).toContain('charging: true'); // Realistic battery state
    });

    it('should include proper error handling patterns', () => {
      // Should check for property existence before manipulation
      expect(STEALTH_SCRIPTS).toContain('if (window.chrome');
      expect(STEALTH_SCRIPTS).toContain('if (navigator.getBattery');
      expect(STEALTH_SCRIPTS).toContain('if (window.AudioContext');
    });
  });

  describe('Performance and Security Considerations', () => {
    it('should not include obviously malicious patterns', () => {
      const maliciousPatterns = [
        'eval(',
        'Function(',
        'document.cookie',
        'localStorage.clear',
        'sessionStorage.clear',
        'XMLHttpRequest',
        'fetch(',
      ];

      maliciousPatterns.forEach(pattern => {
        expect(STEALTH_SCRIPTS).not.toContain(pattern);
      });
    });

    it('should use controlled randomization', () => {
      // Should use Math.random() for fingerprint resistance but in controlled way
      const randomMatches = STEALTH_SCRIPTS.match(/Math\.random\(\)/g);
      expect(randomMatches).not.toBeNull();
      expect(randomMatches.length).toBeLessThan(20); // Not excessive randomization
    });

    it('should preserve original functionality', () => {
      // Should preserve original methods while modifying behavior
      expect(STEALTH_SCRIPTS).toContain('originalToDataURL');
      expect(STEALTH_SCRIPTS).toContain('originalQuery');
      expect(STEALTH_SCRIPTS).toContain('getParameter.call');
    });

    it('should use defensive programming patterns', () => {
      // Should check for property existence and handle errors
      expect(STEALTH_SCRIPTS).toContain('if (');
      expect(STEALTH_SCRIPTS).toContain('&&');
      expect(STEALTH_SCRIPTS).not.toContain('throw new Error');
    });
  });
});
