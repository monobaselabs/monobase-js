/**
 * Database schema for billing module - matches TypeSpec API definition
 * Uses Drizzle ORM with PostgreSQL
 */

import {
  pgTable,
  uuid,
  integer,
  varchar,
  timestamp,
  text,
  boolean,
  jsonb,
  pgEnum,
  index,
  unique
} from 'drizzle-orm/pg-core';
import { baseEntityFields, type BaseEntity } from '@/core/database.schema';
import { persons } from '../../person/repos/person.schema';

// Enums matching TypeSpec billing.tsp definition
export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'open',
  'paid',
  'void',
  'uncollectible'
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'requires_capture',
  'processing',
  'succeeded',
  'failed',
  'canceled'
]);

export const captureMethodEnum = pgEnum('capture_method', [
  'automatic',
  'manual'
]);

// Invoices - Core billing entities (TypeSpec-aligned)
export const invoices = pgTable('invoice', {
  // Base entity fields (includes id, timestamps, version, audit fields)
  ...baseEntityFields,

  // Auto-generated invoice number
  invoiceNumber: varchar('invoice_number', { length: 50 }).notNull(),

  // Core relationships (TypeSpec: customer/merchant)
  // Both customer and merchant are persons in monobase (industry-neutral)
  customer: uuid('customer')
    .notNull()
    .references(() => persons.id, { onDelete: 'cascade' }),

  merchant: uuid('merchant')
    .notNull()
    .references(() => persons.id, { onDelete: 'cascade' }),

  // Optional merchant account for payment processing
  merchantAccount: uuid('merchant_account')
    .references(() => merchantAccounts.id, { onDelete: 'set null' }),

  // Unique context for idempotency (e.g., 'booking:123')
  context: varchar('context', { length: 255 }),

  // Invoice status
  status: invoiceStatusEnum('status').notNull().default('draft'),

  // Amount fields in cents (TypeSpec: CurrencyAmount)
  subtotal: integer('subtotal').notNull(),
  tax: integer('tax'),
  total: integer('total').notNull(),

  // Currency code (3-letter ISO 4217)
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),

  // Payment capture method
  paymentCaptureMethod: captureMethodEnum('payment_capture_method').notNull().default('automatic'),

  // Payment due date
  paymentDueAt: timestamp('payment_due_at'),

  // Payment status
  paymentStatus: paymentStatusEnum('payment_status'),

  // Payment lifecycle timestamps and actors
  paidAt: timestamp('paid_at'),
  paidBy: uuid('paid_by'),

  voidedAt: timestamp('voided_at'),
  voidedBy: uuid('voided_by'),

  // Void threshold in minutes for charge protection
  voidThresholdMinutes: integer('void_threshold_minutes'),

  // Authorization tracking
  authorizedAt: timestamp('authorized_at'),
  authorizedBy: uuid('authorized_by'),

  // Metadata (includes Stripe IDs, etc.)
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),

}, (table) => ({
  // Performance indexes
  customerIdx: index('invoices_customer_idx').on(table.customer),
  merchantIdx: index('invoices_merchant_idx').on(table.merchant),
  merchantAccountIdx: index('invoices_merchant_account_idx').on(table.merchantAccount),
  statusIdx: index('invoices_status_idx').on(table.status),
  paymentStatusIdx: index('invoices_payment_status_idx').on(table.paymentStatus),
  contextIdx: index('invoices_context_idx').on(table.context),
  paymentDueAtIdx: index('invoices_payment_due_at_idx').on(table.paymentDueAt),

  // Unique constraints
  uniqueInvoiceNumber: unique('invoices_invoice_number_unique').on(table.invoiceNumber),
  uniqueContext: unique('invoices_context_unique').on(table.context),

  // Compound indexes for common queries
  customerStatusIdx: index('invoices_customer_status_idx')
    .on(table.customer, table.status),
  merchantStatusIdx: index('invoices_merchant_status_idx')
    .on(table.merchant, table.status),

}));

// Merchant Accounts - Person payment account management (TypeSpec-aligned)
export const merchantAccounts = pgTable('merchant_account', {
  // Base entity fields
  ...baseEntityFields,

  // Person who owns this merchant account (TypeSpec: person)
  person: uuid('person')
    .notNull()
    .references(() => persons.id, { onDelete: 'cascade' }),

  // Whether account is active
  active: boolean('active').notNull().default(true),

  // Metadata (includes stripeAccountId, onboardingComplete, etc.)
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),

}, (table) => ({
  // Performance indexes
  personIdx: index('merchant_accounts_person_idx').on(table.person),
  activeIdx: index('merchant_accounts_active_idx').on(table.active),

  // Unique constraints
  uniquePerson: unique('merchant_accounts_person_unique').on(table.person),

}));

// Invoice Line Items - TypeSpec InvoiceLineItem model
export const invoiceLineItems = pgTable('invoice_line_item', {
  // Base entity fields (includes id, timestamps, etc.)
  ...baseEntityFields,

  // Reference to invoice
  invoice: uuid('invoice')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),

  // Item description
  description: varchar('description', { length: 500 }).notNull(),

  // Quantity (default 1)
  quantity: integer('quantity').notNull().default(1),

  // Unit price in cents
  unitPrice: integer('unit_price').notNull(),

  // Total amount in cents (quantity * unitPrice)
  amount: integer('amount').notNull(),

  // Metadata for tracking (e.g., {type: 'booking', reference: UUID})
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),

}, (table) => ({
  // Performance indexes
  invoiceIdx: index('invoice_line_items_invoice_idx').on(table.invoice),
}));

// Type exports for TypeScript
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

export type MerchantAccount = typeof merchantAccounts.$inferSelect;
export type NewMerchantAccount = typeof merchantAccounts.$inferInsert;

export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type NewInvoiceLineItem = typeof invoiceLineItems.$inferInsert;

// Enum type exports for type safety (matching TypeSpec)
export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
export type PaymentStatus = 'pending' | 'requires_capture' | 'processing' | 'succeeded' | 'failed' | 'canceled';
export type CaptureMethod = 'automatic' | 'manual';
export type CurrencyCode = string; // 3-letter ISO 4217 currency code
export type CurrencyAmount = number; // Amount in cents

// TypeSpec-compliant interfaces

// Invoice line item (TypeSpec: InvoiceLineItem)
export interface InvoiceLineItemResponse {
  description: string;
  quantity: number;
  unitPrice: CurrencyAmount;
  amount: CurrencyAmount;
  metadata?: Record<string, unknown>;
}

// Request types (TypeSpec-compliant)

// TypeSpec: CreateInvoiceRequest
export interface CreateInvoiceRequest {
  customer: string; // UUID
  merchant: string; // UUID
  context?: string;
  currency?: CurrencyCode;
  paymentCaptureMethod?: CaptureMethod;
  paymentDueAt?: string; // ISO datetime
  voidThresholdMinutes?: number;
  lineItems: CreateLineItemRequest[];
  metadata?: Record<string, unknown>;
}

// TypeSpec: CreateLineItemRequest
export interface CreateLineItemRequest {
  description: string;
  quantity?: number;
  unitPrice: CurrencyAmount;
  metadata?: Record<string, unknown>;
}

// TypeSpec: UpdateInvoiceRequest
export interface UpdateInvoiceRequest {
  paymentCaptureMethod?: CaptureMethod;
  paymentDueAt?: string; // ISO datetime
  voidThresholdMinutes?: number;
  lineItems?: CreateLineItemRequest[];
  metadata?: Record<string, unknown>;
}

// TypeSpec: PaymentRequest
export interface PaymentRequest {
  paymentMethod?: string;
  metadata?: Record<string, unknown>;
}

// TypeSpec: PaymentResponse
export interface PaymentResponse {
  checkoutUrl: string;
  metadata?: Record<string, unknown>;
}

// TypeSpec: CreateMerchantAccountRequest
export interface CreateMerchantAccountRequest {
  person?: string; // UUID
  refreshUrl: string;
  returnUrl: string;
  metadata?: Record<string, unknown>;
}

// TypeSpec: OnboardingRequest
export interface OnboardingRequest {
  refreshUrl: string;
  returnUrl: string;
}

// TypeSpec: OnboardingResponse
export interface OnboardingResponse {
  onboardingUrl: string;
  metadata?: Record<string, unknown>;
}

// TypeSpec: RefundRequest
export interface RefundRequest {
  amount?: CurrencyAmount;
  reason?: string;
  metadata?: Record<string, unknown>;
}

// TypeSpec: RefundResponse
export interface RefundResponse {
  refundedAmount: CurrencyAmount;
  metadata?: Record<string, unknown>;
}

// TypeSpec: DashboardResponse
export interface DashboardResponse {
  dashboardUrl: string;
  expiresAt: string;
}

// Extended types for internal use
export interface InvoiceWithLineItems extends Invoice {
  lineItems: InvoiceLineItem[];
}

export interface MerchantAccountWithPerson extends Omit<MerchantAccount, 'person'> {
  person: { id: string } | null;
}

// Filter interfaces for repository queries
export interface InvoiceFilters {
  customer?: string;
  merchant?: string;
  status?: InvoiceStatus;
  context?: string;
  paymentStatus?: PaymentStatus;
}

export interface MerchantAccountFilters {
  person?: string;
  active?: boolean;
}
