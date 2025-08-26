import { Template, TemplateFrontmatter } from '../utils/config.js';
import { MarkdownParser } from '../utils/markdown-parser.js';
import pino from 'pino';

export interface AppliedTemplate {
  template: Template;
  frontmatter: Record<string, any>;
  content: string;
  applied: Date;
}

export interface TemplateMatch {
  template: Template;
  pattern: RegExp;
  priority: number;
}

export class TemplateEngineError extends Error {
  constructor(
    message: string,
    public readonly templatePattern: string,
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'TemplateEngineError';
  }
}

export class TemplateEngine {
  private templates: TemplateMatch[] = [];
  private logger = pino({ name: 'TemplateEngine' });
  private parser = new MarkdownParser();

  constructor(templates: Template[] = []) {
    this.loadTemplates(templates);
  }

  loadTemplates(templates: Template[]): void {
    try {
      this.templates = templates.map((template, index) => ({
        template,
        pattern: new RegExp(template.pattern, 'i'),
        priority: templates.length - index,
      })).sort((a, b) => b.priority - a.priority);

      this.logger.info({ count: templates.length }, 'Loaded templates');
    } catch (error) {
      throw new TemplateEngineError(
        `Failed to load templates: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'all',
        'load',
        error instanceof Error ? error : undefined
      );
    }
  }

  getTemplateForPath(filePath: string): Template | undefined {
    const normalizedPath = this.normalizePath(filePath);
    
    for (const templateMatch of this.templates) {
      if (templateMatch.pattern.test(normalizedPath)) {
        this.logger.debug({ 
          path: normalizedPath, 
          pattern: templateMatch.template.pattern 
        }, 'Found matching template');
        return templateMatch.template;
      }
    }

    this.logger.debug({ path: normalizedPath }, 'No matching template found');
    return undefined;
  }

  applyTemplate(template: Template, existingContent: string = ''): string {
    try {
      const parsed = existingContent ? this.parser.parse(existingContent) : { frontmatter: {}, content: '' };
      
      const templateFrontmatter = this.generateTemplateFrontmatter(template.frontmatter, parsed.frontmatter);
      
      let finalContent = parsed.content;
      if (!finalContent && template.content_template) {
        finalContent = this.processContentTemplate(template.content_template, templateFrontmatter);
      }

      const result = this.parser.generateMarkdown(templateFrontmatter, finalContent);
      
      this.logger.debug({ pattern: template.pattern }, 'Applied template');
      return result;

    } catch (error) {
      throw new TemplateEngineError(
        `Failed to apply template: ${error instanceof Error ? error.message : 'Unknown error'}`,
        template.pattern,
        'apply',
        error instanceof Error ? error : undefined
      );
    }
  }

  validateAgainstTemplate(content: string, template: Template): string[] {
    try {
      const parsed = this.parser.parse(content);
      const errors: string[] = [];

      errors.push(...this.validateFrontmatterStructure(parsed.frontmatter, template.frontmatter));
      
      return errors;

    } catch (error) {
      return [`Failed to validate against template: ${error instanceof Error ? error.message : 'Unknown error'}`];
    }
  }

  getTemplateInfo(filePath: string): {
    hasTemplate: boolean;
    template?: Template;
    requiredFields: string[];
    optionalFields: string[];
  } {
    const template = this.getTemplateForPath(filePath);
    
    if (!template) {
      return {
        hasTemplate: false,
        requiredFields: [],
        optionalFields: [],
      };
    }

    return {
      hasTemplate: true,
      template,
      requiredFields: template.frontmatter?.required || [],
      optionalFields: Object.keys(template.frontmatter?.schema || {}),
    };
  }

  createFromTemplate(templatePattern: string, filePath: string, customValues: Record<string, any> = {}): string {
    const template = this.templates.find(t => t.template.pattern === templatePattern)?.template;
    
    if (!template) {
      throw new TemplateEngineError(`Template not found: ${templatePattern}`, templatePattern, 'create');
    }

    try {
      const frontmatter = this.generateTemplateFrontmatter(template.frontmatter, customValues);
      const content = template.content_template 
        ? this.processContentTemplate(template.content_template, frontmatter)
        : '';

      return this.parser.generateMarkdown(frontmatter, content);

    } catch (error) {
      throw new TemplateEngineError(
        `Failed to create from template: ${error instanceof Error ? error.message : 'Unknown error'}`,
        templatePattern,
        'create',
        error instanceof Error ? error : undefined
      );
    }
  }

  getAllTemplates(): Template[] {
    return this.templates.map(t => t.template);
  }

  getTemplatesByPattern(pattern: string): Template[] {
    const regex = new RegExp(pattern, 'i');
    return this.templates
      .filter(t => regex.test(t.template.pattern))
      .map(t => t.template);
  }

  private generateTemplateFrontmatter(
    templateFrontmatter: TemplateFrontmatter,
    existingFrontmatter: Record<string, any>
  ): Record<string, any> {
    const result = { ...existingFrontmatter };
    const now = new Date();

    for (const field of templateFrontmatter.required) {
      if (!(field in result)) {
        result[field] = this.generateDefaultValue(field, templateFrontmatter.schema[field], now);
      }
    }

    for (const [field, schema] of Object.entries(templateFrontmatter.schema)) {
      if (field in result) {
        continue;
      }
      
      if (!templateFrontmatter.required.includes(field)) {
        const defaultValue = this.generateDefaultValue(field, schema, now);
        if (defaultValue !== undefined) {
          result[field] = defaultValue;
        }
      }
    }

    return result;
  }

  private generateDefaultValue(field: string, schema: Record<string, unknown>, now: Date): unknown {
    const fieldLower = field.toLowerCase();
    
    if (fieldLower.includes('date') || fieldLower.includes('created') || fieldLower.includes('modified')) {
      return now.toISOString().split('T')[0];
    }
    
    if (fieldLower.includes('timestamp')) {
      return now.toISOString();
    }

    if (!schema) {
      return undefined;
    }

    switch (schema.type) {
      case 'string':
        if (fieldLower.includes('title')) return 'Untitled';
        if (fieldLower.includes('author')) return 'Author';
        return '';
      
      case 'array':
        return [];
      
      case 'integer':
      case 'number':
        return schema.minimum || 0;
      
      case 'boolean':
        return false;
      
      case 'object':
        return {};
      
      default:
        return undefined;
    }
  }

  private processContentTemplate(template: string, frontmatter: Record<string, any>): string {
    let processed = template;

    processed = processed.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();
      
      if (trimmedKey in frontmatter) {
        const value = frontmatter[trimmedKey];
        return Array.isArray(value) ? value.join(', ') : String(value);
      }
      
      if (trimmedKey === 'date') {
        return new Date().toISOString().split('T')[0];
      }
      
      if (trimmedKey === 'timestamp') {
        return new Date().toISOString();
      }
      
      return match;
    });

    processed = processed.replace(/\$\{([^}]+)\}/g, (match, expression) => {
      try {
        return this.evaluateExpression(expression.trim(), frontmatter);
      } catch {
        return match;
      }
    });

    return processed;
  }

  private evaluateExpression(expression: string, context: Record<string, any>): string {
    const safeContext = { ...context };
    
    if (expression.startsWith('date.')) {
      const format = expression.split('.')[1];
      const now = new Date();
      
      switch (format) {
        case 'year': return now.getFullYear().toString();
        case 'month': return (now.getMonth() + 1).toString().padStart(2, '0');
        case 'day': return now.getDate().toString().padStart(2, '0');
        case 'iso': return now.toISOString();
        default: return now.toISOString().split('T')[0];
      }
    }
    
    if (expression in safeContext) {
      return String(safeContext[expression]);
    }
    
    return expression;
  }

  private validateFrontmatterStructure(
    frontmatter: Record<string, any>,
    templateFrontmatter: TemplateFrontmatter
  ): string[] {
    const errors: string[] = [];

    for (const requiredField of templateFrontmatter.required) {
      if (!(requiredField in frontmatter)) {
        errors.push(`Missing required field: ${requiredField}`);
      } else if (frontmatter[requiredField] === null || frontmatter[requiredField] === undefined) {
        errors.push(`Required field '${requiredField}' cannot be null or undefined`);
      }
    }

    for (const [field, value] of Object.entries(frontmatter)) {
      const schema = templateFrontmatter.schema[field];
      if (schema) {
        const fieldErrors = this.validateFieldValue(field, value, schema);
        errors.push(...fieldErrors);
      }
    }

    return errors;
  }

  private validateFieldValue(field: string, value: unknown, schema: Record<string, unknown>): string[] {
    const errors: string[] = [];

    if (value === null || value === undefined) {
      return errors;
    }

    switch (schema.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`Field '${field}' must be a string, got ${typeof value}`);
        }
        break;

      case 'integer':
        if (!Number.isInteger(value)) {
          errors.push(`Field '${field}' must be an integer, got ${typeof value}`);
        } else {
          if (schema.minimum !== undefined && value < schema.minimum) {
            errors.push(`Field '${field}' must be >= ${schema.minimum}, got ${value}`);
          }
          if (schema.maximum !== undefined && value > schema.maximum) {
            errors.push(`Field '${field}' must be <= ${schema.maximum}, got ${value}`);
          }
        }
        break;

      case 'number':
        if (typeof value !== 'number') {
          errors.push(`Field '${field}' must be a number, got ${typeof value}`);
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          errors.push(`Field '${field}' must be an array, got ${typeof value}`);
        } else if (schema.items) {
          for (let i = 0; i < value.length; i++) {
            const itemErrors = this.validateFieldValue(`${field}[${i}]`, value[i], schema.items);
            errors.push(...itemErrors);
          }
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`Field '${field}' must be a boolean, got ${typeof value}`);
        }
        break;

      case 'object':
        if (typeof value !== 'object' || Array.isArray(value)) {
          errors.push(`Field '${field}' must be an object, got ${typeof value}`);
        }
        break;
    }

    return errors;
  }

  private normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').toLowerCase();
  }
}