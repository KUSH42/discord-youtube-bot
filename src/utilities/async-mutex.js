/**
 * Simple async mutex implementation for preventing concurrent operations
 */
export class AsyncMutex {
  constructor() {
    this.isLocked = false;
    this.waitingQueue = [];
  }

  /**
   * Acquire the mutex lock
   * @returns {Promise<Function>} Release function
   */
  async acquire() {
    if (!this.isLocked) {
      this.isLocked = true;
      return this.createReleaseFunction();
    }

    return new Promise(resolve => {
      this.waitingQueue.push(() => {
        this.isLocked = true;
        resolve(this.createReleaseFunction());
      });
    });
  }

  /**
   * Run a function exclusively with mutex protection
   * @param {Function} fn - Function to run exclusively
   * @returns {Promise<*>} Result of the function
   */
  async runExclusive(fn) {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Create a release function for the current lock
   * @returns {Function} Release function
   */
  createReleaseFunction() {
    return () => {
      if (this.waitingQueue.length > 0) {
        const next = this.waitingQueue.shift();
        next();
      } else {
        this.isLocked = false;
      }
    };
  }

  /**
   * Check if the mutex is currently locked
   * @returns {boolean} True if locked
   */
  get locked() {
    return this.isLocked;
  }

  /**
   * Get the number of operations waiting for the mutex
   * @returns {number} Queue length
   */
  get queueLength() {
    return this.waitingQueue.length;
  }
}
