/**
 * Custom validation middleware and error handlers
 * Ensures validation errors use TypeSpec-compliant error format
 */

import type { Context } from 'hono';
import { ZodError } from 'zod';

/**
 * Custom error handler for zValidator that formats validation errors
 * Returns TypeSpec-compliant ValidationError format
 */
export function validationErrorHandler(result: any, c: Context): Response | undefined {
  if (!result.success) {
    // result.error is the ZodError, but we need to access its issues
    const zodError = new ZodError(result.error.issues || result.error.errors || []);
    
    // Format field errors according to TypeSpec FieldError model
    const fieldErrors: Array<{
      field: string;
      value?: unknown;
      code: string;
      message: string;
      context?: Record<string, unknown>;
    }> = [];
    
    const globalErrors: string[] = [];
    
    zodError.issues.forEach(issue => {
      if (issue.path.length > 0) {
        fieldErrors.push({
          field: issue.path.join('.'),
          value: 'received' in issue ? (issue as any).received : undefined,
          code: issue.code,
          message: issue.message,
          context: 'fatal' in issue && issue.fatal !== undefined ? { fatal: issue.fatal } : undefined,
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

    const timestamp = new Date().toISOString();
    const requestId = c.get('requestId' as any) || c.req.header('X-Request-ID') || crypto.randomUUID();

    // Return ValidationError matching TypeSpec model
    return c.json({
      message: userMessage,
      code: 'VALIDATION_ERROR',
      requestId,
      timestamp,
      path: c.req.path,
      method: c.req.method,
      statusCode: 400,
      fieldErrors: fieldErrors.length > 0 ? fieldErrors : undefined,
      globalErrors: globalErrors.length > 0 ? globalErrors : undefined,
    }, 400);
  }
  
  return undefined;
}