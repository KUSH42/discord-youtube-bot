import { jest } from '@jest/globals';
import { LivestreamStateMachine } from '../../src/core/livestream-state-machine.js';

describe('LivestreamStateMachine', () => {
  let stateMachine;
  let mockContentStateManager;
  let mockContentAnnouncer;
  let mockLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();

    mockContentStateManager = {
      getContentState: jest.fn(),
      updateContentState: jest.fn(),
      markAsAnnounced: jest.fn(),
      getContentByState: jest.fn(),
    };

    mockContentAnnouncer = {
      announce: jest.fn(),
    };

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    stateMachine = new LivestreamStateMachine(mockContentStateManager, mockContentAnnouncer, mockLogger);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with correct states and transitions', () => {
      expect(stateMachine.states).toEqual(['scheduled', 'live', 'ended', 'cancelled', 'published']);
      expect(stateMachine.transitions).toEqual({
        scheduled: ['live', 'cancelled'],
        live: ['ended'],
        ended: ['published'],
        cancelled: [],
        published: [],
      });
    });

    it('should initialize empty tracking maps', () => {
      expect(stateMachine.activePolling.size).toBe(0);
      expect(stateMachine.transitionCallbacks.size).toBe(0);
    });
  });

  describe('isValidTransition', () => {
    it('should return true for valid transitions', () => {
      expect(stateMachine.isValidTransition('scheduled', 'live')).toBe(true);
      expect(stateMachine.isValidTransition('scheduled', 'cancelled')).toBe(true);
      expect(stateMachine.isValidTransition('live', 'ended')).toBe(true);
      expect(stateMachine.isValidTransition('ended', 'published')).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      expect(stateMachine.isValidTransition('scheduled', 'ended')).toBe(false);
      expect(stateMachine.isValidTransition('live', 'cancelled')).toBe(false);
      expect(stateMachine.isValidTransition('ended', 'live')).toBe(false);
      expect(stateMachine.isValidTransition('published', 'live')).toBe(false);
      expect(stateMachine.isValidTransition('cancelled', 'live')).toBe(false);
    });

    it('should return false for null or undefined states', () => {
      expect(stateMachine.isValidTransition(null, 'live')).toBe(false);
      expect(stateMachine.isValidTransition('scheduled', null)).toBe(false);
      expect(stateMachine.isValidTransition(undefined, 'live')).toBe(false);
      expect(stateMachine.isValidTransition('scheduled', undefined)).toBe(false);
    });

    it('should return false for unknown states', () => {
      expect(stateMachine.isValidTransition('unknown', 'live')).toBe(false);
      expect(stateMachine.isValidTransition('scheduled', 'unknown')).toBe(false);
    });
  });

  describe('transitionState', () => {
    const videoId = 'test-video-123';
    const mockContentState = {
      id: videoId,
      state: 'scheduled',
      title: 'Test Stream',
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };

    beforeEach(() => {
      mockContentStateManager.getContentState.mockReturnValue(mockContentState);
      mockContentStateManager.updateContentState.mockResolvedValue();
    });

    it('should successfully transition valid state change', async () => {
      const result = await stateMachine.transitionState(videoId, 'live', { reason: 'api_detected' });

      expect(result).toBe(true);
      expect(mockContentStateManager.updateContentState).toHaveBeenCalledWith(videoId, {
        state: 'live',
        stateTransitionTime: expect.any(Date),
        transitionMetadata: { reason: 'api_detected' },
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Livestream state transition successful', {
        videoId,
        from: 'scheduled',
        to: 'live',
        title: 'Test Stream',
      });
    });

    it('should reject invalid state', async () => {
      const result = await stateMachine.transitionState(videoId, 'invalid_state');

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Invalid livestream state', {
        videoId,
        newState: 'invalid_state',
        validStates: stateMachine.states,
      });
      expect(mockContentStateManager.updateContentState).not.toHaveBeenCalled();
    });

    it('should reject transition for unknown content', async () => {
      mockContentStateManager.getContentState.mockReturnValue(null);

      const result = await stateMachine.transitionState(videoId, 'live');

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Cannot transition unknown content', {
        videoId,
        newState: 'live',
      });
      expect(mockContentStateManager.updateContentState).not.toHaveBeenCalled();
    });

    it('should reject invalid transition', async () => {
      const result = await stateMachine.transitionState(videoId, 'ended'); // scheduled -> ended is invalid

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Invalid state transition attempted', {
        videoId,
        from: 'scheduled',
        to: 'ended',
        allowedTransitions: ['live', 'cancelled'],
      });
      expect(mockContentStateManager.updateContentState).not.toHaveBeenCalled();
    });

    it('should handle state manager update failures', async () => {
      const error = new Error('State update failed');
      mockContentStateManager.updateContentState.mockRejectedValue(error);

      const result = await stateMachine.transitionState(videoId, 'live');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to transition livestream state', {
        videoId,
        from: 'scheduled',
        to: 'live',
        error: 'State update failed',
      });
    });

    it('should call handleStateTransition after successful update', async () => {
      const handleSpy = jest.spyOn(stateMachine, 'handleStateTransition').mockResolvedValue();

      await stateMachine.transitionState(videoId, 'live');

      expect(handleSpy).toHaveBeenCalledWith(videoId, 'scheduled', 'live', mockContentState);
    });
  });

  describe('handleLiveTransition', () => {
    const videoId = 'test-video-123';
    const contentState = {
      id: videoId,
      announced: false,
      title: 'Test Stream',
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };

    beforeEach(() => {
      mockContentAnnouncer.announce.mockResolvedValue({ success: true });
      mockContentStateManager.markAsAnnounced.mockResolvedValue();
    });

    it('should announce livestream start for unannounced content', async () => {
      const pollingSpy = jest.spyOn(stateMachine, 'startStatePolling').mockImplementation();

      await stateMachine.handleLiveTransition(videoId, contentState);

      expect(mockContentAnnouncer.announce).toHaveBeenCalledWith({
        type: 'youtube_livestream',
        videoId,
        url: contentState.url,
        title: 'Test Stream',
        state: 'live',
        isLive: true,
      });
      expect(mockContentStateManager.markAsAnnounced).toHaveBeenCalledWith(videoId);
      expect(mockLogger.info).toHaveBeenCalledWith('Livestream start announced', {
        videoId,
        title: 'Test Stream',
      });
      expect(pollingSpy).toHaveBeenCalledWith(videoId, 'ended');
    });

    it('should not announce if already announced', async () => {
      const alreadyAnnouncedState = { ...contentState, announced: true };
      const pollingSpy = jest.spyOn(stateMachine, 'startStatePolling').mockImplementation();

      await stateMachine.handleLiveTransition(videoId, alreadyAnnouncedState);

      expect(mockContentAnnouncer.announce).not.toHaveBeenCalled();
      expect(mockContentStateManager.markAsAnnounced).not.toHaveBeenCalled();
      expect(pollingSpy).toHaveBeenCalledWith(videoId, 'ended');
    });

    it('should handle announcement failures gracefully', async () => {
      const error = new Error('Announcement failed');
      mockContentAnnouncer.announce.mockRejectedValue(error);
      const pollingSpy = jest.spyOn(stateMachine, 'startStatePolling').mockImplementation();

      await stateMachine.handleLiveTransition(videoId, contentState);

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to announce livestream start', {
        videoId,
        error: 'Announcement failed',
      });
      expect(pollingSpy).toHaveBeenCalledWith(videoId, 'ended');
    });

    it('should use default URL if none provided', async () => {
      const stateWithoutUrl = { ...contentState, url: undefined };
      jest.spyOn(stateMachine, 'startStatePolling').mockImplementation();

      await stateMachine.handleLiveTransition(videoId, stateWithoutUrl);

      expect(mockContentAnnouncer.announce).toHaveBeenCalledWith({
        type: 'youtube_livestream',
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: 'Test Stream',
        state: 'live',
        isLive: true,
      });
    });

    it('should use default title if none provided', async () => {
      const stateWithoutTitle = { ...contentState, title: undefined };
      jest.spyOn(stateMachine, 'startStatePolling').mockImplementation();

      await stateMachine.handleLiveTransition(videoId, stateWithoutTitle);

      expect(mockContentAnnouncer.announce).toHaveBeenCalledWith({
        type: 'youtube_livestream',
        videoId,
        url: contentState.url,
        title: 'Live Stream',
        state: 'live',
        isLive: true,
      });
    });
  });

  describe('handleEndedTransition', () => {
    const videoId = 'test-video-123';
    const contentState = {
      id: videoId,
      title: 'Test Stream',
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };

    it('should stop polling and start published state polling', async () => {
      const stopPollingSpy = jest.spyOn(stateMachine, 'stopStatePolling').mockImplementation();
      const startPollingSpy = jest.spyOn(stateMachine, 'startStatePolling').mockImplementation();

      await stateMachine.handleEndedTransition(videoId, contentState);

      expect(stopPollingSpy).toHaveBeenCalledWith(videoId);

      // Fast-forward the setTimeout
      jest.advanceTimersByTime(60000);

      expect(startPollingSpy).toHaveBeenCalledWith(videoId, 'published');
    });

    it('should not announce stream end by default', async () => {
      jest.spyOn(stateMachine, 'stopStatePolling').mockImplementation();
      jest.spyOn(stateMachine, 'startStatePolling').mockImplementation();

      await stateMachine.handleEndedTransition(videoId, contentState);

      expect(mockContentAnnouncer.announce).not.toHaveBeenCalled();
    });
  });

  describe('handleCancelledTransition', () => {
    const videoId = 'test-video-123';
    const contentState = {
      id: videoId,
      title: 'Test Stream',
    };

    it('should stop polling and log cancellation', async () => {
      const stopPollingSpy = jest.spyOn(stateMachine, 'stopStatePolling').mockImplementation();

      await stateMachine.handleCancelledTransition(videoId, contentState);

      expect(stopPollingSpy).toHaveBeenCalledWith(videoId);
      expect(mockLogger.info).toHaveBeenCalledWith('Livestream cancelled', {
        videoId,
        title: 'Test Stream',
      });
    });
  });

  describe('handlePublishedTransition', () => {
    const videoId = 'test-video-123';

    beforeEach(() => {
      mockContentAnnouncer.announce.mockResolvedValue({ success: true });
      mockContentStateManager.markAsAnnounced.mockResolvedValue();
    });

    it('should announce VOD for unannounced content', async () => {
      const contentState = {
        id: videoId,
        announced: false,
        title: 'Test Stream',
        url: `https://www.youtube.com/watch?v=${videoId}`,
      };
      const stopPollingSpy = jest.spyOn(stateMachine, 'stopStatePolling').mockImplementation();

      await stateMachine.handlePublishedTransition(videoId, contentState);

      expect(stopPollingSpy).toHaveBeenCalledWith(videoId);
      expect(mockContentAnnouncer.announce).toHaveBeenCalledWith({
        type: 'youtube_video',
        videoId,
        url: contentState.url,
        title: 'Test Stream',
        state: 'published',
        isLive: false,
        wasLivestream: true,
      });
      expect(mockContentStateManager.markAsAnnounced).toHaveBeenCalledWith(videoId);
      expect(mockLogger.info).toHaveBeenCalledWith('Livestream VOD announced', {
        videoId,
        title: 'Test Stream',
      });
    });

    it('should not announce if already announced', async () => {
      const contentState = {
        id: videoId,
        announced: true,
        title: 'Test Stream',
      };
      jest.spyOn(stateMachine, 'stopStatePolling').mockImplementation();

      await stateMachine.handlePublishedTransition(videoId, contentState);

      expect(mockContentAnnouncer.announce).not.toHaveBeenCalled();
      expect(mockContentStateManager.markAsAnnounced).not.toHaveBeenCalled();
    });

    it('should handle announcement failures gracefully', async () => {
      const contentState = {
        id: videoId,
        announced: false,
        title: 'Test Stream',
        url: `https://www.youtube.com/watch?v=${videoId}`,
      };
      const error = new Error('VOD announcement failed');
      mockContentAnnouncer.announce.mockRejectedValue(error);
      jest.spyOn(stateMachine, 'stopStatePolling').mockImplementation();

      await stateMachine.handlePublishedTransition(videoId, contentState);

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to announce livestream VOD', {
        videoId,
        error: 'VOD announcement failed',
      });
    });
  });

  describe('startStatePolling', () => {
    const videoId = 'test-video-123';

    beforeEach(() => {
      jest.spyOn(stateMachine, 'checkVideoState').mockResolvedValue(null);
      jest.spyOn(stateMachine, 'getCurrentState').mockReturnValue('live');
      jest.spyOn(stateMachine, 'stopStatePolling').mockImplementation();
    });

    it('should start polling with default interval', () => {
      stateMachine.startStatePolling(videoId, 'ended');

      expect(stateMachine.stopStatePolling).toHaveBeenCalledWith(videoId);
      expect(stateMachine.activePolling.has(videoId)).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith('Starting state polling', {
        videoId,
        expectedState: 'ended',
        interval: 30000,
      });
    });

    it('should start polling with custom interval', () => {
      stateMachine.startStatePolling(videoId, 'ended', 60000);

      expect(mockLogger.debug).toHaveBeenCalledWith('Starting state polling', {
        videoId,
        expectedState: 'ended',
        interval: 60000,
      });
    });

    it('should stop polling after 6 hours timeout', () => {
      const stopSpy = jest.spyOn(stateMachine, 'stopStatePolling').mockImplementation();

      stateMachine.startStatePolling(videoId, 'ended');

      // Clear the initial call
      stopSpy.mockClear();

      // Fast-forward 6 hours
      jest.advanceTimersByTime(6 * 60 * 60 * 1000);

      expect(stopSpy).toHaveBeenCalledWith(videoId);
    });

    it('should detect state changes and attempt transition', async () => {
      jest.spyOn(stateMachine, 'checkVideoState').mockResolvedValue('ended');
      jest.spyOn(stateMachine, 'getCurrentState').mockReturnValue('live');
      const transitionSpy = jest.spyOn(stateMachine, 'transitionState').mockResolvedValue(true);

      stateMachine.startStatePolling(videoId, 'ended');

      // Trigger the poll function
      await jest.advanceTimersByTimeAsync(30000);

      expect(transitionSpy).toHaveBeenCalledWith(videoId, 'ended', {
        detectionMethod: 'polling',
      });
    });

    it('should handle polling errors gracefully', async () => {
      const error = new Error('State check failed');
      jest.spyOn(stateMachine, 'checkVideoState').mockRejectedValue(error);
      const stopSpy = jest.spyOn(stateMachine, 'stopStatePolling').mockImplementation();

      stateMachine.startStatePolling(videoId, 'ended');

      // Clear the initial call
      stopSpy.mockClear();

      // Trigger the poll function
      await jest.advanceTimersByTimeAsync(30000);

      expect(mockLogger.error).toHaveBeenCalledWith('State polling error', {
        videoId,
        expectedState: 'ended',
        error: 'State check failed',
      });
      expect(stopSpy).toHaveBeenCalledWith(videoId);
    });
  });

  describe('stopStatePolling', () => {
    const videoId = 'test-video-123';

    it('should stop active polling', () => {
      // Start polling first
      stateMachine.startStatePolling(videoId, 'ended');
      expect(stateMachine.activePolling.has(videoId)).toBe(true);

      // Stop polling
      stateMachine.stopStatePolling(videoId);

      expect(stateMachine.activePolling.has(videoId)).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith('Stopped state polling', { videoId });
    });

    it('should handle stopping non-existent polling gracefully', () => {
      stateMachine.stopStatePolling(videoId);

      expect(stateMachine.activePolling.has(videoId)).toBe(false);
    });
  });

  describe('getCurrentState', () => {
    const videoId = 'test-video-123';

    it('should return current state when content exists', () => {
      const mockState = { state: 'live' };
      mockContentStateManager.getContentState.mockReturnValue(mockState);

      const result = stateMachine.getCurrentState(videoId);

      expect(result).toBe('live');
      expect(mockContentStateManager.getContentState).toHaveBeenCalledWith(videoId);
    });

    it('should return null when content does not exist', () => {
      mockContentStateManager.getContentState.mockReturnValue(null);

      const result = stateMachine.getCurrentState(videoId);

      expect(result).toBeNull();
    });
  });

  describe('checkVideoState', () => {
    const videoId = 'test-video-123';

    it('should return null and log debug message (placeholder implementation)', async () => {
      const result = await stateMachine.checkVideoState(videoId);

      expect(result).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith('State checking not yet implemented', { videoId });
    });
  });

  describe('transition callbacks', () => {
    const videoId = 'test-video-123';

    describe('addTransitionCallback', () => {
      it('should add callback for video', () => {
        const callback = jest.fn();

        stateMachine.addTransitionCallback(videoId, callback);

        expect(stateMachine.transitionCallbacks.has(videoId)).toBe(true);
        expect(stateMachine.transitionCallbacks.get(videoId)).toContain(callback);
      });

      it('should add multiple callbacks for same video', () => {
        const callback1 = jest.fn();
        const callback2 = jest.fn();

        stateMachine.addTransitionCallback(videoId, callback1);
        stateMachine.addTransitionCallback(videoId, callback2);

        const callbacks = stateMachine.transitionCallbacks.get(videoId);
        expect(callbacks).toHaveLength(2);
        expect(callbacks).toContain(callback1);
        expect(callbacks).toContain(callback2);
      });
    });

    describe('removeTransitionCallbacks', () => {
      it('should remove all callbacks for video', () => {
        const callback = jest.fn();
        stateMachine.addTransitionCallback(videoId, callback);

        stateMachine.removeTransitionCallbacks(videoId);

        expect(stateMachine.transitionCallbacks.has(videoId)).toBe(false);
      });

      it('should handle removing non-existent callbacks gracefully', () => {
        stateMachine.removeTransitionCallbacks(videoId);

        expect(stateMachine.transitionCallbacks.has(videoId)).toBe(false);
      });
    });

    describe('executeTransitionCallbacks', () => {
      it('should execute all callbacks for video', async () => {
        const callback1 = jest.fn().mockResolvedValue();
        const callback2 = jest.fn().mockResolvedValue();

        stateMachine.addTransitionCallback(videoId, callback1);
        stateMachine.addTransitionCallback(videoId, callback2);

        await stateMachine.executeTransitionCallbacks(videoId, 'scheduled', 'live');

        expect(callback1).toHaveBeenCalledWith(videoId, 'scheduled', 'live');
        expect(callback2).toHaveBeenCalledWith(videoId, 'scheduled', 'live');
      });

      it('should handle callback failures gracefully', async () => {
        const error = new Error('Callback failed');
        const failingCallback = jest.fn().mockRejectedValue(error);
        const successCallback = jest.fn().mockResolvedValue();

        stateMachine.addTransitionCallback(videoId, failingCallback);
        stateMachine.addTransitionCallback(videoId, successCallback);

        await stateMachine.executeTransitionCallbacks(videoId, 'scheduled', 'live');

        expect(failingCallback).toHaveBeenCalled();
        expect(successCallback).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith('Transition callback failed', {
          videoId,
          fromState: 'scheduled',
          toState: 'live',
          error: 'Callback failed',
        });
      });

      it('should handle no callbacks gracefully', async () => {
        await stateMachine.executeTransitionCallbacks(videoId, 'scheduled', 'live');

        // Should not throw or cause issues
        expect(mockLogger.error).not.toHaveBeenCalled();
      });
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      mockContentStateManager.getContentByState.mockImplementation(state => {
        const mockData = {
          live: [{ id: 'live-1' }, { id: 'live-2' }],
          scheduled: [{ id: 'scheduled-1' }],
          ended: [{ id: 'ended-1' }, { id: 'ended-2' }, { id: 'ended-3' }],
        };
        return mockData[state] || [];
      });
    });

    it('should return comprehensive statistics', () => {
      // Add some active polling and callbacks
      stateMachine.startStatePolling('video-1', 'ended');
      stateMachine.addTransitionCallback('video-1', jest.fn());
      stateMachine.addTransitionCallback('video-2', jest.fn());

      const stats = stateMachine.getStats();

      expect(stats).toEqual({
        activePolling: 1,
        activeCallbacks: 2,
        contentByState: {
          live: 2,
          scheduled: 1,
          ended: 3,
        },
        validStates: ['scheduled', 'live', 'ended', 'cancelled', 'published'],
        validTransitions: {
          scheduled: ['live', 'cancelled'],
          live: ['ended'],
          ended: ['published'],
          cancelled: [],
          published: [],
        },
      });
    });
  });

  describe('destroy', () => {
    it('should stop all polling and clear callbacks', async () => {
      // Set up some active polling and callbacks
      stateMachine.startStatePolling('video-1', 'ended');
      stateMachine.startStatePolling('video-2', 'published');
      stateMachine.addTransitionCallback('video-1', jest.fn());
      stateMachine.addTransitionCallback('video-2', jest.fn());

      expect(stateMachine.activePolling.size).toBe(2);
      expect(stateMachine.transitionCallbacks.size).toBe(2);

      await stateMachine.destroy();

      expect(stateMachine.activePolling.size).toBe(0);
      expect(stateMachine.transitionCallbacks.size).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith('Livestream state machine destroyed');
    });

    it('should handle destroy with no active resources gracefully', async () => {
      await stateMachine.destroy();

      expect(stateMachine.activePolling.size).toBe(0);
      expect(stateMachine.transitionCallbacks.size).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith('Livestream state machine destroyed');
    });
  });

  describe('handleStateTransition', () => {
    const videoId = 'test-video-123';
    const contentState = { id: videoId, title: 'Test Stream' };

    it('should call handleLiveTransition for live state', async () => {
      const handleSpy = jest.spyOn(stateMachine, 'handleLiveTransition').mockResolvedValue();

      await stateMachine.handleStateTransition(videoId, 'scheduled', 'live', contentState);

      expect(handleSpy).toHaveBeenCalledWith(videoId, contentState);
    });

    it('should call handleEndedTransition for ended state', async () => {
      const handleSpy = jest.spyOn(stateMachine, 'handleEndedTransition').mockResolvedValue();

      await stateMachine.handleStateTransition(videoId, 'live', 'ended', contentState);

      expect(handleSpy).toHaveBeenCalledWith(videoId, contentState);
    });

    it('should call handleCancelledTransition for cancelled state', async () => {
      const handleSpy = jest.spyOn(stateMachine, 'handleCancelledTransition').mockResolvedValue();

      await stateMachine.handleStateTransition(videoId, 'scheduled', 'cancelled', contentState);

      expect(handleSpy).toHaveBeenCalledWith(videoId, contentState);
    });

    it('should call handlePublishedTransition for published state', async () => {
      const handleSpy = jest.spyOn(stateMachine, 'handlePublishedTransition').mockResolvedValue();

      await stateMachine.handleStateTransition(videoId, 'ended', 'published', contentState);

      expect(handleSpy).toHaveBeenCalledWith(videoId, contentState);
    });

    it('should log debug message for unknown state', async () => {
      await stateMachine.handleStateTransition(videoId, 'live', 'unknown', contentState);

      expect(mockLogger.debug).toHaveBeenCalledWith('No special handling for state transition', {
        videoId,
        fromState: 'live',
        toState: 'unknown',
      });
    });
  });
});
