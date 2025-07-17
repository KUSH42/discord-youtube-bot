// /home/xush/Documents/prog/discord-youtube-bot/tests/unit/playwright-browser-service.test.js
import { PlaywrightBrowserService } from '../../src/services/implementations/playwright-browser-service.js';
import { jest } from '@jest/globals';

describe('PlaywrightBrowserService', () => {
  let browserService;
  let mockPage;

  beforeEach(() => {
    browserService = new PlaywrightBrowserService();
    mockPage = {
      goto: jest.fn(),
      waitForTimeout: jest.fn().mockResolvedValue(),
    };
    browserService.page = mockPage;
  });

  describe('goto with retries', () => {
    it('should retry navigation on failure and succeed on the third attempt', async () => {
      mockPage.goto
        .mockRejectedValueOnce(new Error('net::ERR_ABORTED'))
        .mockRejectedValueOnce(new Error('net::ERR_ABORTED'))
        .mockResolvedValueOnce('success');

      await expect(browserService.goto('https://example.com')).resolves.toBe('success');
      expect(mockPage.goto).toHaveBeenCalledTimes(3);
      expect(mockPage.waitForTimeout).toHaveBeenCalledTimes(2);
    });

    it('should throw an error after all retries fail', async () => {
      mockPage.goto.mockRejectedValue(new Error('net::ERR_ABORTED'));

      await expect(browserService.goto('https://example.com')).rejects.toThrow('net::ERR_ABORTED');
      expect(mockPage.goto).toHaveBeenCalledTimes(3);
    });
  });
});
