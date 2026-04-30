/**
 * Slot Generator Background Job
 * Generates booking slots from booking events on a daily basis
 */

import type { JobContext } from '@/core/jobs';
import { TimeSlotRepository } from '../repos/timeSlot.repo';
import { BookingEventRepository } from '../repos/bookingEvent.repo';
import { ScheduleExceptionRepository } from '../repos/scheduleException.repo';
import type { BookingEvent, DailyConfig, TimeBlock, NewTimeSlot, ScheduleException } from '../repos/booking.schema';
import { timeSlots, DayOfWeek } from '../repos/booking.schema';
import { eq, and, gte } from 'drizzle-orm';
import { addDays, startOfDay, format, getDay, eachDayOfInterval, parseISO, setHours, setMinutes, addMinutes, areIntervalsOverlapping } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

/**
 * Configuration for slot generation job
 */
export interface SlotGeneratorConfig {
  daysToGenerate: number; // How many days ahead to generate slots (default: 30)
  batchSize: number; // Number of events to process at once (default: 10)
  retryOnError: boolean; // Whether to retry failed events (default: true)
}

const DEFAULT_CONFIG: SlotGeneratorConfig = {
  daysToGenerate: 30,
  batchSize: 10,
  retryOnError: true
};

/**
 * Daily slot generation job
 * Runs at 2 AM to generate slots for the next 30 days
 */
export async function slotGeneratorJob(context: JobContext): Promise<void> {
  const { db, logger, jobId } = context;
  const config = { ...DEFAULT_CONFIG };
  
  logger.info({ jobId, config }, `Starting slot generation job`);
  
  const timeSlotRepo = new TimeSlotRepository(db, logger);
  const eventRepo = new BookingEventRepository(db, logger);
  const exceptionRepo = new ScheduleExceptionRepository(db, logger);
  
  try {
    // Calculate date range for slot generation
    const startDate = startOfDay(new Date());
    const endDate = addDays(startDate, config.daysToGenerate);
    
    logger.info({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      days: config.daysToGenerate
    }, 'Slot generation date range');
    
    // Get active booking events for date range
    const activeEvents = await eventRepo.findActiveInDateRange(startDate, endDate);

    if (activeEvents.length === 0) {
      logger.warn('No active booking events found for slot generation');
      return;
    }

    logger.info({
      eventCount: activeEvents.length,
      dateRange: `${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`
    }, `Found ${activeEvents.length} active booking events`);

    // Process events and generate slots
    const results = {
      totalGenerated: 0,
      totalCreated: 0,
      totalDuplicates: 0,
      failedEvents: [] as string[],
      errors: [] as string[]
    };

    for (const event of activeEvents) {
      try {
        logger.debug({
          eventId: event.id,
          owner: event.owner,
          status: event.status
        }, `Processing booking event ${event.id}`);

        // Fetch schedule exceptions for this event
        const exceptions = await exceptionRepo.findMany({
          event: event.id,
          dateRange: { start: startDate, end: endDate }
        });

        // Generate slots from this event with exception filtering
        const slots = await generateSlotsFromEvent(event, startDate, endDate, logger, exceptions);
        results.totalGenerated += slots.length;

        if (slots.length > 0) {
          // Bulk create the slots using the repository
          const createResult = await timeSlotRepo.bulkCreateSlots(slots);
          results.totalCreated += createResult.created.length;
          results.totalDuplicates += createResult.duplicates;

          logger.info({
            eventId: event.id,
            owner: event.owner,
            generated: slots.length,
            created: createResult.created.length,
            duplicates: createResult.duplicates,
            errors: createResult.errors
          }, `Completed slot generation for event ${event.id}`);
        } else {
          logger.debug({
            eventId: event.id,
            owner: event.owner
          }, `No slots generated for event ${event.id} - likely no enabled days in range`);
        }

      } catch (error) {
        const errorMsg = `Event ${event.id} failed: ${error instanceof Error ? error.message : String(error)}`;
        results.errors.push(errorMsg);
        results.failedEvents.push(event.id);

        logger.error({
          eventId: event.id,
          owner: event.owner,
          error: error instanceof Error ? error.message : String(error)
        }, `Event processing failed`);
      }
    }

    // Log final results
    logger.info({
      jobId,
      totalEvents: activeEvents.length,
      totalGenerated: results.totalGenerated,
      totalCreated: results.totalCreated,
      totalDuplicates: results.totalDuplicates,
      failedEvents: results.failedEvents.length,
      errors: results.errors.length,
      successRate: `${((activeEvents.length - results.failedEvents.length) / activeEvents.length * 100).toFixed(2)}%`
    }, 'Slot generation job completed');

    // If there were any failures, log them for investigation
    if (results.failedEvents.length > 0) {
      logger.warn({
        failedEvents: results.failedEvents,
        errors: results.errors
      }, 'Some events failed during slot generation');
    }

    // Clean up old slots for performance (optional)
    if (config.daysToGenerate > 7) {
      logger.info('Starting cleanup of old available slots');
      try {
        const deletedCount = await timeSlotRepo.cleanupOldAvailableSlots(30);
        logger.info(`Cleaned up ${deletedCount} old available slots`);
      } catch (cleanupError) {
        logger.warn({
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        }, 'Old slot cleanup failed but continuing');
      }
    }

  } catch (error) {
    logger.error({
      jobId,
      error: error instanceof Error ? error.message : String(error)
    }, 'Slot generation job failed');
    throw error;
  }
}

/**
 * Generate time slots from a BookingEvent
 * Processes the event's dailyConfigs and creates slots for the date range
 * Filters out slots that overlap with schedule exceptions
 */
async function generateSlotsFromEvent(
  event: BookingEvent,
  startDate: Date,
  endDate: Date,
  logger?: any,
  scheduleExceptions?: ScheduleException[]
): Promise<NewTimeSlot[]> {
  logger?.debug(`Generating slots from event ${event.id}`, {
    eventId: event.id,
    owner: event.owner,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    exceptionsCount: scheduleExceptions?.length || 0
  });

  const slots: NewTimeSlot[] = [];

  // Convert day numbers to DayOfWeek enum keys
  const dayMapping: Record<number, DayOfWeek> = {
    0: DayOfWeek.sun,
    1: DayOfWeek.mon,
    2: DayOfWeek.tue,
    3: DayOfWeek.wed,
    4: DayOfWeek.thu,
    5: DayOfWeek.fri,
    6: DayOfWeek.sat
  };

  // Generate slots for each day in the range
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  for (const day of days) {
    const dayOfWeekNum = getDay(day);
    if (dayOfWeekNum === undefined) continue;
    const dayOfWeek = dayMapping[dayOfWeekNum];
    if (!dayOfWeek) continue;
    const dailyConfig = event.dailyConfigs[dayOfWeek];

    // Skip if the day is not enabled or has no config
    if (!dailyConfig || !dailyConfig.enabled || !dailyConfig.timeBlocks?.length) {
      continue;
    }

    // Check if the day falls within the event's effective date range
    // Normalize dates to ensure consistent comparison
    const dayStart = startOfDay(day);
    const effectiveFrom = event.effectiveFrom instanceof Date 
      ? startOfDay(event.effectiveFrom)
      : startOfDay(parseISO(event.effectiveFrom));
    const effectiveTo = event.effectiveTo
      ? (event.effectiveTo instanceof Date 
          ? startOfDay(event.effectiveTo)
          : startOfDay(parseISO(event.effectiveTo)))
      : null;

    if (dayStart < effectiveFrom || (effectiveTo && dayStart > effectiveTo)) {
      continue;
    }

    // Process each time block for this day
    for (const timeBlock of dailyConfig.timeBlocks) {
      const daySlots = generateSlotsFromTimeBlock(
        event,
        day,
        timeBlock,
        logger
      );
      slots.push(...daySlots);
    }
  }

  // Filter out slots that overlap with schedule exceptions
  let filteredSlots = slots;
  if (scheduleExceptions && scheduleExceptions.length > 0) {
    const beforeFilter = slots.length;
    filteredSlots = slots.filter(slot => {
      // Check if this slot overlaps with any exception
      return !scheduleExceptions.some(exception => {
        // Handle recurring exceptions by generating all occurrences
        const exceptionOccurrences = exception.recurring && exception.recurrencePattern
          ? generateRecurrenceOccurrences(exception, endDate)
          : [{ start: exception.startDatetime, end: exception.endDatetime }];

        // Check if slot overlaps with any occurrence
        return exceptionOccurrences.some(occurrence =>
          areIntervalsOverlapping(
            { start: slot.startTime, end: slot.endTime },
            { start: occurrence.start, end: occurrence.end },
            { inclusive: false }
          )
        );
      });
    });

    const filtered = beforeFilter - filteredSlots.length;
    if (filtered > 0) {
      logger?.info({
        eventId: event.id,
        beforeFilter,
        afterFilter: filteredSlots.length,
        exceptionsCount: scheduleExceptions.length
      }, `Filtered ${filtered} slots due to schedule exceptions`);
    }
  }

  logger?.info({
    eventId: event.id,
    owner: event.owner,
    slotCount: filteredSlots.length
  }, `Generated ${filteredSlots.length} slots from event ${event.id}`);

  return filteredSlots;
}

/**
 * Generate slots from a single time block within a day
 */
function generateSlotsFromTimeBlock(
  event: BookingEvent,
  day: Date,
  timeBlock: TimeBlock,
  logger?: any
): NewTimeSlot[] {
  const slots: NewTimeSlot[] = [];
  const slotDuration = timeBlock.slotDuration || 30; // Default 30 minutes
  const bufferTime = timeBlock.bufferTime || 0; // Default 0 minutes

  // Parse start and end times
  const startParts = timeBlock.startTime.split(':').map(Number);
  const endParts = timeBlock.endTime.split(':').map(Number);
  const startHour = startParts[0] ?? 0;
  const startMinute = startParts[1] ?? 0;
  const endHour = endParts[0] ?? 0;
  const endMinute = endParts[1] ?? 0;

  // Create start and end DateTime objects in owner's timezone
  let currentTime = setMinutes(setHours(day, startHour), startMinute);
  const endTime = setMinutes(setHours(day, endHour), endMinute);

  // Generate slots within the time block
  while (currentTime < endTime) {
    const slotEndTime = addMinutes(currentTime, slotDuration);

    // Check if the slot would exceed the time block
    if (slotEndTime > endTime) {
      break;
    }

    // Convert from owner's local time to UTC for storage
    const slotStartUtc = fromZonedTime(currentTime, event.timezone);
    const slotEndUtc = fromZonedTime(slotEndTime, event.timezone);

    // Create the slot
    const slot: NewTimeSlot = {
      owner: event.owner,
      event: event.id,
      context: event.context,
      startTime: slotStartUtc,
      endTime: slotEndUtc,
      locationTypes: event.locationTypes,
      status: 'available',
      // Include billing config if specified in the event
      billingConfig: event.billingConfig || undefined,
      // Audit fields - system-generated slots attributed to owner
      createdBy: event.owner,
      updatedBy: event.owner
    };

    slots.push(slot);

    // Move to next slot (including buffer time) using immutable date-fns
    currentTime = addMinutes(slotEndTime, bufferTime);
  }

  return slots;
}

/**
 * Helper function to generate recurrence occurrences for schedule exceptions
 * Simplified version adapted from ScheduleExceptionRepository
 */
function generateRecurrenceOccurrences(
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
        currentStart = addDays(currentStart, 7 * (pattern.interval || 1));
        break;
      case 'monthly':
        // Simple monthly increment (doesn't handle day-of-month edge cases)
        currentStart = addDays(currentStart, 30 * (pattern.interval || 1));
        break;
      case 'yearly':
        currentStart = addDays(currentStart, 365 * (pattern.interval || 1));
        break;
    }
    currentEnd = new Date(currentStart.getTime() + duration);
  }

  return occurrences;
}

/**
 * Regenerate slots for a specific booking event
 * Used when a single event is created or updated
 */
export async function regenerateEventSlots(
  db: any,
  eventId: string,
  fromDate?: Date
): Promise<void> {
  const logger = console; // Use proper logger in production

  const timeSlotRepo = new TimeSlotRepository(db, logger);
  const eventRepo = new BookingEventRepository(db, logger);
  const exceptionRepo = new ScheduleExceptionRepository(db, logger);

  try {
    // Get the specific event first to determine timezone
    const event = await eventRepo.findOneById(eventId);
    
    if (!event) {
      logger.warn(`Event ${eventId} not found`);
      return;
    }

    if (event.status !== 'active') {
      logger.info(`Skipping slot generation for non-active event ${eventId}`, {
        status: event.status
      });
      return;
    }

    // Calculate start date in owner's timezone
    // If fromDate is provided, use it; otherwise use start-of-day in owner's timezone
    let startDate: Date;
    if (fromDate) {
      startDate = fromDate;
    } else {
      // Get current time in owner's timezone, then get start of day
      const nowInOwnerTz = toZonedTime(new Date(), event.timezone);
      const startOfDayInOwnerTz = startOfDay(nowInOwnerTz);
      // Convert back to UTC for database queries
      startDate = fromZonedTime(startOfDayInOwnerTz, event.timezone);
    }
    
    const endDate = addDays(startDate, 30);

    logger.info(`Regenerating slots for event ${eventId}`, {
      eventId,
      timezone: event.timezone,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });

    // Fetch schedule exceptions for this event in the date range
    const exceptions = await exceptionRepo.findMany({
      event: eventId,
      dateRange: { start: startDate, end: endDate }
    });

    logger.info(`Found ${exceptions.length} schedule exceptions for event ${eventId}`, {
      eventId,
      exceptionsCount: exceptions.length
    });

    // Delete existing future available slots for THIS event only
    const deletedSlots = await db
      .delete(timeSlots)
      .where(
        and(
          eq(timeSlots.event, eventId),
          eq(timeSlots.status, 'available'),
          gte(timeSlots.startTime, startDate)
        )
      );

    logger.info(`Deleted ${deletedSlots.rowCount || 0} existing available slots for event ${eventId}`);

    // Generate new slots from this event, filtering by exceptions
    const slots = await generateSlotsFromEvent(event, startDate, endDate, logger, exceptions);

    if (slots.length > 0) {
      const createResult = await timeSlotRepo.bulkCreateSlots(slots);
      
      logger.info(`Slot regeneration completed for event ${eventId}`, {
        eventId,
        generated: slots.length,
        created: createResult.created.length,
        duplicates: createResult.duplicates
      });
    } else {
      logger.debug(`No slots generated for event ${eventId}`, { eventId });
    }

  } catch (error) {
    logger.error(`Slot regeneration failed for event ${eventId}`, {
      eventId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}