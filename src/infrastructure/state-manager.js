/**
 * Centralized state management with validation and subscriptions
 */
export class StateManager {
  constructor(initialState = {}) {
    this.state = { ...initialState };
    this.subscribers = new Map();
    this.validators = new Map();
    this.locked = false;
  }

  /**
   * Get a state value
   * @param {string} key - State key
   * @param {*} defaultValue - Default value if key doesn't exist
   * @returns {*} State value
   */
  get(key, defaultValue = undefined) {
    if (typeof key !== 'string') {
      throw new Error('State key must be a string');
    }

    return Object.prototype.hasOwnProperty.call(this.state, key) ? this.state[key] : defaultValue;
  }

  /**
   * Set a state value
   * @param {string} key - State key
   * @param {*} value - New value
   * @returns {boolean} True if value was set, false if validation failed
   */
  set(key, value) {
    if (typeof key !== 'string') {
      throw new Error('State key must be a string');
    }

    if (this.locked) {
      throw new Error('StateManager is locked and cannot be modified');
    }

    // Validate value if validator exists
    if (this.validators.has(key)) {
      const validator = this.validators.get(key);
      const validationResult = validator(value, this.state[key]);

      if (validationResult !== true) {
        throw new Error(`Validation failed for key '${key}': ${validationResult}`);
      }
    }

    const oldValue = this.state[key];
    const hasChanged = oldValue !== value;

    if (hasChanged) {
      this.state[key] = value;
      this.notifySubscribers(key, value, oldValue);
    }

    return true;
  }

  /**
   * Update multiple state values atomically
   * @param {Object} updates - Object with key-value pairs to update
   */
  update(updates) {
    if (typeof updates !== 'object' || updates === null) {
      throw new Error('Updates must be an object');
    }

    if (this.locked) {
      throw new Error('StateManager is locked and cannot be modified');
    }

    // Validate all updates first
    const validatedUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      if (this.validators.has(key)) {
        const validator = this.validators.get(key);
        const validationResult = validator(value, this.state[key]);

        if (validationResult !== true) {
          throw new Error(`Validation failed for key '${key}': ${validationResult}`);
        }
      }
      validatedUpdates[key] = value;
    }

    // Apply all updates
    const changes = [];
    for (const [key, value] of Object.entries(validatedUpdates)) {
      const oldValue = this.state[key];
      if (oldValue !== value) {
        this.state[key] = value;
        changes.push({ key, value, oldValue });
      }
    }

    // Notify subscribers of changes
    for (const change of changes) {
      this.notifySubscribers(change.key, change.value, change.oldValue);
    }
  }

  /**
   * Check if a key exists in the state
   * @param {string} key - State key
   * @returns {boolean} True if key exists
   */
  has(key) {
    return Object.prototype.hasOwnProperty.call(this.state, key);
  }

  /**
   * Delete a state key
   * @param {string} key - State key
   * @returns {boolean} True if key was deleted
   */
  delete(key) {
    if (typeof key !== 'string') {
      throw new Error('State key must be a string');
    }

    if (this.locked) {
      throw new Error('StateManager is locked and cannot be modified');
    }

    if (Object.prototype.hasOwnProperty.call(this.state, key)) {
      const oldValue = this.state[key];
      delete this.state[key];
      this.notifySubscribers(key, undefined, oldValue);
      return true;
    }

    return false;
  }

  /**
   * Subscribe to changes in a specific state key
   * @param {string} key - State key to watch
   * @param {Function} callback - Callback function (newValue, oldValue, key) => void
   * @returns {Function} Unsubscribe function
   */
  subscribe(key, callback) {
    if (typeof key !== 'string') {
      throw new Error('State key must be a string');
    }

    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }

    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, []);
    }

    this.subscribers.get(key).push(callback);

    // Return unsubscribe function
    return () => this.unsubscribe(key, callback);
  }

  /**
   * Unsubscribe from state changes
   * @param {string} key - State key
   * @param {Function} callback - Callback function to remove
   */
  unsubscribe(key, callback) {
    if (!this.subscribers.has(key)) {
      return;
    }

    const callbacks = this.subscribers.get(key);
    const index = callbacks.indexOf(callback);

    if (index !== -1) {
      callbacks.splice(index, 1);

      // Clean up empty arrays
      if (callbacks.length === 0) {
        this.subscribers.delete(key);
      }
    }
  }

  /**
   * Set a validator for a state key
   * @param {string} key - State key
   * @param {Function} validator - Validator function (newValue, oldValue) => true | string
   */
  setValidator(key, validator) {
    if (typeof key !== 'string') {
      throw new Error('State key must be a string');
    }

    if (typeof validator !== 'function') {
      throw new Error('Validator must be a function');
    }

    this.validators.set(key, validator);
  }

  /**
   * Remove a validator for a state key
   * @param {string} key - State key
   */
  removeValidator(key) {
    this.validators.delete(key);
  }

  /**
   * Get all state keys
   * @returns {Array<string>} Array of state keys
   */
  getKeys() {
    return Object.keys(this.state);
  }

  /**
   * Get all state as a copy
   * @returns {Object} Copy of current state
   */
  getAll() {
    return { ...this.state };
  }

  /**
   * Reset state to initial values or provided state
   * @param {Object} newState - New state object (optional)
   */
  reset(newState = {}) {
    if (this.locked) {
      throw new Error('StateManager is locked and cannot be modified');
    }

    const oldState = { ...this.state };
    this.state = { ...newState };

    // Notify subscribers of all changes
    const allKeys = new Set([...Object.keys(oldState), ...Object.keys(newState)]);
    for (const key of allKeys) {
      const oldValue = oldState[key];
      const newValue = this.state[key];

      if (oldValue !== newValue) {
        this.notifySubscribers(key, newValue, oldValue);
      }
    }
  }

  /**
   * Lock the state manager (prevent modifications)
   */
  lock() {
    this.locked = true;
  }

  /**
   * Unlock the state manager (allow modifications)
   */
  unlock() {
    this.locked = false;
  }

  /**
   * Check if state manager is locked
   * @returns {boolean} True if locked
   */
  isLocked() {
    return this.locked;
  }

  /**
   * Create a snapshot of current state
   * @returns {Object} State snapshot with metadata
   */
  createSnapshot() {
    return {
      state: { ...this.state },
      timestamp: Date.now(),
      subscriberCount: Array.from(this.subscribers.values()).reduce((sum, arr) => sum + arr.length, 0),
      validatorCount: this.validators.size,
    };
  }

  /**
   * Restore state from snapshot
   * @param {Object} snapshot - State snapshot
   */
  restoreSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('Invalid snapshot');
    }

    this.reset(snapshot.state);
  }

  /**
   * Notify subscribers of state changes
   * @private
   */
  notifySubscribers(key, newValue, oldValue) {
    const callbacks = this.subscribers.get(key);
    if (!callbacks || callbacks.length === 0) {
      return;
    }

    // Create a copy to avoid issues if callbacks modify the array
    const callbacksCopy = [...callbacks];

    // Execute callbacks asynchronously to avoid blocking
    setImmediate(() => {
      for (const callback of callbacksCopy) {
        try {
          callback(newValue, oldValue, key);
        } catch (error) {
          console.error(`StateManager: Subscriber error for key '${key}':`, error);
        }
      }
    });
  }

  /**
   * Get statistics about the state manager
   */
  getStats() {
    return {
      stateKeys: this.getKeys().length,
      subscriberCount: Array.from(this.subscribers.values()).reduce((sum, arr) => sum + arr.length, 0),
      validatorCount: this.validators.size,
      locked: this.locked,
      memoryUsage: JSON.stringify(this.state).length,
    };
  }
}
