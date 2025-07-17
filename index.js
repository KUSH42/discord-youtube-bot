// index.js - Modern Discord YouTube Bot Entry Point
// © 2025 Marco Keller. All rights reserved. This software and its content are proprietary and confidential. Unauthorized reproduction or distribution is strictly prohibited.

import { config } from '@dotenvx/dotenvx';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { pathToFileURL } from 'url';

// Infrastructure
import { Configuration } from './src/infrastructure/configuration.js';
import { DependencyContainer } from './src/infrastructure/dependency-container.js';

// Setup
import { 
  setupProductionServices, 
  setupWebhookEndpoints, 
  createShutdownHandler 
} from './src/setup/production-setup.js';

// Load environment variables with encryption support
config();

/**
 * Main application entry point
 */
async function main() {
  let container, logger;
  
  try {
    // Initialize configuration
    const configuration = new Configuration();
    
    // Create dependency container
    container = new DependencyContainer();
    
    // Set up all services
    await setupProductionServices(container, configuration);
    
    // Get logger early for error reporting
    logger = container.resolve('logger');
    logger.info('🚀 Starting Discord YouTube Bot...');
    
    // Start core applications
    await startApplications(container, configuration);
    
    // Set up web server for webhooks
    await startWebServer(container, configuration);
    
    // Set up graceful shutdown
    setupGracefulShutdown(container);
    
    logger.info('✅ Discord YouTube Bot started successfully');
    
  } catch (error) {
    if (logger) {
      logger.error('❌ Failed to start bot:', error);
    } else {
      console.error('❌ Failed to start bot:', error);
    }
    
    // Clean up on error
    if (container) {
      try {
        await container.dispose();
      } catch (disposeError) {
        console.error('Error during cleanup:', disposeError);
      }
    }
    
    process.exit(1);
  }
}

/**
 * Start core applications (Bot, Monitor, Scraper)
 */
async function startApplications(container, config) {
  const logger = container.resolve('logger').child({ service: 'Main' });
  
  // Start Discord Bot
  const botApp = container.resolve('botApplication');
  await botApp.start();
  
  // Start YouTube Monitor
  const monitorApp = container.resolve('monitorApplication');
  await monitorApp.start();
  
  // Start X Scraper (if enabled)
  const xUser = config.get('X_USER_HANDLE');
  if (xUser) {
    try {
      const scraperApp = container.resolve('scraperApplication');
      await scraperApp.start();
    } catch (error) {
      logger.error('Failed to start X Scraper application:', error.message);
      logger.warn('X Scraper will be disabled - YouTube monitoring will continue normally');
    }
  } else {
    logger.info('X Scraper disabled (no X_USER_HANDLE configured)');
  }
}

/**
 * Start web server for webhooks and health checks
 */
async function startWebServer(container, config) {
  const logger = container.resolve('logger');
  const app = container.resolve('expressApp');
  
  // Set up rate limiting
  const webhookLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP',
    standardHeaders: true,
    legacyHeaders: false
  });
  
  const commandLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // Limit each IP to 5 requests per minute
    message: 'Too many commands from this IP',
    standardHeaders: true,
    legacyHeaders: false
  });
  
  // Apply rate limiting to webhook endpoints
  app.use('/youtube-webhook', webhookLimiter);
  app.use('/api/', commandLimiter);
  
  // Set up webhook endpoints
  setupWebhookEndpoints(app, container);
  
  // Error handling middleware
  app.use((error, req, res, next) => {
    logger.error('Express error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  });
  
  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });
  
  // Start server
  const port = config.get('PSH_PORT', 3000);
  const server = app.listen(port, () => {
    logger.info(`🌐 Web server listening on port ${port}`);
  });
  
  // Store server reference for graceful shutdown
  container.registerInstance('httpServer', server);
}

/**
 * Set up graceful shutdown handlers
 */
function setupGracefulShutdown(container) {
  const shutdownHandler = createShutdownHandler(container);
  
  // Handle various shutdown signals
  process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
  process.on('SIGINT', () => shutdownHandler('SIGINT'));
  process.on('SIGUSR1', () => shutdownHandler('SIGUSR1'));
  process.on('SIGUSR2', () => shutdownHandler('SIGUSR2'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    const logger = container.resolve('logger');
    logger.error('Uncaught Exception:', error);
    shutdownHandler('uncaughtException');
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    const logger = container.resolve('logger');
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    shutdownHandler('unhandledRejection');
  });
}

// Only run when executed directly (not imported in tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export for testing
export { main };