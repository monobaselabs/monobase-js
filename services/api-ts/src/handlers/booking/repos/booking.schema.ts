/**
 * Database schema for booking module - matches TypeSpec API definition
 * Uses Drizzle ORM with PostgreSQL
 */

import { 
  pgTable, 
  uuid, 
  integer, 
  text, 
  time, 
  date, 
  timestamp, 
  boolean, 
  decimal, 
  jsonb, 
  index, 
  unique,
  pgEnum,
  check,
  varchar
} from 'drizzle-orm/pg-core';
import { eq, and, gte, isNull, sql } from 'drizzle-orm';
import { baseEntityFields } from '@/core/database.schema';
import { persons } from '../../person/repos/person.schema';

// Enums for booking status lifecycle
export const bookingStatusEnum = pgEnum('booking_status', [
  'pending',
  'confirmed', 
  'rejected',
  'cancelled',
  'completed',
  'no_show_client',
  'no_show_host'
]);

export const slotStatusEnum = pgEnum('slot_status', [
  'available',
  'booked',
  'blocked'
]);

// New enums for BookingEvent system
export const bookingEventStatusEnum = pgEnum('booking_event_status', [
  'draft',
  'active',
  'paused',
  'archived'
]);

export const locationTypeEnum = pgEnum('location_type', [
  'video',
  'phone',
  'in-person'
]);

// Recurrence type enum - matches TypeSpec
export const recurrenceTypeEnum = pgEnum('recurrence_type', [
  'daily',
  'weekly',
  'monthly',
  'yearly'
]);// Booking Events - Flexible event scheduling system
export const bookingEvents = pgTable('booking_event', {
  // Base entity fields (includes id, timestamps, version, audit fields)
  ...baseEntityFields,

  // Core event fields
  owner: uuid('owner_id')
    .notNull()
    .references(() => persons.id, { onDelete: 'cascade' }), // Person who owns the event

  context: text('context_id'), // Optional domain associations

  // Event metadata
  title: text('title').notNull(), // Event title
  description: text('description'), // Event description

  // Discovery and filtering fields
  keywords: jsonb('keywords')
    .$type<string[]>()
    .default(sql`'[]'::jsonb`), // Searchable keywords for discovery

  tags: jsonb('tags')
    .$type<string[]>()
    .default(sql`'[]'::jsonb`), // Category tags for filtering

  // Event configuration
  timezone: text('timezone')
    .notNull()
    .default('America/New_York'),

  locationTypes: jsonb('location_types')
    .$type<('video' | 'phone' | 'in-person')[]>()
    .notNull()
    .default(['video', 'phone', 'in-person']), // Available location types

  // Booking policies
  maxBookingDays: integer('max_booking_days')
    .notNull()
    .default(30), // Maximum days in advance clients can book

  minBookingMinutes: integer('min_booking_minutes')
    .notNull()
    .default(1440), // Minimum advance notice required (24 hours default)  // Optional configurations
  formConfig: jsonb('form_config').$type<FormConfig>(),
  billingConfig: jsonb('billing_config').$type<BillingConfig>(),

  // Event status and validity
  status: bookingEventStatusEnum('status')
    .notNull()
    .default('active'),

  effectiveFrom: timestamp('effective_from')
    .notNull()
    .defaultNow(), // Event start date and time

  effectiveTo: timestamp('effective_to'), // Optional end date and time

  // Daily configurations - keyed by day names ('sun', 'mon', 'tue', etc.')
  dailyConfigs: jsonb('daily_configs')
    .$type<Record<DayOfWeek, DailyConfig>>()
    .notNull(),
}, (table) => ({
  // Indexes for performance
  ownerIdx: index('booking_events_owner_id_idx').on(table.owner),
  contextIdx: index('booking_events_context_id_idx').on(table.context),
  statusIdx: index('booking_events_status_idx').on(table.status),
  activeEventsIdx: index('booking_events_active_idx')
    .on(table.owner, table.status)
    .where(sql`"booking_event"."status" = 'active'`),

  effectiveDatesIdx: index('booking_events_effective_dates_idx')
    .on(table.effectiveFrom, table.effectiveTo),

  // GIN indexes for full-text search and array operations
  searchIdx: index('booking_events_search_idx')
    .using('gin', sql`to_tsvector('english', ${table.title} || ' ' || COALESCE(${table.description}, ''))`),
  keywordsIdx: index('booking_events_keywords_idx')
    .using('gin', table.keywords),
  tagsIdx: index('booking_events_tags_idx')
    .using('gin', table.tags),

  // Check constraints
  maxBookingDaysCheck: check('booking_events_max_booking_days_check', sql`${table.maxBookingDays} >= 0 AND ${table.maxBookingDays} <= 365`),
  minBookingMinutesCheck: check('booking_events_min_booking_minutes_check', sql`${table.minBookingMinutes} >= 0 AND ${table.minBookingMinutes} <= 4320`), // 72 hours max
}));

// Time Slots - Individual bookable slots generated from booking events
export const timeSlots: any = pgTable('time_slot', {
  // Base entity fields
  ...baseEntityFields,

  // References (updated to use BookingEvent system)
  owner: uuid('owner_id')
    .notNull()
    .references(() => persons.id, { onDelete: 'cascade' }), // Slot owner (person)

  event: uuid('event_id')
    .notNull()
    .references(() => bookingEvents.id, { onDelete: 'cascade' }),

  context: text('context_id'), // Optional context (inherited from event)

  // Slot timing (UTC timestamps)
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time').notNull(),

  // Location configuration
  locationTypes: jsonb('location_types')
    .$type<('video' | 'phone' | 'in-person')[]>()
    .notNull(),
  
  // Slot status and pricing
  status: slotStatusEnum('status')
    .notNull()
    .default('available'),

  // Optional billing configuration for this specific slot (overrides event billingConfig)
  billingConfig: jsonb('billing_config').$type<BillingConfig>(),

  // Linked booking (if booked)
  booking: uuid('booking_id')
    .references(() => bookings.id, { onDelete: 'set null' }),
}, (table) => ({
  // Performance indexes (updated for BookingEvent system)
  ownerStartTimeIdx: index('time_slots_owner_start_time_idx')
    .on(table.owner, table.startTime),

  statusIdx: index('time_slots_status_idx').on(table.status),

  // Partial index for bookable slots (only available status)
  bookableSlotsIdx: index('time_slots_bookable_idx')
    .on(table.owner, table.startTime)
    .where(sql`"time_slot"."status" = 'available'`),

  eventIdx: index('time_slots_event_id_idx').on(table.event),
  contextIdx: index('time_slots_context_id_idx').on(table.context),
  bookingIdx: index('time_slots_booking_id_idx').on(table.booking),


  // Ensure no slot overlap within same event (different events can have overlapping slots)
  uniqueEventTime: unique('time_slots_event_time_unique')
    .on(table.event, table.startTime),
}));

// Bookings - Confirmed booking instances between client and host
export const bookings: any = pgTable('booking', {
  // Base entity fields
  ...baseEntityFields,

  // Core relationships (both use person IDs)
  client: uuid('client_id')
    .notNull()
    .references(() => persons.id, { onDelete: 'cascade' }),

  host: uuid('host_id')
    .notNull()
    .references(() => persons.id, { onDelete: 'cascade' }),
  
  slot: uuid('slot_id')
    .notNull()
    .references(() => timeSlots.id, { onDelete: 'cascade' }),
  
  // Location type (matches TypeSpec)
  locationType: locationTypeEnum('location_type').notNull(),
  
  // Booking details
  reason: text('reason'), // Optional visit reason (max 500 chars)
  status: bookingStatusEnum('status')
    .notNull()
    .default('pending'),
  
  // Timestamps
  bookedAt: timestamp('booked_at')
    .notNull()
    .defaultNow(),  
  confirmationTimestamp: timestamp('confirmation_timestamp'),
  scheduledAt: timestamp('scheduled_at').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  
  // Cancellation fields
  cancellationReason: text('cancellation_reason'),
  cancelledBy: text('cancelled_by'), // 'client' or 'host'
  cancelledAt: timestamp('cancelled_at'),
  
  // No-show fields
  noShowMarkedBy: text('no_show_marked_by'), // 'client' or 'host'
  noShowMarkedAt: timestamp('no_show_marked_at'),
  
  // Form responses (data only during creation)
  formResponses: jsonb('form_responses').$type<FormResponses>(),
  
  // Billing reference (matches TypeSpec)
  invoice: uuid('invoice') // Reference to billing invoice if payment required
}, (table) => ({
  // Performance indexes
  clientIdx: index('bookings_client_id_idx').on(table.client),
  hostIdx: index('bookings_host_id_idx').on(table.host),
  statusIdx: index('bookings_status_idx').on(table.status),
  scheduledAtIdx: index('bookings_scheduled_at_idx').on(table.scheduledAt),
  slotIdx: index('bookings_slot_id_idx').on(table.slot),

  // Compound indexes for common queries
  clientStatusIdx: index('bookings_client_status_idx')
    .on(table.client, table.status),
  hostStatusIdx: index('bookings_host_status_idx')
    .on(table.host, table.status),
  hostDateIdx: index('bookings_host_date_idx')
    .on(table.host, table.scheduledAt),
  

  
  // Partial indexes for pending bookings
  pendingBookingsIdx: index('bookings_pending_idx')
    .on(table.status, table.bookedAt)
    .where(sql`"booking"."status" = 'pending'`),
  
  // Check constraints
  reasonLengthCheck: check('bookings_reason_check', sql`LENGTH(${table.reason}) <= 500`),
  durationMinutesCheck: check('bookings_duration_minutes_check', sql`${table.durationMinutes} >= 15 AND ${table.durationMinutes} <= 480`),
}));// Schedule Exceptions - Event-specific blocked times
export const scheduleExceptions = pgTable('schedule_exception', {
  // Base entity fields
  ...baseEntityFields,

  // Core fields (updated for BookingEvent system)
  event: uuid('event_id')
    .notNull()
    .references(() => bookingEvents.id, { onDelete: 'cascade' }),

  owner: uuid('owner_id')
    .notNull()
    .references(() => persons.id, { onDelete: 'cascade' }), // Exception owner (person)

  context: text('context_id'), // Optional context (inherited from event)

  timezone: text('timezone')
    .notNull()
    .default('America/New_York'), // Exception timezone (can differ from event timezone)

  startDatetime: timestamp('start_datetime').notNull(),
  endDatetime: timestamp('end_datetime').notNull(),
  reason: text('reason').notNull(),

  // Recurrence configuration
  recurring: boolean('recurring')
    .notNull()
    .default(false),

  recurrencePattern: jsonb('recurrence_pattern').$type<RecurrencePattern>(), // JSON pattern instead of text
}, (table) => ({  // Performance indexes (updated for BookingEvent system)
  eventIdx: index('schedule_exceptions_event_id_idx').on(table.event),
  ownerIdx: index('schedule_exceptions_owner_id_idx').on(table.owner),
  contextIdx: index('schedule_exceptions_context_id_idx').on(table.context),
  dateRangeIdx: index('schedule_exceptions_date_range_idx')
    .on(table.startDatetime, table.endDatetime),
  ownerDateRangeIdx: index('schedule_exceptions_owner_date_range_idx')
    .on(table.owner, table.startDatetime, table.endDatetime),


  // Check constraints
  reasonLengthCheck: check('schedule_exceptions_reason_check', sql`LENGTH(${table.reason}) <= 500`),
  dateRangeCheck: check('schedule_exceptions_date_range_check', sql`${table.endDatetime} > ${table.startDatetime}`),
}));// Type exports for TypeScript
export type TimeSlot = typeof timeSlots.$inferSelect;
export type NewTimeSlot = typeof timeSlots.$inferInsert;

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;

export type ScheduleException = typeof scheduleExceptions.$inferSelect;
export type NewScheduleException = typeof scheduleExceptions.$inferInsert;

export type BookingEvent = typeof bookingEvents.$inferSelect;
export type NewBookingEvent = typeof bookingEvents.$inferInsert;

// Day of week enum for type safety
export enum DayOfWeek {
  sun = 'sun',
  mon = 'mon', 
  tue = 'tue',
  wed = 'wed',
  thu = 'thu',
  fri = 'fri',
  sat = 'sat'
}

// Time block configuration within a daily schedule
export interface TimeBlock {
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  slotDuration?: number; // Minutes (default: 30)
  bufferTime?: number; // Minutes (default: 0)
}// Daily configuration for a specific day of the week
export interface DailyConfig {
  enabled: boolean; // Whether the host has availability this day
  timeBlocks: TimeBlock[]; // Time blocks for this day
}

// Form field type enum - matches TypeSpec
export type FormFieldType = 'text' | 'textarea' | 'email' | 'phone' | 'number' | 'date' | 'datetime' | 'url' | 'select' | 'multiselect' | 'checkbox' | 'display';

// Form field option for select/multiselect - matches TypeSpec
export interface FormFieldOption {
  label: string;
  value: string;
}

// Form field validation rules - matches TypeSpec
export interface FormFieldValidation {
  minLength?: number;
  maxLength?: number;
  min?: number | string; // Number for numeric fields, string for date fields
  max?: number | string; // Number for numeric fields, string for date fields
  pattern?: string;
}

// BookingEvent-specific configuration interfaces
export interface FormConfig {
  fields?: FormFieldConfig[];
}

export interface FormFieldConfig {
  name: string;
  type: FormFieldType;
  label: string;
  required?: boolean;
  options?: FormFieldOption[];
  validation?: FormFieldValidation;
  placeholder?: string;
  helpText?: string;
}

// CurrencyAmount type - matches TypeSpec (integer in cents)
export type CurrencyAmount = number; // Integer representing cents

export interface BillingConfig {
  price: CurrencyAmount; // Price in cents (integer)
  currency: string; // Currency code (e.g., 'CAD', 'USD')
  cancellationThresholdMinutes: number; // Free cancellation threshold in minutes
}

// RecurrenceType type matching the enum
export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurrencePattern {
  type: RecurrenceType;
  interval?: number; // Default: 1
  daysOfWeek?: number[]; // For weekly (0=Sunday, 6=Saturday)
  dayOfMonth?: number; // For monthly (1-31)
  monthOfYear?: number; // For yearly (1-12)
  endDate?: string; // End date for recurrence (plainDate format)
  maxOccurrences?: number; // Maximum number of occurrences
}// Form response data for booking creation - matches TypeSpec
export interface FormResponseData {
  data: Record<string, any>; // Form field responses
}

// Complete form responses with metadata - matches TypeSpec
export interface FormResponses {
  data: Record<string, any>; // Form field responses
  metadata?: {
    submittedAt?: string; // When the form was submitted (utcDateTime)
    completionTimeSeconds?: number; // Time taken to complete the form in seconds
    ipAddress?: string; // Client IP address
  };
}

// BookingEvent request types (new system)
export interface BookingEventCreateRequest {
  title: string; // Event title
  description?: string; // Event description
  keywords?: string[]; // Searchable keywords for discovery
  tags?: string[]; // Category tags for filtering
  context?: string; // Optional context for domain associations
  timezone?: string; // Default: 'America/New_York'
  locationTypes?: ('video' | 'phone' | 'in-person')[]; // Default: all types
  maxBookingDays?: number; // Default: 30
  minBookingMinutes?: number; // Default: 1440 (24 hours)
  formConfig?: FormConfig;
  billingConfig?: BillingConfig;
  status?: 'draft' | 'active' | 'paused' | 'archived'; // Default: 'active'
  effectiveFrom?: string; // Default: today
  effectiveTo?: string;
  dailyConfigs: Record<DayOfWeek, DailyConfig>; // Required: weekly schedule configuration
}export interface BookingEventUpdateRequest {
  title?: string;
  description?: string;
  keywords?: string[] | null; // Can be null to clear - matches TypeSpec
  tags?: string[] | null; // Can be null to clear - matches TypeSpec
  timezone?: string;
  locationTypes?: ('video' | 'phone' | 'in-person')[];
  maxBookingDays?: number;
  minBookingMinutes?: number;
  formConfig?: FormConfig | null; // Can be null to clear - matches TypeSpec
  billingConfig?: BillingConfig | null; // Can be null to clear - matches TypeSpec
  status?: 'draft' | 'active' | 'paused' | 'archived';
  effectiveTo?: string | null; // Can be null to clear - matches TypeSpec
  dailyConfigs?: Record<DayOfWeek, DailyConfig>; // Optional: partial update supported
}

export interface BookingCreateRequest {
  slot: string; // Time slot (required) - UUID
  locationType?: 'video' | 'phone' | 'in-person'; // Selected location type (optional)
  reason?: string; // Visit reason (optional) - max 500 chars
  formResponses?: FormResponseData; // Form responses (optional)
}

export interface ScheduleExceptionCreateRequest {
  timezone?: string; // Exception timezone (defaults to event timezone if not specified)
  startDatetime: string; // Block start date/time (utcDateTime)
  endDatetime: string; // Block end date/time (utcDateTime)
  reason: string; // Reason for blocking (max 500 chars)
  recurring?: boolean; // Whether this exception repeats (default: false)
  recurrencePattern?: RecurrencePattern; // Recurrence pattern
}// Booking action request - matches TypeSpec
export interface BookingActionRequest {
  reason: string; // Action reason - required for audit trail (max 500 chars)
}

// Helper types for queries with joined data
export interface BookingWithDetails extends Booking {
  client?: any; // Client details
  host?: any; // Host details
  slot?: TimeSlot; // Time slot details
}

export interface BookingEventWithSlots extends BookingEvent {
  slots?: TimeSlot[]; // Available time slots
}