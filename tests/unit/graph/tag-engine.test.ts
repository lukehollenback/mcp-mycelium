import { describe, it, expect, beforeEach } from 'vitest';
import { TagEngine } from '../../../src/graph/tag-engine.js';

describe('TagEngine', () => {
  let tagEngine: TagEngine;

  beforeEach(() => {
    tagEngine = new TagEngine();
  });

  describe('tag management', () => {
    it('should add tags to files', () => {
      tagEngine.addTags('file1.md', ['tag1', 'tag2']);
      
      const tagsForFile = tagEngine.getTagsForFile('file1.md');
      expect(tagsForFile).toContain('tag1');
      expect(tagsForFile).toContain('tag2');
    });

    it('should normalize tag names', () => {
      tagEngine.addTags('file1.md', ['Tag1', '#tag2', ' tag3 ']);
      
      const tagsForFile = tagEngine.getTagsForFile('file1.md');
      expect(tagsForFile).toContain('tag1');
      expect(tagsForFile).toContain('tag2');
      expect(tagsForFile).toContain('tag3');
    });

    it('should remove duplicate tags', () => {
      tagEngine.addTags('file1.md', ['tag1', 'tag1', 'tag2']);
      
      const tagsForFile = tagEngine.getTagsForFile('file1.md');
      expect(tagsForFile.filter(tag => tag === 'tag1')).toHaveLength(1);
    });

    it('should remove tags from files', () => {
      tagEngine.addTags('file1.md', ['tag1', 'tag2', 'tag3']);
      tagEngine.removeTags('file1.md', ['tag2']);
      
      const tagsForFile = tagEngine.getTagsForFile('file1.md');
      expect(tagsForFile).toContain('tag1');
      expect(tagsForFile).toContain('tag3');
      expect(tagsForFile).not.toContain('tag2');
    });

    it('should remove all tags from file', () => {
      tagEngine.addTags('file1.md', ['tag1', 'tag2']);
      tagEngine.removeTags('file1.md');
      
      const tagsForFile = tagEngine.getTagsForFile('file1.md');
      expect(tagsForFile).toHaveLength(0);
    });

    it('should update file tags', () => {
      tagEngine.addTags('file1.md', ['tag1', 'tag2']);
      tagEngine.updateFileTags('file1.md', ['tag3', 'tag4']);
      
      const tagsForFile = tagEngine.getTagsForFile('file1.md');
      expect(tagsForFile).toEqual(['tag3', 'tag4']);
    });
  });

  describe('tag queries', () => {
    beforeEach(() => {
      tagEngine.addTags('file1.md', ['project', 'web', 'frontend']);
      tagEngine.addTags('file2.md', ['project', 'mobile', 'ios']);
      tagEngine.addTags('file3.md', ['project', 'web', 'backend']);
      tagEngine.addTags('file4.md', ['personal', 'notes']);
    });

    it('should find files by single tag', () => {
      const files = tagEngine.getFilesByTag('project');
      expect(files).toHaveLength(3);
      expect(files).toContain('file1.md');
      expect(files).toContain('file2.md');
      expect(files).toContain('file3.md');
    });

    it('should find files by multiple tags (AND)', () => {
      const files = tagEngine.getFilesByTags(['project', 'web'], 'and');
      expect(files).toHaveLength(2);
      expect(files).toContain('file1.md');
      expect(files).toContain('file3.md');
    });

    it('should find files by multiple tags (OR)', () => {
      const files = tagEngine.getFilesByTags(['mobile', 'personal'], 'or');
      expect(files).toHaveLength(2);
      expect(files).toContain('file2.md');
      expect(files).toContain('file4.md');
    });

    it('should return empty array for non-existent tags', () => {
      const files = tagEngine.getFilesByTag('nonexistent');
      expect(files).toHaveLength(0);
    });
  });

  describe('tag statistics', () => {
    beforeEach(() => {
      tagEngine.addTags('file1.md', ['popular', 'web']);
      tagEngine.addTags('file2.md', ['popular', 'mobile']);
      tagEngine.addTags('file3.md', ['popular', 'backend']);
      tagEngine.addTags('file4.md', ['rare']);
    });

    it('should get all tags with statistics', () => {
      const allTags = tagEngine.getAllTags();
      expect(allTags.length).toBeGreaterThan(0);
      
      const popularTag = allTags.find(tag => tag.name === 'popular');
      expect(popularTag?.fileCount).toBe(3);
      
      const rareTag = allTags.find(tag => tag.name === 'rare');
      expect(rareTag?.fileCount).toBe(1);
    });

    it('should get tag statistics for specific tag', () => {
      const stats = tagEngine.getTagStats('popular');
      expect(stats?.fileCount).toBe(3);
      expect(stats?.name).toBe('popular');
    });

    it('should return undefined for non-existent tag stats', () => {
      const stats = tagEngine.getTagStats('nonexistent');
      expect(stats).toBeUndefined();
    });

    it('should track co-occurring tags', () => {
      const coOccurring = tagEngine.getCoOccurringTags('popular');
      expect(coOccurring.length).toBeGreaterThan(0);
      
      const webCoOccurrence = coOccurring.find(([tag]) => tag === 'web');
      expect(webCoOccurrence).toBeDefined();
      expect(webCoOccurrence?.[1]).toBe(1); // occurs together once
    });
  });

  describe('hierarchical tags', () => {
    beforeEach(() => {
      tagEngine.addTags('file1.md', ['project/web/frontend']);
      tagEngine.addTags('file2.md', ['project/web/backend']);
      tagEngine.addTags('file3.md', ['project/mobile/ios']);
      tagEngine.addTags('file4.md', ['project/mobile/android']);
    });

    it('should parse tag hierarchy', () => {
      const hierarchy = tagEngine.getTagHierarchy('project/web/frontend');
      expect(hierarchy).toEqual(['project', 'web', 'frontend']);
    });

    it('should find child tags', () => {
      const children = tagEngine.getChildTags('project/web');
      expect(children).toContain('project/web/frontend');
      expect(children).toContain('project/web/backend');
      expect(children).not.toContain('project/mobile/ios');
    });

    it('should find parent tags', () => {
      const parents = tagEngine.getParentTags('project/web/frontend');
      expect(parents).toEqual(['project', 'project/web']);
    });
  });

  describe('tag suggestions', () => {
    beforeEach(() => {
      tagEngine.addTags('file1.md', ['project', 'web', 'javascript']);
      tagEngine.addTags('file2.md', ['project', 'web', 'typescript']);
      tagEngine.addTags('file3.md', ['project', 'web', 'react']);
      tagEngine.addTags('file4.md', ['project', 'mobile', 'react']);
    });

    it('should suggest tags based on co-occurrence', () => {
      const suggestions = tagEngine.getTagSuggestions(['project', 'web']);
      
      const suggestionTags = suggestions.map(s => s.tag);
      expect(suggestionTags).toContain('javascript');
      expect(suggestionTags).toContain('typescript');
      expect(suggestionTags).toContain('react');
    });

    it('should suggest hierarchical tags', () => {
      tagEngine.addTags('file5.md', ['project/web']);
      tagEngine.addTags('file6.md', ['project/web/frontend']);
      
      const suggestions = tagEngine.getTagSuggestions(['project/web']);
      const hierarchicalSuggestions = suggestions.filter(s => s.reason === 'hierarchy');
      
      expect(hierarchicalSuggestions.length).toBeGreaterThan(0);
    });

    it('should not suggest already existing tags', () => {
      const suggestions = tagEngine.getTagSuggestions(['project', 'web']);
      const suggestionTags = suggestions.map(s => s.tag);
      
      expect(suggestionTags).not.toContain('project');
      expect(suggestionTags).not.toContain('web');
    });
  });

  describe('file removal', () => {
    beforeEach(() => {
      tagEngine.addTags('file1.md', ['tag1', 'tag2']);
      tagEngine.addTags('file2.md', ['tag2', 'tag3']);
    });

    it('should remove file from all tags', () => {
      tagEngine.removeFile('file1.md');
      
      const filesWithTag1 = tagEngine.getFilesByTag('tag1');
      expect(filesWithTag1).not.toContain('file1.md');
      
      const filesWithTag2 = tagEngine.getFilesByTag('tag2');
      expect(filesWithTag2).not.toContain('file1.md');
      expect(filesWithTag2).toContain('file2.md');
    });

    it('should clean up orphaned tags', () => {
      const initialTagCount = tagEngine.getTagCount();
      
      tagEngine.removeFile('file1.md');
      tagEngine.removeFile('file2.md');
      
      // All tags should be removed since no files reference them
      const finalTagCount = tagEngine.getTagCount();
      expect(finalTagCount).toBeLessThan(initialTagCount);
    });
  });

  describe('performance', () => {
    it('should handle large numbers of tags efficiently', () => {
      const startTime = Date.now();
      
      // Add many tags to many files
      for (let i = 0; i < 1000; i++) {
        tagEngine.addTags(`file${i}.md`, [`tag${i}`, `common`, `category${i % 10}`]);
      }
      
      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(5000); // Should complete in under 5 seconds
      
      // Verify data integrity
      const commonFiles = tagEngine.getFilesByTag('common');
      expect(commonFiles).toHaveLength(1000);
      
      const allTags = tagEngine.getAllTags();
      expect(allTags.length).toBeGreaterThan(1000);
    });
  });
});