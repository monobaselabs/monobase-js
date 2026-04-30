/**
 * Database schema for audit logs - matches TypeSpec API definition
 * Uses Drizzle ORM with PostgreSQL for tamper-evident audit trails
 */

import { pgTable, varchar, timestamp, jsonb, pgEnum, index, uuid, text } from 'drizzle-orm/pg-core';
import { baseEntityFields } from '@/core/database.schema';
import { user } from '@/generated/better-auth/schema';

// Audit event type enumeration - matches TypeSpec definition
export const auditEventTypeEnum = pgEnum('audit_event_type', [
  'authentication',
  'data-access',
  'data-modification',
  'system-config',
  'security',
  'compliance'
]);

// Audit category enumeration - matches TypeSpec definition
export const auditCategoryEnum = pgEnum('audit_category', [
  'regulatory',
  'security',
  'privacy',
  'administrative',
  'domain',
  'financial'
]);

// Audit action enumeration - matches TypeSpec definition
export const auditActionEnum = pgEnum('audit_action', [
  'create',
  'read',
  'update',
  'delete',
  'login',
  'logout'
]);

// Audit outcome enumeration - matches TypeSpec definition
export const auditOutcomeEnum = pgEnum('audit_outcome', [
  'success',
  'failure',
  'partial',
  'denied'
]);

// Audit retention status enumeration - matches enhanced TypeSpec definition
export const auditRetentionStatusEnum = pgEnum('audit_retention_status', [
  'active',
  'archived',
  'pending-purge'
]);

// Audit log entry table - matches enhanced TypeSpec AuditLogEntry model
export const auditLogEntries = pgTable('audit_log_entry', {
  // Base entity fields (includes id, timestamps, version, audit fields)
  ...baseEntityFields,
  
  // Event classification fields
  eventType: auditEventTypeEnum('event_type').notNull(),
  category: auditCategoryEnum('category').notNull(),
  action: auditActionEnum('action').notNull(),
  outcome: auditOutcomeEnum('outcome').notNull(),
  
  // Context information
  user: uuid('user'), // UUID reference to user
  userType: varchar('user_type', { length: 20 }), // client, host, admin, system
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  resource: varchar('resource', { length: 255 }).notNull(),
  
  // Event details
  description: varchar('description', { length: 1000 }).notNull(),
  details: jsonb('details').$type<Record<string, unknown>>(),
  
  // Request context
  ipAddress: varchar('ip_address', { length: 45 }), // IPv6 max length
  userAgent: varchar('user_agent', { length: 500 }),
  session: varchar('session_id', { length: 255 }),
  request: varchar('request_id', { length: 255 }),
  
  // Enhanced fields for integrity and retention
  integrityHash: varchar('integrity_hash', { length: 64 }), // SHA-256 hash
  retentionStatus: auditRetentionStatusEnum('retention_status').notNull().default('active'),
  archivedAt: timestamp('archived_at'),
  archivedBy: text('archived_by').references(() => user.id), // User who archived the log
  purgeAfter: timestamp('purge_after'),
}, (table) => ({
  // Performance indexes for common queries
  eventTypeIdx: index('audit_event_type_idx').on(table.eventType),
  categoryIdx: index('audit_category_idx').on(table.category),
  userIdx: index('audit_user_idx').on(table.user),
  resourceIdx: index('audit_resource_idx').on(table.resourceType, table.resource),
  createdAtIdx: index('audit_created_at_idx').on(table.createdAt),
  retentionStatusIdx: index('audit_retention_status_idx').on(table.retentionStatus),
  
  // Composite indexes for common filter combinations
  userEventIdx: index('audit_user_event_idx').on(table.user, table.eventType),
  resourceTypeEventIdx: index('audit_resource_type_event_idx').on(table.resourceType, table.eventType),
  dateRangeIdx: index('audit_date_range_idx').on(table.createdAt, table.retentionStatus),
}));

// Type exports for TypeScript
export type AuditLogEntry = typeof auditLogEntries.$inferSelect;
export type NewAuditLogEntry = typeof auditLogEntries.$inferInsert;

// Enum type exports for type safety
export type AuditEventType = 'authentication' | 'data-access' | 'data-modification' | 'system-config' | 'security' | 'compliance';
export type AuditCategory = 'regulatory' | 'security' | 'privacy' | 'administrative' | 'domain' | 'financial';
export type AuditAction = 'create' | 'read' | 'update' | 'delete' | 'login' | 'logout';
export type AuditOutcome = 'success' | 'failure' | 'partial' | 'denied';
export type AuditRetentionStatus = 'active' | 'archived' | 'pending-purge';
export type UserType = 'client' | 'host' | 'admin' | 'system';

// Request interfaces matching TypeSpec definitions
export interface CreateAuditLogRequest {
  eventType: AuditEventType;
  category: AuditCategory;
  action: AuditAction;
  outcome: AuditOutcome;
  user?: string;
  userType?: UserType;
  resourceType: string;
  resource: string;
  description: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  session?: string;
  request?: string;
}

// Response interface for API endpoints
export interface AuditLogResponse extends Omit<AuditLogEntry, 'details'> {
  details?: Record<string, unknown>;
}

// Query interface for listAuditLogs endpoint matching TypeSpec
export interface AuditLogQueryParams {
  resourceType?: string;
  resource?: string; // UUID
  user?: string; // UUID
  action?: AuditAction;
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
  limit?: number;
  offset?: number;
}

// Filter interface for repository queries
export interface AuditLogFilters {
  eventType?: AuditEventType;
  category?: AuditCategory;
  action?: AuditAction;
  outcome?: AuditOutcome;
  user?: string;
  userType?: UserType;
  resourceType?: string;
  resource?: string;
  retentionStatus?: AuditRetentionStatus;
  startDate?: Date;
  endDate?: Date;
  ipAddress?: string;
}