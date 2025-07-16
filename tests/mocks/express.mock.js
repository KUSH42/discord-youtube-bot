import { jest } from '@jest/globals';

// Mock Express request object
export const mockRequest = {
  method: 'POST',
  url: '/webhook/youtube',
  headers: {
    'content-type': 'application/atom+xml',
    'x-hub-signature': 'sha1=mock-signature',
    'user-agent': 'FeedFetcher-Google'
  },
  body: '',
  rawBody: Buffer.from(''),
  ip: '127.0.0.1',
  get: jest.fn((header) => mockRequest.headers[header.toLowerCase()]),
  header: jest.fn((header) => mockRequest.headers[header.toLowerCase()])
};

// Mock Express response object
export const mockResponse = {
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
  send: jest.fn().mockReturnThis(),
  end: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  cookie: jest.fn().mockReturnThis(),
  clearCookie: jest.fn().mockReturnThis(),
  redirect: jest.fn().mockReturnThis(),
  locals: {}
};

// Mock Express next function
export const mockNext = jest.fn();

// Mock Express app
export const mockApp = {
  use: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  listen: jest.fn().mockImplementation((port, callback) => {
    if (callback) callback();
    return mockServer;
  }),
  set: jest.fn(),
  locals: {}
};

// Mock Express server
export const mockServer = {
  close: jest.fn().mockImplementation((callback) => {
    if (callback) callback();
  }),
  address: jest.fn().mockReturnValue({
    address: '::',
    family: 'IPv6',
    port: 3000
  }),
  listening: true
};

// Mock rate limiter
export const mockRateLimit = jest.fn().mockImplementation((options) => {
  return jest.fn((req, res, next) => {
    // Simulate rate limiting logic
    const rateLimitInfo = {
      limit: options.max || 100,
      remaining: options.max - 1 || 99,
      reset: Date.now() + (options.windowMs || 900000)
    };
    
    res.set({
      'X-RateLimit-Limit': rateLimitInfo.limit,
      'X-RateLimit-Remaining': rateLimitInfo.remaining,
      'X-RateLimit-Reset': new Date(rateLimitInfo.reset).toISOString()
    });
    
    next();
  });
});

// Mock body parser middleware
export const mockBodyParser = {
  raw: jest.fn().mockReturnValue((req, res, next) => {
    req.rawBody = Buffer.from(req.body || '');
    next();
  }),
  json: jest.fn().mockReturnValue((req, res, next) => {
    try {
      req.body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
      req.body = {};
    }
    next();
  }),
  urlencoded: jest.fn().mockReturnValue((req, res, next) => {
    next();
  })
};

// Helper functions for creating test data
export const createMockRequest = (overrides = {}) => ({
  ...mockRequest,
  ...overrides,
  headers: {
    ...mockRequest.headers,
    ...(overrides.headers || {})
  },
  get: jest.fn((header) => {
    const headers = { ...mockRequest.headers, ...(overrides.headers || {}) };
    return headers[header.toLowerCase()];
  })
});

export const createMockResponse = (overrides = {}) => ({
  ...mockResponse,
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
  send: jest.fn().mockReturnThis(),
  end: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  ...overrides
});

export const createMockApp = (overrides = {}) => ({
  ...mockApp,
  use: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
  listen: jest.fn().mockImplementation((port, callback) => {
    if (callback) callback();
    return { ...mockServer, ...(overrides.serverOverrides || {}) };
  }),
  ...overrides
});

// Mock middleware for testing
export const mockMiddleware = {
  cors: jest.fn().mockReturnValue((req, res, next) => next()),
  helmet: jest.fn().mockReturnValue((req, res, next) => next()),
  compression: jest.fn().mockReturnValue((req, res, next) => next())
};

// Mock webhook signatures for testing
export const mockWebhookSignatures = {
  valid: 'sha1=da39a3ee5e6b4b0d3255bfef95601890afd80709',
  invalid: 'sha1=invalid-signature-hash',
  malformed: 'invalid-format-signature'
};

// Mock health check responses
export const mockHealthResponse = {
  status: 'healthy',
  timestamp: new Date().toISOString(),
  uptime: process.uptime(),
  memory: process.memoryUsage(),
  components: {
    discord: 'connected',
    youtube: 'active',
    xScraper: 'running',
    database: 'n/a'
  }
};

export const mockDetailedHealthResponse = {
  ...mockHealthResponse,
  details: {
    discord: {
      connected: true,
      guilds: 1,
      channels: 2,
      latency: 50
    },
    youtube: {
      subscriptions: 1,
      lastNotification: new Date().toISOString(),
      apiQuota: {
        used: 100,
        limit: 10000
      }
    },
    xScraper: {
      lastScrape: new Date().toISOString(),
      cookieValid: true,
      errorRate: 0.01
    }
  }
};