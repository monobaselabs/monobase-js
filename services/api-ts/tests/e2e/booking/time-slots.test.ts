/**
 * getTimeSlot expand=event E2E Test
 * Tests the expand parameter functionality for time slot endpoint
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { faker } from '@faker-js/faker';
import { createTestApp, type TestApp } from '../../helpers/test-app';
import { createApiClient, type ApiClient } from '../../helpers/client';
import { createPerson, generateTestPersonData } from '../../helpers/person';
import {
  createBookingEvent,
  generateTestBookingEventData,
  listEventSlots
} from '../../helpers/booking';

describe('GET /booking/slots/{slotId} - expand=event', () => {
  let app: TestApp;
  let providerClient: ApiClient;
  let providerPersonId: string;
  let personId: string;
  let eventId: string;
  let slotId: string;

  beforeAll(async () => {
    // Create test app
    app = await createTestApp();

    // Create provider client and signup
    providerClient = createApiClient({ app: app.app });
    await providerClient.signup();

    // Create provider profile (Person record with same ID as user)
    providerPersonId = providerClient.currentUser!.id;
    personId = providerPersonId;
    
    const providerPersonData = generateTestPersonData();
    await createPerson(providerClient, providerPersonData);
    
    // Create booking event
    const eventData = generateTestBookingEventData();
    const { data: createdEvent } = await createBookingEvent(providerClient, eventData);
    eventId = createdEvent.id;
    
    // Wait for slot generation to complete (triggered by booking event creation)
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Use listEventSlots to get available slots
    const { data: slots } = await listEventSlots(providerClient, eventId);
    
    if (!slots || slots.length === 0) {
      throw new Error('No slots were generated for the event');
    }
    
    slotId = slots[0].id;
  });

  afterAll(async () => {
    await app?.cleanup();
  });

  test('should return slot without expanded event when expand is not provided', async () => {
    const response = await providerClient.fetch(`/booking/slots/${slotId}`, { method: 'GET' });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toBeDefined();
    expect(data.id).toBe(slotId);
    expect(data.owner).toBe(personId); // Owner is person ID, not provider ID
    expect(data.event).toBe(eventId); // Should be UUID string only
    expect(typeof data.event).toBe('string');
  });

  test('should return slot with expanded event when expand=event', async () => {
    const response = await providerClient.fetch(`/booking/slots/${slotId}?expand=event`, { method: 'GET' });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toBeDefined();
    expect(data.id).toBe(slotId);
    expect(data.owner).toBe(personId); // Owner is person ID, not provider ID

    // Event should be expanded to full object
    expect(data.event).toBeDefined();
    expect(typeof data.event).toBe('object');
    expect(data.event.id).toBe(eventId);
    expect(data.event.owner).toBe(personId); // Event owner is also person ID
    expect(data.event.timezone).toBeDefined();
    expect(data.event.locationTypes).toBeDefined();
    expect(data.event.dailyConfigs).toBeDefined();
    expect(data.event.status).toBeDefined();
  });

  test('should handle non-existent slot gracefully', async () => {
    const fakeSlotId = '00000000-0000-0000-0000-000000000000';
    const response = await providerClient.fetch(`/booking/slots/${fakeSlotId}?expand=event`, { method: 'GET' });

    expect(response.status).toBe(404);
  });

  test('should generate slots with correct timezone conversion', async () => {
    // Fetch slot with expanded event to check timezone handling
    const response = await providerClient.fetch(`/booking/slots/${slotId}?expand=event`, { method: 'GET' });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.event.timezone).toBeDefined();

    // Verify slot times are in UTC (should have Z suffix)
    expect(data.startTime).toBeDefined();
    expect(data.endTime).toBeDefined();
    expect(typeof data.startTime).toBe('string');
    expect(typeof data.endTime).toBe('string');

    // Parse the times to verify they are valid UTC timestamps
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);
    expect(startTime.toISOString()).toBe(data.startTime);
    expect(endTime.toISOString()).toBe(data.endTime);

    // Verify slot duration makes sense (should be the slot duration from event config)
    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMinutes = durationMs / (1000 * 60);
    expect(durationMinutes).toBeGreaterThan(0);
    expect(durationMinutes).toBeLessThanOrEqual(120); // Most slots are 30-120 minutes
  });
});
