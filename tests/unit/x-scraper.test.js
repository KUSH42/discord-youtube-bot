import { jest } from '@jest/globals';
import { ScraperApplication } from '../../src/application/scraper-application.js';

jest.spyOn(ScraperApplication.prototype, 'start').mockResolvedValue();

describe('X Scraper Entry Point', () => {
  let main;

  beforeEach(async () => {
    const { main: mainFunc } = await import('../../x-scraper.js');
    main = mainFunc;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize and start the scraper application', async () => {
    await main();
    expect(ScraperApplication.prototype.start).toHaveBeenCalledTimes(1);
  });
});
