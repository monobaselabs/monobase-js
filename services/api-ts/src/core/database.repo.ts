/**
 * DatabaseRepository - Generic base class for database operations
 * Provides common CRUD operations that can be extended by specific repositories
 */

import { eq, and, sql, type SQL } from 'drizzle-orm';
import type { DatabaseInstance } from '@/core/database';
import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * Pagination options interface
 */
export interface PaginationOptions {
  offset: number;
  limit: number;
}

/**
 * Find many options interface
 */
export interface FindManyOptions {
  pagination?: PaginationOptions;
  orderBy?: any;
}

/**
 * Generic result interface for paginated queries
 */
export interface PaginatedResult<TEntity> {
  data: TEntity[];
  totalCount: number;
}

/**
 * Abstract base repository class providing common CRUD operations
 * 
 * @template TEntity - The database entity type (inferred from table)
 * @template TNewEntity - The new entity type for insertions (inferred from table)
 * @template TFilters - The filters interface for this entity type
 */
export abstract class DatabaseRepository<TEntity, TNewEntity, TFilters = Record<string, any>> {
  constructor(
    protected db: DatabaseInstance,
    protected table: PgTable,
    protected logger?: any
  ) {}

  /**
   * Abstract method to build where conditions based on filters
   * Must be implemented by extending classes to define entity-specific filtering logic
   */
  protected abstract buildWhereConditions(filters?: TFilters): SQL<unknown> | undefined;



  /**
   * Create a new entity record
   */
  async createOne(data: TNewEntity): Promise<TEntity> {
    this.logger?.debug({ data }, 'Creating new record');

    const [created] = await this.db
      .insert(this.table)
      .values(data as any)
      .returning();

    if (!created) {
      throw new Error('Failed to create record');
    }

    this.logger?.debug({ id: (created as any)['id'] }, 'Record created successfully');

    return created as TEntity;
  }

  /**
   * Find a single entity by ID
   */
  async findOneById(id: string): Promise<TEntity | null> {
    this.logger?.debug({ id }, 'Finding record by ID');

    const [record] = await this.db
      .select()
      .from(this.table)
      .where(eq((this.table as any).id, id))
      .limit(1);

    this.logger?.debug({ id, found: !!record }, 'Record lookup completed');

    return (record as TEntity) || null;
  }

  /**
   * Find a single entity by filters
   */
  async findOne(filters: TFilters): Promise<TEntity | null> {
    this.logger?.debug({ filters }, 'Finding record by filters');

    const filterCondition = this.buildWhereConditions(filters);

    const query = this.db
      .select()
      .from(this.table)
      .limit(1);

    if (filterCondition) {
      query.where(filterCondition);
    }

    const [record] = await query;

    this.logger?.debug({ filters, found: !!record }, 'Filtered record lookup completed');

    return (record as TEntity) || null;
  }

  /**
   * Update a single entity by ID
   */
  async updateOneById(id: string, data: Partial<TEntity>): Promise<TEntity> {
    this.logger?.debug({ id, data }, 'Updating record by ID');

    const updateData = {
      ...data,
      updatedAt: new Date(),
    };

    const [updated] = await this.db
      .update(this.table)
      .set(updateData as any)
      .where(eq((this.table as any).id, id))
      .returning();

    if (!updated) {
      throw new Error(`Record with id ${id} not found`);
    }

    this.logger?.info({ id }, 'Record updated successfully');

    return updated as TEntity;
  }

  /**
   * Delete a single entity by ID (hard delete). The optional `actorId`
   * is recorded in the audit log only; it is not persisted to the row.
   */
  async deleteOneById(id: string, actorId?: string): Promise<void> {
    this.logger?.debug({ id, actorId }, 'Deleting record by ID');

    await this.db
      .delete(this.table)
      .where(eq((this.table as any).id, id));

    this.logger?.info({ id, actorId }, 'Record deleted successfully');
  }

  /**
   * Count entities with optional filtering
   */
  async count(filters?: TFilters): Promise<number> {
    this.logger?.debug({ filters }, 'Counting records with filters');

    const countQuery = this.db
      .select({ count: sql<number>`count(*)` })
      .from(this.table);

    const filterCondition = filters ? this.buildWhereConditions(filters) : undefined;

    if (filterCondition) {
      countQuery.where(filterCondition);
    }

    const result = await countQuery;
    const count = result?.[0]?.count ? Number(result[0].count) : 0;

    this.logger?.debug({ count, filters }, 'Record count completed');

    return count;
  }

  /**
   * Find multiple entities with optional filtering and pagination
   */
  async findMany(filters?: TFilters, options?: FindManyOptions): Promise<TEntity[]> {
    this.logger?.debug({ filters, options }, 'Finding multiple records');

    const query = this.db
      .select()
      .from(this.table);

    const whereConditions = [];

    // Apply filters
    if (filters) {
      const filterCondition = this.buildWhereConditions(filters);
      if (filterCondition) {
        whereConditions.push(filterCondition);
      }
    }

    if (whereConditions.length > 0) {
      query.where(and(...whereConditions));
    }

    // Apply ordering (default to createdAt if available)
    if (options?.orderBy) {
      query.orderBy(options.orderBy);
    } else if ((this.table as any).createdAt) {
      query.orderBy((this.table as any).createdAt);
    }

    // Apply pagination
    if (options?.pagination) {
      query.limit(options.pagination.limit);
      query.offset(options.pagination.offset);
    }

    const records = await query;

    this.logger?.debug({
      recordCount: records.length,
      filters,
      options
    }, 'Multiple records retrieved');

    return records as TEntity[];
  }

  /**
   * Find multiple entities with pagination and return paginated result
   * This is a convenience method that combines findMany and count
   */
  async findManyWithPagination(filters?: TFilters, options?: FindManyOptions): Promise<PaginatedResult<TEntity>> {
    this.logger?.debug({ filters, options }, 'Finding records with pagination');

    // Get total count and data in parallel for better performance
    const [totalCount, data] = await Promise.all([
      this.count(filters),
      this.findMany(filters, options)
    ]);

    this.logger?.debug({ 
      totalCount, 
      returnedCount: data.length,
      filters,
      options 
    }, 'Paginated records retrieved');

    return {
      data,
      totalCount
    };
  }
}