import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ToolContext } from './index.js';

export function createDiscoveryTools(context: ToolContext): Tool[] {
  return [
    {
      name: 'list_vaults',
      description: 'List all available vaults with basic statistics',
      inputSchema: {
        type: 'object',
        properties: {
          includeStats: {
            type: 'boolean',
            description: 'Include detailed statistics for each vault',
            default: true,
          },
        },
      },
    },

    {
      name: 'list_files',
      description: 'List files in a vault with optional filtering',
      inputSchema: {
        type: 'object',
        properties: {
          vault: {
            type: 'string',
            description: 'Vault name (optional, uses default if not specified)',
          },
          pattern: {
            type: 'string',
            description: 'File path pattern to match (regex supported)',
          },
          sortBy: {
            type: 'string',
            enum: ['name', 'modified', 'size', 'created'],
            description: 'Sort files by specified field',
            default: 'modified',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of files to return',
            default: 50,
          },
          includeMetadata: {
            type: 'boolean',
            description: 'Include file metadata in results',
            default: false,
          },
        },
      },
    },

    {
      name: 'validate_file',
      description: 'Validate a file against configured rules and templates',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to vault root',
          },
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          rules: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific validation rules to apply (optional)',
          },
        },
        required: ['path'],
      },
    },

    {
      name: 'suggest_tags',
      description: 'Get tag suggestions based on content and existing taxonomy',
      inputSchema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'Content to analyze for tag suggestions',
          },
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          existingTags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags already applied to the content',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of suggestions',
            default: 10,
          },
        },
        required: ['content'],
      },
    },

    {
      name: 'get_templates',
      description: 'Get available templates and their configurations',
      inputSchema: {
        type: 'object',
        properties: {
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          pattern: {
            type: 'string',
            description: 'Filter templates by pattern match',
          },
        },
      },
    },

    {
      name: 'preview_template',
      description: 'Preview what a template would generate for a given path',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path to test template matching',
          },
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          customValues: {
            type: 'object',
            description: 'Custom frontmatter values to use in preview',
          },
        },
        required: ['path'],
      },
    },

    {
      name: 'get_recent_files',
      description: 'Get recently modified or created files',
      inputSchema: {
        type: 'object',
        properties: {
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          type: {
            type: 'string',
            enum: ['modified', 'created'],
            description: 'Sort by modification or creation time',
            default: 'modified',
          },
          limit: {
            type: 'number',
            description: 'Number of files to return',
            default: 20,
          },
          since: {
            type: 'string',
            format: 'date',
            description: 'Only show files changed since this date',
          },
        },
      },
    },
  ];
}

export async function handleListVaults(args: any, context: ToolContext): Promise<any> {
  const { includeStats } = args;
  const { vaultManager } = context;

  try {
    const vaults = vaultManager.listVaults();
    
    if (!includeStats) {
      return {
        vaults: vaults.map(v => ({ name: v.name, path: v.path })),
        total: vaults.length,
      };
    }

    const detailedVaults = vaults.map(vault => {
      const stats = vaultManager.getStats()[vault.name];
      return {
        name: vault.name,
        path: vault.path,
        fileCount: vault.fileCount,
        stats: stats || {
          tagCount: 0,
          linkCount: 0,
          lastIndexed: null,
        },
      };
    });

    return {
      vaults: detailedVaults,
      total: vaults.length,
    };
  } catch (error) {
    throw new Error(`Failed to list vaults: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleListFiles(args: any, context: ToolContext): Promise<any> {
  const { vault, pattern, sortBy, limit, includeMetadata } = args;
  const { vaultManager } = context;

  try {
    const files = await vaultManager.listFiles(vault, pattern);
    
    let sortedFiles = files;
    switch (sortBy) {
      case 'name':
        sortedFiles = files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
        break;
      case 'size':
        sortedFiles = files.sort((a, b) => b.stats.size - a.stats.size);
        break;
      case 'created':
        sortedFiles = files.sort((a, b) => b.stats.created.getTime() - a.stats.created.getTime());
        break;
      case 'modified':
      default:
        sortedFiles = files.sort((a, b) => b.stats.modified.getTime() - a.stats.modified.getTime());
        break;
    }

    const limitedFiles = sortedFiles.slice(0, limit);
    const targetVault = vaultManager.getVault(vault);

    const result = limitedFiles.map(file => {
      const basic = {
        path: file.relativePath,
        size: file.stats.size,
        modified: file.stats.modified,
        created: file.stats.created,
      };

      if (includeMetadata) {
        const indexed = targetVault.indexer.getFile(file.relativePath);
        return {
          ...basic,
          metadata: indexed ? {
            title: indexed.frontmatter.title,
            tags: indexed.tags,
            links: indexed.links.length,
            hasEmbeddings: Boolean(indexed.embeddings?.length),
            lastIndexed: indexed.lastIndexed,
          } : null,
        };
      }

      return basic;
    });

    return {
      files: result,
      total: limitedFiles.length,
      totalMatched: sortedFiles.length,
      vault: targetVault.name,
      pattern,
      sortBy,
    };
  } catch (error) {
    throw new Error(`Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleValidateFile(args: any, context: ToolContext): Promise<any> {
  const { path, vault, rules } = args;
  const { vaultManager } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const content = await targetVault.filesystem.readFile(path);
    const result = await targetVault.validator.validate(content, path);

    let filteredResult = result;
    if (rules && rules.length > 0) {
      filteredResult = {
        ...result,
        errors: result.errors.filter(e => rules.includes(e.rule)),
        warnings: result.warnings.filter(w => rules.includes(w.rule)),
        suggestions: result.suggestions.filter(s => rules.includes(s.rule)),
      };
      filteredResult.isValid = filteredResult.errors.filter(e => e.severity === 'error').length === 0;
    }

    return {
      path,
      valid: filteredResult.isValid,
      errors: filteredResult.errors,
      warnings: filteredResult.warnings,
      suggestions: filteredResult.suggestions,
      vault: targetVault.name,
      rulesApplied: rules || 'all',
    };
  } catch (error) {
    throw new Error(`Failed to validate file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleSuggestTags(args: any, context: ToolContext): Promise<any> {
  const { content, vault, existingTags, limit } = args;
  const { vaultManager } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const suggestions = targetVault.tagEngine.getTagSuggestions(existingTags || [], content);

    return {
      suggestions: suggestions.slice(0, limit).map(s => ({
        tag: s.tag,
        score: s.score,
        reason: s.reason,
      })),
      existingTags: existingTags || [],
      vault: targetVault.name,
    };
  } catch (error) {
    throw new Error(`Failed to suggest tags: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleGetTemplates(args: any, context: ToolContext): Promise<any> {
  const { vault, pattern } = args;
  const { vaultManager } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const allTemplates = targetVault.templateEngine.getAllTemplates();
    
    let filteredTemplates = allTemplates;
    if (pattern) {
      const regex = new RegExp(pattern, 'i');
      filteredTemplates = allTemplates.filter(t => regex.test(t.pattern));
    }

    return {
      templates: filteredTemplates.map(template => ({
        pattern: template.pattern,
        requiredFields: template.frontmatter?.required || [],
        optionalFields: Object.keys(template.frontmatter?.schema || {}),
        hasContentTemplate: Boolean(template.content_template),
      })),
      total: filteredTemplates.length,
      vault: targetVault.name,
    };
  } catch (error) {
    throw new Error(`Failed to get templates: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handlePreviewTemplate(args: any, context: ToolContext): Promise<any> {
  const { path, vault, customValues } = args;
  const { vaultManager } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const templateInfo = targetVault.templateEngine.getTemplateInfo(path);

    if (!templateInfo.hasTemplate) {
      return {
        path,
        hasTemplate: false,
        message: 'No template matches this path',
        vault: targetVault.name,
      };
    }

    const preview = targetVault.templateEngine.createFromTemplate(
      templateInfo.template!.pattern,
      path,
      customValues || {}
    );

    return {
      path,
      hasTemplate: true,
      template: {
        pattern: templateInfo.template!.pattern,
        requiredFields: templateInfo.requiredFields,
        optionalFields: templateInfo.optionalFields,
      },
      preview,
      vault: targetVault.name,
    };
  } catch (error) {
    throw new Error(`Failed to preview template: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleGetRecentFiles(args: any, context: ToolContext): Promise<any> {
  const { vault, type, limit, since } = args;
  const { vaultManager } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const allFiles = targetVault.indexer.getAllFiles();
    
    let filteredFiles = allFiles;
    if (since) {
      const sinceDate = new Date(since);
      const dateField = type === 'created' ? 'created' : 'lastModified';
      filteredFiles = allFiles.filter(file => {
        const fileDate = type === 'created' 
          ? new Date(file.frontmatter.created || file.lastModified)
          : file.lastModified;
        return fileDate >= sinceDate;
      });
    }

    const sortedFiles = filteredFiles.sort((a, b) => {
      const dateA = type === 'created' 
        ? new Date(a.frontmatter.created || a.lastModified)
        : a.lastModified;
      const dateB = type === 'created'
        ? new Date(b.frontmatter.created || b.lastModified)
        : b.lastModified;
      return dateB.getTime() - dateA.getTime();
    });

    const recentFiles = sortedFiles.slice(0, limit).map(file => ({
      path: file.relativePath,
      title: file.frontmatter.title || file.relativePath,
      modified: file.lastModified,
      created: file.frontmatter.created || file.lastModified,
      tags: file.tags,
      size: file.size,
    }));

    return {
      files: recentFiles,
      type,
      total: recentFiles.length,
      vault: targetVault.name,
      since,
    };
  } catch (error) {
    throw new Error(`Failed to get recent files: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}