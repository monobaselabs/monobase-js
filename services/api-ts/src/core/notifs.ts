/**
 * Notification Service Interface
 * Provides a thin abstraction layer over NotificationRepository for module integration
 * This service is injected into the app context for use by other modules
 */

import type { DatabaseInstance } from '@/core/database';
import type { Logger } from '@/types/logger';
import type { WebSocketService } from '@/core/ws';
import { NotificationRepository } from '@/handlers/notifs/repos/notification.repo';
import { PersonRepository } from '@/handlers/person/repos/person.repo';
import type {
  Notification,
  CreateNotificationRequest
} from '@/handlers/notifs/repos/notification.schema';

/**
 * OneSignal configuration
 */
export interface OneSignalConfig {
  appId: string;
  apiKey: string;
}

/**
 * Notification configuration
 */
export interface NotificationConfig {
  provider: 'onesignal';
  onesignal?: OneSignalConfig;
}

/**
 * Minimal notification service interface
 * Exposes only the essential features needed by other modules
 */
export interface NotificationService {
  /**
   * Create a notification (for module integration)
   * This is the primary method other modules will use
   */
  createNotification(request: CreateNotificationRequest): Promise<Notification>;
  
  /**
   * Process scheduled notifications (for job scheduler)
   * Called periodically by the background job system
   */
  processScheduledNotifications(): Promise<void>;
  
  /**
   * Get unread notification count (for UI badges)
   * Returns the count of unread notifications for a recipient
   */
  getUnreadCount(recipientId: string): Promise<number>;
  
  /**
   * Clean up expired notifications (maintenance task)
   * Called periodically to remove old notifications
   */
  cleanupExpiredNotifications(daysOld?: number): Promise<number>;
}

/**
 * NotificationService implementation
 * Wraps NotificationRepository and sends real-time WebSocket notifications
 */
class NotificationServiceImpl implements NotificationService {
  private repo: NotificationRepository;
  private ws: WebSocketService;
  private logger: Logger;

  constructor(
    db: DatabaseInstance,
    logger: Logger,
    notifConfig: NotificationConfig,
    ws: WebSocketService
  ) {
    const personRepo = new PersonRepository(db, logger);
    // Extract OneSignal config from notification config
    const oneSignalConfig = notifConfig.onesignal;
    this.repo = new NotificationRepository(db, personRepo, logger, oneSignalConfig);
    this.ws = ws;
    this.logger = logger;

    // Bind methods after repository is created
    this.processScheduledNotifications = this.repo.processScheduledNotifications.bind(this.repo);
    this.getUnreadCount = this.repo.getUnreadCount.bind(this.repo);
    this.cleanupExpiredNotifications = this.repo.cleanupExpiredNotifications.bind(this.repo);
  }

  /**
   * Create notification and send real-time WebSocket update
   */
  async createNotification(request: CreateNotificationRequest): Promise<Notification> {
    const notification = await this.repo.createNotificationForModule(request);

    // Send real-time notification to user's WebSocket connection
    const sent = await this.ws.publishToUser(request.recipient, 'notification.new', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      relatedEntityType: notification.relatedEntityType,
      relatedEntity: notification.relatedEntity,
      createdAt: notification.createdAt,
    });

    if (sent) {
      this.logger.debug({ recipientId: request.recipient, notificationId: notification.id }, 'Real-time notification sent');
    }

    return notification;
  }

  // Method declarations
  processScheduledNotifications: NotificationService['processScheduledNotifications'];
  getUnreadCount: NotificationService['getUnreadCount'];
  cleanupExpiredNotifications: NotificationService['cleanupExpiredNotifications'];
}

/**
 * Create a notification service instance
 * Factory function following the pattern of storage and jobs services
 */
export function createNotificationService(
  db: DatabaseInstance,
  logger: Logger,
  notifConfig: NotificationConfig,
  ws: WebSocketService
): NotificationService {
  return new NotificationServiceImpl(db, logger, notifConfig, ws);
}