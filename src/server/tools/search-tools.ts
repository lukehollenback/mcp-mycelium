import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ToolContext } from './index.js';
import { SearchQuery, SearchFilters } from '../../core/search-engine.js';

export function createSearchTools(context: ToolContext): Tool[] {
  const { vaultManager, searchEngine } = context;

  return [
    {
      name: 'search_content',
      description: 'Search for content across knowledge base using semantic and text search with advanced filtering options',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (natural language or keywords)',
          },
          vault: {
            type: 'string',
            description: 'Vault name to search in (optional, searches all vaults if not specified)',
          },
          filters: {
            type: 'object',
            description: 'Advanced search filters',
            properties: {
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by tags',
              },
              tagMode: {
                type: 'string',
                enum: ['and', 'or'],
                description: 'Tag matching mode (and/or)',
                default: 'and',
              },
              paths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by file path patterns (regex supported)',
              },
              dateRange: {
                type: 'object',
                properties: {
                  start: { type: 'string', format: 'date' },
                  end: { type: 'string', format: 'date' },
                },
                description: 'Filter by modification date range',
              },
            },
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return',
            default: 20,
          },
          threshold: {
            type: 'number',
            description: 'Minimum similarity threshold (0-1)',
            default: 0.7,
          },
        },
        required: ['query'],
      },
    },

    {
      name: 'semantic_search',
      description: 'Perform semantic search using embeddings to find conceptually similar content',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query for semantic similarity',
          },
          vault: {
            type: 'string',
            description: 'Vault name to search in (optional)',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results',
            default: 10,
          },
        },
        required: ['query'],
      },
    },

    {
      name: 'text_search',
      description: 'Perform exact text search with keyword matching',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Text query for exact matching',
          },
          vault: {
            type: 'string',
            description: 'Vault name to search in (optional)',
          },
          caseSensitive: {
            type: 'boolean',
            description: 'Case sensitive search',
            default: false,
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results',
            default: 20,
          },
        },
        required: ['query'],
      },
    },
  ];
}

export async function handleSearchContent(args: any, context: ToolContext): Promise<any> {
  const { query, vault, filters, limit, threshold } = args;
  const { vaultManager, searchEngine } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const files = targetVault.indexer.getAllFiles();

    const searchQuery: SearchQuery = {
      text: query,
      filters: filters as SearchFilters,
      limit,
      threshold,
    };

    const results = await searchEngine.search(searchQuery, files);

    return {
      results: results.map(result => ({
        file: {
          path: result.file.relativePath,
          title: result.file.frontmatter.title || result.file.relativePath,
          lastModified: result.file.lastModified,
          tags: result.file.tags,
          size: result.file.size,
        },
        score: result.score,
        relevance: result.relevance,
        matches: result.matches.map(match => ({
          type: match.type,
          text: match.text,
          context: match.context?.substring(0, 200),
        })),
      })),
      query,
      totalResults: results.length,
      vault: targetVault.name,
    };
  } catch (error) {
    throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleSemanticSearch(args: any, context: ToolContext): Promise<any> {
  const { query, vault, limit } = args;
  const { vaultManager, searchEngine } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const files = targetVault.indexer.getAllFiles();

    const results = await searchEngine.semanticSearch(query, files, limit);

    return {
      results: results.map(result => ({
        file: {
          path: result.file.relativePath,
          title: result.file.frontmatter.title || result.file.relativePath,
          lastModified: result.file.lastModified,
          tags: result.file.tags,
        },
        score: result.score,
        semanticSimilarity: result.relevance.semantic,
      })),
      query,
      totalResults: results.length,
      vault: targetVault.name,
    };
  } catch (error) {
    throw new Error(`Semantic search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleTextSearch(args: any, context: ToolContext): Promise<any> {
  const { query, vault, caseSensitive, limit } = args;
  const { vaultManager, searchEngine } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const files = targetVault.indexer.getAllFiles();

    const results = searchEngine.textSearch(query, files);

    return {
      results: results.slice(0, limit).map(result => ({
        file: {
          path: result.file.relativePath,
          title: result.file.frontmatter.title || result.file.relativePath,
          lastModified: result.file.lastModified,
          tags: result.file.tags,
        },
        score: result.score,
        matches: result.matches.map(match => ({
          type: match.type,
          text: match.text,
          context: match.context?.substring(0, 200),
          position: match.position,
        })),
      })),
      query,
      totalResults: Math.min(results.length, limit),
      vault: targetVault.name,
    };
  } catch (error) {
    throw new Error(`Text search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}