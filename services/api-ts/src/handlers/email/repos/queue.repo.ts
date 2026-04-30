/**
 * EmailQueueRepository - Data access and business logic for email queue
 * Handles queue operations, status tracking, and retry logic
 */

import { eq, and, or, inArray, isNull, lte, gte, desc, asc, sql, type SQL } from 'drizzle-orm';
import type { DatabaseInstance } from '@/core/database';
import { DatabaseRepository, type PaginationOptions, type PaginatedResult } from '@/core/database.repo';
import {
  emailQueue,
  type EmailQueueItem,
  type NewEmailQueueItem,
  type EmailQueueFilters,
  type QueueEmailRequest
} from './email.schema';
import { ValidationError, NotFoundError, BusinessLogicError } from '@/core/errors';
import { v4 as uuidv4 } from 'uuid';
import { subDays } from 'date-fns';

export class EmailQueueRepository extends DatabaseRepository<EmailQueueItem, NewEmailQueueItem, EmailQueueFilters> {
  constructor(
    db: DatabaseInstance,
    logger?: any
  ) {
    super(db, emailQueue, logger);
  }
  
  /**
   * Build where conditions for queue-specific filtering
   */
  protected buildWhereConditions(filters?: EmailQueueFilters): SQL<unknown> | undefined {
    if (!filters) return undefined;
    
    const conditions = [];
    
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(inArray(emailQueue.status, filters.status));
      } else {
        conditions.push(eq(emailQueue.status, filters.status));
      }
    }
    
    // Handle direct template ID filter
    if (filters.template) {
      conditions.push(eq(emailQueue.template, filters.template));
    }

    // Handle template tags filter
    if (filters.templateTags) {
      if (Array.isArray(filters.templateTags)) {
        // Check if template_tags array contains any of the specified tags
        const tagConditions = filters.templateTags.map(tag =>
          sql`${emailQueue.templateTags} ? ${tag}`
        );
        conditions.push(or(...tagConditions));
      } else {
        // Check if template_tags array contains the specified tag
        conditions.push(sql`${emailQueue.templateTags} ? ${filters.templateTags}`);
      }
    }
    
    if (filters.recipientEmail) {
      conditions.push(eq(emailQueue.recipientEmail, filters.recipientEmail));
    }
    
    if (filters.priority !== undefined) {
      conditions.push(eq(emailQueue.priority, filters.priority));
    }
    
    if (filters.scheduledOnly) {
      conditions.push(sql`${emailQueue.scheduledAt} IS NOT NULL`);
    }
    
    if (filters.dateFrom) {
      conditions.push(gte(emailQueue.createdAt, filters.dateFrom));
    }
    
    if (filters.dateTo) {
      conditions.push(lte(emailQueue.createdAt, filters.dateTo));
    }
    
    return conditions.length > 0 ? and(...conditions as any) : undefined;
  }
  
  /**
   * Queue an email for processing
   */
  async queueEmail(request: QueueEmailRequest): Promise<EmailQueueItem> {
    // Validate that either template or templateTags is provided
    if (!request.template && !request.templateTags) {
      throw new ValidationError('Either template ID or templateTags must be provided');
    }

    this.logger?.debug({
      template: request.template,
      templateTags: request.templateTags,
      recipient: request.recipient
    }, 'Queueing email');

    const emailId = uuidv4();

    const queueItem = await this.createOne({
      id: emailId,
      template: request.template || null,
      templateTags: request.templateTags || null,
      recipientEmail: request.recipient,
      recipientName: request.recipientName,
      variables: request.variables,
      metadata: request.metadata,
      priority: request.priority || 5,
      scheduledAt: request.scheduledAt || null,
      status: 'pending',
      attempts: 0
    });

    this.logger?.info({
      id: queueItem.id,
      template: queueItem.template,
      templateTags: queueItem.templateTags,
      recipient: queueItem.recipientEmail,
      scheduled: !!queueItem.scheduledAt
    }, 'Email queued successfully');

    return queueItem;
  }
  
  /**
   * Get pending emails for processing
   */
  async getPendingEmails(limit: number = 50): Promise<EmailQueueItem[]> {
    this.logger?.debug({ limit }, 'Getting pending emails');
    
    const now = new Date();
    
    // Get emails that are:
    // 1. Status = pending AND (no scheduled time OR scheduled time <= now)
    // 2. OR status = failed AND next_retry_at <= now AND attempts < 3
    const pendingEmails = await this.db
      .select()
      .from(emailQueue)
      .where(
        and(
          isNull(emailQueue.cancelledAt),
          or(
            // Pending emails ready to send
            and(
              eq(emailQueue.status, 'pending'),
              or(
                isNull(emailQueue.scheduledAt),
                lte(emailQueue.scheduledAt, now)
              )
            ),
            // Failed emails ready for retry
            and(
              eq(emailQueue.status, 'failed'),
              lte(emailQueue.nextRetryAt, now),
              lte(emailQueue.attempts, 3)
            )
          )
        )
      )
      .orderBy(asc(emailQueue.priority), asc(emailQueue.createdAt))
      .limit(limit);
    
    this.logger?.debug({ count: pendingEmails.length }, 'Found pending emails');
    
    return pendingEmails;
  }
  
  /**
   * Mark email as processing
   */
  async markAsProcessing(id: string): Promise<EmailQueueItem> {
    this.logger?.debug({ id }, 'Marking email as processing');
    
    return this.updateOneById(id, {
      status: 'processing',
      lastAttemptAt: new Date()
    });
  }
  
  /**
   * Mark email as sent
   */
  async markAsSent(
    id: string, 
    provider: 'smtp' | 'postmark' | 'onesignal', 
    providerMessageId: string
  ): Promise<EmailQueueItem> {
    this.logger?.debug({ id, provider, providerMessageId }, 'Marking email as sent');
    
    return this.updateOneById(id, {
      status: 'sent',
      sentAt: new Date(),
      provider,
      providerMessageId
    });
  }
  
  /**
   * Mark email as failed with retry logic
   */
  async markAsFailed(id: string, error: string, attempts: number): Promise<EmailQueueItem> {
    this.logger?.debug({ id, error, attempts }, 'Marking email as failed');
    
    // Calculate next retry time with exponential backoff
    const nextRetryAt = this.calculateNextRetryTime(attempts);
    
    return this.updateOneById(id, {
      status: 'failed',
      attempts: attempts + 1,
      lastError: error,
      lastAttemptAt: new Date(),
      nextRetryAt
    });
  }
  
  /**
   * Calculate next retry time with exponential backoff
   */
  private calculateNextRetryTime(attempts: number): Date | null {
    if (attempts >= 3) {
      return null; // No more retries
    }
    
    const delays = [
      5 * 60 * 1000,     // 5 minutes
      30 * 60 * 1000,    // 30 minutes
      2 * 60 * 60 * 1000 // 2 hours
    ];
    
    const delay = delays[Math.min(attempts, delays.length - 1)] || 0;
    return new Date(Date.now() + delay);
  }
  
  /**
   * Cancel an email
   */
  async cancelEmail(id: string, userId: string, reason: string): Promise<EmailQueueItem> {
    this.logger?.debug({ id, userId, reason }, 'Cancelling email');
    
    const email = await this.findOneById(id);
    if (!email) {
      throw new NotFoundError('Email not found', {
        resourceType: 'emailQueue',
        resource: id
      });
    }
    
    // Validate email can be cancelled
    if (email.status === 'sent') {
      throw new BusinessLogicError('Cannot cancel email that has already been sent', 'EMAIL_ALREADY_SENT');
    }
    
    if (email.status === 'cancelled') {
      throw new BusinessLogicError('Email is already cancelled', 'EMAIL_ALREADY_CANCELLED');
    }
    
    return this.updateOneById(id, {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelledBy: userId,
      cancellationReason: reason
    });
  }
  
  /**
   * Retry a failed email
   */
  async retryEmail(id: string): Promise<EmailQueueItem> {
    this.logger?.debug({ id }, 'Retrying email');
    
    const email = await this.findOneById(id);
    if (!email) {
      throw new NotFoundError('Email not found', {
        resourceType: 'emailQueue',
        resource: id
      });
    }
    
    // Validate email can be retried
    if (email.status !== 'failed') {
      throw new BusinessLogicError(`Cannot retry email with status ${email.status}`, 'INVALID_STATUS_FOR_RETRY');
    }
    
    if (email.attempts >= 3) {
      throw new BusinessLogicError('Email has exceeded maximum retry attempts', 'MAX_RETRIES_EXCEEDED');
    }
    
    return this.updateOneById(id, {
      status: 'pending',
      nextRetryAt: null,
      lastError: null
    });
  }
  
  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    sent: number;
    failed: number;
    cancelled: number;
    scheduled: number;
    oldestPending?: Date;
    avgProcessingTime?: number;
  }> {
    this.logger?.debug('Getting queue statistics');
    
    // Get counts by status
    const statusCounts = await this.db
      .select({
        status: emailQueue.status,
        count: count()
      })
      .from(emailQueue)
      .groupBy(emailQueue.status);
    
    // Convert to object
    const stats = {
      pending: 0,
      processing: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
      scheduled: 0
    };
    
    for (const row of statusCounts) {
      stats[row.status as keyof typeof stats] = Number(row.count);
    }
    
    // Get count of scheduled emails
    const [scheduledCount] = await this.db
      .select({ count: count() })
      .from(emailQueue)
      .where(
        and(
          eq(emailQueue.status, 'pending'),
          sql`${emailQueue.scheduledAt} IS NOT NULL`,
          gte(emailQueue.scheduledAt, new Date())
        ) as any
      );
    
    stats.scheduled = Number(scheduledCount?.count || 0);
    
    // Get oldest pending email
    const [oldestPending] = await this.db
      .select({ createdAt: emailQueue.createdAt })
      .from(emailQueue)
      .where(
        eq(emailQueue.status, 'pending')
      )
      .orderBy(asc(emailQueue.createdAt))
      .limit(1);
    
    // Calculate average processing time for sent emails
    const processingTimes = await this.db
      .select({
        processingTime: sql<number>`EXTRACT(EPOCH FROM (${emailQueue.sentAt} - ${emailQueue.createdAt}))`
      })
      .from(emailQueue)
      .where(
        and(
          eq(emailQueue.status, 'sent'),
          sql`${emailQueue.sentAt} IS NOT NULL`
        ) as any
      )
      .limit(100); // Sample last 100 sent emails
    
    const avgProcessingTime = processingTimes.length > 0
      ? processingTimes.reduce((sum, row) => sum + (row.processingTime || 0), 0) / processingTimes.length
      : undefined;
    
    return {
      ...stats,
      oldestPending: oldestPending?.createdAt,
      avgProcessingTime
    };
  }
  
  /**
   * Clean up old sent/cancelled emails
   */
  async cleanupOldEmails(daysOld: number = 30): Promise<number> {
    this.logger?.debug({ daysOld }, 'Cleaning up old emails');

    const cutoffDate = subDays(new Date(), daysOld);
    
    const result = await this.db
      .delete(emailQueue)
      .where(
        and(
          inArray(emailQueue.status, ['sent', 'cancelled']),
          lte(emailQueue.createdAt, cutoffDate)
        )
      );
    
    const count = result.rowCount || 0;
    
    this.logger?.info({ count, daysOld }, 'Old emails cleaned up');
    
    return count;
  }
}

import { count } from 'drizzle-orm';