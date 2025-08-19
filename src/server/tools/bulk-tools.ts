import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ToolContext } from './index.js';
import { SearchQuery } from '../../core/search-engine.js';

export function createBulkTools(context: ToolContext): Tool[] {
  return [
    {
      name: 'bulk_search',
      description: 'Perform multiple searches efficiently in a single operation',
      inputSchema: {
        type: 'object',
        properties: {
          queries: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of search queries to execute',
          },
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          limit: {
            type: 'number',
            description: 'Results limit per query',
            default: 10,
          },
          combineResults: {
            type: 'boolean',
            description: 'Combine all results into single ranked list',
            default: false,
          },
        },
        required: ['queries'],
      },
    },

    {
      name: 'bulk_validate',
      description: 'Validate multiple files against configured rules',
      inputSchema: {
        type: 'object',
        properties: {
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          pattern: {
            type: 'string',
            description: 'File pattern to validate (regex supported)',
          },
          rules: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific validation rules to apply',
          },
          onlyErrors: {
            type: 'boolean',
            description: 'Only return files with validation errors',
            default: false,
          },
        },
      },
    },

    {
      name: 'reindex_vault',
      description: 'Force complete re-indexing of a vault',
      inputSchema: {
        type: 'object',
        properties: {
          vault: {
            type: 'string',
            description: 'Vault name (optional, reindexes default vault if not specified)',
          },
          includeEmbeddings: {
            type: 'boolean',
            description: 'Rebuild embeddings during reindex',
            default: true,
          },
        },
      },
    },

    {
      name: 'bulk_tag_operation',
      description: 'Apply tag operations to multiple files matching criteria',
      inputSchema: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['add', 'remove', 'replace'],
            description: 'Tag operation to perform',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to add, remove, or use as replacement',
          },
          targetTags: {
            type: 'array',
            items: { type: 'string' },
            description: 'For remove operation: specific tags to remove. For replace: tags to replace',
          },
          filters: {
            type: 'object',
            description: 'Criteria for selecting files',
            properties: {
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Files must have these tags',
              },
              pattern: {
                type: 'string',
                description: 'Path pattern to match',
              },
              dateRange: {
                type: 'object',
                properties: {
                  start: { type: 'string', format: 'date' },
                  end: { type: 'string', format: 'date' },
                },
              },
            },
          },
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          dryRun: {
            type: 'boolean',
            description: 'Preview changes without applying them',
            default: false,
          },
        },
        required: ['operation', 'tags'],
      },
    },

    {
      name: 'export_graph',
      description: 'Export knowledge graph in various formats for external analysis',
      inputSchema: {
        type: 'object',
        properties: {
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          format: {
            type: 'string',
            enum: ['json', 'gexf', 'dot'],
            description: 'Export format',
            default: 'json',
          },
          includeTagNodes: {
            type: 'boolean',
            description: 'Include tag nodes in the graph',
            default: true,
          },
          minConnections: {
            type: 'number',
            description: 'Minimum connections for a node to be included',
            default: 0,
          },
        },
      },
    },

    {
      name: 'analyze_vault_health',
      description: 'Comprehensive analysis of vault health and recommendations',
      inputSchema: {
        type: 'object',
        properties: {
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          includeRecommendations: {
            type: 'boolean',
            description: 'Include actionable recommendations',
            default: true,
          },
        },
      },
    },
  ];
}

export async function handleBulkSearch(args: any, context: ToolContext): Promise<any> {
  const { queries, vault, limit, combineResults } = args;
  const { vaultManager, searchEngine } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const files = targetVault.indexer.getAllFiles();
    
    const results: any = {};
    const allResults: any[] = [];

    for (const query of queries) {
      const searchQuery: SearchQuery = {
        text: query,
        limit,
      };

      const queryResults = await searchEngine.search(searchQuery, files);
      
      const formattedResults = queryResults.map(result => ({
        file: {
          path: result.file.relativePath,
          title: result.file.frontmatter.title || result.file.relativePath,
          tags: result.file.tags,
        },
        score: result.score,
        query,
      }));

      results[query] = formattedResults;
      
      if (combineResults) {
        allResults.push(...formattedResults);
      }
    }

    const response: any = {
      queries,
      vault: targetVault.name,
    };

    if (combineResults) {
      const combined = allResults
        .sort((a, b) => b.score - a.score)
        .slice(0, limit * queries.length);
      
      response.combinedResults = combined;
      response.totalCombined = combined.length;
    } else {
      response.results = results;
    }

    return response;
  } catch (error) {
    throw new Error(`Bulk search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleBulkValidate(args: any, context: ToolContext): Promise<any> {
  const { vault, pattern, rules, onlyErrors } = args;
  const { vaultManager } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const allFiles = await targetVault.filesystem.listMarkdownFiles();
    
    let filesToValidate = allFiles;
    if (pattern) {
      const regex = new RegExp(pattern, 'i');
      filesToValidate = allFiles.filter(file => regex.test(file.relativePath));
    }

    const filesToValidateArray = filesToValidate.map(file => ({
      content: '',
      filePath: file.relativePath,
    }));

    for (const file of filesToValidateArray) {
      try {
        file.content = await targetVault.filesystem.readFile(file.filePath);
      } catch {
        file.content = '';
      }
    }

    const validationResults = await targetVault.validator.validateBatch(filesToValidateArray);
    
    const results: any[] = [];
    for (const [filePath, result] of validationResults) {
      if (onlyErrors && result.isValid) {
        continue;
      }

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

      results.push({
        path: filePath,
        valid: filteredResult.isValid,
        errors: filteredResult.errors,
        warnings: filteredResult.warnings,
        suggestions: filteredResult.suggestions,
      });
    }

    return {
      results,
      totalFiles: filesToValidate.length,
      validatedFiles: results.length,
      vault: targetVault.name,
      pattern,
      rules,
    };
  } catch (error) {
    throw new Error(`Bulk validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleReindexVault(args: any, context: ToolContext): Promise<any> {
  const { vault, includeEmbeddings } = args;
  const { vaultManager } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const startTime = Date.now();
    
    await targetVault.indexer.reindexAll();
    
    const endTime = Date.now();
    const stats = targetVault.indexer.getStats();

    return {
      success: true,
      vault: targetVault.name,
      duration: endTime - startTime,
      stats: {
        filesIndexed: stats.totalFiles,
        totalSize: stats.totalSize,
        embeddings: stats.totalEmbeddings,
        lastIndexed: stats.lastIndexTime,
      },
      includeEmbeddings,
    };
  } catch (error) {
    throw new Error(`Reindex failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleBulkTagOperation(args: any, context: ToolContext): Promise<any> {
  const { operation, tags, targetTags, filters, vault, dryRun } = args;
  const { vaultManager } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    let files = targetVault.indexer.getAllFiles();

    if (filters) {
      if (filters.tags) {
        const filesWithTags = targetVault.indexer.getFilesByTag(filters.tags);
        const taggedPaths = new Set(filesWithTags.map(f => f.relativePath));
        files = files.filter(f => taggedPaths.has(f.relativePath));
      }

      if (filters.pattern) {
        const regex = new RegExp(filters.pattern, 'i');
        files = files.filter(f => regex.test(f.relativePath));
      }

      if (filters.dateRange) {
        const { start, end } = filters.dateRange;
        files = files.filter(f => {
          if (start && f.lastModified < new Date(start)) return false;
          if (end && f.lastModified > new Date(end)) return false;
          return true;
        });
      }
    }

    const changes: any[] = [];

    for (const file of files) {
      let newTags = [...file.tags];
      let changed = false;

      switch (operation) {
        case 'add':
          for (const tag of tags) {
            if (!newTags.includes(tag)) {
              newTags.push(tag);
              changed = true;
            }
          }
          break;

        case 'remove':
          const tagsToRemove = targetTags || tags;
          newTags = newTags.filter(tag => !tagsToRemove.includes(tag));
          changed = newTags.length !== file.tags.length;
          break;

        case 'replace':
          const oldTags = targetTags || [];
          newTags = newTags.filter(tag => !oldTags.includes(tag));
          newTags.push(...tags);
          changed = true;
          break;
      }

      if (changed) {
        changes.push({
          path: file.relativePath,
          oldTags: file.tags,
          newTags,
          operation,
        });

        if (!dryRun) {
          const content = await targetVault.filesystem.readFile(file.relativePath);
          const parsed = targetVault.parser.parse(content);
          
          const updatedFrontmatter = {
            ...parsed.frontmatter,
            tags: newTags,
            modified: new Date().toISOString(),
          };

          const updatedContent = targetVault.parser.generateMarkdown(
            updatedFrontmatter,
            parsed.content
          );

          await targetVault.filesystem.writeFile(file.relativePath, updatedContent);
        }
      }
    }

    return {
      operation,
      tags,
      targetTags,
      changes,
      totalFiles: files.length,
      modifiedFiles: changes.length,
      dryRun,
      vault: targetVault.name,
    };
  } catch (error) {
    throw new Error(`Bulk tag operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleExportGraph(args: any, context: ToolContext): Promise<any> {
  const { vault, format, includeTagNodes, minConnections } = args;
  const { vaultManager, graphAnalyzer } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const files = targetVault.indexer.getAllFiles();
    
    let filteredFiles = files;
    if (minConnections > 0) {
      filteredFiles = files.filter(file => file.links.length >= minConnections);
    }

    const graphData = graphAnalyzer.exportGraph(filteredFiles, format);

    return {
      vault: targetVault.name,
      format,
      includeTagNodes,
      minConnections,
      nodeCount: filteredFiles.length,
      data: graphData,
    };
  } catch (error) {
    throw new Error(`Graph export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleAnalyzeVaultHealth(args: any, context: ToolContext): Promise<any> {
  const { vault, includeRecommendations } = args;
  const { vaultManager, graphAnalyzer } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const indexStats = targetVault.indexer.getStats();
    const linkStats = targetVault.backlinkEngine.getStats();
    const brokenLinks = targetVault.backlinkEngine.getBrokenLinks();
    const orphanedFiles = targetVault.backlinkEngine.getOrphanedFiles();

    const files = targetVault.indexer.getAllFiles();
    const tagStats = targetVault.tagEngine.getAllTags();
    const untaggedFiles = files.filter(f => f.tags.length === 0).length;

    const health = {
      vault: targetVault.name,
      overall: 'good' as 'excellent' | 'good' | 'fair' | 'poor',
      scores: {
        connectivity: 0 as number,
        organization: 0 as number,
        completeness: 0 as number,
        consistency: 0 as number,
      },
      stats: {
        files: {
          total: indexStats.totalFiles,
          indexed: indexStats.indexedFiles,
          orphaned: orphanedFiles.length,
          withoutTags: untaggedFiles,
        },
        links: {
          total: linkStats.totalLinks,
          broken: linkStats.brokenLinks,
          brokenPercentage: linkStats.totalLinks > 0 ? (linkStats.brokenLinks / linkStats.totalLinks) * 100 : 0,
        },
        tags: {
          total: tagStats.length,
          averagePerFile: indexStats.totalFiles > 0 ? tagStats.reduce((sum, t) => sum + t.fileCount, 0) / indexStats.totalFiles : 0,
          unused: tagStats.filter(t => t.fileCount === 0).length,
        },
        indexing: {
          lastIndexed: indexStats.lastIndexTime,
          totalEmbeddings: indexStats.totalEmbeddings,
          embeddingCoverage: indexStats.totalFiles > 0 ? (indexStats.totalEmbeddings / indexStats.totalFiles) * 100 : 0,
        },
      },
      issues: [] as Array<{
        type: string;
        severity: string;
        count: number;
        message: string;
      }>,
      recommendations: [] as Array<{
        type: string;
        priority: string;
        action: string;
        description?: string;
        impact?: string;
      }>,
    };

    // Calculate scores
    health.scores.connectivity = Math.max(0, 100 - (linkStats.brokenLinks / Math.max(1, linkStats.totalLinks)) * 100);
    health.scores.organization = Math.max(0, 100 - (orphanedFiles.length / Math.max(1, indexStats.totalFiles)) * 100);
    health.scores.completeness = Math.min(100, (indexStats.totalEmbeddings / Math.max(1, indexStats.totalFiles)) * 100);
    health.scores.consistency = Math.max(0, 100 - (tagStats.filter(t => t.fileCount === 0).length / Math.max(1, tagStats.length)) * 100);

    const averageScore = Object.values(health.scores).reduce((sum: number, score: number) => sum + score, 0) / 4;
    
    if (averageScore >= 80) health.overall = 'excellent';
    else if (averageScore >= 60) health.overall = 'good';
    else if (averageScore >= 40) health.overall = 'fair';
    else health.overall = 'poor';

    // Identify issues
    if (linkStats.brokenLinks > 0) {
      health.issues.push({
        type: 'broken_links',
        severity: linkStats.brokenLinks > linkStats.totalLinks * 0.1 ? 'high' : 'medium',
        count: linkStats.brokenLinks,
        message: `${linkStats.brokenLinks} broken links found`,
      });
    }

    if (orphanedFiles.length > 0) {
      health.issues.push({
        type: 'orphaned_files',
        severity: orphanedFiles.length > indexStats.totalFiles * 0.2 ? 'high' : 'low',
        count: orphanedFiles.length,
        message: `${orphanedFiles.length} files with no incoming links`,
      });
    }

    const untaggedFiles = files.filter(f => f.tags.length === 0).length;
    if (untaggedFiles > 0) {
      health.issues.push({
        type: 'untagged_files',
        severity: untaggedFiles > indexStats.totalFiles * 0.3 ? 'medium' : 'low',
        count: untaggedFiles,
        message: `${untaggedFiles} files without tags`,
      });
    }

    if (includeRecommendations) {
      health.recommendations = [];

      if (linkStats.brokenLinks > 0) {
        health.recommendations.push({
          type: 'fix_broken_links',
          priority: 'high',
          action: 'Use get_broken_links tool to identify and fix broken links',
          impact: 'Improves navigation and graph connectivity',
        });
      }

      if (orphanedFiles.length > 5) {
        health.recommendations.push({
          type: 'connect_orphaned_files',
          priority: 'medium',
          action: 'Add links to orphaned files or consider if they should be archived',
          impact: 'Improves content discoverability',
        });
      }

      if (untaggedFiles > indexStats.totalFiles * 0.2) {
        health.recommendations.push({
          type: 'add_tags',
          priority: 'medium',
          action: 'Use suggest_tags tool to add relevant tags to untagged files',
          impact: 'Improves content organization and findability',
        });
      }

      if (indexStats.totalEmbeddings < indexStats.totalFiles * 0.8) {
        health.recommendations.push({
          type: 'build_embeddings',
          priority: 'low',
          action: 'Ensure embedding provider is configured to improve semantic search',
          impact: 'Enables better content discovery through semantic search',
        });
      }
    }

    return health;
  } catch (error) {
    throw new Error(`Vault health analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}