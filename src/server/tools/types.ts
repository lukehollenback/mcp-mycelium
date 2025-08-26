// Central type definitions for all MCP tool handlers

export interface SearchContentArgs {
  query: string;
  vault?: string;
  limit?: number;
  includeContent?: boolean;
}

export interface SemanticSearchArgs {
  query: string;
  vault?: string;
  limit?: number;
  threshold?: number;
}

export interface TextSearchArgs {
  query: string;
  vault?: string;
  limit?: number;
  caseSensitive?: boolean;
}

export interface ReadFileArgs {
  path: string;
  vault?: string;
}

export interface WriteFileArgs {
  path: string;
  content: string;
  vault?: string;
}

export interface UpdateFileArgs {
  path: string;
  content: string;
  vault?: string;
}

export interface CreateFileArgs {
  path: string;
  content?: string;
  vault?: string;
  applyTemplate?: boolean;
}

export interface DeleteFileArgs {
  path: string;
  vault?: string;
  force?: boolean;
}

export interface GetFileMetadataArgs {
  path: string;
  vault?: string;
}

export interface GetTagsArgs {
  vault?: string;
  sortBy?: 'name' | 'count';
  limit?: number;
}

export interface GetFilesByTagArgs {
  tags: string[];
  vault?: string;
  operator?: 'and' | 'or';
}

export interface GetBacklinksArgs {
  path: string;
  vault?: string;
}

export interface FindRelatedArgs {
  path: string;
  hops?: number;
  vault?: string;
}

export interface GetGraphStatsArgs {
  vault?: string;
}

export interface FindShortestPathArgs {
  from: string;
  to: string;
  vault?: string;
}

export interface GetBrokenLinksArgs {
  vault?: string;
}

export interface AnalyzeCommunitiesArgs {
  vault?: string;
  algorithm?: 'modularity' | 'louvain';
}

export interface GetInfluentialFilesArgs {
  vault?: string;
  metric?: 'pagerank' | 'degree' | 'betweenness';
  limit?: number;
}

export interface ListVaultsArgs {
  // No required arguments
}

export interface ListFilesArgs {
  vault?: string;
  pattern?: string;
  limit?: number;
}

export interface ValidateFileArgs {
  path: string;
  vault?: string;
  rules?: string[];
}

export interface SuggestTagsArgs {
  content: string;
  vault?: string;
  limit?: number;
}

export interface GetTemplatesArgs {
  vault?: string;
}

export interface PreviewTemplateArgs {
  templateName: string;
  values?: Record<string, unknown>;
  vault?: string;
}

export interface GetRecentFilesArgs {
  vault?: string;
  limit?: number;
  days?: number;
}

export interface BulkSearchArgs {
  queries: string[];
  vault?: string;
  limit?: number;
  combineResults?: boolean;
}

export interface BulkValidateArgs {
  vault?: string;
  pattern?: string;
  rules?: string[];
  onlyErrors?: boolean;
}

export interface ReindexVaultArgs {
  vault?: string;
  includeEmbeddings?: boolean;
}

export interface BulkTagOperationArgs {
  operation: 'add' | 'remove' | 'replace';
  tags: string[];
  targetTags?: string[];
  filters?: {
    tags?: string[];
    pattern?: string;
    dateRange?: {
      start?: string;
      end?: string;
    };
  };
  vault?: string;
  dryRun?: boolean;
}

export interface ExportGraphArgs {
  vault?: string;
  format?: 'json' | 'gexf' | 'dot';
  includeTagNodes?: boolean;
  minConnections?: number;
}

export interface AnalyzeVaultHealthArgs {
  vault?: string;
  includeRecommendations?: boolean;
}

// Response types

export interface SearchResult {
  file: {
    path: string;
    title?: string;
    tags: string[];
  };
  score: number;
  query?: string;
}

export interface FileMetadata {
  path: string;
  title?: string;
  tags: string[];
  created?: string;
  modified?: string;
  size: number;
  links: Array<{
    target: string;
    text?: string;
  }>;
}

export interface TagInfo {
  name: string;
  fileCount: number;
  coOccurringTags: Record<string, number>;
  created?: Date;
  lastSeen?: Date;
}

export interface BacklinkInfo {
  outgoing: Array<{
    target: string;
    text?: string;
    line?: number;
  }>;
  incoming: Array<{
    source: string;
    text?: string;
    line?: number;
  }>;
}

export interface GraphStats {
  totalFiles: number;
  totalLinks: number;
  brokenLinks: number;
  orphanedFiles: number;
  averageConnections: number;
  clustersDetected: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    rule: string;
    message: string;
    line?: number;
    severity: 'error' | 'warning' | 'info';
  }>;
  warnings: Array<{
    rule: string;
    message: string;
    line?: number;
    severity: 'error' | 'warning' | 'info';
  }>;
  suggestions: Array<{
    rule: string;
    message: string;
    line?: number;
    severity: 'error' | 'warning' | 'info';
  }>;
}

export interface VaultHealth {
  vault: string;
  overall: 'excellent' | 'good' | 'fair' | 'poor';
  scores: {
    connectivity: number;
    organization: number;
    completeness: number;
    consistency: number;
  };
  stats: {
    files: {
      total: number;
      indexed: number;
      orphaned: number;
      withoutTags: number;
    };
    links: {
      total: number;
      broken: number;
      brokenPercentage: number;
    };
    tags: {
      total: number;
      averagePerFile: number;
      unused: number;
    };
    indexing: {
      lastIndexed?: Date;
      totalEmbeddings: number;
      embeddingCoverage: number;
    };
  };
  issues: Array<{
    type: string;
    severity: string;
    count: number;
    message: string;
  }>;
  recommendations: Array<{
    type: string;
    priority: string;
    action: string;
    description?: string;
    impact?: string;
  }>;
}