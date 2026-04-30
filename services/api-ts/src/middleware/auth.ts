/**
 * Authentication middleware for Hono
 * Provides auth context and role-based access control
 *
 * SIMPLIFIED APPROACH:
 * - Validates roles directly from session.user.role (no database queries)
 * - Role changes trigger session invalidation, forcing fresh authentication
 * - Ownership validation delegated to handlers using repository classes
 * - Performance optimized: no DB queries in middleware
 */

import type { Context, Next } from 'hono';
import type { Variables } from '@/types/app';
import type { AuthInstance } from '@/utils/auth';
import type { User, Session } from '@/types/auth';
import type { DatabaseInstance } from '@/core/database';
import { UnauthorizedError, ForbiddenError } from '@/core/errors';
import { userHasRole } from '@/utils/auth';

/**
 * Role requirement can be just a role or role:permission syntax
 */
type RoleRequirement = string | `${string}:owner`;

/**
 * Authentication middleware options
 */
interface AuthMiddlewareOptions {
  /** Whether authentication is required (default: true) */
  required?: boolean;
  /** 
   * Role requirements - supports role:permission syntax
   * Examples: ['admin'], ['client:owner'], ['host', 'admin']
   * Uses OR logic - if ANY requirement is satisfied, access is granted
   */
  roles?: RoleRequirement[];
}



/**
 * Unified authentication middleware factory
 * Handles both required and optional authentication with role-based access
 * Supports role:permission syntax for future extensibility
 * 
 * @param options - Middleware configuration options
 * @returns Hono middleware function
 * 
 * ROLE TYPES:
 * - System roles: 'admin', 'support', 'user' (from user.role field in session)
 * - Context roles: 'client', 'host' (from session after role assignment)
 * - Special role 'user': any authenticated user
 *
 * ROLE SYNCHRONIZATION:
 * - When roles are added (client/host role assignment), session is invalidated
 * - User must re-authenticate to get fresh JWT with updated roles
 * - No database queries in middleware - roles come from session token
 *
 * PERMISSION TYPES:
 * - 'owner': parsed but ownership validation is handled in handlers using repositories
 *
 * ACCESS LOGIC:
 * - Uses OR logic: if ANY role requirement is satisfied, access is granted
 * - Role:permission syntax: role must be satisfied, permission checking delegated to handlers
 * - Handlers use repository classes for ownership validation
 * 
 * @example
 * // Required authentication (default)
 * app.get('/clients', authMiddleware(), handler);
 * 
 * @example
 * // Optional authentication
 * app.get('/hosts', authMiddleware({ required: false }), handler);
 * 
 * @example
 * // System role authentication
 * app.get('/admin', authMiddleware({ roles: ['admin'] }), handler);
 * 
 * @example
 * // Context role authentication (session-based, handlers validate database records)
 * app.get('/client-dashboard', authMiddleware({ roles: ['client'] }), handler);
 * 
 * @example
 * // Multiple roles (OR logic)
 * app.get('/me', authMiddleware({ roles: ['client', 'host', 'admin'] }), handler);
 * 
 * @example
 * // Role with owner permission syntax (actual ownership checked in handlers)
 * app.get('/clients/:id', authMiddleware({
 *   roles: ['client:owner', 'admin'],
 *   resourceId: (ctx) => ctx.req.param('id')
 * }), handler);
 */
export function authMiddleware(options?: AuthMiddlewareOptions) {
  const opts = {
    required: true,
    ...options
  };

  return async (ctx: Context<{ Variables: Variables }>, next: Next) => {
    // Check for internal service-to-service expand requests
    const internalServiceToken = ctx.req.header('X-Internal-Service-Token');
    const isExpandContext = ctx.req.header('X-Expand-Context');
    const storedToken = ctx.get('internalServiceToken');

    if (internalServiceToken && isExpandContext && internalServiceToken === storedToken) {
      // Trusted internal expand request - skip user auth
      const logger = ctx.get('logger');
      logger.debug({
        expandContext: true,
        originalAuth: ctx.req.header('Authorization') ? 'present' : 'none'
      }, 'Internal expand request - bypassing user auth');

      // Set a marker so handlers know this is an internal expand request
      ctx.set('isInternalExpand', true);

      await next();
      return;
    }

    // Get auth instance from context (injected by dependency middleware)
    const auth = ctx.get('auth');

    if (!auth) {
      throw new Error('Auth instance not found in context. Ensure dependency injection middleware is configured.');
    }

    // Get session from Better-Auth using the Bearer plugin
    const session = await auth.api.getSession({
      headers: ctx.req.raw.headers,
    });

    if (session) {
      // Add user and session to context
      // Convert Better-Auth types to our internal types
      const userRole = (session.user as any).role || 'user';

      const user: User = {
        ...session.user,
        role: userRole
      };

      const sessionData: Session = {
        ...session.session,
        user: user
      };

      ctx.set('user', user);
      ctx.set('session', sessionData);
    }

    // Check authentication requirements
    if (opts.required && !session) {
      throw new UnauthorizedError('Authentication required');
    }

    // Check role requirements
    if (opts.roles && opts.roles.length > 0 && session) {
      const user = ctx.get('user'); // Use user from context
      const authInstance = ctx.get('auth');

      // Separate ownership-based permissions from role-based permissions
      const ownershipRoles = opts.roles.filter(r => r.includes(':owner'));
      const standardRoles = opts.roles.filter(r => !r.includes(':owner'));

      // Extract role names from standard roles only
      const standardRoleNames = standardRoles
        .map(r => r.split(':')[0])
        .filter((role): role is string => Boolean(role));

      // Check if user has any of the required standard roles (OR logic)
      const hasStandardRole = standardRoleNames.length === 0 ||
        (user ? await userHasRole(authInstance, user, standardRoleNames) : false);

      // If user has a standard role, allow access immediately
      if (hasStandardRole) {
        // User has required standard role, continue
        await next();
        return;
      }

      // If no standard roles matched, check if there are ownership roles
      if (ownershipRoles.length > 0) {
        // User doesn't have standard roles but might have ownership permissions
        // Delegate all validation (existence + ownership) to handlers
        // This fixes the 404 vs 403 issue where middleware would return 403
        // for non-existent resources instead of letting handlers return 404
        await next();
        return;
      }

      // No valid role found
      throw new ForbiddenError('Insufficient permissions');
    }

    await next();
  };
}

