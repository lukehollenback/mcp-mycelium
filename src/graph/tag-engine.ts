import pino from 'pino';

export interface TagInfo {
  files: Set<string>;
  co_occurring_tags: Map<string, number>;
  created: Date;
  last_seen: Date;
  hierarchy?: string[];
}

export interface TagStats {
  name: string;
  fileCount: number;
  coOccurrences: Record<string, number>;
  created: string;
  lastSeen: string;
  hierarchy: string[];
}

export interface TagSuggestion {
  tag: string;
  score: number;
  reason: 'existing' | 'co_occurrence' | 'hierarchy';
}

export class TagEngineError extends Error {
  constructor(
    message: string,
    public readonly tag: string,
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'TagEngineError';
  }
}

export class TagEngine {
  private tags = new Map<string, TagInfo>();
  private logger = pino({ name: 'TagEngine' });
  private hierarchySeparator = '/';

  constructor() {}

  addTags(filePath: string, tagNames: string[]): void {
    try {
      const normalizedTags = this.normalizeTags(tagNames);
      const timestamp = new Date();

      for (const tag of normalizedTags) {
        this.addOrUpdateTag(tag, filePath, timestamp);
        this.updateCoOccurrences(tag, normalizedTags.filter(t => t !== tag));
      }

      this.logger.debug({ filePath, tags: normalizedTags }, 'Added tags to file');
    } catch (error) {
      throw new TagEngineError(
        `Failed to add tags: ${error instanceof Error ? error.message : 'Unknown error'}`,
        tagNames.join(', '),
        'add',
        error instanceof Error ? error : undefined
      );
    }
  }

  removeTags(filePath: string, tagNames?: string[]): void {
    try {
      if (!tagNames) {
        this.removeAllTagsFromFile(filePath);
        return;
      }

      const normalizedTags = this.normalizeTags(tagNames);
      
      for (const tag of normalizedTags) {
        this.removeTagFromFile(tag, filePath);
      }

      this.logger.debug({ filePath, tags: normalizedTags }, 'Removed tags from file');
    } catch (error) {
      throw new TagEngineError(
        `Failed to remove tags: ${error instanceof Error ? error.message : 'Unknown error'}`,
        tagNames ? tagNames.join(', ') : 'all',
        'remove',
        error instanceof Error ? error : undefined
      );
    }
  }

  updateFileTags(filePath: string, newTags: string[]): void {
    try {
      this.removeTags(filePath);
      this.addTags(filePath, newTags);
    } catch (error) {
      throw new TagEngineError(
        `Failed to update file tags: ${error instanceof Error ? error.message : 'Unknown error'}`,
        newTags.join(', '),
        'update',
        error instanceof Error ? error : undefined
      );
    }
  }

  getFilesByTag(tagName: string): string[] {
    const normalizedTag = this.normalizeTag(tagName);
    const tagInfo = this.tags.get(normalizedTag);
    return tagInfo ? Array.from(tagInfo.files) : [];
  }

  getFilesByTags(tagNames: string[], mode: 'and' | 'or' = 'and'): string[] {
    if (tagNames.length === 0) {
      return [];
    }

    const normalizedTags = this.normalizeTags(tagNames);
    const fileSets = normalizedTags.map(tag => new Set(this.getFilesByTag(tag)));

    if (mode === 'and') {
      return this.intersectSets(fileSets);
    } else {
      return this.unionSets(fileSets);
    }
  }

  getTagsForFile(filePath: string): string[] {
    const tags: string[] = [];
    
    for (const [tag, info] of this.tags) {
      if (info.files.has(filePath)) {
        tags.push(tag);
      }
    }
    
    return tags.sort();
  }

  getAllTags(): TagStats[] {
    return Array.from(this.tags.entries()).map(([name, info]) => ({
      name,
      fileCount: info.files.size,
      coOccurrences: Object.fromEntries(info.co_occurring_tags),
      created: info.created.toISOString(),
      lastSeen: info.last_seen.toISOString(),
      hierarchy: info.hierarchy || [],
    })).sort((a, b) => b.fileCount - a.fileCount);
  }

  getTagStats(tagName: string): TagStats | undefined {
    const normalizedTag = this.normalizeTag(tagName);
    const info = this.tags.get(normalizedTag);
    
    if (!info) {
      return undefined;
    }

    return {
      name: normalizedTag,
      fileCount: info.files.size,
      coOccurrences: Object.fromEntries(info.co_occurring_tags),
      created: info.created.toISOString(),
      lastSeen: info.last_seen.toISOString(),
      hierarchy: info.hierarchy || [],
    };
  }

  getTagSuggestions(existingTags: string[], content?: string): TagSuggestion[] {
    const suggestions: TagSuggestion[] = [];
    const normalizedExisting = new Set(this.normalizeTags(existingTags));

    for (const tag of normalizedExisting) {
      const coOccurring = this.getCoOccurringTags(tag);
      
      for (const [coTag, count] of coOccurring) {
        if (!normalizedExisting.has(coTag)) {
          suggestions.push({
            tag: coTag,
            score: count,
            reason: 'co_occurrence',
          });
        }
      }
    }

    const hierarchicalSuggestions = this.getHierarchicalSuggestions(existingTags);
    suggestions.push(...hierarchicalSuggestions);

    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  getCoOccurringTags(tagName: string, limit: number = 10): Array<[string, number]> {
    const normalizedTag = this.normalizeTag(tagName);
    const tagInfo = this.tags.get(normalizedTag);
    
    if (!tagInfo) {
      return [];
    }

    return Array.from(tagInfo.co_occurring_tags.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  }

  getTagHierarchy(tagName: string): string[] {
    const normalizedTag = this.normalizeTag(tagName);
    return normalizedTag.split(this.hierarchySeparator);
  }

  getChildTags(parentTag: string): string[] {
    const normalizedParent = this.normalizeTag(parentTag);
    const children: string[] = [];
    
    for (const tag of this.tags.keys()) {
      if (tag.startsWith(normalizedParent + this.hierarchySeparator) && 
          tag !== normalizedParent) {
        const remainder = tag.slice(normalizedParent.length + 1);
        if (!remainder.includes(this.hierarchySeparator)) {
          children.push(tag);
        }
      }
    }
    
    return children.sort();
  }

  getParentTags(childTag: string): string[] {
    const hierarchy = this.getTagHierarchy(childTag);
    const parents: string[] = [];
    
    for (let i = 1; i < hierarchy.length; i++) {
      parents.push(hierarchy.slice(0, i).join(this.hierarchySeparator));
    }
    
    return parents;
  }

  removeFile(filePath: string): void {
    this.removeTags(filePath);
    this.cleanupOrphanedTags();
  }

  getTagCount(): number {
    return this.tags.size;
  }

  clear(): void {
    this.tags.clear();
    this.logger.info('Tag engine cleared');
  }

  private addOrUpdateTag(tag: string, filePath: string, timestamp: Date): void {
    let tagInfo = this.tags.get(tag);
    
    if (!tagInfo) {
      tagInfo = {
        files: new Set(),
        co_occurring_tags: new Map(),
        created: timestamp,
        last_seen: timestamp,
        hierarchy: this.getTagHierarchy(tag),
      };
      this.tags.set(tag, tagInfo);
    }
    
    tagInfo.files.add(filePath);
    tagInfo.last_seen = timestamp;
  }

  private removeTagFromFile(tag: string, filePath: string): void {
    const tagInfo = this.tags.get(tag);
    if (tagInfo) {
      tagInfo.files.delete(filePath);
    }
  }

  private removeAllTagsFromFile(filePath: string): void {
    for (const tagInfo of this.tags.values()) {
      tagInfo.files.delete(filePath);
    }
  }

  private updateCoOccurrences(tag: string, coOccurringTags: string[]): void {
    const tagInfo = this.tags.get(tag);
    if (!tagInfo) return;

    for (const coTag of coOccurringTags) {
      const currentCount = tagInfo.co_occurring_tags.get(coTag) || 0;
      tagInfo.co_occurring_tags.set(coTag, currentCount + 1);
    }
  }

  private cleanupOrphanedTags(): void {
    const toDelete: string[] = [];
    
    for (const [tag, info] of this.tags) {
      if (info.files.size === 0) {
        toDelete.push(tag);
      }
    }
    
    for (const tag of toDelete) {
      this.tags.delete(tag);
    }
    
    if (toDelete.length > 0) {
      this.logger.debug({ deletedTags: toDelete }, 'Cleaned up orphaned tags');
    }
  }

  private normalizeTag(tag: string): string {
    return tag
      .toLowerCase()
      .trim()
      .replace(/^#/, '')
      .replace(/\s+/g, '-');
  }

  private normalizeTags(tags: string[]): string[] {
    return tags
      .map(tag => this.normalizeTag(tag))
      .filter(tag => tag.length > 0)
      .filter((tag, index, array) => array.indexOf(tag) === index);
  }

  private intersectSets(sets: Set<string>[]): string[] {
    if (sets.length === 0) return [];
    
    let result = new Set(sets[0]);
    
    for (let i = 1; i < sets.length; i++) {
      result = new Set([...result].filter(x => sets[i].has(x)));
    }
    
    return Array.from(result);
  }

  private unionSets(sets: Set<string>[]): string[] {
    const result = new Set<string>();
    
    for (const set of sets) {
      for (const item of set) {
        result.add(item);
      }
    }
    
    return Array.from(result);
  }

  private getHierarchicalSuggestions(existingTags: string[]): TagSuggestion[] {
    const suggestions: TagSuggestion[] = [];
    
    for (const tag of existingTags) {
      const parents = this.getParentTags(tag);
      const children = this.getChildTags(tag);
      
      for (const parent of parents) {
        if (this.tags.has(parent)) {
          suggestions.push({
            tag: parent,
            score: 5,
            reason: 'hierarchy',
          });
        }
      }
      
      for (const child of children) {
        suggestions.push({
          tag: child,
          score: 3,
          reason: 'hierarchy',
        });
      }
    }
    
    return suggestions;
  }
}