import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VaultManager } from '../../src/core/vault-manager.js';
import { SearchEngine } from '../../src/core/search-engine.js';
import { ConfigurationManager } from '../../src/utils/config.js';
import { TestVaultManager, createMockEmbeddingProvider } from '../helpers/test-fixtures.js';

describe('Performance Benchmarks', () => {
  let testVaultManager: TestVaultManager;
  let vaultManager: VaultManager;
  let searchEngine: SearchEngine;

  beforeEach(async () => {
    testVaultManager = new TestVaultManager();
  });

  afterEach(async () => {
    if (vaultManager) {
      await vaultManager.shutdown();
    }
    testVaultManager.cleanup();
  });

  describe('Indexing Performance', () => {
    it('should index 1000 files in under 30 seconds', async () => {
      const files = Array.from({ length: 1000 }, (_, i) => ({
        path: `file${i}.md`,
        frontmatter: {
          title: `File ${i}`,
          created: '2024-01-01T00:00:00Z',
          modified: '2024-01-01T00:00:00Z',
          tags: [`tag${i % 10}`, `category${i % 5}`],
        },
        content: `# File ${i}\n\nThis is content for file ${i}. It contains various keywords like project, task, and note.\n\n## Section ${i}\n\nMore content with different terms like analysis, research, and documentation.`,
      }));

      const vault = testVaultManager.createVault('large-vault', files);
      const configDir = testVaultManager.getConfigDir();

      const configManager = new ConfigurationManager(configDir, [vault.path]);
      const config = await configManager.load();

      vaultManager = new VaultManager(config);

      const startTime = Date.now();
      await vaultManager.initialize();
      const endTime = Date.now();

      const duration = endTime - startTime;
      const stats = vaultManager.getStats();

      expect(stats['large-vault'].fileCount).toBe(1000);
      expect(duration).toBeLessThan(30000); // 30 seconds

      console.log(`Indexed ${files.length} files in ${duration}ms (${(files.length / (duration / 1000)).toFixed(2)} files/sec)`);
    }, 60000); // 60 second timeout for this test

    it('should handle incremental updates efficiently', async () => {
      const files = Array.from({ length: 100 }, (_, i) => ({
        path: `file${i}.md`,
        frontmatter: {
          title: `File ${i}`,
          tags: [`tag${i % 5}`],
        },
        content: `Content for file ${i}`,
      }));

      const vault = testVaultManager.createVault('update-vault', files);
      const configDir = testVaultManager.getConfigDir();

      const configManager = new ConfigurationManager(configDir, [vault.path]);
      const config = await configManager.load();

      vaultManager = new VaultManager(config);
      await vaultManager.initialize();

      const targetVault = vaultManager.getVault();

      // Measure time for 10 file updates
      const updateStartTime = Date.now();
      
      for (let i = 0; i < 10; i++) {
        const newContent = `---
title: Updated File ${i}
tags: [updated, tag${i % 5}]
---

# Updated File ${i}

This content has been updated at ${new Date().toISOString()}.`;
        
        await vaultManager.writeFile(`file${i}.md`, newContent);
      }

      const updateEndTime = Date.now();
      const updateDuration = updateEndTime - updateStartTime;

      expect(updateDuration).toBeLessThan(5000); // 5 seconds for 10 updates

      console.log(`Updated 10 files in ${updateDuration}ms (${(10 / (updateDuration / 1000)).toFixed(2)} updates/sec)`);
    });
  });

  describe('Search Performance', () => {
    beforeEach(async () => {
      const files = Array.from({ length: 500 }, (_, i) => ({
        path: `search${i}.md`,
        frontmatter: {
          title: `Search File ${i}`,
          tags: [`search`, `category${i % 10}`, `priority${i % 3}`],
        },
        content: `# Search File ${i}\n\nThis file contains searchable content about ${['project', 'research', 'analysis', 'documentation', 'planning'][i % 5]}.\n\nIt includes information about ${['AI', 'machine learning', 'data science', 'software engineering', 'product management'][i % 5]} and related topics.\n\n## Details\n\nDetailed content with keywords like ${['algorithm', 'database', 'API', 'framework', 'methodology'][i % 5]}.`,
      }));

      const vault = testVaultManager.createVault('search-vault', files);
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
    });

    it('should return search results in under 500ms', async () => {
      const targetVault = vaultManager.getVault();
      const files = targetVault.indexer.getAllFiles();

      const queries = [
        'project management',
        'machine learning algorithms',
        'software development',
        'data analysis',
        'research methodology',
      ];

      for (const query of queries) {
        const startTime = Date.now();
        
        const results = await searchEngine.search({
          text: query,
          limit: 20,
        }, files);

        const endTime = Date.now();
        const duration = endTime - startTime;

        expect(duration).toBeLessThan(500); // 500ms
        expect(results.length).toBeGreaterThan(0);

        console.log(`Search "${query}" completed in ${duration}ms, found ${results.length} results`);
      }
    });

    it('should handle concurrent searches efficiently', async () => {
      const targetVault = vaultManager.getVault();
      const files = targetVault.indexer.getAllFiles();

      const queries = Array.from({ length: 20 }, (_, i) => `query ${i}`);

      const startTime = Date.now();
      
      const searchPromises = queries.map(query =>
        searchEngine.search({ text: query, limit: 10 }, files)
      );

      const results = await Promise.all(searchPromises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(5000); // 5 seconds for 20 concurrent searches
      expect(results).toHaveLength(20);

      console.log(`Completed 20 concurrent searches in ${duration}ms (${(queries.length / (duration / 1000)).toFixed(2)} searches/sec)`);
    });
  });

  describe('Memory Usage', () => {
    it('should maintain reasonable memory usage with large vaults', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      const files = Array.from({ length: 2000 }, (_, i) => ({
        path: `memory${i}.md`,
        frontmatter: {
          title: `Memory Test ${i}`,
          tags: [`memory`, `test${i % 20}`],
        },
        content: `# Memory Test ${i}\n\n${'Content '.repeat(100)}for memory testing.`,
      }));

      const vault = testVaultManager.createVault('memory-vault', files);
      const configDir = testVaultManager.getConfigDir();

      const configManager = new ConfigurationManager(configDir, [vault.path]);
      const config = await configManager.load();

      vaultManager = new VaultManager(config);
      await vaultManager.initialize();

      const afterIndexMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = afterIndexMemory - initialMemory;
      const memoryPerFile = memoryIncrease / files.length;

      // Memory usage should be reasonable (less than 50KB per file)
      expect(memoryPerFile).toBeLessThan(50 * 1024);

      console.log(`Memory usage: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB for ${files.length} files (${(memoryPerFile / 1024).toFixed(2)}KB per file)`);
    });
  });

  describe('Graph Operations Performance', () => {
    beforeEach(async () => {
      const files = Array.from({ length: 300 }, (_, i) => {
        const linkedFiles = Array.from({ length: Math.min(5, i) }, (_, j) => 
          `[[graph${Math.floor(Math.random() * i)}]]`
        ).join(' ');

        return {
          path: `graph${i}.md`,
          frontmatter: {
            title: `Graph Node ${i}`,
            tags: [`graph`, `cluster${Math.floor(i / 50)}`],
          },
          content: `# Graph Node ${i}\n\nThis node connects to: ${linkedFiles}\n\nAdditional content for node ${i}.`,
        };
      });

      const vault = testVaultManager.createVault('graph-vault', files);
      const configDir = testVaultManager.getConfigDir();

      const configManager = new ConfigurationManager(configDir, [vault.path]);
      const config = await configManager.load();

      vaultManager = new VaultManager(config);
      await vaultManager.initialize();
    });

    it('should calculate PageRank efficiently', async () => {
      const targetVault = vaultManager.getVault();

      const startTime = Date.now();
      const pageRank = targetVault.backlinkEngine.calculatePageRank(20);
      const endTime = Date.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(2000); // 2 seconds

      expect(pageRank.size).toBeGreaterThan(0);

      console.log(`PageRank calculation completed in ${duration}ms for ${pageRank.size} nodes`);
    });

    it('should find shortest paths quickly', async () => {
      const targetVault = vaultManager.getVault();
      const files = targetVault.indexer.getAllFiles();

      if (files.length < 2) return;

      const startTime = Date.now();
      
      // Test 10 random path queries
      for (let i = 0; i < 10; i++) {
        const source = files[Math.floor(Math.random() * files.length)];
        const target = files[Math.floor(Math.random() * files.length)];
        
        if (source !== target) {
          targetVault.backlinkEngine.getShortestPath(source.relativePath, target.relativePath);
        }
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(1000); // 1 second for 10 path queries

      console.log(`10 shortest path queries completed in ${duration}ms`);
    });
  });

  describe('Bulk Operations Performance', () => {
    it('should handle bulk validation efficiently', async () => {
      const files = Array.from({ length: 200 }, (_, i) => ({
        path: `bulk${i}.md`,
        frontmatter: {
          title: `Bulk File ${i}`,
          created: '2024-01-01T00:00:00Z',
          tags: [`bulk`, `test${i % 10}`],
        },
        content: `# Bulk File ${i}\n\nContent for bulk validation testing.`,
      }));

      const vault = testVaultManager.createVault('bulk-vault', files);
      const configDir = testVaultManager.getConfigDir();

      const configManager = new ConfigurationManager(configDir, [vault.path]);
      const config = await configManager.load();

      vaultManager = new VaultManager(config);
      await vaultManager.initialize();

      const targetVault = vaultManager.getVault();

      const startTime = Date.now();
      
      const filesToValidate = files.map(file => ({
        content: file.frontmatter ? `---\ntitle: ${file.frontmatter.title}\n---\n\n${file.content}` : file.content,
        filePath: file.path,
      }));

      const results = await targetVault.validator.validateBatch(filesToValidate);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(5000); // 5 seconds for 200 files
      expect(results.size).toBe(files.length);

      console.log(`Bulk validation of ${files.length} files completed in ${duration}ms (${(files.length / (duration / 1000)).toFixed(2)} files/sec)`);
    });
  });
});