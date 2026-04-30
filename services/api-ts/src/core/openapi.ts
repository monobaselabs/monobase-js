/**
 * OpenAPI Documentation Module
 * Handles registration of API documentation routes with support for multiple OpenAPI specs
 */

import { Hono } from 'hono';
import { Scalar } from '@scalar/hono-api-reference';
import type { Logger } from '@/types/logger';

/**
 * Normalize allOf by merging schemas according to OpenAPI composition rules
 * @param obj - The object to normalize (spec, schema, or any nested object)
 * @param rootSpec - The root OpenAPI spec for resolving $ref
 * @returns The normalized object with allOf arrays merged
 */
function normalizeAllOf(obj: any, rootSpec: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays by normalizing each element
  if (Array.isArray(obj)) {
    return obj.map(item => normalizeAllOf(item, rootSpec));
  }

  // Check if this object has an allOf property
  const hasAllOf = obj.allOf && Array.isArray(obj.allOf);

  if (hasAllOf) {
    // Process allOf schemas - merge them all into a single schema
    let mergedAllOf: any = {};
    
    for (const schema of obj.allOf) {
      // Resolve $ref if present
      const resolved = resolveRef(schema, rootSpec);
      
      // Recursively normalize the resolved schema first
      const normalized = normalizeAllOf(resolved, rootSpec);
      
      // Merge with accumulated result
      mergedAllOf = mergeSchemas(mergedAllOf, normalized);
    }

    // Create a new object with all non-allOf properties
    const objWithoutAllOf: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key !== 'allOf') {
        // Recursively normalize nested objects
        objWithoutAllOf[key] = normalizeAllOf(value, rootSpec);
      }
    }

    // Merge the allOf result with the existing properties
    // Existing properties take precedence over allOf properties
    const merged = mergeSchemas(mergedAllOf, objWithoutAllOf);

    return merged;
  } else {
    // No allOf, just recursively normalize nested objects
    const normalized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      normalized[key] = normalizeAllOf(value, rootSpec);
    }
    return normalized;
  }
}

/**
 * Resolve a $ref to its actual schema
 * @param schema - Schema that might contain a $ref
 * @param rootSpec - The root OpenAPI spec
 * @returns The resolved schema
 */
function resolveRef(schema: any, rootSpec: any): any {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  if (schema.$ref && typeof schema.$ref === 'string') {
    // Parse the $ref path
    const refPath = schema.$ref.replace(/^#\//, '').split('/');

    // Navigate to the referenced schema
    let resolved = rootSpec;
    for (const segment of refPath) {
      resolved = resolved?.[segment];
      if (!resolved) {
        console.warn(`Could not resolve $ref: ${schema.$ref}`);
        return schema;
      }
    }

    // Copy any additional properties from the original schema
    // (e.g., description that might be alongside the $ref)
    const result = { ...resolved };
    for (const [key, value] of Object.entries(schema)) {
      if (key !== '$ref' && !(key in result)) {
        result[key] = value;
      }
    }

    return result;
  }

  return schema;
}

/**
 * Merge two schemas according to OpenAPI rules
 * @param base - Base schema
 * @param override - Schema to merge into base
 * @returns The merged schema
 */
function mergeSchemas(base: any, override: any): any {
  // If either is not an object, override wins
  if (!base || typeof base !== 'object' || Array.isArray(base)) {
    return override;
  }
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    return override;
  }

  const merged = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (key === 'properties' && merged.properties) {
      // Merge properties objects
      merged.properties = {
        ...merged.properties,
        ...value as any
      };
    } else if (key === 'required' && merged.required) {
      // Concatenate and deduplicate required arrays
      const combined = [...(merged.required || []), ...(value as any[] || [])];
      merged.required = [...new Set(combined)];
    } else {
      // For other fields, override wins
      merged[key] = value;
    }
  }

  return merged;
}

/**
 * Merge multiple OpenAPI specifications into a single spec
 * Combines paths, components, tags, and other top-level properties
 */
function mergeOpenAPISpecs(specs: any[], config?: any): any {
  if (specs.length === 0) {
    throw new Error('At least one OpenAPI spec is required');
  }

  if (specs.length === 1) {
    // Even for a single spec, normalize allOf
    const spec = specs[0];
    return normalizeAllOf(spec, spec);
  }

  // Start with the first spec as base
  const merged = { ...specs[0] };

  // Merge remaining specs
  for (let i = 1; i < specs.length; i++) {
    const spec = specs[i];
    
    // Merge paths
    if (spec.paths) {
      merged.paths = {
        ...(merged.paths || {}),
        ...spec.paths,
      };
    }

    // Merge components
    if (spec.components) {
      merged.components = {
        schemas: {
          ...(merged.components?.schemas || {}),
          ...(spec.components.schemas || {}),
        },
        securitySchemes: {
          ...(merged.components?.securitySchemes || {}),
          ...(spec.components.securitySchemes || {}),
        },
        parameters: {
          ...(merged.components?.parameters || {}),
          ...(spec.components.parameters || {}),
        },
        responses: {
          ...(merged.components?.responses || {}),
          ...(spec.components.responses || {}),
        },
        requestBodies: {
          ...(merged.components?.requestBodies || {}),
          ...(spec.components.requestBodies || {}),
        },
      };
    }

    // Merge tags (avoid duplicates)
    if (spec.tags) {
      const existingTags = new Set((merged.tags || []).map((t: any) => t.name));
      const newTags = spec.tags.filter((tag: any) => !existingTags.has(tag.name));
      merged.tags = [...(merged.tags || []), ...newTags];
    }

    // Merge security requirements
    if (spec.security) {
      merged.security = [...(merged.security || []), ...spec.security];
    }
  }

  // Sort tags with priority order: health, auth, then alphabetical
  if (merged.tags) {
    const priorityTags = ['health', 'auth']; // Define priority order
    
    merged.tags.sort((a: any, b: any) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      
      const priorityA = priorityTags.indexOf(nameA);
      const priorityB = priorityTags.indexOf(nameB);
      
      // Both have priority - sort by priority order
      if (priorityA !== -1 && priorityB !== -1) {
        return priorityA - priorityB;
      }
      
      // Only A has priority - A comes first
      if (priorityA !== -1) {
        return -1;
      }
      
      // Only B has priority - B comes first  
      if (priorityB !== -1) {
        return 1;
      }
      
      // Neither has priority - sort alphabetically
      return nameA.localeCompare(nameB);
    });
  }

  // Enhance servers with local and public options
  const existingServers = merged.servers || [];
  const servers = [];
  
  // Always add local development server at the beginning
  const port = config?.server?.port || process.env['PORT'] || '7213';
  const host = config?.server?.host || 'localhost';
  const localUrl = `http://${host}:${port}`;
  servers.push({
    url: localUrl,
    description: 'Local development server',
  });
  
  // Add existing servers from the specs
  servers.push(...existingServers);
  
  // Add public server if configured and not already present
  if (config?.server?.publicUrl) {
    const publicUrl = config.server.publicUrl;
    const urlExists = servers.some((s: any) => s.url === publicUrl);
    
    if (!urlExists) {
      servers.push({
        url: publicUrl,
        description: 'Public server',
      });
    }
  }

  merged.servers = servers;

  // Normalize allOf patterns in the merged spec before returning
  const normalized = normalizeAllOf(merged, merged);

  return normalized;
}

/**
 * Register OpenAPI documentation routes
 * 
 * @param app - Hono application instance
 * @param specs - Array of OpenAPI specifications to merge and serve
 * @param config - Optional configuration for server settings
 */
export function registerRoutes(app: any, specs: any[], config?: any): void {
  const logger = app.logger as Logger | undefined;

  // Merge all provided specs
  const mergedSpec = mergeOpenAPISpecs(specs, config);
  
  if (logger) {
    logger.debug(
      { 
        specsCount: specs.length,
        totalPaths: Object.keys(mergedSpec.paths || {}).length,
        tags: mergedSpec.tags?.map((t: any) => t.name),
      },
      'Merged OpenAPI specifications for documentation'
    );
  }

  // API Documentation UI
  app.get(
    '/docs',
    Scalar({
      url: '/docs/openapi.json',
      title: 'Monobase API Documentation',
      layout: 'modern',
      theme: 'bluePlanet',
      hideModels: true,
      metaData: {
        title: 'Monobase API Documentation - Modern Application Platform',
        description:
          'Comprehensive API documentation for Monobase application platform. RESTful APIs for person management, communications, file storage, notifications, and more.',
        ogTitle: 'Monobase API Documentation',
        ogDescription:
          'Modern application platform with enterprise security and audit compliance',
      },
    }),
  );

  // Serve merged OpenAPI spec
  app.get('/docs/openapi.json', (c: any) => c.json(mergedSpec));

  if (logger) {
    logger.debug('Registered OpenAPI documentation routes at /docs');
  }
}