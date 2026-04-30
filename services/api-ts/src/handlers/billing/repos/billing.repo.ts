/**
 * Billing Repository - Data access layer for invoices and merchant accounts
 * Follows the DatabaseRepository pattern with domain-specific methods
 */

import { eq, and, like, desc, sql, type SQL } from 'drizzle-orm';
import type { DatabaseInstance } from '@/core/database';
import { DatabaseRepository, type PaginationOptions } from '@/core/database.repo';
import {
  invoices,
  invoiceLineItems,
  merchantAccounts,
  type Invoice,
  type NewInvoice,
  type InvoiceLineItem,
  type NewInvoiceLineItem,
  type MerchantAccount,
  type NewMerchantAccount,
  type InvoiceWithLineItems,
  type MerchantAccountWithPerson,
  type InvoiceFilters,
  type MerchantAccountFilters
} from './billing.schema';

// Re-export InvoiceFilters for handler use
export type { InvoiceFilters };
import { persons } from '../../person/repos/person.schema';

/**
 * Invoice Repository - Manages invoice data operations
 */
export class InvoiceRepository extends DatabaseRepository<Invoice, NewInvoice, InvoiceFilters> {
  constructor(
    db: DatabaseInstance,
    logger?: any
  ) {
    super(db, invoices, logger);
  }

  /**
   * Build where conditions for invoice filtering (TypeSpec-aligned)
   */
  protected buildWhereConditions(filters?: InvoiceFilters): SQL<unknown> | undefined {
    if (!filters) return undefined;

    const conditions = [];

    if (filters.customer) {
      conditions.push(eq(invoices.customer, filters.customer));
    }

    if (filters.merchant) {
      conditions.push(eq(invoices.merchant, filters.merchant));
    }

    if (filters.status) {
      conditions.push(eq(invoices.status, filters.status));
    }

    if (filters.context) {
      conditions.push(eq(invoices.context, filters.context));
    }

    if (filters.paymentStatus) {
      conditions.push(eq(invoices.paymentStatus, filters.paymentStatus));
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * Find invoice with line items (TypeSpec-aligned)
   */
  async findOneWithLineItems(id: string): Promise<InvoiceWithLineItems | null> {
    this.logger?.debug({ invoiceId: id }, 'Finding invoice with line items');

    // Get the invoice first
    const invoice = await this.findOneById(id);
    if (!invoice) {
      this.logger?.debug({ invoiceId: id }, 'Invoice not found');
      return null;
    }

    // Get the line items
    const lineItems = await this.db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoice, id));

    return {
      ...invoice,
      lineItems
    };
  }

  /**
   * Update invoice status
   */
  async updateStatus(id: string, status: Invoice['status'], userId?: string): Promise<Invoice> {
    this.logger?.debug({ invoiceId: id, newStatus: status }, 'Updating invoice status');

    const updateData: Partial<NewInvoice> = { 
      status,
      ...(userId && { updatedBy: userId })
    };

    // Set timestamps based on status
    if (status === 'paid' && !updateData.paidAt) {
      updateData.paidAt = new Date();
    } else if (status === 'void' && !updateData.voidedAt) {
      updateData.voidedAt = new Date();
    }

    const updated = await this.updateOneById(id, updateData);

    this.logger?.info({ invoiceId: id, status: updated.status }, 'Invoice status updated');

    return updated;
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(id: string, paymentStatus: Invoice['paymentStatus'], userId?: string): Promise<Invoice> {
    this.logger?.debug({ invoiceId: id, newPaymentStatus: paymentStatus }, 'Updating invoice payment status');

    const updateData: Partial<NewInvoice> = { 
      paymentStatus,
      ...(userId && { updatedBy: userId })
    };

    const updated = await this.updateOneById(id, updateData);

    this.logger?.info({ invoiceId: id, paymentStatus: updated.paymentStatus }, 'Invoice payment status updated');

    return updated;
  }

  /**
   * Generate unique invoice number
   */
  async generateInvoiceNumber(): Promise<string> {
    // Generate invoice number like: INV-2024-000001
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    // Find the highest number for this year
    const result = await this.db
      .select({ invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(like(invoices.invoiceNumber, `${prefix}%`))
      .orderBy(desc(invoices.invoiceNumber))
      .limit(1);

    let nextNumber = 1;
    if (result.length > 0 && result[0]) {
      const lastNumber = result[0].invoiceNumber.replace(prefix, '');
      nextNumber = parseInt(lastNumber) + 1;
    }

    return `${prefix}${nextNumber.toString().padStart(6, '0')}`;
  }

  /**
   * Create invoice with line items in a transaction
   */
  async createWithLineItems(
    invoiceData: Omit<NewInvoice, 'id' | 'invoiceNumber'>,
    lineItemsData: Omit<NewInvoiceLineItem, 'id' | 'invoice'>[]
  ): Promise<InvoiceWithLineItems> {
    return await this.db.transaction(async (tx) => {
      // Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber();

      // Create the invoice
      const [invoice] = await tx
        .insert(invoices)
        .values({
          ...invoiceData,
          invoiceNumber
        })
        .returning();

      // Create line items
      if (!invoice) {
        throw new Error('Failed to create invoice');
      }
      
      const lineItems = await tx
        .insert(invoiceLineItems)
        .values(
          lineItemsData.map(item => ({
            ...item,
            invoice: invoice.id
          }))
        )
        .returning();

      return {
        ...invoice,
        lineItems
      } as InvoiceWithLineItems;
    });
  }
}

/**
 * Merchant Account Repository - Manages person payment accounts
 */
export class MerchantAccountRepository extends DatabaseRepository<MerchantAccount, NewMerchantAccount, MerchantAccountFilters> {
  constructor(
    db: DatabaseInstance,
    logger?: any
  ) {
    super(db, merchantAccounts, logger);
  }

  /**
   * Build where conditions for merchant account filtering
   */
  protected buildWhereConditions(filters?: MerchantAccountFilters): SQL<unknown> | undefined {
    if (!filters) return undefined;
    
    const conditions = [];
    
    if (filters.person) {
      conditions.push(eq(merchantAccounts.person, filters.person));
    }

    if (filters.active !== undefined) {
      conditions.push(eq(merchantAccounts.active, filters.active));
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * Find merchant account by person ID (TypeSpec-aligned)
   */
  async findByPerson(personId: string): Promise<MerchantAccount | null> {
    this.logger?.debug({ personId }, 'Finding merchant account by person');

    const result = await this.db
      .select()
      .from(merchantAccounts)
      .where(eq(merchantAccounts.person, personId))
      .limit(1);

    return result.length > 0 && result[0] ? result[0] : null;
  }

  /**
   * Find merchant account by Stripe account ID (stored in metadata JSONB field)
   */
  async findByStripeAccountId(stripeAccountId: string): Promise<MerchantAccount | null> {
    this.logger?.debug({ stripeAccountId }, 'Finding merchant account by Stripe account ID');

    const result = await this.db
      .select()
      .from(merchantAccounts)
      .where(sql`${merchantAccounts.metadata}->>'stripeAccountId' = ${stripeAccountId}`)
      .limit(1);

    return result.length > 0 && result[0] ? result[0] : null;
  }

  /**
   * Find merchant account with person details (TypeSpec-aligned)
   */
  async findOneWithPerson(id: string): Promise<MerchantAccountWithPerson | null> {
    this.logger?.debug({ merchantAccountId: id }, 'Finding merchant account with person details');

    const result = await this.db
      .select({
        merchantAccount: merchantAccounts,
        person: {
          id: persons.id,
          // Add other person fields as needed
        }
      })
      .from(merchantAccounts)
      .leftJoin(persons, eq(merchantAccounts.person, persons.id))
      .where(eq(merchantAccounts.id, id))
      .limit(1);

    if (result.length === 0) {
      this.logger?.debug({ merchantAccountId: id }, 'Merchant account not found');
      return null;
    }

    const row = result[0];
    if (!row) {
      return null;
    }
    
    return {
      ...row.merchantAccount,
      person: row.person
    };
  }

  /**
   * Update merchant account metadata (TypeSpec-aligned)
   */
  async updateMetadata(
    id: string,
    metadata: Record<string, unknown>,
    userId?: string
  ): Promise<MerchantAccount> {
    this.logger?.debug({
      merchantAccountId: id,
      metadata
    }, 'Updating merchant account metadata');

    const updateData: Partial<NewMerchantAccount> = {
      metadata,
      ...(userId && { updatedBy: userId })
    };

    const updated = await this.updateOneById(id, updateData);

    this.logger?.info({
      merchantAccountId: id,
      metadata: updated.metadata
    }, 'Merchant account metadata updated');

    return updated;
  }
}
