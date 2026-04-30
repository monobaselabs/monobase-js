/**
 * Request middleware
 * Combines request ID generation/extraction and request logging
 */

import { Next } from 'hono';
import type { AppContext } from '@/types/app';
import type { Config } from '@/core/config';

/**
 * Create request ID middleware
 * Adds a unique ID to each request for distributed tracing
 */
export function createRequestId(config: Config) {
  return async function requestId(ctx: AppContext, next: Next) {
    const requestId = ctx.req.header('X-Request-ID') || crypto.randomUUID();
    ctx.set('requestId', requestId);
    ctx.header('X-Request-ID', requestId);
    await next();
  };
}

/**
 * Create request logging middleware
 * Logs request start, completion, status, and duration
 */
export function createRequestLogger(config: Config) {
  return async function requestLogger(ctx: AppContext, next: Next) {
    const start = Date.now();
    const logger = ctx.get('logger');
    const log = logger?.child({
      requestId: ctx.get('requestId'),
      method: ctx.req.method,
      path: ctx.req.path,
      query: ctx.req.query(),
    });

    log?.debug('Request started');

    await next();

    const duration = Date.now() - start;
    log?.info(
      {
        status: ctx.res.status,
        duration,
      },
      'Request completed'
    );
  };
}