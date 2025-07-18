/**
 * Event Bus for decoupled communication between components
 */
export class EventBus {
  constructor() {
    this.handlers = new Map();
    this.maxListeners = 100; // Prevent memory leaks
  }

  /**
   * Register an event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    if (typeof event !== 'string') {
      throw new Error('Event name must be a string');
    }

    if (typeof handler !== 'function') {
      throw new Error('Event handler must be a function');
    }

    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }

    const eventHandlers = this.handlers.get(event);

    // Check for too many listeners
    if (eventHandlers.length >= this.maxListeners) {
      console.warn(`EventBus: Maximum listeners (${this.maxListeners}) reached for event '${event}'`);
    }

    eventHandlers.push(handler);

    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  /**
   * Register a one-time event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   * @returns {Function} Unsubscribe function
   */
  once(event, handler) {
    const onceHandler = (...args) => {
      this.off(event, onceHandler);
      handler(...args);
    };

    return this.on(event, onceHandler);
  }

  /**
   * Remove an event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function to remove
   */
  off(event, handler) {
    if (!this.handlers.has(event)) {
      return;
    }

    const eventHandlers = this.handlers.get(event);
    const index = eventHandlers.indexOf(handler);

    if (index !== -1) {
      eventHandlers.splice(index, 1);

      // Clean up empty handler arrays
      if (eventHandlers.length === 0) {
        this.handlers.delete(event);
      }
    }
  }

  /**
   * Emit an event to all registered handlers
   * @param {string} event - Event name
   * @param {*} data - Event data
   * @returns {Promise<Array>} Array of handler results
   */
  async emit(event, data = null) {
    if (typeof event !== 'string') {
      throw new Error('Event name must be a string');
    }

    const eventHandlers = this.handlers.get(event);
    if (!eventHandlers || eventHandlers.length === 0) {
      return [];
    }

    // Create a copy to avoid issues if handlers modify the array
    const handlers = [...eventHandlers];
    const results = [];
    const errors = [];

    // Execute handlers concurrently
    const promises = handlers.map(async (handler, index) => {
      try {
        const result = await handler(data, event);
        results[index] = result;
      } catch (error) {
        errors[index] = error;
        console.error(`EventBus: Handler error for event '${event}':`, error);
      }
    });

    await Promise.all(promises);

    // If there were errors, emit an error event
    if (errors.some((error) => error)) {
      setImmediate(() => {
        this.emit('error', {
          event,
          data,
          errors: errors.filter((error) => error),
        });
      });
    }

    return results;
  }

  /**
   * Emit an event synchronously
   * @param {string} event - Event name
   * @param {*} data - Event data
   * @returns {Array} Array of handler results
   */
  emitSync(event, data = null) {
    if (typeof event !== 'string') {
      throw new Error('Event name must be a string');
    }

    const eventHandlers = this.handlers.get(event);
    if (!eventHandlers || eventHandlers.length === 0) {
      return [];
    }

    // Create a copy to avoid issues if handlers modify the array
    const handlers = [...eventHandlers];
    const results = [];

    for (let i = 0; i < handlers.length; i++) {
      try {
        results[i] = handlers[i](data, event);
      } catch (error) {
        console.error(`EventBus: Handler error for event '${event}':`, error);

        // Emit error event after current execution
        setImmediate(() => {
          this.emit('error', {
            event,
            data,
            error,
          });
        });
      }
    }

    return results;
  }

  /**
   * Remove all handlers for an event
   * @param {string} event - Event name (optional, removes all if not specified)
   */
  removeAllListeners(event = null) {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  /**
   * Get all event names that have handlers
   */
  getEventNames() {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get handler count for an event
   */
  getHandlerCount(event) {
    const eventHandlers = this.handlers.get(event);
    return eventHandlers ? eventHandlers.length : 0;
  }

  /**
   * Set maximum number of listeners per event
   */
  setMaxListeners(max) {
    if (typeof max !== 'number' || max < 0) {
      throw new Error('Max listeners must be a non-negative number');
    }
    this.maxListeners = max;
  }

  /**
   * Create a new EventBus with filtered events
   */
  createFiltered(eventFilter) {
    const filteredBus = new EventBus();

    // Forward filtered events
    this.on('*', (data, event) => {
      if (eventFilter(event)) {
        filteredBus.emit(event, data);
      }
    });

    return filteredBus;
  }

  /**
   * Wait for an event to be emitted
   * @param {string} event - Event name
   * @param {number} timeout - Timeout in milliseconds (optional)
   * @returns {Promise} Promise that resolves with event data
   */
  waitFor(event, timeout = null) {
    return new Promise((resolve, reject) => {
      let timeoutId;

      const handler = (data) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(data);
      };

      const unsubscribe = this.once(event, handler);

      if (timeout) {
        timeoutId = setTimeout(() => {
          unsubscribe();
          reject(new Error(`Timeout waiting for event '${event}' after ${timeout}ms`));
        }, timeout);
      }
    });
  }

  /**
   * Get statistics about the event bus
   */
  getStats() {
    const events = this.getEventNames();
    const totalHandlers = events.reduce((sum, event) => sum + this.getHandlerCount(event), 0);

    return {
      eventCount: events.length,
      totalHandlers,
      maxListeners: this.maxListeners,
      events: events.map((event) => ({
        name: event,
        handlerCount: this.getHandlerCount(event),
      })),
    };
  }
}
