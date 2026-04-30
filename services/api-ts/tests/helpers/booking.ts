/**
 * Booking E2E Test Helper Functions
 * Provides utilities for testing booking module endpoints
 * Industry-neutral event scheduling and booking (no healthcare dependencies)
 */

import { faker } from '@faker-js/faker';
import type { ApiClient } from './client';
import type { paths } from '@monobase/api-spec';

// === Booking API Type Definitions ===

export type BookingEventCreateRequest = paths['/booking/events']['post']['requestBody']['content']['application/json'];
export type BookingEvent = paths['/booking/events/{event}']['get']['responses']['200']['content']['application/json'];
export type BookingEventUpdateRequest = paths['/booking/events/{event}']['patch']['requestBody']['content']['application/json'];
export type ScheduleExceptionCreateRequest = paths['/booking/events/{event}/exceptions']['post']['requestBody']['content']['application/json'];
export type ScheduleException = paths['/booking/events/{event}/exceptions/{exception}']['get']['responses']['200']['content']['application/json'];
export type BookingCreateRequest = paths['/booking/bookings']['post']['requestBody']['content']['application/json'];
export type Booking = paths['/booking/bookings/{booking}']['get']['responses']['200']['content']['application/json'];
export type BookingActionRequest = paths['/booking/bookings/{booking}/confirm']['post']['requestBody']['content']['application/json'];

/**
 * Helper response interface for consistent return patterns
 */
export interface BookingTestResponse<T = any> {
  response: Response;
  data?: T;
  error?: string;
}

// === Data Generators ===

/**
 * Generate test data for creating booking event
 */
export function generateTestBookingEventData(
  overrides: Partial<BookingEventCreateRequest> = {}
): BookingEventCreateRequest {
  const baseData: BookingEventCreateRequest = {
    title: faker.company.catchPhrase(),
    description: faker.lorem.sentence(),
    keywords: [],
    tags: [],
    timezone: 'America/New_York',
    locationTypes: ['video', 'phone', 'in-person'],
    maxBookingDays: 30,
    minBookingMinutes: 1440, // 24 hours
    status: 'active',
    dailyConfigs: {
      sun: { enabled: true, timeBlocks: [{ startTime: '09:00', endTime: '17:00', slotDuration: 30, bufferTime: 0 }] },
      mon: { enabled: true, timeBlocks: [{ startTime: '09:00', endTime: '17:00', slotDuration: 30, bufferTime: 0 }] },
      tue: { enabled: true, timeBlocks: [{ startTime: '09:00', endTime: '17:00', slotDuration: 30, bufferTime: 0 }] },
      wed: { enabled: true, timeBlocks: [{ startTime: '09:00', endTime: '17:00', slotDuration: 30, bufferTime: 0 }] },
      thu: { enabled: true, timeBlocks: [{ startTime: '09:00', endTime: '17:00', slotDuration: 30, bufferTime: 0 }] },
      fri: { enabled: true, timeBlocks: [{ startTime: '09:00', endTime: '17:00', slotDuration: 30, bufferTime: 0 }] },
      sat: { enabled: true, timeBlocks: [{ startTime: '09:00', endTime: '17:00', slotDuration: 30, bufferTime: 0 }] }
    },
    ...overrides
  };

  return baseData;
}

/**
 * Generate booking event data with keywords and tags
 */
export function generateTestBookingEventDataWithKeywordsAndTags(
  title: string,
  description: string,
  keywords: string[],
  tags: string[],
  overrides: Partial<BookingEventCreateRequest> = {}
): BookingEventCreateRequest {
  return generateTestBookingEventData({
    title,
    description,
    keywords,
    tags,
    ...overrides
  });
}

/**
 * Generate minimal booking event data (Tuesday only)
 */
export function generateMinimalBookingEventData(
  overrides: Partial<BookingEventCreateRequest> = {}
): BookingEventCreateRequest {
  return {
    title: 'Minimal Event',
    timezone: 'America/New_York',
    locationTypes: ['video'],
    dailyConfigs: {
      sun: { enabled: false, timeBlocks: [] },
      mon: { enabled: false, timeBlocks: [] },
      tue: { enabled: true, timeBlocks: [{ startTime: '10:00', endTime: '15:00', slotDuration: 30, bufferTime: 0 }] },
      wed: { enabled: false, timeBlocks: [] },
      thu: { enabled: false, timeBlocks: [] },
      fri: { enabled: false, timeBlocks: [] },
      sat: { enabled: false, timeBlocks: [] }
    },
    ...overrides
  };
}

/**
 * Generate booking event with billing configuration
 */
export function generateBookingEventWithBillingConfig(
  overrides: Partial<BookingEventCreateRequest> = {}
): BookingEventCreateRequest {
  return generateTestBookingEventData({
    billingConfig: {
      price: 5000, // $50.00 in cents
      currency: 'USD',
      cancellationThresholdMinutes: 1440 // 24 hours
    },
    ...overrides
  });
}

/**
 * Generate schedule exception data
 */
export function generateScheduleExceptionData(
  overrides: Partial<ScheduleExceptionCreateRequest> = {}
): ScheduleExceptionCreateRequest {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 0, 0, 0); // 2:00 PM

  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setHours(15, 0, 0, 0); // 3:00 PM (1 hour exception)

  return {
    startDatetime: tomorrow.toISOString(),
    endDatetime: tomorrowEnd.toISOString(),
    reason: faker.lorem.sentence(),
    recurring: false,
    ...overrides
  };
}

/**
 * Generate recurring schedule exception
 */
export function generateRecurringException(
  overrides: Partial<ScheduleExceptionCreateRequest> = {}
): ScheduleExceptionCreateRequest {
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(10, 0, 0, 0);

  const nextWeekEnd = new Date(nextWeek);
  nextWeekEnd.setHours(11, 0, 0, 0);

  return {
    startDatetime: nextWeek.toISOString(),
    endDatetime: nextWeekEnd.toISOString(),
    reason: 'Recurring weekly meeting',
    recurring: true,
    recurrencePattern: {
      type: 'weekly',
      interval: 1,
      daysOfWeek: [1], // Monday
      maxOccurrences: 10
    },
    ...overrides
  };
}

/**
 * Generate booking create data
 */
export function generateBookingCreateData(
  slotId: string,
  overrides: Partial<BookingCreateRequest> = {}
): BookingCreateRequest {
  return {
    slot: slotId,
    reason: faker.lorem.sentence(),
    locationType: 'video',
    ...overrides
  };
}

/**
 * Generate booking action data
 */
export function generateBookingActionData(
  action: string,
  overrides: Partial<BookingActionRequest> = {}
): BookingActionRequest {
  return {
    reason: `${action} - ${faker.lorem.sentence()}`,
    ...overrides
  };
}

/**
 * Generate weekly schedules for a provider (Monday-Friday)
 */
export function generateWeeklySchedules(providerId: string): BookingEventCreateRequest[] {
  return [
    generateTestBookingEventData({
      context: providerId
    })
  ];
}

// === API Helper Functions ===

/**
 * Create booking event via API
 */
export async function createBookingEvent(
  apiClient: ApiClient,
  data: BookingEventCreateRequest
): Promise<BookingTestResponse<BookingEvent>> {
  const response = await apiClient.fetch('/booking/events', {
    method: 'POST',
    body: data
  });

  if (!response.ok) {
    const error = await response.text();
    return { response, error };
  }

  return { response, data: await response.json() };
}

/**
 * Get booking event via API
 */
export async function getBookingEvent(
  apiClient: ApiClient,
  eventId: string
): Promise<BookingTestResponse<BookingEvent>> {
  const response = await apiClient.fetch(`/booking/events/${eventId}`);

  if (!response.ok) {
    const error = await response.text();
    return { response, error };
  }

  return { response, data: await response.json() };
}

/**
 * Update booking event via API
 */
export async function updateBookingEvent(
  apiClient: ApiClient,
  eventId: string,
  data: BookingEventUpdateRequest
): Promise<BookingTestResponse<BookingEvent>> {
  const response = await apiClient.fetch(`/booking/events/${eventId}`, {
    method: 'PATCH',
    body: data
  });

  if (!response.ok) {
    const error = await response.text();
    return { response, error };
  }

  return { response, data: await response.json() };
}

/**
 * Delete booking event via API
 */
export async function deleteBookingEvent(
  apiClient: ApiClient,
  eventId: string
): Promise<BookingTestResponse<void>> {
  const response = await apiClient.fetch(`/booking/events/${eventId}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const error = await response.text();
    return { response, error };
  }

  return { response };
}

/**
 * Create schedule exception via API
 */
export async function createScheduleException(
  apiClient: ApiClient,
  eventId: string,
  data: ScheduleExceptionCreateRequest
): Promise<BookingTestResponse<ScheduleException>> {
  const response = await apiClient.fetch(`/booking/events/${eventId}/exceptions`, {
    method: 'POST',
    body: data
  });

  if (!response.ok) {
    const error = await response.text();
    return { response, error };
  }

  return { response, data: await response.json() };
}

/**
 * List schedule exceptions via API
 */
export async function listScheduleExceptions(
  apiClient: ApiClient,
  eventId: string
): Promise<BookingTestResponse<any>> {
  const response = await apiClient.fetch(`/booking/events/${eventId}/exceptions`);

  if (!response.ok) {
    const error = await response.text();
    return { response, error };
  }

  return { response, data: await response.json() };
}

/**
 * Get schedule exception via API
 */
export async function getScheduleException(
  apiClient: ApiClient,
  eventId: string,
  exceptionId: string
): Promise<BookingTestResponse<ScheduleException>> {
  const response = await apiClient.fetch(`/booking/events/${eventId}/exceptions/${exceptionId}`);

  if (!response.ok) {
    const error = await response.text();
    return { response, error };
  }

  return { response, data: await response.json() };
}

/**
 * Delete schedule exception via API
 */
export async function deleteScheduleException(
  apiClient: ApiClient,
  eventId: string,
  exceptionId: string
): Promise<BookingTestResponse<void>> {
  const response = await apiClient.fetch(`/booking/events/${eventId}/exceptions/${exceptionId}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const error = await response.text();
    return { response, error };
  }

  return { response };
}

/**
 * List booking events via API (public endpoint)
 * Supports array parameters for AND tag filtering (repeated params)
 */
export async function listBookingEvents(
  apiClient: ApiClient,
  queryParams: Record<string, any> = {}
): Promise<BookingTestResponse<any>> {
  const searchParams = new URLSearchParams();

  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      // Handle array parameters (for AND tag filtering with repeated params)
      if (Array.isArray(value)) {
        value.forEach(item => searchParams.append(key, String(item)));
      } else {
        searchParams.append(key, String(value));
      }
    }
  });

  const url = searchParams.toString()
    ? `/booking/events?${searchParams.toString()}`
    : '/booking/events';

  const response = await apiClient.fetch(url);

  if (!response.ok) {
    const error = await response.text();
    return { response, error };
  }

  return { response, data: await response.json() };
}

/**
 * Get booking event details via API (public endpoint)
 */
/**
 * List event slots via API
 */
export async function listEventSlots(
  apiClient: ApiClient,
  eventId: string,
  options?: {
    startTime?: Date;
    endTime?: Date;
    status?: 'available' | 'booked' | 'blocked';
  }
): Promise<BookingTestResponse<any[]>> {
  let url = `/booking/events/${eventId}/slots`;
  
  const params = new URLSearchParams();
  if (options?.startTime) params.append('startTime', options.startTime.toISOString());
  if (options?.endTime) params.append('endTime', options.endTime.toISOString());
  if (options?.status) params.append('status', options.status);
  
  if (params.toString()) {
    url += `?${params.toString()}`;
  }
  
  const response = await apiClient.fetch(url);

  if (!response.ok) {
    const error = await response.text();
    return { response, error };
  }

  return { response, data: await response.json() };
}

export async function getBookingEventDetails(
  apiClient: ApiClient,
  eventId: string,
  expand?: string[] | string
): Promise<BookingTestResponse<any>> {
  let url = `/booking/events/${eventId}`;
  
  if (expand) {
    const expandParam = Array.isArray(expand) ? expand.join(',') : expand;
    url += `?expand=${expandParam}`;
  }
  
  const response = await apiClient.fetch(url);

  if (!response.ok) {
    const error = await response.text();
    return { response, error };
  }

  return { response, data: await response.json() };
}

/**
 * Create booking via API
 */
export async function createBooking(
  apiClient: ApiClient,
  data: BookingCreateRequest
): Promise<BookingTestResponse<Booking>> {
  const response = await apiClient.fetch('/booking/bookings', {
    method: 'POST',
    body: data
  });

  if (!response.ok) {
    const error = await response.text();
    return { response, error };
  }

  return { response, data: await response.json() };
}

/**
 * List bookings via API
 */
export async function listBookings(
  apiClient: ApiClient,
  queryParams: Record<string, any> = {}
): Promise<BookingTestResponse<any>> {
  const searchParams = new URLSearchParams();
  
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });

  const url = searchParams.toString() 
    ? `/booking/bookings?${searchParams.toString()}`
    : '/booking/bookings';
    
  const response = await apiClient.fetch(url);

  if (!response.ok) {
    const error = await response.text();
    return { response, error };
  }

  return { response, data: await response.json() };
}

/**
 * Get booking via API
 */
export async function getBooking(
  apiClient: ApiClient,
  bookingId: string,
  expand?: string
): Promise<BookingTestResponse<Booking>> {
  let url = `/booking/bookings/${bookingId}`;
  
  if (expand) {
    url += `?expand=${expand}`;
  }
  
  const response = await apiClient.fetch(url);

  if (!response.ok) {
    const error = await response.text();
    return { response, error };
  }

  return { response, data: await response.json() };
}

/**
 * Confirm booking via API
 */
export async function confirmBooking(
  apiClient: ApiClient,
  bookingId: string,
  data: BookingActionRequest
): Promise<BookingTestResponse<Booking>> {
  const response = await apiClient.fetch(`/booking/bookings/${bookingId}/confirm`, {
    method: 'POST',
    body: data
  });

  if (!response.ok) {
    const error = await response.text();
    return { response, error };
  }

  return { response, data: await response.json() };
}

/**
 * Reject booking via API
 */
export async function rejectBooking(
  apiClient: ApiClient,
  bookingId: string,
  data: BookingActionRequest
): Promise<BookingTestResponse<Booking>> {
  const response = await apiClient.fetch(`/booking/bookings/${bookingId}/reject`, {
    method: 'POST',
    body: data
  });

  if (!response.ok) {
    const error = await response.text();
    return { response, error };
  }

  return { response, data: await response.json() };
}

/**
 * Cancel booking via API
 */
export async function cancelBooking(
  apiClient: ApiClient,
  bookingId: string,
  data: BookingActionRequest
): Promise<BookingTestResponse<Booking>> {
  const response = await apiClient.fetch(`/booking/bookings/${bookingId}/cancel`, {
    method: 'POST',
    body: data
  });

  if (!response.ok) {
    const error = await response.text();
    return { response, error };
  }

  return { response, data: await response.json() };
}

/**
 * Mark no-show booking via API
 */
export async function markNoShowBooking(
  apiClient: ApiClient,
  bookingId: string,
  data: BookingActionRequest
): Promise<BookingTestResponse<Booking>> {
  const response = await apiClient.fetch(`/booking/bookings/${bookingId}/no-show`, {
    method: 'POST',
    body: data
  });

  if (!response.ok) {
    const error = await response.text();
    return { response, error };
  }

  return { response, data: await response.json() };
}

// === Validators ===

/**
 * Validate booking event response structure
 */
export function validateBookingEventResponse(event: any): boolean {
  return !!(
    event &&
    event.id &&
    event.owner &&
    event.timezone &&
    event.locationTypes &&
    event.dailyConfigs &&
    event.status
  );
}

/**
 * Validate booking response structure
 */
export function validateBookingResponse(booking: any): boolean {
  return !!(
    booking &&
    booking.id &&
    booking.client &&
    booking.provider &&
    booking.slot &&
    booking.status &&
    booking.scheduledAt
  );
}
