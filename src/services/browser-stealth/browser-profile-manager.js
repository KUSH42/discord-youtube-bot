import { promises as fs } from 'fs';
import path from 'path';
import { getProfileBrowserConfig } from '../../utilities/browser-config.js';

/**
 * BrowserProfileManager - Advanced browser profile and session management
 * Provides persistent browser profiles with cookie and localStorage management
 * for maintaining authentic browsing sessions across bot restarts
 */
export class BrowserProfileManager {
  constructor(profileDir = './browser-profiles', logger = console) {
    this.profileDir = profileDir;
    this.logger = logger;
    this.currentProfile = null;
    this.profileMetadata = new Map();
    this.sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Initialize the profile manager
   * Creates profile directory and loads existing profiles
   */
  async initialize() {
    try {
      await fs.mkdir(this.profileDir, { recursive: true });
      await this.loadExistingProfiles();
      this.logger.info('BrowserProfileManager initialized', {
        profileDir: this.profileDir,
        existingProfiles: this.profileMetadata.size,
      });
    } catch (error) {
      this.logger.error('Failed to initialize BrowserProfileManager', { error: error.message });
      throw error;
    }
  }

  /**
   * Load metadata for existing profiles
   */
  async loadExistingProfiles() {
    try {
      const profiles = await fs.readdir(this.profileDir);
      for (const profile of profiles) {
        const profilePath = path.join(this.profileDir, profile);
        const stats = await fs.stat(profilePath);

        if (stats.isDirectory()) {
          const metadataPath = path.join(profilePath, 'metadata.json');
          try {
            const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
            this.profileMetadata.set(profile, {
              ...metadata,
              lastUsed: new Date(metadata.lastUsed),
              created: new Date(metadata.created),
            });
          } catch (_error) {
            // Create metadata for profiles without it
            const metadata = {
              id: profile,
              created: stats.birthtime,
              lastUsed: stats.mtime,
              sessionCount: 0,
              userAgent: null,
              viewport: null,
            };
            this.profileMetadata.set(profile, metadata);
            await this.saveProfileMetadata(profile, metadata);
          }
        }
      }
    } catch (error) {
      this.logger.warn('Failed to load existing profiles', { error: error.message });
    }
  }

  /**
   * Create a new browser profile
   * @param {Object} options - Profile creation options
   * @returns {Promise<string>} Profile ID
   */
  async createProfile(options = {}) {
    const profileId = options.id || this.generateProfileId();
    const profilePath = path.join(this.profileDir, profileId);

    const metadata = {
      id: profileId,
      created: new Date(),
      lastUsed: new Date(),
      sessionCount: 0,
      userAgent: options.userAgent || null,
      viewport: options.viewport || null,
      preferences: options.preferences || {},
      tags: options.tags || [],
    };

    try {
      await fs.mkdir(profilePath, { recursive: true });
      await this.saveProfileMetadata(profileId, metadata);
      this.profileMetadata.set(profileId, metadata);

      this.logger.info('Created new browser profile', { profileId, profilePath });
      return profileId;
    } catch (error) {
      this.logger.error('Failed to create browser profile', {
        profileId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get or create a profile for a specific purpose
   * @param {string} purpose - Profile purpose (e.g., 'x-monitoring', 'general')
   * @param {Object} options - Profile options
   * @returns {Promise<string>} Profile ID
   */
  async getOrCreateProfile(purpose, options = {}) {
    // Look for existing profile with matching purpose
    for (const [profileId, metadata] of this.profileMetadata) {
      if (metadata.tags && metadata.tags.includes(purpose)) {
        const isExpired = Date.now() - metadata.lastUsed.getTime() > this.sessionTimeout;
        if (!isExpired) {
          await this.updateProfileUsage(profileId);
          this.currentProfile = profileId;
          return profileId;
        }
      }
    }

    // Create new profile for this purpose
    const profileId = await this.createProfile({
      ...options,
      tags: [...(options.tags || []), purpose],
    });

    this.currentProfile = profileId;
    return profileId;
  }

  /**
   * Get profile directory path
   * @param {string} profileId - Profile ID
   * @returns {string} Profile directory path
   */
  getProfilePath(profileId) {
    return path.join(this.profileDir, profileId);
  }

  /**
   * Get browser launch options for a profile
   * @param {string} profileId - Profile ID
   * @returns {Object} Browser launch options
   */
  getBrowserOptions(profileId) {
    const profilePath = this.getProfilePath(profileId);
    const metadata = this.profileMetadata.get(profileId);

    // Use base browser config and add profile-specific args
    // Note: Some args here are "dangerous" for bot detection but necessary for profile management
    const options = getProfileBrowserConfig({
      headless: true,
      userDataDir: profilePath,
      additionalArgs: [
        '--disable-web-security', // Necessary for profile initialization
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-blink-features=AutomationControlled',
        '--disable-ipc-flooding-protection', // Necessary for profile stability
      ],
    });

    // Apply saved viewport if available
    if (metadata && metadata.viewport) {
      options.viewport = metadata.viewport;
    }

    return options;
  }

  /**
   * Save cookies to profile
   * @param {string} profileId - Profile ID
   * @param {Array} cookies - Browser cookies
   */
  async saveCookies(profileId, cookies) {
    const cookiesPath = path.join(this.getProfilePath(profileId), 'cookies.json');

    try {
      const cookieData = {
        saved: new Date().toISOString(),
        cookies,
      };

      await fs.writeFile(cookiesPath, JSON.stringify(cookieData, null, 2));
      this.logger.debug('Saved cookies to profile', {
        profileId,
        cookieCount: cookies.length,
      });
    } catch (error) {
      this.logger.error('Failed to save cookies', {
        profileId,
        error: error.message,
      });
    }
  }

  /**
   * Load cookies from profile
   * @param {string} profileId - Profile ID
   * @returns {Promise<Array>} Browser cookies
   */
  async loadCookies(profileId) {
    const cookiesPath = path.join(this.getProfilePath(profileId), 'cookies.json');

    try {
      const cookieData = JSON.parse(await fs.readFile(cookiesPath, 'utf8'));
      this.logger.debug('Loaded cookies from profile', {
        profileId,
        cookieCount: cookieData.cookies.length,
        savedAt: cookieData.saved,
      });
      return cookieData.cookies;
    } catch (_error) {
      this.logger.debug('No cookies found for profile', { profileId });
      return [];
    }
  }

  /**
   * Save localStorage data to profile
   * @param {string} profileId - Profile ID
   * @param {Object} localStorageData - localStorage key-value pairs
   */
  async saveLocalStorage(profileId, localStorageData) {
    const storagePath = path.join(this.getProfilePath(profileId), 'localStorage.json');

    try {
      const storageData = {
        saved: new Date().toISOString(),
        data: localStorageData,
      };

      await fs.writeFile(storagePath, JSON.stringify(storageData, null, 2));
      this.logger.debug('Saved localStorage to profile', {
        profileId,
        keyCount: Object.keys(localStorageData).length,
      });
    } catch (error) {
      this.logger.error('Failed to save localStorage', {
        profileId,
        error: error.message,
      });
    }
  }

  /**
   * Load localStorage data from profile
   * @param {string} profileId - Profile ID
   * @returns {Promise<Object>} localStorage data
   */
  async loadLocalStorage(profileId) {
    const storagePath = path.join(this.getProfilePath(profileId), 'localStorage.json');

    try {
      const storageData = JSON.parse(await fs.readFile(storagePath, 'utf8'));
      this.logger.debug('Loaded localStorage from profile', {
        profileId,
        keyCount: Object.keys(storageData.data).length,
        savedAt: storageData.saved,
      });
      return storageData.data;
    } catch (_error) {
      this.logger.debug('No localStorage found for profile', { profileId });
      return {};
    }
  }

  /**
   * Save session data including cookies and localStorage
   * @param {string} profileId - Profile ID
   * @param {Object} page - Playwright page instance
   */
  async saveSession(profileId, page) {
    try {
      // Save cookies
      const cookies = await page.context().cookies();
      await this.saveCookies(profileId, cookies);

      // Save localStorage
      const localStorageData = await page.evaluate(() => {
        const storage = {};
        // eslint-disable-next-line no-undef
        for (let i = 0; i < localStorage.length; i++) {
          // eslint-disable-next-line no-undef
          const key = localStorage.key(i);
          // eslint-disable-next-line no-undef
          storage[key] = localStorage.getItem(key);
        }
        return storage;
      });
      await this.saveLocalStorage(profileId, localStorageData);

      // Update profile metadata
      await this.updateProfileUsage(profileId);

      this.logger.info('Session saved to profile', {
        profileId,
        cookieCount: cookies.length,
        localStorageKeys: Object.keys(localStorageData).length,
      });
    } catch (error) {
      this.logger.error('Failed to save session', {
        profileId,
        error: error.message,
      });
    }
  }

  /**
   * Restore session data to page
   * @param {string} profileId - Profile ID
   * @param {Object} page - Playwright page instance
   */
  async restoreSession(profileId, page) {
    try {
      // Restore cookies
      const cookies = await this.loadCookies(profileId);
      if (cookies.length > 0) {
        await page.context().addCookies(cookies);
      }

      // Restore localStorage
      const localStorageData = await this.loadLocalStorage(profileId);
      if (Object.keys(localStorageData).length > 0) {
        await page.evaluate(data => {
          for (const [key, value] of Object.entries(data)) {
            // eslint-disable-next-line no-undef
            localStorage.setItem(key, value);
          }
        }, localStorageData);
      }

      this.logger.info('Session restored from profile', {
        profileId,
        cookieCount: cookies.length,
        localStorageKeys: Object.keys(localStorageData).length,
      });
    } catch (error) {
      this.logger.error('Failed to restore session', {
        profileId,
        error: error.message,
      });
    }
  }

  /**
   * Update profile usage metadata
   * @param {string} profileId - Profile ID
   */
  async updateProfileUsage(profileId) {
    const metadata = this.profileMetadata.get(profileId);
    if (metadata) {
      metadata.lastUsed = new Date();
      metadata.sessionCount = (metadata.sessionCount || 0) + 1;
      this.profileMetadata.set(profileId, metadata);
      await this.saveProfileMetadata(profileId, metadata);
    }
  }

  /**
   * Clean up expired profiles
   * @param {number} maxAge - Maximum age in milliseconds (default: 30 days)
   */
  async cleanupExpiredProfiles(maxAge = 30 * 24 * 60 * 60 * 1000) {
    const now = Date.now();
    const expiredProfiles = [];

    for (const [profileId, metadata] of this.profileMetadata) {
      const age = now - metadata.lastUsed.getTime();
      if (age > maxAge) {
        expiredProfiles.push(profileId);
      }
    }

    for (const profileId of expiredProfiles) {
      try {
        await this.deleteProfile(profileId);
        this.logger.info('Cleaned up expired profile', { profileId });
      } catch (error) {
        this.logger.error('Failed to cleanup expired profile', {
          profileId,
          error: error.message,
        });
      }
    }

    return expiredProfiles.length;
  }

  /**
   * Delete a profile
   * @param {string} profileId - Profile ID to delete
   */
  async deleteProfile(profileId) {
    const profilePath = this.getProfilePath(profileId);

    try {
      await fs.rmdir(profilePath, { recursive: true });
      this.profileMetadata.delete(profileId);

      if (this.currentProfile === profileId) {
        this.currentProfile = null;
      }

      this.logger.info('Deleted profile', { profileId });
    } catch (error) {
      this.logger.error('Failed to delete profile', {
        profileId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get profile statistics
   * @returns {Object} Profile statistics
   */
  getProfileStats() {
    const stats = {
      totalProfiles: this.profileMetadata.size,
      currentProfile: this.currentProfile,
      profilesByAge: { fresh: 0, recent: 0, old: 0 },
      averageSessionCount: 0,
    };

    const now = Date.now();
    let totalSessions = 0;

    for (const metadata of this.profileMetadata.values()) {
      const age = now - metadata.lastUsed.getTime();
      const dayMs = 24 * 60 * 60 * 1000;

      if (age < dayMs) {
        stats.profilesByAge.fresh++;
      } else if (age < 7 * dayMs) {
        stats.profilesByAge.recent++;
      } else {
        stats.profilesByAge.old++;
      }

      totalSessions += metadata.sessionCount || 0;
    }

    stats.averageSessionCount = stats.totalProfiles > 0 ? Math.round(totalSessions / stats.totalProfiles) : 0;

    return stats;
  }

  /**
   * Generate a unique profile ID
   * @returns {string} Profile ID
   */
  generateProfileId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    return `profile_${timestamp}_${random}`;
  }

  /**
   * Save profile metadata to disk
   * @param {string} profileId - Profile ID
   * @param {Object} metadata - Profile metadata
   */
  async saveProfileMetadata(profileId, metadata) {
    const metadataPath = path.join(this.getProfilePath(profileId), 'metadata.json');

    try {
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    } catch (error) {
      this.logger.error('Failed to save profile metadata', {
        profileId,
        error: error.message,
      });
    }
  }
}
