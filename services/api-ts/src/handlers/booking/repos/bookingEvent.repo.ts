/**
 * BookingEventRepository - Data access layer for booking events
 * Handles CRUD operations, smart defaults, and integration with slot generation
 * Flexible ownership model with Person-based ownership
 */

import { eq, and, or, lte, gte, isNull, sql, type SQL } from 'drizzle-orm';
import type { DatabaseInstance } from '@/core/database';
import { DatabaseRepository, type PaginationOptions } from '@/core/database.repo';
import { ConflictError } from '@/core/errors';
import {
  bookingEvents,
  type BookingEvent,
  type NewBookingEvent,
  type BookingEventCreateRequest,
  type BookingEventUpdateRequest,
  type DailyConfig,
  type TimeBlock,
  type FormConfig,
  type BillingConfig,
  DayOfWeek
} from './booking.schema';
import { persons } from '../../person/repos/person.schema';

export interface BookingEventFilters {
  owner?: string;
  context?: string;
  status?: 'draft' | 'active' | 'paused' | 'archived';
  q?: string; // Text search query across title, description, and keywords
  tagsOr?: string[]; // OR filtering (any tag matches) - from ?tags=csv
  tagsAnd?: string[]; // AND filtering (all tags must match) - from ?tags=a&tags=b
  effectiveDate?: string; // Find events effective on this date
  dateRangeStart?: Date; // Find events that overlap with date range starting from this date
  dateRangeEnd?: Date; // Find events that overlap with date range ending at this date
}export class BookingEventRepository extends DatabaseRepository<BookingEvent, NewBookingEvent, BookingEventFilters> {
  constructor(
    db: DatabaseInstance,
    logger?: any
  ) {
    super(db, bookingEvents, logger);
  }

  /**
   * Build where conditions for booking event filtering
   */
  protected buildWhereConditions(filters?: BookingEventFilters): SQL<unknown> | undefined {
    if (!filters) return undefined;

    const conditions = [];

    if (filters.owner) {
      conditions.push(eq(bookingEvents.owner, filters.owner));
    }

    if (filters.context) {
      conditions.push(eq(bookingEvents.context, filters.context));
    }

    if (filters.status) {
      conditions.push(eq(bookingEvents.status, filters.status));
    }

    // Text search across title, description, and keywords
    if (filters.q) {
      const searchTerm = filters.q.trim();

      // Use PostgreSQL full-text search with websearch_to_tsquery for natural language
      // Also search in keywords array (case-insensitive)
      conditions.push(
        or(
          // Full-text search on title + description
          sql`to_tsvector('english', ${bookingEvents.title} || ' ' || COALESCE(${bookingEvents.description}, '')) @@ websearch_to_tsquery('english', ${searchTerm})`,

          // Array contains search on keywords (case-insensitive)
          sql`EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(${bookingEvents.keywords}) AS keyword
            WHERE keyword ILIKE ${'%' + searchTerm + '%'}
          )`
        )
      );
    }

    // OR tag filtering (any tag matches) - from ?tags=csv
    if (filters.tagsOr && filters.tagsOr.length > 0) {
      conditions.push(
        sql`${bookingEvents.tags} ?| array[${sql.join(filters.tagsOr.map(tag => sql`${tag}`), sql`, `)}]`
      );
    }

    // AND tag filtering (all tags must match) - from ?tags=a&tags=b
    if (filters.tagsAnd && filters.tagsAnd.length > 0) {
      conditions.push(
        sql`${bookingEvents.tags} ?& array[${sql.join(filters.tagsAnd.map(tag => sql`${tag}`), sql`, `)}]`
      );
    }

    if (filters.effectiveDate) {
      // Find events that are effective on the given date
      const dayStart = new Date(`${filters.effectiveDate}T00:00:00.000Z`);
      const dayEnd = new Date(`${filters.effectiveDate}T23:59:59.999Z`);      conditions.push(
        and(
          lte(bookingEvents.effectiveFrom, dayEnd),
          or(
            isNull(bookingEvents.effectiveTo),
            gte(bookingEvents.effectiveTo, dayStart)
          )
        )
      );
    }

    if (filters.dateRangeStart && filters.dateRangeEnd) {
      conditions.push(
        and(
          lte(bookingEvents.effectiveFrom, filters.dateRangeEnd),
          or(
            isNull(bookingEvents.effectiveTo),
            gte(bookingEvents.effectiveTo, filters.dateRangeStart)
          )
        )
      );
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }



  /**
   * Create a booking event with smart defaults applied
   */
  async createWithSmartDefaults(
    ownerId: string,    request: BookingEventCreateRequest
  ): Promise<BookingEvent> {
    this.logger?.debug({ ownerId, request }, 'Creating booking event with smart defaults');

    if (!request.dailyConfigs) {
      throw new Error('dailyConfigs is required for booking event creation');
    }

    const eventData: NewBookingEvent = {
      owner: ownerId,
      title: request.title,
      description: request.description,
      keywords: request.keywords,
      tags: request.tags,
      context: request.context,
      timezone: request.timezone || 'America/New_York',
      locationTypes: request.locationTypes || ['video', 'phone', 'in-person'],
      maxBookingDays: request.maxBookingDays !== undefined ? request.maxBookingDays : 30,
      minBookingMinutes: request.minBookingMinutes !== undefined ? request.minBookingMinutes : 1440,
      formConfig: request.formConfig,
      billingConfig: request.billingConfig,
      status: request.status || 'active',
      effectiveFrom: request.effectiveFrom ? new Date(request.effectiveFrom) : new Date(),
      effectiveTo: request.effectiveTo ? new Date(request.effectiveTo) : null,
      dailyConfigs: this.processAndValidateDailyConfigs(request.dailyConfigs),
      // Audit fields - event created by owner
      createdBy: ownerId,
      updatedBy: ownerId,
    };

    const created = await this.createOne(eventData);

    this.logger?.info({
      eventId: created.id,
      ownerId,
      status: created.status,      enabledDays: Object.keys(request.dailyConfigs).filter(day => request.dailyConfigs[day as DayOfWeek]?.enabled)
    }, 'Booking event created with smart defaults');

    return created;
  }

  /**
   * Update a booking event and detect if changes require slot regeneration
   */
  async updateWithChangeDetection(
    eventId: string,
    updates: BookingEventUpdateRequest
  ): Promise<{
    event: BookingEvent;
    requiresSlotRegeneration: boolean;
    changes: string[]
  }> {
    this.logger?.debug({ eventId, updates }, 'Updating booking event with change detection');

    const currentEvent = await this.findOneById(eventId);
    if (!currentEvent) {
      throw new Error(`Booking event ${eventId} not found`);
    }

    const majorChangeFields = [
      'timezone', 'locationTypes', 'effectiveFrom', 'effectiveTo', 'dailyConfigs', 'status'
    ];

    const changes: string[] = [];
    let requiresSlotRegeneration = false;    for (const [key, newValue] of Object.entries(updates)) {
      if (newValue !== undefined) {
        const currentValue = currentEvent[key as keyof BookingEvent];

        if (key === 'dailyConfigs') {
          if (JSON.stringify(newValue) !== JSON.stringify(currentValue)) {
            changes.push(key);
            requiresSlotRegeneration = true;
          }
        } else if (Array.isArray(newValue) && Array.isArray(currentValue)) {
          if (JSON.stringify(newValue.sort()) !== JSON.stringify(currentValue.sort())) {
            changes.push(key);
            if (majorChangeFields.includes(key)) {
              requiresSlotRegeneration = true;
            }
          }
        } else if (newValue !== currentValue) {
          changes.push(key);
          if (majorChangeFields.includes(key)) {
            requiresSlotRegeneration = true;
          }
        }
      }
    }

    const processedUpdates: any = { ...updates };
    if (updates.dailyConfigs) {
      processedUpdates.dailyConfigs = this.processAndValidateDailyConfigs(updates.dailyConfigs);
    }
    if ((updates as any).effectiveFrom !== undefined && (updates as any).effectiveFrom) {
      processedUpdates.effectiveFrom = new Date((updates as any).effectiveFrom);
    }
    if (updates.effectiveTo !== undefined) {
      processedUpdates.effectiveTo = updates.effectiveTo ? new Date(updates.effectiveTo) : null;
    }

    const updatedEvent = await this.updateOneById(eventId, processedUpdates);

    this.logger?.info({
      eventId,
      changes,
      requiresSlotRegeneration
    }, 'Booking event updated with change detection');

    return {
      event: updatedEvent,
      requiresSlotRegeneration,
      changes
    };
  }

  /**
   * Find active booking events for an owner
   */
  async findActiveEventsByOwner(ownerId: string): Promise<BookingEvent[]> {
    this.logger?.debug({ ownerId }, 'Finding active events by owner');

    const events = await this.findMany({
      owner: ownerId,
      status: 'active'
    });    this.logger?.debug({
      ownerId,
      count: events.length
    }, 'Active events retrieved');

    return events;
  }

  /**
   * Find booking events by context
   */
  async findEventsByContext(contextId: string, status?: 'draft' | 'active' | 'paused' | 'archived'): Promise<BookingEvent[]> {
    this.logger?.debug({ contextId, status }, 'Finding events by context');

    const filters: BookingEventFilters = { context: contextId };
    if (status) {
      filters.status = status;
    }

    const events = await this.findMany(filters);

    this.logger?.debug({
      contextId,
      status,
      count: events.length
    }, 'Context events retrieved');

    return events;
  }

  /**
   * Archive an event instead of deleting it
   */  async archiveEvent(eventId: string, reason?: string): Promise<BookingEvent> {
    this.logger?.debug({ eventId, reason }, 'Archiving booking event');

    const archivedEvent = await this.updateOneById(eventId, {
      status: 'archived',
    });

    this.logger?.info({ eventId }, 'Booking event archived successfully');
    return archivedEvent;
  }

  /**
   * Find effective booking event for an owner on a specific date
   */
  async findEffectiveEvent(
    ownerId: string,
    effectiveDate: string,
    contextId?: string
  ): Promise<BookingEvent | null> {
    this.logger?.debug({ ownerId, effectiveDate, contextId }, 'Finding effective event');

    const filters: BookingEventFilters = {
      owner: ownerId,
      status: 'active',
      effectiveDate
    };

    if (contextId) {
      filters.context = contextId;
    }

    const event = await this.findOne(filters);    this.logger?.debug({
      ownerId,
      effectiveDate,
      contextId,
      found: !!event
    }, 'Effective event retrieved');

    return event;
  }

  /**
   * Get daily configuration for a specific day from an event
   */
  getDailyConfig(event: BookingEvent, dayOfWeek: DayOfWeek): DailyConfig | null {
    if (!event.dailyConfigs || !event.dailyConfigs[dayOfWeek]) {
      return null;
    }

    const config = event.dailyConfigs[dayOfWeek];
    return config.enabled ? config : null;
  }

  /**
   * Check if owner is available on a specific day
   */
  isOwnerAvailableOnDay(event: BookingEvent, dayOfWeek: DayOfWeek): boolean {
    const config = this.getDailyConfig(event, dayOfWeek);
    return config !== null && config.timeBlocks && config.timeBlocks.length > 0;
  }

  /**
   * Process and validate dailyConfigs, applying defaults to time blocks
   */  private processAndValidateDailyConfigs(dailyConfigs: Record<DayOfWeek, DailyConfig>): Record<DayOfWeek, DailyConfig> {
    const processedConfigs = { ...dailyConfigs };

    for (const [dayKey, config] of Object.entries(processedConfigs)) {
      const day = dayKey as DayOfWeek;

      if (config.enabled && config.timeBlocks) {
        config.timeBlocks = config.timeBlocks.map(block => ({
          startTime: block.startTime,
          endTime: block.endTime,
          slotDuration: block.slotDuration || 30,
          bufferTime: block.bufferTime || 0,
        }));

        for (const block of config.timeBlocks) {
          this.validateTimeBlock(block, day);
        }

        this.validateNoOverlappingTimeBlocks(config.timeBlocks, day);
      }
    }

    return processedConfigs;
  }

  /**
   * Validate a single time block
   */
  private validateTimeBlock(block: TimeBlock, day: DayOfWeek): void {
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;    if (!timeRegex.test(block.startTime)) {
      throw new Error(`Invalid startTime format for ${day}: ${block.startTime}. Expected HH:MM format.`);
    }

    if (!timeRegex.test(block.endTime)) {
      throw new Error(`Invalid endTime format for ${day}: ${block.endTime}. Expected HH:MM format.`);
    }

    if (block.startTime >= block.endTime) {
      throw new Error(`StartTime must be before endTime for ${day}: ${block.startTime} >= ${block.endTime}`);
    }

    if (block.slotDuration && (block.slotDuration < 15 || block.slotDuration > 480)) {
      throw new Error(`Invalid slotDuration for ${day}: ${block.slotDuration}. Must be between 15-480 minutes.`);
    }

    if (block.bufferTime && (block.bufferTime < 0 || block.bufferTime > 120)) {
      throw new Error(`Invalid bufferTime for ${day}: ${block.bufferTime}. Must be between 0-120 minutes.`);
    }
  }

  /**
   * Validate that time blocks within a day don't overlap
   */
  private validateNoOverlappingTimeBlocks(timeBlocks: TimeBlock[], day: DayOfWeek): void {
    const sortedBlocks = [...timeBlocks].sort((a, b) => a.startTime.localeCompare(b.startTime));

    for (let i = 1; i < sortedBlocks.length; i++) {
      const previousBlock = sortedBlocks[i - 1];
      const currentBlock = sortedBlocks[i];
      
      if (!previousBlock || !currentBlock) continue;
      
      if (previousBlock.endTime > currentBlock.startTime) {
        throw new Error(
          `Overlapping time blocks detected for ${day}: ` +
          `Block ending at ${previousBlock.endTime} overlaps with block starting at ${currentBlock.startTime}`
        );
      }
    }
  }

  /**
   * Validate booking event configuration before creation/update
   */
  validateEventConfig(config: BookingEventCreateRequest | BookingEventUpdateRequest): string[] {
    const errors: string[] = [];

    if (config.maxBookingDays !== undefined && (config.maxBookingDays < 0 || config.maxBookingDays > 365)) {
      errors.push('maxBookingDays must be between 0-365 days');
    }

    if (config.minBookingMinutes !== undefined && (config.minBookingMinutes < 0 || config.minBookingMinutes > 4320)) {
      errors.push('minBookingMinutes must be between 0-4320 minutes (72 hours)');
    }

    if (config.locationTypes && config.locationTypes.length === 0) {
      errors.push('At least one locationType must be specified');
    }

    if (config.timezone && !config.timezone.match(/^[A-Za-z_]+\/[A-Za-z_]+$/)) {
      errors.push('timezone must be in IANA format (e.g., "America/New_York")');
    }    if (config.status && !['draft', 'active', 'paused', 'archived'].includes(config.status)) {
      errors.push('status must be one of: draft, active, paused, archived');
    }

    if ('dailyConfigs' in config && config.dailyConfigs) {
      try {
        this.processAndValidateDailyConfigs(config.dailyConfigs);
      } catch (error: any) {
        errors.push(`Daily configuration validation failed: ${error.message}`);
      }
    }

    return errors;
  }

  /**
   * Find active booking events within a date range
   */
  async findActiveInDateRange(startDate: Date, endDate: Date): Promise<BookingEvent[]> {
    this.logger?.debug({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    }, 'Finding active events in date range');

    const events = await this.findMany({
      status: 'active',
      dateRangeStart: startDate,
      dateRangeEnd: endDate
    });

    this.logger?.debug({      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      eventCount: events.length
    }, 'Active events in date range retrieved');

    return events;
  }

  /**
   * Find booking event by ID with owner (person) data joined
   */
  async findOneByIdWithOwner(eventId: string): Promise<any | null> {
    this.logger?.debug({ eventId }, 'Finding booking event with owner data');

    const result = await this.db
      .select({
        event: bookingEvents,
        owner: persons
      })
      .from(bookingEvents)
      .innerJoin(persons, eq(bookingEvents.owner, persons.id))
      .where(eq(bookingEvents.id, eventId))
      .limit(1);

    if (result.length === 0 || !result[0]) {
      return null;
    }

    const { event, owner } = result[0];

    this.logger?.debug({
      eventId,
      ownerId: owner.id
    }, 'Booking event with owner retrieved');

    // Return event with owner as Person object instead of UUID
    return { ...event, owner };
  }

  /**
   * Find many booking events with owner (person) data joined
   */
  async findManyWithOwner(filters?: BookingEventFilters, options?: PaginationOptions): Promise<any[]> {
    this.logger?.debug({ filters, options }, 'Finding booking events with owner data');

    const whereConditions = this.buildWhereConditions(filters);

    const query = this.db
      .select({
        event: bookingEvents,
        owner: persons
      })
      .from(bookingEvents)
      .innerJoin(persons, eq(bookingEvents.owner, persons.id))
      .where(whereConditions);

    if (options?.limit) {
      query.limit(options.limit);
    }
    if (options?.offset) {
      query.offset(options.offset);
    }

    const results = await query;

    this.logger?.debug({
      filters,
      resultCount: results.length
    }, 'Booking events with owner retrieved');

    // Return events with owner as Person object
    return results.map(({ event, owner }) => ({ ...event, owner }));
  }
}