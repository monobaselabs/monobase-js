/**
 * Auto-Expand Middleware
 *
 * Hono middleware that automatically expands related resources in API responses
 * based on the `expand` query parameter.
 *
 * Uses OpenAPI metadata (x-expandable-field with opId) to determine which fields
 * can be expanded and makes internal HTTP requests to fetch expanded data with
 * proper authorization and business logic enforcement.
 */

import { createMiddleware } from 'hono/factory';
import { applyExpands } from '@/utils/expand';

const MAX_EXPAND_DEPTH = 4;

/**
 * Create expand middleware for a specific response schema
 *
 * @param schemaName - The OpenAPI schema name for the response (e.g., "Invoice", "Person")
 * @returns Hono middleware that transforms responses with expand support
 */
export function createExpandMiddleware(schemaName: string) {
  return createMiddleware(async (c, next) => {
    // Let the handler execute first
    await next();

    // Check if this is an internal expand request (prevent recursion)
    if (c.req.header('X-Expand-Context')) {
      return; // Don't expand internal requests
    }

    // Check if expand parameter is present
    const expandParam = c.req.query("expand");
    if (!expandParam) {
      return; // No expansion requested
    }

    // Check if response is JSON
    const contentType = c.res.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return; // Not JSON, can't expand
    }

    try {
      // Clone and parse the response
      const clonedRes = c.res.clone();
      const originalData = await clonedRes.json();

      // Parse and validate expand parameters
      const expandPaths = parseExpandParams(expandParam);
      const maxDepth = Math.max(...expandPaths.map(p => p.depth));

      if (maxDepth > MAX_EXPAND_DEPTH) {
        c.get('logger')?.warn(
          { maxDepth, limit: MAX_EXPAND_DEPTH },
          'Expand depth exceeds limit, skipping expansion'
        );
        return;
      }

      // Apply expansions using internal HTTP requests
      const expandedData = await applyExpands(
        originalData,
        expandPaths,
        schemaName,
        c
      );

      // Replace response with expanded data
      c.res = new Response(
        JSON.stringify(expandedData),
        {
          status: c.res.status,
          statusText: c.res.statusText,
          headers: c.res.headers
        }
      );
    } catch (error) {
      // On error, leave original response unchanged
      c.get('logger')?.error(
        { error, schemaName, expandParam },
        'Expand transformation failed, returning original response'
      );
    }
  });
}

interface ExpandPath {
  segments: string[];
  depth: number;
}

function parseExpandParams(expand: string): ExpandPath[] {
  const expandArray = expand.split(',').map(s => s.trim()).filter(Boolean);

  return expandArray.map(path => ({
    segments: path.split('.'),
    depth: path.split('.').length
  }));
}
