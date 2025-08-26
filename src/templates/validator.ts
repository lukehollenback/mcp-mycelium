import { ValidationRule } from '../utils/config.js';
import { MarkdownParser } from '../utils/markdown-parser.js';
import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import pino from 'pino';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: ValidationSuggestion[];
}

export interface ValidationError {
  rule: string;
  message: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning';
  suggestion?: string;
}

export interface ValidationWarning {
  rule: string;
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface ValidationSuggestion {
  rule: string;
  message: string;
  autoFixable: boolean;
  fix?: string;
}

export interface ValidationContext {
  filePath: string;
  content: string;
  frontmatter: Record<string, any>;
  plainContent: string;
  tags: string[];
  links: Array<{ target: string; text: string; type: string }>;
  headers: Array<{ level: number; text: string; line: number }>;
}

export class ValidatorError extends Error {
  constructor(
    message: string,
    public readonly rule: string,
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ValidatorError';
  }
}

export class Validator {
  private rules: ValidationRule[] = [];
  private parser = new MarkdownParser();
  private logger = pino({ name: 'Validator' });
  private ruleCache = new Map<string, Function>();

  constructor(rules: ValidationRule[] = []) {
    this.loadRules(rules);
  }

  loadRules(rules: ValidationRule[]): void {
    this.rules = rules;
    this.ruleCache.clear();
    this.logger.info({ count: rules.length }, 'Loaded validation rules');
  }

  async validateContent(content: string, filePath: string): Promise<string[]> {
    try {
      const result = await this.validate(content, filePath);
      return result.errors.map(error => error.message);
    } catch (error) {
      this.logger.error({ filePath, error }, 'Validation failed');
      return [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`];
    }
  }

  async validate(content: string, filePath: string): Promise<ValidationResult> {
    try {
      const context = this.createValidationContext(content, filePath);
      const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
        suggestions: [],
      };

      const applicableRules = this.getApplicableRules(filePath);

      for (const rule of applicableRules) {
        try {
          const ruleResult = await this.executeRule(rule, context);
          
          result.errors.push(...ruleResult.errors);
          result.warnings.push(...ruleResult.warnings);
          result.suggestions.push(...ruleResult.suggestions);

        } catch (error) {
          this.logger.error({ rule: rule.name, filePath, error }, 'Rule execution failed');
          result.errors.push({
            rule: rule.name,
            message: `Rule execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            severity: 'error',
          });
        }
      }

      result.isValid = result.errors.filter(e => e.severity === 'error').length === 0;

      this.logger.debug({
        filePath,
        rulesApplied: applicableRules.length,
        errors: result.errors.length,
        warnings: result.warnings.length,
        suggestions: result.suggestions.length,
      }, 'Validation completed');

      return result;

    } catch (error) {
      throw new ValidatorError(
        `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'all',
        'validate',
        error instanceof Error ? error : undefined
      );
    }
  }

  async validateBatch(files: Array<{ content: string; filePath: string }>): Promise<Map<string, ValidationResult>> {
    const results = new Map<string, ValidationResult>();

    for (const file of files) {
      try {
        const result = await this.validate(file.content, file.filePath);
        results.set(file.filePath, result);
      } catch (error) {
        results.set(file.filePath, {
          isValid: false,
          errors: [{
            rule: 'batch-validation',
            message: `Batch validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            severity: 'error',
          }],
          warnings: [],
          suggestions: [],
        });
      }
    }

    return results;
  }

  getAvailableRules(): ValidationRule[] {
    return [...this.rules];
  }

  getRulesByPattern(pattern: string): ValidationRule[] {
    const regex = new RegExp(pattern, 'i');
    return this.rules.filter(rule => regex.test(rule.pattern));
  }

  addRule(rule: ValidationRule): void {
    this.rules.push(rule);
    this.ruleCache.delete(rule.name);
    this.logger.debug({ rule: rule.name }, 'Added validation rule');
  }

  removeRule(ruleName: string): boolean {
    const initialLength = this.rules.length;
    this.rules = this.rules.filter(rule => rule.name !== ruleName);
    this.ruleCache.delete(ruleName);
    
    const removed = this.rules.length < initialLength;
    if (removed) {
      this.logger.debug({ rule: ruleName }, 'Removed validation rule');
    }
    
    return removed;
  }

  async autoFix(content: string, filePath: string): Promise<{ content: string; applied: string[] }> {
    const result = await this.validate(content, filePath);
    let fixedContent = content;
    const appliedFixes: string[] = [];

    for (const suggestion of result.suggestions) {
      if (suggestion.autoFixable && suggestion.fix) {
        try {
          fixedContent = this.applySuggestionFix(fixedContent, suggestion);
          appliedFixes.push(suggestion.rule);
        } catch (error) {
          this.logger.warn({ 
            rule: suggestion.rule, 
            error 
          }, 'Failed to apply auto-fix');
        }
      }
    }

    return { content: fixedContent, applied: appliedFixes };
  }

  private createValidationContext(content: string, filePath: string): ValidationContext {
    const parsed = this.parser.parse(content, filePath);
    const tags = this.parser.extractTags(parsed.content, 
      Array.isArray(parsed.frontmatter.tags) ? parsed.frontmatter.tags : []
    );
    const links = this.parser.extractLinks(parsed.content);
    const headers = this.parser.extractHeaders(parsed.content);

    return {
      filePath,
      content,
      frontmatter: parsed.frontmatter,
      plainContent: this.parser.extractPlainText(parsed.content),
      tags: tags.map(t => t.tag),
      links: links.map(l => ({ target: l.target, text: l.text, type: l.type })),
      headers: headers.map(h => ({ level: h.level, text: h.text, line: h.line })),
    };
  }

  private getApplicableRules(filePath: string): ValidationRule[] {
    return this.rules.filter(rule => {
      try {
        const regex = new RegExp(rule.pattern, 'i');
        return regex.test(filePath);
      } catch (error) {
        this.logger.warn({ rule: rule.name, pattern: rule.pattern, error }, 'Invalid rule pattern');
        return false;
      }
    });
  }

  private async executeRule(rule: ValidationRule, context: ValidationContext): Promise<ValidationResult> {
    let ruleFunction = this.ruleCache.get(rule.name);

    if (!ruleFunction) {
      ruleFunction = await this.loadRuleFunction(rule);
      this.ruleCache.set(rule.name, ruleFunction);
    }

    try {
      const result = await ruleFunction(context);
      return this.normalizeRuleResult(result, rule.name);
    } catch (error) {
      throw new ValidatorError(
        `Rule execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        rule.name,
        'execute',
        error instanceof Error ? error : undefined
      );
    }
  }

  private async loadRuleFunction(rule: ValidationRule): Promise<Function> {
    const scriptPath = resolve(rule.script);

    if (!existsSync(scriptPath)) {
      return this.createBuiltInRule(rule.name);
    }

    try {
      if (scriptPath.endsWith('.js')) {
        const module = await import(scriptPath);
        return module.default || module.validate;
      } else {
        return await this.executeExternalScript(scriptPath);
      }
    } catch (error) {
      this.logger.warn({ rule: rule.name, scriptPath, error }, 'Failed to load rule script, using built-in');
      return this.createBuiltInRule(rule.name);
    }
  }

  private async executeExternalScript(scriptPath: string): Promise<Function> {
    return async (context: ValidationContext): Promise<ValidationResult> => {
      return new Promise((resolve, reject) => {
        const child = spawn('node', [scriptPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`Script exited with code ${code}: ${stderr}`));
            return;
          }

          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (error) {
            reject(new Error(`Invalid JSON output: ${error instanceof Error ? error.message : 'Unknown error'}`));
          }
        });

        child.on('error', (error) => {
          reject(error);
        });

        child.stdin.write(JSON.stringify(context));
        child.stdin.end();
      });
    };
  }

  private createBuiltInRule(ruleName: string): Function {
    return async (context: ValidationContext): Promise<ValidationResult> => {
      const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
        suggestions: [],
      };

      switch (ruleName) {
        case 'required-frontmatter':
          return this.validateRequiredFrontmatter(context);
        
        case 'valid-links':
          return this.validateLinks(context);
        
        case 'tag-format':
          return this.validateTagFormat(context);
        
        case 'heading-structure':
          return this.validateHeadingStructure(context);
        
        case 'content-length':
          return this.validateContentLength(context);
        
        default:
          result.warnings.push({
            rule: ruleName,
            message: `Unknown built-in rule: ${ruleName}`,
            suggestion: 'Check rule configuration',
          });
      }

      return result;
    };
  }

  private validateRequiredFrontmatter(context: ValidationContext): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [], suggestions: [] };
    const required = ['title', 'created', 'modified'];

    for (const field of required) {
      if (!(field in context.frontmatter)) {
        result.errors.push({
          rule: 'required-frontmatter',
          message: `Missing required frontmatter field: ${field}`,
          severity: 'error',
          suggestion: `Add ${field} to frontmatter`,
        });
      }
    }

    result.isValid = result.errors.length === 0;
    return result;
  }

  private validateLinks(context: ValidationContext): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [], suggestions: [] };

    for (const link of context.links) {
      if (link.target.startsWith('http')) {
        continue;
      }

      if (!link.target.endsWith('.md')) {
        result.warnings.push({
          rule: 'valid-links',
          message: `Link target should end with .md: ${link.target}`,
          suggestion: `Change to ${link.target}.md`,
        });
      }
    }

    return result;
  }

  private validateTagFormat(context: ValidationContext): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [], suggestions: [] };
    const validTagPattern = /^[a-z0-9][a-z0-9-/]*[a-z0-9]$/;

    for (const tag of context.tags) {
      if (!validTagPattern.test(tag)) {
        result.warnings.push({
          rule: 'tag-format',
          message: `Tag format invalid: ${tag}`,
          suggestion: 'Use lowercase, numbers, hyphens, and forward slashes only',
        });
      }
    }

    return result;
  }

  private validateHeadingStructure(context: ValidationContext): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [], suggestions: [] };

    for (let i = 0; i < context.headers.length - 1; i++) {
      const current = context.headers[i];
      const next = context.headers[i + 1];

      if (next.level > current.level + 1) {
        result.warnings.push({
          rule: 'heading-structure',
          message: `Heading level jump from H${current.level} to H${next.level} at line ${next.line}`,
          line: next.line,
          suggestion: `Use H${current.level + 1} instead of H${next.level}`,
        });
      }
    }

    return result;
  }

  private validateContentLength(context: ValidationContext): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [], suggestions: [] };
    const minLength = 50;
    const maxLength = 10000;

    if (context.plainContent.length < minLength) {
      result.warnings.push({
        rule: 'content-length',
        message: `Content too short: ${context.plainContent.length} characters (minimum: ${minLength})`,
        suggestion: 'Add more content to provide value',
      });
    }

    if (context.plainContent.length > maxLength) {
      result.warnings.push({
        rule: 'content-length',
        message: `Content very long: ${context.plainContent.length} characters (consider splitting)`,
        suggestion: 'Consider breaking into multiple files',
      });
    }

    return result;
  }

  private normalizeRuleResult(result: any, ruleName: string): ValidationResult {
    if (!result || typeof result !== 'object') {
      return {
        isValid: false,
        errors: [{
          rule: ruleName,
          message: 'Rule returned invalid result',
          severity: 'error',
        }],
        warnings: [],
        suggestions: [],
      };
    }

    return {
      isValid: result.isValid ?? true,
      errors: Array.isArray(result.errors) ? result.errors : [],
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
      suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
    };
  }

  private applySuggestionFix(content: string, suggestion: ValidationSuggestion): string {
    if (!suggestion.fix) {
      return content;
    }

    return suggestion.fix;
  }
}