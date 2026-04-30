/**
 * Audit Service Interface
 * Provides a thin abstraction layer over AuditRepository for module integration
 * This service is injected into the app context for use by other modules
 */

import type { DatabaseInstance } from '@/core/database';
import type { Logger } from '@/types/logger';
import { AuditRepository } from '@/handlers/audit/repos/audit.repo';
import type { 
  AuditLogEntry,
  CreateAuditLogRequest 
} from '@/handlers/audit/repos/audit.schema';

/**
 * Minimal audit service interface
 * Exposes only the essential features needed by other modules
 */
export interface AuditService {
  /**
   * Log an audit event (for module integration)
   * This is the primary method other modules will use
   */
  logEvent(request: CreateAuditLogRequest, createdBy?: string): Promise<AuditLogEntry>;
  
  /**
   * Verify integrity of audit logs (for job scheduler)
   * Called periodically by background jobs for compliance validation
   */
  verifyIntegrity(entries?: AuditLogEntry[]): Promise<{
    verifiedCount: number;
    compromisedEntries: string[];
    totalChecked: number;
  }>;
  
  /**
   * Archive old audit logs (maintenance task)
   * Called periodically to move logs from active to archived status
   */
  archiveOldLogs(archiveAfterDays?: number): Promise<number>;
  
  /**
   * Mark expired logs for purging (maintenance task)
   * Called periodically to identify logs exceeding retention period
   * TODO: Not yet implemented
   */
  markForPurging?(): Promise<number>;
  
  
  /**
   * Get audit statistics (for compliance dashboards)
   * Returns summary statistics for compliance monitoring
   */
  getAuditStatistics(): Promise<{
    totalEntries: number;
    activeEntries: number;
    archivedEntries: number;
    pendingPurge: number;
    lastVerification?: Date;
    integrityStatus: 'healthy' | 'compromised' | 'unknown';
  }>;
}

/**
 * AuditService implementation
 * Wraps AuditRepository and aliases key methods for external use
 */
class AuditServiceImpl implements AuditService {
  private repo: AuditRepository;
  
  constructor(db: DatabaseInstance, logger: Logger) {
    this.repo = new AuditRepository(db, logger);
    
    // Bind methods after repository is created
    this.logEvent = this.repo.logEvent.bind(this.repo);
    this.verifyIntegrity = this.repo.verifyIntegrity.bind(this.repo);
    this.archiveOldLogs = this.repo.archiveOldLogs.bind(this.repo);
    // TODO: markForPurging method not implemented in repository yet
    // this.markForPurging = this.repo.markForPurging.bind(this.repo);
    this.getAuditStatistics = this.repo.getAuditStatistics.bind(this.repo);
  }
  
  // Method declarations
  logEvent: AuditService['logEvent'];
  verifyIntegrity: AuditService['verifyIntegrity'];
  archiveOldLogs: AuditService['archiveOldLogs'];
  markForPurging?: AuditService['markForPurging'];
  getAuditStatistics: AuditService['getAuditStatistics'];
}

/**
 * Create an audit service instance
 * Factory function following the pattern of storage and notification services
 */
export function createAuditService(
  db: DatabaseInstance, 
  logger: Logger
): AuditService {
  return new AuditServiceImpl(db, logger);
}