/**
 * Slot Generation Utilities
 * Core algorithms for generating booking slots from booking events
 */

import { addDays, addMinutes, format, isAfter, isBefore, isWithinInterval, parseISO, startOfDay, setHours, setMinutes, differenceInMinutes, set, addHours } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import type { BookingEvent, NewTimeSlot, DayOfWeek } from '../repos/booking.schema';

export interface SlotGenerationConfig {
  event: BookingEvent;
  startDate: Date;
  endDate: Date;
  existingSlotIds?: Set<string>; // For deduplication
}

export interface GeneratedSlot extends Omit<NewTimeSlot, 'id'> {
  // Additional metadata for the generation process
  isDuplicate?: boolean; // Whether this slot already exists
}

/**
 * Generate slots for a booking event within a date range
 */
export function generateSlotsForEvent(config: SlotGenerationConfig): GeneratedSlot[] {
  const { event, startDate, endDate, existingSlotIds = new Set() } = config;
  const slots: GeneratedSlot[] = [];
  
  // Convert event times to proper timezone
  const timezone = event.timezone;
  
  // Iterate through each day in the range
  let currentDate = startOfDay(startDate);
  
  while (currentDate <= endDate) {
    // Check if this day of week is configured in dailyConfigs
    const dayOfWeek = currentDate.getDay();
    const dayKey = getDayKey(dayOfWeek);
    const dailyConfig = event.dailyConfigs[dayKey as DayOfWeek];
    
    if (dailyConfig && dailyConfig.enabled) {
      // Generate slots for this day
      const daySlots = generateSlotsForDay({
        event,
        dailyConfig,
        date: currentDate,
        timezone,
        existingSlotIds,
      });
      
      slots.push(...daySlots);
    }
    
    currentDate = addDays(currentDate, 1);
  }
  
  return slots;
}

/**
 * Convert day number to day key
 */
function getDayKey(dayNumber: number): string {
  const dayMap: Record<number, string> = {
    0: 'sun',
    1: 'mon',
    2: 'tue',
    3: 'wed',
    4: 'thu',
    5: 'fri',
    6: 'sat'
  };
  return (dayMap[dayNumber] || 'sun') as DayOfWeek;
}

/**
 * Generate slots for a specific day based on daily config
 */
function generateSlotsForDay(params: {
  event: BookingEvent;
  dailyConfig: any;
  date: Date;
  timezone: string;
  existingSlotIds: Set<string>;
}): GeneratedSlot[] {
  const { event, dailyConfig, date, timezone, existingSlotIds } = params;
  const slots: GeneratedSlot[] = [];
  
  // Check if there are time blocks configured
  if (!dailyConfig.timeBlocks || dailyConfig.timeBlocks.length === 0) {
    return slots;
  }
  
  // Process each time block
  for (const timeBlock of dailyConfig.timeBlocks) {
    // Parse start and end times
    const [startHour, startMinute] = timeBlock.startTime.split(':').map(Number);
    const [endHour, endMinute] = timeBlock.endTime.split(':').map(Number);
    
    // Create start and end datetime in the event owner's timezone
    let slotStart = setMinutes(setHours(date, startHour), startMinute);
    const dayEnd = setMinutes(setHours(date, endHour), endMinute);
    
    // Convert to UTC for storage
    const slotDuration = timeBlock.slotDuration || 30; // Default 30 minutes
    const bufferTime = timeBlock.bufferTime || 0; // Default 0 minutes
    const totalSlotTime = slotDuration + bufferTime;
    
    // Check minimum booking hours constraint
    const now = new Date();
    const minBookingTime = addMinutes(now, ((event as any).minBookingHours || 0) * 60);
    
    // Check advance booking constraint
    const maxBookingDate = addDays(now, (event as any).advanceBookingDays || 365);
    if (isAfter(date, maxBookingDate)) {
      continue; // Beyond advance booking window
    }
    
    while (slotStart < dayEnd) {
      const slotEnd = addMinutes(slotStart, slotDuration);
      
      // Don't create partial slots at the end of the day
      if (slotEnd > dayEnd) {
        break;
      }
      
      // Convert to UTC for storage
      const slotStartUtc = fromZonedTime(slotStart, timezone);
      const slotEndUtc = fromZonedTime(slotEnd, timezone);
      
      // Check if slot meets minimum booking time requirement
      if (isBefore(slotStartUtc, minBookingTime)) {
        slotStart = addMinutes(slotStart, totalSlotTime);
        continue;
      }
      
      // Create unique slot identifier for deduplication
      const slotKey = `${event.owner}-${format(date, 'yyyy-MM-dd')}-${timeBlock.startTime}-${slotStart.getHours()}:${slotStart.getMinutes()}`;
      const isDuplicate = existingSlotIds.has(slotKey);
      
      // Create the slot
      const slot: GeneratedSlot = {
        owner: event.owner,
        event: event.id,
        context: event.context,
        date: format(date, 'yyyy-MM-dd'),
        startTime: slotStartUtc,
        endTime: slotEndUtc,
        locationTypes: event.locationTypes,
        status: 'available',
        billingOverride: event.billingConfig || undefined,
        isDuplicate,
      };
      
      if (!isDuplicate) {
        slots.push(slot);
      }
      
      // Move to next slot
      slotStart = addMinutes(slotStart, totalSlotTime);
    }
  }
  
  return slots;
}

/**
 * Batch generate slots for multiple events
 */
export async function batchGenerateSlots(
  events: BookingEvent[],
  dateRange: { start: Date; end: Date },
  existingSlots: Map<string, Set<string>> // Keyed by owner ID
): Promise<GeneratedSlot[]> {
  const allSlots: GeneratedSlot[] = [];
  const batchSize = 10; // Process events in batches to avoid memory issues
  
  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    
    const batchSlots = batch.flatMap(event => {
      const ownerExistingSlots = existingSlots.get(event.owner) || new Set();
      
      return generateSlotsForEvent({
        event,
        startDate: dateRange.start,
        endDate: dateRange.end,
        existingSlotIds: ownerExistingSlots,
      });
    });
    
    allSlots.push(...batchSlots);
  }
  
  return allSlots;
}

/**
 * Validate slot boundaries to ensure proper alignment
 */
export function validateSlotBoundaries(
  slots: GeneratedSlot[],
  slotDuration: number,
  bufferTime: number
): { valid: GeneratedSlot[]; invalid: GeneratedSlot[] } {
  const valid: GeneratedSlot[] = [];
  const invalid: GeneratedSlot[] = [];
  
  const expectedDuration = slotDuration;
  const expectedInterval = slotDuration + bufferTime;
  
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot) continue;
    
    const duration = differenceInMinutes(slot['endTime'], slot['startTime']);

    // Check slot duration
    if (duration !== expectedDuration) {
      invalid.push(slot);
      continue;
    }

    // Check interval between consecutive slots (if not the last slot)
    if (i < slots.length - 1) {
      const nextSlot = slots[i + 1];
      if (!nextSlot) continue;
      
      if (slot['date'] === nextSlot['date']) {
        const interval = differenceInMinutes(nextSlot['startTime'], slot['startTime']);
        if (interval !== expectedInterval) {
          invalid.push(slot);
          continue;
        }
      }
    }

    valid.push(slot);
  }
  
  return { valid, invalid };
}

/**
 * Calculate the next bookable slot time based on minimum booking hours
 * Uses immutable date-fns operations for all date manipulations
 */
export function getNextBookableTime(minBookingHours: number): Date {
  const now = new Date();
  let nextBookable = addMinutes(now, minBookingHours * 60);

  // Round up to the next 15-minute boundary for cleaner slot times
  const minutes = nextBookable.getMinutes();
  const roundedMinutes = Math.ceil(minutes / 15) * 15;

  if (roundedMinutes === 60) {
    // Add hour and reset minutes using immutable operations
    nextBookable = set(addHours(nextBookable, 1), {
      minutes: 0,
      seconds: 0,
      milliseconds: 0
    });
  } else {
    // Set rounded minutes and reset seconds/milliseconds using immutable set()
    nextBookable = set(nextBookable, {
      minutes: roundedMinutes,
      seconds: 0,
      milliseconds: 0
    });
  }

  return nextBookable;
}