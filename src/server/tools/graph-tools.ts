import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ToolContext } from './index.js';

export function createGraphTools(context: ToolContext): Tool[] {
  return [
    {
      name: 'get_tags',
      description: 'Get all tags with usage statistics and hierarchy information',
      inputSchema: {
        type: 'object',
        properties: {
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          sortBy: {
            type: 'string',
            enum: ['usage', 'name', 'recent'],
            description: 'Sort tags by usage count, name, or recent activity',
            default: 'usage',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of tags to return',
            default: 100,
          },
        },
      },
    },

    {
      name: 'get_files_by_tag',
      description: 'Find files that have specific tags',
      inputSchema: {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of tags to search for',
          },
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          mode: {
            type: 'string',
            enum: ['and', 'or'],
            description: 'Tag matching mode - all tags (and) or any tags (or)',
            default: 'and',
          },
        },
        required: ['tags'],
      },
    },

    {
      name: 'get_backlinks',
      description: 'Get incoming and outgoing links for a file',
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
          includeContent: {
            type: 'boolean',
            description: 'Include content preview of linked files',
            default: false,
          },
        },
        required: ['path'],
      },
    },

    {
      name: 'find_related',
      description: 'Find files related to a given file through graph traversal',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to vault root',
          },
          hops: {
            type: 'number',
            description: 'Maximum number of hops in the graph (1-5)',
            default: 2,
            minimum: 1,
            maximum: 5,
          },
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          includeScore: {
            type: 'boolean',
            description: 'Include relatedness scores',
            default: true,
          },
        },
        required: ['path'],
      },
    },

    {
      name: 'get_graph_stats',
      description: 'Get comprehensive graph statistics and metrics',
      inputSchema: {
        type: 'object',
        properties: {
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          includeMetrics: {
            type: 'boolean',
            description: 'Include detailed centrality and clustering metrics',
            default: false,
          },
        },
      },
    },

    {
      name: 'find_shortest_path',
      description: 'Find the shortest path between two files in the link graph',
      inputSchema: {
        type: 'object',
        properties: {
          fromPath: {
            type: 'string',
            description: 'Source file path',
          },
          toPath: {
            type: 'string',
            description: 'Target file path',
          },
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          maxDepth: {
            type: 'number',
            description: 'Maximum search depth',
            default: 6,
          },
        },
        required: ['fromPath', 'toPath'],
      },
    },

    {
      name: 'get_broken_links',
      description: 'Find all broken links in the knowledge base with suggestions',
      inputSchema: {
        type: 'object',
        properties: {
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          includeSuggestions: {
            type: 'boolean',
            description: 'Include suggested fixes for broken links',
            default: true,
          },
        },
      },
    },

    {
      name: 'analyze_communities',
      description: 'Detect communities/clusters in the knowledge graph',
      inputSchema: {
        type: 'object',
        properties: {
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          resolution: {
            type: 'number',
            description: 'Community detection resolution parameter',
            default: 1.0,
          },
        },
      },
    },

    {
      name: 'get_influential_files',
      description: 'Get most influential files based on graph centrality metrics',
      inputSchema: {
        type: 'object',
        properties: {
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          metric: {
            type: 'string',
            enum: ['pagerank', 'betweenness', 'degree'],
            description: 'Centrality metric to use',
            default: 'pagerank',
          },
          limit: {
            type: 'number',
            description: 'Number of top files to return',
            default: 10,
          },
        },
      },
    },
  ];
}

export async function handleGetTags(args: any, context: ToolContext): Promise<any> {
  const { vault, sortBy, limit } = args;
  const { vaultManager } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const allTags = targetVault.tagEngine.getAllTags();

    let sortedTags = allTags;
    switch (sortBy) {
      case 'name':
        sortedTags = allTags.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'recent':
        sortedTags = allTags.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
        break;
      case 'usage':
      default:
        sortedTags = allTags.sort((a, b) => b.fileCount - a.fileCount);
        break;
    }

    return {
      tags: sortedTags.slice(0, limit),
      totalTags: allTags.length,
      vault: targetVault.name,
    };
  } catch (error) {
    throw new Error(`Failed to get tags: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleGetFilesByTag(args: any, context: ToolContext): Promise<any> {
  const { tags, vault, mode } = args;
  const { vaultManager } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const files = targetVault.indexer.getFilesByTag(tags);

    return {
      files: files.map(file => ({
        path: file.relativePath,
        title: file.frontmatter.title || file.relativePath,
        tags: file.tags,
        lastModified: file.lastModified,
        size: file.size,
      })),
      searchTags: tags,
      mode,
      totalFiles: files.length,
      vault: targetVault.name,
    };
  } catch (error) {
    throw new Error(`Failed to get files by tag: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleGetBacklinks(args: any, context: ToolContext): Promise<any> {
  const { path, vault, includeContent } = args;
  const { vaultManager } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const backlinks = targetVault.backlinkEngine.getBacklinks(path);

    const response: any = {
      path,
      outgoing: backlinks.outgoing.map(link => ({
        target: link.target,
        text: link.text,
        type: link.type,
        line: link.line,
      })),
      incoming: backlinks.incoming.map(link => ({
        source: link.target, // Note: in incoming links, 'target' field contains the source
        text: link.text,
        type: link.type,
        line: link.line,
      })),
      vault: targetVault.name,
    };

    if (includeContent) {
      const allPaths = new Set([
        ...backlinks.outgoing.map(l => l.target),
        ...backlinks.incoming.map(l => l.target),
      ]);

      response.linkedFiles = {};
      for (const linkedPath of allPaths) {
        try {
          const fileData = await vaultManager.readFile(linkedPath, vault);
          response.linkedFiles[linkedPath] = {
            title: fileData.parsed.frontmatter.title || linkedPath,
            excerpt: fileData.parsed.content.substring(0, 200),
            tags: fileData.tags,
          };
        } catch {
          // File might not exist
          response.linkedFiles[linkedPath] = {
            title: linkedPath,
            excerpt: 'File not found',
            tags: [],
          };
        }
      }
    }

    return response;
  } catch (error) {
    throw new Error(`Failed to get backlinks: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleFindRelated(args: any, context: ToolContext): Promise<any> {
  const { path, hops, vault, includeScore } = args;
  const { vaultManager } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const related = targetVault.backlinkEngine.findRelatedFiles(path, hops);

    const relatedFiles = Array.from(related.entries()).map(([filePath, distance]) => {
      const file = targetVault.indexer.getFile(filePath);
      return {
        path: filePath,
        title: file?.frontmatter.title || filePath,
        distance,
        score: includeScore ? Math.max(0, 1 - distance / hops) : undefined,
        tags: file?.tags || [],
        lastModified: file?.lastModified,
      };
    });

    return {
      path,
      related: relatedFiles.sort((a, b) => a.distance - b.distance),
      maxHops: hops,
      vault: targetVault.name,
    };
  } catch (error) {
    throw new Error(`Failed to find related files: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleGetGraphStats(args: any, context: ToolContext): Promise<any> {
  const { vault, includeMetrics } = args;
  const { vaultManager, graphAnalyzer } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const indexStats = targetVault.indexer.getStats();
    const linkStats = targetVault.backlinkEngine.getStats();
    
    const response: any = {
      vault: targetVault.name,
      files: {
        total: indexStats.totalFiles,
        indexed: indexStats.indexedFiles,
        totalSize: indexStats.totalSize,
        lastIndexed: indexStats.lastIndexTime,
      },
      links: {
        total: linkStats.totalLinks,
        broken: linkStats.brokenLinks,
        orphaned: linkStats.orphanedFiles,
      },
      tags: {
        total: targetVault.tagEngine.getTagCount(),
      },
      embeddings: {
        total: indexStats.totalEmbeddings,
      },
    };

    if (includeMetrics) {
      const files = targetVault.indexer.getAllFiles();
      const metrics = graphAnalyzer.analyzeGraph(files);
      
      response.metrics = {
        clustering: metrics.clustering,
        centrality: {
          topPageRank: Array.from(metrics.centrality.pagerank.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([file, score]) => ({ file, score })),
          topBetweenness: Array.from(metrics.centrality.betweenness.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([file, score]) => ({ file, score })),
        },
        connectivity: {
          components: metrics.connectivity.components.length,
          bridges: metrics.connectivity.bridges.length,
          articulationPoints: metrics.connectivity.articulation.length,
        },
        paths: {
          diameter: metrics.paths.diameter,
          averagePathLength: metrics.paths.averagePathLength,
        },
      };
    }

    return response;
  } catch (error) {
    throw new Error(`Failed to get graph stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleFindShortestPath(args: any, context: ToolContext): Promise<any> {
  const { fromPath, toPath, vault, maxDepth } = args;
  const { vaultManager } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const path = targetVault.backlinkEngine.getShortestPath(fromPath, toPath, maxDepth);

    if (!path) {
      return {
        fromPath,
        toPath,
        found: false,
        message: `No path found within ${maxDepth} hops`,
        vault: targetVault.name,
      };
    }

    return {
      fromPath,
      toPath,
      found: true,
      path,
      length: path.length - 1,
      vault: targetVault.name,
    };
  } catch (error) {
    throw new Error(`Failed to find shortest path: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleGetBrokenLinks(args: any, context: ToolContext): Promise<any> {
  const { vault, includeSuggestions } = args;
  const { vaultManager } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const brokenLinks = targetVault.backlinkEngine.getBrokenLinks();

    return {
      brokenLinks: brokenLinks.map(link => ({
        source: link.source,
        target: link.target,
        text: link.text,
        line: link.line,
        type: link.type,
        suggestions: includeSuggestions ? link.suggestions : undefined,
      })),
      total: brokenLinks.length,
      vault: targetVault.name,
    };
  } catch (error) {
    throw new Error(`Failed to get broken links: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleAnalyzeCommunities(args: any, context: ToolContext): Promise<any> {
  const { vault, resolution } = args;
  const { vaultManager, graphAnalyzer } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const files = targetVault.indexer.getAllFiles();
    const communities = graphAnalyzer.findCommunities(files, resolution);

    return {
      communities: communities.clusters,
      modularity: communities.modularity,
      totalCommunities: communities.clusters.length,
      vault: targetVault.name,
    };
  } catch (error) {
    throw new Error(`Failed to analyze communities: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleGetInfluentialFiles(args: any, context: ToolContext): Promise<any> {
  const { vault, metric, limit } = args;
  const { vaultManager, graphAnalyzer } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const files = targetVault.indexer.getAllFiles();
    const influential = graphAnalyzer.getInfluentialFiles(files, metric, limit);

    return {
      influential: influential.map(item => {
        const file = targetVault.indexer.getFile(item.file);
        return {
          path: item.file,
          title: file?.frontmatter.title || item.file,
          score: item.score,
          tags: file?.tags || [],
          lastModified: file?.lastModified,
        };
      }),
      metric,
      vault: targetVault.name,
    };
  } catch (error) {
    throw new Error(`Failed to get influential files: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}