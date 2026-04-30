import type { ValidatedContext } from '@/types/app';
import type { CreateEmailTemplateBody } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User, Session } from '@/types/auth';
import { 
  ForbiddenError,
  ValidationError,
} from '@/core/errors';
import { EmailTemplateRepository } from './repos/template.repo';
import type { TemplateVariable } from './repos/email.schema';

/**
 * createEmailTemplate
 * 
 * Path: POST /email/templates
 * OperationId: createEmailTemplate
 */
export async function createEmailTemplate(
  ctx: ValidatedContext<CreateEmailTemplateBody, never, never>
): Promise<Response> {
  // Get authenticated session from Better-Auth
  const session = ctx.get('session') as Session;
  const user = ctx.get('user') as User;

  // Verify admin role is required for email template management
  const userRoles = user.role ? user.role.split(',').map(r => r.trim()) : [];
  if (!userRoles.includes('admin')) {
    throw new ForbiddenError('Admin role required for email template management');
  }
  
  // Extract validated request body
  const body = ctx.req.valid('json') as {
    name: string;
    description?: string;
    subject: string;
    bodyHtml: string;
    bodyText?: string;
    tags?: string[];
    variables: TemplateVariable[];
    fromName?: string;
    fromEmail?: string;
    replyToEmail?: string;
    replyToName?: string;
    status?: 'draft' | 'active' | 'archived';
  };
  
  // Validate required fields (variables is optional per TypeSpec schema)
  if (!body.name || !body.subject || !body.bodyHtml) {
    throw new ValidationError('Missing required fields: name, subject, and bodyHtml are required');
  }
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  
  // Instantiate repository
  const repo = new EmailTemplateRepository(db, logger);
  
  // Create template - repository will handle validation and conflict checking
  const template = await repo.createTemplate({
    name: body.name,
    description: body.description,
    subject: body.subject,
    bodyHtml: body.bodyHtml,
    bodyText: body.bodyText,
    tags: body.tags,
    variables: body.variables || [], // Default to empty array if not provided
    fromName: body.fromName,
    fromEmail: body.fromEmail,
    replyToEmail: body.replyToEmail,
    replyToName: body.replyToName,
    status: body.status || 'draft',
    createdBy: user?.id,
    updatedBy: user?.id,
  });
  
  // Log audit trail
  logger?.info({
    action: 'create_email_template',
    userId: user?.id,
    templateId: template.id,
    templateName: template.name,
    tags: template.tags
  }, 'Email template created');
  
  return ctx.json(template, 201);
}