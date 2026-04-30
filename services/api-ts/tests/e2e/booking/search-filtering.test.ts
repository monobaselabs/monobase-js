/**
 * Booking Search and Filtering E2E Tests
 * Tests text search, tag filtering (OR and AND), and combined filters
 * Implements provider directory search functionality
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createApiClient, type ApiClient } from '../../helpers/client';
import { createTestApp, type TestApp } from '../../helpers/test-app';
import { createPerson, generateTestPersonData } from '../../helpers/person';
import {
  createBookingEvent,
  listBookingEvents,
  generateTestBookingEventDataWithKeywordsAndTags
} from '../../helpers/booking';

describe('Booking Search and Filtering E2E Tests', () => {
  let testApp: TestApp;
  let apiClient: ApiClient;
  let provider1Client: ApiClient;
  let provider2Client: ApiClient;
  let provider3Client: ApiClient;
  let provider4Client: ApiClient;

  let provider1Id: string;
  let provider2Id: string;
  let provider3Id: string;
  let provider4Id: string;

  let event1Id: string; // Massage therapist
  let event2Id: string; // Mental health counselor
  let event3Id: string; // Fitness trainer
  let event4Id: string; // Yoga instructor

  beforeAll(async () => {
    testApp = await createTestApp({ storage: true });
    apiClient = createApiClient({ app: testApp.app });
    await apiClient.signup();

    // Create 4 providers with different specialties
    const providers = [
      provider1Client = createApiClient({ app: testApp.app }),
      provider2Client = createApiClient({ app: testApp.app }),
      provider3Client = createApiClient({ app: testApp.app }),
      provider4Client = createApiClient({ app: testApp.app })
    ];

    // Sign up and create person records for all providers
    for (let i = 0; i < providers.length; i++) {
      await providers[i].signup();
      const personData = generateTestPersonData();
      await createPerson(providers[i], personData);
    }

    provider1Id = provider1Client.currentUser!.id;
    provider2Id = provider2Client.currentUser!.id;
    provider3Id = provider3Client.currentUser!.id;
    provider4Id = provider4Client.currentUser!.id;

    // Provider 1: Massage therapist
    const event1Data = generateTestBookingEventDataWithKeywordsAndTags(
      'Relaxation Massage Sessions',
      'Professional massage therapy for stress relief and muscle relaxation',
      ['massage', 'therapy', 'relaxation', 'wellness'],
      ['massage', 'wellness', 'certified']
    );
    const event1Result = await createBookingEvent(provider1Client, event1Data);
    if (!event1Result.data) throw new Error('Failed to create event 1');
    event1Id = event1Result.data.id;

    // Provider 2: Mental health counselor
    const event2Data = generateTestBookingEventDataWithKeywordsAndTags(
      'Counseling and Therapy',
      'Mental health counseling with cognitive behavioral therapy approach',
      ['counseling', 'therapy', 'mental-health', 'cbt'],
      ['therapy', 'mental-health', 'licensed']
    );
    const event2Result = await createBookingEvent(provider2Client, event2Data);
    if (!event2Result.data) throw new Error('Failed to create event 2');
    event2Id = event2Result.data.id;

    // Provider 3: Fitness trainer
    const event3Data = generateTestBookingEventDataWithKeywordsAndTags(
      'Personal Training Sessions',
      'One-on-one fitness training for strength and health improvement',
      ['fitness', 'training', 'exercise', 'health'],
      ['fitness', 'wellness', 'certified']
    );
    const event3Result = await createBookingEvent(provider3Client, event3Data);
    if (!event3Result.data) throw new Error('Failed to create event 3');
    event3Id = event3Result.data.id;

    // Provider 4: Yoga instructor
    const event4Data = generateTestBookingEventDataWithKeywordsAndTags(
      'Yoga and Meditation',
      'Guided yoga sessions with mindfulness and meditation practices',
      ['yoga', 'meditation', 'mindfulness', 'wellness'],
      ['wellness', 'yoga', 'certified']
    );
    const event4Result = await createBookingEvent(provider4Client, event4Data);
    if (!event4Result.data) throw new Error('Failed to create event 4');
    event4Id = event4Result.data.id;
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  // ========================================================================
  // TEXT SEARCH TESTS (q parameter)
  // ========================================================================

  describe('Text Search Tests', () => {
    test('should search by title (exact match)', async () => {
      const result = await listBookingEvents(apiClient, { q: 'Massage' });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();
      expect(result.data.data.length).toBeGreaterThanOrEqual(1);

      const massageEvent = result.data.data.find((e: any) => e.id === event1Id);
      expect(massageEvent).toBeDefined();
      expect(massageEvent?.title).toContain('Massage');
    });

    test('should search by title (partial match)', async () => {
      const result = await listBookingEvents(apiClient, { q: 'Yoga' });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();

      const yogaEvent = result.data.data.find((e: any) => e.id === event4Id);
      expect(yogaEvent).toBeDefined();
    });

    test('should search by description', async () => {
      const result = await listBookingEvents(apiClient, { q: 'cognitive behavioral' });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();

      const counselingEvent = result.data.data.find((e: any) => e.id === event2Id);
      expect(counselingEvent).toBeDefined();
      expect(counselingEvent?.description).toContain('cognitive behavioral');
    });

    test('should search by keywords array', async () => {
      const result = await listBookingEvents(apiClient, { q: 'fitness' });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();

      const fitnessEvent = result.data.data.find((e: any) => e.id === event3Id);
      expect(fitnessEvent).toBeDefined();
      expect(fitnessEvent?.keywords).toContain('fitness');
    });

    test('should search with multiple words (natural language)', async () => {
      const result = await listBookingEvents(apiClient, { q: 'mental health counseling' });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();

      const counselingEvent = result.data.data.find((e: any) => e.id === event2Id);
      expect(counselingEvent).toBeDefined();
    });

    test('should return empty results for non-existent search', async () => {
      const result = await listBookingEvents(apiClient, { q: 'nonexistentkeyword12345' });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();
      expect(result.data.data.length).toBe(0);
    });

    test('should handle special characters in search', async () => {
      const result = await listBookingEvents(apiClient, { q: 'one-on-one' });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();

      const fitnessEvent = result.data.data.find((e: any) => e.id === event3Id);
      expect(fitnessEvent).toBeDefined();
    });
  });

  // ========================================================================
  // OR TAG FILTERING TESTS (CSV format: ?tags=a,b,c)
  // ========================================================================

  describe('OR Tag Filtering Tests (CSV)', () => {
    test('should filter by single tag', async () => {
      const result = await listBookingEvents(apiClient, { tags: 'massage' });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();

      const massageEvent = result.data.data.find((e: any) => e.id === event1Id);
      expect(massageEvent).toBeDefined();
      expect(massageEvent?.tags).toContain('massage');
    });

    test('should filter by multiple tags (OR logic)', async () => {
      // Should match events with 'massage' OR 'fitness' OR 'yoga'
      const result = await listBookingEvents(apiClient, { tags: 'massage,fitness,yoga' });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();
      expect(result.data.data.length).toBeGreaterThanOrEqual(3);

      const ids = result.data.data.map((e: any) => e.id);
      expect(ids).toContain(event1Id); // massage
      expect(ids).toContain(event3Id); // fitness
      expect(ids).toContain(event4Id); // yoga
    });

    test('should match events with at least one tag', async () => {
      // wellness tag is shared by providers 1, 3, and 4
      const result = await listBookingEvents(apiClient, { tags: 'wellness' });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();
      expect(result.data.data.length).toBeGreaterThanOrEqual(3);

      const ids = result.data.data.map((e: any) => e.id);
      expect(ids).toContain(event1Id);
      expect(ids).toContain(event3Id);
      expect(ids).toContain(event4Id);
    });

    test('should return empty for non-existent tag', async () => {
      const result = await listBookingEvents(apiClient, { tags: 'nonexistenttag' });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();
      expect(result.data.data.length).toBe(0);
    });

    test('should handle whitespace in CSV tags', async () => {
      const result = await listBookingEvents(apiClient, { tags: 'massage, wellness' });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();

      // Should match events with massage OR wellness
      const ids = result.data.data.map((e: any) => e.id);
      expect(ids).toContain(event1Id);
    });
  });

  // ========================================================================
  // AND TAG FILTERING TESTS (Repeated params: ?tags=a&tags=b)
  // ========================================================================

  describe('AND Tag Filtering Tests (Repeated Params)', () => {
    test('should filter by single repeated tag', async () => {
      const result = await listBookingEvents(apiClient, { tags: ['therapy'] });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();

      const ids = result.data.data.map((e: any) => e.id);
      expect(ids).toContain(event2Id); // mental health has therapy tag
    });

    test('should filter by multiple tags (AND logic)', async () => {
      // Should match only events with BOTH 'wellness' AND 'certified'
      const result = await listBookingEvents(apiClient, { tags: ['wellness', 'certified'] });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();

      const ids = result.data.data.map((e: any) => e.id);
      expect(ids).toContain(event1Id); // massage: wellness + certified
      expect(ids).toContain(event3Id); // fitness: wellness + certified
      expect(ids).toContain(event4Id); // yoga: wellness + certified
      expect(ids).not.toContain(event2Id); // counseling: has licensed, not certified
    });

    test('should require ALL specified tags', async () => {
      // Should match only events with BOTH 'therapy' AND 'licensed'
      const result = await listBookingEvents(apiClient, { tags: ['therapy', 'licensed'] });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();

      const ids = result.data.data.map((e: any) => e.id);
      expect(ids).toContain(event2Id); // Only counseling has both therapy and licensed
      expect(ids).not.toContain(event1Id); // massage doesn't have therapy tag
    });

    test('should return empty when not all tags match', async () => {
      // No event has ALL of these tags: ['massage', 'therapy', 'fitness']
      // event1: ['massage', 'wellness', 'certified'] - has massage but not therapy or fitness
      // event2: ['therapy', 'mental-health', 'licensed'] - has therapy but not massage or fitness
      // event3: ['fitness', 'wellness', 'certified'] - has fitness but not massage or therapy
      // event4: ['wellness', 'yoga', 'certified'] - has none of these
      const result = await listBookingEvents(apiClient, { tags: ['massage', 'therapy', 'fitness'] });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();

      // Verify none of our test events match (proper test isolation)
      const ids = result.data.data.map((e: any) => e.id);
      expect(ids).not.toContain(event1Id);
      expect(ids).not.toContain(event2Id);
      expect(ids).not.toContain(event3Id);
      expect(ids).not.toContain(event4Id);
    });

    test('should be order independent', async () => {
      const result1 = await listBookingEvents(apiClient, { tags: ['wellness', 'certified'] });
      const result2 = await listBookingEvents(apiClient, { tags: ['certified', 'wellness'] });

      expect(result1.response.ok).toBe(true);
      expect(result2.response.ok).toBe(true);

      const ids1 = result1.data.data.map((e: any) => e.id).sort();
      const ids2 = result2.data.data.map((e: any) => e.id).sort();

      expect(ids1).toEqual(ids2);
    });
  });

  // ========================================================================
  // COMBINED FILTERING TESTS
  // ========================================================================

  describe('Combined Filtering Tests', () => {
    test('should combine text search with OR tags', async () => {
      // Search for "therapy" and filter by wellness OR fitness
      const result = await listBookingEvents(apiClient, {
        q: 'therapy',
        tags: 'wellness,fitness'
      });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();

      const ids = result.data.data.map((e: any) => e.id);
      // Should match massage (has therapy keyword + wellness tag)
      expect(ids).toContain(event1Id);
    });

    test('should combine text search with AND tags', async () => {
      // Search for events with "wellness" in text AND have both wellness + certified tags
      const result = await listBookingEvents(apiClient, {
        q: 'wellness',
        tags: ['wellness', 'certified']
      });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();

      const ids = result.data.data.map((e: any) => e.id);
      expect(ids).toContain(event1Id); // massage
      expect(ids).toContain(event4Id); // yoga
    });

    test('should combine status filter with text search', async () => {
      const result = await listBookingEvents(apiClient, {
        status: 'active',
        q: 'training'
      });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();

      const ids = result.data.data.map((e: any) => e.id);
      expect(ids).toContain(event3Id); // fitness training
    });

    test('should combine status filter with tags', async () => {
      const result = await listBookingEvents(apiClient, {
        status: 'active',
        tags: 'wellness'
      });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();
      expect(result.data.data.length).toBeGreaterThanOrEqual(3);
    });

    test('should combine owner filter with text search and tags', async () => {
      const result = await listBookingEvents(apiClient, {
        owner: provider1Id,
        q: 'massage',
        tags: 'wellness'
      });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();
      expect(result.data.data.length).toBeGreaterThanOrEqual(1);

      const event = result.data.data[0];
      expect(event.id).toBe(event1Id);
      expect(event.owner).toBe(provider1Id);
    });
  });

  // ========================================================================
  // EDGE CASES
  // ========================================================================

  describe('Edge Cases', () => {
    test('should handle empty tags parameter', async () => {
      const result = await listBookingEvents(apiClient, { tags: '' });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();
    });

    test('should handle whitespace-only tags', async () => {
      const result = await listBookingEvents(apiClient, { tags: '   ' });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();
    });

    test('should handle very long search query', async () => {
      const longQuery = 'a'.repeat(400);
      const result = await listBookingEvents(apiClient, { q: longQuery });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();
    });

    test('should support pagination with search results', async () => {
      const result = await listBookingEvents(apiClient, {
        q: 'wellness',
        limit: 2,
        offset: 0
      });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();
      expect(result.data.data.length).toBeLessThanOrEqual(2);
      expect(result.data.totalCount).toBeDefined();
    });

    test('should handle no results scenario', async () => {
      const result = await listBookingEvents(apiClient, {
        q: 'nonexistent',
        tags: 'alsonotexist'
      });

      expect(result.response.ok).toBe(true);
      expect(result.data?.data).toBeDefined();
      expect(result.data.data.length).toBe(0);
    });
  });

  // ========================================================================
  // RESPONSE STRUCTURE VALIDATION
  // ========================================================================

  describe('Response Structure Tests', () => {
    test('should include keywords and tags in response', async () => {
      const result = await listBookingEvents(apiClient, { tags: 'massage' });

      expect(result.response.ok).toBe(true);
      const massageEvent = result.data.data.find((e: any) => e.id === event1Id);

      expect(massageEvent).toBeDefined();
      expect(massageEvent?.keywords).toBeDefined();
      expect(Array.isArray(massageEvent?.keywords)).toBe(true);
      expect(massageEvent?.tags).toBeDefined();
      expect(Array.isArray(massageEvent?.tags)).toBe(true);

      expect(massageEvent?.keywords).toContain('massage');
      expect(massageEvent?.tags).toContain('massage');
    });

    test('should include pagination metadata', async () => {
      const result = await listBookingEvents(apiClient, { tags: 'wellness' });

      expect(result.response.ok).toBe(true);
      expect(result.data?.totalCount).toBeDefined();
      expect(result.data.totalCount).toBeGreaterThanOrEqual(0);
    });
  });
});
