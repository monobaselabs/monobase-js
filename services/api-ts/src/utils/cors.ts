/**
 * CORS utility functions for dynamic origin validation
 * Provides flexible origin matching based on configuration flags
 */

import type { Config } from '@/core/config';
import type { Logger } from '@/types/logger';
import type { Context } from 'hono';

/**
 * Local network IP patterns for development
 */
const LOCAL_NETWORK_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
  /^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,
  /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+(:\d+)?$/,
  /^https?:\/\/[\w-]+\.local(:\d+)?$/,
];

/**
 * Tunneling service patterns for development
 */
const TUNNELING_PATTERNS = [
  /^https:\/\/[\w-]+\.ngrok\.io$/,
  /^https:\/\/[\w-]+\.ngrok-free\.app$/,
  /^https:\/\/[\w-]+\.loca\.lt$/,
  /^https:\/\/[\w-]+\.trycloudflare\.com$/,
  /^https:\/\/[\w-]+\.localhost\.run$/,
];

/**
 * Check if origin matches local network patterns
 */
function matchesLocalNetwork(origin: string): boolean {
  return LOCAL_NETWORK_PATTERNS.some(pattern => pattern.test(origin));
}

/**
 * Check if origin matches tunneling service patterns
 */
function matchesTunneling(origin: string): boolean {
  return TUNNELING_PATTERNS.some(pattern => pattern.test(origin));
}

/**
 * Create dynamic origin validator based on configuration
 */
export function createOriginValidator(corsConfig: Config['cors'], logger?: Logger) {
  return (origin: string, context: Context): string => {
    // Handle non-browser requests (no origin header) or empty origin
    if (!origin) {
      // Return first explicit origin or fallback to wildcard
      return corsConfig.origins.includes('*') ? '*' : (corsConfig.origins[0] || '*');
    }

    // In strict mode, only use explicit origins list
    if (corsConfig.strict) {
      const isAllowed = corsConfig.origins.includes(origin) || corsConfig.origins.includes('*');
      if (logger && !isAllowed) {
        logger.debug({ origin, mode: 'strict' }, 'CORS: Blocked origin in strict mode');
      }
      return isAllowed ? origin : corsConfig.origins[0] || '*';
    }

    // Check explicit origins first (including wildcard)
    if (corsConfig.origins.includes(origin) || corsConfig.origins.includes('*')) {
      return origin;
    }

    // Check local network patterns if enabled
    if (corsConfig.allowLocalNetwork && matchesLocalNetwork(origin)) {
      if (logger) {
        logger.debug({ origin, pattern: 'local-network' }, 'CORS: Allowing local network origin');
      }
      return origin;
    }

    // Check tunneling patterns if enabled
    if (corsConfig.allowTunneling && matchesTunneling(origin)) {
      if (logger) {
        logger.debug({ origin, pattern: 'tunneling' }, 'CORS: Allowing tunneling service origin');
      }
      return origin;
    }

    // Block unmatched origins - return safe default
    if (logger) {
      logger.debug({
        origin,
        allowLocalNetwork: corsConfig.allowLocalNetwork,
        allowTunneling: corsConfig.allowTunneling,
        strict: corsConfig.strict
      }, 'CORS: Blocked unmatched origin, using fallback');
    }

    // Return first allowed origin or wildcard as fallback
    return corsConfig.origins.includes('*') ? '*' : (corsConfig.origins[0] || '*');
  };
}

/**
 * Create list of allowed origins for Better-Auth trustedOrigins
 * Builds a comprehensive list based on configuration flags
 * Returns wildcard string patterns (Better-Auth does not support RegExp)
 *
 * IMPORTANT: Better-Auth trustedOrigins limitations:
 * - Does not support RegExp patterns
 * - Supports wildcard strings like "https://*.example.com"
 * - Cannot use wildcards for IP addresses (e.g., "http://192.168.*.*" won't work)
 *
 * LAN Network Support (192.168.*, 10.*, 172.*):
 * - Hono CORS middleware uses RegExp patterns and WILL accept these origins
 * - Better-Auth trustedOrigins cannot enumerate all possible LAN IPs
 * - For production, use explicit origins or tunneling services
 * - For development with LAN access, ensure CORS middleware handles validation
 */
export function createTrustedOriginsList(corsConfig: Config['cors']): string[] {
  const trustedOrigins: string[] = [...corsConfig.origins];

  // In strict mode, only return explicit origins
  if (corsConfig.strict) {
    return trustedOrigins;
  }

  // Add local network patterns if enabled
  if (corsConfig.allowLocalNetwork) {
    trustedOrigins.push(
      'http://localhost',
      'https://localhost',
      'http://127.0.0.1',
      'https://127.0.0.1',
    );

    // Add common development ports
    const commonPorts = [3000, 3001, 5173, 8080, 8000, 4000];
    commonPorts.forEach(port => {
      trustedOrigins.push(
        `http://localhost:${port}`,
        `https://localhost:${port}`,
        `http://127.0.0.1:${port}`,
        `https://127.0.0.1:${port}`,
      );
    });
  }

  // Add tunneling patterns if enabled (as wildcard strings for Better-Auth)
  if (corsConfig.allowTunneling) {
    trustedOrigins.push(
      "https://*.ngrok.io",
      "https://*.ngrok-free.app",
      "https://*.loca.lt",
      "https://*.trycloudflare.com",
      "https://*.localhost.run",
    );
  }

  return trustedOrigins;
}

/**
 * Determine optimal cookie configuration based on CORS settings
 */
export function determineCookieConfig(corsConfig: Config['cors'], authConfig: Config['auth']) {
  // If explicit cookie settings provided, use them
  if (authConfig.cookieSameSite && authConfig.secureCookies !== undefined) {
    return {
      sameSite: authConfig.cookieSameSite,
      secure: authConfig.secureCookies,
    };
  }

  // In strict mode with no cross-origin, use secure defaults
  if (corsConfig.strict) {
    return {
      sameSite: 'lax' as const,
      secure: authConfig.secureCookies ?? false,
    };
  }

  // For cross-origin scenarios (local network or tunneling enabled), use permissive settings
  if (corsConfig.allowLocalNetwork || corsConfig.allowTunneling) {
    return {
      sameSite: 'none' as const,
      secure: corsConfig.allowTunneling ? true : false, // Tunneling requires HTTPS
    };
  }

  // Default fallback
  return {
    sameSite: 'lax' as const,
    secure: authConfig.secureCookies ?? false,
  };
}