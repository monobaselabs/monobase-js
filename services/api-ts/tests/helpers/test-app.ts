/**
 * Test App Factory
 * Orchestrates test application setup with embedded app instances
 */

import { createTestSchema, type TestDatabase } from './test-db';
import { createApp, initializeApp, cleanupApp } from '@/app';
import { runMigrations } from '@/core/database';
import { ensureAdminUsers } from '@/utils/auth';
import type { App } from '@/types/app';
import type { Config } from '@/core/config';
import type { Server } from 'bun';
import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { startMswServer, stopMswServer, resetMswServer, mswTestData } from './msw-server';

/**
 * Get MinIO/S3 connection info
 * Uses TEST_STORAGE_* environment variables or defaults
 */
export function getStorageConfig() {
  return {
    endpoint: process.env.TEST_STORAGE_ENDPOINT || process.env.STORAGE_ENDPOINT || 'http://localhost:9000',
    accessKeyId: process.env.TEST_STORAGE_ACCESS_KEY_ID || process.env.STORAGE_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.TEST_STORAGE_SECRET_ACCESS_KEY || process.env.STORAGE_SECRET_ACCESS_KEY || 'minioadmin',
    bucket: process.env.TEST_STORAGE_BUCKET || process.env.STORAGE_BUCKET || 'monobase-test-files',
    region: process.env.TEST_STORAGE_REGION || process.env.STORAGE_REGION || 'us-east-1',
    forcePathStyle: true
  };
}

/**
 * Test application configuration
 */
export interface TestAppConfig {
  // Optional overrides
  auth?: {
    secret?: string;
    adminEmails?: string[];
  };
  storage?: boolean | ReturnType<typeof getStorageConfig>;
  corsOverrides?: Partial<Config['cors']>;
  email?: Partial<Config['email']>;
  // Start actual HTTP server (required for WebSocket tests)
  startServer?: boolean;
  // Add other config options as needed
}

/**
 * Test application instance
 */
export interface TestApp {
  database: TestDatabase;
  storage?: ReturnType<typeof getStorageConfig>;
  config: Config;
  app: App;
  server?: Server;
  port?: number;
  baseUrl: string;
  mockData: typeof mswTestData;
  resetMocks: () => void;
  cleanup: () => Promise<void>;
}

/**
 * Coordinate test app startup to prevent resource conflicts
 * Uses file-based locking to stagger concurrent test app creation
 */
async function coordinateTestAppStartup(maxConcurrent = 3): Promise<() => void> {
  const lockDir = join(tmpdir(), 'monobase-test-locks');
  const lockFile = join(lockDir, `test-app-${process.pid}-${Date.now()}.lock`);

  // Ensure lock directory exists
  if (!existsSync(lockDir)) {
    try {
      require('fs').mkdirSync(lockDir, { recursive: true });
    } catch (error) {
      // Ignore if directory already exists due to race condition
    }
  }

  // Wait for available slot
  while (true) {
    try {
      // Count existing lock files
      const lockFiles = require('fs').readdirSync(lockDir).filter((f: string) => f.endsWith('.lock'));

      // Clean up stale locks (older than 2 minutes)
      const now = Date.now();
      for (const file of lockFiles) {
        const filePath = join(lockDir, file);
        const stats = require('fs').statSync(filePath);
        if (now - stats.mtime.getTime() > 120000) {
          try {
            unlinkSync(filePath);
          } catch {
            // Ignore cleanup errors
          }
        }
      }

      // Recount after cleanup
      const activeLocks = require('fs').readdirSync(lockDir).filter((f: string) => f.endsWith('.lock'));

      if (activeLocks.length < maxConcurrent) {
        // Create our lock
        writeFileSync(lockFile, `${process.pid}-${Date.now()}`);

        // Return cleanup function
        return () => {
          try {
            unlinkSync(lockFile);
          } catch {
            // Ignore cleanup errors
          }
        };
      }

      // Wait a bit and try again
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    } catch (error) {
      // If we can't create locks, just proceed (fallback behavior)
      console.warn('Test app coordination failed, proceeding without locking:', error);
      return () => {}; // No-op cleanup
    }
  }
}

/**
 * Create a test application instance with embedded Hono app
 *
 * @param config Optional configuration overrides
 * @returns Test application instance with embedded app and cleanup method
 */
export async function createTestApp(options: TestAppConfig = {}): Promise<TestApp> {
  // Coordinate startup to prevent resource conflicts
  const releaseLock = await coordinateTestAppStartup();

  try {
    // Create isolated database schema using test-db helper
    const database = await createTestSchema();

    // Setup storage config if requested
    const storageOverrides = options.storage === true ? getStorageConfig() : options.storage;
    const storage = storageOverrides ? {
      provider: 'minio' as const,
      endpoint: storageOverrides.endpoint || 'http://localhost:9000',
      publicEndpoint: storageOverrides.endpoint || 'http://localhost:9000',
      bucket: storageOverrides.bucket || 'monobase-test-files',
      region: storageOverrides.region || 'us-east-1',
      credentials: {
        accessKeyId: storageOverrides.accessKeyId || 'minioadmin',
        secretAccessKey: storageOverrides.secretAccessKey || 'minioadmin',
      },
      uploadUrlExpiry: 300,
      downloadUrlExpiry: 900,
    } : undefined;

    // Find available port for embedded server (if needed)
    const findAvailablePort = async (): Promise<number> => {
      // Start from a high port number to avoid conflicts
      for (let port = 8000 + Math.floor(Math.random() * 1000); port < 9000; port++) {
        try {
          const server = Bun.serve({
            port,
            fetch: () => new Response('test'),
          });
          server.stop();
          return port;
        } catch {
          continue;
        }
      }
      throw new Error('No available ports found');
    };

    const port = await findAvailablePort();
    const baseUrl = `http://localhost:${port}`;

    // Build complete application configuration using test database
    const appConfig: Config = {
      // Server configuration
      server: {
        host: '127.0.0.1',
        port,
      },

      // Database configuration using test schema
      database: {
        url: `${database.url}?schema=${database.schemaName}`,
        poolMin: 2,
        poolMax: 10,
        idleTimeoutMs: 30000,
        ssl: false,
        logging: false,
      },

      // CORS configuration - permissive for tests (can be overridden)
      cors: {
        origins: options.corsOverrides?.origins ?? ['*'],
        credentials: options.corsOverrides?.credentials ?? true,
        allowLocalNetwork: options.corsOverrides?.allowLocalNetwork ?? true,
        allowTunneling: options.corsOverrides?.allowTunneling ?? true,
        strict: options.corsOverrides?.strict ?? false,
      },

      // Logging configuration
      logging: {
        level: 'error',
        pretty: false,
      },

      // Authentication configuration with admin emails
      auth: {
        baseUrl,
        secret: options.auth?.secret || 'test-secret-key-for-testing-only',
        sessionExpiresIn: 60 * 60 * 24 * 7, // 7 days
        rateLimitEnabled: false, // Disable for tests
        rateLimitWindow: 60,
        rateLimitMax: 1000,
        adminEmails: options.auth?.adminEmails || ['admin1@test.com', 'admin2@test.com', 'admin3@test.com'],
        socialProviders: undefined, // Disable social auth for tests
      },

      // Rate limiting configuration - disabled for tests
      rateLimit: {
        enabled: false,
        max: 1000,
      },

      // Storage configuration
      storage: storage || {
        provider: 'minio',
        endpoint: 'http://localhost:9000',
        publicEndpoint: 'http://localhost:9000',
        bucket: 'test-bucket',
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'minioadmin',
          secretAccessKey: 'minioadmin',
        },
        uploadUrlExpiry: 300,
        downloadUrlExpiry: 900,
      },

      // Billing configuration - mock for tests with MSW
      billing: {
        provider: 'stripe',
        stripe: {
          secretKey: 'sk_test_mock_key_for_msw_mocking',
          webhookSecret: 'whsec_mock_webhook_secret',
          connectWebhookUrl: baseUrl,
        },
      },

      // Email configuration - use SMTP pointing to Mailpit for actual email delivery testing (can be overridden)
      email: options.email || {
        provider: 'smtp',
        from: {
          name: 'Test Monobase',
          email: 'noreply@monobase.com'
        },
        smtp: {
          host: 'localhost',
          port: 1025,
          secure: false,
          auth: {
            user: '',
            pass: ''
          }
        },
      },

      // Notification configuration for tests - always enabled with MSW mocks
      notifs: {
        provider: 'onesignal',
        onesignal: {
          appId: 'test-app-id',
          apiKey: 'test-api-key'
        },
      },

      // WebRTC configuration for tests
      webrtc: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
        ],
      },
    };

    // Start MSW server for mocking external APIs
    startMswServer();

    // Create embedded Hono app instance
    const app = createApp(appConfig);

    // Initialize the app WITHOUT starting background jobs to avoid processing stale emails
    const { database: appDb, logger, email } = app;

    // Run database migrations
    logger.debug('Running database migrations...');
    await runMigrations(appDb);
    logger.debug('Database migrations completed successfully');

    // Initialize email templates
    logger.debug('Initializing email templates...');
    await email.initializeDefaultTemplates();
    logger.debug('Email templates initialized successfully');

    // Setup admin users if configured
    if (appConfig.auth.adminEmails && appConfig.auth.adminEmails.length > 0) {
      logger.debug('Setting up admin users...');
      const promotedEmails = await ensureAdminUsers(appDb, appConfig.auth.adminEmails);
      if (promotedEmails.length > 0) {
        logger.info({ promotedEmails }, `Promoted ${promotedEmails.length} users to admin role`);
      } else {
        logger.debug('No existing users found to promote to admin role');
      }
      logger.debug('Admin user setup completed successfully');
    }

    // NOTE: We intentionally DO NOT start the job scheduler in tests
    // to prevent processing of stale emails from the queue

    // Start actual HTTP server if requested (required for WebSocket tests)
    let server: Server | undefined;
    if (options.startServer) {
      logger.debug(`Starting HTTP server on port ${port} for WebSocket tests...`);
      server = Bun.serve({
        port,
        hostname: '127.0.0.1',
        fetch: app.fetch.bind(app),
        websocket: app.ws.websocket, // Use Hono's WebSocket handler from createBunWebSocket
      });
      logger.debug(`HTTP server started on http://${server.hostname}:${server.port}`);
    }

    // Release the startup coordination lock after successful setup
    releaseLock();

    return {
      database,
      storage: storageOverrides,
      config: appConfig,
      app,
      server,
      billing: app.billing,
      port,
      baseUrl,
      mockData: mswTestData,
      resetMocks: () => {
        mswTestData.reset();
        resetMswServer();
      },
      cleanup: async () => {
        // Stop HTTP server if running
        if (server) {
          logger.debug('Stopping HTTP server...');
          server.stop();

          // Wait for WebSocket connections to fully close
          // This prevents "Cannot use a pool after calling end" errors
          await new Promise(resolve => setTimeout(resolve, 100));
          logger.debug('HTTP server stopped');
        }

        // Stop MSW server
        stopMswServer();

        // Clean up app resources
        await cleanupApp(app);

        // Clean up database
        await database.cleanup();
      }
    };
  } catch (error) {
    // If setup fails, ensure we release the lock
    releaseLock();
    throw error;
  }
}

/**
 * Helper to get API URL for E2E tests
 * @deprecated Use embedded app instances instead of external URLs
 * Can be used when testing against a running API instance
 */
export function getApiUrl(): string {
  return process.env.TEST_API_URL || process.env.API_URL || 'http://localhost:7213';
}

/**
 * Wait for services to be healthy
 * @deprecated Use embedded app instances instead of external health checks
 */
export async function waitForServices(maxRetries = 30, delayMs = 1000): Promise<void> {
  const apiUrl = getApiUrl();

  for (let i = 0; i < maxRetries; i++) {
    try {
      // Check API health
      const response = await fetch(`${apiUrl}/livez`, {
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        // Check readiness (includes database and storage)
        const readyResponse = await fetch(`${apiUrl}/readyz`, {
          signal: AbortSignal.timeout(5000)
        });

        if (readyResponse.ok) {
          return; // All services healthy
        }
      }
    } catch {
      // Continue retrying
    }

    if (i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(`Services did not become healthy after ${maxRetries} attempts`);
}

// Re-export TestDatabase type for convenience
export type { TestDatabase } from './test-db';
