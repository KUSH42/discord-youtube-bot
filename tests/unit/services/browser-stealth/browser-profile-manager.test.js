import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { BrowserProfileManager } from '../../../../src/services/browser-stealth/browser-profile-manager.js';

// Mock filesystem operations
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    rmdir: jest.fn(),
  },
}));

describe('BrowserProfileManager', () => {
  let profileManager;
  let mockLogger;
  let mockPage;
  let mockContext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    mockContext = {
      cookies: jest.fn(),
      addCookies: jest.fn(),
    };

    mockPage = {
      context: jest.fn(() => mockContext),
      evaluate: jest.fn(),
    };

    profileManager = new BrowserProfileManager('./test-profiles', mockLogger);
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const manager = new BrowserProfileManager();
      expect(manager.profileDir).toBe('./browser-profiles');
      expect(manager.logger).toBe(console);
      expect(manager.currentProfile).toBeNull();
      expect(manager.profileMetadata).toBeInstanceOf(Map);
      expect(manager.sessionTimeout).toBe(24 * 60 * 60 * 1000);
    });

    it('should initialize with custom values', () => {
      expect(profileManager.profileDir).toBe('./test-profiles');
      expect(profileManager.logger).toBe(mockLogger);
      expect(profileManager.currentProfile).toBeNull();
      expect(profileManager.profileMetadata.size).toBe(0);
    });
  });

  describe('initialize', () => {
    it('should create profile directory and load existing profiles', async () => {
      fs.mkdir.mockResolvedValue();
      jest.spyOn(profileManager, 'loadExistingProfiles').mockResolvedValue();

      await profileManager.initialize();

      expect(fs.mkdir).toHaveBeenCalledWith('./test-profiles', { recursive: true });
      expect(profileManager.loadExistingProfiles).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('BrowserProfileManager initialized', {
        profileDir: './test-profiles',
        existingProfiles: 0,
      });
    });

    it('should handle initialization errors', async () => {
      const error = new Error('Failed to create directory');
      fs.mkdir.mockRejectedValue(error);

      await expect(profileManager.initialize()).rejects.toThrow('Failed to create directory');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to initialize BrowserProfileManager', {
        error: error.message,
      });
    });
  });

  describe('loadExistingProfiles', () => {
    it('should load profiles with existing metadata', async () => {
      const profileName = 'test-profile';
      const metadata = {
        id: profileName,
        created: '2023-01-01T00:00:00.000Z',
        lastUsed: '2023-01-02T00:00:00.000Z',
        sessionCount: 5,
        userAgent: 'test-agent',
        viewport: { width: 1920, height: 1080 },
      };

      fs.readdir.mockResolvedValue([profileName]);
      fs.stat.mockResolvedValue({ isDirectory: () => true });
      fs.readFile.mockResolvedValue(JSON.stringify(metadata));

      await profileManager.loadExistingProfiles();

      expect(profileManager.profileMetadata.has(profileName)).toBe(true);
      const loadedMetadata = profileManager.profileMetadata.get(profileName);
      expect(loadedMetadata.id).toBe(profileName);
      expect(loadedMetadata.created).toBeInstanceOf(Date);
      expect(loadedMetadata.lastUsed).toBeInstanceOf(Date);
    });

    it('should create metadata for profiles without metadata file', async () => {
      const profileName = 'test-profile';
      const stats = {
        isDirectory: () => true,
        birthtime: new Date('2023-01-01'),
        mtime: new Date('2023-01-02'),
      };

      fs.readdir.mockResolvedValue([profileName]);
      fs.stat.mockResolvedValue(stats);
      fs.readFile.mockRejectedValue(new Error('ENOENT'));
      fs.writeFile.mockResolvedValue();

      await profileManager.loadExistingProfiles();

      expect(profileManager.profileMetadata.has(profileName)).toBe(true);
      const metadata = profileManager.profileMetadata.get(profileName);
      expect(metadata.id).toBe(profileName);
      expect(metadata.sessionCount).toBe(0);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should handle readdir errors gracefully', async () => {
      fs.readdir.mockRejectedValue(new Error('Permission denied'));

      await profileManager.loadExistingProfiles();

      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to load existing profiles', {
        error: 'Permission denied',
      });
    });

    it('should skip non-directory entries', async () => {
      fs.readdir.mockResolvedValue(['file.txt', 'profile-dir']);
      fs.stat.mockResolvedValueOnce({ isDirectory: () => false }).mockResolvedValueOnce({ isDirectory: () => true });
      fs.readFile.mockRejectedValue(new Error('ENOENT'));
      fs.writeFile.mockResolvedValue();

      await profileManager.loadExistingProfiles();

      expect(profileManager.profileMetadata.size).toBe(1);
      expect(profileManager.profileMetadata.has('profile-dir')).toBe(true);
    });
  });

  describe('createProfile', () => {
    it('should create a new profile with default options', async () => {
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      jest.spyOn(profileManager, 'generateProfileId').mockReturnValue('test-profile-id');

      const profileId = await profileManager.createProfile();

      expect(profileId).toBe('test-profile-id');
      expect(fs.mkdir).toHaveBeenCalledWith(path.join('./test-profiles', 'test-profile-id'), { recursive: true });
      expect(profileManager.profileMetadata.has('test-profile-id')).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Created new browser profile', {
        profileId: 'test-profile-id',
        profilePath: path.join('./test-profiles', 'test-profile-id'),
      });
    });

    it('should create a profile with custom options', async () => {
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();

      const options = {
        id: 'custom-profile',
        userAgent: 'custom-agent',
        viewport: { width: 1366, height: 768 },
        preferences: { theme: 'dark' },
        tags: ['test', 'custom'],
      };

      const profileId = await profileManager.createProfile(options);

      expect(profileId).toBe('custom-profile');
      const metadata = profileManager.profileMetadata.get('custom-profile');
      expect(metadata.userAgent).toBe('custom-agent');
      expect(metadata.viewport).toEqual({ width: 1366, height: 768 });
      expect(metadata.preferences).toEqual({ theme: 'dark' });
      expect(metadata.tags).toEqual(['test', 'custom']);
    });

    it('should handle profile creation errors', async () => {
      const error = new Error('Permission denied');
      fs.mkdir.mockRejectedValue(error);

      await expect(profileManager.createProfile({ id: 'test-profile' })).rejects.toThrow('Permission denied');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to create browser profile', {
        profileId: 'test-profile',
        error: error.message,
      });
    });
  });

  describe('getOrCreateProfile', () => {
    it('should return existing profile for purpose', async () => {
      const existingProfile = {
        id: 'existing-profile',
        created: new Date(),
        lastUsed: new Date(),
        sessionCount: 1,
        tags: ['x-monitoring'],
      };
      profileManager.profileMetadata.set('existing-profile', existingProfile);
      jest.spyOn(profileManager, 'updateProfileUsage').mockResolvedValue();

      const profileId = await profileManager.getOrCreateProfile('x-monitoring');

      expect(profileId).toBe('existing-profile');
      expect(profileManager.currentProfile).toBe('existing-profile');
      expect(profileManager.updateProfileUsage).toHaveBeenCalledWith('existing-profile');
    });

    it('should create new profile if none exists for purpose', async () => {
      jest.spyOn(profileManager, 'createProfile').mockResolvedValue('new-profile');

      const profileId = await profileManager.getOrCreateProfile('general', {
        userAgent: 'test-agent',
      });

      expect(profileId).toBe('new-profile');
      expect(profileManager.currentProfile).toBe('new-profile');
      expect(profileManager.createProfile).toHaveBeenCalledWith({
        userAgent: 'test-agent',
        tags: ['general'],
      });
    });

    it('should create new profile if existing profile is expired', async () => {
      const expiredProfile = {
        id: 'expired-profile',
        created: new Date(),
        lastUsed: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
        sessionCount: 1,
        tags: ['x-monitoring'],
      };
      profileManager.profileMetadata.set('expired-profile', expiredProfile);
      jest.spyOn(profileManager, 'createProfile').mockResolvedValue('new-profile');

      const profileId = await profileManager.getOrCreateProfile('x-monitoring');

      expect(profileId).toBe('new-profile');
      expect(profileManager.createProfile).toHaveBeenCalledWith({
        tags: ['x-monitoring'],
      });
    });
  });

  describe('getProfilePath', () => {
    it('should return correct profile path', () => {
      const profilePath = profileManager.getProfilePath('test-profile');
      expect(profilePath).toBe(path.join('./test-profiles', 'test-profile'));
    });
  });

  describe('getBrowserOptions', () => {
    it('should return browser options with profile path', () => {
      const options = profileManager.getBrowserOptions('test-profile');

      expect(options.userDataDir).toBe(path.join('./test-profiles', 'test-profile'));
      expect(options.headless).toBe(true);
      expect(options.args).toEqual([
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-blink-features=AutomationControlled',
        '--disable-ipc-flooding-protection',
      ]);
    });

    it('should include viewport from metadata', () => {
      const metadata = {
        viewport: { width: 1920, height: 1080 },
      };
      profileManager.profileMetadata.set('test-profile', metadata);

      const options = profileManager.getBrowserOptions('test-profile');

      expect(options.viewport).toEqual({ width: 1920, height: 1080 });
    });
  });

  describe('saveCookies', () => {
    it('should save cookies to profile', async () => {
      const cookies = [
        { name: 'session', value: 'abc123', domain: 'example.com' },
        { name: 'theme', value: 'dark', domain: 'example.com' },
      ];
      fs.writeFile.mockResolvedValue();

      await profileManager.saveCookies('test-profile', cookies);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join('./test-profiles', 'test-profile', 'cookies.json'),
        expect.stringContaining('"cookies"'),
        expect.any(Object)
      );
      expect(mockLogger.debug).toHaveBeenCalledWith('Saved cookies to profile', {
        profileId: 'test-profile',
        cookieCount: 2,
      });
    });

    it('should handle cookie save errors', async () => {
      const error = new Error('Write failed');
      fs.writeFile.mockRejectedValue(error);

      await profileManager.saveCookies('test-profile', []);

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to save cookies', {
        profileId: 'test-profile',
        error: error.message,
      });
    });
  });

  describe('loadCookies', () => {
    it('should load cookies from profile', async () => {
      const cookieData = {
        saved: '2023-01-01T00:00:00.000Z',
        cookies: [{ name: 'session', value: 'abc123', domain: 'example.com' }],
      };
      fs.readFile.mockResolvedValue(JSON.stringify(cookieData));

      const cookies = await profileManager.loadCookies('test-profile');

      expect(cookies).toEqual(cookieData.cookies);
      expect(mockLogger.debug).toHaveBeenCalledWith('Loaded cookies from profile', {
        profileId: 'test-profile',
        cookieCount: 1,
        savedAt: '2023-01-01T00:00:00.000Z',
      });
    });

    it('should return empty array if no cookies file exists', async () => {
      fs.readFile.mockRejectedValue(new Error('ENOENT'));

      const cookies = await profileManager.loadCookies('test-profile');

      expect(cookies).toEqual([]);
      expect(mockLogger.debug).toHaveBeenCalledWith('No cookies found for profile', {
        profileId: 'test-profile',
      });
    });
  });

  describe('saveLocalStorage', () => {
    it('should save localStorage data to profile', async () => {
      const localStorageData = {
        theme: 'dark',
        language: 'en',
      };
      fs.writeFile.mockResolvedValue();

      await profileManager.saveLocalStorage('test-profile', localStorageData);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join('./test-profiles', 'test-profile', 'localStorage.json'),
        expect.stringContaining('"data"'),
        expect.any(Object)
      );
      expect(mockLogger.debug).toHaveBeenCalledWith('Saved localStorage to profile', {
        profileId: 'test-profile',
        keyCount: 2,
      });
    });

    it('should handle localStorage save errors', async () => {
      const error = new Error('Write failed');
      fs.writeFile.mockRejectedValue(error);

      await profileManager.saveLocalStorage('test-profile', {});

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to save localStorage', {
        profileId: 'test-profile',
        error: error.message,
      });
    });
  });

  describe('loadLocalStorage', () => {
    it('should load localStorage data from profile', async () => {
      const storageData = {
        saved: '2023-01-01T00:00:00.000Z',
        data: {
          theme: 'dark',
          language: 'en',
        },
      };
      fs.readFile.mockResolvedValue(JSON.stringify(storageData));

      const data = await profileManager.loadLocalStorage('test-profile');

      expect(data).toEqual(storageData.data);
      expect(mockLogger.debug).toHaveBeenCalledWith('Loaded localStorage from profile', {
        profileId: 'test-profile',
        keyCount: 2,
        savedAt: '2023-01-01T00:00:00.000Z',
      });
    });

    it('should return empty object if no localStorage file exists', async () => {
      fs.readFile.mockRejectedValue(new Error('ENOENT'));

      const data = await profileManager.loadLocalStorage('test-profile');

      expect(data).toEqual({});
      expect(mockLogger.debug).toHaveBeenCalledWith('No localStorage found for profile', {
        profileId: 'test-profile',
      });
    });
  });

  describe('saveSession', () => {
    it('should save both cookies and localStorage', async () => {
      const cookies = [{ name: 'session', value: 'abc123' }];
      const localStorageData = { theme: 'dark' };

      mockContext.cookies.mockResolvedValue(cookies);
      mockPage.evaluate.mockResolvedValue(localStorageData);
      jest.spyOn(profileManager, 'saveCookies').mockResolvedValue();
      jest.spyOn(profileManager, 'saveLocalStorage').mockResolvedValue();
      jest.spyOn(profileManager, 'updateProfileUsage').mockResolvedValue();

      await profileManager.saveSession('test-profile', mockPage);

      expect(profileManager.saveCookies).toHaveBeenCalledWith('test-profile', cookies);
      expect(profileManager.saveLocalStorage).toHaveBeenCalledWith('test-profile', localStorageData);
      expect(profileManager.updateProfileUsage).toHaveBeenCalledWith('test-profile');
      expect(mockLogger.info).toHaveBeenCalledWith('Session saved to profile', {
        profileId: 'test-profile',
        cookieCount: 1,
        localStorageKeys: 1,
      });
    });

    it('should handle session save errors', async () => {
      const error = new Error('Page evaluation failed');
      mockContext.cookies.mockRejectedValue(error);

      await profileManager.saveSession('test-profile', mockPage);

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to save session', {
        profileId: 'test-profile',
        error: error.message,
      });
    });
  });

  describe('restoreSession', () => {
    it('should restore both cookies and localStorage', async () => {
      const cookies = [{ name: 'session', value: 'abc123' }];
      const localStorageData = { theme: 'dark' };

      jest.spyOn(profileManager, 'loadCookies').mockResolvedValue(cookies);
      jest.spyOn(profileManager, 'loadLocalStorage').mockResolvedValue(localStorageData);
      mockPage.evaluate.mockResolvedValue();

      await profileManager.restoreSession('test-profile', mockPage);

      expect(mockContext.addCookies).toHaveBeenCalledWith(cookies);
      expect(mockPage.evaluate).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Session restored from profile', {
        profileId: 'test-profile',
        cookieCount: 1,
        localStorageKeys: 1,
      });
    });

    it('should handle empty cookies and localStorage', async () => {
      jest.spyOn(profileManager, 'loadCookies').mockResolvedValue([]);
      jest.spyOn(profileManager, 'loadLocalStorage').mockResolvedValue({});

      await profileManager.restoreSession('test-profile', mockPage);

      expect(mockContext.addCookies).not.toHaveBeenCalled();
      expect(mockPage.evaluate).not.toHaveBeenCalled();
    });

    it('should handle session restore errors', async () => {
      const error = new Error('Cookie restoration failed');
      jest.spyOn(profileManager, 'loadCookies').mockRejectedValue(error);

      await profileManager.restoreSession('test-profile', mockPage);

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to restore session', {
        profileId: 'test-profile',
        error: error.message,
      });
    });
  });

  describe('updateProfileUsage', () => {
    it('should update profile metadata and save to disk', async () => {
      const metadata = {
        id: 'test-profile',
        created: new Date(),
        lastUsed: new Date('2023-01-01'),
        sessionCount: 5,
      };
      profileManager.profileMetadata.set('test-profile', metadata);
      jest.spyOn(profileManager, 'saveProfileMetadata').mockResolvedValue();

      await profileManager.updateProfileUsage('test-profile');

      const updatedMetadata = profileManager.profileMetadata.get('test-profile');
      expect(updatedMetadata.lastUsed).toBeInstanceOf(Date);
      expect(updatedMetadata.lastUsed.getTime()).toBeGreaterThan(new Date('2023-01-01').getTime());
      expect(updatedMetadata.sessionCount).toBe(6);
      expect(profileManager.saveProfileMetadata).toHaveBeenCalledWith('test-profile', updatedMetadata);
    });

    it('should handle missing profile metadata', async () => {
      await profileManager.updateProfileUsage('nonexistent-profile');

      // Should not throw error or call saveProfileMetadata
      expect(profileManager.saveProfileMetadata).not.toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredProfiles', () => {
    it('should delete expired profiles', async () => {
      const now = Date.now();
      const expiredProfile = {
        id: 'expired-profile',
        lastUsed: new Date(now - 31 * 24 * 60 * 60 * 1000), // 31 days ago
      };
      const freshProfile = {
        id: 'fresh-profile',
        lastUsed: new Date(now - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      };

      profileManager.profileMetadata.set('expired-profile', expiredProfile);
      profileManager.profileMetadata.set('fresh-profile', freshProfile);
      jest.spyOn(profileManager, 'deleteProfile').mockResolvedValue();

      const cleanedCount = await profileManager.cleanupExpiredProfiles();

      expect(cleanedCount).toBe(1);
      expect(profileManager.deleteProfile).toHaveBeenCalledWith('expired-profile');
      expect(mockLogger.info).toHaveBeenCalledWith('Cleaned up expired profile', {
        profileId: 'expired-profile',
      });
    });

    it('should handle cleanup errors gracefully', async () => {
      const expiredProfile = {
        id: 'expired-profile',
        lastUsed: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      };
      profileManager.profileMetadata.set('expired-profile', expiredProfile);

      const error = new Error('Delete failed');
      jest.spyOn(profileManager, 'deleteProfile').mockRejectedValue(error);

      const cleanedCount = await profileManager.cleanupExpiredProfiles();

      expect(cleanedCount).toBe(0);
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to cleanup expired profile', {
        profileId: 'expired-profile',
        error: error.message,
      });
    });
  });

  describe('deleteProfile', () => {
    it('should delete profile directory and metadata', async () => {
      profileManager.profileMetadata.set('test-profile', { id: 'test-profile' });
      profileManager.currentProfile = 'test-profile';
      fs.rmdir.mockResolvedValue();

      await profileManager.deleteProfile('test-profile');

      expect(fs.rmdir).toHaveBeenCalledWith(path.join('./test-profiles', 'test-profile'), { recursive: true });
      expect(profileManager.profileMetadata.has('test-profile')).toBe(false);
      expect(profileManager.currentProfile).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith('Deleted profile', {
        profileId: 'test-profile',
      });
    });

    it('should handle delete errors', async () => {
      const error = new Error('Permission denied');
      fs.rmdir.mockRejectedValue(error);

      await expect(profileManager.deleteProfile('test-profile')).rejects.toThrow('Permission denied');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to delete profile', {
        profileId: 'test-profile',
        error: error.message,
      });
    });
  });

  describe('getProfileStats', () => {
    it('should return profile statistics', () => {
      const now = Date.now();
      const freshProfile = {
        lastUsed: new Date(now - 12 * 60 * 60 * 1000), // 12 hours
        sessionCount: 10,
      };
      const recentProfile = {
        lastUsed: new Date(now - 3 * 24 * 60 * 60 * 1000), // 3 days
        sessionCount: 5,
      };
      const oldProfile = {
        lastUsed: new Date(now - 15 * 24 * 60 * 60 * 1000), // 15 days
        sessionCount: 2,
      };

      profileManager.profileMetadata.set('fresh', freshProfile);
      profileManager.profileMetadata.set('recent', recentProfile);
      profileManager.profileMetadata.set('old', oldProfile);
      profileManager.currentProfile = 'fresh';

      const stats = profileManager.getProfileStats();

      expect(stats.totalProfiles).toBe(3);
      expect(stats.currentProfile).toBe('fresh');
      expect(stats.profilesByAge.fresh).toBe(1);
      expect(stats.profilesByAge.recent).toBe(1);
      expect(stats.profilesByAge.old).toBe(1);
      expect(stats.averageSessionCount).toBe(6); // (10 + 5 + 2) / 3 = 5.67 rounded to 6
    });

    it('should handle empty profile metadata', () => {
      const stats = profileManager.getProfileStats();

      expect(stats.totalProfiles).toBe(0);
      expect(stats.currentProfile).toBeNull();
      expect(stats.profilesByAge.fresh).toBe(0);
      expect(stats.profilesByAge.recent).toBe(0);
      expect(stats.profilesByAge.old).toBe(0);
      expect(stats.averageSessionCount).toBe(0);
    });
  });

  describe('generateProfileId', () => {
    it('should generate unique profile IDs', () => {
      const id1 = profileManager.generateProfileId();
      const id2 = profileManager.generateProfileId();

      expect(id1).toMatch(/^profile_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^profile_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('saveProfileMetadata', () => {
    it('should save metadata to JSON file', async () => {
      fs.writeFile.mockResolvedValue();
      const metadata = {
        id: 'test-profile',
        created: new Date(),
        lastUsed: new Date(),
        sessionCount: 1,
      };

      await profileManager.saveProfileMetadata('test-profile', metadata);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join('./test-profiles', 'test-profile', 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );
    });

    it('should handle save errors', async () => {
      const error = new Error('Write failed');
      fs.writeFile.mockRejectedValue(error);
      const metadata = { id: 'test-profile' };

      await profileManager.saveProfileMetadata('test-profile', metadata);

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to save profile metadata', {
        profileId: 'test-profile',
        error: error.message,
      });
    });
  });
});
