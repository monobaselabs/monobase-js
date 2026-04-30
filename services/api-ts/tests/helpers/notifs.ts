/**
 * Test helper functions for notification module
 * Provides utilities for creating and managing test notifications
 */

import { faker } from '@faker-js/faker';
import type { ApiClient } from './client';
import type { CreateNotificationRequest } from '@/handlers/notifs/repos/notification.schema';

/**
 * Generate test notification data
 */
export function generateTestNotificationData(): CreateNotificationRequest {
  const types = ['appointment-reminder', 'billing', 'security', 'system'] as const;
  const channels = ['email', 'push', 'in-app'] as const;
  
  return {
    recipient: faker.string.uuid(), // Would be replaced with actual person ID
    type: faker.helpers.arrayElement(types),
    channel: faker.helpers.arrayElement(channels),
    title: faker.lorem.sentence(5),
    message: faker.lorem.paragraph(2),
    consentValidated: faker.datatype.boolean(),
  };
}

/**
 * List notifications for the current user
 */
export async function listNotifications(
  apiClient: ApiClient,
  filters?: {
    type?: string;
    channel?: string;
    status?: string;
    unreadOnly?: boolean;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }
) {
  const response = await apiClient.fetch('/notifications', {
    searchParams: filters as any
  });
  
  const data = response.ok ? await response.json() : null;
  
  return {
    response,
    data
  };
}

/**
 * Get a single notification
 */
export async function getNotification(apiClient: ApiClient, notificationId: string) {
  const response = await apiClient.fetch(`/notifications/${notificationId}`);
  const data = response.ok ? await response.json() : null;
  
  return {
    response,
    data
  };
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(apiClient: ApiClient, notificationId: string) {
  const response = await apiClient.fetch(`/notifications/${notificationId}/read`, {
    method: 'PATCH'
  });
  
  const data = response.ok ? await response.json() : null;
  
  return {
    response,
    data
  };
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsAsRead(apiClient: ApiClient, type?: string) {
  const response = await apiClient.fetch('/notifications/read-all', {
    method: 'PATCH',
    searchParams: type ? { type } : undefined
  });
  
  const data = response.ok ? await response.json() : null;
  
  return {
    response,
    data
  };
}

/**
 * Wait for a notification to appear (useful for testing async creation)
 */
export async function waitForNotification(
  apiClient: ApiClient,
  predicate: (notification: any) => boolean,
  options: {
    maxAttempts?: number;
    delayMs?: number;
  } = {}
): Promise<any | null> {
  const maxAttempts = options.maxAttempts || 10;
  const delayMs = options.delayMs || 500;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data } = await listNotifications(apiClient);
    
    if (data?.data) {
      const notification = data.data.find(predicate);
      if (notification) {
        return notification;
      }
    }
    
    // Wait before next attempt
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  
  return null;
}

/**
 * Create a test notification directly in the database (for testing purposes)
 * This would typically be done by other modules through the NotificationService
 */
export async function createTestNotificationInDb(
  apiClient: ApiClient,
  notificationData: Partial<CreateNotificationRequest>
): Promise<string> {
  // In a real scenario, we would need a test endpoint or direct database access
  // For now, this is a placeholder showing how test data would be created
  
  // Notifications are created by internal services, not directly via API
  // This helper would need to either:
  // 1. Trigger another module action that creates a notification
  // 2. Have a test-only endpoint for creating notifications
  // 3. Use direct database access in test environment
  
  return faker.string.uuid(); // Placeholder
}