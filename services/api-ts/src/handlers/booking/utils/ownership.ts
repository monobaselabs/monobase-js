/**
 * Ownership validation utilities for booking module
 */

import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import type { Booking } from '../repos/booking.schema';

/**
 * Check if user has ownership of a booking (either as client or host)
 */
export async function checkBookingOwnership(
  db: DatabaseInstance,
  logger: any,
  user: User,
  booking: Booking
): Promise<boolean> {
  if (booking.client && booking.client === user.id) {
    return true;
  }

  if (booking.host && booking.host === user.id) {
    return true;
  }

  return false;
}

/**
 * Check if user is the host for a booking
 */
export async function checkBookingHostOwnership(
  db: DatabaseInstance,
  logger: any,
  user: User,
  booking: Booking
): Promise<boolean> {
  logger?.debug({
    userId: user.id,
    bookingId: booking.id,
    bookingHost: booking.host,
    action: 'checkBookingHostOwnership_start'
  }, 'Starting host ownership check');

  if (!booking.host) {
    logger?.debug({ bookingId: booking.id }, 'Booking has no host - ownership denied');
    return false;
  }

  const isOwner = booking.host === user.id;

  logger?.debug({
    userId: user.id,
    bookingHostId: booking.host,
    isOwner,
    bookingId: booking.id,
    action: 'checkBookingHostOwnership_result'
  }, `Host ownership check: ${isOwner ? 'GRANTED' : 'DENIED'}`);

  return isOwner;
}

/**
 * Check if user is the client for a booking
 */
export async function checkBookingClientOwnership(
  db: DatabaseInstance,
  logger: any,
  user: User,
  booking: Booking
): Promise<boolean> {
  return booking.client === user.id;
}

/**
 * Get user type for booking (client or host).
 */
export async function getBookingUserType(
  db: DatabaseInstance,
  logger: any,
  user: User,
  booking: Booking
): Promise<'client' | 'host' | null> {
  if (await checkBookingClientOwnership(db, logger, user, booking)) {
    return 'client';
  }

  if (await checkBookingHostOwnership(db, logger, user, booking)) {
    return 'host';
  }

  return null;
}

/**
 * Check if user owns a booking event
 */
export function checkEventOwnership(
  user: User,
  eventOwnerId: string
): boolean {
  return user.id === eventOwnerId;
}
