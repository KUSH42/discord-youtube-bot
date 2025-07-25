/**
 * Stealth Scripts - Browser fingerprint masking and automation detection removal
 * JavaScript code injected into pages to hide automation signatures
 */

/**
 * Core stealth script to hide automation indicators
 * @type {string}
 */
export const STEALTH_SCRIPTS = `
  // Remove webdriver property
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
  });
  
  // Hide chrome automation indicators
  if (window.chrome && window.chrome.runtime && window.chrome.runtime.onConnect) {
    delete window.chrome.runtime.onConnect;
  }
  
  // Remove chrome.loadTimes function that indicates automation
  if (window.chrome && window.chrome.loadTimes) {
    delete window.chrome.loadTimes;
  }
  
  // Remove cdc_ properties that indicate ChromeDriver
  const cdcProps = Object.getOwnPropertyNames(window).filter(prop => prop.startsWith('cdc_'));
  cdcProps.forEach(prop => {
    delete window[prop];
  });
  
  // Spoof plugin array to appear natural
  Object.defineProperty(navigator, 'plugins', {
    get: () => ({
      0: { 
        name: 'Chrome PDF Plugin', 
        filename: 'internal-pdf-viewer',
        description: 'Portable Document Format',
        length: 1
      },
      1: { 
        name: 'Chromium PDF Plugin', 
        filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
        description: 'Portable Document Format',
        length: 1
      },
      2: { 
        name: 'Microsoft Edge PDF Plugin', 
        filename: 'pdf.dll',
        description: 'Portable Document Format',
        length: 1
      },
      length: 3,
      item: function(index) { return this[index] || null; },
      namedItem: function(name) {
        for (let i = 0; i < this.length; i++) {
          if (this[i].name === name) return this[i];
        }
        return null;
      }
    }),
  });
  
  // Override permission API to appear natural
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) => {
    if (parameters.name === 'notifications') {
      return Promise.resolve({ state: 'default' });
    }
    return originalQuery(parameters);
  };
  
  // Spoof language preferences
  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
  });
  
  // Override getUserMedia to appear natural
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia = function(constraints) {
      return originalGetUserMedia.call(this, constraints);
    };
  }
  
  // Spoof battery API to avoid fingerprinting
  if (navigator.getBattery) {
    navigator.getBattery = () => Promise.resolve({
      charging: true,
      chargingTime: 0,
      dischargingTime: Infinity,
      level: 1,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true
    });
  }
  
  // Override canvas toDataURL to reduce fingerprinting
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(type, encoderOptions) {
    // Add slight randomness to canvas fingerprint
    const context = this.getContext('2d');
    if (context) {
      const imageData = context.getImageData(0, 0, this.width, this.height);
      const data = imageData.data;
      
      // Add minimal noise to reduce fingerprinting accuracy
      for (let i = 0; i < data.length; i += 4) {
        if (Math.random() < 0.001) { // Very small chance to modify pixel
          data[i] = Math.min(255, data[i] + (Math.random() * 2 - 1));
          data[i + 1] = Math.min(255, data[i + 1] + (Math.random() * 2 - 1));
          data[i + 2] = Math.min(255, data[i + 2] + (Math.random() * 2 - 1));
        }
      }
      
      context.putImageData(imageData, 0, 0);
    }
    
    return originalToDataURL.call(this, type, encoderOptions);
  };
  
  // Override WebGL getParameter to reduce fingerprinting
  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    // Spoof common WebGL parameters used for fingerprinting
    if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
      return 'Intel Inc.';
    }
    if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
      return 'Intel Iris OpenGL Engine';
    }
    return getParameter.call(this, parameter);
  };
  
  // Override AudioContext to reduce fingerprinting
  if (window.AudioContext || window.webkitAudioContext) {
    const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
    const audioContexts = [];
    
    const MockAudioContext = function() {
      const context = new OriginalAudioContext();
      audioContexts.push(context);
      return context;
    };
    
    MockAudioContext.prototype = OriginalAudioContext.prototype;
    window.AudioContext = MockAudioContext;
    if (window.webkitAudioContext) {
      window.webkitAudioContext = MockAudioContext;
    }
  }
  
  // Override screen properties to match viewport
  const originalScreen = window.screen;
  Object.defineProperty(window, 'screen', {
    get: () => ({
      ...originalScreen,
      availWidth: window.innerWidth,
      availHeight: window.innerHeight,
      width: window.innerWidth,
      height: window.innerHeight
    })
  });
  
  // Remove automation-related window properties
  delete window.navigator.webdriver;
  delete window.navigator.plugins.namedItem('Chrome PDF Viewer');
  
  // Hide iframe detection
  if (window.top !== window.self) {
    Object.defineProperty(window, 'top', {
      get: () => window.self
    });
  }
  
  // Spoof performance timing to appear natural
  if (window.performance && window.performance.timing) {
    const timing = window.performance.timing;
    const now = Date.now();
    const navigationStart = now - Math.floor(Math.random() * 3000 + 1000);
    
    Object.defineProperty(window.performance, 'timing', {
      get: () => ({
        ...timing,
        navigationStart,
        domainLookupStart: navigationStart + Math.floor(Math.random() * 100 + 50),
        domainLookupEnd: navigationStart + Math.floor(Math.random() * 200 + 100),
        connectStart: navigationStart + Math.floor(Math.random() * 300 + 150),
        connectEnd: navigationStart + Math.floor(Math.random() * 400 + 200),
        requestStart: navigationStart + Math.floor(Math.random() * 500 + 250),
        responseStart: navigationStart + Math.floor(Math.random() * 800 + 400),
        responseEnd: navigationStart + Math.floor(Math.random() * 1200 + 600),
        domLoading: navigationStart + Math.floor(Math.random() * 1500 + 700),
        domContentLoadedEventStart: navigationStart + Math.floor(Math.random() * 2000 + 1000),
        domContentLoadedEventEnd: navigationStart + Math.floor(Math.random() * 2200 + 1100),
        loadEventStart: navigationStart + Math.floor(Math.random() * 2500 + 1200),
        loadEventEnd: navigationStart + Math.floor(Math.random() * 2800 + 1300)
      })
    });
  }
`;

/**
 * Advanced stealth browser launch arguments
 * @type {string[]}
 */
export const STEALTH_BROWSER_ARGS = [
  // Core stealth features
  '--disable-blink-features=AutomationControlled',
  '--disable-features=VizDisplayCompositor',
  '--exclude-switches=enable-automation',
  '--disable-component-extensions-with-background-pages',

  // Fingerprinting resistance
  '--disable-client-side-phishing-detection',
  '--disable-sync',
  '--disable-features=TranslateUI',
  '--disable-ipc-flooding-protection',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-features=VizDisplayCompositor',

  // Performance optimization for stealth
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--run-all-compositor-stages-before-draw',
  '--disable-features=VizDisplayCompositor',

  // Security and detection bypass
  '--disable-web-security',
  '--disable-site-isolation-trials',
  '--disable-features=VizDisplayCompositor',
  '--no-first-run',
  '--disable-default-apps',
  '--disable-popup-blocking',
  '--disable-prompt-on-repost',
  '--disable-hang-monitor',
  '--disable-background-networking',
  '--disable-background-mode',
  '--disable-breakpad',
  '--disable-component-update',
  '--disable-domain-reliability',
  '--disable-extensions',
  '--disable-features=MediaRouter',
  '--disable-plugins-discovery',
  '--disable-prerender-local-predictor',
  '--disable-print-preview',
  '--disable-speech-api',
  '--disable-suggestions-service',
  '--disable-web-resources',
  '--enable-features=NetworkService,NetworkServiceLogging',
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--hide-scrollbars',
  '--mute-audio',
  '--no-default-browser-check',
  '--no-pings',
  '--no-proxy-server',
  '--use-mock-keychain',
];

/**
 * Arguments to ignore from default Playwright arguments
 * @type {string[]}
 */
export const IGNORE_DEFAULT_ARGS = [
  '--enable-automation',
  '--enable-blink-features=AutomationControlled',
  '--disable-component-extensions-with-background-pages',
  '--disable-default-apps',
  '--disable-extensions',
];

/**
 * Get enhanced HTTP headers for stealth browsing
 * @param {string} userAgent - User agent string
 * @param {string} acceptLanguage - Accept-Language header value
 * @returns {Object} HTTP headers object
 */
export function getStealthHeaders(userAgent, acceptLanguage = 'en-US,en;q=0.9') {
  return {
    'User-Agent': userAgent,
    'Accept-Language': acceptLanguage,
    'Accept-Encoding': 'gzip, deflate, br',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Cache-Control': 'max-age=0',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
  };
}
