import type { ValidatedContext } from '@/types/app';
import type { GetEmailTemplateParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User, Session } from '@/types/auth';
import {
  ForbiddenError,
  NotFoundError,
} from '@/core/errors';
import { EmailTemplateRepository } from './repos/template.repo';

/**
 * getEmailTemplate
 * 
 * Path: GET /email/templates/{template}
 * OperationId: getEmailTemplate
 */
export async function getEmailTemplate(
  ctx: ValidatedContext<never, never, GetEmailTemplateParams>
): Promise<Response> {
  // Get authenticated session from Better-Auth
  const session = ctx.get('session') as Session;
  const user = ctx.get('user') as User;

  // Verify admin role is required for email template management
  const userRoles = user.role ? user.role.split(',').map(r => r.trim()) : [];
  if (!userRoles.includes('admin')) {
    throw new ForbiddenError('Admin role required for email template management');
  }
  
  // Extract validated parameters
  const params = ctx.req.valid('param') as { template: string };
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  
  // Instantiate repository
  const repo = new EmailTemplateRepository(db, logger);
  
  // Get template by ID - this will get any template (active, draft, or archived) since it's admin access
  const template = await repo.findOneById(params.template);
  
  if (!template) {
    throw new NotFoundError('Email template not found', {
      resourceType: 'emailTemplate',
      resource: params.template,
      suggestions: ['Check if the template ID is correct', 'Verify the template exists in the system']
    });
  }
  
  // Log audit trail
  logger?.info({
    action: 'get_email_template',
    userId: user?.id,
    templateId: params.template
  }, 'Email template retrieved');
  
  return ctx.json(template, 200);
}