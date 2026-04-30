/**
 * Database schema for notifications - matches TypeSpec API definition
 * Provides multi-channel notification support with healthcare compliance
 */

import { pgTable, varchar, timestamp, jsonb, pgEnum, index, uuid, boolean } from 'drizzle-orm/pg-core';
import { baseEntityFields } from '@/core/database.schema';

// Notification type enum - matches TypeSpec definition
export const notificationTypeEnum = pgEnum('notification_type', [
  'billing',
  'security',
  'system',
  // Booking module notifications
  'booking.created',
  'booking.confirmed',
  'booking.rejected',
  'booking.cancelled',
  'booking.no-show-client',
  'booking.no-show-host',
  // Comms module notifications
  'comms.video-call-started',
  'comms.video-call-joined',
  'comms.video-call-left',
  'comms.video-call-ended',
  'comms.chat-message'
]);

// Notification channel enum - matches TypeSpec definition
export const notificationChannelEnum = pgEnum('notification_channel', [
  'email',
  'push',
  'in-app'
]);

// Notification status enum - matches TypeSpec definition
export const notificationStatusEnum = pgEnum('notification_status', [
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
  'expired'
]);

// Notifications table - matches TypeSpec Notification model
export const notifications = pgTable('notification', {
  // Base entity fields (includes id, timestamps, version, audit fields)
  ...baseEntityFields,
  
  // Core notification fields from TypeSpec
  recipient: uuid('recipient_id').notNull(), // Person ID (foreign key)
  type: notificationTypeEnum('type').notNull(),
  channel: notificationChannelEnum('channel').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  message: varchar('message', { length: 1000 }).notNull(),
  
  // Scheduling and context
  scheduledAt: timestamp('scheduled_at'), // null = immediate
  relatedEntityType: varchar('related_entity_type', { length: 50 }),
  relatedEntity: uuid('related_entity'),
  
  // Status tracking
  status: notificationStatusEnum('status').notNull().default('queued'),
  sentAt: timestamp('sent_at'),
  readAt: timestamp('read_at'), // For in-app notifications
  
  // Healthcare compliance
  consentValidated: boolean('consent_validated').notNull().default(false),
}, (table) => ({
  // Indexes for efficient querying
  recipientStatusIdx: index('notifications_recipient_status_idx').on(table.recipient, table.status),
  scheduledStatusIdx: index('notifications_scheduled_status_idx').on(table.scheduledAt, table.status),
  typeChannelIdx: index('notifications_type_channel_idx').on(table.type, table.channel),
  createdAtIdx: index('notifications_created_at_idx').on(table.createdAt),

}));

// Type exports for TypeScript
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

// API response type - matches TypeSpec Notification model
export interface NotificationResponse {
  id: string;
  recipient: string;
  type: string;
  channel: string;
  title: string;
  message: string;
  scheduledAt?: Date;
  relatedEntityType?: string;
  relatedEntity?: string;
  status: string;
  sentAt?: Date;
  readAt?: Date;
  consentValidated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Request type for creating notifications (used by other modules)
export interface CreateNotificationRequest {
  recipient: string;
  type: 'billing' | 'security' | 'system' | 'booking.created' | 'booking.confirmed' | 'booking.rejected' | 'booking.cancelled' | 'booking.no-show-client' | 'booking.no-show-host' | 'comms.video-call-started' | 'comms.video-call-joined' | 'comms.video-call-left' | 'comms.video-call-ended' | 'comms.chat-message';
  channel: 'email' | 'push' | 'in-app';
  title: string;
  message: string;
  scheduledAt?: Date;
  relatedEntityType?: string;
  relatedEntity?: string;
  consentValidated?: boolean;
  targetApp?: string; // Optional: Filter push notifications by app tag (e.g., 'web', 'mobile')
}

// Filter interface for querying notifications
export interface NotificationFilters {
  recipient?: string;
  type?: string;
  channel?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
}