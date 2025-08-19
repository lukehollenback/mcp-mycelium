import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VaultManager } from '../../../src/core/vault-manager.js';
import { SearchEngine } from '../../../src/core/search-engine.js';
import { GraphAnalyzer } from '../../../src/graph/graph-analyzer.js';
import { ConfigurationManager } from '../../../src/utils/config.js';
import { 
  handleSearchContent, 
  handleSemanticSearch, 
  handleTextSearch 
} from '../../../src/server/tools/search-tools.js';
import { TestVaultManager, sampleFiles, createMockEmbeddingProvider } from '../../helpers/test-fixtures.js';

describe('Search Tools Integration', () => {
  let testVaultManager: TestVaultManager;
  let vaultManager: VaultManager;
  let searchEngine: SearchEngine;
  let graphAnalyzer: GraphAnalyzer;
  let context: any;

  beforeEach(async () => {
    testVaultManager = new TestVaultManager();
    const vault = testVaultManager.createVault('test-vault', sampleFiles);
    const configDir = testVaultManager.getConfigDir();

    const configManager = new ConfigurationManager(configDir, [vault.path]);
    const config = await configManager.load();

    vaultManager = new VaultManager(config);
    await vaultManager.initialize();

    const targetVault = vaultManager.getVault();
    const embeddingProvider = createMockEmbeddingProvider();
    await targetVault.indexer.setEmbeddingProvider(embeddingProvider as any);

    searchEngine = new SearchEngine(
      embeddingProvider as any,
      targetVault.tagEngine,
      targetVault.backlinkEngine,
      config.global.server.search.ranking_weights,
      config.global.server.search.max_results,
      config.global.server.search.similarity_threshold
    );

    graphAnalyzer = new GraphAnalyzer(
      targetVault.tagEngine,
      targetVault.backlinkEngine
    );

    context = {
      vaultManager,
      searchEngine,
      graphAnalyzer,
    };
  });

  afterEach(async () => {
    if (vaultManager) {
      await vaultManager.shutdown();
    }
    testVaultManager.cleanup();
  });

  describe('handleSearchContent', () => {
    it('should perform basic content search', async () => {
      const result = await handleSearchContent({
        query: 'knowledge base',
        limit: 10,
      }, context);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);
      expect(result.totalResults).toBeGreaterThan(0);
      expect(result.query).toBe('knowledge base');

      const foundFile = result.results.find((r: any) => 
        r.file.path.includes('getting-started.md')
      );
      expect(foundFile).toBeDefined();
    });

    it('should apply tag filters', async () => {
      const result = await handleSearchContent({
        query: 'project',
        filters: {
          tags: ['tutorial'],
          tagMode: 'and',
        },
        limit: 10,
      }, context);

      expect(result.results).toBeInstanceOf(Array);
      
      // Should find tutorial files that mention "project"
      const tutorialFiles = result.results.filter((r: any) => 
        r.file.tags.includes('tutorial')
      );
      expect(tutorialFiles.length).toBeGreaterThan(0);
    });

    it('should apply path filters', async () => {
      const result = await handleSearchContent({
        query: 'project',
        filters: {
          paths: ['^projects/'],
        },
        limit: 10,
      }, context);

      expect(result.results).toBeInstanceOf(Array);
      
      // Should only find files in projects directory
      const projectFiles = result.results.filter((r: any) => 
        r.file.path.startsWith('projects/')
      );
      expect(projectFiles.length).toBe(result.results.length);
    });

    it('should apply date range filters', async () => {
      const result = await handleSearchContent({
        query: 'daily',
        filters: {
          dateRange: {
            start: '2024-01-01',
            end: '2024-01-02',
          },
        },
        limit: 10,
      }, context);

      expect(result.results).toBeInstanceOf(Array);
      
      // Should find daily note from Jan 1, 2024
      const dailyFile = result.results.find((r: any) => 
        r.file.path.includes('daily/2024-01-01.md')
      );
      expect(dailyFile).toBeDefined();
    });

    it('should respect result limits', async () => {
      const result = await handleSearchContent({
        query: 'note',
        limit: 2,
      }, context);

      expect(result.results.length).toBeLessThanOrEqual(2);
    });

    it('should provide relevance scoring', async () => {
      const result = await handleSearchContent({
        query: 'getting started',
        limit: 5,
      }, context);

      expect(result.results.length).toBeGreaterThan(0);
      
      for (const resultItem of result.results) {
        expect(resultItem.score).toBeTypeOf('number');
        expect(resultItem.score).toBeGreaterThan(0);
        expect(resultItem.relevance).toBeDefined();
        expect(resultItem.relevance.semantic).toBeTypeOf('number');
        expect(resultItem.relevance.tags).toBeTypeOf('number');
        expect(resultItem.relevance.recency).toBeTypeOf('number');
        expect(resultItem.relevance.backlinks).toBeTypeOf('number');
      }
    });

    it('should include match context', async () => {
      const result = await handleSearchContent({
        query: 'WikiLinks',
        limit: 5,
      }, context);

      expect(result.results.length).toBeGreaterThan(0);
      
      const fileWithMatch = result.results.find((r: any) => 
        r.matches && r.matches.length > 0
      );
      
      if (fileWithMatch) {
        expect(fileWithMatch.matches[0]).toHaveProperty('type');
        expect(fileWithMatch.matches[0]).toHaveProperty('text');
        expect(fileWithMatch.matches[0]).toHaveProperty('context');
      }
    });
  });

  describe('handleSemanticSearch', () => {
    it('should perform semantic search', async () => {
      const result = await handleSemanticSearch({
        query: 'connecting ideas together',
        limit: 5,
      }, context);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);
      expect(result.query).toBe('connecting ideas together');

      for (const resultItem of result.results) {
        expect(resultItem.score).toBeTypeOf('number');
        expect(resultItem.semanticSimilarity).toBeTypeOf('number');
        expect(resultItem.file).toBeDefined();
        expect(resultItem.file.path).toBeTypeOf('string');
      }
    });

    it('should handle empty results gracefully', async () => {
      const result = await handleSemanticSearch({
        query: 'completely unrelated quantum physics topics',
        limit: 5,
      }, context);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);
      expect(result.totalResults).toBe(result.results.length);
    });

    it('should respect similarity thresholds', async () => {
      // Since we're using mock embeddings with random values,
      // we can't test exact similarity matching, but we can verify structure
      const result = await handleSemanticSearch({
        query: 'test query',
        limit: 10,
      }, context);

      expect(result.results).toBeInstanceOf(Array);
      
      // Results should be sorted by score (highest first)
      for (let i = 1; i < result.results.length; i++) {
        expect(result.results[i].score).toBeLessThanOrEqual(result.results[i - 1].score);
      }
    });
  });

  describe('handleTextSearch', () => {
    it('should perform exact text search', async () => {
      const result = await handleTextSearch({
        query: 'Getting Started',
        limit: 5,
      }, context);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);
      expect(result.totalResults).toBeGreaterThan(0);

      // Should find the "Getting Started" note
      const gettingStartedFile = result.results.find((r: any) => 
        r.file.title === 'Getting Started'
      );
      expect(gettingStartedFile).toBeDefined();
    });

    it('should include match positions', async () => {
      const result = await handleTextSearch({
        query: 'knowledge',
        limit: 5,
      }, context);

      expect(result.results.length).toBeGreaterThan(0);
      
      const fileWithMatches = result.results[0];
      expect(fileWithMatches.matches).toBeInstanceOf(Array);
      
      if (fileWithMatches.matches.length > 0) {
        const match = fileWithMatches.matches[0];
        expect(match).toHaveProperty('type');
        expect(match).toHaveProperty('text');
        expect(match).toHaveProperty('context');
        expect(match).toHaveProperty('position');
        expect(match.position).toBeTypeOf('number');
      }
    });

    it('should handle case sensitivity', async () => {
      const caseSensitiveResult = await handleTextSearch({
        query: 'GETTING',
        caseSensitive: true,
        limit: 5,
      }, context);

      const caseInsensitiveResult = await handleTextSearch({
        query: 'GETTING',
        caseSensitive: false,
        limit: 5,
      }, context);

      // Case insensitive should find more results
      expect(caseInsensitiveResult.results.length).toBeGreaterThanOrEqual(
        caseSensitiveResult.results.length
      );
    });

    it('should search in different content types', async () => {
      const result = await handleTextSearch({
        query: 'Project Alpha',
        limit: 5,
      }, context);

      expect(result.results.length).toBeGreaterThan(0);
      
      const matches = result.results.flatMap((r: any) => r.matches);
      const matchTypes = new Set(matches.map((m: any) => m.type));
      
      // Should find matches in title (frontmatter)
      expect(matchTypes.has('title')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle invalid vault names gracefully', async () => {
      await expect(handleSearchContent({
        query: 'test',
        vault: 'non-existent-vault',
      }, context)).rejects.toThrow();
    });

    it('should handle empty queries', async () => {
      const result = await handleSearchContent({
        query: '',
        limit: 5,
      }, context);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);
    });

    it('should handle malformed filters gracefully', async () => {
      const result = await handleSearchContent({
        query: 'test',
        filters: {
          dateRange: {
            start: 'invalid-date',
          },
        },
        limit: 5,
      }, context);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);
    });
  });
});