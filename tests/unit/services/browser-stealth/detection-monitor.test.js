import { jest } from '@jest/globals';
import { DetectionMonitor } from '../../../../src/services/browser-stealth/detection-monitor.js';

describe('DetectionMonitor', () => {
  let detectionMonitor;
  let mockLogger;
  let mockConfig;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockConfig = {
      alertThreshold: 3,
      monitoringWindow: 3600000,
      maxIncidentHistory: 100,
    };

    detectionMonitor = new DetectionMonitor(mockLogger, mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('recordRequest', () => {
    it('should increment total requests for successful request', () => {
      const initialTotal = detectionMonitor.metrics.totalRequests;

      detectionMonitor.recordRequest(true);

      expect(detectionMonitor.metrics.totalRequests).toBe(initialTotal + 1);
      expect(detectionMonitor.metrics.successfulRequests).toBe(1);
    });

    it('should record detection incident for failed request', () => {
      const spy = jest.spyOn(detectionMonitor, 'recordDetectionIncident');

      detectionMonitor.recordRequest(false, { url: 'https://example.com' });

      expect(spy).toHaveBeenCalledWith({ url: 'https://example.com' });
    });

    it('should update success rate', () => {
      detectionMonitor.recordRequest(true);
      detectionMonitor.recordRequest(true);
      detectionMonitor.recordRequest(false);

      expect(detectionMonitor.metrics.averageSuccessRate).toBeCloseTo(0.667, 2);
    });
  });

  describe('recordDetectionIncident', () => {
    it('should create incident with required properties', () => {
      const context = {
        url: 'https://example.com',
        errorMessage: 'Access denied',
        httpStatus: 403,
      };

      const incident = detectionMonitor.recordDetectionIncident(context);

      expect(incident).toHaveProperty('timestamp');
      expect(incident).toHaveProperty('id');
      expect(incident).toHaveProperty('context');
      expect(incident).toHaveProperty('severity');
      expect(incident).toHaveProperty('detectionScore');
      expect(incident).toHaveProperty('patterns');

      expect(incident.context.url).toBe('https://example.com');
      expect(incident.context.errorMessage).toBe('Access denied');
      expect(incident.context.httpStatus).toBe(403);
    });

    it('should calculate severity based on detection score', () => {
      const criticalContext = {
        errorMessage: 'bot detected',
        responseContent: 'CAPTCHA challenge required',
      };

      const incident = detectionMonitor.recordDetectionIncident(criticalContext);

      expect(incident.severity).toBe('critical');
    });

    it('should add incident to history', () => {
      const initialLength = detectionMonitor.incidents.length;

      detectionMonitor.recordDetectionIncident({ url: 'https://example.com' });

      expect(detectionMonitor.incidents).toHaveLength(initialLength + 1);
    });

    it('should limit incident history size', () => {
      // Set a small limit for testing
      detectionMonitor.maxIncidentHistory = 5;

      // Add more incidents than the limit
      for (let i = 0; i < 10; i++) {
        detectionMonitor.recordDetectionIncident({ url: `https://example${i}.com` });
      }

      expect(detectionMonitor.incidents).toHaveLength(5);
    });

    it('should check alert thresholds after recording', () => {
      const spy = jest.spyOn(detectionMonitor, 'checkAlertThresholds');

      const incident = detectionMonitor.recordDetectionIncident({ url: 'https://example.com' });

      expect(spy).toHaveBeenCalledWith(incident);
    });
  });

  describe('calculateDetectionScore', () => {
    it('should return low score for generic failure', () => {
      const context = { errorMessage: 'Network error' };

      const score = detectionMonitor.calculateDetectionScore(context);

      expect(score).toBe(0.1); // Base suspicion
    });

    it('should return high score for explicit bot detection', () => {
      const context = {
        errorMessage: 'bot detected',
        responseContent: 'automation detected',
      };

      const score = detectionMonitor.calculateDetectionScore(context);

      expect(score).toBeGreaterThan(0.8);
    });

    it('should return maximum score for CAPTCHA challenges', () => {
      const context = {
        responseContent: 'Please complete the CAPTCHA challenge',
        httpStatus: '403',
      };

      const score = detectionMonitor.calculateDetectionScore(context);

      expect(score).toBeGreaterThan(0.9);
    });

    it('should boost score for multiple pattern matches', () => {
      const singlePatternContext = {
        errorMessage: 'blocked',
      };

      const multiplePatternContext = {
        errorMessage: 'blocked access denied',
        responseContent: 'too many requests',
        httpStatus: '429',
      };

      const singleScore = detectionMonitor.calculateDetectionScore(singlePatternContext);
      const multipleScore = detectionMonitor.calculateDetectionScore(multiplePatternContext);

      expect(multipleScore).toBeGreaterThan(singleScore);
    });
  });

  describe('checkAlertThresholds', () => {
    it('should trigger incident threshold alert', () => {
      const triggerSpy = jest.spyOn(detectionMonitor, 'triggerAlert');

      // Add incidents to exceed threshold
      for (let i = 0; i < detectionMonitor.alertThreshold; i++) {
        detectionMonitor.recordDetectionIncident({ url: `https://example${i}.com` });
      }

      expect(triggerSpy).toHaveBeenCalledWith('incident_threshold', expect.any(Object));
    });

    it('should trigger critical incident alert', () => {
      const triggerSpy = jest.spyOn(detectionMonitor, 'triggerAlert');

      const criticalIncident = {
        severity: 'critical',
        detectionScore: 0.95,
        patterns: [{ description: 'Bot detection message' }],
      };

      detectionMonitor.checkAlertThresholds(criticalIncident);

      expect(triggerSpy).toHaveBeenCalledWith('critical_incident', expect.any(Object));
    });

    it('should trigger success rate drop alert', () => {
      const triggerSpy = jest.spyOn(detectionMonitor, 'triggerAlert');

      // Record many failed requests to drop success rate
      for (let i = 0; i < 15; i++) {
        detectionMonitor.recordRequest(false);
      }

      // Add a few successful ones to get above minimum threshold
      for (let i = 0; i < 5; i++) {
        detectionMonitor.recordRequest(true);
      }

      const incident = detectionMonitor.recordDetectionIncident({ url: 'https://example.com' });
      detectionMonitor.checkAlertThresholds(incident);

      expect(triggerSpy).toHaveBeenCalledWith('success_rate_drop', expect.any(Object));
    });
  });

  describe('triggerAlert', () => {
    it('should log error message', () => {
      detectionMonitor.triggerAlert('test_alert', { test: 'data' });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Detection monitor alert: test_alert',
        expect.objectContaining({
          type: 'test_alert',
          data: { test: 'data' },
        })
      );
    });

    it('should respect cooldown period', () => {
      detectionMonitor.triggerAlert('test_alert', { test: 'data' });
      detectionMonitor.triggerAlert('test_alert', { test: 'data' });

      // Should only log once due to cooldown
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });

    it('should call registered callbacks', () => {
      const mockCallback = jest.fn();
      detectionMonitor.registerAlertCallback(mockCallback);

      detectionMonitor.triggerAlert('test_alert', { test: 'data' });

      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'test_alert',
          data: { test: 'data' },
        })
      );
    });

    it('should handle callback errors gracefully', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Callback error');
      });

      detectionMonitor.registerAlertCallback(errorCallback);

      expect(() => {
        detectionMonitor.triggerAlert('test_alert', { test: 'data' });
      }).not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error in alert callback',
        expect.objectContaining({ error: 'Callback error' })
      );
    });
  });

  describe('getRecentIncidents', () => {
    it('should return incidents within time window', () => {
      // Add incidents
      detectionMonitor.recordDetectionIncident({ url: 'https://example1.com' });
      detectionMonitor.recordDetectionIncident({ url: 'https://example2.com' });

      const recent = detectionMonitor.getRecentIncidents();

      expect(recent).toHaveLength(2);
    });

    it('should exclude old incidents', () => {
      // Add incident and mark it as old
      const incident = detectionMonitor.recordDetectionIncident({ url: 'https://example.com' });
      incident.timestamp = Date.now() - 2 * 3600000; // 2 hours ago

      const recent = detectionMonitor.getRecentIncidents(3600000); // 1 hour window

      expect(recent).toHaveLength(0);
    });
  });

  describe('getDetectionAnalysis', () => {
    beforeEach(() => {
      // Add some test data
      detectionMonitor.recordRequest(true);
      detectionMonitor.recordRequest(false, { url: 'https://example.com', errorMessage: 'blocked' });
      detectionMonitor.recordRequest(true);
    });

    it('should return comprehensive analysis', () => {
      const analysis = detectionMonitor.getDetectionAnalysis();

      expect(analysis).toHaveProperty('overview');
      expect(analysis).toHaveProperty('patterns');
      expect(analysis).toHaveProperty('severity');
      expect(analysis).toHaveProperty('temporal');
      expect(analysis).toHaveProperty('recommendations');

      expect(analysis.overview).toHaveProperty('totalRequests');
      expect(analysis.overview).toHaveProperty('successfulRequests');
      expect(analysis.overview).toHaveProperty('detectionIncidents');
      expect(analysis.overview).toHaveProperty('successRate');
    });

    it('should calculate correct success rate', () => {
      const analysis = detectionMonitor.getDetectionAnalysis();

      expect(analysis.overview.totalRequests).toBe(3);
      expect(analysis.overview.successfulRequests).toBe(2);
      expect(analysis.overview.successRate).toBeCloseTo(0.667, 2);
    });

    it('should include pattern analysis', () => {
      const analysis = detectionMonitor.getDetectionAnalysis();

      expect(analysis.patterns).toHaveProperty('totalPatterns');
      expect(analysis.patterns).toHaveProperty('topPatterns');
      expect(Array.isArray(analysis.patterns.topPatterns)).toBe(true);
    });
  });

  describe('generateRecommendations', () => {
    it('should recommend rate limiting for high incident rate', () => {
      // Create high incident rate
      for (let i = 0; i < 5; i++) {
        detectionMonitor.recordDetectionIncident({ url: `https://example${i}.com` });
      }

      const analysis = detectionMonitor.getDetectionAnalysis();
      const rateLimitingRec = analysis.recommendations.find(r => r.type === 'rate_limiting');

      expect(rateLimitingRec).toBeDefined();
      expect(rateLimitingRec.priority).toBe('high');
    });

    it('should recommend user agent rotation for CAPTCHA patterns', () => {
      // Create CAPTCHA incidents
      detectionMonitor.recordDetectionIncident({
        url: 'https://example.com',
        responseContent: 'Please complete the CAPTCHA',
      });
      detectionMonitor.recordDetectionIncident({
        url: 'https://example2.com',
        responseContent: 'CAPTCHA challenge required',
      });
      detectionMonitor.recordDetectionIncident({
        url: 'https://example3.com',
        responseContent: 'CAPTCHA verification needed',
      });

      const analysis = detectionMonitor.getDetectionAnalysis();
      const userAgentRec = analysis.recommendations.find(r => r.type === 'user_agent');

      expect(userAgentRec).toBeDefined();
      expect(userAgentRec.priority).toBe('high');
    });

    it('should prioritize critical recommendations first', () => {
      // Create bot detection incident
      detectionMonitor.recordDetectionIncident({
        url: 'https://example.com',
        errorMessage: 'bot detected',
      });

      const analysis = detectionMonitor.getDetectionAnalysis();
      const criticalRec = analysis.recommendations.find(r => r.priority === 'critical');

      expect(criticalRec).toBeDefined();
      expect(analysis.recommendations[0].priority).toBe('critical');
    });
  });

  describe('getStatus', () => {
    it('should return current monitoring status', () => {
      const status = detectionMonitor.getStatus();

      expect(status).toHaveProperty('monitoring');
      expect(status).toHaveProperty('metrics');
      expect(status).toHaveProperty('recent');
      expect(status).toHaveProperty('alerts');

      expect(status.monitoring.active).toBe(true);
      expect(status.monitoring.alertThreshold).toBe(mockConfig.alertThreshold);
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      // Add some state
      detectionMonitor.recordRequest(true);
      detectionMonitor.recordDetectionIncident({ url: 'https://example.com' });

      detectionMonitor.reset();

      expect(detectionMonitor.incidents).toHaveLength(0);
      expect(detectionMonitor.patterns.size).toBe(0);
      expect(detectionMonitor.metrics.totalRequests).toBe(0);
      expect(detectionMonitor.metrics.successfulRequests).toBe(0);
      expect(detectionMonitor.metrics.detectionIncidents).toBe(0);
    });

    it('should log reset message', () => {
      detectionMonitor.reset();

      expect(mockLogger.info).toHaveBeenCalledWith('Detection monitor state reset');
    });
  });

  describe('registerAlertCallback', () => {
    it('should register valid callback function', () => {
      const callback = jest.fn();
      const initialLength = detectionMonitor.alertCallbacks.length;

      detectionMonitor.registerAlertCallback(callback);

      expect(detectionMonitor.alertCallbacks).toHaveLength(initialLength + 1);
    });

    it('should ignore non-function values', () => {
      const initialLength = detectionMonitor.alertCallbacks.length;

      detectionMonitor.registerAlertCallback('not a function');
      detectionMonitor.registerAlertCallback(null);
      detectionMonitor.registerAlertCallback(undefined);

      expect(detectionMonitor.alertCallbacks).toHaveLength(initialLength);
    });
  });

  describe('pattern tracking', () => {
    it('should track pattern frequency', () => {
      // Record incidents with same pattern
      for (let i = 0; i < 3; i++) {
        detectionMonitor.recordDetectionIncident({
          url: `https://example${i}.com`,
          errorMessage: 'blocked',
        });
      }

      const blockingPattern = Array.from(detectionMonitor.patterns.values()).find(p =>
        p.description.includes('blocking')
      );

      expect(blockingPattern).toBeDefined();
      expect(blockingPattern.count).toBe(3);
    });

    it('should update pattern timestamps', () => {
      const beforeTime = Date.now();

      detectionMonitor.recordDetectionIncident({
        url: 'https://example.com',
        errorMessage: 'access denied',
      });

      const deniedPattern = Array.from(detectionMonitor.patterns.values()).find(p =>
        p.description.includes('Access denied')
      );

      expect(deniedPattern).toBeDefined();
      expect(deniedPattern.firstSeen).toBeGreaterThanOrEqual(beforeTime);
      expect(deniedPattern.lastSeen).toBeGreaterThanOrEqual(beforeTime);
    });
  });
});
