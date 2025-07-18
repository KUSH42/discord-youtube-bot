import { jest } from '@jest/globals';
import { MonitorApplication } from '../../src/application/monitor-application.js';

jest.spyOn(MonitorApplication.prototype, 'start').mockResolvedValue();

describe('YouTube Monitor Entry Point', () => {
  let main;

  beforeEach(async () => {
    const { main: mainFunc } = await import('../../youtube-monitor.js');
    main = mainFunc;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize and start the monitor application', async () => {
    await main();
    expect(MonitorApplication.prototype.start).toHaveBeenCalledTimes(1);
  });
});
