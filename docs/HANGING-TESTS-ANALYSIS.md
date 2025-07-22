Analysis Complete - Root Causes Identified

  Based on my systematic analysis, I've identified several critical issues causing the hanging
  tests:

  Primary Root Causes:

  1. Timer Cleanup Conflict: Global test setup calls jest.useRealTimers() in every afterEach(),
   but individual tests also call jest.useFakeTimers() and jest.useRealTimers() locally,
  creating conflicts.
  2. Missing Timer Cleanup: tests/unit/utils/delay.test.js uses jest.useFakeTimers() at the
  describe level but never cleans up with jest.useRealTimers().
  3. Async Timer Operations: Some tests use jest.runAllTimersAsync() combined with complex
  promise chains that may not resolve properly.
  4. Resource Cleanup Race Conditions: Tests that start monitoring services (like YouTube
  scraper) may have timing issues between when fake timers advance and when cleanup occurs.

  Secondary Issues:

  5. Global Mock Console: All console methods are mocked globally, which might interfere with
  Jest's own internal logging.
  6. Force Exit Configuration: Jest is configured with forceExit: true indicating previous
  awareness of hanging issues, but the root cause wasn't addressed.

  Comprehensive Fix Plan:

  Phase 1: Fix Timer Management (High Priority)

  1. Remove global timer cleanup from tests/setup.js
  2. Fix the missing cleanup in delay.test.js
  3. Standardize timer patterns across all tests
  4. Add proper cleanup guards in individual test files

  Phase 2: Fix Resource Management (High Priority)

  5. Ensure service cleanup in all tests that start services
  6. Add timeout guards to prevent infinite waits
  7. Fix async/await patterns in timer-based tests

  Phase 3: Optimize Test Configuration (Medium Priority)

  8. Remove forceExit dependency once hangs are fixed
  9. Optimize global mocking to be less intrusive
  10. Add better error handling for unhandled promises

# CURRENT STATUS:

● Great! Now let me test the rate-limited sender that has complex timer operations:

● Bash(NODE_OPTIONS="--experimental-vm-modules" npx jest
      tests/unit/discord-rate-limited-sender.test.js --no-coverage --testTimeout=10000
      --detectOpenHandles --forceEx…)
  ⎿  Error: Command timed out after 2m 0.0s (node:579929) ExperimentalWarning: VM Modules is an 
     experimental feature and might change at any time
     (Use `node --trace-warnings ...` to show where the warning was created)

> --testTimeout=10000 seems to have no effect?

● You're absolutely right! Even with --testTimeout=10000, it's still hanging for the full
  2-minute command timeout. This suggests the issue is not with Jest's test timeout but with
  something that's creating a truly infinite hang - likely an infinite loop or unresolved
  promise that never times out.

  Let me examine the discord-rate-limited-sender test more closely since it's the one hanging:

● Read(tests/unit/discord-rate-limited-sender.test.js)
  ⎿  Read 20 lines (ctrl+r to expand)

● I see the issue! The test uses global.advanceAsyncTimers() which was defined in the test
  setup, but it might not be properly advancing both fake timers AND resolving promises. Let me
   check how this function is implemented:

● Read(tests/unit/discord-rate-limited-sender.test.js)
  ⎿  Read 15 lines (ctrl+r to expand)

● The issue is in line 32: await new Promise(resolve => setImmediate(resolve));. When using
  fake timers, setImmediate might not work as expected and could create a promise that never
  resolves, causing an infinite hang.

  Let me fix this:

● Update(tests/unit/discord-rate-limited-sender.test.js)
  ⎿  Updated tests/unit/discord-rate-limited-sender.test.js with 2 additions and 2 removals
       27        global.advanceAsyncTimers = async ms => {
       28          mockTimeSource.advanceTime(ms);
       29          await jest.advanceTimersByTimeAsync(ms);
       30 -        // Allow promises to resolve
       30 +        // Allow promises to resolve with multiple event loop cycles
       31          await Promise.resolve();
       32 -        await new Promise(resolve => setImmediate(resolve));
       32 +        await Promise.resolve();
       33        };
       34    
       35        mockLogger = {

● Now let me test this fix:

● Bash(NODE_OPTIONS="--experimental-vm-modules" npx jest
      tests/unit/discord-rate-limited-sender.test.js --no-coverage --testTimeout=10000
      --detectOpenHandles --forceEx…)
  ⎿  Error: Command timed out after 2m 0.0s (node:581296) ExperimentalWarning: VM Modules is an 
     experimental feature and might change at any time
     (Use `node --trace-warnings ...` to show where the warning was created)

● Still hanging. The issue must be deeper. Let me look at other parts of this test that might
  be causing infinite loops. Let me check if the rate limited sender itself has issues when
  startProcessing() is called:

● Read(src/services/implementations/discord-rate-limited-sender.js)
  ⎿  Read 30 lines (ctrl+r to expand)

● Let me look at the startProcessing method to see if it has an infinite loop:

● Search(pattern: "startProcessing", path:
        "src/services/implementations/discord-rate-limited-sender.js", output_mode: "content")
  ⎿  Found 40 lines (ctrl+r to expand)

● Search(pattern: "processQueue", path:
        "src/services/implementations/discord-rate-limited-sender.js", output_mode: "content")
  ⎿  Found 44 lines (ctrl+r to expand)

● Found it! The issue is in this line at the end of the processQueue loop:

  await this.delay(100);

  This creates an infinite loop where the service waits for 100ms when there are no messages,
  but when using fake timers, this delay might not advance properly, causing the loop to hang
  indefinitely.

  Let me check how the delay method works:

● Search(pattern: "async delay|delay.*function", path:
        "src/services/implementations/discord-rate-limited-sender.js", output_mode: "content")
  ⎿  Found 0 lines 

● Search(pattern: "this\.delay", path:
        "src/services/implementations/discord-rate-limited-sender.js", output_mode: "content")
  ⎿  Found 74 lines (ctrl+r to expand)

● I need to find where the delay method is defined:

● Bash(grep -n "delay.*=" /home/xush/Documents/prog/discord-youtube-bot/src/services/implementa
      tions/discord-rate-limited-sender.js)
  ⎿  347:    const delay = baseDelay * Math.pow(this.backoffMultiplier, retryCount - 1);

● Search(pattern: "delay.*function|delay.*=>|delay.*{", path:
        "src/services/implementations/discord-rate-limited-sender.js", output_mode: "content")
  ⎿  Found 0 lines 

● Let me search for where delay is imported or defined:

● Read(src/services/implementations/discord-rate-limited-sender.js)
  ⎿  Read 30 lines (ctrl+r to expand)

● Read(src/services/implementations/discord-rate-limited-sender.js)
  ⎿  Read 2 lines (ctrl+r to expand)

● The file doesn't show the delay method definition. Let me check if it imports it:

● Read(src/services/implementations/discord-rate-limited-sender.js)
  ⎿  Read 10 lines (ctrl+r to expand)

● Bash(grep -n "import\|delay.*=" /home/xush/Documents/prog/discord-youtube-bot/src/services/im
      plementations/discord-rate-limited-sender.js | head -5)
  ⎿  (No content)

● The delay method might be inherited or dynamically added. Let me check if it's defined in the
   test itself or if it's supposed to be the delay utility:

● Bash(grep -rn "this\.delay.*=" /home/xush/Documents/prog/discord-youtube-bot/src/services/imp
      lementations/discord-rate-limited-sender.js)
  ⎿  No matches found

● Let me check the constructor to see if delay is set up there:

● Read(src/services/implementations/discord-rate-limited-sender.js)
  ⎿  Read 50 lines (ctrl+r to expand)

● The delay method is not defined in the constructor. Let me check if it's supposed to be the
  delay utility from the utils folder, and if so, it might not be imported properly. Let me
  check the end of the file:

● Bash(tail -20 /home/xush/Documents/prog/discord-youtube-bot/src/services/implementations/disc
      ord-rate-limited-sender.js)
  ⎿      while (this.messageQueue.length > 0 && this.timeSource() - startTime < timeoutMs) {
           if (this.enableDelays) {
             await this.delay(1000);
     … +17 lines (ctrl+r to expand)

● The issue is now clear! The this.delay method is being called but is never defined anywhere
  in the class. This would cause a runtime error "this.delay is not a function" which would
  then cause the promise in the queue processing loop to reject, potentially creating an
  unhandled promise rejection that hangs the test.

  Let me fix this by adding the delay method or importing it properly. Let me first check if
  the delay utility exists:

● Read(src/utils/delay.js)
  ⎿  Read 9 lines (ctrl+r to expand)

● Perfect! The delay utility exists but is not imported in the rate-limited sender. Let me fix
  this:

● Update(src/services/implementations/discord-rate-limited-sender.js)
  ⎿  Updated src/services/implementations/discord-rate-limited-sender.js with 2 additions     
       1 +  import { delay } from '../../utils/delay.js';
       2 +  
       3    /**
       4     * Discord Rate-Limited Message Sender
       5     * Implements a sophisticated queue and retry system for Discord API rate limiting