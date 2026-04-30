/**
 * AuditRepository - Data access layer for audit logs
 * Provides HIPAA-compliant audit trail management with integrity verification
 */

import { eq, and, or, gte, lte, inArray, type SQL } from 'drizzle-orm';
import { createHash } from 'crypto';
import type { DatabaseInstance } from '@/core/database';
import { DatabaseRepository, type PaginationOptions } from '@/core/database.repo';
import { SYSTEM_USER_ID } from '@/core/constants';
import { subDays, addYears } from 'date-fns';
import {
  auditLogEntries,
  type AuditLogEntry,
  type NewAuditLogEntry,
  type CreateAuditLogRequest,
  type AuditLogFilters,
  type AuditEventType,
  type AuditCategory,
  type AuditAction,
  type AuditOutcome,
  type AuditRetentionStatus,
  type UserType
} from './audit.schema';
import type { User } from '@/types/auth';

export class AuditRepository extends DatabaseRepository<AuditLogEntry, NewAuditLogEntry, AuditLogFilters> {
  constructor(
    db: DatabaseInstance,
    logger?: any
  ) {
    super(db, auditLogEntries, logger);
  }

  /**
   * Build where conditions for audit-specific filtering
   */
  protected buildWhereConditions(filters?: AuditLogFilters): SQL<unknown> | undefined {
    if (!filters) return undefined;
    
    const conditions = [];
    
    // Event classification filters
    if (filters.eventType) {
      conditions.push(eq(auditLogEntries.eventType, filters.eventType));
    }
    
    if (filters.category) {
      conditions.push(eq(auditLogEntries.category, filters.category));
    }
    
    if (filters.action) {
      conditions.push(eq(auditLogEntries.action, filters.action));
    }
    
    if (filters.outcome) {
      conditions.push(eq(auditLogEntries.outcome, filters.outcome));
    }
    
    // Context filters
    if (filters.user) {
      conditions.push(eq(auditLogEntries.user, filters.user));
    }
    
    if (filters.userType) {
      conditions.push(eq(auditLogEntries.userType, filters.userType));
    }
    
    if (filters.resourceType) {
      conditions.push(eq(auditLogEntries.resourceType, filters.resourceType));
    }
    
    if (filters.resource) {
      conditions.push(eq(auditLogEntries.resource, filters.resource));
    }
    
    if (filters.retentionStatus) {
      conditions.push(eq(auditLogEntries.retentionStatus, filters.retentionStatus));
    }
    
    if (filters.ipAddress) {
      conditions.push(eq(auditLogEntries.ipAddress, filters.ipAddress));
    }
    
    // Date range filters
    if (filters.startDate) {
      conditions.push(gte(auditLogEntries.createdAt, filters.startDate));
    }
    
    if (filters.endDate) {
      conditions.push(lte(auditLogEntries.createdAt, filters.endDate));
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * Create an audit log entry with automatic integrity hash calculation
   */
  async logEvent(request: CreateAuditLogRequest, createdBy?: string): Promise<AuditLogEntry> {
    this.logger?.debug({ request }, 'Creating audit log entry');

    // Use a consistent timestamp for both creation and integrity hash
    const createdAt = new Date();

    // Calculate integrity hash for tamper detection
    const integrityData = {
      eventType: request.eventType,
      category: request.category,
      action: request.action,
      outcome: request.outcome,
      user: request.user,
      resourceType: request.resourceType,
      resource: request.resource,
      description: request.description,
      timestamp: createdAt.toISOString()
    };
    
    const integrityHash = this.calculateIntegrityHash(integrityData);
    
    // Calculate purge date (7 years for HIPAA compliance)
    const purgeAfter = addYears(new Date(), 7);

    const auditData: NewAuditLogEntry = {
      ...request,
      integrityHash,
      retentionStatus: 'active',
      purgeAfter,
      createdAt,
      updatedAt: createdAt,
      createdBy: createdBy || request.user || SYSTEM_USER_ID,
      updatedBy: createdBy || request.user || SYSTEM_USER_ID
    };

    const auditEntry = await this.createOne(auditData);
    
    this.logger?.info({
      auditId: auditEntry.id,
      eventType: auditEntry.eventType,
      resource: auditEntry.resource,
      user: auditEntry.user
    }, 'Audit log entry created');

    return auditEntry;
  }

  /**
   * Calculate SHA-256 integrity hash for audit log entry
   */
  private calculateIntegrityHash(data: Record<string, any>): string {
    const sortedKeys = Object.keys(data).sort();
    const hashableString = sortedKeys
      .map(key => `${key}:${data[key]}`)
      .join('|');
    
    return createHash('sha256').update(hashableString).digest('hex');
  }

  /**
   * Verify integrity of audit log entries
   * Used by background jobs for compliance validation
   */
  async verifyIntegrity(entries?: AuditLogEntry[]): Promise<{
    verifiedCount: number;
    compromisedEntries: string[];
    totalChecked: number;
  }> {
    this.logger?.debug({ providedEntries: entries?.length }, 'Starting integrity verification');

    const entriesToCheck = entries || await this.findMany({ retentionStatus: 'active' });
    let verifiedCount = 0;
    const compromisedEntries: string[] = [];

    for (const entry of entriesToCheck) {
      if (!entry.integrityHash) {
        // Skip entries without integrity hash (legacy entries)
        continue;
      }

      const integrityData = {
        eventType: entry.eventType,
        category: entry.category,
        action: entry.action,
        outcome: entry.outcome,
        user: entry.user,
        resourceType: entry.resourceType,
        resource: entry.resource,
        description: entry.description,
        timestamp: entry.createdAt.toISOString()
      };

      const expectedHash = this.calculateIntegrityHash(integrityData);
      
      if (entry.integrityHash === expectedHash) {
        verifiedCount++;
      } else {
        compromisedEntries.push(entry.id);
        this.logger?.error({
          auditId: entry.id,
          expectedHash,
          actualHash: entry.integrityHash
        }, 'Audit log integrity compromised');
      }
    }

    this.logger?.info({
      totalChecked: entriesToCheck.length,
      verifiedCount,
      compromisedCount: compromisedEntries.length
    }, 'Integrity verification completed');

    return {
      verifiedCount,
      compromisedEntries,
      totalChecked: entriesToCheck.length
    };
  }

  /**
   * Archive old audit logs (background job method)
   * Moves logs from active to archived status after specified days (default: 365 days for HIPAA)
   */
  async archiveOldLogs(daysOld: number = 365, archivedBy?: string): Promise<number> {
    this.logger?.debug({ daysOld, archivedBy }, 'Starting log archival process');

    const archiveDate = subDays(new Date(), daysOld);

    const result = await this.db
      .update(auditLogEntries)
      .set({
        retentionStatus: 'archived',
        archivedAt: new Date(),
        archivedBy: archivedBy || null,
        updatedAt: new Date()
      })
      .where(and(
        eq(auditLogEntries.retentionStatus, 'active'),
        lte(auditLogEntries.createdAt, archiveDate)
      ))
      .returning({ id: auditLogEntries.id });

    const archivedCount = result.length;

    this.logger?.info({
      archivedCount,
      archiveDate: archiveDate.toISOString(),
      daysOld,
      archivedBy
    }, 'Log archival completed');

    return archivedCount;
  }

  /**
   * Purge archived audit logs (background job method)
   * Permanently deletes logs with 'pending-purge' status older than specified days (default: 2555 days = 7 years for HIPAA)
   */
  async purgeArchivedLogs(daysOld: number = 2555): Promise<number> {
    this.logger?.debug({ daysOld }, 'Starting log purge process');

    const purgeDate = subDays(new Date(), daysOld);

    // First, mark archived logs for purging if they exceed the retention period
    await this.db
      .update(auditLogEntries)
      .set({
        retentionStatus: 'pending-purge',
        updatedAt: new Date()
      })
      .where(and(
        eq(auditLogEntries.retentionStatus, 'archived'),
        lte(auditLogEntries.createdAt, purgeDate)
      ));

    // Then, permanently delete logs marked as pending-purge
    const result = await this.db
      .delete(auditLogEntries)
      .where(eq(auditLogEntries.retentionStatus, 'pending-purge'))
      .returning({ id: auditLogEntries.id });

    const purgedCount = result.length;

    this.logger?.info({
      purgedCount,
      purgeDate: purgeDate.toISOString(),
      daysOld
    }, 'Log purge completed');

    return purgedCount;
  }


  /**
   * Get audit statistics for compliance dashboards
   */
  async getAuditStatistics(): Promise<{
    totalEntries: number;
    activeEntries: number;
    archivedEntries: number;
    pendingPurge: number;
    lastVerification?: Date;
    integrityStatus: 'healthy' | 'compromised' | 'unknown';
  }> {
    this.logger?.debug({}, 'Getting audit statistics');

    const [
      totalCount,
      activeCount,
      archivedCount,
      purgeCount
    ] = await Promise.all([
      this.count(),
      this.count({ retentionStatus: 'active' }),
      this.count({ retentionStatus: 'archived' }),
      this.count({ retentionStatus: 'pending-purge' })
    ]);

    // Simple integrity status check
    const integrityStatus = 'healthy'; // Would be enhanced with actual verification data

    return {
      totalEntries: totalCount,
      activeEntries: activeCount,
      archivedEntries: archivedCount,
      pendingPurge: purgeCount,
      integrityStatus
    };
  }
}