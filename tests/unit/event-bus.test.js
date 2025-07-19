import { jest } from '@jest/globals';
import { EventBus } from '../../src/infrastructure/event-bus.js';

describe('EventBus', () => {
  let eventBus;
  let mockHandler1;
  let mockHandler2;
  let mockAsyncHandler;

  beforeEach(() => {
    eventBus = new EventBus();
    mockHandler1 = jest.fn();
    mockHandler2 = jest.fn();
    mockAsyncHandler = jest.fn().mockResolvedValue('async-result');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with empty handlers and default max listeners', () => {
      expect(eventBus.handlers).toBeInstanceOf(Map);
      expect(eventBus.handlers.size).toBe(0);
      expect(eventBus.maxListeners).toBe(100);
    });
  });

  describe('on', () => {
    it('should register event handler', () => {
      const unsubscribe = eventBus.on('test-event', mockHandler1);

      expect(eventBus.handlers.has('test-event')).toBe(true);
      expect(eventBus.handlers.get('test-event')).toContain(mockHandler1);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should register multiple handlers for same event', () => {
      eventBus.on('test-event', mockHandler1);
      eventBus.on('test-event', mockHandler2);

      const handlers = eventBus.handlers.get('test-event');
      expect(handlers).toHaveLength(2);
      expect(handlers).toContain(mockHandler1);
      expect(handlers).toContain(mockHandler2);
    });

    it('should throw error for invalid event name', () => {
      expect(() => eventBus.on(123, mockHandler1)).toThrow('Event name must be a string');
      expect(() => eventBus.on(null, mockHandler1)).toThrow('Event name must be a string');
    });

    it('should throw error for invalid handler', () => {
      expect(() => eventBus.on('test-event', 'not-a-function')).toThrow('Event handler must be a function');
      expect(() => eventBus.on('test-event', null)).toThrow('Event handler must be a function');
    });

    it('should warn when max listeners reached', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      eventBus.setMaxListeners(2);

      eventBus.on('test-event', mockHandler1);
      eventBus.on('test-event', mockHandler2);
      eventBus.on('test-event', jest.fn()); // This should trigger warning

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Maximum listeners (2) reached for event 'test-event'")
      );

      consoleSpy.mockRestore();
    });

    it('should return unsubscribe function that removes handler', () => {
      const unsubscribe = eventBus.on('test-event', mockHandler1);
      expect(eventBus.getHandlerCount('test-event')).toBe(1);

      unsubscribe();
      expect(eventBus.getHandlerCount('test-event')).toBe(0);
    });
  });

  describe('once', () => {
    it('should register one-time event handler', async () => {
      const onceHandler = jest.fn();
      eventBus.once('test-event', onceHandler);

      await eventBus.emit('test-event', 'data1');
      await eventBus.emit('test-event', 'data2');

      expect(onceHandler).toHaveBeenCalledTimes(1);
      expect(onceHandler).toHaveBeenCalledWith('data1', 'test-event');
    });

    it('should return unsubscribe function', () => {
      const unsubscribe = eventBus.once('test-event', mockHandler1);
      expect(typeof unsubscribe).toBe('function');
      expect(eventBus.getHandlerCount('test-event')).toBe(1);

      unsubscribe();
      expect(eventBus.getHandlerCount('test-event')).toBe(0);
    });
  });

  describe('off', () => {
    it('should remove specific handler', () => {
      eventBus.on('test-event', mockHandler1);
      eventBus.on('test-event', mockHandler2);

      eventBus.off('test-event', mockHandler1);

      const handlers = eventBus.handlers.get('test-event');
      expect(handlers).toHaveLength(1);
      expect(handlers).toContain(mockHandler2);
      expect(handlers).not.toContain(mockHandler1);
    });

    it('should remove event entirely when no handlers remain', () => {
      eventBus.on('test-event', mockHandler1);
      eventBus.off('test-event', mockHandler1);

      expect(eventBus.handlers.has('test-event')).toBe(false);
    });

    it('should handle removing non-existent handler gracefully', () => {
      eventBus.off('non-existent', mockHandler1);
      eventBus.on('test-event', mockHandler1);
      eventBus.off('test-event', mockHandler2); // Different handler

      expect(eventBus.getHandlerCount('test-event')).toBe(1);
    });
  });

  describe('emit', () => {
    it('should emit event to all handlers', async () => {
      eventBus.on('test-event', mockHandler1);
      eventBus.on('test-event', mockHandler2);

      const results = await eventBus.emit('test-event', 'test-data');

      expect(mockHandler1).toHaveBeenCalledWith('test-data', 'test-event');
      expect(mockHandler2).toHaveBeenCalledWith('test-data', 'test-event');
      expect(results).toHaveLength(2);
    });

    it('should handle async handlers', async () => {
      eventBus.on('test-event', mockAsyncHandler);

      const results = await eventBus.emit('test-event', 'test-data');

      expect(mockAsyncHandler).toHaveBeenCalledWith('test-data', 'test-event');
      expect(results[0]).toBe('async-result');
    });

    it('should throw error for invalid event name', async () => {
      await expect(eventBus.emit(123, 'data')).rejects.toThrow('Event name must be a string');
      await expect(eventBus.emit(null, 'data')).rejects.toThrow('Event name must be a string');
    });

    it('should return empty array for non-existent event', async () => {
      const results = await eventBus.emit('non-existent', 'data');
      expect(results).toEqual([]);
    });

    it('should handle handler errors and emit error event', async () => {
      const errorHandler = jest.fn(() => {
        throw new Error('Handler error');
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      eventBus.on('test-event', errorHandler);
      eventBus.on('test-event', mockHandler1);

      const results = await eventBus.emit('test-event', 'data');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Handler error for event 'test-event'"),
        expect.any(Error)
      );
      expect(mockHandler1).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should emit with null data when not provided', async () => {
      eventBus.on('test-event', mockHandler1);

      await eventBus.emit('test-event');

      expect(mockHandler1).toHaveBeenCalledWith(null, 'test-event');
    });

    it('should execute handlers concurrently', async () => {
      let handler1Started = false;
      let handler2Started = false;

      const slowHandler1 = jest.fn(async () => {
        handler1Started = true;
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'handler1';
      });

      const slowHandler2 = jest.fn(async () => {
        handler2Started = true;
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(handler1Started).toBe(true); // Should start before this finishes
        return 'handler2';
      });

      eventBus.on('test-event', slowHandler1);
      eventBus.on('test-event', slowHandler2);

      const results = await eventBus.emit('test-event', 'data');

      expect(results).toEqual(['handler1', 'handler2']);
    });
  });

  describe('emitSync', () => {
    it('should emit event synchronously', () => {
      eventBus.on('test-event', mockHandler1);
      eventBus.on('test-event', mockHandler2);

      const results = eventBus.emitSync('test-event', 'test-data');

      expect(mockHandler1).toHaveBeenCalledWith('test-data', 'test-event');
      expect(mockHandler2).toHaveBeenCalledWith('test-data', 'test-event');
      expect(results).toHaveLength(2);
    });

    it('should throw error for invalid event name', () => {
      expect(() => eventBus.emitSync(123, 'data')).toThrow('Event name must be a string');
    });

    it('should handle synchronous errors', () => {
      const errorHandler = jest.fn(() => {
        throw new Error('Sync handler error');
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      eventBus.on('test-event', errorHandler);
      eventBus.on('test-event', mockHandler1);

      const results = eventBus.emitSync('test-event', 'data');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Handler error for event 'test-event'"),
        expect.any(Error)
      );
      expect(mockHandler1).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should return empty array for non-existent event', () => {
      const results = eventBus.emitSync('non-existent', 'data');
      expect(results).toEqual([]);
    });
  });

  describe('removeAllListeners', () => {
    beforeEach(() => {
      eventBus.on('event1', mockHandler1);
      eventBus.on('event1', mockHandler2);
      eventBus.on('event2', mockHandler1);
    });

    it('should remove all handlers for specific event', () => {
      eventBus.removeAllListeners('event1');

      expect(eventBus.handlers.has('event1')).toBe(false);
      expect(eventBus.handlers.has('event2')).toBe(true);
    });

    it('should remove all handlers for all events when no event specified', () => {
      eventBus.removeAllListeners();

      expect(eventBus.handlers.size).toBe(0);
    });
  });

  describe('getEventNames', () => {
    it('should return array of event names', () => {
      eventBus.on('event1', mockHandler1);
      eventBus.on('event2', mockHandler2);

      const eventNames = eventBus.getEventNames();

      expect(eventNames).toHaveLength(2);
      expect(eventNames).toContain('event1');
      expect(eventNames).toContain('event2');
    });

    it('should return empty array when no events', () => {
      const eventNames = eventBus.getEventNames();
      expect(eventNames).toEqual([]);
    });
  });

  describe('getHandlerCount', () => {
    it('should return handler count for event', () => {
      eventBus.on('test-event', mockHandler1);
      eventBus.on('test-event', mockHandler2);

      expect(eventBus.getHandlerCount('test-event')).toBe(2);
    });

    it('should return 0 for non-existent event', () => {
      expect(eventBus.getHandlerCount('non-existent')).toBe(0);
    });
  });

  describe('setMaxListeners', () => {
    it('should set maximum listeners', () => {
      eventBus.setMaxListeners(50);
      expect(eventBus.maxListeners).toBe(50);
    });

    it('should throw error for invalid max listeners', () => {
      expect(() => eventBus.setMaxListeners('invalid')).toThrow('Max listeners must be a non-negative number');
      expect(() => eventBus.setMaxListeners(-1)).toThrow('Max listeners must be a non-negative number');
    });

    it('should accept zero as valid max listeners', () => {
      eventBus.setMaxListeners(0);
      expect(eventBus.maxListeners).toBe(0);
    });
  });

  describe('createFiltered', () => {
    it('should create filtered event bus', async () => {
      const filter = event => event.startsWith('allowed-');
      const filteredBus = eventBus.createFiltered(filter);

      const filteredHandler = jest.fn();
      filteredBus.on('allowed-event', filteredHandler);

      // This should be forwarded
      await eventBus.emit('allowed-event', 'data1');
      // This should not be forwarded
      await eventBus.emit('blocked-event', 'data2');

      // Wait for the next event loop to ensure the event has been processed
      await new Promise(resolve => setImmediate(resolve));

      expect(filteredHandler).toHaveBeenCalledTimes(1);
      expect(filteredHandler).toHaveBeenCalledWith('data1', 'allowed-event');
    });
  });

  describe('waitFor', () => {
    it('should resolve when event is emitted', async () => {
      const promise = eventBus.waitFor('test-event');

      // Emit event after a short delay
      setTimeout(() => eventBus.emit('test-event', 'test-data'), 10);

      const result = await promise;
      expect(result).toBe('test-data');
    });

    it('should timeout if event not emitted within timeout', async () => {
      const promise = eventBus.waitFor('test-event', 50);

      await expect(promise).rejects.toThrow("Timeout waiting for event 'test-event' after 50ms");
    });

    it('should work without timeout', async () => {
      const promise = eventBus.waitFor('test-event');

      setTimeout(() => eventBus.emit('test-event', 'delayed-data'), 10);

      const result = await promise;
      expect(result).toBe('delayed-data');
    });
  });

  describe('getStats', () => {
    it('should return event bus statistics', () => {
      eventBus.on('event1', mockHandler1);
      eventBus.on('event1', mockHandler2);
      eventBus.on('event2', mockHandler1);
      eventBus.setMaxListeners(150);

      const stats = eventBus.getStats();

      expect(stats.eventCount).toBe(2);
      expect(stats.totalHandlers).toBe(3);
      expect(stats.maxListeners).toBe(150);
      expect(stats.events).toHaveLength(2);
      expect(stats.events).toContainEqual({ name: 'event1', handlerCount: 2 });
      expect(stats.events).toContainEqual({ name: 'event2', handlerCount: 1 });
    });

    it('should return empty stats for empty event bus', () => {
      const stats = eventBus.getStats();

      expect(stats.eventCount).toBe(0);
      expect(stats.totalHandlers).toBe(0);
      expect(stats.events).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple rapid emissions', async () => {
      let callCount = 0;
      const handler = jest.fn(() => callCount++);

      eventBus.on('rapid-event', handler);

      const promises = Array.from({ length: 10 }, (_, i) => eventBus.emit('rapid-event', `data-${i}`));

      await Promise.all(promises);

      expect(handler).toHaveBeenCalledTimes(10);
    });

    it('should handle handlers that modify event handlers during execution', async () => {
      const removingHandler = jest.fn(() => {
        eventBus.off('test-event', removingHandler);
      });

      eventBus.on('test-event', removingHandler);
      eventBus.on('test-event', mockHandler1);

      await eventBus.emit('test-event', 'data');

      expect(removingHandler).toHaveBeenCalledTimes(1);
      expect(mockHandler1).toHaveBeenCalledTimes(1);
      expect(eventBus.getHandlerCount('test-event')).toBe(1);
    });

    it('should handle async errors in error emission', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const errorHandler = jest.fn(() => {
        throw new Error('Handler error');
      });

      eventBus.on('test-event', errorHandler);

      await eventBus.emit('test-event', 'data');

      // Wait for setImmediate to execute
      await new Promise(resolve => setImmediate(resolve));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
