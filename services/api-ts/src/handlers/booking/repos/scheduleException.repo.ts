/**
 * ScheduleExceptionRepository - Data access layer for schedule exceptions
 * Handles blocked time periods for booking events
 */

import { eq, and, or, gte, lte, isNull, type SQL } from 'drizzle-orm';
import type { DatabaseInstance } from '@/core/database';
import { DatabaseRepository } from '@/core/database.repo';
import {
  scheduleExceptions,
  bookingEvents,
  type ScheduleException,
  type NewScheduleException,
  type ScheduleExceptionCreateRequest,
  type RecurrencePattern
} from './booking.schema';
import { addDays, addWeeks, addMonths, format } from 'date-fns';

export interface ScheduleExceptionFilters {
  event?: string;
  owner?: string;
  context?: string;
  dateRange?: { start: Date; end: Date };
  recurring?: boolean;
}

export class ScheduleExceptionRepository extends DatabaseRepository<ScheduleException, NewScheduleException, ScheduleExceptionFilters> {
  constructor(
    db: DatabaseInstance,
    logger?: any
  ) {
    super(db, scheduleExceptions, logger);
  }

  /**
   * Build where conditions for schedule exception filtering
   */
  protected buildWhereConditions(filters?: ScheduleExceptionFilters): SQL<unknown> | undefined {
    if (!filters) return undefined;

    const conditions = [];

    if (filters.event) {
      conditions.push(eq(scheduleExceptions.event, filters.event));
    }

    if (filters.owner) {
      conditions.push(eq(scheduleExceptions.owner, filters.owner));
    }

    if (filters.context) {
      conditions.push(eq(scheduleExceptions.context, filters.context));
    }

    if (filters.dateRange) {
      conditions.push(
        and(
          lte(scheduleExceptions.startDatetime, filters.dateRange.end),
          gte(scheduleExceptions.endDatetime, filters.dateRange.start)
        )
      );
    }

    if (filters.recurring !== undefined) {
      conditions.push(eq(scheduleExceptions.recurring, filters.recurring));
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }  /**
   * Create exception for a booking event
   */
  async createExceptionForEvent(
    eventId: string,
    ownerId: string,
    request: ScheduleExceptionCreateRequest
  ): Promise<ScheduleException> {
    this.logger?.debug({ eventId, ownerId, request }, 'Creating schedule exception');

    // Get event details to inherit context
    const event = await this.db.select()
      .from(bookingEvents)
      .where(eq(bookingEvents.id, eventId))
      .limit(1);

    if (!event[0]) {
      throw new Error(`Booking event ${eventId} not found`);
    }

    const exceptionData: NewScheduleException = {
      event: eventId,
      owner: ownerId,
      context: event[0].context,
      timezone: request.timezone || event[0].timezone,
      startDatetime: new Date(request.startDatetime),
      endDatetime: new Date(request.endDatetime),
      reason: request.reason,
      recurring: request.recurring || false,
      recurrencePattern: request.recurrencePattern,
      // Audit fields - exception created by owner
      createdBy: ownerId,
      updatedBy: ownerId
    };

    const exception = await this.createOne(exceptionData);

    this.logger?.info({ exceptionId: exception.id, eventId }, 'Schedule exception created');
    return exception;
  }  /**
   * Find exceptions overlapping with a date range
   */
  async findOverlappingExceptions(
    ownerId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ScheduleException[]> {
    this.logger?.debug({ ownerId, startDate, endDate }, 'Finding overlapping exceptions');

    const exceptions = await this.findMany({
      owner: ownerId,
      dateRange: { start: startDate, end: endDate }
    });

    this.logger?.debug({ ownerId, count: exceptions.length }, 'Overlapping exceptions found');
    return exceptions;
  }

  /**
   * Generate exception occurrences for recurring exceptions
   */
  generateRecurrenceOccurrences(
    exception: ScheduleException,
    untilDate: Date
  ): Array<{ start: Date; end: Date }> {
    if (!exception.recurring || !exception.recurrencePattern) {
      return [{ start: exception.startDatetime, end: exception.endDatetime }];
    }

    const occurrences: Array<{ start: Date; end: Date }> = [];
    const pattern = exception.recurrencePattern;
    let currentStart = new Date(exception.startDatetime);
    let currentEnd = new Date(exception.endDatetime);
    const duration = currentEnd.getTime() - currentStart.getTime();

    const maxOccurrences = pattern.maxOccurrences || 100;
    const endDate = pattern.endDate ? new Date(pattern.endDate) : untilDate;

    while (currentStart <= endDate && occurrences.length < maxOccurrences) {
      occurrences.push({ start: new Date(currentStart), end: new Date(currentEnd) });

      // Calculate next occurrence based on pattern type
      switch (pattern.type) {
        case 'daily':
          currentStart = addDays(currentStart, pattern.interval || 1);
          break;
        case 'weekly':
          currentStart = addWeeks(currentStart, pattern.interval || 1);
          break;
        case 'monthly':
          currentStart = addMonths(currentStart, pattern.interval || 1);
          break;
      }
      currentEnd = new Date(currentStart.getTime() + duration);
    }

    return occurrences;
  }
}