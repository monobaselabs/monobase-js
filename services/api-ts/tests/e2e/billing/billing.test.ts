/**
 * Billing Module E2E Tests
 *
 * Tests the complete billing workflow including:
 * - Person-based merchant account creation
 * - Invoice management (create, update, finalize, void)
 * - Payment processing (automatic and manual capture)
 * - Payment refunds
 * - Authorization and permissions
 *
 * Industry-neutral person-to-person billing (no healthcare dependencies)
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { faker } from '@faker-js/faker';
import { createApiClient, type ApiClient } from '../../helpers/client';
import { createTestApp, type TestApp } from '../../helpers/test-app';
import {
  generateTestMerchantAccountData,
  generateTestInvoiceData,
  generateTestPaymentData,
  generateTestRefundData,
  createMerchantAccount,
  getMerchantAccount,
  createInvoice,
  getInvoice,
  payInvoice,
  captureInvoicePayment,
  refundInvoicePayment,
  setupBillingTestScenario,
  getMerchantAccountFromDb,
  getInvoiceFromDb,
  authorizeInvoicePayment
} from '../../helpers/billing';
import { generateTestPersonData, createPerson } from '../../helpers/person';

describe('Billing Module E2E Tests', () => {
  let testApp: TestApp;
  let customerClient: ApiClient;
  let merchantClient: ApiClient;
  let adminClient: ApiClient;

  beforeAll(async () => {
    testApp = await createTestApp({ storage: true });
  }, 30000);

  beforeEach(async () => {
    // Reset test data before each test
    testApp.resetMocks();

    // Create fresh API clients for each test
    customerClient = createApiClient({ app: testApp.app });
    merchantClient = createApiClient({ app: testApp.app });
    adminClient = createApiClient({ app: testApp.app });

    // Authenticate all clients
    await customerClient.signup();
    await merchantClient.signup();
    await adminClient.signinAsAdmin();
  });

  afterAll(async () => {
    await testApp?.cleanup();
  });

  describe('Merchant Account Management', () => {
    test('should create merchant account for person', async () => {
      // Create person
      const personData = generateTestPersonData();
      const personResult = await createPerson(merchantClient, personData);
      const person = personResult.data;
      expect(person?.id).toBeDefined();

      // Create merchant account
      const merchantAccountData = generateTestMerchantAccountData(person!.id);
      const merchantAccount = await createMerchantAccount(merchantClient, merchantAccountData);

      expect(merchantAccount).toBeDefined();
      expect(merchantAccount.id).toBeDefined();
      expect(merchantAccount.person).toBe(person!.id);
      expect(merchantAccount.active).toBe(true);
      expect(merchantAccount.metadata).toBeDefined();
    });

    test('should get merchant account by ID', async () => {
      const { merchant, merchantAccount } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      const retrieved = await getMerchantAccount(merchantClient, merchantAccount.id);

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(merchantAccount.id);
      expect(retrieved.person).toBe(merchant.id);
    });

    test('should not allow duplicate merchant accounts for same person', async () => {
      const personData = generateTestPersonData();
      const personResult = await createPerson(merchantClient, personData);
      const person = personResult.data;

      const merchantAccountData = generateTestMerchantAccountData(person!.id);
      await createMerchantAccount(merchantClient, merchantAccountData);

      // Try to create duplicate
      await expect(
        createMerchantAccount(merchantClient, merchantAccountData)
      ).rejects.toThrow();
    });
  });

  describe('Invoice Management', () => {
    test('should create invoice', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      const invoiceData = generateTestInvoiceData(customer.id, merchant.id);
      const invoice = await createInvoice(merchantClient, invoiceData);

      expect(invoice).toBeDefined();
      expect(invoice.id).toBeDefined();
      expect(invoice.invoiceNumber).toBeDefined();
      expect(invoice.customer).toBe(customer.id);
      expect(invoice.merchant).toBe(merchant.id);
      expect(invoice.status).toBe('draft');
      expect(invoice.total).toBeGreaterThan(0);
      expect(invoice.lineItems).toBeDefined();
      expect(invoice.lineItems.length).toBeGreaterThan(0);
    });

    test('should get invoice by ID', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      const invoiceData = generateTestInvoiceData(customer.id, merchant.id);
      const created = await createInvoice(merchantClient, invoiceData);

      const retrieved = await getInvoice(merchantClient, created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(created.id);
      expect(retrieved.invoiceNumber).toBe(created.invoiceNumber);
    });

    test('should enforce idempotency with context field', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      const context = `service:${faker.string.uuid()}`;
      const invoiceData = generateTestInvoiceData(customer.id, merchant.id, context);

      const invoice1 = await createInvoice(merchantClient, invoiceData);
      expect(invoice1).toBeDefined();

      // Try to create duplicate with same context
      await expect(
        createInvoice(merchantClient, invoiceData)
      ).rejects.toThrow(/context/i);
    });

    test('should finalize invoice', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      const invoiceData = generateTestInvoiceData(customer.id, merchant.id);
      const invoice = await createInvoice(merchantClient, invoiceData);

      const response = await merchantClient.fetch(`/billing/invoices/${invoice.id}/finalize`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);
      const finalized = await response.json();
      expect(finalized.status).toBe('open');
    });

    test('should void invoice', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      const invoiceData = generateTestInvoiceData(customer.id, merchant.id, undefined, {
        paymentCaptureMethod: 'manual'
      });
      const invoice = await createInvoice(merchantClient, invoiceData);

      await merchantClient.fetch(`/billing/invoices/${invoice.id}/finalize`, {
        method: 'POST'
      });

      // Initiate payment
      const paymentData = generateTestPaymentData();
      const paymentResponse = await payInvoice(customerClient, invoice.id, paymentData);
      
      // Simulate payment authorization (customer completed payment, now awaiting merchant decision)
      const paymentIntentId = paymentResponse.metadata.paymentIntentId;
      await authorizeInvoicePayment(testApp, invoice.id, paymentIntentId);

      const response = await merchantClient.fetch(`/billing/invoices/${invoice.id}/void`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);
      const voided = await response.json();
      expect(voided.status).toBe('void');
      expect(voided.voidedAt).toBeDefined();
    });
  });

  describe('Payment Processing', () => {
    test('should process payment for invoice', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      // Create and finalize invoice
      const invoiceData = generateTestInvoiceData(customer.id, merchant.id);
      const invoice = await createInvoice(merchantClient, invoiceData);

      await merchantClient.fetch(`/billing/invoices/${invoice.id}/finalize`, {
        method: 'POST'
      });

      // Process payment as customer
      const paymentData = generateTestPaymentData();
      const paymentResponse = await payInvoice(customerClient, invoice.id, paymentData);

      expect(paymentResponse).toBeDefined();
      expect(paymentResponse.checkoutUrl).toBeDefined();
    });

    test('should capture manual payment', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      // Create invoice with manual capture
      const invoiceData = generateTestInvoiceData(customer.id, merchant.id, undefined, {
        paymentCaptureMethod: 'manual'
      });
      const invoice = await createInvoice(merchantClient, invoiceData);

      await merchantClient.fetch(`/billing/invoices/${invoice.id}/finalize`, {
        method: 'POST'
      });

      // Initiate payment
      const paymentData = generateTestPaymentData();
      const paymentResponse = await payInvoice(customerClient, invoice.id, paymentData);
      
      // Simulate payment authorization (customer completed payment, now awaiting merchant decision)
      const paymentIntentId = paymentResponse.metadata.paymentIntentId;
      await authorizeInvoicePayment(testApp, invoice.id, paymentIntentId);

      // Capture payment as merchant
      const captured = await captureInvoicePayment(merchantClient, invoice.id);

      expect(captured).toBeDefined();
      expect(captured.paymentStatus).toBe('succeeded');
      expect(captured.status).toBe('paid');
    });

    test('should refund payment', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      // Create invoice with manual capture
      const invoiceData = generateTestInvoiceData(customer.id, merchant.id, undefined, {
        paymentCaptureMethod: 'manual'
      });
      const invoice = await createInvoice(merchantClient, invoiceData);

      await merchantClient.fetch(`/billing/invoices/${invoice.id}/finalize`, {
        method: 'POST'
      });

      // Initiate payment
      const paymentData = generateTestPaymentData();
      const paymentResponse = await payInvoice(customerClient, invoice.id, paymentData);
      
      // Simulate payment authorization
      const paymentIntentId = paymentResponse.metadata.paymentIntentId;
      await authorizeInvoicePayment(testApp, invoice.id, paymentIntentId);

      // Capture payment
      await captureInvoicePayment(merchantClient, invoice.id);

      // Refund payment
      const refundData = generateTestRefundData({
        amount: invoice.total
      });
      const refundResponse = await refundInvoicePayment(
        merchantClient,
        invoice.id,
        refundData
      );

      expect(refundResponse).toBeDefined();
      expect(refundResponse.refundedAmount).toBe(invoice.total);
    });
  });

  describe('Authorization', () => {
    test('should allow merchant to create invoice', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      const invoiceData = generateTestInvoiceData(customer.id, merchant.id);
      const invoice = await createInvoice(merchantClient, invoiceData);

      expect(invoice).toBeDefined();
    });

    test('should not allow non-merchant to create invoice for others', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      // Try to create invoice as customer (not the merchant)
      const invoiceData = generateTestInvoiceData(customer.id, merchant.id);

      await expect(
        createInvoice(customerClient, invoiceData)
      ).rejects.toThrow();
    });

    test('should allow customer to pay their own invoice', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      const invoiceData = generateTestInvoiceData(customer.id, merchant.id);
      const invoice = await createInvoice(merchantClient, invoiceData);

      await merchantClient.fetch(`/billing/invoices/${invoice.id}/finalize`, {
        method: 'POST'
      });

      const paymentData = generateTestPaymentData();
      const paymentResponse = await payInvoice(customerClient, invoice.id, paymentData);

      expect(paymentResponse).toBeDefined();
    });

    test('should allow both customer and merchant to view invoice', async () => {
      const { customer, merchant } = await setupBillingTestScenario(
        testApp,
        customerClient,
        merchantClient
      );

      const invoiceData = generateTestInvoiceData(customer.id, merchant.id);
      const invoice = await createInvoice(merchantClient, invoiceData);

      // Merchant can view
      const merchantView = await getInvoice(merchantClient, invoice.id);
      expect(merchantView).toBeDefined();

      // Customer can view
      const customerView = await getInvoice(customerClient, invoice.id);
      expect(customerView).toBeDefined();
    });
  });
});
