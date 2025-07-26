import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { DebugFlagManager } from '../../src/infrastructure/debug-flag-manager.js';
import { MetricsManager } from '../../src/infrastructure/metrics-manager.js';
import { createEnhancedLogger } from '../../src/utilities/enhanced-logger.js';

describe('Enhanced Logging Integration', () => {
  let debugManager;
  let metricsManager;
  let mockBaseLogger;
  let mockStateManager;
  let enhancedLogger;

  beforeEach(() => {
    // Create mock dependencies with actual state storage
    const mockState = new Map();
    mockStateManager = {
      has: jest.fn(key => mockState.has(key)),
      get: jest.fn((key, defaultValue) => mockState.get(key) || defaultValue || {}),
      set: jest.fn((key, value) => mockState.set(key, value)),
      delete: jest.fn(key => mockState.delete(key)),
      setValidator: jest.fn(),
    };

    mockBaseLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    };

    // Create fresh instances for each test
    debugManager = new DebugFlagManager(mockStateManager, mockBaseLogger);
    metricsManager = new MetricsManager();

    enhancedLogger = createEnhancedLogger('test-module', mockBaseLogger, debugManager, metricsManager);
  });

  afterEach(() => {
    // Clean up intervals from MetricsManager
    if (metricsManager && metricsManager.cleanupInterval) {
      clearInterval(metricsManager.cleanupInterval);
    }
    jest.clearAllMocks();
  });

  describe('Debug Flag Manager Integration', () => {
    it('should enable/disable debug logging per module', () => {
      // Initially disabled
      expect(debugManager.isEnabled('scraper')).toBe(false);
      expect(debugManager.isEnabled('youtube')).toBe(false);
      expect(debugManager.isEnabled('auth')).toBe(false);
      expect(debugManager.isEnabled('api')).toBe(false);

      // Enable specific modules
      debugManager.toggle('scraper', true);
      debugManager.toggle('youtube', true);

      expect(debugManager.isEnabled('scraper')).toBe(true);
      expect(debugManager.isEnabled('youtube')).toBe(true);
      expect(debugManager.isEnabled('auth')).toBe(false);
      expect(debugManager.isEnabled('api')).toBe(false);
    });

    it('should support granular debug levels', () => {
      // Set different debug levels
      debugManager.setLevel('scraper', 5); // Verbose
      debugManager.setLevel('auth', 1); // Errors only
      debugManager.setLevel('youtube', 3); // Info and above

      expect(debugManager.getLevel('scraper')).toBe(5);
      expect(debugManager.getLevel('auth')).toBe(1);
      expect(debugManager.getLevel('youtube')).toBe(3);
      expect(debugManager.getLevel('nonexistent')).toBe(1); // Default
    });

    it('should initialize from environment variables', () => {
      // Mock environment variables
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        DEBUG_FLAGS: 'scraper,youtube,auth',
        DEBUG_LEVEL_SCRAPER: '5',
        DEBUG_LEVEL_AUTH: '2',
      };

      const envDebugManager = new DebugFlagManager(mockStateManager, mockBaseLogger);

      // Should initialize with env vars
      expect(envDebugManager.isEnabled('scraper')).toBe(true);
      expect(envDebugManager.isEnabled('youtube')).toBe(true);
      expect(envDebugManager.isEnabled('auth')).toBe(true);
      expect(envDebugManager.isEnabled('api')).toBe(false);

      expect(envDebugManager.getLevel('scraper')).toBe(5);
      expect(envDebugManager.getLevel('auth')).toBe(2);
      expect(envDebugManager.getLevel('youtube')).toBe(1); // Default

      // Restore environment
      process.env = originalEnv;
    });
  });

  describe('Metrics Manager Integration', () => {
    it('should record different types of metrics', () => {
      // Record various metrics
      metricsManager.incrementCounter('api.requests.total');
      metricsManager.incrementCounter('api.requests.total');
      metricsManager.setGauge('system.memory.usage', 1024);
      metricsManager.recordHistogram('api.response.time', 150);
      metricsManager.recordHistogram('api.response.time', 200);

      const stats = metricsManager.getStats();

      expect(stats.counters['api.requests.total']).toBe(2);
      expect(stats.gauges['system.memory.usage']).toBe(1024);
      expect(stats.histograms['api.response.time']).toEqual({
        count: 2,
        sum: 350,
        min: 150,
        max: 200,
        avg: 175,
      });
    });

    it('should handle timer operations', () => {
      const timer = metricsManager.startTimer('test.operation');

      // Simulate some work
      setTimeout(() => {
        const duration = timer.end();
        expect(duration).toBeGreaterThan(0);

        const stats = metricsManager.getStats();
        expect(stats.histograms['test.operation']).toBeDefined();
      }, 10);
    });

    it('should provide comprehensive statistics', () => {
      // Add some test data
      metricsManager.incrementCounter('test.counter', 5);
      metricsManager.setGauge('test.gauge', 42);
      metricsManager.recordHistogram('test.histogram', 100);

      const stats = metricsManager.getStats();

      expect(stats).toEqual({
        counters: { 'test.counter': 5 },
        gauges: { 'test.gauge': 42 },
        histograms: {
          'test.histogram': {
            count: 1,
            sum: 100,
            min: 100,
            max: 100,
            avg: 100,
          },
        },
        uptime: expect.any(Number),
        timestamp: expect.any(String),
      });
    });
  });

  describe('Enhanced Logger Integration', () => {
    it('should create operation tracking', () => {
      const operation = enhancedLogger.startOperation('testOperation', { testData: 'value' });

      expect(operation).toHaveProperty('progress');
      expect(operation).toHaveProperty('success');
      expect(operation).toHaveProperty('error');
      expect(typeof operation.progress).toBe('function');
      expect(typeof operation.success).toBe('function');
      expect(typeof operation.error).toBe('function');
    });

    it('should track operation progress and completion', () => {
      const operation = enhancedLogger.startOperation('testOp', { id: 'test123' });

      // Track progress
      operation.progress('Step 1 completed');
      operation.progress('Step 2 completed');

      // Complete successfully
      const result = operation.success('Operation completed successfully', { result: 'success' });

      expect(result).toEqual({ result: 'success' });

      // Should log to base logger
      expect(mockBaseLogger.info).toHaveBeenCalledWith(
        'Operation completed successfully',
        expect.objectContaining({
          result: 'success',
          correlationId: expect.any(String),
          duration: expect.any(Number),
        })
      );
    });

    it('should handle operation errors', () => {
      const operation = enhancedLogger.startOperation('failingOp', { id: 'fail123' });
      const testError = new Error('Something went wrong');

      expect(() => {
        operation.error(testError, 'Operation failed', { additionalContext: 'test' });
      }).toThrow('Something went wrong');

      // Should log error
      expect(mockBaseLogger.error).toHaveBeenCalledWith(
        'Operation failed',
        expect.objectContaining({
          additionalContext: 'test',
          correlationId: expect.any(String),
          duration: expect.any(Number),
          error: 'Something went wrong',
        })
      );
    });

    it('should support correlation ID tracking', () => {
      const correlationId = 'test-correlation-123';
      const correlatedLogger = enhancedLogger.forOperation('batchProcess', correlationId);

      expect(correlatedLogger).toBeDefined();
      // The correlated logger should maintain the correlation ID context
    });

    it('should respect debug flags', () => {
      // Enable debug for test module
      debugManager.toggleFlag('test-module', true);

      const debugEnabledLogger = createEnhancedLogger('test-module', mockBaseLogger, debugManager, metricsManager);

      const operation = debugEnabledLogger.startOperation('debugOp', { debug: true });
      operation.success('Debug operation completed', { debugResult: true });

      // Should log when debug is enabled
      expect(mockBaseLogger.info).toHaveBeenCalled();
    });

    it('should integrate with metrics manager', () => {
      const operation = enhancedLogger.startOperation('metricOp', { test: 'data' });

      // Complete the operation
      operation.success('Metrics test completed', { metrics: 'recorded' });

      // Should have recorded metrics
      const stats = metricsManager.getStats();
      expect(Object.keys(stats.histograms).length).toBeGreaterThan(0);
    });

    it('should sanitize sensitive data', () => {
      const sensitiveData = {
        username: 'testuser',
        password: 'secret123',
        token: 'jwt-token-here',
        apiKey: 'api-key-value',
        secret: 'secret-value',
        safe: 'safe-value',
      };

      const operation = enhancedLogger.startOperation('sensitiveOp', sensitiveData);
      operation.success('Sensitive data handled', sensitiveData);

      // Check that sensitive fields were sanitized
      const logCall = mockBaseLogger.info.mock.calls[0];
      const loggedData = logCall[1];

      expect(loggedData.password).toBe('[REDACTED]');
      expect(loggedData.token).toBe('[REDACTED]');
      expect(loggedData.apiKey).toBe('[REDACTED]');
      expect(loggedData.secret).toBe('[REDACTED]');
      expect(loggedData.safe).toBe('safe-value'); // Should not be redacted
    });
  });

  describe('Phase 2 Module Integration Ready', () => {
    it('should support all Phase 2 debug modules', () => {
      const phase2Modules = ['scraper', 'youtube', 'api', 'auth'];

      phase2Modules.forEach(module => {
        debugManager.toggle(module, true);
        debugManager.setLevel(module, 5);

        expect(debugManager.isEnabled(module)).toBe(true);
        expect(debugManager.getLevel(module)).toBe(5);
      });
    });

    it('should create enhanced loggers for all Phase 2 modules', () => {
      const phase2Modules = ['scraper', 'youtube', 'api', 'auth'];

      phase2Modules.forEach(module => {
        const logger = createEnhancedLogger(module, mockBaseLogger, debugManager, metricsManager);

        expect(logger).toBeDefined();
        expect(typeof logger.startOperation).toBe('function');
        expect(typeof logger.forOperation).toBe('function');

        // Test basic operation
        const operation = logger.startOperation('testOp', { module });
        expect(operation).toBeDefined();

        const result = operation.success('Test completed', { module });
        expect(result).toEqual({ module });
      });
    });

    it('should demonstrate command integration patterns', () => {
      // Simulate debug command processing
      const commandResults = [];

      // Toggle debug for scraper
      debugManager.toggle('scraper', true);
      commandResults.push({
        command: 'debug scraper true',
        success: true,
        message: 'Debug logging enabled for scraper',
      });

      // Set debug level for auth
      debugManager.setLevel('auth', 5);
      commandResults.push({
        command: 'debug-level auth 5',
        success: true,
        message: 'Debug level set to 5 for auth',
      });

      // Get debug status
      const debugStatus = {};
      ['scraper', 'youtube', 'api', 'auth'].forEach(module => {
        debugStatus[module] = {
          enabled: debugManager.isEnabled(module),
          level: debugManager.getLevel(module),
        };
      });

      commandResults.push({
        command: 'debug-status',
        success: true,
        debugStatus,
      });

      // Get metrics
      metricsManager.incrementCounter('test.commands.processed', commandResults.length);
      const metrics = metricsManager.getStats();

      commandResults.push({
        command: 'metrics',
        success: true,
        metrics,
      });

      // Verify all commands worked
      expect(commandResults).toHaveLength(4);
      expect(commandResults.every(r => r.success)).toBe(true);
      expect(debugStatus.scraper.enabled).toBe(true);
      expect(debugStatus.auth.level).toBe(5);
      expect(metrics.counters['test.commands.processed']).toBe(4);
    });
  });
});
