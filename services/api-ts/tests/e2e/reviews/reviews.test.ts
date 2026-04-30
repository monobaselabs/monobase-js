/**
 * Reviews Module E2E Tests
 * Tests the flexible NPS review system with application-defined review types
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createApiClient, type ApiClient } from '../../helpers/client';
import { createTestApp, type TestApp } from '../../helpers/test-app';
import { createPerson, generateTestPersonData } from '../../helpers/person';
import { faker } from '@faker-js/faker';

describe('Reviews Module E2E Tests', () => {
  let testApp: TestApp;
  let patientClient: ApiClient;
  let providerClient: ApiClient;
  
  let patientPersonId: string;
  let providerPersonId: string;
  let contextId: string; // Simulates a booking/session ID

  beforeAll(async () => {
    testApp = await createTestApp({ storage: true });

    // Create API clients
    patientClient = createApiClient({ app: testApp.app });
    providerClient = createApiClient({ app: testApp.app });

    // Sign up users
    await patientClient.signup();
    await providerClient.signup();

    patientPersonId = patientClient.currentUser!.id;
    providerPersonId = providerClient.currentUser!.id;

    // Create Person records
    await createPerson(patientClient, generateTestPersonData());
    await createPerson(providerClient, generateTestPersonData());

    // Generate a context ID (simulating a booking/appointment)
    contextId = faker.string.uuid();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  describe('POST /reviews - Create Review', () => {
    test('should create a provider review successfully', async () => {
      const response = await patientClient.fetch('/reviews/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: contextId,
          reviewType: 'provider',
          reviewedEntity: providerPersonId,
          npsScore: 9,
          comment: 'Excellent service, very professional',
        }),
      });

      expect(response.status).toBe(201);
      const review = await response.json();
      expect(review.context).toBe(contextId);
      expect(review.reviewer).toBe(patientPersonId);
      expect(review.reviewType).toBe('provider');
      expect(review.reviewedEntity).toBe(providerPersonId);
      expect(review.npsScore).toBe(9);
      expect(review.comment).toBe('Excellent service, very professional');
      expect(review.id).toBeDefined();
      expect(review.createdAt).toBeDefined();
    });

    test('should create a platform review successfully', async () => {
      const response = await patientClient.fetch('/reviews/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: contextId,
          reviewType: 'platform',
          npsScore: 8,
          comment: 'Great video call quality',
        }),
      });

      expect(response.status).toBe(201);
      const review = await response.json();
      expect(review.reviewType).toBe('platform');
      expect(review.reviewedEntity).toBeNull();
      expect(review.npsScore).toBe(8);
    });

    test('should prevent duplicate reviews', async () => {
      // Try to create the same provider review again
      const response = await patientClient.fetch('/reviews/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: contextId,
          reviewType: 'provider',
          reviewedEntity: providerPersonId,
          npsScore: 10,
        }),
      });

      expect(response.status).toBe(409); // Conflict
      const error = await response.json();
      expect(error.message).toContain('already exists');
    });

    test('should prevent self-reviews', async () => {
      const response = await providerClient.fetch('/reviews/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: contextId,
          reviewType: 'provider',
          reviewedEntity: providerPersonId, // Trying to review themselves
          npsScore: 10,
        }),
      });

      expect(response.status).toBe(400); // Bad Request
      const error = await response.json();
      expect(error.message).toContain('Cannot review yourself');
    });

    test('should validate NPS score range', async () => {
      const response = await patientClient.fetch('/reviews/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: faker.string.uuid(),
          reviewType: 'provider',
          reviewedEntity: providerPersonId,
          npsScore: 11, // Invalid: > 10
        }),
      });

      expect(response.status).toBe(400);
    });

    test('should allow provider to review platform', async () => {
      const providerContextId = faker.string.uuid();
      const response = await providerClient.fetch('/reviews/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: providerContextId,
          reviewType: 'platform',
          npsScore: 7,
          comment: 'Platform works well overall',
        }),
      });

      expect(response.status).toBe(201);
      const review = await response.json();
      expect(review.reviewer).toBe(providerPersonId);
      expect(review.reviewType).toBe('platform');
    });

    test('should support custom review types', async () => {
      const customContextId = faker.string.uuid();
      const response = await patientClient.fetch('/reviews/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: customContextId,
          reviewType: 'booking_experience',
          npsScore: 9,
          comment: 'Easy to book and reschedule',
        }),
      });

      expect(response.status).toBe(201);
      const review = await response.json();
      expect(review.reviewType).toBe('booking_experience');
    });
  });

  describe('GET /reviews - List Reviews', () => {
    test('should list user own reviews', async () => {
      const response = await patientClient.fetch('/reviews/');

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.data).toBeArray();
      expect(result.data.length).toBeGreaterThan(0);
      
      // All reviews should be created by the patient
      result.data.forEach((review: any) => {
        expect(review.reviewer).toBe(patientPersonId);
      });
    });

    test('should filter by context', async () => {
      const response = await patientClient.fetch(`/reviews/?context=${contextId}`);

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.data).toBeArray();
      
      // All reviews should have the specified context
      result.data.forEach((review: any) => {
        expect(review.context).toBe(contextId);
      });
    });

    test('should filter by reviewType', async () => {
      const response = await patientClient.fetch('/reviews/?reviewType=provider');

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.data).toBeArray();
      
      result.data.forEach((review: any) => {
        expect(review.reviewType).toBe('provider');
      });
    });

    test('should allow viewing reviews about self', async () => {
      const response = await providerClient.fetch(`/reviews/?reviewedEntity=${providerPersonId}`);

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.data).toBeArray();
      expect(result.data.length).toBeGreaterThan(0);
      
      // All reviews should be about the provider
      result.data.forEach((review: any) => {
        expect(review.reviewedEntity).toBe(providerPersonId);
      });
    });

    test('should prevent viewing others reviews without permission', async () => {
      // Provider trying to view patient's reviews
      const response = await providerClient.fetch(`/reviews/?reviewer=${patientPersonId}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /reviews/{id} - Get Review', () => {
    let reviewId: string;

    beforeAll(async () => {
      // Create a review to test with
      const newContextId = faker.string.uuid();
      const response = await patientClient.fetch('/reviews/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: newContextId,
          reviewType: 'test',
          reviewedEntity: providerPersonId,
          npsScore: 8,
        }),
      });
      const review = await response.json();
      reviewId = review.id;
    });

    test('should get review by ID as reviewer', async () => {
      const response = await patientClient.fetch(`/reviews/${reviewId}`);

      expect(response.status).toBe(200);
      const review = await response.json();
      expect(review.id).toBe(reviewId);
      expect(review.reviewer).toBe(patientPersonId);
    });

    test('should get review by ID as reviewed entity', async () => {
      const response = await providerClient.fetch(`/reviews/${reviewId}`);

      expect(response.status).toBe(200);
      const review = await response.json();
      expect(review.id).toBe(reviewId);
      expect(review.reviewedEntity).toBe(providerPersonId);
    });

    test('should return 404 for non-existent review', async () => {
      const response = await patientClient.fetch(`/reviews/${faker.string.uuid()}`);

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /reviews/{id} - Delete Review', () => {
    let reviewId: string;

    beforeAll(async () => {
      // Create a review to delete
      const newContextId = faker.string.uuid();
      const response = await patientClient.fetch('/reviews/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: newContextId,
          reviewType: 'to_delete',
          npsScore: 5,
        }),
      });
      const review = await response.json();
      reviewId = review.id;
    });

    test('should delete own review', async () => {
      const response = await patientClient.fetch(`/reviews/${reviewId}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(204);

      // Verify review is deleted
      const getResponse = await patientClient.fetch(`/reviews/${reviewId}`);
      expect(getResponse.status).toBe(404);
    });

    test('should prevent deleting others reviews', async () => {
      // Create a review as patient
      const newContextId = faker.string.uuid();
      const createResponse = await patientClient.fetch('/reviews/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: newContextId,
          reviewType: 'test',
          npsScore: 8,
        }),
      });
      const review = await createResponse.json();

      // Try to delete as provider
      const deleteResponse = await providerClient.fetch(`/reviews/${review.id}`, {
        method: 'DELETE',
      });

      expect(deleteResponse.status).toBe(403);
    });
  });

  describe('Review Workflow Integration', () => {
    test('should support complete review lifecycle', async () => {
      const workflowContextId = faker.string.uuid();

      // 1. Patient creates provider review
      const createResponse = await patientClient.fetch('/reviews/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: workflowContextId,
          reviewType: 'provider',
          reviewedEntity: providerPersonId,
          npsScore: 10,
          comment: 'Outstanding service!',
        }),
      });
      expect(createResponse.status).toBe(201);
      const review = await createResponse.json();

      // 2. Provider can view their received review
      const viewResponse = await providerClient.fetch(`/reviews/${review.id}`);
      expect(viewResponse.status).toBe(200);

      // 3. Provider can list their received reviews
      const listResponse = await providerClient.fetch(`/reviews/?reviewedEntity=${providerPersonId}`);
      expect(listResponse.status).toBe(200);
      const result = await listResponse.json();
      expect(result.data.some((r: any) => r.id === review.id)).toBe(true);

      // 4. Patient can delete their review
      const deleteResponse = await patientClient.fetch(`/reviews/${review.id}`, {
        method: 'DELETE',
      });
      expect(deleteResponse.status).toBe(204);
    });
  });
});
