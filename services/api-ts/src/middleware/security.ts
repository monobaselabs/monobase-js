/**
 * Security middleware
 * Provides security headers and CORS configuration
 */

import { secureHeaders } from 'hono/secure-headers';
import { cors } from 'hono/cors';
import type { Config } from '@/core/config';
import type { Logger } from '@/types/logger';
import { createOriginValidator } from '@/utils/cors';

/**
 * Create security headers middleware
 * Adds CSP, HSTS, X-Frame-Options, and other security headers
 */
export function createSecurityHeaders(config: Config) {
  // Return Hono's secureHeaders middleware configured with defaults
  // Can be extended with config-based customization if needed
  return secureHeaders();
}

/**
 * Create CORS middleware with dynamic origin validation
 * Configures allowed origins, methods, headers, and credentials
 */
export function createCorsMiddleware(config: Config, logger?: Logger) {
  const originValidator = createOriginValidator(config.cors, logger);

  const corsConfig = {
    origin: originValidator,
    credentials: config.cors.credentials,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-API-Key'],
    exposeHeaders: ['X-Request-ID'],
    maxAge: 600,
  };

  // Log the CORS configuration being applied if logger is provided
  if (logger) {
    logger.debug({
      corsSettings: {
        allowLocalNetwork: config.cors.allowLocalNetwork,
        allowTunneling: config.cors.allowTunneling,
        strict: config.cors.strict,
        explicitOrigins: config.cors.origins,
      },
      credentials: corsConfig.credentials,
      allowMethods: corsConfig.allowMethods,
      allowHeaders: corsConfig.allowHeaders,
    }, 'CORS middleware configured with dynamic origin validation');
  }

  return cors(corsConfig);
}