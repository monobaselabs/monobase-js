/**
 * Email Module E2E Test Helpers
 * Provides helper functions for testing email templates and queue management
 */

import type { ApiClient } from './client';
import type { paths } from '@monobase/api-spec';

// ============================================================================
// Types and Interfaces
// ============================================================================

// Export types from the OpenAPI spec for easy access
export type EmailTemplate = paths['/email/templates/{template}']['get']['responses']['200']['content']['application/json'];
export type EmailTemplateCreateRequest = paths['/email/templates']['post']['requestBody']['content']['application/json'];
export type EmailTemplateUpdateRequest = paths['/email/templates/{template}']['patch']['requestBody']['content']['application/json'];
export type EmailTemplateListResponse = paths['/email/templates']['get']['responses']['200']['content']['application/json'];

export type EmailQueueItem = paths['/email/queue/{queue}']['get']['responses']['200']['content']['application/json'];
export type EmailQueueListResponse = paths['/email/queue']['get']['responses']['200']['content']['application/json'];
export type TestTemplateRequest = paths['/email/templates/{template}/test']['post']['requestBody']['content']['application/json'];
export type CancelEmailRequest = paths['/email/queue/{queue}/cancel']['post']['requestBody']['content']['application/json'];

export interface EmailTemplateListParams {
  // TypeSpec-supported parameters
  status?: 'draft' | 'active' | 'archived';
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface EmailQueueListParams {
  // TypeSpec-supported parameters
  status?: 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled' | ('pending' | 'processing' | 'sent' | 'failed' | 'cancelled')[];
  recipientEmail?: string;
  dateFrom?: string; // ISO date string
  dateTo?: string; // ISO date string
  priority?: number;
  scheduledOnly?: boolean;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Template API Helper Functions
// ============================================================================

/**
 * Create an email template
 * POST /email/templates
 */
export async function createEmailTemplate(
  client: ApiClient,
  templateData: EmailTemplateCreateRequest
): Promise<{ response: Response; data: EmailTemplate | null }> {
  const response = await client.fetch('/email/templates', {
    method: 'POST',
    body: templateData
  });
  const data = response.ok ? await response.json() : null;
  return { response, data };
}

/**
 * Get a specific email template
 * GET /email/templates/{template}
 */
export async function getEmailTemplate(
  client: ApiClient,
  templateId: string
): Promise<{ response: Response; data: EmailTemplate | null }> {
  const response = await client.fetch(`/email/templates/${templateId}`);
  const data = response.ok ? await response.json() : null;
  return { response, data };
}

/**
 * Update an email template
 * PATCH /email/templates/{template}
 */
export async function updateEmailTemplate(
  client: ApiClient,
  templateId: string,
  updateData: EmailTemplateUpdateRequest
): Promise<{ response: Response; data: EmailTemplate | null }> {
  const response = await client.fetch(`/email/templates/${templateId}`, {
    method: 'PATCH',
    body: updateData
  });
  const data = response.ok ? await response.json() : null;
  return { response, data };
}

/**
 * List email templates with TypeSpec-compliant parameters
 * GET /email/templates
 */
export async function listEmailTemplates(
  client: ApiClient,
  params?: EmailTemplateListParams
): Promise<{ response: Response; data: EmailTemplateListResponse | null }> {
  const searchParams: Record<string, any> = {};

  if (params) {
    if (params.status) searchParams.status = params.status;
    if (params.tags) searchParams.tags = params.tags;
    if (params.limit !== undefined) searchParams.limit = params.limit;
    if (params.offset !== undefined) searchParams.offset = params.offset;
  }

  const response = await client.fetch('/email/templates', {
    searchParams: Object.keys(searchParams).length > 0 ? searchParams : undefined
  });
  const data = response.ok ? await response.json() : null;
  return { response, data };
}

/**
 * Test an email template
 * POST /email/templates/{template}/test
 */
export async function testEmailTemplate(
  client: ApiClient,
  templateId: string,
  testData: TestTemplateRequest
): Promise<{ response: Response; data: any }> {
  const response = await client.fetch(`/email/templates/${templateId}/test`, {
    method: 'POST',
    body: testData
  });
  const data = response.ok ? await response.json() : null;
  return { response, data };
}

// ============================================================================
// Queue API Helper Functions
// ============================================================================

/**
 * List email queue items with TypeSpec-compliant parameters
 * GET /email/queue
 */
export async function listEmailQueueItems(
  client: ApiClient,
  params?: EmailQueueListParams
): Promise<{ response: Response; data: EmailQueueListResponse | null }> {
  const searchParams: Record<string, any> = {};

  if (params) {
    if (params.status) searchParams.status = params.status;
    if (params.recipientEmail) searchParams.recipientEmail = params.recipientEmail;
    if (params.dateFrom) searchParams.dateFrom = params.dateFrom;
    if (params.dateTo) searchParams.dateTo = params.dateTo;
    if (params.priority !== undefined) searchParams.priority = params.priority;
    if (params.scheduledOnly !== undefined) searchParams.scheduledOnly = params.scheduledOnly;
    if (params.limit !== undefined) searchParams.limit = params.limit;
    if (params.offset !== undefined) searchParams.offset = params.offset;
  }

  const response = await client.fetch('/email/queue', {
    searchParams: Object.keys(searchParams).length > 0 ? searchParams : undefined
  });
  const data = response.ok ? await response.json() : null;
  return { response, data };
}

/**
 * Get a specific email queue item
 * GET /email/queue/{queue}
 */
export async function getEmailQueueItem(
  client: ApiClient,
  queueId: string
): Promise<{ response: Response; data: EmailQueueItem | null }> {
  const response = await client.fetch(`/email/queue/${queueId}`);
  const data = response.ok ? await response.json() : null;
  return { response, data };
}

/**
 * Retry a failed email
 * POST /email/queue/{queue}/retry
 */
export async function retryEmailQueueItem(
  client: ApiClient,
  queueId: string
): Promise<{ response: Response; data: EmailQueueItem | null }> {
  const response = await client.fetch(`/email/queue/${queueId}/retry`, {
    method: 'POST',
    body: {}
  });
  const data = response.ok ? await response.json() : null;
  return { response, data };
}

/**
 * Cancel a pending email
 * POST /email/queue/{queue}/cancel
 */
export async function cancelEmailQueueItem(
  client: ApiClient,
  queueId: string,
  cancelData: CancelEmailRequest
): Promise<{ response: Response; data: EmailQueueItem | null }> {
  const response = await client.fetch(`/email/queue/${queueId}/cancel`, {
    method: 'POST',
    body: cancelData
  });
  const data = response.ok ? await response.json() : null;
  return { response, data };
}

// ============================================================================
// Data Generation Functions
// ============================================================================

/**
 * Generate test email template data for creation per TypeSpec
 */
export function generateTestEmailTemplateData(overrides?: Partial<EmailTemplateCreateRequest>): EmailTemplateCreateRequest {
  return {
    name: `Test Template ${Date.now()}`,
    description: 'Test email template for E2E testing',
    subject: 'Test Subject: {{patientName}}',
    bodyHtml: '<h1>Hello {{patientName}}</h1><p>This is a test email with variables.</p>',
    bodyText: 'Hello {{patientName}}, this is a test email with variables.',
    tags: ['test', 'e2e'],
    variables: [
      {
        id: 'patientName',
        type: 'string',
        label: 'Patient Name',
        required: true,
        maxLength: 100
      },
      {
        id: 'appointmentDate',
        type: 'date',
        label: 'Appointment Date',
        required: false
      }
    ],
    fromName: 'Test Monobase',
    fromEmail: 'noreply@monobase.com',
    status: 'draft',
    ...overrides
  };
}

/**
 * Generate minimal email template data per TypeSpec
 */
export function generateMinimalEmailTemplateData(): EmailTemplateCreateRequest {
  return {
    name: `Minimal Template ${Date.now()}`,
    subject: 'Minimal Subject',
    bodyHtml: '<p>Minimal HTML body</p>',
    status: 'draft'
  };
}

/**
 * Generate email template update data per TypeSpec
 */
export function generateEmailTemplateUpdateData(overrides?: Partial<EmailTemplateUpdateRequest>): EmailTemplateUpdateRequest {
  return {
    description: 'Updated description from E2E test',
    subject: 'Updated Subject: {{patientName}}',
    bodyHtml: '<h2>Updated {{patientName}}</h2><p>This template has been updated.</p>',
    status: 'active',
    ...overrides
  };
}

/**
 * Generate test template request data per TypeSpec
 */
export function generateTestTemplateRequestData(overrides?: Partial<TestTemplateRequest>): TestTemplateRequest {
  return {
    recipientEmail: 'test@example.com',
    recipientName: 'Test User',
    variables: {
      patientName: 'John Doe',
      appointmentDate: '2024-01-15'
    },
    ...overrides
  };
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate email template response structure per TypeSpec
 */
export function validateEmailTemplateResponse(template: any): boolean {
  if (!template || typeof template !== 'object') return false;

  const requiredFields = [
    'id', 'createdAt', 'updatedAt', 'version',
    'name', 'subject', 'bodyHtml', 'status'
  ];

  for (const field of requiredFields) {
    if (!(field in template)) return false;
  }

  // Validate status enum
  const validStatuses = ['draft', 'active', 'archived'];
  if (!validStatuses.includes(template.status)) return false;

  // Validate name length
  if (template.name && (template.name.length === 0 || template.name.length > 255)) return false;

  // Validate subject length
  if (template.subject && (template.subject.length === 0 || template.subject.length > 500)) return false;

  return true;
}

/**
 * Validate email queue item response structure per TypeSpec
 */
export function validateEmailQueueItemResponse(queueItem: any): boolean {
  if (!queueItem || typeof queueItem !== 'object') return false;

  const requiredFields = [
    'id', 'createdAt', 'updatedAt',
    'recipientEmail', 'variables', 'status', 'priority', 'attempts'
  ];

  for (const field of requiredFields) {
    if (!(field in queueItem)) return false;
  }

  // Validate status enum
  const validStatuses = ['pending', 'processing', 'sent', 'failed', 'cancelled'];
  if (!validStatuses.includes(queueItem.status)) return false;

  // Validate priority range
  if (queueItem.priority < 1 || queueItem.priority > 10) return false;

  // Must have either template or templateTags
  if (!queueItem.template && !queueItem.templateTags) return false;

  return true;
}

/**
 * Validate email template list response structure per TypeSpec
 */
export function validateEmailTemplateListResponse(response: any): boolean {
  if (!response || typeof response !== 'object') return false;

  if (!('data' in response) || !Array.isArray(response.data)) return false;
  if (!('pagination' in response)) return false;

  const pagination = response.pagination;
  const requiredPaginationFields = ['offset', 'limit', 'hasMore'];

  return requiredPaginationFields.every(field => field in pagination);
}

/**
 * Validate email queue list response structure per TypeSpec
 */
export function validateEmailQueueListResponse(response: any): boolean {
  if (!response || typeof response !== 'object') return false;

  if (!('data' in response) || !Array.isArray(response.data)) return false;
  if (!('pagination' in response)) return false;

  const pagination = response.pagination;
  const requiredPaginationFields = ['offset', 'limit', 'hasMore'];

  return requiredPaginationFields.every(field => field in pagination);
}

// ============================================================================
// Test Utility Functions
// ============================================================================

/**
 * Create template and verify response per TypeSpec
 */
export async function createAndVerifyEmailTemplate(
  client: ApiClient,
  templateData?: Partial<EmailTemplateCreateRequest>
): Promise<EmailTemplate> {
  const data = templateData
    ? generateTestEmailTemplateData(templateData)
    : generateTestEmailTemplateData();

  const { response, data: template } = await createEmailTemplate(client, data);

  if (![200, 201].includes(response.status) || !template) {
    throw new Error(`Failed to create email template: ${response.status} - ${response.statusText}`);
  }

  if (!validateEmailTemplateResponse(template)) {
    throw new Error('Invalid email template response structure');
  }

  return template;
}

/**
 * Wait for email queue item to reach specific status
 */
export async function waitForEmailQueueStatus(
  client: ApiClient,
  queueId: string,
  targetStatus: string,
  maxAttempts: number = 10,
  delayMs: number = 500
): Promise<EmailQueueItem | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await getEmailQueueItem(client, queueId);
    if (data?.status === targetStatus) {
      return data;
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return null;
}