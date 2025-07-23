/**
 * HumanBehaviorSimulator - Advanced human-like interaction patterns
 * Simulates realistic browsing behavior to avoid bot detection
 */
export class HumanBehaviorSimulator {
  constructor(page, logger) {
    this.page = page;
    this.logger = logger;
    this.mousePosition = { x: 0, y: 0 };
    this.isSimulationEnabled = true;
    this.lastInteractionTime = Date.now();

    // Behavior patterns configuration
    this.config = {
      mouseMovements: {
        enabled: true,
        minMovements: 2,
        maxMovements: 6,
        smoothness: 8, // Steps for smooth movement
        jitterAmount: 2, // Pixel jitter for natural movement
      },
      scrolling: {
        enabled: true,
        probability: 0.7, // 70% chance to scroll
        minScrolls: 1,
        maxScrolls: 4,
        scrollAmount: { min: 100, max: 500 },
        pauseBetweenScrolls: { min: 1000, max: 3000 },
      },
      reading: {
        enabled: true,
        wordsPerMinute: 200, // Average reading speed
        charsPerWord: 5, // Average characters per word
        comprehensionFactor: 0.6, // Reading efficiency factor
      },
      interaction: {
        enabled: true,
        hoverProbability: 0.3, // 30% chance to hover over elements
        clickDelay: { min: 100, max: 300 },
        typeDelay: { min: 50, max: 150 },
      },
    };
  }

  /**
   * Simulate realistic page load with human-like behaviors
   * @param {string} url - URL to navigate to
   * @param {Object} options - Navigation options
   * @returns {Promise<Object>} Navigation response
   */
  async simulateRealisticPageLoad(url, options = {}) {
    try {
      // Pre-navigation delay (thinking time)
      await this.randomDelay(500, 2000);

      // Navigate to page
      const response = await this.page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 30000,
        ...options,
      });

      // Wait for initial page render
      await this.randomDelay(800, 1500);

      // Simulate human reading and interaction patterns
      if (this.isSimulationEnabled) {
        await this.simulateInitialPageInteraction();
      }

      this.lastInteractionTime = Date.now();

      this.logger.debug('Realistic page load completed', {
        url,
        simulationEnabled: this.isSimulationEnabled,
      });

      return response;
    } catch (error) {
      this.logger.error('Error during realistic page load', {
        url,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Simulate initial interaction after page load
   */
  async simulateInitialPageInteraction() {
    // Simulate reading time
    await this.simulateReadingBehavior();

    // Random mouse movements
    if (this.config.mouseMovements.enabled) {
      await this.simulateMouseMovements();
    }

    // Occasional scrolling behavior
    if (this.config.scrolling.enabled && Math.random() < this.config.scrolling.probability) {
      await this.simulateScrolling();
    }

    // Random element hovering
    if (this.config.interaction.enabled && Math.random() < this.config.interaction.hoverProbability) {
      await this.simulateElementHovering();
    }
  }

  /**
   * Simulate realistic mouse movements
   */
  async simulateMouseMovements() {
    const movements =
      Math.floor(
        Math.random() * (this.config.mouseMovements.maxMovements - this.config.mouseMovements.minMovements + 1)
      ) + this.config.mouseMovements.minMovements;

    for (let i = 0; i < movements; i++) {
      // Get viewport size for realistic coordinates
      const viewport = await this.page.viewportSize();
      const margin = 50; // Avoid edges

      const targetX = Math.floor(Math.random() * (viewport.width - 2 * margin)) + margin;
      const targetY = Math.floor(Math.random() * (viewport.height - 2 * margin)) + margin;

      await this.smoothMouseMove(targetX, targetY);
      await this.randomDelay(200, 800);
    }
  }

  /**
   * Perform smooth, human-like mouse movement
   * @param {number} targetX - Target X coordinate
   * @param {number} targetY - Target Y coordinate
   */
  async smoothMouseMove(targetX, targetY) {
    const steps = Math.floor(Math.random() * (this.config.mouseMovements.smoothness - 3)) + 5; // 5-8 steps

    const deltaX = (targetX - this.mousePosition.x) / steps;
    const deltaY = (targetY - this.mousePosition.y) / steps;

    for (let i = 0; i < steps; i++) {
      // Add jitter for natural movement
      const jitterX = (Math.random() - 0.5) * this.config.mouseMovements.jitterAmount;
      const jitterY = (Math.random() - 0.5) * this.config.mouseMovements.jitterAmount;

      this.mousePosition.x += deltaX + jitterX;
      this.mousePosition.y += deltaY + jitterY;

      // Ensure coordinates stay within bounds
      const viewport = await this.page.viewportSize();
      this.mousePosition.x = Math.max(0, Math.min(viewport.width, this.mousePosition.x));
      this.mousePosition.y = Math.max(0, Math.min(viewport.height, this.mousePosition.y));

      try {
        await this.page.mouse.move(this.mousePosition.x, this.mousePosition.y);
        await this.randomDelay(10, 50);
      } catch (error) {
        // Continue if mouse move fails
        this.logger.debug('Mouse move failed', { error: error.message });
      }
    }
  }

  /**
   * Simulate realistic scrolling behavior
   */
  async simulateScrolling() {
    const scrolls =
      Math.floor(Math.random() * (this.config.scrolling.maxScrolls - this.config.scrolling.minScrolls + 1)) +
      this.config.scrolling.minScrolls;

    for (let i = 0; i < scrolls; i++) {
      const scrollAmount =
        Math.floor(
          Math.random() * (this.config.scrolling.scrollAmount.max - this.config.scrolling.scrollAmount.min + 1)
        ) + this.config.scrolling.scrollAmount.min;

      // Random scroll direction (mostly down, occasionally up)
      const direction = Math.random() < 0.85 ? 1 : -1;
      const finalScrollAmount = scrollAmount * direction;

      try {
        await this.page.evaluate(amount => {
          // eslint-disable-next-line no-undef
          window.scrollBy({
            top: amount,
            left: 0,
            behavior: 'smooth',
          });
        }, finalScrollAmount);

        // Reading pause after scroll
        const pauseTime =
          Math.floor(
            Math.random() *
              (this.config.scrolling.pauseBetweenScrolls.max - this.config.scrolling.pauseBetweenScrolls.min + 1)
          ) + this.config.scrolling.pauseBetweenScrolls.min;

        await this.randomDelay(pauseTime * 0.8, pauseTime * 1.2);
      } catch (error) {
        this.logger.debug('Scroll simulation failed', { error: error.message });
      }
    }
  }

  /**
   * Simulate reading behavior based on page content
   */
  async simulateReadingBehavior() {
    if (!this.config.reading.enabled) {
      return;
    }

    try {
      // Get visible text content for reading time estimation
      const textContent = await this.page.evaluate(() => {
        // Get text from main content areas
        const contentSelectors = ['main', 'article', '.content', '#content', '.post', '.entry', 'p', 'div'];

        let totalText = '';
        for (const selector of contentSelectors) {
          // eslint-disable-next-line no-undef
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            if (element.offsetParent !== null) {
              // Only visible elements
              totalText += element.innerText || '';
            }
          }
        }

        return totalText.length;
      });

      // Estimate reading time
      const wordsEstimate = textContent / this.config.reading.charsPerWord;
      const baseReadingTime = (wordsEstimate / this.config.reading.wordsPerMinute) * 60 * 1000; // ms
      const adjustedReadingTime = baseReadingTime * this.config.reading.comprehensionFactor;

      // Cap reading time for practical limits
      const minReadingTime = 2000; // 2 seconds minimum
      const maxReadingTime = 15000; // 15 seconds maximum
      const finalReadingTime = Math.max(minReadingTime, Math.min(maxReadingTime, adjustedReadingTime));

      // Add variance for natural behavior
      const variance = finalReadingTime * 0.3; // ±30% variance
      const actualReadingTime = finalReadingTime + (Math.random() - 0.5) * 2 * variance;

      this.logger.debug('Simulating reading behavior', {
        textLength: textContent,
        wordsEstimate,
        baseReadingTime,
        finalReadingTime: actualReadingTime,
      });

      await this.randomDelay(actualReadingTime * 0.1, actualReadingTime * 0.3);
    } catch (error) {
      // Fallback to basic delay if content analysis fails
      await this.randomDelay(2000, 5000);
      this.logger.debug('Reading simulation fallback', { error: error.message });
    }
  }

  /**
   * Simulate hovering over interactive elements
   */
  async simulateElementHovering() {
    try {
      // Find hoverable elements
      const elements = await this.page.$$('a, button, [role="button"], .clickable, .link');

      if (elements.length === 0) {
        return;
      }

      // Select random element(s) to hover
      const hoverCount = Math.min(3, Math.floor(Math.random() * 2) + 1);
      const selectedElements = [];

      for (let i = 0; i < hoverCount; i++) {
        const randomIndex = Math.floor(Math.random() * elements.length);
        const element = elements[randomIndex];
        if (!selectedElements.includes(element)) {
          selectedElements.push(element);
        }
      }

      // Hover over selected elements
      for (const element of selectedElements) {
        try {
          const boundingBox = await element.boundingBox();
          if (boundingBox) {
            const centerX = boundingBox.x + boundingBox.width / 2;
            const centerY = boundingBox.y + boundingBox.height / 2;

            await this.smoothMouseMove(centerX, centerY);
            await element.hover();
            await this.randomDelay(500, 1500); // Hover duration
          }
        } catch (hoverError) {
          // Continue with next element if hover fails
          this.logger.debug('Element hover failed', { error: hoverError.message });
        }
      }
    } catch (error) {
      this.logger.debug('Element hovering simulation failed', { error: error.message });
    }
  }

  /**
   * Simulate typing with human-like delays
   * @param {string} selector - Element selector to type into
   * @param {string} text - Text to type
   * @param {Object} options - Typing options
   */
  async simulateTyping(selector, text, _options = {}) {
    if (!this.config.interaction.enabled) {
      await this.page.fill(selector, text);
      return;
    }

    try {
      const element = await this.page.$(selector);
      if (!element) {
        throw new Error(`Element not found: ${selector}`);
      }

      // Click to focus
      await element.click();
      await this.randomDelay(100, 300);

      // Clear existing content
      await element.fill('');

      // Type character by character with delays
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        await element.type(char);

        // Variable delay between characters
        const delay =
          Math.floor(
            Math.random() * (this.config.interaction.typeDelay.max - this.config.interaction.typeDelay.min + 1)
          ) + this.config.interaction.typeDelay.min;

        // Longer delays for spaces and punctuation
        const extraDelay = /[\s.,!?;:]/.test(char) ? delay * 0.5 : 0;

        await this.randomDelay(delay, delay + extraDelay);
      }

      this.logger.debug('Typing simulation completed', {
        selector,
        textLength: text.length,
      });
    } catch (error) {
      this.logger.error('Typing simulation failed', {
        selector,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Simulate clicking with human-like delay
   * @param {string} selector - Element selector to click
   * @param {Object} options - Click options
   */
  async simulateClick(selector, options = {}) {
    if (!this.config.interaction.enabled) {
      await this.page.click(selector, options);
      return;
    }

    try {
      const element = await this.page.$(selector);
      if (!element) {
        throw new Error(`Element not found: ${selector}`);
      }

      // Move to element first
      const boundingBox = await element.boundingBox();
      if (boundingBox) {
        const centerX = boundingBox.x + boundingBox.width / 2;
        const centerY = boundingBox.y + boundingBox.height / 2;
        await this.smoothMouseMove(centerX, centerY);
      }

      // Pre-click delay
      const delay =
        Math.floor(
          Math.random() * (this.config.interaction.clickDelay.max - this.config.interaction.clickDelay.min + 1)
        ) + this.config.interaction.clickDelay.min;

      await this.randomDelay(delay, delay * 1.5);

      // Perform click
      await element.click(options);

      this.logger.debug('Click simulation completed', { selector });
    } catch (error) {
      this.logger.error('Click simulation failed', {
        selector,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Generate random delay with natural distribution
   * @param {number} min - Minimum delay in milliseconds
   * @param {number} max - Maximum delay in milliseconds
   * @returns {Promise<void>}
   */
  async randomDelay(min, max) {
    // Use normal distribution for more natural delays
    const delay = this.generateNormalDelay(min, max);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Generate delay with normal distribution
   * @param {number} min - Minimum delay
   * @param {number} max - Maximum delay
   * @returns {number} Delay in milliseconds
   */
  generateNormalDelay(min, max) {
    // Box-Muller transformation for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    // Transform to desired range
    const mean = (min + max) / 2;
    const stdDev = (max - min) / 6; // 99.7% of values within range

    let delay = mean + z0 * stdDev;

    // Clamp to range
    delay = Math.max(min, Math.min(max, delay));

    return Math.round(delay);
  }

  /**
   * Enable or disable behavior simulation
   * @param {boolean} enabled - Whether to enable simulation
   */
  setSimulationEnabled(enabled) {
    this.isSimulationEnabled = enabled;
    this.logger.info('Behavior simulation toggled', { enabled });
  }

  /**
   * Update behavior configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Behavior simulation config updated', { newConfig });
  }

  /**
   * Get current simulation status
   * @returns {Object} Current status information
   */
  getStatus() {
    return {
      enabled: this.isSimulationEnabled,
      lastInteractionTime: this.lastInteractionTime,
      timeSinceLastInteraction: Date.now() - this.lastInteractionTime,
      mousePosition: { ...this.mousePosition },
      config: { ...this.config },
    };
  }

  /**
   * Reset simulation state
   */
  reset() {
    this.mousePosition = { x: 0, y: 0 };
    this.lastInteractionTime = Date.now();
    this.logger.info('Behavior simulation state reset');
  }
}
