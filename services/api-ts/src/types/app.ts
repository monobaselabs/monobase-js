/**
 * Simplified Hono types for handlers
 * Relaxed typing approach to avoid complex validation issues
 */

import { Context, Hono } from 'hono';
import type { DatabaseInstance } from '@/core/database';
import type { Logger } from '@/types/logger';
import type { User, Session, AdminLevel } from '@/types/auth';
import type { AuthInstance } from '@/core/auth';
import type { StorageProvider } from '@/core/storage';
import type { JobScheduler } from '@/core/jobs';
import type { NotificationService } from '@/core/notifs';
import type { AuditService } from '@/core/audit';
import type { EmailService } from '@/core/email';
import type { WebSocketService } from '@/core/ws';
import type { BillingService } from '@/core/billing';
import type { Config } from '@/core/config';

/**
 * Variables available in the Hono context
 * These are set by middleware and available to all handlers
 */
export type Variables = {
  requestId: string;

  // Core dependencies
  logger: Logger;
  database: DatabaseInstance;
  auth: AuthInstance;
  storage: StorageProvider;
  jobs: JobScheduler;
  notifs: NotificationService;
  audit: AuditService;
  email: EmailService;
  ws: WebSocketService;
  billing: BillingService;
  config: Config;
  app?: any; // Hono app instance

  // Auth context
  user?: User;
  session?: Session;

  // Internal service authentication
  internalServiceToken?: string;
  isInternalExpand?: boolean;
};

/**
 * Base context type for all handlers
 * Includes Variables with all injected dependencies
 */
export type BaseContext = Context<{ Variables: Variables }>;

/**
 * Validated context type for handlers with typed request validation
 * Use this type for handlers that receive validated request data from zValidator middleware
 * 
 * @template TJson - Type for validated JSON request body (from zValidator('json', ...))
 * @template TQuery - Type for validated query parameters (from zValidator('query', ...))
 * @template TParam - Type for validated path parameters (from zValidator('param', ...))
 * 
 * @example
 * ```typescript
 * export async function createReview(
 *   ctx: ValidatedContext<CreateReviewRequest>
 * ): Promise<Response> {
 *   const body = ctx.req.valid('json'); // Typed as CreateReviewRequest
 *   // ...
 * }
 * ```
 */
export type ValidatedContext<
  TJson = never,
  TQuery = never,
  TParam = never
> = BaseContext & {
  req: BaseContext['req'] & {
    valid(target: 'json'): TJson;
    valid(target: 'query'): TQuery;
    valid(target: 'param'): TParam;
  };
};

/**
 * Legacy type alias for backward compatibility
 * @deprecated Use BaseContext or ValidatedContext instead for proper type safety
 */
export type AppContext = BaseContext;

/**
 * Handler context that allows `ctx.req.valid()` to be called with any of the
 * standard validator targets without requiring the route's OpenAPI generic to
 * be threaded into the handler signature. `valid()` returns `unknown`; cast at
 * the call site to the expected validator output type, e.g.
 * `ctx.req.valid('json') as CreateThingRequest`.
 */
export type HandlerContext = BaseContext & {
  req: BaseContext['req'] & {
    valid(target: 'json' | 'query' | 'param' | 'header' | 'cookie' | 'form'): unknown;
  };
};

/**
 * Unified App type that includes Hono with Variables and all attached dependencies
 * This is the complete return type of createApp function
 */
export type App = Hono<{ Variables: Variables }> & {
  logger: Logger;
  database: DatabaseInstance;
  auth: AuthInstance;
  storage: StorageProvider;
  jobs: JobScheduler;
  notifs: NotificationService;
  audit: AuditService;
  email: EmailService;
  ws: WebSocketService;
  billing: BillingService;
};
