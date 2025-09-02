import { IndexedFile } from './indexer.js';
import { TagEngine } from '../graph/tag-engine.js';
import { BacklinkEngine } from '../graph/backlink-engine.js';
import { EmbeddingProvider } from '../embeddings/embedding-provider.js';
import { RankingWeights } from '../utils/config.js';
import pino from 'pino';

export interface SearchFilters {
  tags?: string[];
  tagMode?: 'and' | 'or';
  paths?: string[];
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  fileTypes?: string[];
}

export interface SearchResult {
  file: IndexedFile;
  score: number;
  relevance: {
    semantic: number;
    tags: number;
    recency: number;
    backlinks: number;
    pathRelevance: number;
  };
  matches: Array<{
    type: 'content' | 'title' | 'tag' | 'frontmatter';
    text: string;
    context?: string;
    position?: number;
  }>;
}

export interface SearchQuery {
  text: string;
  filters?: SearchFilters;
  limit?: number;
  threshold?: number;
}

export class SearchEngineError extends Error {
  constructor(
    message: string,
    public readonly query: string,
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'SearchEngineError';
  }
}

export class SearchEngine {
  private logger = pino({ name: 'SearchEngine' });
  private pageRankCache?: Map<string, number>;
  private pageRankCacheTime = 0;
  private pageRankCacheTTL = 300000; // 5 minutes

  constructor(
    private _embeddingProvider: EmbeddingProvider | undefined,
    private _tagEngine: TagEngine,
    private _backlinkEngine: BacklinkEngine,
    private _rankingWeights: RankingWeights,
    private _maxResults: number = 100,
    private _similarityThreshold: number = 0.7
  ) {}

  async search(query: SearchQuery, files: IndexedFile[]): Promise<SearchResult[]> {
    try {
      this.logger.debug({ query: query.text, filters: query.filters }, 'Starting search');

      let candidates = this.applyFilters(files, query.filters);
      
      if (candidates.length === 0) {
        return [];
      }

      const textQuery = query.text.trim();
      if (!textQuery) {
        return this.scoreAndRankFiles(candidates, '', query);
      }

      const results = await this.performHybridSearch(candidates, textQuery, query);
      
      this.logger.debug({ 
        query: textQuery, 
        candidateCount: candidates.length,
        resultCount: results.length 
      }, 'Search completed');

      return results;

    } catch (error) {
      this.logger.error({ query: query.text, error }, 'Search failed');
      throw new SearchEngineError(
        `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        query.text,
        'search',
        error instanceof Error ? error : undefined
      );
    }
  }

  async semanticSearch(query: string, files: IndexedFile[], limit?: number): Promise<SearchResult[]> {
    if (!this._embeddingProvider) {
      throw new SearchEngineError('No embedding provider available', query, 'semanticSearch');
    }

    try {
      const queryEmbedding = await this._embeddingProvider.embed(query);
      const results: SearchResult[] = [];

      for (const file of files) {
        if (!file.embeddings || file.embeddings.length === 0) {
          continue;
        }

        let bestScore = 0;
        for (const embedding of file.embeddings) {
          const similarity = this._embeddingProvider.calculateCosineSimilarity(
            queryEmbedding.embedding,
            embedding
          );
          bestScore = Math.max(bestScore, similarity);
        }

        if (bestScore >= this._similarityThreshold) {
          results.push({
            file,
            score: bestScore,
            relevance: {
              semantic: bestScore,
              tags: 0,
              recency: 0,
              backlinks: 0,
              pathRelevance: 0,
            },
            matches: [{
              type: 'content',
              text: query,
              context: file.plainText.substring(0, 200),
            }],
          });
        }
      }

      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, limit || this._maxResults);

    } catch (error) {
      throw new SearchEngineError(
        `Semantic search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        query,
        'semanticSearch',
        error instanceof Error ? error : undefined
      );
    }
  }

  textSearch(query: string, files: IndexedFile[]): SearchResult[] {
    const lowerQuery = query.toLowerCase();
    const queryTerms = lowerQuery.split(/\s+/).filter(term => term.length > 0);
    
    const results: SearchResult[] = [];

    for (const file of files) {
      const matches: SearchResult['matches'] = [];
      let totalScore = 0;

      for (const term of queryTerms) {
        const contentMatches = this.findTermMatches(term, file.plainText, 'content');
        const titleMatches = this.findTermMatches(term, file.frontmatter.title || '', 'title');
        const tagMatches = file.tags.filter(tag => tag.toLowerCase().includes(term))
          .map(tag => ({ type: 'tag' as const, text: tag }));

        matches.push(...contentMatches, ...titleMatches, ...tagMatches);
        
        totalScore += contentMatches.length * 1;
        totalScore += titleMatches.length * 3;
        totalScore += tagMatches.length * 2;
      }

      if (matches.length > 0) {
        const normalizedScore = Math.min(totalScore / queryTerms.length, 1.0);
        
        results.push({
          file,
          score: normalizedScore,
          relevance: {
            semantic: 0,
            tags: 0,
            recency: 0,
            backlinks: 0,
            pathRelevance: normalizedScore,
          },
          matches,
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, this._maxResults);
  }

  private async performHybridSearch(
    files: IndexedFile[],
    query: string,
    searchQuery: SearchQuery
  ): Promise<SearchResult[]> {
    const textResults = this.textSearch(query, files);
    
    let semanticResults: SearchResult[] = [];
    if (this._embeddingProvider) {
      try {
        semanticResults = await this.semanticSearch(query, files);
      } catch (error) {
        this.logger.warn({ error }, 'Semantic search failed, falling back to text search only');
      }
    }

    const combinedResults = this.combineSearchResults(textResults, semanticResults, query, searchQuery);
    
    return combinedResults
      .sort((a, b) => b.score - a.score)
      .slice(0, searchQuery.limit || this._maxResults);
  }

  private combineSearchResults(
    textResults: SearchResult[],
    semanticResults: SearchResult[],
    query: string,
    searchQuery: SearchQuery
  ): SearchResult[] {
    const fileScores = new Map<string, SearchResult>();

    for (const result of textResults) {
      fileScores.set(result.file.relativePath, result);
    }

    for (const result of semanticResults) {
      const existing = fileScores.get(result.file.relativePath);
      if (existing) {
        existing.relevance.semantic = result.relevance.semantic;
        existing.matches = [...existing.matches, ...result.matches];
      } else {
        fileScores.set(result.file.relativePath, result);
      }
    }

    return this.scoreAndRankFiles(
      Array.from(fileScores.values()).map(r => r.file),
      query,
      searchQuery
    );
  }

  private scoreAndRankFiles(files: IndexedFile[], query: string, searchQuery: SearchQuery): SearchResult[] {
    const pageRanks = this.getPageRanks();
    const now = new Date();
    const results: SearchResult[] = [];

    for (const file of files) {
      const relevance = this.calculateRelevance(file, query, pageRanks, now);
      const finalScore = this.calculateFinalScore(relevance);

      if (finalScore >= (searchQuery.threshold || this._similarityThreshold)) {
        results.push({
          file,
          score: finalScore,
          relevance,
          matches: this.extractMatches(file, query),
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  private calculateRelevance(
    file: IndexedFile,
    query: string,
    pageRanks: Map<string, number>,
    now: Date
  ): SearchResult['relevance'] {
    const semantic = this.calculateSemanticScore(file, query);
    const tags = this.calculateTagScore(file, query);
    const recency = this.calculateRecencyScore(file, now);
    const backlinks = pageRanks.get(file.relativePath) || 0;
    const pathRelevance = this.calculatePathRelevance(file, query);

    return { semantic, tags, recency, backlinks, pathRelevance };
  }

  private calculateFinalScore(relevance: SearchResult['relevance']): number {
    return (
      relevance.semantic * this._rankingWeights.semantic +
      relevance.tags * this._rankingWeights.tags +
      relevance.recency * this._rankingWeights.recency +
      relevance.backlinks * this._rankingWeights.backlinks
    );
  }

  private calculateSemanticScore(file: IndexedFile, query: string): number {
    return 0;
  }

  private calculateTagScore(file: IndexedFile, query: string): number {
    if (!file.tags.length) return 0;

    const queryTerms = query.toLowerCase().split(/\s+/);
    let matches = 0;

    for (const tag of file.tags) {
      const tagLower = tag.toLowerCase();
      for (const term of queryTerms) {
        if (tagLower.includes(term)) {
          matches++;
        }
      }
    }

    return Math.min(matches / queryTerms.length, 1.0);
  }

  private calculateRecencyScore(file: IndexedFile, now: Date): number {
    const daysSinceModified = (now.getTime() - file.lastModified.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, 1 - daysSinceModified / 365);
  }

  private calculatePathRelevance(file: IndexedFile, query: string): number {
    const pathLower = file.relativePath.toLowerCase();
    const queryLower = query.toLowerCase();
    
    if (pathLower.includes(queryLower)) {
      return 1.0;
    }
    
    const queryTerms = queryLower.split(/\s+/);
    let matches = 0;
    
    for (const term of queryTerms) {
      if (pathLower.includes(term)) {
        matches++;
      }
    }
    
    return matches / queryTerms.length;
  }

  private extractMatches(file: IndexedFile, query: string): SearchResult['matches'] {
    const matches: SearchResult['matches'] = [];
    const queryTerms = query.toLowerCase().split(/\s+/);

    for (const term of queryTerms) {
      matches.push(...this.findTermMatches(term, file.plainText, 'content'));
      
      if (file.frontmatter.title) {
        matches.push(...this.findTermMatches(term, file.frontmatter.title, 'title'));
      }
    }

    return matches;
  }

  private findTermMatches(
    term: string,
    text: string,
    type: 'content' | 'title' | 'tag' | 'frontmatter'
  ): SearchResult['matches'] {
    const matches: SearchResult['matches'] = [];
    const lowerText = text.toLowerCase();
    const lowerTerm = term.toLowerCase();
    
    let index = 0;
    while ((index = lowerText.indexOf(lowerTerm, index)) !== -1) {
      const start = Math.max(0, index - 50);
      const end = Math.min(text.length, index + term.length + 50);
      const context = text.substring(start, end);
      
      matches.push({
        type,
        text: term,
        context,
        position: index,
      });
      
      index += term.length;
    }
    
    return matches;
  }

  private applyFilters(files: IndexedFile[], filters?: SearchFilters): IndexedFile[] {
    if (!filters) return files;

    let filtered = files;

    if (filters.tags && filters.tags.length > 0) {
      const taggedFiles = this._tagEngine.getFilesByTags(filters.tags, filters.tagMode || 'and');
      const taggedSet = new Set(taggedFiles);
      filtered = filtered.filter(f => taggedSet.has(f.relativePath));
    }

    if (filters.paths && filters.paths.length > 0) {
      const pathPatterns = filters.paths.map(p => new RegExp(p, 'i'));
      filtered = filtered.filter(f => 
        pathPatterns.some(pattern => pattern.test(f.relativePath))
      );
    }

    if (filters.dateRange) {
      const { start, end } = filters.dateRange;
      filtered = filtered.filter(f => {
        if (start && f.lastModified < start) return false;
        if (end && f.lastModified > end) return false;
        return true;
      });
    }

    return filtered;
  }

  private getPageRanks(): Map<string, number> {
    const now = Date.now();
    
    if (this.pageRankCache && (now - this.pageRankCacheTime) < this.pageRankCacheTTL) {
      return this.pageRankCache;
    }

    this.pageRankCache = this._backlinkEngine.calculatePageRank();
    this.pageRankCacheTime = now;
    
    return this.pageRankCache;
  }

  getStats(): {
    maxResults: number;
    similarityThreshold: number;
    rankingWeights: RankingWeights;
    pageRankCacheSize: number;
  } {
    return {
      maxResults: this._maxResults,
      similarityThreshold: this._similarityThreshold,
      rankingWeights: this._rankingWeights,
      pageRankCacheSize: this.pageRankCache?.size || 0,
    };
  }

  updateConfiguration(config: {
    maxResults?: number;
    similarityThreshold?: number;
    rankingWeights?: RankingWeights;
  }): void {
    if (config.maxResults !== undefined) {
      this._maxResults = config.maxResults;
    }
    if (config.similarityThreshold !== undefined) {
      this._similarityThreshold = config.similarityThreshold;
    }
    if (config.rankingWeights !== undefined) {
      this._rankingWeights = config.rankingWeights;
    }
    
    this.pageRankCache = undefined;
    this.pageRankCacheTime = 0;
  }
}