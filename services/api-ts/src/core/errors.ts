/**
 * Application error classes and comprehensive error handling
 * Provides error types and centralized error handling with proper HTTP status codes
 */

import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Config } from '@/core/config';
import type { App } from '@/types/app';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    message: string,
    public code: string = 'INTERNAL_ERROR',
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
  }
}


export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed') {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class BusinessLogicError extends AppError {
  constructor(message: string, code: string = 'BUSINESS_ERROR') {
    super(message, code, 422);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 'CONFLICT', 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', details?: { retryAfter?: number }) {
    super(message, 'RATE_LIMIT', 429, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed', scheme?: string, supportedSchemes?: string[]) {
    super(message, 'AUTHENTICATION_ERROR', 401, { scheme, supportedSchemes });
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions', requiredPermission?: string, userPermissions?: string[], resource?: string) {
    super(message, 'AUTHORIZATION_ERROR', 403, { requiredPermission, userPermissions, resource });
  }
}

export class HipaaComplianceError extends AppError {
  constructor(message: string, hipaaRule: string, violationType: 'privacy' | 'security' | 'breach' | 'access-control', auditLog?: string, remediationRequired?: string[]) {
    super(message, 'HIPAA_COMPLIANCE_ERROR', 400, { hipaaRule, violationType, auditLog, remediationRequired });
  }
}

export class TimeoutError extends AppError {
  constructor(message: string = 'Operation timed out', timeoutMs: number, operation?: string, retryable: boolean = false) {
    super(message, 'TIMEOUT_ERROR', 408, { timeoutMs, operation, retryable });
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, service: string, operation?: string, externalCode?: string, externalMessage?: string, retryable: boolean = false, retryAfter?: number) {
    super(message, 'EXTERNAL_SERVICE_ERROR', 503, { service, operation, externalCode, externalMessage, retryable, retryAfter });
  }
}

export interface NotFoundErrorOptions {
  resourceType?: string;
  resource?: string;
  suggestions?: string[];
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', opts?: NotFoundErrorOptions) {
    super(message, 'NOT_FOUND', 404, opts);
  }
}

/**
 * Security filtering utility to remove sensitive fields in production
 */
function applySecurity(obj: Record<string, any>, config?: Config): Record<string, any> {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDebugMode = config?.logging?.level === 'debug';
  
  if (!isProduction || isDebugMode) {
    return obj; // No filtering in development or debug mode
  }
  
  // Filter out potentially sensitive fields in production
  const filtered = { ...obj };
  
  // Remove internal implementation details
  delete filtered['trackingId'];
  delete filtered['context'];
  delete filtered['value']; // Field values from validation errors
  
  // Keep essential fields for client handling
  return filtered;
}

/**
 * Helper to create base error fields for all error responses
 * Applies security filtering based on configuration
 */
function createBaseErrorFields(c: Context, err: { message: string; code?: string }, statusCode: number, config?: Config) {
  const timestamp = new Date().toISOString();
  const requestId = c.get('requestId' as any) || c.req.header('X-Request-ID') || crypto.randomUUID();
  
  const isProduction = process.env.NODE_ENV === 'production';
  const isDebugMode = config?.logging?.level === 'debug';
  
  return {
    message: err.message,
    code: err.code || 'UNKNOWN_ERROR',
    requestId,
    timestamp,
    path: isProduction && !isDebugMode ? undefined : c.req.path,
    method: isProduction && !isDebugMode ? undefined : c.req.method,
    statusCode,
  };
}

/**
 * Create a comprehensive error handler for app.onError
 * Handles various error types with consistent formatting and logging
 * Returns responses matching TypeSpec error models
 */
export function createErrorHandler(config: Config) {
  return (err: Error, c: Context) => {
    // Get logger from context (injected by dependency middleware)
    const logger = c.get('logger' as any);
    const timestamp = new Date().toISOString();
    const requestId = c.get('requestId' as any) || c.req.header('X-Request-ID') || crypto.randomUUID();
    
    // Create a child logger with request context
    const log = logger?.child({
      path: c.req.path,
      method: c.req.method,
      requestId,
    });

    // Handle Hono's HTTPException (for built-in HTTP errors)
    if (err instanceof HTTPException) {
      log?.warn({
        error: {
          message: err.message,
          status: err.status,
          name: err.name,
        },
      }, 'HTTP exception');

      const errorResponse = {
        ...createBaseErrorFields(c, { message: err.message, code: err.name || 'HTTP_ERROR' }, err.status, config),
      };

      return c.json(applySecurity(errorResponse, config), err.status as any);
    }

    // Handle custom application errors (AppError, RateLimitError, etc.)
    if (err instanceof AppError) {
      log?.warn({
        error: {
          message: err.message,
          code: err.code,
          statusCode: err.statusCode,
          details: err.details,
        },
      }, 'Application error');

      // Handle RateLimitError with specialized TypeSpec model
      if (err instanceof RateLimitError) {
        const retryAfter = err.details?.retryAfter || 60;
        c.header('Retry-After', String(retryAfter));

        const rateLimitResponse = {
          ...createBaseErrorFields(c, err, err.statusCode, config),
          limitType: 'requests' as const,
          limit: 100, // Default limit - should come from config
          usage: 101, // Would be calculated from actual usage
          resetTime: retryAfter,
          windowSize: 60, // 60 seconds window
        };

        return c.json(applySecurity(rateLimitResponse, config), err.statusCode as any);
      }

      // Handle AuthenticationError with specialized TypeSpec model
      if (err instanceof AuthenticationError) {
        const authResponse = {
          ...createBaseErrorFields(c, err, err.statusCode, config),
          scheme: err.details?.scheme,
          supportedSchemes: err.details?.supportedSchemes,
        };

        return c.json(applySecurity(authResponse, config), err.statusCode as any);
      }

      // Handle AuthorizationError with specialized TypeSpec model  
      if (err instanceof AuthorizationError) {
        const authzResponse = {
          ...createBaseErrorFields(c, err, err.statusCode, config),
          requiredPermission: err.details?.requiredPermission,
          userPermissions: err.details?.userPermissions,
          resource: err.details?.resource,
        };

        return c.json(applySecurity(authzResponse, config), err.statusCode as any);
      }

      // Handle HipaaComplianceError with specialized TypeSpec model
      if (err instanceof HipaaComplianceError) {
        const hipaaResponse = {
          ...createBaseErrorFields(c, err, err.statusCode, config),
          hipaaRule: err.details?.hipaaRule,
          violationType: err.details?.violationType,
          auditLog: err.details?.auditLog,
          remediationRequired: err.details?.remediationRequired,
        };

        return c.json(applySecurity(hipaaResponse, config), err.statusCode as any);
      }

      // Handle TimeoutError with specialized TypeSpec model
      if (err instanceof TimeoutError) {
        const timeoutResponse = {
          ...createBaseErrorFields(c, err, err.statusCode, config),
          timeoutMs: err.details?.timeoutMs,
          operation: err.details?.operation,
          retryable: err.details?.retryable,
        };

        return c.json(applySecurity(timeoutResponse, config), err.statusCode as any);
      }

      // Handle ExternalServiceError with specialized TypeSpec model
      if (err instanceof ExternalServiceError) {
        if (err.details?.retryAfter) {
          c.header('Retry-After', String(err.details.retryAfter));
        }

        const externalServiceResponse = {
          ...createBaseErrorFields(c, err, err.statusCode, config),
          service: err.details?.service,
          operation: err.details?.operation,
          externalCode: err.details?.externalCode,
          externalMessage: err.details?.externalMessage,
          retryable: err.details?.retryable,
          retryAfter: err.details?.retryAfter,
        };

        return c.json(applySecurity(externalServiceResponse, config), err.statusCode as any);
      }

      // Handle NotFoundError with specialized TypeSpec model
      if (err instanceof NotFoundError) {
        const notFoundResponse = {
          ...createBaseErrorFields(c, err, err.statusCode, config),
          resourceType: err.details?.resourceType,
          resource: err.details?.resource,
          suggestions: err.details?.suggestions,
        };

        return c.json(applySecurity(notFoundResponse, config), err.statusCode as any);
      }

      // Handle other AppError types with base ErrorDetail model
      const errorResponse = {
        ...createBaseErrorFields(c, err, err.statusCode, config),
        details: err.details,
      };

      return c.json(applySecurity(errorResponse, config), err.statusCode as any);
    }

    // Handle Zod validation errors with detailed field information
    if (err instanceof ZodError || err.name === 'ZodError') {
      const zodError = err as ZodError;
      
      // Format field errors according to TypeSpec FieldError model
      const fieldErrors: Array<{
        field: string;
        value?: unknown;
        code: string;
        message: string;
        context?: Record<string, unknown>;
      }> = [];
      
      const globalErrors: string[] = [];
      
      zodError.issues.forEach((issue: any) => {
        if (issue.path.length > 0) {
          fieldErrors.push({
            field: issue.path.join('.'),
            value: 'received' in issue ? (issue as any).received : undefined,
            code: issue.code,
            message: issue.message,
            context: issue.fatal !== undefined ? { fatal: issue.fatal } : undefined,
          });
        } else {
          globalErrors.push(issue.message);
        }
      });

      // Create user-friendly message
      const errorMessages = [
        ...globalErrors,
        ...fieldErrors.map(fe => `${fe.field}: ${fe.message}`)
      ];
      
      const userMessage = errorMessages.length > 0 
        ? `Validation failed: ${errorMessages.join('; ')}`
        : 'Validation failed';

      log?.warn({
        error: {
          message: userMessage,
          issues: zodError.issues,
          fieldErrors,
          globalErrors,
        },
      }, 'Validation error');

      // Return ValidationError matching TypeSpec model
      const validationResponse = {
        ...createBaseErrorFields(c, { message: userMessage, code: 'VALIDATION_ERROR' }, 400, config),
        fieldErrors: fieldErrors.length > 0 ? fieldErrors : undefined,
        globalErrors: globalErrors.length > 0 ? globalErrors : undefined,
      };

      return c.json(applySecurity(validationResponse, config), 400);
    }

    // Handle errors with statusCode property (but not HTTPException or AppError)
    if ('statusCode' in err && typeof (err as any).statusCode === 'number') {
      const statusCode = (err as any).statusCode;
      
      log?.warn({
        error: {
          message: err.message,
          statusCode,
          name: err.name,
        },
      }, 'Error with status code');

      const errorResponse = {
        ...createBaseErrorFields(c, { message: err.message, code: err.name || 'ERROR' }, statusCode, config),
      };

      return c.json(applySecurity(errorResponse, config), statusCode as any);
    }

    // Handle unknown/unexpected errors
    log?.error({
      error: {
        name: err.name || 'UnknownError',
        message: err.message || String(err),
        stack: err.stack,
      },
    }, 'Unhandled error');

    // Use debug mode to determine message verbosity
    const message = config.logging.level === 'debug'
      ? err.message || 'An unexpected error occurred'
      : 'Internal server error';

    // Return InternalServerError matching TypeSpec model  
    const internalErrorResponse = {
      ...createBaseErrorFields(c, { message, code: 'INTERNAL_SERVER_ERROR' }, 500, config),
      trackingId: requestId, // Use requestId as trackingId for error tracking
      reported: true, // Assume error is reported through logging
    };

    return c.json(applySecurity(internalErrorResponse, config), 500);
  };
}

/**
 * Register error handlers with the Hono app
 * Includes 404 handler and global error handler
 * MUST be called last after all other route registrations
 */
export function registerHandlers(app: App, config: Config): void {
  // 404 handler for unmatched routes - returns NotFoundError matching TypeSpec model
  app.notFound((c) => {
    const notFoundResponse = {
      ...createBaseErrorFields(c, { message: 'Route not found', code: 'NOT_FOUND' }, 404, config),
      resourceType: 'route',
      resource: c.req.path,
      suggestions: undefined, // Could be enhanced with common route suggestions
    };

    return c.json(applySecurity(notFoundResponse, config), 404);
  });

  // Global error handler - must be last!
  app.onError(createErrorHandler(config));
}