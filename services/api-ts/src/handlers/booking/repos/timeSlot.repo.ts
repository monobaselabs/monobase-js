/**
 * TimeSlotRepository - Data access layer for time slots
 * Handles slot generation, availability queries, and slot management
 */

import { eq, and, or, gte, lte, sql, desc, asc, inArray, isNull, type SQL } from 'drizzle-orm';
import type { DatabaseInstance } from '@/core/database';
import { DatabaseRepository, type PaginationOptions } from '@/core/database.repo';
import {
  timeSlots,
  bookingEvents,
  scheduleExceptions,
  type TimeSlot,
  type NewTimeSlot,
  type BookingEvent,
  type ScheduleException
} from './booking.schema';
import { persons } from '../../person/repos/person.schema';
import {
  generateSlotsForEvent,
  batchGenerateSlots,
  validateSlotBoundaries,
  getNextBookableTime,
  type GeneratedSlot
} from '../utils/slotGeneration';
import { addDays, subDays, addMinutes, format } from 'date-fns';

export interface TimeSlotFilters {
  owner?: string;
  event?: string;
  timeRange?: { start: Date; end: Date };
  status?: 'available' | 'booked' | 'blocked';
  locationTypes?: string[];
}export interface SlotGenerationOptions {
  startDate: string;
  endDate: string;
  excludeExceptions?: boolean;
  dryRun?: boolean; // Return slots without creating them
}

export interface AvailabilityQuery {
  owner: string;
  dateRange: { start: string; end: string };
  locationType?: string;
  duration?: number; // Filter by slot duration
  includeAllStatuses?: boolean; // Include all slot statuses instead of just 'available'
}

export class TimeSlotRepository extends DatabaseRepository<TimeSlot, NewTimeSlot, TimeSlotFilters> {
  constructor(
    db: DatabaseInstance,
    logger?: any
  ) {
    super(db, timeSlots, logger);
  }

  /**
   * Build where conditions for time slot filtering
   */
  protected buildWhereConditions(filters?: TimeSlotFilters): SQL<unknown> | undefined {
    if (!filters) return undefined;

    const conditions = [];

    if (filters.owner) {
      conditions.push(eq(timeSlots.owner, filters.owner));
    }    if (filters.event) {
      conditions.push(eq(timeSlots.event, filters.event));
    }

    if (filters.timeRange) {
      conditions.push(
        and(
          gte(timeSlots.startTime, filters.timeRange.start),
          lte(timeSlots.startTime, filters.timeRange.end)
        )
      );
    }

    if (filters.status) {
      conditions.push(eq(timeSlots.status, filters.status));
    }

    if (filters.locationTypes && filters.locationTypes.length > 0) {
      conditions.push(
        sql`${timeSlots.locationTypes} && ARRAY[${sql.raw(
          filters.locationTypes.map(t => `'${t}'`).join(',')
        )}]::text[]`
      );
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * Find available slots - supports both query object and simple parameters
   */  async findAvailableSlots(
    queryOrEventId: AvailabilityQuery | string,
    startDate?: Date,
    endDate?: Date
  ): Promise<TimeSlot[]> {
    // Handle overloaded signature
    if (typeof queryOrEventId === 'string') {
      // Called with (eventId, startDate, endDate)
      const eventId = queryOrEventId;
      this.logger?.debug({ eventId, startDate, endDate }, 'Finding available slots by event');

      const filters: TimeSlotFilters = {
        event: eventId,
        status: 'available'
      };

      if (startDate && endDate) {
        filters.timeRange = { start: startDate, end: endDate };
      }

      this.logger?.info({ eventId, filters }, 'Finding available slots with filters');

      const slots = await this.findMany(filters);

      this.logger?.info({
        eventId,
        startDate,
        endDate,
        foundCount: slots.length,
        sampleSlot: slots[0] ? { id: slots[0].id, startTime: slots[0].startTime } : null
      }, 'Available slots found by event');

      return slots;
    }

    // Handle query object
    const query = queryOrEventId;
    this.logger?.debug({ query }, 'Finding available slots by query');

    const filters: TimeSlotFilters = {
      owner: query.owner,
      timeRange: query.dateRange ? { 
        start: new Date(query.dateRange.start), 
        end: new Date(query.dateRange.end) 
      } : undefined,
      status: query.includeAllStatuses ? undefined : 'available'
    };

    if (query.locationType) {
      filters.locationTypes = [query.locationType];
    }

    const slots = await this.findMany(filters);

    // Filter by duration if specified
    const filteredSlots = query.duration
      ? slots.filter(slot => {
          const duration = Math.floor(
            (slot.endTime.getTime() - slot.startTime.getTime()) / 60000
          );
          return duration === query.duration;
        })
      : slots;

    this.logger?.debug({
      query,
      foundCount: filteredSlots.length
    }, 'Available slots found by query');

    return filteredSlots;
  }

  /**
   * Get next available slot for an owner
   */  async getNextAvailableSlot(
    ownerId: string,
    afterDate?: Date,
    locationType?: string
  ): Promise<TimeSlot | null> {
    this.logger?.debug({ ownerId, afterDate, locationType }, 'Getting next available slot');

    const startDate = afterDate || new Date();
    
    const result = await this.db
      .select()
      .from(timeSlots)
      .where(
        and(
          eq(timeSlots.owner, ownerId),
          eq(timeSlots.status, 'available'),
          gte(timeSlots.startTime, startDate)
        )
      )
      .orderBy(asc(timeSlots.startTime))
      .limit(1);

    const slot = result[0] || null;

    this.logger?.debug({
      ownerId,
      found: !!slot,
      nextSlot: slot?.['startTime']
    }, 'Next available slot found');

    return slot;
  }

  /**
   * Mark a slot as booked with a booking ID
   */
  async markSlotAsBooked(slotId: string, bookingId: string): Promise<TimeSlot> {    this.logger?.debug({ slotId, bookingId }, 'Marking slot as booked');

    const updatedSlot = await this.updateOneById(slotId, {
      status: 'booked',
      booking: bookingId
    });

    this.logger?.info({ slotId, bookingId }, 'Slot marked as booked');
    return updatedSlot;
  }

  /**
   * Mark a slot as available (unbook it)
   */
  async markSlotAsAvailable(slotId: string): Promise<TimeSlot> {
    this.logger?.debug({ slotId }, 'Marking slot as available');

    const updatedSlot = await this.updateOneById(slotId, {
      status: 'available',
      booking: null
    });

    this.logger?.info({ slotId }, 'Slot marked as available');
    return updatedSlot;
  }

  /**
   * Delete slots for an event within a time range
   */
  async deleteSlotsForEvent(eventId: string, startTime: Date, endTime: Date): Promise<number> {
    this.logger?.debug({ eventId, startTime, endTime }, 'Deleting slots for event');

    const result = await this.db
      .delete(timeSlots)
      .where(
        and(
          eq(timeSlots.event, eventId),
          gte(timeSlots.startTime, startTime),
          lte(timeSlots.startTime, endTime),
          eq(timeSlots.status, 'available') // Only delete available slots
        )
      );

    const count = result.rowCount || 0;

    this.logger?.info({ eventId, startTime, endTime, deletedCount: count }, 'Slots deleted for event');
    return count;
  }

  /**
   * Bulk create slots efficiently with batching to avoid parameter limits
   */
  async bulkCreateSlots(slots: NewTimeSlot[]): Promise<{
    created: TimeSlot[];
    duplicates: number;
    errors: number
  }> {
    if (slots.length === 0) {
      return { created: [], duplicates: 0, errors: 0 };
    }

    this.logger?.debug({ count: slots.length }, 'Bulk creating slots');

    const created: TimeSlot[] = [];
    let duplicates = 0;
    let errors = 0;
    
    // Process slots in batches to avoid PostgreSQL parameter limit
    // Each slot has ~8 fields, so 100 slots = 800 parameters (well under 32767 limit)
    const batchSize = 100;
    
    for (let i = 0; i < slots.length; i += batchSize) {
      const batch = slots.slice(i, i + batchSize);
      
      try {
        // Create slots with ON CONFLICT handling for duplicate detection
        // Unique constraint is on (event, startTime) to allow different events to have overlapping slots
        const batchCreated = await this.db
          .insert(timeSlots)
          .values(batch)
          .onConflictDoNothing({
            target: [timeSlots.event, timeSlots.startTime]
          })
          .returning() as any[];

        created.push(...batchCreated);
        duplicates += (batch.length - batchCreated.length);

        this.logger?.debug({
          batchIndex: Math.floor(i / batchSize) + 1,
          batchSize: batch.length,
          created: batchCreated.length,
          duplicates: batch.length - batchCreated.length
        }, 'Batch processed');

      } catch (error) {
        this.logger?.error({
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          batchIndex: Math.floor(i / batchSize) + 1,
          batchSize: batch.length,
          batchStartIndex: i,
          sampleSlot: batch[0] ? {
            owner: batch[0].owner,
            event: batch[0].event,
            startTime: batch[0].startTime,
            endTime: batch[0].endTime
          } : undefined
        }, 'Batch creation failed - detailed error');
        
        errors += batch.length;
      }
    }

    this.logger?.info({
      total: slots.length,
      created: created.length,
      duplicates,
      errors
    }, 'Slots bulk created');

    return {
      created,
      duplicates,
      errors
    };
  }

  /**
   * Clean up old available slots to prevent database bloat
   */
  async cleanupOldAvailableSlots(daysOld: number): Promise<number> {
    this.logger?.debug({ daysOld }, 'Cleaning up old available slots');

    const cutoffDate = subDays(new Date(), daysOld);

    const result = await this.db
      .delete(timeSlots)
      .where(
        and(
          eq(timeSlots.status, 'available'),
          lte(timeSlots.startTime, cutoffDate)
        )
      );

    const count = result.rowCount || 0;

    this.logger?.info({
      cutoffDate: cutoffDate.toISOString(),
      deletedCount: count
    }, 'Old available slots cleaned up');

    return count;
  }
}