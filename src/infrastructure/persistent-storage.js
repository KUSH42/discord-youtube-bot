import { promises as fs } from 'fs';
import path from 'path';

/**
 * Persistent storage for content states and system data
 * Provides file-based storage with JSON serialization
 */
export class PersistentStorage {
  constructor(storageDir = 'data', logger) {
    this.storageDir = storageDir;
    this.logger = logger;
    this.contentStatesFile = path.join(storageDir, 'content-states.json');
    this.metadataFile = path.join(storageDir, 'storage-metadata.json');

    // Ensure storage directory exists
    this.ensureStorageDir();
  }

  /**
   * Ensure storage directory exists
   */
  async ensureStorageDir() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create storage directory', {
        directory: this.storageDir,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Store content state
   * @param {string} contentId - Content identifier
   * @param {Object} state - Content state object
   */
  async storeContentState(contentId, state) {
    try {
      const existingStates = await this.getAllContentStates();
      existingStates[contentId] = state;

      await this.writeContentStates(existingStates);

      this.logger.debug('Content state stored', { contentId });
    } catch (error) {
      this.logger.error('Failed to store content state', {
        contentId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get content state by ID
   * @param {string} contentId - Content identifier
   * @returns {Object|null} Content state or null if not found
   */
  async getContentState(contentId) {
    try {
      const allStates = await this.getAllContentStates();
      return allStates[contentId] || null;
    } catch (error) {
      this.logger.error('Failed to get content state', {
        contentId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Get all content states
   * @returns {Object} Object mapping content IDs to states
   */
  async getAllContentStates() {
    try {
      const data = await fs.readFile(this.contentStatesFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return empty object
        return {};
      }
      throw error;
    }
  }

  /**
   * Write all content states to file
   * @param {Object} states - Object mapping content IDs to states
   */
  async writeContentStates(states) {
    const data = JSON.stringify(states, null, 2);
    await fs.writeFile(this.contentStatesFile, data, 'utf8');

    // Update metadata
    await this.updateMetadata({
      lastWrite: new Date().toISOString(),
      totalStates: Object.keys(states).length,
    });
  }

  /**
   * Remove specific content states
   * @param {Array<string>} contentIds - Array of content IDs to remove
   */
  async removeContentStates(contentIds) {
    if (!Array.isArray(contentIds) || contentIds.length === 0) {
      return;
    }

    try {
      const existingStates = await this.getAllContentStates();
      let removedCount = 0;

      for (const id of contentIds) {
        if (Object.prototype.hasOwnProperty.call(existingStates, id)) {
          delete existingStates[id];
          removedCount++;
        }
      }

      if (removedCount > 0) {
        await this.writeContentStates(existingStates);

        this.logger.debug('Content states removed', {
          removedCount,
          remainingCount: Object.keys(existingStates).length,
        });
      }
    } catch (error) {
      this.logger.error('Failed to remove content states', {
        contentIds: contentIds.slice(0, 5), // Log first 5 IDs
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Remove entries older than specified date
   * @param {string} collection - Collection name ('content_states')
   * @param {number} cutoffTimestamp - Remove entries older than this timestamp
   */
  async removeEntriesOlderThan(collection, cutoffTimestamp) {
    if (collection !== 'content_states') {
      throw new Error(`Unsupported collection: ${collection}`);
    }

    try {
      const allStates = await this.getAllContentStates();
      const toRemove = [];

      for (const [contentId, state] of Object.entries(allStates)) {
        const lastUpdated = new Date(state.lastUpdated).getTime();
        if (lastUpdated < cutoffTimestamp) {
          toRemove.push(contentId);
        }
      }

      if (toRemove.length > 0) {
        await this.removeContentStates(toRemove);

        this.logger.info('Old content states cleaned up', {
          removedCount: toRemove.length,
          cutoffDate: new Date(cutoffTimestamp).toISOString(),
        });
      }
    } catch (error) {
      this.logger.error('Failed to cleanup old entries', {
        collection,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Clear all content states
   */
  async clearAllContentStates() {
    try {
      await fs.unlink(this.contentStatesFile);
      this.logger.info('All content states cleared');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger.error('Failed to clear content states', {
          error: error.message,
        });
        throw error;
      }
    }
  }

  /**
   * Store content fingerprint for enhanced duplicate detection
   * @param {string} fingerprint - Content fingerprint
   * @param {Object} metadata - Associated metadata
   */
  async storeFingerprint(fingerprint, metadata) {
    try {
      const fingerprintsFile = path.join(this.storageDir, 'content-fingerprints.json');
      let fingerprints = {};

      try {
        const data = await fs.readFile(fingerprintsFile, 'utf8');
        fingerprints = JSON.parse(data);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      fingerprints[fingerprint] = {
        ...metadata,
        timestamp: new Date().toISOString(),
      };

      await fs.writeFile(fingerprintsFile, JSON.stringify(fingerprints, null, 2), 'utf8');

      this.logger.debug('Content fingerprint stored', { fingerprint });
    } catch (error) {
      this.logger.error('Failed to store fingerprint', {
        fingerprint,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Check if fingerprint exists
   * @param {string} fingerprint - Content fingerprint to check
   * @returns {boolean} True if fingerprint exists
   */
  async hasFingerprint(fingerprint) {
    try {
      const fingerprintsFile = path.join(this.storageDir, 'content-fingerprints.json');
      const data = await fs.readFile(fingerprintsFile, 'utf8');
      const fingerprints = JSON.parse(data);

      return Object.hasOwn(fingerprints, fingerprint);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }

      this.logger.error('Failed to check fingerprint', {
        fingerprint,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Update storage metadata
   * @param {Object} updates - Metadata updates
   */
  async updateMetadata(updates) {
    try {
      let metadata = {};

      try {
        const data = await fs.readFile(this.metadataFile, 'utf8');
        metadata = JSON.parse(data);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      metadata = {
        ...metadata,
        ...updates,
      };

      await fs.writeFile(this.metadataFile, JSON.stringify(metadata, null, 2), 'utf8');
    } catch (error) {
      this.logger.debug('Failed to update storage metadata', {
        error: error.message,
      });
      // Don't throw - metadata update failure shouldn't break core functionality
    }
  }

  /**
   * Get storage statistics
   * @returns {Object} Storage statistics
   */
  async getStats() {
    try {
      const contentStates = await this.getAllContentStates();
      const contentCount = Object.keys(contentStates).length;

      let fingerprintCount = 0;
      try {
        const fingerprintsFile = path.join(this.storageDir, 'content-fingerprints.json');
        const data = await fs.readFile(fingerprintsFile, 'utf8');
        const fingerprints = JSON.parse(data);
        fingerprintCount = Object.keys(fingerprints).length;
      } catch (_error) {
        // Fingerprints file might not exist
      }

      // Get file sizes
      let contentStatesSize = 0;
      let fingerprintsSize = 0;

      try {
        const contentStatesStats = await fs.stat(this.contentStatesFile);
        contentStatesSize = contentStatesStats.size;
      } catch (_error) {
        // File might not exist
      }

      try {
        const fingerprintsFile = path.join(this.storageDir, 'content-fingerprints.json');
        const fingerprintsStats = await fs.stat(fingerprintsFile);
        fingerprintsSize = fingerprintsStats.size;
      } catch (_error) {
        // File might not exist
      }

      return {
        contentStates: contentCount,
        fingerprints: fingerprintCount,
        storageDir: this.storageDir,
        fileSizes: {
          contentStates: contentStatesSize,
          fingerprints: fingerprintsSize,
          total: contentStatesSize + fingerprintsSize,
        },
      };
    } catch (error) {
      this.logger.error('Failed to get storage stats', {
        error: error.message,
      });

      return {
        contentStates: 0,
        fingerprints: 0,
        storageDir: this.storageDir,
        fileSizes: {
          contentStates: 0,
          fingerprints: 0,
          total: 0,
        },
        error: error.message,
      };
    }
  }

  /**
   * Cleanup old fingerprints
   * @param {number} olderThanDays - Remove fingerprints older than this many days
   */
  async cleanupFingerprints(olderThanDays = 30) {
    try {
      const fingerprintsFile = path.join(this.storageDir, 'content-fingerprints.json');
      const data = await fs.readFile(fingerprintsFile, 'utf8');
      const fingerprints = JSON.parse(data);

      const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
      const updatedFingerprints = { ...fingerprints };
      let removedCount = 0;

      for (const [fingerprint, metadata] of Object.entries(updatedFingerprints)) {
        const timestamp = new Date(metadata.timestamp).getTime();
        if (timestamp < cutoffTime) {
          delete updatedFingerprints[fingerprint];
          removedCount++;
        }
      }

      if (removedCount > 0) {
        await fs.writeFile(fingerprintsFile, JSON.stringify(updatedFingerprints, null, 2), 'utf8');

        this.logger.info('Old fingerprints cleaned up', {
          removedCount,
          remainingCount: Object.keys(updatedFingerprints).length,
          olderThanDays,
        });
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger.error('Failed to cleanup fingerprints', {
          error: error.message,
        });
      }
    }
  }

  /**
   * Destroy storage and cleanup
   */
  async destroy() {
    // Nothing to destroy for file-based storage
    this.logger.info('Persistent storage destroyed');
  }
}
