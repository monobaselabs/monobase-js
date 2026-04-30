/**
 * Auth utility functions for Monobase Application Platform
 * User role management helpers used by handlers and the boot path.
 */

import { createAccessControl } from 'better-auth/plugins/access';
import type { betterAuth } from 'better-auth';
import type { DatabaseInstance } from '@/core/database';
import { user } from '@/generated/better-auth/schema';
import { eq } from 'drizzle-orm';

// Export auth instance type for type safety
export type AuthInstance = ReturnType<typeof betterAuth>;

/**
 * Better-Auth admin-plugin access controller. The contract surface uses
 * `x-security-required-roles` (TypeSpec) + authMiddleware({ roles }) for
 * gating, so this controller intentionally declares no statements — it
 * exists only to satisfy the admin plugin's signature.
 */
export const ac = createAccessControl({});

/**
 * Check if a user has one or more roles
 * @param auth - Auth instance for future use cases
 * @param user - User object with optional role field
 * @param roleToCheck - Single role string or array of roles (checks if user has ANY of them)
 * @returns Promise<boolean> - true if user has the role(s)
 */
export async function userHasRole(
  auth: AuthInstance,
  user: { role?: string | null },
  roleToCheck: string | string[]
): Promise<boolean> {
  // Making it async with auth param for future use cases where we might need to:
  // - Fetch fresh user data from database via auth.api
  // - Check role permissions from access control
  // - Validate against dynamic role configurations

  if (!user.role) return false;

  const userRoles = user.role.split(',').map(r => r.trim());
  const rolesToCheck = Array.isArray(roleToCheck) ? roleToCheck : [roleToCheck];

  return rolesToCheck.some(role => userRoles.includes(role));
}

/**
 * Add a role to a user without overwriting existing roles
 * @param database - Database instance for direct updates
 * @param user - User object (must have id and role fields)
 * @param roleToAdd - Role to add
 */
export async function addUserRole(
  database: DatabaseInstance,
  userObj: { id: string; role?: string | null },
  roleToAdd: string
) {
  const currentRoles = userObj.role ? userObj.role.split(',').map(r => r.trim()) : [];

  if (!currentRoles.includes(roleToAdd)) {
    currentRoles.push(roleToAdd);
    await database.update(user).set({
      role: currentRoles.join(',')
    }).where(eq(user.id, userObj.id));
  }
}

/**
 * Remove a role from a user while preserving other roles
 * @param database - Database instance for direct updates
 * @param user - User object (must have id and role fields)
 * @param roleToRemove - Role to remove
 */
export async function removeUserRole(
  database: DatabaseInstance,
  userObj: { id: string; role?: string | null },
  roleToRemove: string
) {
  const currentRoles = userObj.role ? userObj.role.split(',').map(r => r.trim()) : [];

  const updatedRoles = currentRoles.filter(r => r !== roleToRemove);
  await database.update(user).set({
    role: updatedRoles.length > 0 ? updatedRoles.join(',') : 'user'
  }).where(eq(user.id, userObj.id));
}

/**
 * Ensure admin users are promoted based on configured admin emails
 * @param database - Database instance for direct queries
 * @param adminEmails - Array of email addresses to promote to admin
 * @returns Array of emails that were promoted to admin
 */
export async function ensureAdminUsers(
  database: DatabaseInstance,
  adminEmails: string[]
): Promise<string[]> {
  // Function assumes adminEmails.length > 0 (checked in caller)

  const promotedEmails: string[] = [];

  // Query each email individually for better performance with many users
  for (const email of adminEmails) {
    const users = await database.select().from(user).where(eq(user.email, email)).limit(1);
    if (!users.length) continue;

    const foundUser = users[0];
    if (!foundUser) continue; // Extra safety check

    const currentRole = foundUser.role || 'user';
    const existingRoles = currentRole.split(',').map((r: string) => r.trim()).filter(r => r);
    if (existingRoles.includes('admin')) continue;

    existingRoles.push('admin');
    await database.update(user).set({
      role: existingRoles.join(',')
    }).where(eq(user.id, foundUser.id));

    promotedEmails.push(foundUser.email);
  }

  return promotedEmails;
}