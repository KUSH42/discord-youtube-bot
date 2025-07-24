/**
 * Message Queue for Discord Rate-Limited Sender
 * Handles priority-based message queuing with deterministic ordering
 */
export class MessageQueue {
  constructor(options = {}) {
    this.messages = [];
    this.priorityComparator = options.priorityComparator || this.defaultPrioritySort.bind(this);
    this.maxSize = options.maxSize || Infinity;
  }

  /**
   * Add a message to the queue with priority sorting
   * @param {Object} message - Message object
   * @throws {Error} If queue is full
   */
  enqueue(message) {
    if (this.messages.length >= this.maxSize) {
      throw new Error(`Queue is full (max size: ${this.maxSize})`);
    }

    this.messages.push(message);
    this.messages.sort(this.priorityComparator);
  }

  /**
   * Remove and return the next message from the queue
   * @returns {Object|null} Next message or null if empty
   */
  dequeue() {
    return this.messages.shift() || null;
  }

  /**
   * Look at the next message without removing it
   * @returns {Object|null} Next message or null if empty
   */
  peek() {
    return this.messages[0] || null;
  }

  /**
   * Get the current size of the queue
   * @returns {number} Number of messages in queue
   */
  size() {
    return this.messages.length;
  }

  /**
   * Check if the queue is empty
   * @returns {boolean} True if queue is empty
   */
  isEmpty() {
    return this.messages.length === 0;
  }

  /**
   * Clear all messages from the queue
   * @returns {Array<Object>} Array of cleared messages
   */
  clear() {
    const cleared = [...this.messages];
    this.messages = [];
    return cleared;
  }

  /**
   * Get all messages without removing them
   * @returns {Array<Object>} Copy of all messages
   */
  toArray() {
    return [...this.messages];
  }

  /**
   * Find messages matching a predicate
   * @param {Function} predicate - Function to test each message
   * @returns {Array<Object>} Array of matching messages
   */
  find(predicate) {
    return this.messages.filter(predicate);
  }

  /**
   * Remove messages matching a predicate
   * @param {Function} predicate - Function to test each message
   * @returns {Array<Object>} Array of removed messages
   */
  remove(predicate) {
    const toRemove = this.messages.filter(predicate);
    this.messages = this.messages.filter(msg => !predicate(msg));
    return toRemove;
  }

  /**
   * Default priority sorting function
   * Higher priority numbers are processed first
   * @param {Object} a - First message
   * @param {Object} b - Second message
   * @returns {number} Comparison result
   */
  defaultPrioritySort(a, b) {
    // Primary sort: priority (higher first)
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }

    // Secondary sort: creation time (older first)
    return a.createdAt - b.createdAt;
  }

  /**
   * Get queue statistics
   * @returns {Object} Queue statistics
   */
  getStats() {
    if (this.messages.length === 0) {
      return {
        size: 0,
        highestPriority: null,
        lowestPriority: null,
        oldestMessage: null,
        newestMessage: null,
      };
    }

    const priorities = this.messages.map(msg => msg.priority || 0);
    const timestamps = this.messages.map(msg => msg.createdAt);

    return {
      size: this.messages.length,
      highestPriority: Math.max(...priorities),
      lowestPriority: Math.min(...priorities),
      oldestMessage: Math.min(...timestamps),
      newestMessage: Math.max(...timestamps),
    };
  }
}
