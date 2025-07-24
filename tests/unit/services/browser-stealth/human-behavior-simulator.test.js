import { jest } from '@jest/globals';
import { HumanBehaviorSimulator } from '../../../../src/services/browser-stealth/human-behavior-simulator.js';

describe('HumanBehaviorSimulator', () => {
  let simulator;
  let mockPage;
  let mockLogger;
  let mockMouse;
  let mockElement;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMouse = {
      move: jest.fn(),
    };

    mockElement = {
      click: jest.fn(),
      fill: jest.fn(),
      type: jest.fn(),
      hover: jest.fn(),
      boundingBox: jest.fn(),
    };

    mockPage = {
      goto: jest.fn(),
      mouse: mockMouse,
      viewportSize: jest.fn(() => ({ width: 1920, height: 1080 })),
      evaluate: jest.fn(),
      $: jest.fn(),
      $$: jest.fn(),
      fill: jest.fn(),
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    simulator = new HumanBehaviorSimulator(mockPage, mockLogger);

    // Mock setTimeout to control delays in tests
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      expect(simulator.page).toBe(mockPage);
      expect(simulator.logger).toBe(mockLogger);
      expect(simulator.mousePosition).toEqual({ x: 0, y: 0 });
      expect(simulator.isSimulationEnabled).toBe(true);
      expect(simulator.lastInteractionTime).toBeGreaterThan(0);
      expect(simulator.config).toBeDefined();
    });

    it('should have proper configuration structure', () => {
      expect(simulator.config.mouseMovements.enabled).toBe(true);
      expect(simulator.config.scrolling.enabled).toBe(true);
      expect(simulator.config.reading.enabled).toBe(true);
      expect(simulator.config.interaction.enabled).toBe(true);
      expect(simulator.config.reading.wordsPerMinute).toBe(200);
    });
  });

  describe('simulateRealisticPageLoad', () => {
    it('should navigate to URL with realistic behavior', async () => {
      const mockResponse = { status: 200 };
      mockPage.goto.mockResolvedValue(mockResponse);
      jest.spyOn(simulator, 'simulateInitialPageInteraction').mockResolvedValue();

      const promise = simulator.simulateRealisticPageLoad('https://example.com');

      // Fast-forward through delays
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });
      expect(simulator.simulateInitialPageInteraction).toHaveBeenCalled();
      expect(result).toBe(mockResponse);
    });

    it('should handle navigation errors', async () => {
      const error = new Error('Navigation failed');
      mockPage.goto.mockRejectedValue(error);

      const promise = simulator.simulateRealisticPageLoad('https://example.com');
      await jest.runAllTimersAsync();

      await expect(promise).rejects.toThrow('Navigation failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Error during realistic page load', {
        url: 'https://example.com',
        error: 'Navigation failed',
      });
    });

    it('should skip simulation when disabled', async () => {
      simulator.isSimulationEnabled = false;
      const mockResponse = { status: 200 };
      mockPage.goto.mockResolvedValue(mockResponse);
      jest.spyOn(simulator, 'simulateInitialPageInteraction').mockResolvedValue();

      const promise = simulator.simulateRealisticPageLoad('https://example.com');
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe(mockResponse);
      expect(simulator.simulateInitialPageInteraction).not.toHaveBeenCalled();
    });

    it('should pass through custom options', async () => {
      const mockResponse = { status: 200 };
      mockPage.goto.mockResolvedValue(mockResponse);
      jest.spyOn(simulator, 'simulateInitialPageInteraction').mockResolvedValue();

      const customOptions = { timeout: 60000 };
      const promise = simulator.simulateRealisticPageLoad('https://example.com', customOptions);
      await jest.runAllTimersAsync();

      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', {
        waitUntil: 'networkidle0',
        timeout: 60000,
      });
    });
  });

  describe('simulateInitialPageInteraction', () => {
    it('should perform all enabled interactions', async () => {
      jest.spyOn(simulator, 'simulateReadingBehavior').mockResolvedValue();
      jest.spyOn(simulator, 'simulateMouseMovements').mockResolvedValue();
      jest.spyOn(simulator, 'simulateScrolling').mockResolvedValue();
      jest.spyOn(simulator, 'simulateElementHovering').mockResolvedValue();

      // Mock Math.random to ensure interactions trigger
      const originalRandom = Math.random;
      Math.random = jest
        .fn()
        .mockReturnValueOnce(0.5) // scrolling probability
        .mockReturnValueOnce(0.2); // hover probability

      const promise = simulator.simulateInitialPageInteraction();
      await jest.runAllTimersAsync();
      await promise;

      expect(simulator.simulateReadingBehavior).toHaveBeenCalled();
      expect(simulator.simulateMouseMovements).toHaveBeenCalled();
      expect(simulator.simulateScrolling).toHaveBeenCalled();
      expect(simulator.simulateElementHovering).toHaveBeenCalled();

      Math.random = originalRandom;
    });

    it('should skip disabled interactions', async () => {
      simulator.config.mouseMovements.enabled = false;
      simulator.config.scrolling.enabled = false;
      simulator.config.interaction.enabled = false;

      jest.spyOn(simulator, 'simulateReadingBehavior').mockResolvedValue();
      jest.spyOn(simulator, 'simulateMouseMovements').mockResolvedValue();
      jest.spyOn(simulator, 'simulateScrolling').mockResolvedValue();
      jest.spyOn(simulator, 'simulateElementHovering').mockResolvedValue();

      const promise = simulator.simulateInitialPageInteraction();
      await jest.runAllTimersAsync();
      await promise;

      expect(simulator.simulateReadingBehavior).toHaveBeenCalled();
      expect(simulator.simulateMouseMovements).not.toHaveBeenCalled();
      expect(simulator.simulateScrolling).not.toHaveBeenCalled();
      expect(simulator.simulateElementHovering).not.toHaveBeenCalled();
    });
  });

  describe('simulateMouseMovements', () => {
    it('should perform random mouse movements', async () => {
      jest.spyOn(simulator, 'smoothMouseMove').mockResolvedValue();

      const promise = simulator.simulateMouseMovements();
      await jest.runAllTimersAsync();
      await promise;

      expect(simulator.smoothMouseMove).toHaveBeenCalled();
      expect(mockPage.viewportSize).toHaveBeenCalled();
    });

    it('should respect movement count configuration', async () => {
      simulator.config.mouseMovements.minMovements = 1;
      simulator.config.mouseMovements.maxMovements = 1;
      jest.spyOn(simulator, 'smoothMouseMove').mockResolvedValue();

      const promise = simulator.simulateMouseMovements();
      await jest.runAllTimersAsync();
      await promise;

      expect(simulator.smoothMouseMove).toHaveBeenCalledTimes(1);
    });
  });

  describe('smoothMouseMove', () => {
    it('should perform smooth movement to target coordinates', async () => {
      simulator.mousePosition = { x: 100, y: 100 };

      const promise = simulator.smoothMouseMove(200, 200);
      await jest.runAllTimersAsync();
      await promise;

      expect(mockMouse.move).toHaveBeenCalled();
      expect(simulator.mousePosition.x).toBeCloseTo(200, 0);
      expect(simulator.mousePosition.y).toBeCloseTo(200, 0);
    });

    it('should clamp coordinates to viewport bounds', async () => {
      mockPage.viewportSize.mockReturnValue({ width: 800, height: 600 });
      simulator.mousePosition = { x: 0, y: 0 };

      const promise = simulator.smoothMouseMove(1000, 1000); // Beyond viewport
      await jest.runAllTimersAsync();
      await promise;

      expect(simulator.mousePosition.x).toBeLessThanOrEqual(800);
      expect(simulator.mousePosition.y).toBeLessThanOrEqual(600);
    });

    it('should handle mouse move errors gracefully', async () => {
      mockMouse.move.mockRejectedValue(new Error('Mouse move failed'));

      const promise = simulator.smoothMouseMove(200, 200);
      await jest.runAllTimersAsync();
      await promise;

      expect(mockLogger.debug).toHaveBeenCalledWith('Mouse move failed', {
        error: 'Mouse move failed',
      });
    });
  });

  describe('simulateScrolling', () => {
    it('should perform scrolling actions', async () => {
      simulator.config.scrolling.minScrolls = 1;
      simulator.config.scrolling.maxScrolls = 1;

      const promise = simulator.simulateScrolling();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockPage.evaluate).toHaveBeenCalled();
    });

    it('should handle scroll errors gracefully', async () => {
      mockPage.evaluate.mockRejectedValue(new Error('Scroll failed'));

      const promise = simulator.simulateScrolling();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockLogger.debug).toHaveBeenCalledWith('Scroll simulation failed', {
        error: 'Scroll failed',
      });
    });

    it('should scroll in different directions', async () => {
      simulator.config.scrolling.minScrolls = 2;
      simulator.config.scrolling.maxScrolls = 2;

      // Mock Math.random to control scroll direction
      const originalRandom = Math.random;
      Math.random = jest.fn().mockReturnValue(0.9); // Force upward scroll (> 0.85)

      const promise = simulator.simulateScrolling();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockPage.evaluate).toHaveBeenCalledWith(expect.any(Function), expect.any(Number));

      Math.random = originalRandom;
    });
  });

  describe('simulateReadingBehavior', () => {
    it('should estimate reading time based on content', async () => {
      const textLength = 1000; // 1000 characters
      mockPage.evaluate.mockResolvedValue(textLength);

      const promise = simulator.simulateReadingBehavior();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockPage.evaluate).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Simulating reading behavior',
        expect.objectContaining({
          textLength,
          wordsEstimate: expect.any(Number),
          baseReadingTime: expect.any(Number),
          finalReadingTime: expect.any(Number),
        })
      );
    });

    it('should skip reading when disabled', async () => {
      simulator.config.reading.enabled = false;

      const promise = simulator.simulateReadingBehavior();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockPage.evaluate).not.toHaveBeenCalled();
    });

    it('should handle content analysis errors with fallback', async () => {
      mockPage.evaluate.mockRejectedValue(new Error('Content analysis failed'));

      const promise = simulator.simulateReadingBehavior();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockLogger.debug).toHaveBeenCalledWith('Reading simulation fallback', {
        error: 'Content analysis failed',
      });
    });

    it('should cap reading time within limits', async () => {
      // Test with very long content
      const longTextLength = 100000; // 100k characters
      mockPage.evaluate.mockResolvedValue(longTextLength);

      const promise = simulator.simulateReadingBehavior();
      await jest.runAllTimersAsync();
      await promise;

      const logCall = mockLogger.debug.mock.calls.find(call => call[0] === 'Simulating reading behavior');
      expect(logCall[1].finalReadingTime).toBeLessThanOrEqual(15000); // Max 15 seconds
    });
  });

  describe('simulateElementHovering', () => {
    it('should hover over interactive elements', async () => {
      const mockElements = [mockElement, mockElement];
      mockPage.$$.mockResolvedValue(mockElements);
      mockElement.boundingBox.mockResolvedValue({
        x: 100,
        y: 100,
        width: 200,
        height: 50,
      });
      jest.spyOn(simulator, 'smoothMouseMove').mockResolvedValue();

      const promise = simulator.simulateElementHovering();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockPage.$$).toHaveBeenCalledWith('a, button, [role="button"], .clickable, .link');
      expect(simulator.smoothMouseMove).toHaveBeenCalled();
      expect(mockElement.hover).toHaveBeenCalled();
    });

    it('should handle no hoverable elements', async () => {
      mockPage.$$.mockResolvedValue([]);

      const promise = simulator.simulateElementHovering();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockElement.hover).not.toHaveBeenCalled();
    });

    it('should handle hover errors gracefully', async () => {
      const mockElements = [mockElement];
      mockPage.$$.mockResolvedValue(mockElements);
      mockElement.boundingBox.mockResolvedValue({
        x: 100,
        y: 100,
        width: 200,
        height: 50,
      });
      mockElement.hover.mockRejectedValue(new Error('Hover failed'));
      jest.spyOn(simulator, 'smoothMouseMove').mockResolvedValue();

      const promise = simulator.simulateElementHovering();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockLogger.debug).toHaveBeenCalledWith('Element hover failed', {
        error: 'Hover failed',
      });
    });

    it('should handle element selection errors', async () => {
      mockPage.$$.mockRejectedValue(new Error('Element selection failed'));

      const promise = simulator.simulateElementHovering();
      await jest.runAllTimersAsync();
      await promise;

      expect(mockLogger.debug).toHaveBeenCalledWith('Element hovering simulation failed', {
        error: 'Element selection failed',
      });
    });
  });

  describe('simulateTyping', () => {
    it('should type text with human-like delays when simulation enabled', async () => {
      mockPage.$.mockResolvedValue(mockElement);
      mockElement.boundingBox.mockResolvedValue({ x: 100, y: 100, width: 200, height: 50 });

      const promise = simulator.simulateTyping('#input', 'test text');
      await jest.runAllTimersAsync();
      await promise;

      expect(mockElement.click).toHaveBeenCalled();
      expect(mockElement.fill).toHaveBeenCalledWith('');
      expect(mockElement.type).toHaveBeenCalledTimes('test text'.length);
      expect(mockLogger.debug).toHaveBeenCalledWith('Typing simulation completed', {
        selector: '#input',
        textLength: 9,
      });
    });

    it('should use fast typing when simulation disabled', async () => {
      simulator.config.interaction.enabled = false;

      const promise = simulator.simulateTyping('#input', 'test text');
      await jest.runAllTimersAsync();
      await promise;

      expect(mockPage.fill).toHaveBeenCalledWith('#input', 'test text');
    });

    it('should handle element not found', async () => {
      mockPage.$.mockResolvedValue(null);

      const promise = simulator.simulateTyping('#nonexistent', 'test');
      await jest.runAllTimersAsync();

      await expect(promise).rejects.toThrow('Element not found: #nonexistent');
    });

    it('should add extra delays for punctuation', async () => {
      mockPage.$.mockResolvedValue(mockElement);
      simulator.config.interaction.typeDelay = { min: 50, max: 50 }; // Fixed delay for testing

      const promise = simulator.simulateTyping('#input', 'hello, world!');
      await jest.runAllTimersAsync();
      await promise;

      expect(mockElement.type).toHaveBeenCalledWith(',');
      expect(mockElement.type).toHaveBeenCalledWith('!');
    });
  });

  describe('simulateClick', () => {
    it('should click element with human-like behavior when simulation enabled', async () => {
      mockPage.$.mockResolvedValue(mockElement);
      mockElement.boundingBox.mockResolvedValue({
        x: 100,
        y: 100,
        width: 200,
        height: 50,
      });
      jest.spyOn(simulator, 'smoothMouseMove').mockResolvedValue();

      const promise = simulator.simulateClick('#button');
      await jest.runAllTimersAsync();
      await promise;

      expect(simulator.smoothMouseMove).toHaveBeenCalledWith(200, 125); // Center of element
      expect(mockElement.click).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Click simulation completed', {
        selector: '#button',
      });
    });

    it('should use direct click when simulation disabled', async () => {
      simulator.config.interaction.enabled = false;

      const promise = simulator.simulateClick('#button');
      await jest.runAllTimersAsync();
      await promise;

      expect(mockPage.click).toHaveBeenCalledWith('#button', {});
    });

    it('should handle element not found', async () => {
      mockPage.$.mockResolvedValue(null);

      const promise = simulator.simulateClick('#nonexistent');
      await jest.runAllTimersAsync();

      await expect(promise).rejects.toThrow('Element not found: #nonexistent');
    });

    it('should pass through click options', async () => {
      simulator.config.interaction.enabled = false;
      const options = { button: 'right' };

      const promise = simulator.simulateClick('#button', options);
      await jest.runAllTimersAsync();
      await promise;

      expect(mockPage.click).toHaveBeenCalledWith('#button', options);
    });
  });

  describe('randomDelay', () => {
    it('should create delay within specified range', async () => {
      jest.spyOn(simulator, 'generateNormalDelay').mockReturnValue(1000);

      const startTime = Date.now();
      const promise = simulator.randomDelay(500, 1500);
      await jest.runAllTimersAsync();
      await promise;

      expect(simulator.generateNormalDelay).toHaveBeenCalledWith(500, 1500);
    });
  });

  describe('generateNormalDelay', () => {
    it('should generate delays within specified range', () => {
      const min = 100;
      const max = 500;

      // Generate multiple delays to test distribution
      for (let i = 0; i < 50; i++) {
        const delay = simulator.generateNormalDelay(min, max);
        expect(delay).toBeGreaterThanOrEqual(min);
        expect(delay).toBeLessThanOrEqual(max);
        expect(Number.isInteger(delay)).toBe(true);
      }
    });

    it('should have mean close to middle of range', () => {
      const min = 100;
      const max = 500;
      const delays = [];

      for (let i = 0; i < 1000; i++) {
        delays.push(simulator.generateNormalDelay(min, max));
      }

      const mean = delays.reduce((sum, delay) => sum + delay, 0) / delays.length;
      const expectedMean = (min + max) / 2;

      // Allow 10% tolerance for statistical variation
      expect(mean).toBeCloseTo(expectedMean, -1);
    });
  });

  describe('setSimulationEnabled', () => {
    it('should toggle simulation state', () => {
      simulator.setSimulationEnabled(false);
      expect(simulator.isSimulationEnabled).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Behavior simulation toggled', {
        enabled: false,
      });

      simulator.setSimulationEnabled(true);
      expect(simulator.isSimulationEnabled).toBe(true);
    });
  });

  describe('updateConfig', () => {
    it('should merge new configuration', () => {
      const newConfig = {
        mouseMovements: { enabled: false },
        reading: { wordsPerMinute: 300 },
      };

      simulator.updateConfig(newConfig);

      expect(simulator.config.mouseMovements.enabled).toBe(false);
      expect(simulator.config.reading.wordsPerMinute).toBe(300);
      expect(simulator.config.scrolling.enabled).toBe(true); // Unchanged
      expect(mockLogger.info).toHaveBeenCalledWith('Behavior simulation config updated', {
        newConfig,
      });
    });
  });

  describe('getStatus', () => {
    it('should return current status information', () => {
      simulator.mousePosition = { x: 100, y: 200 };
      simulator.lastInteractionTime = 1000;

      // Mock Date.now for consistent testing
      const mockNow = 2000;
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);

      const status = simulator.getStatus();

      expect(status).toEqual({
        enabled: true,
        lastInteractionTime: 1000,
        timeSinceLastInteraction: 1000,
        mousePosition: { x: 100, y: 200 },
        config: simulator.config,
      });

      Date.now.mockRestore();
    });
  });

  describe('reset', () => {
    it('should reset simulation state', () => {
      simulator.mousePosition = { x: 100, y: 200 };
      const oldTime = simulator.lastInteractionTime;

      simulator.reset();

      expect(simulator.mousePosition).toEqual({ x: 0, y: 0 });
      expect(simulator.lastInteractionTime).toBeGreaterThan(oldTime);
      expect(mockLogger.info).toHaveBeenCalledWith('Behavior simulation state reset');
    });
  });
});
