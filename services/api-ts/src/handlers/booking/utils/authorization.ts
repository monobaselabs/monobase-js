/**
 * Authorization utilities for booking module
 * Handles role-based access control for booking operations
 */

import type { DatabaseInstance } from '@/core/database';
import { user as userTable } from '@/generated/better-auth/schema';
import { eq } from 'drizzle-orm';
import { ForbiddenError } from '@/core/errors';

/**
 * Check if a user is authorized to manage booking events
 * @param db Database instance
 * @param auth Auth instance
 * @param user Authenticated user
 * @param ownerId Owner ID to check ownership for (should be user.id)
 * @param eventId Event ID for error context
 * @returns true if authorized, throws ForbiddenError otherwise
 */
export async function checkBookingEventOwnership(
  db: DatabaseInstance,
  auth: any,
  user: any,
  ownerId: string,
  eventId?: string
): Promise<boolean> {
  // Admin and support roles can access any event
  if (user.role === 'admin' || user.role === 'support') {
    return true;
  }

  // Check if the user owns this event (owner should be user.id)
  if (ownerId !== user.id) {
    throw new ForbiddenError(`You can only manage your own booking events${eventId ? ` (event: ${eventId})` : ''}`);
  }

  return true;
}

/**
 * Check if a user is authorized to create booking events
 * Any authenticated user can create events (they become the owner)
 * @param db Database instance
 * @param auth Auth instance
 * @param user Authenticated user
 * @returns true if authorized, throws ForbiddenError otherwise
 */
export async function checkBookingEventCreateAuthorization(
  db: DatabaseInstance,
  auth: any,
  user: any
): Promise<boolean> {
  // Any authenticated user can create events
  // The user becomes the owner automatically
  return true;
}

/**
 * Check if user has the required role for an operation
 * @param user Authenticated user
 * @param requiredRoles Array of allowed roles
 * @param operation Description of the operation for error messages
 * @returns true if authorized, throws ForbiddenError otherwise
 */
export function checkUserRole(
  user: any,
  requiredRoles: string[],
  operation: string
): boolean {
  if (!requiredRoles.includes(user.role)) {
    throw new ForbiddenError(`Role '${user.role}' is not authorized to ${operation}. Required roles: ${requiredRoles.join(', ')}`);
  }
  return true;
}

/**
 * Check if user can manage a specific booking
 * Users can manage bookings where they are:
 * - The client (client:owner)
 * - The host (host:owner)
 * - The event owner (event:owner)
 * @param db Database instance
 * @param user Authenticated user
 * @param booking The booking to check
 * @returns true if authorized, throws ForbiddenError otherwise
 */
export async function checkBookingOwnership(
  db: DatabaseInstance,
  user: any,
  booking: any
): Promise<boolean> {
  // Admin and support roles can access any booking
  if (user.role === 'admin' || user.role === 'support') {
    return true;
  }

  // Check if user is the client
  if (booking.client === user.id) {
    return true;
  }

  // Check if user is the host
  if (booking.host === user.id) {
    return true;
  }

  // Check if user owns the event associated with this booking
  // This would require looking up the event, but for now we'll skip this check
  // as it's handled at the event level

  throw new ForbiddenError(`You are not authorized to manage this booking`);
}