/**
 * Audit E2E Tests
 * Tests audit log generation and querying
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createApiClient, type ApiClient } from '../../helpers/client';
import { createTestApp, type TestApp } from '../../helpers/test-app';
import { listAuditLogs, waitForAuditLog } from '../../helpers/audit';
import { createPerson, updatePerson, getPerson, generateTestPersonData } from '../../helpers/person';
import { faker } from '@faker-js/faker';

describe('Audit E2E Tests', () => {
  let testApp: TestApp;
  let apiClient: ApiClient;
  let adminClient: ApiClient;

  beforeAll(async () => {
    testApp = await createTestApp();

    // Regular user for triggering auditable actions
    apiClient = createApiClient({ app: testApp.app });
    await apiClient.signup();

    // Admin user for querying audit logs
    adminClient = createApiClient({ app: testApp.app });
    await adminClient.signinAsAdmin();
  }, 30000);

  afterAll(async () => {
    await testApp?.cleanup();
  });

  describe('Person Audit Logging', () => {
    test('should create audit log when person profile is created', async () => {
      const user = apiClient.getUser();

      // Check if person already exists (signup might create it automatically)
      const { response: getResponse } = await getPerson(apiClient, user?.id);

      if (getResponse.status === 404) {
        // Person doesn't exist, create it
        const personData = generateTestPersonData();

        const { response: createResponse } = await createPerson(apiClient, personData);
        expect(createResponse.ok).toBe(true);
      }

      // Wait for audit log to be created (use admin to query)
      const auditLog = await waitForAuditLog(
        adminClient,
        log =>
          log.eventType === 'data-modification' &&
          log.action === 'create' &&
          log.resourceType === 'person' &&
          log.resource === user?.id
      );

      // Verify audit log was created
      expect(auditLog).toBeDefined();
      expect(auditLog.category).toBe('privacy');
      expect(auditLog.outcome).toBe('success');
      expect(auditLog.user).toBe(user?.id);
      expect(auditLog.description).toBe('Person profile created');
      expect(auditLog.details).toBeDefined();
      expect(auditLog.ipAddress).toBeDefined();
    });

    test('should create audit log when person profile is updated', async () => {
      const user = apiClient.getUser();

      // Ensure person exists before updating
      const { response: getResponse } = await getPerson(apiClient, user?.id);

      if (getResponse.status === 404) {
        // Person doesn't exist, create it first
        const personData = generateTestPersonData();
        await createPerson(apiClient, personData);
      }

      // Update person profile using user ID directly
      const updateData = {
        firstName: faker.person.firstName(),
        timezone: 'America/New_York'
      };

      const { response: updateResponse } = await updatePerson(apiClient, user?.id, updateData);
      expect(updateResponse.ok).toBe(true);

      // Wait for audit log to be created (use admin to query)
      const auditLog = await waitForAuditLog(
        adminClient,
        log =>
          log.eventType === 'data-modification' &&
          log.action === 'update' &&
          log.resourceType === 'person' &&
          log.resource === user?.id
      );

      // Verify audit log was created
      expect(auditLog).toBeDefined();
      expect(auditLog.category).toBe('privacy');
      expect(auditLog.outcome).toBe('success');
      expect(auditLog.user).toBe(user?.id);
      expect(auditLog.description).toBe('Person profile updated');
      expect(auditLog.details.updatedFields).toBeDefined();
      expect(auditLog.details.updatedFields).toContain('firstName');
      expect(auditLog.details.updatedFields).toContain('timezone');
    });
  });

  describe('Audit Log Querying', () => {
    test('should list audit logs with pagination', async () => {
      const { response, data } = await listAuditLogs(adminClient, {
        limit: 10,
        offset: 0
      });

      expect(response.ok).toBe(true);
      expect(data.data).toBeInstanceOf(Array);
      expect(data.pagination).toBeDefined();
      expect(data.pagination.limit).toBe(10);
      expect(data.pagination.offset).toBe(0);
    });

    test('should filter audit logs by resourceType', async () => {
      const { response, data } = await listAuditLogs(adminClient, {
        resourceType: 'person'
      });

      expect(response.ok).toBe(true);
      expect(data.data).toBeInstanceOf(Array);

      // All returned logs should be for person resources
      data.data.forEach((log: any) => {
        expect(log.resourceType).toBe('person');
      });
    });

    test('should filter audit logs by action', async () => {
      const { response, data } = await listAuditLogs(adminClient, {
        action: 'update'
      });

      expect(response.ok).toBe(true);
      expect(data.data).toBeInstanceOf(Array);

      // All returned logs should have update action
      data.data.forEach((log: any) => {
        expect(log.action).toBe('update');
      });
    });

    test('should filter audit logs by user', async () => {
      const user = apiClient.getUser();

      const { response, data } = await listAuditLogs(adminClient, {
        user: user?.id
      });

      expect(response.ok).toBe(true);
      expect(data.data).toBeInstanceOf(Array);

      // All returned logs should be for the current user
      data.data.forEach((log: any) => {
        expect(log.user).toBe(user?.id);
      });
    });

    test('should filter audit logs by date range', async () => {
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0); // Start of today

      const { response, data } = await listAuditLogs(adminClient, {
        startDate: startDate.toISOString()
      });

      expect(response.ok).toBe(true);
      expect(data.data).toBeInstanceOf(Array);

      // All returned logs should be from today onwards
      data.data.forEach((log: any) => {
        const logDate = new Date(log.createdAt);
        expect(logDate >= startDate).toBe(true);
      });
    });

    test('should combine multiple filters', async () => {
      const user = apiClient.getUser();

      const { response, data } = await listAuditLogs(adminClient, {
        resourceType: 'person',
        action: 'update',
        user: user?.id
      });

      expect(response.ok).toBe(true);
      expect(data.data).toBeInstanceOf(Array);

      // All returned logs should match all filters
      data.data.forEach((log: any) => {
        expect(log.resourceType).toBe('person');
        expect(log.action).toBe('update');
        expect(log.user).toBe(user?.id);
      });
    });

    test('should handle pagination correctly', async () => {
      // Get first page
      const page1 = await listAuditLogs(adminClient, { limit: 2, offset: 0 });
      expect(page1.response.ok).toBe(true);
      expect(page1.data.data.length).toBeLessThanOrEqual(2);

      if (page1.data.pagination.totalCount > 2) {
        // Get second page
        const page2 = await listAuditLogs(adminClient, { limit: 2, offset: 2 });
        expect(page2.response.ok).toBe(true);

        // Ensure no overlap between pages
        const page1Ids = page1.data.data.map((log: any) => log.id);
        const page2Ids = page2.data.data.map((log: any) => log.id);
        const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
        expect(overlap.length).toBe(0);
      }
    });

    test('should return empty results for non-existent resource', async () => {
      const fakeUserId = faker.string.uuid();

      const { response, data } = await listAuditLogs(adminClient, {
        user: fakeUserId
      });

      expect(response.ok).toBe(true);
      expect(data.data).toBeInstanceOf(Array);
      expect(data.data.length).toBe(0);
    });

    test('should filter audit logs by resource UUID', async () => {
      const user = apiClient.getUser();

      const { response, data } = await listAuditLogs(adminClient, {
        resource: user?.id
      });

      expect(response.ok).toBe(true);
      expect(data.data).toBeInstanceOf(Array);

      // All returned logs should be for the specified resource
      data.data.forEach((log: any) => {
        expect(log.resource).toBe(user?.id);
      });
    });

    test('should filter audit logs by endDate', async () => {
      const endDate = new Date();

      const { response, data } = await listAuditLogs(adminClient, {
        endDate: endDate.toISOString()
      });

      expect(response.ok).toBe(true);
      expect(data.data).toBeInstanceOf(Array);

      // All returned logs should be before or at endDate
      data.data.forEach((log: any) => {
        const logDate = new Date(log.createdAt);
        expect(logDate <= endDate).toBe(true);
      });
    });

    test('should filter audit logs with startDate and endDate range', async () => {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 1); // Yesterday

      const { response, data } = await listAuditLogs(adminClient, {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });

      expect(response.ok).toBe(true);
      expect(data.data).toBeInstanceOf(Array);

      // All returned logs should be within the date range
      data.data.forEach((log: any) => {
        const logDate = new Date(log.createdAt);
        expect(logDate >= startDate).toBe(true);
        expect(logDate <= endDate).toBe(true);
      });
    });

    test('should support page/pageSize pagination', async () => {
      const { response, data } = await listAuditLogs(adminClient, {
        page: 1,
        pageSize: 5
      });

      expect(response.ok).toBe(true);
      expect(data.data).toBeInstanceOf(Array);
      expect(data.data.length).toBeLessThanOrEqual(5);
      expect(data.pagination).toBeDefined();
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.pageSize).toBe(5);
    });
  });

  describe('Response Schema Validation', () => {
    test('should return properly structured response with data and pagination', async () => {
      const { response, data } = await listAuditLogs(adminClient, { limit: 1 });

      expect(response.ok).toBe(true);
      
      // Validate response structure
      expect(data).toBeDefined();
      expect(data.data).toBeInstanceOf(Array);
      expect(data.pagination).toBeDefined();
      
      // Validate pagination metadata structure
      expect(data.pagination).toHaveProperty('offset');
      expect(data.pagination).toHaveProperty('limit');
      expect(data.pagination).toHaveProperty('totalCount');
    });

    test('should validate BaseEntity fields on audit log entries', async () => {
      const { data } = await listAuditLogs(adminClient, { limit: 1 });

      expect(data.data.length).toBeGreaterThan(0);
      const log = data.data[0];

      // BaseEntity fields
      expect(log.id).toBeDefined();
      expect(typeof log.id).toBe('string');
      expect(log.createdAt).toBeDefined();
      expect(typeof log.createdAt).toBe('string');
      expect(log.updatedAt).toBeDefined();
      expect(typeof log.updatedAt).toBe('string');
    });

    test('should validate UUID format for id and user fields', async () => {
      const { data } = await listAuditLogs(adminClient, { limit: 1 });

      expect(data.data.length).toBeGreaterThan(0);
      const log = data.data[0];

      // UUID regex pattern
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      expect(log.id).toMatch(uuidRegex);
      if (log.user) {
        expect(log.user).toMatch(uuidRegex);
      }
    });

    test('should validate ISO-8601 date-time format for timestamps', async () => {
      const { data } = await listAuditLogs(adminClient, { limit: 1 });

      expect(data.data.length).toBeGreaterThan(0);
      const log = data.data[0];

      // Validate date-time strings can be parsed
      expect(new Date(log.createdAt).toString()).not.toBe('Invalid Date');
      expect(new Date(log.updatedAt).toString()).not.toBe('Invalid Date');

      // ISO-8601 format check
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
      expect(log.createdAt).toMatch(isoRegex);
      expect(log.updatedAt).toMatch(isoRegex);
    });

    test('should validate enum values match TypeSpec specification', async () => {
      const { data } = await listAuditLogs(adminClient, { limit: 10 });

      expect(data.data.length).toBeGreaterThan(0);

      const validEventTypes = ['authentication', 'data-access', 'data-modification', 'system-config', 'security', 'compliance'];
      const validCategories = ['regulatory', 'security', 'privacy', 'administrative', 'domain', 'financial'];
      const validActions = ['create', 'read', 'update', 'delete', 'login', 'logout'];
      const validOutcomes = ['success', 'failure', 'partial', 'denied'];
      const validRetentionStatuses = ['active', 'archived', 'pending-purge'];
      const validUserTypes = ['user', 'client', 'service_provider', 'admin', 'system'];

      data.data.forEach((log: any) => {
        expect(validEventTypes).toContain(log.eventType);
        expect(validCategories).toContain(log.category);
        expect(validActions).toContain(log.action);
        expect(validOutcomes).toContain(log.outcome);
        expect(validRetentionStatuses).toContain(log.retentionStatus);
        
        if (log.userType) {
          expect(validUserTypes).toContain(log.userType);
        }
      });
    });

    test('should validate required fields are present', async () => {
      const { data } = await listAuditLogs(adminClient, { limit: 1 });

      expect(data.data.length).toBeGreaterThan(0);
      const log = data.data[0];

      // Required fields from TypeSpec
      expect(log.eventType).toBeDefined();
      expect(log.category).toBeDefined();
      expect(log.resourceType).toBeDefined();
      expect(log.resource).toBeDefined();
      expect(log.action).toBeDefined();
      expect(log.outcome).toBeDefined();
      expect(log.description).toBeDefined();
      expect(log.retentionStatus).toBeDefined();
    });
  });

  describe('Authorization', () => {
    test('should return 401 when accessing without authentication', async () => {
      // Create a client without authentication
      const unauthClient = createApiClient({ app: testApp.app });

      const { response } = await listAuditLogs(unauthClient, { limit: 10 });

      expect(response.status).toBe(401);
    });

    test('should return 403 when accessing as non-admin user', async () => {
      // Regular user (not admin) tries to access audit logs
      const { response } = await listAuditLogs(apiClient, { limit: 10 });

      expect(response.status).toBe(403);
    });
  });

  describe('Audit Log Metadata', () => {
    test('audit logs should include IP address and user agent', async () => {
      const user = apiClient.getUser();

      // Ensure person exists before updating
      const { response: getResponse } = await getPerson(apiClient, user?.id);

      if (getResponse.status === 404) {
        // Person doesn't exist, create it first
        const personData = generateTestPersonData();
        await createPerson(apiClient, personData);
      }

      // Trigger an auditable action
      await updatePerson(apiClient, user?.id, { timezone: 'UTC' });

      // Get the audit log (use admin to query)
      const auditLog = await waitForAuditLog(
        adminClient,
        log =>
          log.resourceType === 'person' &&
          log.action === 'update' &&
          log.user === user?.id
      );

      expect(auditLog).toBeDefined();
      expect(auditLog.ipAddress).toBeDefined();
      expect(auditLog.userAgent).toBeDefined();
    });

    test('audit logs should have integrity hash', async () => {
      const { data } = await listAuditLogs(adminClient, { limit: 1 });

      expect(data.data.length).toBeGreaterThan(0);

      const log = data.data[0];
      expect(log.integrityHash).toBeDefined();
      expect(typeof log.integrityHash).toBe('string');
      expect(log.integrityHash.length).toBe(64); // SHA-256 hash length
    });

    test('audit logs should have retention status', async () => {
      const { data } = await listAuditLogs(adminClient, { limit: 1 });

      expect(data.data.length).toBeGreaterThan(0);

      const log = data.data[0];
      expect(log.retentionStatus).toBeDefined();
      expect(['active', 'archived', 'pending-purge']).toContain(log.retentionStatus);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle invalid UUID format for user filter', async () => {
      const { response, data } = await listAuditLogs(adminClient, {
        user: 'invalid-uuid-format'
      });

      // Should either return 400 Bad Request or empty results
      // depending on validator behavior
      if (response.status === 400) {
        expect(response.ok).toBe(false);
      } else {
        expect(response.ok).toBe(true);
        expect(data.data).toBeInstanceOf(Array);
      }
    });

    test('should handle invalid UUID format for resource filter', async () => {
      const { response, data } = await listAuditLogs(adminClient, {
        resource: 'not-a-valid-uuid'
      });

      // Should either return 400 Bad Request or empty results
      if (response.status === 400) {
        expect(response.ok).toBe(false);
      } else {
        expect(response.ok).toBe(true);
        expect(data.data).toBeInstanceOf(Array);
      }
    });

    test('should handle invalid date format for startDate', async () => {
      const { response } = await listAuditLogs(adminClient, {
        startDate: 'not-a-date'
      });

      // Should return 400 Bad Request for invalid date format
      expect(response.status).toBe(400);
    });

    test('should handle invalid date format for endDate', async () => {
      const { response } = await listAuditLogs(adminClient, {
        endDate: 'invalid-date-string'
      });

      // Should return 400 Bad Request for invalid date format
      expect(response.status).toBe(400);
    });

    test('should handle invalid enum value for action parameter', async () => {
      const { response } = await listAuditLogs(adminClient, {
        action: 'invalid-action' as any
      });

      // Should return 400 Bad Request for invalid enum value
      expect(response.status).toBe(400);
    });

    test('should handle negative pagination values', async () => {
      const { response, data } = await listAuditLogs(adminClient, {
        offset: -1,
        limit: -5
      });

      // Should either return 400 or handle gracefully with defaults
      if (response.status === 400) {
        expect(response.ok).toBe(false);
      } else {
        expect(response.ok).toBe(true);
        expect(data.data).toBeInstanceOf(Array);
      }
    });

    test('should handle zero limit pagination', async () => {
      const { response, data } = await listAuditLogs(adminClient, {
        limit: 0
      });

      // Should either return 400 for invalid limit or handle with empty array
      if (response.status === 400) {
        expect(response.ok).toBe(false);
      } else {
        expect(response.ok).toBe(true);
        expect(data.data).toBeInstanceOf(Array);
        expect(data.data.length).toBe(0);
      }
    });

    test('should handle very large pagination offset', async () => {
      const { response, data } = await listAuditLogs(adminClient, {
        offset: 999999
      });

      expect(response.ok).toBe(true);
      expect(data.data).toBeInstanceOf(Array);
      expect(data.data.length).toBe(0);
    });
  });
});
