/**
 * Dependency injection middleware
 * Injects core dependencies into request context
 */

import { Next } from 'hono';
import type { AppContext, App } from '@/types/app';
import type { Config } from '@/core/config';

/**
 * Create dependency injection middleware
 * Injects logger, database, storage, auth instances, job scheduler, notification service, audit service, and config into request context for handler access
 */
export function createDependencyInjection(app: App, config: Config) {
  const { logger, database, storage, auth, jobs, notifs, audit, email, ws, billing } = app;
  const internalServiceToken = (app as any).internalServiceToken;

  return async function dependencyInjection(ctx: AppContext, next: Next) {
    // Inject dependencies into request context
    ctx.set('app', app);
    ctx.set('logger', logger);
    ctx.set('database', database);
    ctx.set('auth', auth);
    ctx.set('storage', storage);
    ctx.set('jobs', jobs);
    ctx.set('notifs', notifs);
    ctx.set('audit', audit);
    ctx.set('email', email);
    ctx.set('ws', ws);
    ctx.set('billing', billing);
    ctx.set('config', config);
    ctx.set('internalServiceToken', internalServiceToken);

    await next();
  };
}
