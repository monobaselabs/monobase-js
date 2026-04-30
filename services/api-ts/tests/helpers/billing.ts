/**
 * Billing E2E Test Helper Functions
 * Provides utilities for testing invoice-based billing endpoints
 * Industry-neutral person-to-person billing (no healthcare dependencies)
 */

import { faker } from '@faker-js/faker';
import { sql, eq } from 'drizzle-orm';
import { merchantAccounts, invoices } from '@/handlers/billing/repos/billing.schema';
import type { ApiClient } from './client';
import { createApiClient } from './client';
import type { paths } from '@monobase/api-spec';
import { generateUniqueEmail } from './unique';
import { generateTestPersonData, createPerson } from './person';
import type { TestApp } from './test-app';

// === Billing API Type Definitions (Invoice-Based) ===

export type CreateMerchantAccountRequest = paths['/billing/merchant-accounts']['post']['requestBody']['content']['application/json'];
export type CreateMerchantAccountResponse = paths['/billing/merchant-accounts']['post']['responses']['201']['content']['application/json'];
export type CreateInvoiceRequest = paths['/billing/invoices']['post']['requestBody']['content']['application/json'];
export type Invoice = paths['/billing/invoices/{invoice}']['get']['responses']['200']['content']['application/json'];
export type PaymentRequest = paths['/billing/invoices/{invoice}/pay']['post']['requestBody']['content']['application/json'];
export type PaymentResponse = paths['/billing/invoices/{invoice}/pay']['post']['responses']['200']['content']['application/json'];
export type RefundRequest = paths['/billing/invoices/{invoice}/refund']['post']['requestBody']['content']['application/json'];
export type RefundResponse = paths['/billing/invoices/{invoice}/refund']['post']['responses']['200']['content']['application/json'];

/**
 * Helper response interface for consistent return patterns
 */
export interface BillingTestResponse<T = any> {
  response: Response;
  data?: T;
  error?: string;
}

/**
 * Invoice response interface
 */
export interface InvoiceResponse {
  id: string;
  invoiceNumber: string;
  customer: string;
  merchant: string;
  context?: string;
  status: string;
  subtotal: number;
  tax: number | null;
  total: number;
  currency: string;
  paymentCaptureMethod: string;
  paymentDueAt: string | null;
  lineItems: any[];
  paymentStatus: string | null;
  paidAt: string | null;
  paidBy: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  voidThresholdMinutes: number | null;
  authorizedAt: string | null;
  authorizedBy: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// === Data Generators ===

/**
 * Generate test data for creating merchant account
 */
export function generateTestMerchantAccountData(
  personId?: string,
  overrides: Partial<CreateMerchantAccountRequest> = {}
): CreateMerchantAccountRequest {
  const { metadata, refreshUrl, returnUrl, ...rest } = overrides;
  return {
    ...(personId && { person: personId }),
    ...rest,
    refreshUrl: refreshUrl || 'http://localhost:3001/settings/billing',
    returnUrl: returnUrl || 'http://localhost:3001/settings/billing',
    metadata: {
      businessType: faker.helpers.arrayElement(['individual', 'company']),
      country: 'US',
      ...metadata
    }
  };
}

/**
 * Generate test data for creating an invoice
 */
export function generateTestInvoiceData(
  customer: string,
  merchant: string,
  context?: string,
  overrides: Partial<CreateInvoiceRequest> = {}
): CreateInvoiceRequest {
  return {
    customer,
    merchant,
    context: context || `service:${faker.string.uuid()}`,
    currency: 'USD',
    paymentCaptureMethod: 'manual',
    lineItems: [
      {
        description: 'Service Fee',
        quantity: 1,
        unitPrice: 5000, // $50.00 in cents
      }
    ],
    ...overrides
  };
}

/**
 * Generate test payment data
 */
export function generateTestPaymentData(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    paymentMethod: `pm_card_${faker.string.alphanumeric(24)}`,
    ...overrides
  };
}

/**
 * Generate test refund data
 */
export function generateTestRefundData(overrides: Partial<RefundRequest> = {}): RefundRequest {
  return {
    amount: faker.number.int({ min: 500, max: 5000 }),
    reason: faker.helpers.arrayElement(['requested_by_customer', 'duplicate', 'fraudulent']),
    metadata: {
      notes: faker.lorem.sentence()
    },
    ...overrides
  };
}

// === API Helper Functions ===

/**
 * Create merchant account via API
 */
export async function createMerchantAccount(
  apiClient: ApiClient,
  data: CreateMerchantAccountRequest
): Promise<CreateMerchantAccountResponse> {
  const response = await apiClient.fetch('/billing/merchant-accounts', {
    method: 'POST',
    body: data
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create merchant account: ${response.status} - ${error}`);
  }

  return await response.json();
}

/**
 * Get merchant account via API
 */
export async function getMerchantAccount(
  apiClient: ApiClient,
  merchantAccountId: string
): Promise<CreateMerchantAccountResponse> {
  const response = await apiClient.fetch(`/billing/merchant-accounts/${merchantAccountId}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get merchant account: ${response.status} - ${error}`);
  }

  return await response.json();
}

/**
 * Create invoice via API
 */
export async function createInvoice(
  apiClient: ApiClient,
  data: CreateInvoiceRequest
): Promise<Invoice> {
  const response = await apiClient.fetch('/billing/invoices', {
    method: 'POST',
    body: data
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create invoice: ${response.status} - ${error}`);
  }

  return await response.json();
}

/**
 * Get invoice via API
 */
export async function getInvoice(
  apiClient: ApiClient,
  invoiceId: string
): Promise<Invoice> {
  const response = await apiClient.fetch(`/billing/invoices/${invoiceId}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get invoice: ${response.status} - ${error}`);
  }

  return await response.json();
}

/**
 * Pay invoice via API
 */
export async function payInvoice(
  apiClient: ApiClient,
  invoiceId: string,
  paymentData: PaymentRequest
): Promise<PaymentResponse> {
  const response = await apiClient.fetch(`/billing/invoices/${invoiceId}/pay`, {
    method: 'POST',
    body: paymentData
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to pay invoice: ${response.status} - ${error}`);
  }

  return await response.json();
}

/**
 * Capture invoice payment via API
 */
export async function captureInvoicePayment(
  apiClient: ApiClient,
  invoiceId: string
): Promise<Invoice> {
  const response = await apiClient.fetch(`/billing/invoices/${invoiceId}/capture`, {
    method: 'POST'
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to capture payment: ${response.status} - ${error}`);
  }

  return await response.json();
}

/**
 * Refund invoice payment via API
 */
export async function refundInvoicePayment(
  apiClient: ApiClient,
  invoiceId: string,
  refundData: RefundRequest
): Promise<RefundResponse> {
  const response = await apiClient.fetch(`/billing/invoices/${invoiceId}/refund`, {
    method: 'POST',
    body: refundData
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refund payment: ${response.status} - ${error}`);
  }

  return await response.json();
}

/**
 * Setup billing test scenario with customer and merchant persons
 */
export async function setupBillingTestScenario(
  testApp: TestApp,
  customerClient: ApiClient,
  merchantClient: ApiClient
): Promise<{
  customer: any;
  merchant: any;
  merchantAccount: CreateMerchantAccountResponse;
}> {
  // Create customer person
  const customerData = generateTestPersonData();
  const customerResult = await createPerson(customerClient, customerData);
  const customer = customerResult.data;

  // Create merchant person
  const merchantData = generateTestPersonData();
  const merchantResult = await createPerson(merchantClient, merchantData);
  const merchant = merchantResult.data;

  if (!customer || !merchant) {
    throw new Error('Failed to create persons for billing test scenario');
  }

  // Create merchant account
  const merchantAccountData = generateTestMerchantAccountData(merchant.id);
  const merchantAccount = await createMerchantAccount(merchantClient, merchantAccountData);

  // Complete merchant onboarding for tests (simulates Stripe onboarding completion)
  await completeMerchantOnboarding(testApp, merchantAccount.id);

  return {
    customer,
    merchant,
    merchantAccount
  };
}

/**
 * Get merchant account from database (for test verification)
 */
export async function getMerchantAccountFromDb(
  testApp: TestApp,
  personId: string
): Promise<any | null> {
  const db = testApp.app.database;
  
  const result = await db
    .select()
    .from(merchantAccounts)
    .where(eq(merchantAccounts.person, personId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * Get invoice from database (for test verification)
 */
export async function getInvoiceFromDb(
  testApp: TestApp,
  invoiceId: string
): Promise<any | null> {
  const db = testApp.app.database;
  
  const result = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * Complete merchant account onboarding (for tests)
 * Simulates the Stripe onboarding flow completion
 */
export async function completeMerchantOnboarding(
  testApp: TestApp,
  merchantAccountId: string
): Promise<void> {
  const db = testApp.app.database;
  
  const merchantAccount = await db
    .select()
    .from(merchantAccounts)
    .where(eq(merchantAccounts.id, merchantAccountId))
    .limit(1);

  if (merchantAccount.length === 0) {
    throw new Error('Merchant account not found');
  }

  const metadata = merchantAccount[0].metadata as any;

  await db
    .update(merchantAccounts)
    .set({
      metadata: {
        ...metadata,
        onboardingComplete: true,
        stripeAccountStatus: 'active'
      }
    })
    .where(eq(merchantAccounts.id, merchantAccountId));
}

/**
 * Simulate payment authorization (for manual capture tests)
 * Updates invoice payment status to requires_capture as if customer authorized payment
 */
export async function authorizeInvoicePayment(
  testApp: TestApp,
  invoiceId: string,
  paymentIntentId: string
): Promise<void> {
  const db = testApp.app.database;
  
  const invoice = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  if (invoice.length === 0) {
    throw new Error('Invoice not found');
  }

  const metadata = invoice[0].metadata as any || {};

  await db
    .update(invoices)
    .set({
      paymentStatus: 'requires_capture',
      metadata: {
        ...metadata,
        stripePaymentIntentId: paymentIntentId
      }
    })
    .where(eq(invoices.id, invoiceId));
}

/**
 * Get invoice for a booking by context
 * Used to retrieve invoices associated with bookings
 */
export async function getInvoiceForBooking(
  testApp: TestApp,
  bookingId: string
): Promise<any | null> {
  const db = testApp.app.database;
  
  const result = await db
    .select()
    .from(invoices)
    .where(eq(invoices.context, `booking:${bookingId}`))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}
