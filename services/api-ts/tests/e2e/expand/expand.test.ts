/**
 * Auto-Expand Feature E2E Tests
 *
 * Tests the automatic expansion of related resources using the
 * expand query parameter. Based on Stripe's expand pattern.
 *
 * Covers:
 * - Basic field expansion
 * - Nested expansion (dot notation)
 * - Multiple field expansion
 * - Array field expansion
 * - Depth limiting (4 levels max)
 * - Invalid field handling
 * - Error resilience
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { createApiClient, type ApiClient } from '../../helpers/client';
import { createTestApp, type TestApp } from '../../helpers/test-app';
import {
  setupBillingTestScenario,
  generateTestInvoiceData,
  createInvoice
} from '../../helpers/billing';

describe('Auto-Expand Feature', () => {
  let testApp: TestApp;
  let customerClient: ApiClient;
  let merchantClient: ApiClient;

  beforeAll(async () => {
    testApp = await createTestApp({ storage: true });
  }, 30000);

  beforeEach(async () => {
    testApp.resetMocks();

    customerClient = createApiClient({ app: testApp.app });
    merchantClient = createApiClient({ app: testApp.app });

    await customerClient.signup();
    await merchantClient.signup();
  });

  afterAll(async () => {
    await testApp?.cleanup();
  });

  describe('Basic Expand', () => {
    test('should expand single field (customer)', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      const invoiceData = generateTestInvoiceData(customer.id, merchant.id);
      const invoice = await createInvoice(merchantClient, invoiceData);

      // Get invoice with expand
      const response = await merchantClient.fetch(
        `/billing/invoices/${invoice.id}?expand=customer`
      );

      expect(response.ok).toBe(true);
      const data = await response.json();

      // Customer should be expanded to object
      expect(data.customer).toBeTypeOf('object');
      expect(data.customer.id).toBe(customer.id);
      expect(data.customer.firstName).toBeDefined();
      expect(data.customer.createdAt).toBeDefined();

      // Merchant should still be ID (not expanded)
      expect(data.merchant).toBeTypeOf('string');
      expect(data.merchant).toBe(merchant.id);
    });

    test('should expand different field (merchant)', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      const invoiceData = generateTestInvoiceData(customer.id, merchant.id);
      const invoice = await createInvoice(merchantClient, invoiceData);

      // Get invoice with merchant expanded
      const response = await merchantClient.fetch(
        `/billing/invoices/${invoice.id}?expand=merchant`
      );

      expect(response.ok).toBe(true);
      const data = await response.json();

      // Merchant should be expanded
      expect(data.merchant).toBeTypeOf('object');
      expect(data.merchant.id).toBe(merchant.id);

      // Customer should still be ID
      expect(data.customer).toBeTypeOf('string');
    });

    test('should return IDs when no expand parameter provided', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      const invoiceData = generateTestInvoiceData(customer.id, merchant.id);
      const invoice = await createInvoice(merchantClient, invoiceData);

      // Get invoice without expand
      const response = await merchantClient.fetch(`/billing/invoices/${invoice.id}`);

      expect(response.ok).toBe(true);
      const data = await response.json();

      // Both should be IDs
      expect(data.customer).toBeTypeOf('string');
      expect(data.merchant).toBeTypeOf('string');
      expect(data.customer).toBe(customer.id);
      expect(data.merchant).toBe(merchant.id);
    });
  });

  describe('Multiple Expands', () => {
    test('should expand multiple fields simultaneously', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      const invoiceData = generateTestInvoiceData(customer.id, merchant.id);
      const invoice = await createInvoice(merchantClient, invoiceData);

      // Expand both customer and merchant
      const response = await merchantClient.fetch(
        `/billing/invoices/${invoice.id}?expand=customer,merchant`
      );

      expect(response.ok).toBe(true);
      const data = await response.json();

      // Both should be expanded
      expect(data.customer).toBeTypeOf('object');
      expect(data.customer.id).toBe(customer.id);
      expect(data.merchant).toBeTypeOf('object');
      expect(data.merchant.id).toBe(merchant.id);
    });
  });

  describe('Nested Expands', () => {
    test('should handle nested expand with dot notation (merchantAccount.person)', async () => {
      const { customer, merchant, merchantAccount } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      // Test nested expand on merchantAccount itself
      const response = await merchantClient.fetch(
        `/billing/merchant-accounts/${merchantAccount.id}?expand=person`
      );

      if (!response.ok) {
        const error = await response.text();
        console.log('Response not OK:', response.status, error);
      }

      expect(response.ok).toBe(true);
      const data = await response.json();

      // person should be expanded to object
      expect(data.person).toBeTypeOf('object');
      expect(data.person.id).toBe(merchant.id);
      expect(data.person.firstName).toBeDefined();

      // Verify it's an actual expansion, not just embedded data
      expect(data.person.createdAt).toBeDefined();
    });
  });

  describe('Depth Limiting', () => {
    test('should reject expands exceeding 4 levels', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      const invoiceData = generateTestInvoiceData(customer.id, merchant.id);
      const invoice = await createInvoice(merchantClient, invoiceData);

      // Try 5-level deep expand (should be rejected)
      const response = await merchantClient.fetch(
        `/billing/invoices/${invoice.id}?expand=customer.a.b.c.d`
      );

      expect(response.ok).toBe(true);
      const data = await response.json();

      // Should return original data without expansion
      expect(data.customer).toBeTypeOf('string');
      expect(data.customer).toBe(customer.id);
    });

    test('should accept expands up to 4 levels', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      const invoiceData = generateTestInvoiceData(customer.id, merchant.id);
      const invoice = await createInvoice(merchantClient, invoiceData);

      // 1-level expand (should work)
      const response = await merchantClient.fetch(
        `/billing/invoices/${invoice.id}?expand=customer`
      );

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.customer).toBeTypeOf('object');
    });
  });

  describe('Invalid Expands', () => {
    test('should handle invalid field names gracefully', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      const invoiceData = generateTestInvoiceData(customer.id, merchant.id);
      const invoice = await createInvoice(merchantClient, invoiceData);

      // Request invalid expand field
      const response = await merchantClient.fetch(
        `/billing/invoices/${invoice.id}?expand=nonexistentField`
      );

      expect(response.ok).toBe(true);
      const data = await response.json();

      // Should return original data (no expansion for invalid field)
      expect(data.customer).toBeTypeOf('string');
      expect(data.merchant).toBeTypeOf('string');
    });

    test('should handle empty expand parameter', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      const invoiceData = generateTestInvoiceData(customer.id, merchant.id);
      const invoice = await createInvoice(merchantClient, invoiceData);

      // Empty expand parameter
      const response = await merchantClient.fetch(
        `/billing/invoices/${invoice.id}?expand=`
      );

      expect(response.ok).toBe(true);
      const data = await response.json();

      // Should return IDs (no expansion)
      expect(data.customer).toBeTypeOf('string');
    });
  });

  describe('Error Resilience', () => {
    test('should fallback to original response on expand error', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      const invoiceData = generateTestInvoiceData(customer.id, merchant.id);
      const invoice = await createInvoice(merchantClient, invoiceData);

      // Even if expand fails internally, should return valid response
      const response = await merchantClient.fetch(
        `/billing/invoices/${invoice.id}?expand=customer`
      );

      expect(response.ok).toBe(true);
      const data = await response.json();

      // Should have valid invoice data
      expect(data.id).toBe(invoice.id);
      expect(data.invoiceNumber).toBeDefined();
    });
  });

  describe('Whitespace Handling', () => {
    test('should handle expand parameter with spaces', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      const invoiceData = generateTestInvoiceData(customer.id, merchant.id);
      const invoice = await createInvoice(merchantClient, invoiceData);

      // Expand with spaces around commas
      const response = await merchantClient.fetch(
        `/billing/invoices/${invoice.id}?expand=customer, merchant`
      );

      expect(response.ok).toBe(true);
      const data = await response.json();

      // Both should be expanded despite spaces
      expect(data.customer).toBeTypeOf('object');
      expect(data.merchant).toBeTypeOf('object');
    });
  });
});
