import type { ValidatedContext } from '@/types/app';
import type { UpdateEmailTemplateBody, UpdateEmailTemplateParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User, Session } from '@/types/auth';
import { 
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/core/errors';
import { EmailTemplateRepository } from './repos/template.repo';
import type { TemplateVariable } from './repos/email.schema';

/**
 * updateEmailTemplate
 * 
 * Path: PATCH /email/templates/{template}
 * OperationId: updateEmailTemplate
 */
export async function updateEmailTemplate(
  ctx: ValidatedContext<UpdateEmailTemplateBody, never, UpdateEmailTemplateParams>
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
  
  // Extract validated request body
  const body = ctx.req.valid('json') as {
    name?: string;
    description?: string;
    subject?: string;
    bodyHtml?: string;
    bodyText?: string;
    tags?: string[];
    variables?: TemplateVariable[];
    fromName?: string;
    fromEmail?: string;
    replyToEmail?: string;
    replyToName?: string;
    status?: 'draft' | 'active' | 'archived';
  };
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  
  // Instantiate repository
  const repo = new EmailTemplateRepository(db, logger);
  
  // Find the template by ID
  const existingTemplate = await repo.findOneById(params.template);
  if (!existingTemplate) {
    throw new NotFoundError('Email template not found', {
      resourceType: 'emailTemplate',
      resource: params.template,
      suggestions: ['Check if the template ID is correct', 'Verify the template exists in the system']
    });
  }
  
  // Update template - repository will handle validation and cache invalidation
  const updatedTemplate = await repo.updateTemplate(params.template, {
    ...body,
    updatedBy: user?.id,
  });
  
  // Log audit trail
  logger?.info({
    action: 'update_email_template',
    userId: user?.id,
    templateId: params.template,
    changes: Object.keys(body)
  }, 'Email template updated');
  
  return ctx.json(updatedTemplate, 200);
}