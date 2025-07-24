import { jest } from '@jest/globals';
import { PerformanceMonitor } from '../../../../src/services/browser-stealth/performance-monitor.js';

// Mock Node.js built-in modules
jest.mock('os', () => ({
  loadavg: jest.fn(() => [0.5, 0.6, 0.7]),
  freemem: jest.fn(() => 4294967296), // 4GB
  totalmem: jest.fn(() => 8589934592), // 8GB
  cpus: jest.fn(() => Array(8).fill({})), // 8 CPUs
}));

describe('PerformanceMonitor', () => {
  let monitor;
  let mockLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    monitor = new PerformanceMonitor(mockLogger);

    // Mock process methods
    jest.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 104857600, // 100MB
      heapTotal: 52428800, // 50MB
      heapUsed: 41943040, // 40MB
      external: 8388608, // 8MB
      arrayBuffers: 1048576, // 1MB
    });

    jest
      .spyOn(process, 'cpuUsage')
      .mockReturnValueOnce({ user: 100000, system: 50000 })
      .mockReturnValue({ user: 120000, system: 60000 });

    jest.spyOn(process.hrtime, 'bigint').mockReturnValueOnce(BigInt(1000000000)).mockReturnValue(BigInt(1100000000));

    jest.spyOn(process, 'uptime').mockReturnValue(3600);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      expect(monitor.logger).toBe(mockLogger);
      expect(monitor.samplingInterval).toBe(30000);
      expect(monitor.maxSamples).toBe(1000);
      expect(monitor.alertThresholds.memoryUsage).toBe(1024 * 1024 * 1024);
      expect(monitor.alertThresholds.cpuUsage).toBe(80);
      expect(monitor.samples).toEqual([]);
      expect(monitor.operationHistory).toEqual([]);
      expect(monitor.alertHistory).toEqual([]);
    });

    it('should initialize with custom configuration', () => {
      const config = {
        samplingInterval: 60000,
        maxSamples: 500,
        memoryThreshold: 512 * 1024 * 1024,
        cpuThreshold: 70,
        alertThresholds: {
          customThreshold: 100,
        },
      };

      const customMonitor = new PerformanceMonitor(mockLogger, config);

      expect(customMonitor.samplingInterval).toBe(60000);
      expect(customMonitor.maxSamples).toBe(500);
      expect(customMonitor.alertThresholds.memoryUsage).toBe(512 * 1024 * 1024);
      expect(customMonitor.alertThresholds.cpuUsage).toBe(70);
      expect(customMonitor.alertThresholds.customThreshold).toBe(100);
    });

    it('should initialize operation stats', () => {
      expect(monitor.operationStats.navigation).toEqual({
        count: 0,
        totalTime: 0,
        avgTime: 0,
        failures: 0,
      });
      expect(monitor.operationStats.interaction).toBeDefined();
      expect(monitor.operationStats.scraping).toBeDefined();
      expect(monitor.operationStats.browserLaunch).toBeDefined();
    });
  });

  describe('startMonitoring', () => {
    it('should start monitoring with interval', () => {
      jest.spyOn(monitor, 'collectPerformanceSample').mockResolvedValue();

      monitor.startMonitoring();

      expect(monitor.monitoringActive).toBe(true);
      expect(monitor.monitoringInterval).not.toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith('Performance monitoring started', {
        samplingInterval: 30000,
        alertThresholds: monitor.alertThresholds,
      });
    });

    it('should not start if already monitoring', () => {
      monitor.monitoringActive = true;
      const originalInterval = monitor.monitoringInterval;

      monitor.startMonitoring();

      expect(monitor.monitoringInterval).toBe(originalInterval);
    });

    it('should collect samples at intervals', async () => {
      jest.spyOn(monitor, 'collectPerformanceSample').mockResolvedValue();

      monitor.startMonitoring();

      // Fast-forward time to trigger sampling
      jest.advanceTimersByTime(30000);
      await Promise.resolve(); // Let async operations complete

      expect(monitor.collectPerformanceSample).toHaveBeenCalled();
    });
  });

  describe('stopMonitoring', () => {
    it('should stop monitoring and clear interval', () => {
      monitor.startMonitoring();
      const intervalId = monitor.monitoringInterval;

      monitor.stopMonitoring();

      expect(monitor.monitoringActive).toBe(false);
      expect(monitor.monitoringInterval).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith('Performance monitoring stopped');
    });

    it('should not stop if not monitoring', () => {
      monitor.monitoringActive = false;
      monitor.monitoringInterval = null;

      monitor.stopMonitoring();

      expect(mockLogger.info).not.toHaveBeenCalledWith('Performance monitoring stopped');
    });
  });

  describe('collectPerformanceSample', () => {
    it('should collect and store performance sample', async () => {
      jest.spyOn(monitor, 'getMemoryUsage').mockReturnValue({
        heapUsed: 41943040,
        heapUsedMB: 40,
      });
      jest.spyOn(monitor, 'getCpuUsage').mockResolvedValue({ usage: 15.5 });
      jest.spyOn(monitor, 'getProcessInfo').mockReturnValue({ pid: 1234 });
      jest.spyOn(monitor, 'getActiveOperationCount').mockReturnValue(2);
      jest.spyOn(monitor, 'getSystemMetrics').mockResolvedValue({ loadAverage: [0.5, 0.6, 0.7] });
      jest.spyOn(monitor, 'updateCurrentMetrics').mockImplementation();
      jest.spyOn(monitor, 'checkPerformanceAlerts').mockImplementation();

      await monitor.collectPerformanceSample();

      expect(monitor.samples).toHaveLength(1);
      expect(monitor.samples[0]).toMatchObject({
        timestamp: expect.any(Number),
        memory: expect.any(Object),
        cpu: expect.any(Object),
        processes: expect.any(Object),
        operations: 2,
        system: expect.any(Object),
      });
      expect(monitor.updateCurrentMetrics).toHaveBeenCalled();
      expect(monitor.checkPerformanceAlerts).toHaveBeenCalled();
    });

    it('should limit sample storage', async () => {
      monitor.maxSamples = 3;
      jest.spyOn(monitor, 'getMemoryUsage').mockReturnValue({ heapUsedMB: 40 });
      jest.spyOn(monitor, 'getCpuUsage').mockResolvedValue({ usage: 15.5 });
      jest.spyOn(monitor, 'getProcessInfo').mockReturnValue({ pid: 1234 });
      jest.spyOn(monitor, 'getActiveOperationCount').mockReturnValue(0);
      jest.spyOn(monitor, 'getSystemMetrics').mockResolvedValue({});
      jest.spyOn(monitor, 'updateCurrentMetrics').mockImplementation();
      jest.spyOn(monitor, 'checkPerformanceAlerts').mockImplementation();

      // Collect 5 samples
      for (let i = 0; i < 5; i++) {
        await monitor.collectPerformanceSample();
      }

      expect(monitor.samples).toHaveLength(3);
    });

    it('should handle collection errors', async () => {
      const error = new Error('Collection failed');
      jest.spyOn(monitor, 'getMemoryUsage').mockImplementation(() => {
        throw error;
      });

      await monitor.collectPerformanceSample();

      expect(mockLogger.error).toHaveBeenCalledWith('Error collecting performance sample', {
        error: error.message,
      });
    });
  });

  describe('getMemoryUsage', () => {
    it('should return formatted memory usage', () => {
      const memUsage = monitor.getMemoryUsage();

      expect(memUsage).toMatchObject({
        rss: 104857600,
        heapTotal: 52428800,
        heapUsed: 41943040,
        external: 8388608,
        heapUsedMB: 40,
        heapTotalMB: 50,
        externalMB: 8,
        rssMB: 100,
      });
    });

    it('should update peak memory tracking', () => {
      monitor.resourceUsage.peakMemory = 20971520; // 20MB

      const memUsage = monitor.getMemoryUsage();

      expect(monitor.resourceUsage.peakMemory).toBe(41943040); // Updated to 40MB
    });
  });

  describe('getCpuUsage', () => {
    it('should calculate CPU usage percentage', async () => {
      // Mock setTimeout to resolve immediately
      jest.spyOn(global, 'setTimeout').mockImplementation(callback => {
        callback();
        return 1;
      });

      const cpuUsage = await monitor.getCpuUsage();

      expect(cpuUsage).toMatchObject({
        usage: expect.any(Number),
        user: 120000,
        system: 60000,
        total: 180000,
      });
      expect(cpuUsage.usage).toBeGreaterThan(0);
      expect(cpuUsage.usage).toBeLessThanOrEqual(100);
    });

    it('should update peak CPU tracking', async () => {
      monitor.resourceUsage.peakCpu = 5;
      jest.spyOn(global, 'setTimeout').mockImplementation(callback => {
        callback();
        return 1;
      });

      const cpuUsage = await monitor.getCpuUsage();

      expect(monitor.resourceUsage.peakCpu).toBeGreaterThan(5);
    });
  });

  describe('getProcessInfo', () => {
    it('should return process information', () => {
      const processInfo = monitor.getProcessInfo();

      expect(processInfo).toMatchObject({
        pid: process.pid,
        uptime: 3600,
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
      });
    });
  });

  describe('getSystemMetrics', () => {
    it('should return system metrics', async () => {
      const metrics = await monitor.getSystemMetrics();

      expect(metrics).toMatchObject({
        loadAverage: [0.5, 0.6, 0.7],
        freeMemory: 4294967296,
        totalMemory: 8589934592,
        cpuCount: 8,
      });
    });

    it('should handle Windows platform loadavg', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const metrics = await monitor.getSystemMetrics();

      expect(metrics.loadAverage).toEqual([0, 0, 0]);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('startOperation', () => {
    it('should start tracking an operation', () => {
      const operationId = monitor.startOperation('navigation', { url: 'https://example.com' });

      expect(operationId).toMatch(/^OP_\d+_[a-z0-9]+$/);
      expect(monitor.activeOperations.has(operationId)).toBe(true);

      const operation = monitor.activeOperations.get(operationId);
      expect(operation).toMatchObject({
        id: operationId,
        type: 'navigation',
        startTime: expect.any(Number),
        startMemory: expect.any(Object),
        startCpu: expect.any(Object),
        context: { url: 'https://example.com' },
      });

      expect(mockLogger.debug).toHaveBeenCalledWith('Operation started', {
        operationId,
        type: 'navigation',
        activeOperations: 1,
      });
    });

    it('should generate unique operation IDs', () => {
      const id1 = monitor.startOperation('navigation');
      const id2 = monitor.startOperation('interaction');

      expect(id1).not.toBe(id2);
    });
  });

  describe('endOperation', () => {
    it('should end tracking and calculate metrics', () => {
      const operationId = monitor.startOperation('navigation', { url: 'https://example.com' });

      // Fast-forward time
      jest.advanceTimersByTime(1000);

      const result = monitor.endOperation(operationId, true, { responseCode: 200 });

      expect(result).toMatchObject({
        id: operationId,
        type: 'navigation',
        duration: expect.any(Number),
        memoryDelta: expect.any(Number),
        cpuTime: expect.any(Number),
        successful: true,
        responseCode: 200,
      });

      expect(monitor.activeOperations.has(operationId)).toBe(false);
      expect(monitor.operationHistory).toContain(result);
      expect(monitor.operationStats.navigation.count).toBe(1);
    });

    it('should handle unknown operation ID', () => {
      const result = monitor.endOperation('unknown-id');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith('Attempted to end unknown operation', {
        operationId: 'unknown-id',
      });
    });

    it('should limit operation history', () => {
      monitor.maxSamples = 3;

      // Create and end 5 operations
      for (let i = 0; i < 5; i++) {
        const operationId = monitor.startOperation('test');
        monitor.endOperation(operationId);
      }

      expect(monitor.operationHistory).toHaveLength(3);
    });

    it('should update failure statistics', () => {
      const operationId = monitor.startOperation('navigation');
      monitor.endOperation(operationId, false); // Failed operation

      expect(monitor.operationStats.navigation.failures).toBe(1);
    });
  });

  describe('updateOperationStats', () => {
    it('should update statistics for known operation type', () => {
      const operation = {
        type: 'navigation',
        duration: 1000,
        successful: true,
      };

      monitor.updateOperationStats(operation);

      expect(monitor.operationStats.navigation).toMatchObject({
        count: 1,
        totalTime: 1000,
        avgTime: 1000,
        failures: 0,
      });
    });

    it('should create statistics for unknown operation type', () => {
      const operation = {
        type: 'customOperation',
        duration: 500,
        successful: false,
      };

      monitor.updateOperationStats(operation);

      expect(monitor.operationStats.customOperation).toMatchObject({
        count: 1,
        totalTime: 500,
        avgTime: 500,
        failures: 1,
      });
    });

    it('should calculate correct averages over multiple operations', () => {
      const operations = [
        { type: 'navigation', duration: 1000, successful: true },
        { type: 'navigation', duration: 2000, successful: true },
        { type: 'navigation', duration: 1500, successful: false },
      ];

      operations.forEach(op => monitor.updateOperationStats(op));

      expect(monitor.operationStats.navigation).toMatchObject({
        count: 3,
        totalTime: 4500,
        avgTime: 1500,
        failures: 1,
      });
    });
  });

  describe('checkPerformanceAlerts', () => {
    it('should trigger memory usage alert', () => {
      jest.spyOn(monitor, 'triggerPerformanceAlert').mockImplementation();
      monitor.alertThresholds.memoryUsage = 30 * 1024 * 1024; // 30MB

      const sample = {
        memory: { heapUsed: 40 * 1024 * 1024 }, // 40MB
        cpu: { usage: 50 },
      };

      monitor.checkPerformanceAlerts(sample);

      expect(monitor.triggerPerformanceAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'memory_usage',
          severity: 'high',
          current: 40 * 1024 * 1024,
          threshold: 30 * 1024 * 1024,
        })
      );
    });

    it('should trigger CPU usage alert', () => {
      jest.spyOn(monitor, 'triggerPerformanceAlert').mockImplementation();
      monitor.alertThresholds.cpuUsage = 60;

      const sample = {
        memory: { heapUsed: 20 * 1024 * 1024 },
        cpu: { usage: 75 },
      };

      monitor.checkPerformanceAlerts(sample);

      expect(monitor.triggerPerformanceAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'cpu_usage',
          severity: 'medium',
          current: 75,
          threshold: 60,
        })
      );
    });

    it('should trigger slow operations alert', () => {
      jest.spyOn(monitor, 'triggerPerformanceAlert').mockImplementation();
      monitor.alertThresholds.responseTime = 1000;

      // Add slow operations to history
      for (let i = 0; i < 5; i++) {
        monitor.operationHistory.push({
          duration: 2000, // Slow operation
          type: 'navigation',
        });
      }

      const sample = {
        memory: { heapUsed: 20 * 1024 * 1024 },
        cpu: { usage: 30 },
      };

      monitor.checkPerformanceAlerts(sample);

      expect(monitor.triggerPerformanceAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'slow_operations',
          severity: 'medium',
          current: 5,
          threshold: 3,
        })
      );
    });
  });

  describe('triggerPerformanceAlert', () => {
    it('should record alert and notify callbacks', () => {
      const mockCallback = jest.fn();
      monitor.registerAlertCallback(mockCallback);

      const alert = {
        type: 'memory_usage',
        severity: 'high',
        current: 100,
        threshold: 80,
        message: 'Memory usage high',
      };

      monitor.triggerPerformanceAlert(alert);

      expect(monitor.alertHistory).toHaveLength(1);
      expect(monitor.alertHistory[0]).toMatchObject({
        ...alert,
        timestamp: expect.any(Number),
        id: expect.stringMatching(/^PA_\d+_[a-z0-9]+$/),
      });

      expect(mockLogger.warn).toHaveBeenCalledWith('Performance alert triggered', expect.objectContaining(alert));
      expect(mockCallback).toHaveBeenCalledWith(expect.objectContaining(alert));
    });

    it('should limit alert history', () => {
      monitor.alertHistory = Array(105)
        .fill({})
        .map((_, i) => ({ id: i }));

      monitor.triggerPerformanceAlert({
        type: 'test',
        severity: 'low',
        message: 'Test alert',
      });

      expect(monitor.alertHistory).toHaveLength(100);
    });

    it('should handle callback errors gracefully', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Callback error');
      });
      monitor.registerAlertCallback(errorCallback);

      monitor.triggerPerformanceAlert({
        type: 'test',
        severity: 'low',
        message: 'Test alert',
      });

      expect(mockLogger.error).toHaveBeenCalledWith('Error in performance alert callback', {
        error: 'Callback error',
      });
    });
  });

  describe('registerAlertCallback', () => {
    it('should register valid callback function', () => {
      const callback = jest.fn();
      monitor.registerAlertCallback(callback);

      expect(monitor.alertCallbacks).toContain(callback);
    });

    it('should ignore non-function callbacks', () => {
      const originalLength = monitor.alertCallbacks.length;
      monitor.registerAlertCallback('not a function');

      expect(monitor.alertCallbacks).toHaveLength(originalLength);
    });
  });

  describe('getPerformanceReport', () => {
    it('should generate comprehensive performance report', () => {
      // Add some sample data
      monitor.samples.push({
        timestamp: Date.now(),
        memory: { heapUsed: 40 * 1024 * 1024 },
        cpu: { usage: 25 },
        operations: 2,
      });
      monitor.operationHistory.push({
        type: 'navigation',
        duration: 1000,
        successful: true,
      });
      monitor.alertHistory.push({
        type: 'memory_usage',
        severity: 'medium',
        timestamp: Date.now(),
      });

      jest.spyOn(monitor, 'calculateAverages').mockReturnValue({
        memory: { valueMB: 40 },
        cpu: { percentage: 25 },
        operations: 2,
      });
      jest.spyOn(monitor, 'analyzeOperationPerformance').mockReturnValue({});
      jest.spyOn(monitor, 'analyzeTrends').mockReturnValue({});
      jest.spyOn(monitor, 'summarizeAlerts').mockReturnValue({});
      jest.spyOn(monitor, 'generatePerformanceRecommendations').mockReturnValue([]);
      jest.spyOn(monitor, 'calculatePerformanceGrade').mockReturnValue('B');

      const report = monitor.getPerformanceReport();

      expect(report).toMatchObject({
        overview: expect.objectContaining({
          monitoring: monitor.monitoringActive,
          sampleCount: 1,
          operationCount: 1,
          alertCount: 1,
        }),
        current: expect.any(Object),
        peaks: expect.any(Object),
        averages: expect.any(Object),
        operations: expect.any(Object),
        trends: expect.any(Object),
        alerts: expect.any(Object),
        recommendations: expect.any(Array),
        grade: 'B',
      });
    });
  });

  describe('calculateAverages', () => {
    it('should calculate correct averages from samples', () => {
      const samples = [
        { memory: { heapUsed: 40 * 1024 * 1024 }, cpu: { usage: 20 }, operations: 1 },
        { memory: { heapUsed: 60 * 1024 * 1024 }, cpu: { usage: 30 }, operations: 3 },
        { memory: { heapUsed: 50 * 1024 * 1024 }, cpu: { usage: 25 }, operations: 2 },
      ];

      const averages = monitor.calculateAverages(samples);

      expect(averages).toMatchObject({
        memory: {
          value: 50 * 1024 * 1024,
          valueMB: 50,
        },
        cpu: {
          value: 25,
          percentage: 25,
        },
        operations: 2,
      });
    });

    it('should handle empty samples array', () => {
      const averages = monitor.calculateAverages([]);

      expect(averages).toEqual({ memory: 0, cpu: 0, operations: 0 });
    });
  });

  describe('analyzeOperationPerformance', () => {
    it('should analyze operation performance with grades', () => {
      monitor.operationStats.navigation = {
        count: 10,
        totalTime: 20000,
        avgTime: 2000,
        failures: 1,
      };

      const analysis = monitor.analyzeOperationPerformance();

      expect(analysis.navigation).toMatchObject({
        count: 10,
        totalTime: 20000,
        avgTime: 2000,
        failures: 1,
        successRate: 0.9,
        grade: 'fair', // 2000ms is between good (1000) and poor (2000)
        benchmark: monitor.performanceBenchmarks.navigation,
      });
    });

    it('should skip operations with zero count', () => {
      monitor.operationStats.navigation.count = 0;

      const analysis = monitor.analyzeOperationPerformance();

      expect(analysis.navigation).toBeUndefined();
    });

    it('should assign correct performance grades', () => {
      monitor.operationStats.navigation = { count: 1, avgTime: 2500, failures: 0 }; // Poor
      monitor.operationStats.interaction = { count: 1, avgTime: 750, failures: 0 }; // Good

      const analysis = monitor.analyzeOperationPerformance();

      expect(analysis.navigation.grade).toBe('fair');
      expect(analysis.interaction.grade).toBe('good');
    });
  });

  describe('analyzeTrends', () => {
    it('should analyze memory and CPU trends', () => {
      const samples = [
        { memory: { heapUsed: 40 * 1024 * 1024 }, cpu: { usage: 20 } },
        { memory: { heapUsed: 45 * 1024 * 1024 }, cpu: { usage: 22 } },
        { memory: { heapUsed: 50 * 1024 * 1024 }, cpu: { usage: 25 } },
        { memory: { heapUsed: 55 * 1024 * 1024 }, cpu: { usage: 27 } },
        { memory: { heapUsed: 60 * 1024 * 1024 }, cpu: { usage: 30 } },
      ];

      const trends = monitor.analyzeTrends(samples);

      expect(trends.memory.trend).toBe('increasing');
      expect(trends.cpu.trend).toBe('increasing');
      expect(trends.memory.change).toBeGreaterThan(0);
      expect(trends.cpu.change).toBeGreaterThan(0);
    });

    it('should handle insufficient data', () => {
      const trends = monitor.analyzeTrends([{ memory: { heapUsed: 100 }, cpu: { usage: 10 } }]);

      expect(trends).toEqual({
        memory: 'insufficient_data',
        cpu: 'insufficient_data',
      });
    });

    it('should detect stable trends', () => {
      const samples = Array(10).fill({
        memory: { heapUsed: 50 * 1024 * 1024 },
        cpu: { usage: 25 },
      });

      const trends = monitor.analyzeTrends(samples);

      expect(trends.memory.trend).toBe('stable');
      expect(trends.cpu.trend).toBe('stable');
    });
  });

  describe('generatePerformanceRecommendations', () => {
    it('should recommend memory optimization', () => {
      monitor.samples = [
        { memory: { heapUsed: 900 * 1024 * 1024 } }, // Close to 1GB threshold
      ];
      monitor.alertThresholds.memoryUsage = 1024 * 1024 * 1024;

      const recommendations = monitor.generatePerformanceRecommendations();

      expect(recommendations).toContainEqual(
        expect.objectContaining({
          type: 'memory_optimization',
          priority: 'high',
          action: 'optimize_memory_usage',
        })
      );
    });

    it('should recommend operation optimization', () => {
      monitor.operationStats.navigation = {
        avgTime: 7000, // Slower than good (5000ms)
        count: 10,
      };

      const recommendations = monitor.generatePerformanceRecommendations();

      expect(recommendations).toContainEqual(
        expect.objectContaining({
          type: 'operation_optimization',
          priority: 'medium',
          action: 'optimize_navigation_operations',
        })
      );
    });

    it('should recommend reliability improvements', () => {
      monitor.operationStats.interaction = {
        count: 10,
        failures: 2, // 20% failure rate
      };

      const recommendations = monitor.generatePerformanceRecommendations();

      expect(recommendations).toContainEqual(
        expect.objectContaining({
          type: 'reliability_improvement',
          priority: 'high',
          action: 'improve_interaction_reliability',
        })
      );
    });

    it('should sort recommendations by priority', () => {
      monitor.samples = [{ memory: { heapUsed: 900 * 1024 * 1024 } }];
      monitor.operationStats.navigation = { avgTime: 7000, count: 10 };

      const recommendations = monitor.generatePerformanceRecommendations();

      expect(recommendations[0].priority).toBe('high');
      expect(recommendations[recommendations.length - 1].priority).not.toBe('high');
    });
  });

  describe('calculatePerformanceGrade', () => {
    it('should calculate grade A for excellent performance', () => {
      monitor.currentMetrics = {
        memoryUsage: 200 * 1024 * 1024, // 200MB - excellent
        cpuUsage: 15, // 15% - excellent
      };

      const grade = monitor.calculatePerformanceGrade();

      expect(grade).toBe('A');
    });

    it('should calculate grade F for poor performance', () => {
      monitor.currentMetrics = {
        memoryUsage: 2000 * 1024 * 1024, // 2GB - poor
        cpuUsage: 90, // 90% - poor
      };
      monitor.operationStats.navigation = {
        count: 10,
        failures: 5, // 50% failure rate
      };

      const grade = monitor.calculatePerformanceGrade();

      expect(grade).toBe('F');
    });
  });

  describe('getStatus', () => {
    it('should return current monitoring status', () => {
      monitor.monitoringActive = true;
      monitor.samples = [1, 2, 3];
      monitor.operationHistory = [1, 2];
      monitor.alertHistory = [1];
      monitor.activeOperations.set('op1', {});

      const status = monitor.getStatus();

      expect(status).toMatchObject({
        monitoring: true,
        samples: 3,
        operations: {
          active: 1,
          completed: 2,
        },
        alerts: 1,
        current: monitor.currentMetrics,
        thresholds: monitor.alertThresholds,
      });
    });
  });

  describe('reset', () => {
    it('should reset all monitoring state', () => {
      // Add some data
      monitor.samples = [1, 2, 3];
      monitor.operationHistory = [1, 2];
      monitor.alertHistory = [1];
      monitor.activeOperations.set('op1', {});
      monitor.operationStats.navigation.count = 5;
      monitor.resourceUsage.peakMemory = 1000;

      monitor.reset();

      expect(monitor.samples).toEqual([]);
      expect(monitor.operationHistory).toEqual([]);
      expect(monitor.alertHistory).toEqual([]);
      expect(monitor.activeOperations.size).toBe(0);
      expect(monitor.operationStats.navigation.count).toBe(0);
      expect(monitor.resourceUsage.peakMemory).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith('Performance monitor reset');
    });
  });

  describe('generateOperationId', () => {
    it('should generate unique operation IDs', () => {
      const id1 = monitor.generateOperationId();
      const id2 = monitor.generateOperationId();

      expect(id1).toMatch(/^OP_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^OP_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateAlertId', () => {
    it('should generate unique alert IDs', () => {
      const id1 = monitor.generateAlertId();
      const id2 = monitor.generateAlertId();

      expect(id1).toMatch(/^PA_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^PA_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });
});
