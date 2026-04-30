import type { ValidatedContext } from '@/types/app';
import type { TestEmailTemplateBody, TestEmailTemplateParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User, Session } from '@/types/auth';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/core/errors';
import { EmailTemplateRepository } from './repos/template.repo';
import { EmailQueueRepository } from './repos/queue.repo';
import type { EmailQueueItem } from './repos/email.schema';

/**
 * testEmailTemplate
 * 
 * Path: POST /email/templates/{template}/test
 * OperationId: testEmailTemplate
 */
export async function testEmailTemplate(
  ctx: ValidatedContext<TestEmailTemplateBody, never, TestEmailTemplateParams>
): Promise<Response> {
  // Get authenticated session from Better-Auth
  const session = ctx.get('session') as Session;

  // Get user for audit logging
  const user = ctx.get('user') as User;

  // Verify admin role is required for email template management
  const userRoles = user.role ? user.role.split(',').map(r => r.trim()) : [];
  if (!userRoles.includes('admin')) {
    throw new ForbiddenError('Admin role required for email template management');
  }
  
  // Extract validated parameters
  const params = ctx.req.valid('param') as { template: string };
  
  // Extract validated request body
  const body = ctx.req.valid('json') as {
    recipientEmail: string;
    recipientName?: string;
    variables?: Record<string, any>;
  };

  // Validate required fields
  if (!body.recipientEmail) {
    throw new ValidationError('Recipient email address is required for template testing');
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.recipientEmail)) {
    throw new ValidationError('Invalid recipient email address format');
  }
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');

  // Instantiate repositories
  const templateRepo = new EmailTemplateRepository(db, logger);
  const queueRepo = new EmailQueueRepository(db, logger);
  
  // Get the template first to check if it exists
  const template = await templateRepo.getActiveTemplate(params.template);
  if (!template) {
    throw new NotFoundError('Email template not found or not active', {
      resourceType: 'emailTemplate',
      resource: params.template,
      suggestions: ['Check if the template ID is correct', 'Verify the template exists and is active']
    });
  }
  
  // Use provided variables or empty object (template validation will provide defaults)
  const testVariables = body.variables || {};

  // Include recipientName in variables if provided for personalization
  if (body['recipientName']) {
    testVariables['recipientName'] = body['recipientName'];
  }
  
  // Queue the test email for processing
  const queueItem = await queueRepo.queueEmail({
    template: params.template,
    recipient: body.recipientEmail,
    recipientName: body.recipientName,
    variables: testVariables,
    priority: 1, // High priority for test emails
    metadata: {
      isTestEmail: true,
      testedBy: user?.id,
      testedAt: new Date().toISOString()
    }
  });
  
  // Log comprehensive audit trail for healthcare compliance
  logger?.info({
    action: 'test_email_template',
    userId: user?.id,
    templateId: params.template,
    queueId: queueItem.id,
    recipientEmail: body.recipientEmail,
    recipientName: body.recipientName,
    hasVariables: !!body.variables,
    priority: queueItem.priority,
    timestamp: new Date().toISOString(),
    // Healthcare compliance fields
    activity: 'email_template_testing',
    resourceType: 'email_template',
    resourceId: params.template
  }, 'Email template test queued for processing');
  
  return ctx.json({ queue: queueItem }, 200);
}