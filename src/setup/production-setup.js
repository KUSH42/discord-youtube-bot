import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { google } from 'googleapis';
import express from 'express';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

// Infrastructure
import { Configuration } from '../infrastructure/configuration.js';
import { DependencyContainer } from '../infrastructure/dependency-container.js';
import { EventBus } from '../infrastructure/event-bus.js';
import { StateManager } from '../infrastructure/state-manager.js';

// Services
import { DiscordClientService } from '../services/implementations/discord-client-service.js';
import { YouTubeApiService } from '../services/implementations/youtube-api-service.js';
import { FetchHttpService } from '../services/implementations/fetch-http-service.js';

// Core Logic
import { CommandProcessor } from '../core/command-processor.js';
import { ContentClassifier } from '../core/content-classifier.js';
import { ContentAnnouncer } from '../core/content-announcer.js';

// Applications
import { BotApplication } from '../application/bot-application.js';
import { ScraperApplication } from '../application/scraper-application.js';
import { MonitorApplication } from '../application/monitor-application.js';

// Utils
import { DiscordTransport, createFileLogFormat, createConsoleLogFormat } from '../logger-utils.js';

/**
 * Set up all production services and dependencies
 * @param {DependencyContainer} container - Dependency container
 * @param {Configuration} config - Configuration instance
 * @returns {Promise<void>}
 */
export async function setupProductionServices(container, config) {
  // Register infrastructure services
  await setupInfrastructureServices(container, config);
  
  // Register external services
  await setupExternalServices(container, config);
  
  // Register core business logic
  await setupCoreServices(container, config);
  
  // Register application services
  await setupApplicationServices(container, config);
  
  // Set up logging
  await setupLogging(container, config);
  
  // Validate container
  container.validate();
}

/**
 * Set up infrastructure services
 */
async function setupInfrastructureServices(container, config) {
  // Configuration (already created)
  container.registerInstance('config', config);
  
  // Event Bus
  container.registerSingleton('eventBus', () => new EventBus());
  
  // State Manager with initial state
  container.registerSingleton('stateManager', () => {
    const state = new StateManager({
      botStartTime: new Date(),
      postingEnabled: true,
      announcementEnabled: config.getBoolean('ANNOUNCEMENT_ENABLED', false),
      vxTwitterConversionEnabled: config.getBoolean('X_VX_TWITTER_CONVERSION', false),
      logLevel: config.get('LOG_LEVEL', 'info')
    });
    return state;
  });
}

/**
 * Set up external services (Discord, YouTube, HTTP)
 */
async function setupExternalServices(container, config) {
  // Discord Client Service
  container.registerSingleton('discordService', () => {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ],
      partials: [Partials.Message, Partials.Channel, Partials.Reaction]
    });
    
    return new DiscordClientService(client);
  });
  
  // YouTube API Service
  container.registerSingleton('youtubeService', () => {
    const youtube = google.youtube({
      version: 'v3',
      auth: config.getRequired('YOUTUBE_API_KEY')
    });
    
    return new YouTubeApiService(youtube);
  });
  
  // HTTP Service
  container.registerSingleton('httpService', () => {
    return new FetchHttpService({
      timeout: 30000,
      headers: {
        'User-Agent': 'Discord-YouTube-Bot/1.0'
      }
    });
  });
  
  // Express App for webhooks
  container.registerSingleton('expressApp', () => {
    const app = express();
    
    // Middleware for raw body (needed for webhook signature verification)
    app.use('/youtube-webhook', express.raw({ type: 'application/atom+xml' }));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    
    return app;
  });
}

/**
 * Set up core business logic services
 */
async function setupCoreServices(container, config) {
  // Command Processor
  container.registerSingleton('commandProcessor', (c) => {
    return new CommandProcessor(
      c.resolve('config'),
      c.resolve('stateManager')
    );
  });
  
  // Content Classifier
  container.registerSingleton('contentClassifier', () => {
    return new ContentClassifier();
  });
  
  // Content Announcer
  container.registerSingleton('contentAnnouncer', (c) => {
    return new ContentAnnouncer(
      c.resolve('discordService'),
      c.resolve('config'),
      c.resolve('stateManager')
    );
  });
}

/**
 * Set up application services
 */
async function setupApplicationServices(container, config) {
  // Bot Application
  container.registerSingleton('botApplication', (c) => {
    return new BotApplication({
      discordService: c.resolve('discordService'),
      commandProcessor: c.resolve('commandProcessor'),
      eventBus: c.resolve('eventBus'),
      config: c.resolve('config'),
      stateManager: c.resolve('stateManager'),
      logger: c.resolve('logger')
    });
  });
  
  // Scraper Application (X/Twitter monitoring)
  container.registerSingleton('scraperApplication', (c) => {
    return new ScraperApplication({
      browserService: null, // Will be set up when needed
      contentClassifier: c.resolve('contentClassifier'),
      contentAnnouncer: c.resolve('contentAnnouncer'),
      config: c.resolve('config'),
      stateManager: c.resolve('stateManager'),
      eventBus: c.resolve('eventBus'),
      logger: c.resolve('logger')
    });
  });
  
  // Monitor Application (YouTube monitoring)
  container.registerSingleton('monitorApplication', (c) => {
    return new MonitorApplication({
      youtubeService: c.resolve('youtubeService'),
      httpService: c.resolve('httpService'),
      contentClassifier: c.resolve('contentClassifier'),
      contentAnnouncer: c.resolve('contentAnnouncer'),
      config: c.resolve('config'),
      stateManager: c.resolve('stateManager'),
      eventBus: c.resolve('eventBus'),
      logger: c.resolve('logger')
    });
  });
}

/**
 * Set up logging infrastructure
 */
async function setupLogging(container, config) {
  container.registerSingleton('logger', (c) => {
    const logLevel = config.get('LOG_LEVEL', 'info');
    const logFilePath = config.get('LOG_FILE_PATH', 'bot.log');
    
    // Create transports
    const transports = [
      // Console transport
      new winston.transports.Console({
        level: logLevel,
        format: createConsoleLogFormat()
      }),
      
      // File transport with rotation
      new winston.transports.DailyRotateFile({
        level: logLevel,
        filename: logFilePath.replace('.log', '-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '14d',
        format: createFileLogFormat()
      })
    ];
    
    // Add Discord transport if configured
    const supportChannelId = config.get('DISCORD_BOT_SUPPORT_LOG_CHANNEL');
    if (supportChannelId) {
      const discordService = c.resolve('discordService');
      transports.push(new DiscordTransport({
        level: 'warn', // Only send warnings and errors to Discord
        client: discordService.client,
        channelId: supportChannelId,
        flushInterval: 2000,
        maxBufferSize: 20
      }));
    }
    
    return winston.createLogger({
      level: logLevel,
      transports
    });
  });
}

/**
 * Set up webhook endpoints
 * @param {express.Application} app - Express application
 * @param {DependencyContainer} container - Dependency container
 */
export function setupWebhookEndpoints(app, container) {
  const monitorApplication = container.resolve('monitorApplication');
  const logger = container.resolve('logger');
  
  // YouTube PubSubHubbub webhook
  app.all('/youtube-webhook', async (req, res) => {
    try {
      const result = await monitorApplication.handleWebhook({
        method: req.method,
        headers: req.headers,
        query: req.query,
        body: req.body
      });
      
      res.status(result.status);
      if (result.body) {
        res.send(result.body);
      } else {
        res.send(result.message || 'OK');
      }
    } catch (error) {
      logger.error('Webhook error:', error);
      res.status(500).send('Internal Server Error');
    }
  });
  
  // Health check endpoints
  app.get('/health', (req, res) => {
    const botApp = container.resolve('botApplication');
    const status = botApp.getStatus();
    
    res.json({
      status: status.isRunning && status.isDiscordReady ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });
  
  app.get('/health/detailed', (req, res) => {
    const botApp = container.resolve('botApplication');
    const scraperApp = container.resolve('scraperApplication');
    const monitorApp = container.resolve('monitorApplication');
    
    res.json({
      bot: botApp.getStatus(),
      scraper: scraperApp.getStats(),
      monitor: monitorApp.getStats(),
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      }
    });
  });
  
  app.get('/ready', (req, res) => {
    const botApp = container.resolve('botApplication');
    const status = botApp.getStatus();
    
    if (status.isRunning && status.isDiscordReady) {
      res.status(200).send('Ready');
    } else {
      res.status(503).send('Not Ready');
    }
  });
}

/**
 * Graceful shutdown handler
 * @param {DependencyContainer} container - Dependency container
 * @returns {Function} Shutdown function
 */
export function createShutdownHandler(container) {
  return async (signal) => {
    const logger = container.resolve('logger');
    logger.info(`Received ${signal}, starting graceful shutdown...`);
    
    try {
      // Stop applications
      const botApp = container.resolve('botApplication');
      const scraperApp = container.resolve('scraperApplication');
      const monitorApp = container.resolve('monitorApplication');
      
      await Promise.all([
        botApp.stop(),
        scraperApp.stop(),
        monitorApp.stop()
      ]);
      
      // Dispose of container resources
      await container.dispose();
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  };
}