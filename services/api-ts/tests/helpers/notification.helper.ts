/**
 * E2E Test Helpers for Notification Module
 * Provides utilities for verifying OneSignal API calls and notification behavior
 */

import type { mswTestData } from './msw-server';

/**
 * Verify a OneSignal notification was sent with expected data
 */
export function verifyOneSignalNotification(
  notification: any,
  expected: {
    recipientId: string;
    title: string;
    message: string;
    type?: string;
    priority?: number;
  }
) {
  expect(notification.app_id).toBe('test-app-id');
  expect(notification.include_aliases?.external_id).toContain(expected.recipientId);
  expect(notification.headings?.en).toBe(expected.title);
  expect(notification.contents?.en).toBe(expected.message);

  if (expected.type) {
    expect(notification.data?.type).toBe(expected.type);
  }

  if (expected.priority !== undefined) {
    expect(notification.priority).toBe(expected.priority);
  }
}

/**
 * Get the last OneSignal notification sent
 */
export function getLastOneSignalNotification(mockData: any): any {
  const notifications = mockData.oneSignalNotifications;
  if (notifications.length === 0) {
    return null;
  }
  return notifications[notifications.length - 1];
}

/**
 * Get all OneSignal notifications sent
 */
export function getAllOneSignalNotifications(mockData: any): any[] {
  return mockData.oneSignalNotifications;
}

/**
 * Clear all OneSignal notifications from test data
 */
export function clearOneSignalNotifications(mockData: any): void {
  mockData.oneSignalNotifications = [];
}

/**
 * Wait for OneSignal notification to be sent
 * Useful for async operations that trigger notifications
 */
export async function waitForOneSignalNotification(
  mockData: any,
  timeout: number = 1000,
  expectedCount: number = 1
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (mockData.oneSignalNotifications.length >= expectedCount) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  throw new Error(
    `Timeout waiting for ${expectedCount} OneSignal notifications. ` +
    `Got ${mockData.oneSignalNotifications.length}`
  );
}

/**
 * Helper to create notification test data
 */
export function createTestNotificationData(overrides: any = {}) {
  return {
    type: 'system',
    channel: 'push',
    title: 'Test Notification',
    message: 'This is a test notification',
    consentValidated: true,
    ...overrides
  };
}

/**
 * Verify notification priority based on type
 */
export function getExpectedPriority(notificationType: string): number | undefined {
  const medicalTypes = [
    'appointment-reminder',
    'appointment-confirmation',
    'appointment-cancellation',
    'medication-reminder',
    'lab-result',
    'emergency-alert'
  ];

  return medicalTypes.includes(notificationType) ? 10 : undefined;
}