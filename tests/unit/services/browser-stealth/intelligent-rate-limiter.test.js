import { jest } from '@jest/globals';
import { IntelligentRateLimiter } from '../../../../src/services/browser-stealth/intelligent-rate-limiter.js';

describe('IntelligentRateLimiter', () => {
  let rateLimiter;
  let mockConfig;
  let mockLogger;

  beforeEach(() => {
    mockConfig = {
      get: jest.fn(),
    };
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    rateLimiter = new IntelligentRateLimiter(mockConfig, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('calculateNextInterval', () => {
    it('should return interval within expected range', () => {
      const interval = rateLimiter.calculateNextInterval();

      expect(interval).toBeGreaterThanOrEqual(30000); // Minimum 30 seconds
      expect(interval).toBeLessThanOrEqual(600000); // Maximum 10 minutes (except emergency)
    });

    it('should use human_active pattern during active session', () => {
      // Simulate active session by adding recent requests
      for (let i = 0; i < 5; i++) {
        rateLimiter.recordRequest(true);
      }

      const interval = rateLimiter.calculateNextInterval();

      // Should be closer to human_active base (60000ms)
      expect(interval).toBeGreaterThanOrEqual(30000);
      expect(interval).toBeLessThanOrEqual(150000); // Base + variance
    });

    it('should use night_mode pattern during night hours', () => {
      // Mock night time (2 AM)
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(2);

      const interval = rateLimiter.calculateNextInterval();

      // Should be closer to night_mode base (300000ms)
      expect(interval).toBeGreaterThanOrEqual(180000); // Base - variance
      expect(interval).toBeLessThanOrEqual(600000); // Capped at 10 minutes
    });

    it('should use weekend pattern on weekends', () => {
      // Mock Sunday (day 0)
      jest.spyOn(Date.prototype, 'getDay').mockReturnValue(0);
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(12); // Noon

      const interval = rateLimiter.calculateNextInterval();

      // Should be closer to weekend base (180000ms)
      expect(interval).toBeGreaterThanOrEqual(90000); // Base - variance
      expect(interval).toBeLessThanOrEqual(270000); // Base + variance
    });

    it('should apply burst penalty when threshold exceeded', () => {
      // Add many requests to trigger burst detection
      for (let i = 0; i < 10; i++) {
        rateLimiter.recordRequest(true);
      }

      const interval = rateLimiter.calculateNextInterval();

      // Should have some penalty applied (exact value depends on timing)
      expect(interval).toBeGreaterThan(60000); // Higher than base human_active
    });

    it('should use emergency mode intervals when enabled', () => {
      rateLimiter.setEmergencyMode(true);

      const interval = rateLimiter.calculateNextInterval();

      // Emergency mode uses 10 minute base
      expect(interval).toBeGreaterThanOrEqual(300000); // Base - variance
      expect(interval).toBeLessThanOrEqual(900000); // Base + variance
    });
  });

  describe('isActiveSession', () => {
    it('should return false for new rate limiter', () => {
      expect(rateLimiter.isActiveSession()).toBe(false);
    });

    it('should return true when recent requests exceed threshold', () => {
      // Add enough recent requests
      for (let i = 0; i < 5; i++) {
        rateLimiter.recordRequest(true);
      }

      expect(rateLimiter.isActiveSession()).toBe(true);
    });

    it('should return false when requests are old', async () => {
      // Add requests
      for (let i = 0; i < 5; i++) {
        rateLimiter.recordRequest(true);
      }

      // Mock time passage (11 minutes)
      const originalNow = Date.now;
      Date.now = jest.fn(() => originalNow() + 11 * 60 * 1000);

      expect(rateLimiter.isActiveSession()).toBe(false);

      Date.now = originalNow;
    });
  });

  describe('calculateBurstPenalty', () => {
    it('should return 0 for requests below threshold', () => {
      // Add few requests
      for (let i = 0; i < 5; i++) {
        rateLimiter.recordRequest(true);
      }

      const penalty = rateLimiter.calculateBurstPenalty();

      expect(penalty).toBe(0);
    });

    it('should return penalty for requests above threshold', () => {
      // Add many requests to exceed threshold
      for (let i = 0; i < 12; i++) {
        rateLimiter.recordRequest(true);
      }

      const penalty = rateLimiter.calculateBurstPenalty();

      expect(penalty).toBeGreaterThan(0);
      expect(penalty).toBeLessThanOrEqual(rateLimiter.maxPenaltyMultiplier);
    });

    it('should cap penalty at maximum multiplier', () => {
      // Add excessive requests
      for (let i = 0; i < 50; i++) {
        rateLimiter.recordRequest(true);
      }

      const penalty = rateLimiter.calculateBurstPenalty();

      expect(penalty).toBeLessThanOrEqual(rateLimiter.maxPenaltyMultiplier);
    });
  });

  describe('recordRequest', () => {
    it('should add request to session history', () => {
      const initialLength = rateLimiter.sessionHistory.length;

      rateLimiter.recordRequest(true);

      expect(rateLimiter.sessionHistory).toHaveLength(initialLength + 1);
      expect(rateLimiter.lastRequestTime).toBeGreaterThan(0);
    });

    it('should trigger detection incident handling for failed requests', () => {
      const spy = jest.spyOn(rateLimiter, 'handleDetectionIncident');

      rateLimiter.recordRequest(false);

      expect(spy).toHaveBeenCalled();
    });

    it('should limit session history size', () => {
      // Add more than maximum history
      for (let i = 0; i < 150; i++) {
        rateLimiter.recordRequest(true);
      }

      expect(rateLimiter.sessionHistory).toHaveLength(100);
    });
  });

  describe('handleDetectionIncident', () => {
    it('should enable emergency mode', () => {
      rateLimiter.handleDetectionIncident();

      expect(rateLimiter.emergencyMode).toBe(true);
    });

    it('should clear existing emergency timeout', () => {
      const mockTimeout = setTimeout(() => {}, 1000);
      rateLimiter.emergencyModeTimeout = mockTimeout;

      rateLimiter.handleDetectionIncident();

      expect(rateLimiter.emergencyModeTimeout).toBeDefined();
      expect(rateLimiter.emergencyModeTimeout).not.toBe(mockTimeout);
    });

    it('should log warning message', () => {
      rateLimiter.handleDetectionIncident();

      expect(mockLogger.warn).toHaveBeenCalledWith('Potential detection incident recorded');
    });
  });

  describe('getRecentRequestCount', () => {
    it('should return 0 for new rate limiter', () => {
      expect(rateLimiter.getRecentRequestCount()).toBe(0);
    });

    it('should count recent requests', () => {
      for (let i = 0; i < 5; i++) {
        rateLimiter.recordRequest(true);
      }

      expect(rateLimiter.getRecentRequestCount()).toBe(5);
    });

    it('should use custom time window', () => {
      rateLimiter.recordRequest(true);

      const count = rateLimiter.getRecentRequestCount(1000); // 1 second window

      expect(count).toBe(1);
    });
  });

  describe('getStatus', () => {
    it('should return comprehensive status information', () => {
      rateLimiter.recordRequest(true);

      const status = rateLimiter.getStatus();

      expect(status).toHaveProperty('sessionRequests');
      expect(status).toHaveProperty('recentRequests');
      expect(status).toHaveProperty('timeSinceLastRequest');
      expect(status).toHaveProperty('nextInterval');
      expect(status).toHaveProperty('emergencyMode');
      expect(status).toHaveProperty('isActiveSession');
      expect(status).toHaveProperty('burstPenalty');
      expect(status).toHaveProperty('currentPattern');
      expect(status).toHaveProperty('averageInterval');

      expect(typeof status.sessionRequests).toBe('number');
      expect(typeof status.recentRequests).toBe('number');
      expect(typeof status.timeSinceLastRequest).toBe('number');
      expect(typeof status.nextInterval).toBe('number');
      expect(typeof status.emergencyMode).toBe('boolean');
      expect(typeof status.isActiveSession).toBe('boolean');
      expect(typeof status.burstPenalty).toBe('number');
      expect(typeof status.currentPattern).toBe('string');
      expect(typeof status.averageInterval).toBe('number');
    });
  });

  describe('getCurrentPatternName', () => {
    it('should return emergency for emergency mode', () => {
      rateLimiter.setEmergencyMode(true);

      expect(rateLimiter.getCurrentPatternName()).toBe('emergency');
    });

    it('should return night_mode for night hours', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(3);

      expect(rateLimiter.getCurrentPatternName()).toBe('night_mode');
    });

    it('should return weekend for weekend days', () => {
      jest.spyOn(Date.prototype, 'getDay').mockReturnValue(6); // Saturday
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(12);

      expect(rateLimiter.getCurrentPatternName()).toBe('weekend');
    });

    it('should return human_active for active sessions', () => {
      // Add requests to make session active
      for (let i = 0; i < 5; i++) {
        rateLimiter.recordRequest(true);
      }

      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(12);
      jest.spyOn(Date.prototype, 'getDay').mockReturnValue(2); // Tuesday

      expect(rateLimiter.getCurrentPatternName()).toBe('human_active');
    });

    it('should return human_idle as default', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(12);
      jest.spyOn(Date.prototype, 'getDay').mockReturnValue(2); // Tuesday

      expect(rateLimiter.getCurrentPatternName()).toBe('human_idle');
    });
  });

  describe('waitForNextRequest', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('should wait for calculated interval', async () => {
      const promise = rateLimiter.waitForNextRequest();

      // Fast-forward timers
      jest.runAllTimers();

      const waitTime = await promise;
      expect(waitTime).toBeGreaterThanOrEqual(0);
    });

    it('should not wait if sufficient time has passed', async () => {
      // Record a request and then mock time passage
      rateLimiter.recordRequest(true);
      rateLimiter.lastRequestTime = timestampUTC() - 120000; // 2 minutes ago

      const waitTime = await rateLimiter.waitForNextRequest();

      expect(waitTime).toBe(0);
    });
  });

  describe('setEmergencyMode', () => {
    it('should enable emergency mode', () => {
      rateLimiter.setEmergencyMode(true);

      expect(rateLimiter.emergencyMode).toBe(true);
    });

    it('should disable emergency mode', () => {
      rateLimiter.setEmergencyMode(false);

      expect(rateLimiter.emergencyMode).toBe(false);
    });

    it('should set timeout for automatic deactivation', () => {
      rateLimiter.setEmergencyMode(true, 5000);

      expect(rateLimiter.emergencyModeTimeout).toBeDefined();
    });

    it('should not set timeout when duration is 0', () => {
      rateLimiter.setEmergencyMode(true, 0);

      expect(rateLimiter.emergencyModeTimeout).toBeNull();
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      // Add some state
      rateLimiter.recordRequest(true);
      rateLimiter.setEmergencyMode(true);

      rateLimiter.reset();

      expect(rateLimiter.sessionHistory).toHaveLength(0);
      expect(rateLimiter.lastRequestTime).toBe(0);
      expect(rateLimiter.emergencyMode).toBe(false);
      expect(rateLimiter.emergencyModeTimeout).toBeNull();
    });

    it('should log reset message', () => {
      rateLimiter.reset();

      expect(mockLogger.info).toHaveBeenCalledWith('Rate limiter state reset');
    });
  });

  describe('updatePatterns', () => {
    it('should update pattern configuration', () => {
      const newPatterns = {
        human_active: { base: 45000, variance: 20000, weight: 0.4 },
      };

      rateLimiter.updatePatterns(newPatterns);

      expect(rateLimiter.patterns.human_active.base).toBe(45000);
      expect(rateLimiter.patterns.human_active.variance).toBe(20000);
      expect(rateLimiter.patterns.human_active.weight).toBe(0.4);
    });

    it('should preserve existing patterns not being updated', () => {
      const originalNightMode = { ...rateLimiter.patterns.night_mode };

      const newPatterns = {
        human_active: { base: 45000, variance: 20000, weight: 0.4 },
      };

      rateLimiter.updatePatterns(newPatterns);

      expect(rateLimiter.patterns.night_mode).toEqual(originalNightMode);
    });
  });

  describe('calculateAverageInterval', () => {
    it('should return 0 for insufficient history', () => {
      expect(rateLimiter.calculateAverageInterval()).toBe(0);

      rateLimiter.recordRequest(true);
      expect(rateLimiter.calculateAverageInterval()).toBe(0);
    });

    it('should calculate average from recent requests', () => {
      // Add requests with known timing
      const baseTime = timestampUTC();
      rateLimiter.sessionHistory = [baseTime, baseTime + 10000, baseTime + 25000, baseTime + 40000];

      const average = rateLimiter.calculateAverageInterval();

      // Average should be around (10000 + 15000 + 15000) / 3 = 13333
      expect(average).toBeCloseTo(13333, -2); // Within 100ms
    });
  });
});
