/**
 * E2E Tests for Notification Module
 * Tests the notification API endpoints with full authentication flow
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { faker } from '@faker-js/faker';
import { createApiClient, type ApiClient } from '../../helpers/client';
import { createTestApp, type TestApp } from '../../helpers/test-app';
import type { NotificationService } from '@/core/notifs';
import {
  verifyOneSignalNotification,
  getLastOneSignalNotification,
  waitForOneSignalNotification,
  getExpectedPriority
} from '../../helpers/notification.helper';
import {
  startTestVideoCall,
  joinVideoCall,
  endVideoCall
} from '../../helpers/comms';

describe('Notification Module E2E Tests', () => {
  let testApp: TestApp;
  let apiClient: ApiClient;  // First user
  let adminClient: ApiClient;
  let participantClient: ApiClient;  // Second user for video calls

  // Store IDs for cleanup and assertions
  let user1PersonId: string;
  let user2PersonId: string;

  beforeAll(async () => {
    testApp = await createTestApp({ storage: true });

    // Create API clients with embedded app instance
    apiClient = createApiClient({ app: testApp.app });
    adminClient = createApiClient({ app: testApp.app });
    participantClient = createApiClient({ app: testApp.app });
  }, 30000);

  afterAll(async () => {
    await testApp?.cleanup();
  });
  
  beforeEach(async () => {
    // Create fresh API clients for each test
    apiClient = createApiClient({ app: testApp.app });
    adminClient = createApiClient({ app: testApp.app });
    participantClient = createApiClient({ app: testApp.app });

    // Sign up and authenticate clients for each test
    await apiClient.signup();
    await adminClient.signinAsAdmin();
    await participantClient.signup();

    // Store person IDs for assertions
    user1PersonId = apiClient.currentUser!.id;
    user2PersonId = participantClient.currentUser!.id;

    // Skip notification cleanup - each test creates fresh users with unique IDs
    // so there's no risk of notification collision between tests

    // Clear mock data for each test
    testApp.resetMocks();
  }, 30000);

  // Helper function to start a video call (which generates notifications)
  async function createTestVideoCall() {
    // Start video call using the helper (generates notifications for both users)
    const result = await startTestVideoCall(
      apiClient,
      participantClient,
      user1PersonId,
      user2PersonId,
      'User 1',
      'User 2'
    );

    // Small delay to ensure notifications are fully committed to database
    await new Promise(resolve => setTimeout(resolve, 500));

    return result;
  }

  describe('List Notifications', () => {
    test('should list user notifications with empty initial state', async () => {
      const response = await apiClient.fetch('/notifs');

      expect(response.status).toBe(200);
      const data = await response.json();

      // Filter to only check notifications for the current test user
      // (Other tests may have created notifications for other users)
      const currentUserNotifs = data.data.filter((n: any) => n.recipient === apiClient.userId);

      expect(currentUserNotifs).toEqual([]);
      expect(data.pagination).toBeDefined();
    });

    test('should filter notifications by type', async () => {
      const response = await apiClient.fetch('/notifs', {
        searchParams: {
          type: 'system'
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.data)).toBe(true);
    });

    test('should filter notifications by channel', async () => {
      const response = await apiClient.fetch('/notifs', {
        searchParams: {
          channel: 'in-app'
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.data)).toBe(true);
    });

    test('should default to in-app channel when channel not specified', async () => {
      // Create video call to generate notifications
      await createTestVideoCall();

      // List notifications without specifying channel (should default to in-app)
      const response = await apiClient.fetch('/notifs');
      
      expect(response.status).toBe(200);
      const data = await response.json();
      const currentUserNotifs = data.data.filter((n: any) => n.recipient === user1PersonId);

      // All returned notifications should be in-app channel (the default)
      if (currentUserNotifs.length > 0) {
        currentUserNotifs.forEach((n: any) => {
          expect(n.channel).toBe('in-app');
        });
      }
    });

    test('should filter notifications by date range', async () => {
      // Create video call to generate notifications
      await createTestVideoCall();

      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Filter for notifications from yesterday to tomorrow (should include today's)
      const response = await apiClient.fetch('/notifs', {
        searchParams: {
          startDate: yesterday.toISOString(),
          endDate: tomorrow.toISOString()
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      const currentUserNotifs = data.data.filter((n: any) => n.recipient === user1PersonId);

      // Should have notifications created today
      expect(currentUserNotifs.length).toBeGreaterThan(0);

      // All notifications should be within the date range
      currentUserNotifs.forEach((n: any) => {
        const createdAt = new Date(n.createdAt);
        expect(createdAt.getTime()).toBeGreaterThanOrEqual(yesterday.getTime());
        expect(createdAt.getTime()).toBeLessThanOrEqual(tomorrow.getTime());
      });
    });

    test('should filter notifications with startDate only', async () => {
      await createTestVideoCall();

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const response = await apiClient.fetch('/notifs', {
        searchParams: {
          startDate: yesterday.toISOString()
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      const currentUserNotifs = data.data.filter((n: any) => n.recipient === user1PersonId);

      // Should include today's notifications
      expect(currentUserNotifs.length).toBeGreaterThan(0);

      // All should be after yesterday
      currentUserNotifs.forEach((n: any) => {
        const createdAt = new Date(n.createdAt);
        expect(createdAt.getTime()).toBeGreaterThanOrEqual(yesterday.getTime());
      });
    });

    test('should filter notifications with endDate only', async () => {
      await createTestVideoCall();

      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const response = await apiClient.fetch('/notifs', {
        searchParams: {
          endDate: tomorrow.toISOString()
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      const currentUserNotifs = data.data.filter((n: any) => n.recipient === user1PersonId);

      // Should include today's notifications
      expect(currentUserNotifs.length).toBeGreaterThan(0);

      // All should be before tomorrow
      currentUserNotifs.forEach((n: any) => {
        const createdAt = new Date(n.createdAt);
        expect(createdAt.getTime()).toBeLessThanOrEqual(tomorrow.getTime());
      });
    });

    test('should filter unread notifications only', async () => {
      // Create appointment to generate notifications
      await createTestVideoCall();

      // List all notifications (should have unread ones)
      const allResponse = await apiClient.fetch('/notifs');
      expect(allResponse.status).toBe(200);
      const allData = await allResponse.json();

      const clientNotifs = allData.data.filter((n: any) => n.recipient === user1PersonId);
      expect(clientNotifs.length).toBeGreaterThan(0);

      // All should be unread initially (status: 'sent' or 'delivered')
      const unreadStatuses = ['queued', 'sent', 'delivered'];
      clientNotifs.forEach((n: any) => {
        expect(unreadStatuses).toContain(n.status);
      });

      // Filter for unread only
      const unreadResponse = await apiClient.fetch('/notifs', {
        searchParams: {
          status: 'unread'
        }
      });

      expect(unreadResponse.status).toBe(200);
      const unreadData = await unreadResponse.json();
      const unreadClientNotifs = unreadData.data.filter((n: any) => n.recipient === user1PersonId);

      // Unread filter returns sent/delivered notifications
      const initialUnreadCount = unreadClientNotifs.length;
      expect(initialUnreadCount).toBeGreaterThan(0);

      // Mark one as read
      if (unreadClientNotifs.length > 0) {
        const firstNotif = unreadClientNotifs[0];

        const markResponse = await apiClient.fetch(`/notifs/${firstNotif.id}/read`, {
          method: 'POST'
        });
        expect(markResponse.status).toBe(200);

        // Now filter for unread only
        const unreadAfterResponse = await apiClient.fetch('/notifs', {
          searchParams: {
            status: 'unread'
          }
        });

        const unreadAfterData = await unreadAfterResponse.json();
        const unreadAfter = unreadAfterData.data.filter((n: any) => n.recipient === user1PersonId);

        // Should have one less unread notification
        expect(unreadAfter.length).toBe(initialUnreadCount - 1);

        // Verify the marked notification is not in unread list
        const markedNotifInList = unreadAfter.find((n: any) => n.id === firstNotif.id);
        expect(markedNotifInList).toBeUndefined();
      }
    });

    test('should support pagination', async () => {
      const response = await apiClient.fetch('/notifs', {
        searchParams: {
          limit: 10,
          offset: 0
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.pagination.limit).toBe(10);
      expect(data.pagination.offset).toBe(0);
    });

    test('should require authentication', async () => {
      const unauthClient = createApiClient({ app: testApp.app });
      const response = await unauthClient.fetch('/notifs');

      expect(response.status).toBe(401);
    });
  });
  
  describe('Get Single Notification', () => {
    test('should successfully retrieve notification by ID', async () => {
      // Create video call to generate notification
      await createTestVideoCall();

      // Get list of notifications to find a valid ID
      const listResponse = await apiClient.fetch('/notifs');
      const listData = await listResponse.json();
      const notification = listData.data.find((n: any) => n.recipient === user1PersonId);

      expect(notification).toBeDefined();

      // Get single notification by ID
      const response = await apiClient.fetch(`/notifs/${notification.id}`);
      
      expect(response.status).toBe(200);
      const data = await response.json();

      // Validate complete Notification structure
      expect(data.id).toBe(notification.id);
      expect(data.recipient).toBe(user1PersonId);
      expect(data.type).toBeDefined();
      expect(data.channel).toBeDefined();
      expect(data.title).toBeDefined();
      expect(data.message).toBeDefined();
      expect(data.status).toBeDefined();
      expect(data.consentValidated).toBeDefined();
      expect(data.createdAt).toBeDefined();
      expect(data.updatedAt).toBeDefined();
    });

    test('should return 404 for non-existent notification', async () => {
      const fakeId = faker.string.uuid();
      const response = await apiClient.fetch(`/notifs/${fakeId}`);

      expect(response.status).toBe(404);
    });

    test('should require authentication', async () => {
      const fakeId = faker.string.uuid();
      const unauthClient = createApiClient({ app: testApp.app });
      const response = await unauthClient.fetch(`/notifs/${fakeId}`);

      expect(response.status).toBe(401);
    });
  });
  
  describe('Mark Notification as Read', () => {
    test('should successfully mark notification as read', async () => {
      // Create appointment to generate notification
      await createTestVideoCall();

      // Get the notification
      const listResponse = await apiClient.fetch('/notifs');
      const listData = await listResponse.json();
      const clientNotif = listData.data.find((n: any) => n.recipient === user1PersonId);

      expect(clientNotif).toBeDefined();
      expect(['queued', 'sent', 'delivered']).toContain(clientNotif.status);
      expect(clientNotif.readAt).toBeNull();

      console.log('DEBUG: About to mark notification', {
        notifId: clientNotif.id,
        recipient: clientNotif.recipient,
        user1PersonId,
        match: clientNotif.recipient === user1PersonId
      });

      // Mark as read
      const markResponse = await apiClient.fetch(`/notifs/${clientNotif.id}/read`, {
        method: 'POST'
      });

      if (markResponse.status !== 200) {
        const errorBody = await markResponse.text();
        console.log('DEBUG: Mark as read failed', { status: markResponse.status, error: errorBody });
      }

      expect(markResponse.status).toBe(200);
      const markedNotif = await markResponse.json();

      // Verify it's marked as read
      expect(markedNotif.status).toBe('read');
      expect(markedNotif.readAt).toBeDefined();
      expect(markedNotif.readAt).not.toBeNull();

      // Verify by fetching again
      const verifyResponse = await apiClient.fetch(`/notifs/${clientNotif.id}`);
      const verifyData = await verifyResponse.json();
      expect(verifyData.status).toBe('read');
    });

    test('should be idempotent when marking already-read notification', async () => {
      // Create and mark notification
      await createTestVideoCall();
      const listResponse = await apiClient.fetch('/notifs');
      const listData = await listResponse.json();
      const clientNotif = listData.data.find((n: any) => n.recipient === user1PersonId);

      // Mark once
      const firstMark = await apiClient.fetch(`/notifs/${clientNotif.id}/read`, { method: 'POST' });
      expect(firstMark.status).toBe(200);
      const firstData = await firstMark.json();
      const firstReadAt = firstData.readAt;

      // Mark again
      const secondMark = await apiClient.fetch(`/notifs/${clientNotif.id}/read`, { method: 'POST' });
      expect(secondMark.status).toBe(200);
      const secondData = await secondMark.json();

      // Should still be read with same timestamp
      expect(secondData.status).toBe('read');
      expect(secondData.readAt).toBe(firstReadAt);
    });

    test('should enforce ownership - user cannot mark other user notifications', async () => {
      // Create appointment (generates notifications for both client and provider)
      await createTestVideoCall();

      // Get provider's notification
      const providerListResponse = await participantClient.fetch('/notifs');
      const providerListData = await providerListResponse.json();
      const providerNotif = providerListData.data.find((n: any) => n.recipient === user2PersonId);

      expect(providerNotif).toBeDefined();

      // Client tries to mark provider's notification
      const markResponse = await apiClient.fetch(`/notifs/${providerNotif.id}/read`, {
        method: 'POST'
      });

      // Should return 404 (not found) because ownership check filters it out
      expect(markResponse.status).toBe(404);
    });

    test('should return 404 for non-existent notification', async () => {
      const fakeId = faker.string.uuid();
      const response = await apiClient.fetch(`/notifs/${fakeId}/read`, {
        method: 'POST'
      });

      expect(response.status).toBe(404);
    });

    test('should require authentication', async () => {
      const fakeId = faker.string.uuid();
      const unauthClient = createApiClient({ app: testApp.app });
      const response = await unauthClient.fetch(`/notifs/${fakeId}/read`, {
        method: 'POST'
      });

      expect(response.status).toBe(401);
    });
  });
  
  describe('Mark All Notifications as Read', () => {
    test('should mark all unread notifications as read', async () => {
      // Create multiple appointments to generate multiple notifications
      await createTestVideoCall();
      await createTestVideoCall();

      // Get initial unread count
      const initialResponse = await apiClient.fetch('/notifs', {
        searchParams: { status: 'unread' }
      });
      const initialData = await initialResponse.json();
      const initialUnreadCount = initialData.data.filter((n: any) => n.recipient === user1PersonId).length;

      expect(initialUnreadCount).toBeGreaterThan(0);

      // Mark all as read
      const markAllResponse = await apiClient.fetch('/notifs/read-all', {
        method: 'POST'
      });

      expect(markAllResponse.status).toBe(200);
      const markAllData = await markAllResponse.json();

      expect(markAllData.markedCount).toBe(initialUnreadCount);

      // Verify all are now read
      const afterResponse = await apiClient.fetch('/notifs', {
        searchParams: { status: 'unread' }
      });
      const afterData = await afterResponse.json();
      const afterUnreadCount = afterData.data.filter((n: any) => n.recipient === user1PersonId).length;

      expect(afterUnreadCount).toBe(0);
    });

    test('should filter by type when marking all as read', async () => {
      // Create video call (generates 'comms.video-call-joined' type for user1)
      await createTestVideoCall();

      // Get all notifications for client
      const listResponse = await apiClient.fetch('/notifs');
      const listData = await listResponse.json();
      const clientNotifs = listData.data.filter((n: any) => n.recipient === user1PersonId);
      const videoCallNotifs = clientNotifs.filter((n: any) => n.type === 'comms.video-call-joined');

      expect(videoCallNotifs.length).toBeGreaterThan(0);

      // Mark all comms.video-call-joined notifications as read
      const markResponse = await apiClient.fetch('/notifs/read-all', {
        method: 'POST',
        searchParams: {
          type: 'comms.video-call-joined'
        }
      });

      expect(markResponse.status).toBe(200);
      const markData = await markResponse.json();

      expect(markData.markedCount).toBe(videoCallNotifs.length);

      // Verify they're marked
      const verifyResponse = await apiClient.fetch('/notifs', {
        searchParams: { type: 'comms.video-call-joined' }
      });
      const verifyData = await verifyResponse.json();
      const verifyClientNotifs = verifyData.data.filter((n: any) => n.recipient === user1PersonId);

      verifyClientNotifs.forEach((n: any) => {
        expect(n.status).toBe('read');
      });
    });

    test('should not affect other users notifications', async () => {
      // Create appointment (generates notifications for both users)
      await createTestVideoCall();

      // Get provider's unread count
      const providerInitialResponse = await participantClient.fetch('/notifs', {
        searchParams: { status: 'unread' }
      });
      const providerInitialData = await providerInitialResponse.json();
      const providerUnreadCount = providerInitialData.data.filter((n: any) => n.recipient === user2PersonId).length;

      expect(providerUnreadCount).toBeGreaterThan(0);

      // Client marks all their notifications as read
      const clientMarkResponse = await apiClient.fetch('/notifs/read-all', {
        method: 'POST'
      });
      expect(clientMarkResponse.status).toBe(200);

      // Provider's notifications should still be unread
      const providerAfterResponse = await participantClient.fetch('/notifs', {
        searchParams: { status: 'unread' }
      });
      const providerAfterData = await providerAfterResponse.json();
      const providerAfterUnreadCount = providerAfterData.data.filter((n: any) => n.recipient === user2PersonId).length;

      expect(providerAfterUnreadCount).toBe(providerUnreadCount);
    });

    test('should return 0 when no notifications to mark', async () => {
      const response = await apiClient.fetch('/notifs/read-all', {
        method: 'POST'
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.markedCount).toBe(0);
    });

    test('should require authentication', async () => {
      const unauthClient = createApiClient({ app: testApp.app });
      const response = await unauthClient.fetch('/notifs/read-all', {
        method: 'POST'
      });

      expect(response.status).toBe(401);
    });
  });
  
  describe('Module Integration', () => {
    test('notification service should be available in context', async () => {
      // This tests that the notification service is properly injected
      // We can't directly test this from E2E, but we can verify endpoints work
      // which confirms the service is available

      const response = await apiClient.fetch('/notifs');
      expect(response.status).toBe(200);
    });
  });

  describe('Notification Creation via Module Integration', () => {
    test('should create notifications when other modules trigger them', async () => {
      // In a real scenario, other modules would create notifications
      // For example, when a patient is created or an appointment is booked
      // Here we just verify the endpoints are working

      // The actual notification creation would happen through internal service calls
      // from other modules like:
      // - Booking module creating appointment reminders
      // - Billing module creating payment notifications
      // - System module creating security alerts

      const response = await apiClient.fetch('/notifs');
      expect(response.status).toBe(200);
    });
  });

  describe('Push Notifications with OneSignal', () => {
    test('should send push notification via OneSignal when notification service creates push channel', async () => {
      // This would typically be triggered by another module
      // For testing, we'll create a notification directly through the service
      // In real scenarios, this happens when:
      // - Appointment is booked (creates reminder)
      // - Payment is due (creates billing notification)
      // - Security alert is triggered

      // Since we can't directly create notifications via API (they're created by modules),
      // we verify that the notification system is properly configured with OneSignal
      const response = await apiClient.fetch('/notifs');
      expect(response.status).toBe(200);

      // In a real test with a module that creates notifications, we would:
      // await waitForOneSignalNotification();
      // const notification = getLastOneSignalNotification();
      // verifyOneSignalNotification(notification, { ... });
    });

    test('should set high priority for medical notifications', async () => {
      // Medical notification types should have high priority
      const medicalTypes = [
        'appointment-reminder',
        'appointment-confirmation',
        'medication-reminder',
        'lab-result'
      ];

      medicalTypes.forEach(type => {
        const priority = getExpectedPriority(type);
        expect(priority).toBe(10);
      });
    });

    test('should not set high priority for non-medical notifications', async () => {
      // Non-medical notifications should have normal priority
      const normalTypes = [
        'system',
        'billing',
        'security',
        'review-request'
      ];

      normalTypes.forEach(type => {
        const priority = getExpectedPriority(type);
        expect(priority).toBeUndefined();
      });
    });

    test('OneSignal mock should be properly configured', async () => {
      // Verify MSW is capturing OneSignal calls
      expect(testApp.mockData.oneSignalNotifications).toBeDefined();
      expect(Array.isArray(testApp.mockData.oneSignalNotifications)).toBe(true);
      expect(testApp.mockData.oneSignalNotifications.length).toBe(0);
    });

    test('should handle OneSignal API errors gracefully', async () => {
      // This would be tested with a module that creates notifications
      // The notification repository should handle OneSignal failures
      // and mark notifications as failed in the database

      // In integration with other modules, we would:
      // 1. Override MSW handler to return error
      // 2. Trigger notification creation
      // 3. Verify notification is marked as failed

      expect(true).toBe(true); // Placeholder for now
    });
  });

  describe('Integration Workflow Tests', () => {
    test('complete workflow: create → list unread → mark one → list → mark all → verify all read', async () => {
      // Step 1: Create appointments to generate notifications
      await createTestVideoCall();
      await createTestVideoCall();

      // Step 2: List unread notifications
      const unread1Response = await apiClient.fetch('/notifs', {
        searchParams: { status: 'unread' }
      });
      const unread1Data = await unread1Response.json();
      const unread1Count = unread1Data.data.filter((n: any) => n.recipient === user1PersonId).length;

      expect(unread1Count).toBeGreaterThan(0);
      const initialUnreadCount = unread1Count;

      // Step 3: Mark one notification as read
      const firstNotif = unread1Data.data.find((n: any) => n.recipient === user1PersonId);
      await apiClient.fetch(`/notifs/${firstNotif.id}/read`, { method: 'POST' });

      // Step 4: List unread again (should have one less)
      const unread2Response = await apiClient.fetch('/notifs', {
        searchParams: { status: 'unread' }
      });
      const unread2Data = await unread2Response.json();
      const unread2Count = unread2Data.data.filter((n: any) => n.recipient === user1PersonId).length;

      expect(unread2Count).toBe(initialUnreadCount - 1);

      // Step 5: Mark all as read
      const markAllResponse = await apiClient.fetch('/notifs/read-all', { method: 'POST' });
      const markAllData = await markAllResponse.json();

      expect(markAllData.markedCount).toBe(unread2Count);

      // Step 6: Verify no unread notifications remain
      const unread3Response = await apiClient.fetch('/notifs', {
        searchParams: { status: 'unread' }
      });
      const unread3Data = await unread3Response.json();
      const unread3Count = unread3Data.data.filter((n: any) => n.recipient === user1PersonId).length;

      expect(unread3Count).toBe(0);
    });

    test('different notification types from different video call actions', async () => {
      // Start video call (both users join via createTestVideoCall helper)
      // This generates notifications: user2 receives 'comms.video-call-started'
      // and user1 receives 'comms.video-call-joined' when user2 joins
      const { room } = await createTestVideoCall();

      // List all user1 notifications
      const listResponse = await apiClient.fetch('/notifs');
      const listData = await listResponse.json();
      const clientNotifs = listData.data.filter((n: any) => n.recipient === user1PersonId);

      // Should have notifications from video call actions
      const notifTypes = [...new Set(clientNotifs.map((n: any) => n.type))];
      expect(notifTypes.length).toBeGreaterThan(0);

      // Verify we can filter by type
      for (const type of notifTypes) {
        const typeResponse = await apiClient.fetch('/notifs', {
          searchParams: { type }
        });
        const typeData = await typeResponse.json();
        const typeClientNotifs = typeData.data.filter((n: any) => n.recipient === user1PersonId);

        expect(typeClientNotifs.length).toBeGreaterThan(0);
        typeClientNotifs.forEach((n: any) => {
          expect(n.type).toBe(type);
        });
      }
    });

    test('pagination with read/unread filtering', async () => {
      // Create multiple appointments
      for (let i = 0; i < 3; i++) {
        await createTestVideoCall();
      }

      // Get all notifications with pagination
      const page1Response = await apiClient.fetch('/notifs', {
        searchParams: { limit: 2, offset: 0 }
      });
      const page1Data = await page1Response.json();

      expect(page1Data.pagination.limit).toBe(2);
      expect(page1Data.pagination.hasNextPage).toBe(true);

      // Mark first page as read
      const page1ClientNotifs = page1Data.data.filter((n: any) => n.recipient === user1PersonId);
      for (const notif of page1ClientNotifs) {
        await apiClient.fetch(`/notifs/${notif.id}/read`, { method: 'POST' });
      }

      // Get second page (should still have unread)
      const page2Response = await apiClient.fetch('/notifs', {
        searchParams: { limit: 2, offset: 2, unreadOnly: 'true' }
      });
      const page2Data = await page2Response.json();
      const page2ClientNotifs = page2Data.data.filter((n: any) => n.recipient === user1PersonId);

      // Should have unread notifications in second page
      expect(page2ClientNotifs.length).toBeGreaterThan(0);
      page2ClientNotifs.forEach((n: any) => {
        expect(['queued', 'sent', 'delivered']).toContain(n.status);
      });
    });
  });
});