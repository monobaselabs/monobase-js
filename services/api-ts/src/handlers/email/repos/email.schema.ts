/**
 * Email module database schema definitions
 * Defines tables for email templates and queue with runtime resolution support
 */

import { pgTable, uuid, varchar, text, jsonb, timestamp, integer, pgEnum, unique, index, boolean } from 'drizzle-orm/pg-core';
import { baseEntityFields, type BaseEntity } from '@/core/database.schema';

/**
 * Variable types for email template variables
 */
export const variableTypeEnum = pgEnum('variable_type', [
  'string',
  'number', 
  'boolean',
  'date',
  'datetime',
  'url',
  'email',
  'array'
]);

export type VariableType = typeof variableTypeEnum.enumValues[number];

/**
 * Template variable definition interface
 */
export interface TemplateVariable {
  id: string;
  type: VariableType;
  label: string;
  required: boolean;
  defaultValue?: any;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  options?: string[];
}

/**
 * Email template status enum
 */
export const templateStatusEnum = pgEnum('template_status', ['draft', 'active', 'archived']);

/**
 * Email queue status enum
 */
export const emailQueueStatusEnum = pgEnum('email_queue_status', [
  'pending',
  'processing',
  'sent',
  'failed',
  'cancelled'
]);

/**
 * Email provider enum
 */
export const emailProviderEnum = pgEnum('email_provider', ['smtp', 'postmark', 'onesignal']);

/**
 * Email template tags for identifying templates
 */
export enum EmailTemplateTags {
  // Auth templates
  AUTH_EMAIL_VERIFY = 'auth.email-verify',
  AUTH_PASSWORD_RESET = 'auth.password-reset',
  AUTH_2FA = 'auth.2fa',
  AUTH_WELCOME = 'auth.welcome',
  AUTH_MAGIC_LINK = 'auth.magic-link',
}

/**
 * Email templates table - stores runtime-configurable templates
 */
export const emailTemplates = pgTable('email_template', {
  ...baseEntityFields,
  
  // Human-readable template name
  name: varchar('name', { length: 255 }).notNull(),
  
  // Template description for admin reference
  description: text('description'),
  
  // Email subject line template (supports Handlebars)
  subject: varchar('subject', { length: 500 }).notNull(),
  
  // HTML body template (supports Handlebars)
  bodyHtml: text('body_html').notNull(),
  
  // Plain text body template (supports Handlebars)
  bodyText: text('body_text'),
  
  // Tags for categorization (optional)
  tags: jsonb('tags').$type<string[]>(),
  
  // Template variables definitions
  variables: jsonb('variables').notNull().$type<TemplateVariable[]>(),
  
  // Override default sender name
  fromName: varchar('from_name', { length: 255 }),
  
  // Override default sender email
  fromEmail: varchar('from_email', { length: 255 }),
  
  // Reply-to email address
  replyToEmail: varchar('reply_to_email', { length: 255 }),
  
  // Reply-to name
  replyToName: varchar('reply_to_name', { length: 255 }),
  
  // Template status
  status: templateStatusEnum('status').notNull().default('draft'),
  
  // Template version number
  version: integer('version').notNull().default(1),
}, (table) => ({
  // Index for status filtering
  statusIdx: index('email_template_status_idx').on(table.status),
  // Index for tags filtering (GIN index for jsonb array)
  tagsIdx: index('email_template_tags_idx').using('gin', table.tags),
}));

/**
 * Email queue table - stores emails for async processing
 */
export const emailQueue = pgTable('email_queue', {
  ...baseEntityFields,

  // Direct template ID reference (alternative to templateTags)
  template: uuid('template').references(() => emailTemplates.id, { onDelete: 'set null' }),

  // Template tags for resolution during processing (alternative to template)
  templateTags: jsonb('template_tags').$type<string[]>(),
  
  // Recipient email address
  recipientEmail: varchar('recipient_email', { length: 255 }).notNull(),
  
  // Recipient name for personalization
  recipientName: varchar('recipient_name', { length: 255 }),
  
  // Template variables for rendering
  variables: jsonb('variables').notNull().$type<Record<string, any>>(),
  
  // Metadata for tracking and reference (e.g., bookingId, notificationId)
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  
  // Processing status
  status: emailQueueStatusEnum('status').notNull().default('pending'),
  
  // Processing priority (1-10, lower is higher priority)
  priority: integer('priority').notNull().default(5),
  
  // Scheduled send time (null for immediate)
  scheduledAt: timestamp('scheduled_at'),
  
  // Number of send attempts
  attempts: integer('attempts').notNull().default(0),
  
  // Last attempt timestamp
  lastAttemptAt: timestamp('last_attempt_at'),
  
  // Next retry timestamp
  nextRetryAt: timestamp('next_retry_at'),
  
  // Last error message if failed
  lastError: text('last_error'),
  
  // Timestamp when email was sent
  sentAt: timestamp('sent_at'),
  
  // Email provider used
  provider: emailProviderEnum('provider'),
  
  // Provider's message ID for tracking
  providerMessageId: varchar('provider_message_id', { length: 255 }),
  
  // Cancellation timestamp
  cancelledAt: timestamp('cancelled_at'),
  
  // User who cancelled the email
  cancelledBy: uuid('cancelled_by'),
  
  // Cancellation reason
  cancellationReason: text('cancellation_reason'),
}, (table) => ({
  // Index for status filtering and processing
  statusIdx: index('email_queue_status_idx').on(table.status),
  // Index for priority-based processing
  priorityIdx: index('email_queue_priority_idx').on(table.priority),
  // Index for scheduled emails
  scheduledIdx: index('email_queue_scheduled_idx').on(table.scheduledAt),
  // Index for recipient lookup
  recipientIdx: index('email_queue_recipient_idx').on(table.recipientEmail),
  // Index for template filtering
  templateIdx: index('email_queue_template_idx').on(table.template),
  // Index for template tags filtering (GIN index for JSONB array)
  templateTagsIdx: index('email_queue_template_tags_idx').using('gin', table.templateTags),
  // Composite index for processing queries
  processingIdx: index('email_queue_processing_idx').on(table.status, table.priority, table.scheduledAt),
}));

/**
 * Type exports for TypeScript
 */
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type NewEmailTemplate = typeof emailTemplates.$inferInsert;

export type EmailQueueItem = typeof emailQueue.$inferSelect;
export type NewEmailQueueItem = typeof emailQueue.$inferInsert;


/**
 * Email queue filters interface
 */
export interface EmailQueueFilters {
  status?: EmailQueueItem['status'] | EmailQueueItem['status'][];
  template?: string; // Direct template ID filter
  templateTags?: string | string[]; // Template tags filter (supports single tag or multiple)
  recipientEmail?: string;
  priority?: number;
  scheduledOnly?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Email template filters interface
 */
export interface EmailTemplateFilters {
  status?: EmailTemplate['status'];
  tags?: string[];
}

/**
 * Queue email request interface
 */
export interface QueueEmailRequest {
  template?: string; // Direct template ID (alternative to templateTags)
  templateTags?: string[]; // Template tags for dynamic resolution (alternative to template)
  recipient: string;
  recipientName?: string;
  variables: Record<string, any>;
  metadata?: Record<string, any>;
  priority?: number;
  scheduledAt?: Date;
}

/**
 * Send email request interface (internal)
 */
export interface SendEmailRequest {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: {
    name?: string;
    email?: string;
  };
  replyTo?: {
    email?: string;
    name?: string;
  };
}

/**
 * Email send result interface
 */
export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  provider: 'smtp' | 'postmark' | 'onesignal';
  error?: string;
}

/**
 * Template preview result interface
 */
export interface TemplatePreviewResult {
  subject: string;
  bodyHtml: string;
  bodyText?: string;
}

/**
 * Template test result interface
 */
export interface TemplateTestResult {
  success: boolean;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  error?: string;
  validationErrors?: string[];
  messageId?: string;
  provider?: string; // Email provider used (smtp, postmark, etc.)
}
