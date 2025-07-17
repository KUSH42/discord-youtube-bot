import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MonitorApplication } from '../../src/application/monitor-application.js';

describe('MonitorApplication', () => {
  let monitorApp;
  let mockYoutubeService;
  let mockHttpService;
  let mockContentClassifier;
  let mockContentAnnouncer;
  let mockConfig;
  let mockStateManager;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    mockYoutubeService = {
      getChannelDetails: jest.fn(),
      getVideoDetails: jest.fn(),
    };
    mockHttpService = {
      post: jest.fn(),
      isSuccessResponse: jest.fn().mockReturnValue(true),
    };
    mockContentClassifier = {
      classifyYouTubeContent: jest.fn(),
    };
    mockContentAnnouncer = {
      announceContent: jest.fn(),
    };
    mockConfig = {
      getRequired: jest.fn(),
      get: jest.fn(),
    };
    mockStateManager = {
      get: jest.fn(),
    };
    mockEventBus = {
      emit: jest.fn(),
    };
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    const dependencies = {
      youtubeService: mockYoutubeService,
      httpService: mockHttpService,
      contentClassifier: mockContentClassifier,
      contentAnnouncer: mockContentAnnouncer,
      config: mockConfig,
      stateManager: mockStateManager,
      eventBus: mockEventBus,
      logger: mockLogger,
    };

    monitorApp = new MonitorApplication(dependencies);
  });

  describe('handleNotification', () => {
    it('should increment xmlParseFailures when XML is malformed', async () => {
      jest.spyOn(monitorApp, 'verifyWebhookSignature').mockReturnValue(true);
      jest.spyOn(monitorApp, 'parseNotificationXML').mockReturnValue(null);
      const request = {
        body: '<xml>malformed</xml>',
        headers: { 'x-hub-signature': 'sha1=test' },
        method: 'POST'
      };

      await monitorApp.handleWebhook(request);

      expect(monitorApp.stats.xmlParseFailures).toBe(1);
    });
  });
});
