/**
 * Health check endpoints for Kubernetes liveness and readiness probes
 * Provides standardized health endpoints following Kubernetes conventions
 */

import type { App } from '@/types/app';
import { checkDatabaseConnection } from '@/core/database';

/**
 * Register health check endpoints with the Hono app
 * Implements Kubernetes-compliant health check endpoints
 */
export function registerRoutes(app: App): void {
  const { database, storage, jobs, logger } = app;

  // Liveness probe - simple "is app alive?" check
  app.get('/livez', async (ctx) => {
    // Lightweight check - just verify the app process is running
    // No external dependency checks to avoid false negatives
    const isVerbose = ctx.req.query('verbose') !== undefined;
    
    if (isVerbose) {
      // RFC-compliant verbose response
      return ctx.json({
        status: 'pass',
        timestamp: new Date().toISOString(),
        checks: {
          ping: 'pass'
        }
      }, 200, {
        'Content-Type': 'application/health+json'
      });
    }
    
    // Kubernetes standard: simple text response
    ctx.header('Content-Type', 'text/plain');
    return ctx.text('ok', 200);
  });

  // Readiness probe - comprehensive "can app serve traffic?" check
  app.get('/readyz', async (ctx) => {
    const dbHealthy = await checkDatabaseConnection(database, logger);
    const storageHealthy = await storage.healthCheck();
    const jobsHealth = await jobs.getHealth();
    const jobsHealthy = jobsHealth.healthy;
    
    const allHealthy = dbHealthy && storageHealthy && jobsHealthy;
    const isVerbose = ctx.req.query('verbose') !== undefined;
    
    if (isVerbose) {
      // RFC-compliant verbose response
      return ctx.json({
        status: allHealthy ? 'pass' : 'fail',
        timestamp: new Date().toISOString(),
        checks: {
          database: dbHealthy ? 'pass' : 'fail',
          storage: storageHealthy ? 'pass' : 'fail',
          jobs: jobsHealthy ? 'pass' : 'fail',
        }
      }, allHealthy ? 200 : 503, {
        'Content-Type': 'application/health+json'
      });
    }
    
    // Kubernetes standard: simple text response
    ctx.header('Content-Type', 'text/plain');
    return ctx.text(allHealthy ? 'ok' : 'failed', allHealthy ? 200 : 503);
  });

}