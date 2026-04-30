/**
 * Email Template Initializer
 * 
 * Initializes default email templates for the system using file-based template loading.
 * This file reads .hbs template files from the filesystem and creates template definitions
 * that can be overridden via API.
 * 
 * Template Structure:
 * - Templates are loaded from .hbs files (HTML) and .text.hbs files (plain text)
 * - Each template has metadata defined in this file
 * - Templates support Handlebars syntax for variable substitution
 * - Variables are defined with types and validation rules
 */

import type { NewEmailTemplate, TemplateVariable } from '../repos/email.schema';
import type { DatabaseInstance } from '@/core/database';
import type { Logger } from '@/types/logger';
import { EmailTemplateRepository } from '../repos/template.repo';
import { EmailTemplateTags } from '../repos/email.schema';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Template metadata for file-based templates
 */
interface TemplateMetadata {
  name: string;
  description: string;
  subject: string;
  tags: string[];
  variables: TemplateVariable[];
  fromName?: string;
  fromEmail?: string;
  replyToEmail?: string;
  replyToName?: string;
}

/**
 * Template metadata definitions
 */
const TEMPLATE_METADATA: Record<string, TemplateMetadata> = {
  // Auth Templates
  'auth/email-verify': {
    name: 'Email Verification',
    description: 'Email verification template for new user registration',
    subject: 'Verify your email address',
    tags: [EmailTemplateTags.AUTH_EMAIL_VERIFY],
    variables: [
      {
        id: 'name',
        type: 'string' as const,
        label: 'Recipient Name',
        required: true
      },
      {
        id: 'email',
        type: 'email' as const,
        label: 'Email Address',
        required: true
      },
      {
        id: 'verificationLink',
        type: 'url' as const,
        label: 'Verification Link',
        required: true
      }
    ]
  },

  'auth/password-reset': {
    name: 'Password Reset',
    description: 'Password reset template for forgot password flow',
    subject: 'Reset your password',
    tags: [EmailTemplateTags.AUTH_PASSWORD_RESET],
    variables: [
      {
        id: 'name',
        type: 'string' as const,
        label: 'Recipient Name',
        required: true
      },
      {
        id: 'email',
        type: 'email' as const,
        label: 'Email Address',
        required: true
      },
      {
        id: 'resetLink',
        type: 'url' as const,
        label: 'Password Reset Link',
        required: true
      },
      {
        id: 'expirationTime',
        type: 'number' as const,
        label: 'Link Expiration Time (minutes)',
        required: true,
        defaultValue: 15
      }
    ]
  },

  'auth/2fa': {
    name: 'Two-Factor Authentication',
    description: '2FA verification code template',
    subject: 'Your verification code',
    tags: [EmailTemplateTags.AUTH_2FA],
    variables: [
      {
        id: 'name',
        type: 'string' as const,
        label: 'Recipient Name',
        required: true
      },
      {
        id: 'email',
        type: 'email' as const,
        label: 'Email Address',
        required: true
      },
      {
        id: 'code',
        type: 'string' as const,
        label: 'Verification Code',
        required: true,
        minLength: 4,
        maxLength: 8
      },
      {
        id: 'expirationTime',
        type: 'number' as const,
        label: 'Code Expiration Time (minutes)',
        required: true,
        defaultValue: 5
      }
    ]
  },

  'auth/welcome': {
    name: 'Welcome Email',
    description: 'Welcome email for new users after successful registration',
    subject: 'Welcome to Monobase!',
    tags: [EmailTemplateTags.AUTH_WELCOME],
    variables: [
      {
        id: 'name',
        type: 'string' as const,
        label: 'Recipient Name',
        required: true
      },
      {
        id: 'email',
        type: 'email' as const,
        label: 'Email Address',
        required: true
      },
      {
        id: 'dashboardLink',
        type: 'url' as const,
        label: 'Dashboard Link',
        required: true
      }
    ]
  }
};

/**
 * Load template content from filesystem
 */
async function loadTemplateContent(templatePath: string): Promise<{ html: string; text?: string }> {
  const htmlPath = join(__dirname, `${templatePath}.html.hbs`);
  const textPath = join(__dirname, `${templatePath}.text.hbs`);
  
  try {
    const html = await readFile(htmlPath, 'utf-8');
    let text: string | undefined;
    
    try {
      text = await readFile(textPath, 'utf-8');
    } catch {
      // Text template is optional
    }
    
    return { html, text };
  } catch (error) {
    throw new Error(`Failed to load template content for ${templatePath}: ${error}`);
  }
}

/**
 * Initialize email templates in the database
 */
export async function initializeEmailTemplates(
  db: DatabaseInstance,
  logger?: Logger
): Promise<void> {
  const templateRepo = new EmailTemplateRepository(db, logger);
  
  logger?.info('Starting email template initialization from filesystem');
  
  for (const [templatePath, metadata] of Object.entries(TEMPLATE_METADATA)) {
    try {
      // Check if template with same tags already exists
      const existing = await templateRepo.findMany(
        { tags: metadata.tags },
        { pagination: { limit: 1, offset: 0 } }
      );
      
      if (existing.length > 0) {
        logger?.debug(
          { tags: metadata.tags, name: metadata.name }, 
          'Template already exists, skipping'
        );
        continue;
      }
      
      // Load template content from files
      const { html, text } = await loadTemplateContent(templatePath);
      
      // Create template definition
      const templateDef: NewEmailTemplate = {
        name: metadata.name,
        description: metadata.description,
        subject: metadata.subject,
        bodyHtml: html,
        bodyText: text,
        tags: metadata.tags,
        variables: metadata.variables,
        fromName: metadata.fromName,
        fromEmail: metadata.fromEmail,
        replyToEmail: metadata.replyToEmail,
        replyToName: metadata.replyToName,
        status: 'active'
      };
      
      // Create new template
      const created = await templateRepo.createTemplate(templateDef);
      
      logger?.info(
        { id: created.id, name: created.name, tags: created.tags, templatePath },
        'Email template initialized from file'
      );
      
    } catch (error) {
      logger?.error(
        { error, name: metadata.name, tags: metadata.tags, templatePath },
        'Failed to initialize email template from file'
      );
    }
  }
  
  logger?.info('Email template initialization from filesystem completed');
}
