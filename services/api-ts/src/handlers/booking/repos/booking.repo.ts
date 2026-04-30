/**
 * BookingRepository - Data access layer for bookings
 * Handles CRUD operations for booking management
 */

import { eq, and, or, gte, lte, inArray, type SQL } from 'drizzle-orm';
import type { DatabaseInstance } from '@/core/database';
import { DatabaseRepository } from '@/core/database.repo';
import {
  bookings,
  timeSlots,
  type Booking,
  type NewBooking,
  type BookingCreateRequest,
  type TimeSlot
} from './booking.schema';
import { bookingEvents } from './booking.schema';
import { NotFoundError, ConflictError } from '@/core/errors';
import { InvoiceRepository } from '../../billing/repos/billing.repo';

export interface BookingFilters {
  client?: string;
  host?: string;
  clientOrHost?: string;
  status?: 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'completed' | 'no_show_client' | 'no_show_host';
  dateRange?: { start: Date; end: Date };
  upcoming?: boolean;
  past?: boolean;
}

export interface BookingWithDetails extends Booking {
  clientDetails?: any;
  hostDetails?: any;
  slotDetails?: TimeSlot;
}

export class BookingRepository extends DatabaseRepository<Booking, NewBooking, BookingFilters> {  constructor(
    db: DatabaseInstance,
    logger?: any
  ) {
    super(db, bookings, logger);
  }

  /**
   * Build where conditions for booking filtering
   */
  protected buildWhereConditions(filters?: BookingFilters): SQL<unknown> | undefined {
    if (!filters) return undefined;

    const conditions = [];

    if (filters.client) {
      conditions.push(eq(bookings.client, filters.client));
    }

    if (filters.host) {
      conditions.push(eq(bookings.host, filters.host));
    }

    if (filters.clientOrHost) {
      conditions.push(
        or(
          eq(bookings.client, filters.clientOrHost),
          eq(bookings.host, filters.clientOrHost)
        )
      );
    }

    if (filters.status) {
      conditions.push(eq(bookings.status, filters.status));
    }

    if (filters.dateRange) {
      conditions.push(
        and(
          gte(bookings.scheduledAt, filters.dateRange.start),
          lte(bookings.scheduledAt, filters.dateRange.end)
        )
      );
    }    if (filters.upcoming) {
      conditions.push(
        and(
          gte(bookings.scheduledAt, new Date()),
          inArray(bookings.status, ['pending', 'confirmed'])
        )
      );
    }

    if (filters.past) {
      conditions.push(
        or(
          lte(bookings.scheduledAt, new Date()),
          inArray(bookings.status, ['completed', 'cancelled', 'no_show_client', 'no_show_host'])
        )
      );
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * Create a booking with slot validation
   */
  async createBooking(
    clientId: string,
    slotId: string,
    request: BookingCreateRequest
  ): Promise<BookingWithDetails> {
    this.logger?.debug({ clientId, slotId, request }, 'Creating booking');

    // Get slot with event details to check for billingConfig
    const slotWithEvent = await this.db.select()
      .from(timeSlots)
      .leftJoin(bookingEvents, eq(timeSlots.event, bookingEvents.id))
      .where(eq(timeSlots.id, slotId))
      .limit(1);

    if (!slotWithEvent[0]) {
      throw new NotFoundError('Time slot not found');
    }

    const slot = slotWithEvent[0]['time_slot'];
    const event = slotWithEvent[0]['booking_event'];

    if (slot.status !== 'available') {
      throw new ConflictError('Time slot is not available');
    }

    // Calculate duration in minutes
    const duration = Math.floor(
      (slot.endTime.getTime() - slot.startTime.getTime()) / 60000
    );

    // Pre-generate booking ID for invoice context
    const bookingId = crypto.randomUUID();

    // Check for billing configuration (slot-level overrides event-level)
    const billingConfig = slot.billingConfig || event?.billingConfig;
    let invoiceId: string | null = null;

    // Create invoice FIRST if billing is required (before booking insert)
    if (billingConfig) {
      this.logger?.debug({ bookingId, billingConfig }, 'Creating invoice for booking with billingConfig');
      
      const invoiceRepo = new InvoiceRepository(this.db, this.logger);
      
      try {
        const invoice = await invoiceRepo.createOne({
          invoiceNumber: `INV-${Date.now()}-${bookingId.substring(0, 8)}`,
          customer: clientId,
          merchant: slot.owner,
          context: `booking:${bookingId}`,
          status: 'open',
          subtotal: billingConfig.price,
          total: billingConfig.price,
          currency: billingConfig.currency,
          paymentDueAt: slot.startTime,
          createdBy: clientId,
          updatedBy: clientId
        });
        
        invoiceId = invoice.id;
        this.logger?.info({ invoiceId, bookingId }, 'Invoice created for booking');
      } catch (error) {
        this.logger?.error({ error, bookingId }, 'Failed to create invoice - aborting booking');
        throw error; // Abort booking if invoice creation fails
      }
    }

    // Create booking with pre-generated ID and invoice reference
    const bookingData: NewBooking = {
      id: bookingId,
      client: clientId,
      host: slot.owner,
      slot: slotId,
      locationType: request.locationType || slot.locationTypes[0],
      reason: request.reason,
      status: 'pending',
      scheduledAt: slot.startTime,
      durationMinutes: duration,
      formResponses: request.formResponses,
      invoice: invoiceId ?? undefined, // Use undefined for optional fields
      // Audit fields - booking created by client
      createdBy: clientId,
      updatedBy: clientId
    };

    const booking = await this.createOne(bookingData);

    // Update slot status
    await this.db.update(timeSlots)
      .set({ status: 'booked', booking: booking.id })
      .where(eq(timeSlots.id, slotId));

    this.logger?.info({ bookingId: booking.id, clientId, slotId, invoiceId }, 'Booking created');

    return { ...booking, slotDetails: slot };
  }  /**
   * Confirm a booking
   */
  async confirmBooking(bookingId: string): Promise<Booking> {
    this.logger?.debug({ bookingId }, 'Confirming booking');

    const booking = await this.updateOneById(bookingId, {
      status: 'confirmed',
      confirmationTimestamp: new Date()
    });

    this.logger?.info({ bookingId }, 'Booking confirmed');
    return booking;
  }

  /**
   * Cancel a booking
   */
  async cancelBooking(
    bookingId: string,
    cancelledBy: 'client' | 'host',
    reason: string
  ): Promise<Booking> {
    this.logger?.debug({ bookingId, cancelledBy, reason }, 'Cancelling booking');

    const booking = await this.findOneById(bookingId);
    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    // Update booking
    const cancelled = await this.updateOneById(bookingId, {
      status: 'cancelled',
      cancelledBy,
      cancellationReason: reason,
      cancelledAt: new Date()
    });    // Free up the slot
    await this.db.update(timeSlots)
      .set({ status: 'available', booking: null })
      .where(eq(timeSlots.id, booking.slot));

    this.logger?.info({ bookingId, cancelledBy }, 'Booking cancelled');
    return cancelled;
  }

  /**
   * Get upcoming bookings for a person (as client or host)
   */
  async getUpcomingBookings(personId: string, role: 'client' | 'host'): Promise<Booking[]> {
    this.logger?.debug({ personId, role }, 'Getting upcoming bookings');

    const filters: BookingFilters = {
      upcoming: true
    };

    if (role === 'client') {
      filters.client = personId;
    } else {
      filters.host = personId;
    }

    const bookings = await this.findMany(filters);

    this.logger?.debug({ personId, role, count: bookings.length }, 'Upcoming bookings retrieved');
    return bookings;
  }

  /**
   * Mark booking as no-show
   */
  async markAsNoShow(bookingId: string, markedBy: 'client' | 'host'): Promise<Booking> {
    this.logger?.debug({ bookingId, markedBy }, 'Marking booking as no-show');

    const status = markedBy === 'client' ? 'no_show_client' : 'no_show_host';
    
    const updated = await this.updateOneById(bookingId, {
      status,
      noShowMarkedBy: markedBy,
      noShowMarkedAt: new Date()
    });

    this.logger?.info({ bookingId, markedBy, status }, 'Booking marked as no-show');
    return updated;
  }
}