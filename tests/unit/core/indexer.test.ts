import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Indexer } from '../../../src/core/indexer.js';
import { FilesystemManager } from '../../../src/utils/filesystem.js';
import { MarkdownParser } from '../../../src/utils/markdown-parser.js';
import { TagEngine } from '../../../src/graph/tag-engine.js';
import { BacklinkEngine } from '../../../src/graph/backlink-engine.js';
import { TestVaultManager, sampleFiles, createMockEmbeddingProvider } from '../../helpers/test-fixtures.js';

describe('Indexer', () => {
  let testVaultManager: TestVaultManager;
  let indexer: Indexer;
  let filesystem: FilesystemManager;
  let parser: MarkdownParser;
  let tagEngine: TagEngine;
  let backlinkEngine: BacklinkEngine;

  beforeEach(async () => {
    testVaultManager = new TestVaultManager();
    const vault = testVaultManager.createVault('test-vault', sampleFiles);

    filesystem = new FilesystemManager(vault.path);
    parser = new MarkdownParser();
    tagEngine = new TagEngine();
    backlinkEngine = new BacklinkEngine();

    indexer = new Indexer(filesystem, parser, tagEngine, backlinkEngine);
  });

  afterEach(() => {
    testVaultManager.cleanup();
  });

  describe('buildInitialIndex', () => {
    it('should index all markdown files', async () => {
      await indexer.buildInitialIndex();

      const stats = indexer.getStats();
      expect(stats.totalFiles).toBe(sampleFiles.length);
      expect(stats.indexedFiles).toBe(sampleFiles.length);
    });

    it('should extract frontmatter correctly', async () => {
      await indexer.buildInitialIndex();

      const file = indexer.getFile('notes/getting-started.md');
      expect(file).toBeDefined();
      expect(file?.frontmatter.title).toBe('Getting Started');
      expect(file?.frontmatter.tags).toEqual(['tutorial', 'basics']);
    });

    it('should extract tags from content and frontmatter', async () => {
      await indexer.buildInitialIndex();

      const file = indexer.getFile('projects/project-alpha.md');
      expect(file).toBeDefined();
      expect(file?.tags).toContain('project');
      expect(file?.tags).toContain('alpha');
      expect(file?.tags).toContain('active');
    });

    it('should extract links correctly', async () => {
      await indexer.buildInitialIndex();

      const file = indexer.getFile('notes/getting-started.md');
      expect(file).toBeDefined();
      expect(file?.links).toHaveLength(2); // [[Linking Notes]] and [[Advanced Features]]
      
      const linkingNotesLink = file?.links.find(l => l.target.includes('Linking Notes'));
      expect(linkingNotesLink).toBeDefined();
      expect(linkingNotesLink?.type).toBe('wikilink');
    });

    it('should create content chunks', async () => {
      await indexer.buildInitialIndex();

      const file = indexer.getFile('notes/advanced-features.md');
      expect(file).toBeDefined();
      expect(file?.chunks.length).toBeGreaterThan(0);
      expect(file?.plainText.length).toBeGreaterThan(0);
    });
  });

  describe('updateFile', () => {
    beforeEach(async () => {
      await indexer.buildInitialIndex();
    });

    it('should update existing file', async () => {
      const originalStats = indexer.getStats();
      
      // Simulate file modification by writing new content
      await filesystem.writeFile('notes/getting-started.md', `---
title: Updated Getting Started
modified: 2024-01-02T00:00:00Z
tags: [tutorial, updated]
---

# Updated Content

This content has been updated.`);

      await indexer.updateFile('notes/getting-started.md');

      const updatedFile = indexer.getFile('notes/getting-started.md');
      expect(updatedFile?.frontmatter.title).toBe('Updated Getting Started');
      expect(updatedFile?.tags).toContain('updated');

      const newStats = indexer.getStats();
      expect(newStats.totalFiles).toBe(originalStats.totalFiles);
    });

    it('should remove file when it no longer exists', async () => {
      const originalStats = indexer.getStats();
      
      // The file will be detected as non-existent when updateFile tries to read it
      await indexer.removeFile('notes/getting-started.md');

      const stats = indexer.getStats();
      expect(stats.totalFiles).toBe(originalStats.totalFiles - 1);
      
      const file = indexer.getFile('notes/getting-started.md');
      expect(file).toBeUndefined();
    });
  });

  describe('search functionality', () => {
    beforeEach(async () => {
      await indexer.buildInitialIndex();
    });

    it('should find files by tag', async () => {
      const tutorialFiles = indexer.getFilesByTag(['tutorial']);
      expect(tutorialFiles.length).toBeGreaterThan(0);
      
      const filePaths = tutorialFiles.map(f => f.relativePath);
      expect(filePaths).toContain('notes/getting-started.md');
      expect(filePaths).toContain('notes/linking-notes.md');
    });

    it('should search files by content', async () => {
      const searchResults = indexer.searchFiles('knowledge base');
      expect(searchResults.length).toBeGreaterThan(0);
      
      const foundPaths = searchResults.map(f => f.relativePath);
      expect(foundPaths).toContain('notes/getting-started.md');
    });

    it('should search files by title in frontmatter', async () => {
      const searchResults = indexer.searchFiles('Project Alpha');
      expect(searchResults.length).toBeGreaterThan(0);
      
      const foundFile = searchResults.find(f => f.relativePath === 'projects/project-alpha.md');
      expect(foundFile).toBeDefined();
    });
  });

  describe('embedding support', () => {
    it('should generate embeddings when provider is available', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      await indexer.setEmbeddingProvider(embeddingProvider as any);
      await indexer.buildInitialIndex();

      const file = indexer.getFile('notes/getting-started.md');
      expect(file?.embeddings).toBeDefined();
      expect(file?.embeddings?.length).toBeGreaterThan(0);
    });

    it('should work without embedding provider', async () => {
      await indexer.buildInitialIndex();

      const file = indexer.getFile('notes/getting-started.md');
      expect(file?.embeddings).toBeUndefined();
      
      const stats = indexer.getStats();
      expect(stats.totalEmbeddings).toBe(0);
    });
  });

  describe('reindexing', () => {
    it('should clear and rebuild entire index', async () => {
      await indexer.buildInitialIndex();
      
      const originalStats = indexer.getStats();
      expect(originalStats.totalFiles).toBeGreaterThan(0);

      await indexer.reindexAll();

      const newStats = indexer.getStats();
      expect(newStats.totalFiles).toBe(originalStats.totalFiles);
      expect(newStats.lastIndexTime).toBeInstanceOf(Date);
    });
  });

  describe('error handling', () => {
    it('should handle missing files gracefully', async () => {
      const file = indexer.getFile('non-existent.md');
      expect(file).toBeUndefined();
    });

    it('should continue indexing when individual files fail', async () => {
      // Create a file with invalid content that might cause parsing issues
      await filesystem.writeFile('invalid.md', 'Invalid frontmatter\n---\nIncomplete');

      await indexer.buildInitialIndex();

      // Should still index other valid files
      const stats = indexer.getStats();
      expect(stats.totalFiles).toBeGreaterThan(0);
    });
  });
});