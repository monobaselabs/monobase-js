/**
 * EmailTemplateRepository - Data access and business logic for email templates
 * Handles template CRUD operations, caching, and version management
 */

import { eq, and, or, isNull, sql, type SQL } from 'drizzle-orm';
import type { DatabaseInstance } from '@/core/database';
import { DatabaseRepository, type PaginationOptions, type PaginatedResult } from '@/core/database.repo';
import { 
  emailTemplates, 
  type EmailTemplate, 
  type NewEmailTemplate,
  type EmailTemplateFilters,
  type TemplatePreviewResult,
  type TemplateVariable
} from './email.schema';
import { ValidationError, NotFoundError, ConflictError } from '@/core/errors';
import Handlebars from 'handlebars';
import { format } from 'date-fns';

/**
 * Template cache entry
 */
interface CachedTemplate {
  template: EmailTemplate;
  compiledSubject?: Handlebars.TemplateDelegate;
  compiledHtml?: Handlebars.TemplateDelegate;
  compiledText?: Handlebars.TemplateDelegate;
  expiry: number;
}

export class EmailTemplateRepository extends DatabaseRepository<EmailTemplate, NewEmailTemplate, EmailTemplateFilters> {
  // In-memory cache with 5-minute TTL
  private templateCache = new Map<string, CachedTemplate>();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes
  
  constructor(
    db: DatabaseInstance,
    logger?: any
  ) {
    super(db, emailTemplates, logger);
    
    if (!db) {
      throw new Error('Database instance is required for EmailTemplateRepository');
    }
    
    // Register Handlebars helpers
    this.registerHandlebarsHelpers();
  }
  
  /**
   * Register custom Handlebars helpers
   */
  private registerHandlebarsHelpers(): void {
    // Date formatting helper
    Handlebars.registerHelper('formatDate', (date: string | Date, format: string) => {
      const d = new Date(date);
      if (format === 'short') {
        return d.toLocaleDateString();
      }
      return d.toLocaleString();
    });
    
    // Currency formatting helper
    Handlebars.registerHelper('formatCurrency', (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(amount / 100); // Assuming amount is in cents
    });
    
    // Conditional helper for pluralization
    Handlebars.registerHelper('plural', (count: number, singular: string, plural: string) => {
      return count === 1 ? singular : plural;
    });
  }
  
  /**
   * Build where conditions for template-specific filtering
   */
  protected buildWhereConditions(filters?: EmailTemplateFilters): SQL<unknown> | undefined {
    if (!filters) return undefined;
    
    const conditions = [];
    
    if (filters.status) {
      conditions.push(eq(emailTemplates.status, filters.status));
    }
    
    if (filters.tags && filters.tags.length > 0) {
      // Use JSONB containment operator (@>) for array containment
      // This allows filtering by multiple tags
      conditions.push(sql`${emailTemplates.tags}::jsonb @> ${JSON.stringify(filters.tags)}::jsonb`);
    }
    
    return conditions.length > 0 ? and(...conditions) : undefined;
  }
  
  /**
   * Get template by ID with caching
   */
  async getActiveTemplate(id: string): Promise<EmailTemplate | null> {
    this.logger?.debug({ id }, 'Getting active template by ID');
    
    // Check cache first
    const cached = this.templateCache.get(id);
    if (cached && cached.expiry > Date.now()) {
      this.logger?.debug({ id }, 'Template found in cache');
      return cached.template;
    }
    
    // Load from database
    const [template] = await this.db
      .select()
      .from(emailTemplates)
      .where(
        and(
          eq(emailTemplates.id, id),
          eq(emailTemplates.status, 'active')
        )
      )
      .limit(1);
    
    if (!template) {
      this.logger?.debug({ id }, 'Template not found or not active');
      return null;
    }
    
    // Cache the template
    this.cacheTemplate(template);
    
    return template;
  }
  
  /**
   * Cache a template with compiled versions
   */
  private cacheTemplate(template: EmailTemplate): void {
    try {
      const cached: CachedTemplate = {
        template,
        compiledSubject: Handlebars.compile(template.subject),
        compiledHtml: Handlebars.compile(template.bodyHtml),
        compiledText: template.bodyText ? Handlebars.compile(template.bodyText) : undefined,
        expiry: Date.now() + this.cacheTTL
      };
      
      this.templateCache.set(template.id, cached);
      this.logger?.debug({ id: template.id }, 'Template cached');
    } catch (error) {
      this.logger?.error({ error, id: template.id }, 'Failed to compile template');
    }
  }
  
  /**
   * Invalidate cache for a specific template
   */
  invalidateCache(id: string): void {
    this.templateCache.delete(id);
    this.logger?.debug({ id }, 'Template cache invalidated');
  }
  
  /**
   * Clear entire cache
   */
  clearCache(): void {
    this.templateCache.clear();
    this.logger?.debug('Template cache cleared');
  }
  
  /**
   * Create a new template with validation
   */
  async createTemplate(data: NewEmailTemplate): Promise<EmailTemplate> {
    this.logger?.debug({ name: data.name }, 'Creating new template');
    
    // Validate template syntax
    this.validateTemplateSyntax(data);
    
    // Validate variable definitions
    if (data.variables) {
      this.validateVariableDefinitions(data.variables);
    }
    
    // Create template
    const template = await this.createOne(data);
    
    this.logger?.info({ id: template.id, name: template.name }, 'Template created');
    
    return template;
  }
  
  /**
   * Update template with cache invalidation
   */
  async updateTemplate(id: string, data: Partial<NewEmailTemplate>): Promise<EmailTemplate> {
    this.logger?.debug({ id }, 'Updating template');
    
    // Get existing template
    const existing = await this.findOneById(id);
    if (!existing) {
      throw new NotFoundError('Template not found', {
        resourceType: 'emailTemplate',
        resource: id
      });
    }
    
    // Validate template syntax if content is being updated
    if (data.subject || data.bodyHtml || data.bodyText) {
      this.validateTemplateSyntax({
        ...existing,
        ...data
      });
    }
    
    // Validate variable definitions if updated
    if (data.variables) {
      this.validateVariableDefinitions(data.variables);
    }
    
    // Update template
    const updated = await this.updateOneById(id, {
      ...data,
      version: (existing.version || 1) + 1
    });
    
    // Invalidate cache
    this.invalidateCache(id);
    
    this.logger?.info({ id, name: existing.name }, 'Template updated and cache invalidated');
    
    return updated;
  }
  
  /**
   * Validate template syntax
   */
  private validateTemplateSyntax(template: any): void {
    try {
      // Try to compile templates to check syntax
      if (template.subject) {
        Handlebars.compile(template.subject);
      }
      if (template.bodyHtml) {
        Handlebars.compile(template.bodyHtml);
      }
      if (template.bodyText) {
        Handlebars.compile(template.bodyText);
      }
    } catch (error) {
      throw new ValidationError(`Invalid template syntax: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Validate template variable definitions
   */
  private validateVariableDefinitions(variables: TemplateVariable[]): void {
    const ids = new Set<string>();
    
    for (const variable of variables) {
      // Check for duplicate IDs
      if (ids.has(variable.id)) {
        throw new ValidationError(`Duplicate variable ID: ${variable.id}`);
      }
      ids.add(variable.id);
      
      // Validate required fields
      if (!variable.id || !variable.type || !variable.label) {
        throw new ValidationError('Variables must have id, type, and label');
      }
      
      // Validate type-specific constraints
      if (variable.type === 'string' && variable.options && variable.options.length === 0) {
        throw new ValidationError(`Variable ${variable.id}: options array cannot be empty`);
      }
      
      if ((variable.type === 'number') && (variable.min !== undefined && variable.max !== undefined) && variable.min > variable.max) {
        throw new ValidationError(`Variable ${variable.id}: min value cannot be greater than max value`);
      }
    }
  }
  
  /**
   * Validate variables against template variable definitions
   */
  validateVariables(variableDefinitions: TemplateVariable[], variables: Record<string, any>): string[] {
    const errors: string[] = [];
    
    for (const definition of variableDefinitions) {
      const value = variables[definition.id];
      
      // Check required variables
      if (definition.required && (value === undefined || value === null || value === '')) {
        errors.push(`Required variable '${definition.id}' is missing`);
        continue;
      }
      
      // Skip validation if value is not provided for optional variables
      if (value === undefined || value === null) {
        continue;
      }
      
      // Type-specific validation
      switch (definition.type) {
        case 'string':
          if (typeof value !== 'string') {
            errors.push(`Variable '${definition.id}' must be a string`);
          } else {
            if (definition.minLength && value.length < definition.minLength) {
              errors.push(`Variable '${definition.id}' must be at least ${definition.minLength} characters`);
            }
            if (definition.maxLength && value.length > definition.maxLength) {
              errors.push(`Variable '${definition.id}' must be at most ${definition.maxLength} characters`);
            }
            if (definition.pattern && !new RegExp(definition.pattern).test(value)) {
              errors.push(`Variable '${definition.id}' does not match required pattern`);
            }
            if (definition.options && !definition.options.includes(value)) {
              errors.push(`Variable '${definition.id}' must be one of: ${definition.options.join(', ')}`);
            }
          }
          break;
        case 'number':
          if (typeof value !== 'number') {
            errors.push(`Variable '${definition.id}' must be a number`);
          } else {
            if (definition.min !== undefined && value < definition.min) {
              errors.push(`Variable '${definition.id}' must be at least ${definition.min}`);
            }
            if (definition.max !== undefined && value > definition.max) {
              errors.push(`Variable '${definition.id}' must be at most ${definition.max}`);
            }
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`Variable '${definition.id}' must be a boolean`);
          }
          break;
        case 'date':
        case 'datetime':
          if (!(value instanceof Date) && typeof value !== 'string') {
            errors.push(`Variable '${definition.id}' must be a date or date string`);
          }
          break;
        case 'email':
          if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            errors.push(`Variable '${definition.id}' must be a valid email address`);
          }
          break;
        case 'url':
          if (typeof value !== 'string') {
            errors.push(`Variable '${definition.id}' must be a URL string`);
          } else {
            try {
              new URL(value);
            } catch {
              errors.push(`Variable '${definition.id}' must be a valid URL`);
            }
          }
          break;
        case 'array':
          if (!Array.isArray(value)) {
            errors.push(`Variable '${definition.id}' must be an array`);
          }
          break;
      }
    }
    
    return errors;
  }
  
  /**
   * Render template with variables
   */
  async renderTemplate(
    id: string, 
    variables: Record<string, any>
  ): Promise<TemplatePreviewResult> {
    this.logger?.debug({ id }, 'Rendering template');
    
    // Get template (will use cache if available)
    const template = await this.getActiveTemplate(id);
    if (!template) {
      throw new NotFoundError(`Active template not found`, {
        resourceType: 'emailTemplate',
        resource: id
      });
    }
    
    // Validate variables against definitions
    const errors = this.validateVariables(template.variables, variables);
    if (errors.length > 0) {
      throw new ValidationError(`Variable validation failed: ${errors.join(', ')}`);
    }
    
    // Get compiled templates from cache or compile now
    const cached = this.templateCache.get(id);
    
    try {
      if (cached && cached.compiledSubject && cached.compiledHtml) {
        // Use cached compiled templates
        return {
          subject: cached.compiledSubject(variables),
          bodyHtml: cached.compiledHtml(variables),
          bodyText: cached.compiledText ? cached.compiledText(variables) : undefined
        };
      } else {
        // Compile and render on the fly
        return {
          subject: Handlebars.compile(template.subject)(variables),
          bodyHtml: Handlebars.compile(template.bodyHtml)(variables),
          bodyText: template.bodyText ? Handlebars.compile(template.bodyText)(variables) : undefined
        };
      }
    } catch (error) {
      this.logger?.error({ error, id }, 'Failed to render template');
      throw new ValidationError(`Template rendering failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Preview template with sample variables
   */
  async previewTemplate(id: string, variables?: Record<string, any>): Promise<TemplatePreviewResult> {
    this.logger?.debug({ id }, 'Previewing template');
    
    // Get template
    const template = await this.getActiveTemplate(id);
    if (!template) {
      throw new NotFoundError(`Active template not found`, {
        resourceType: 'emailTemplate',
        resource: id
      });
    }
    
    // Use provided variables or generate sample variables from definitions
    const previewVars = variables || this.generateSampleVariables(template.variables);
    
    return this.renderTemplate(id, previewVars);
  }
  
  /**
   * Generate sample variables from template variable definitions
   */
  private generateSampleVariables(variableDefinitions: TemplateVariable[]): Record<string, any> {
    const sampleVars: Record<string, any> = {};
    
    for (const definition of variableDefinitions) {
      if (definition.defaultValue !== undefined) {
        sampleVars[definition.id] = definition.defaultValue;
      } else {
        // Generate sample values based on type
        switch (definition.type) {
          case 'string':
            if (definition.options && definition.options.length > 0) {
              sampleVars[definition.id] = definition.options[0];
            } else {
              sampleVars[definition.id] = `Sample ${definition.label}`;
            }
            break;
          case 'number':
            sampleVars[definition.id] = definition.min ?? 42;
            break;
          case 'boolean':
            sampleVars[definition.id] = true;
            break;
          case 'date':
            sampleVars[definition.id] = format(new Date(), 'yyyy-MM-dd');
            break;
          case 'datetime':
            sampleVars[definition.id] = new Date().toISOString();
            break;
          case 'email':
            sampleVars[definition.id] = 'sample@example.com';
            break;
          case 'url':
            sampleVars[definition.id] = 'https://example.com';
            break;
          case 'array':
            sampleVars[definition.id] = ['Sample item 1', 'Sample item 2'];
            break;
          default:
            sampleVars[definition.id] = `Sample ${definition.label}`;
        }
      }
    }
    
    return sampleVars;
  }
  
  /**
   * Mark template as active
   */
  async activateTemplate(id: string): Promise<EmailTemplate> {
    this.logger?.debug({ id }, 'Activating template');
    
    const template = await this.findOneById(id);
    if (!template) {
      throw new NotFoundError('Template not found', {
        resourceType: 'emailTemplate',
        resource: id
      });
    }
    
    // Update status
    const updated = await this.updateOneById(id, { status: 'active' });
    
    // Invalidate cache to ensure fresh load
    this.invalidateCache(id);
    
    this.logger?.info({ id, name: template.name }, 'Template activated');
    
    return updated;
  }
  
  /**
   * Archive template
   */
  async archiveTemplate(id: string): Promise<EmailTemplate> {
    this.logger?.debug({ id }, 'Archiving template');
    
    const template = await this.findOneById(id);
    if (!template) {
      throw new NotFoundError('Template not found', {
        resourceType: 'emailTemplate',
        resource: id
      });
    }
    
    // Note: No system template check since the new schema doesn't have a system field
    
    // Update status
    const updated = await this.updateOneById(id, { status: 'archived' });
    
    // Invalidate cache
    this.invalidateCache(id);
    
    this.logger?.info({ id, name: template.name }, 'Template archived');
    
    return updated;
  }
}