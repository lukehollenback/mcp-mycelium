import pino from 'pino';

export interface LinkReference {
  target: string;
  text: string;
  line: number;
  type: 'wikilink' | 'markdown';
}

export interface BacklinkInfo {
  outgoing: LinkReference[];
  incoming: LinkReference[];
}

export interface BrokenLink {
  source: string;
  target: string;
  text: string;
  line: number;
  type: 'wikilink' | 'markdown';
  suggestions: string[];
}

export interface LinkStats {
  totalLinks: number;
  totalFiles: number;
  brokenLinks: number;
  orphanedFiles: number;
  hubFiles: Array<{ file: string; linkCount: number }>;
  authorityFiles: Array<{ file: string; incomingCount: number }>;
}

export class BacklinkEngineError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'BacklinkEngineError';
  }
}

export class BacklinkEngine {
  private backlinks = new Map<string, BacklinkInfo>();
  private logger = pino({ name: 'BacklinkEngine' });
  private fileExists = new Set<string>();

  constructor() {}

  updateFileLinks(filePath: string, links: LinkReference[]): void {
    try {
      this.removeFileLinks(filePath);
      this.addFileLinks(filePath, links);
      this.fileExists.add(filePath);
      
      this.logger.debug({ filePath, linkCount: links.length }, 'Updated file links');
    } catch (error) {
      throw new BacklinkEngineError(
        `Failed to update file links: ${error instanceof Error ? error.message : 'Unknown error'}`,
        filePath,
        'update',
        error instanceof Error ? error : undefined
      );
    }
  }

  addFileLinks(filePath: string, links: LinkReference[]): void {
    try {
      const normalizedPath = this.normalizePath(filePath);
      
      if (!this.backlinks.has(normalizedPath)) {
        this.backlinks.set(normalizedPath, { outgoing: [], incoming: [] });
      }

      const fileInfo = this.backlinks.get(normalizedPath)!;
      fileInfo.outgoing = [...links];

      for (const link of links) {
        const targetPath = this.resolveTargetPath(link.target, normalizedPath);
        this.addIncomingLink(targetPath, {
          target: normalizedPath,
          text: link.text,
          line: link.line,
          type: link.type,
        });
      }
    } catch (error) {
      throw new BacklinkEngineError(
        `Failed to add file links: ${error instanceof Error ? error.message : 'Unknown error'}`,
        filePath,
        'add',
        error instanceof Error ? error : undefined
      );
    }
  }

  removeFileLinks(filePath: string): void {
    try {
      const normalizedPath = this.normalizePath(filePath);
      const fileInfo = this.backlinks.get(normalizedPath);
      
      if (!fileInfo) {
        return;
      }

      for (const outgoingLink of fileInfo.outgoing) {
        const targetPath = this.resolveTargetPath(outgoingLink.target, normalizedPath);
        this.removeIncomingLink(targetPath, normalizedPath);
      }

      fileInfo.outgoing = [];
    } catch (error) {
      throw new BacklinkEngineError(
        `Failed to remove file links: ${error instanceof Error ? error.message : 'Unknown error'}`,
        filePath,
        'remove',
        error instanceof Error ? error : undefined
      );
    }
  }

  removeFile(filePath: string): void {
    try {
      const normalizedPath = this.normalizePath(filePath);
      
      this.removeFileLinks(normalizedPath);
      
      for (const [otherPath, info] of this.backlinks) {
        info.incoming = info.incoming.filter(link => link.target !== normalizedPath);
      }
      
      this.backlinks.delete(normalizedPath);
      this.fileExists.delete(normalizedPath);
      
      this.logger.debug({ filePath: normalizedPath }, 'Removed file from backlink index');
    } catch (error) {
      throw new BacklinkEngineError(
        `Failed to remove file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        filePath,
        'removeFile',
        error instanceof Error ? error : undefined
      );
    }
  }

  getBacklinks(filePath: string): BacklinkInfo {
    const normalizedPath = this.normalizePath(filePath);
    return this.backlinks.get(normalizedPath) || { outgoing: [], incoming: [] };
  }

  getOutgoingLinks(filePath: string): LinkReference[] {
    return this.getBacklinks(filePath).outgoing;
  }

  getIncomingLinks(filePath: string): LinkReference[] {
    return this.getBacklinks(filePath).incoming;
  }

  getBrokenLinks(): BrokenLink[] {
    const brokenLinks: BrokenLink[] = [];

    for (const [sourcePath, info] of this.backlinks) {
      for (const link of info.outgoing) {
        const targetPath = this.resolveTargetPath(link.target, sourcePath);
        
        if (!this.fileExists.has(targetPath)) {
          const suggestions = this.generateSuggestions(link.target);
          
          brokenLinks.push({
            source: sourcePath,
            target: link.target,
            text: link.text,
            line: link.line,
            type: link.type,
            suggestions,
          });
        }
      }
    }

    return brokenLinks;
  }

  getOrphanedFiles(): string[] {
    const orphaned: string[] = [];
    
    for (const [filePath, info] of this.backlinks) {
      if (info.incoming.length === 0) {
        orphaned.push(filePath);
      }
    }
    
    return orphaned;
  }

  getAllBacklinks(): Map<string, BacklinkInfo> {
    return new Map(this.backlinks);
  }

  getHubFiles(limit: number = 10): Array<{ file: string; linkCount: number }> {
    const hubs = Array.from(this.backlinks.entries())
      .map(([file, info]) => ({ file, linkCount: info.outgoing.length }))
      .sort((a, b) => b.linkCount - a.linkCount)
      .slice(0, limit);

    return hubs;
  }

  getAuthorityFiles(limit: number = 10): Array<{ file: string; incomingCount: number }> {
    const authorities = Array.from(this.backlinks.entries())
      .map(([file, info]) => ({ file, incomingCount: info.incoming.length }))
      .sort((a, b) => b.incomingCount - a.incomingCount)
      .slice(0, limit);

    return authorities;
  }

  findRelatedFiles(filePath: string, maxHops: number = 2): Map<string, number> {
    const normalizedPath = this.normalizePath(filePath);
    const related = new Map<string, number>();
    const visited = new Set<string>();
    
    this.traverseGraph(normalizedPath, 0, maxHops, visited, related);
    
    related.delete(normalizedPath);
    
    return related;
  }

  getShortestPath(fromPath: string, toPath: string, maxDepth: number = 6): string[] | null {
    const normalizedFrom = this.normalizePath(fromPath);
    const normalizedTo = this.normalizePath(toPath);
    
    if (normalizedFrom === normalizedTo) {
      return [normalizedFrom];
    }

    const queue: Array<{ path: string; route: string[] }> = [
      { path: normalizedFrom, route: [normalizedFrom] }
    ];
    const visited = new Set<string>([normalizedFrom]);

    while (queue.length > 0) {
      const { path, route } = queue.shift()!;
      
      if (route.length > maxDepth) {
        continue;
      }

      const info = this.backlinks.get(path);
      if (!info) continue;

      const neighbors = [
        ...info.outgoing.map(link => this.resolveTargetPath(link.target, path)),
        ...info.incoming.map(link => link.target)
      ];

      for (const neighbor of neighbors) {
        if (neighbor === normalizedTo) {
          return [...route, neighbor];
        }

        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ path: neighbor, route: [...route, neighbor] });
        }
      }
    }

    return null;
  }

  calculatePageRank(iterations: number = 20, dampingFactor: number = 0.85): Map<string, number> {
    const files = Array.from(this.backlinks.keys());
    const fileCount = files.length;
    
    if (fileCount === 0) {
      return new Map();
    }

    let ranks = new Map<string, number>();
    
    for (const file of files) {
      ranks.set(file, 1.0 / fileCount);
    }

    for (let i = 0; i < iterations; i++) {
      const newRanks = new Map<string, number>();
      
      for (const file of files) {
        newRanks.set(file, (1.0 - dampingFactor) / fileCount);
      }

      for (const [file, info] of this.backlinks) {
        const outgoingCount = info.outgoing.length;
        
        if (outgoingCount > 0) {
          const contribution = (ranks.get(file) || 0) * dampingFactor / outgoingCount;
          
          for (const link of info.outgoing) {
            const target = this.resolveTargetPath(link.target, file);
            const currentRank = newRanks.get(target) || 0;
            newRanks.set(target, currentRank + contribution);
          }
        }
      }
      
      ranks = newRanks;
    }

    return ranks;
  }

  getStats(): LinkStats {
    let totalLinks = 0;
    let brokenLinksCount = 0;

    for (const info of this.backlinks.values()) {
      totalLinks += info.outgoing.length;
    }

    const brokenLinks = this.getBrokenLinks();
    brokenLinksCount = brokenLinks.length;

    return {
      totalLinks,
      totalFiles: this.backlinks.size,
      brokenLinks: brokenLinksCount,
      orphanedFiles: this.getOrphanedFiles().length,
      hubFiles: this.getHubFiles(5),
      authorityFiles: this.getAuthorityFiles(5),
    };
  }

  getLinkCount(): number {
    let count = 0;
    for (const info of this.backlinks.values()) {
      count += info.outgoing.length;
    }
    return count;
  }

  clear(): void {
    this.backlinks.clear();
    this.fileExists.clear();
    this.logger.info('Backlink engine cleared');
  }

  registerFileExists(filePath: string): void {
    this.fileExists.add(this.normalizePath(filePath));
  }

  private addIncomingLink(targetPath: string, linkRef: LinkReference): void {
    if (!this.backlinks.has(targetPath)) {
      this.backlinks.set(targetPath, { outgoing: [], incoming: [] });
    }
    
    const targetInfo = this.backlinks.get(targetPath)!;
    targetInfo.incoming.push(linkRef);
  }

  private removeIncomingLink(targetPath: string, sourcePath: string): void {
    const targetInfo = this.backlinks.get(targetPath);
    if (targetInfo) {
      targetInfo.incoming = targetInfo.incoming.filter(link => link.target !== sourcePath);
    }
  }

  private traverseGraph(
    currentPath: string,
    currentHops: number,
    maxHops: number,
    visited: Set<string>,
    related: Map<string, number>
  ): void {
    if (currentHops >= maxHops) {
      return;
    }

    visited.add(currentPath);
    
    const info = this.backlinks.get(currentPath);
    if (!info) return;

    const neighbors = [
      ...info.outgoing.map(link => this.resolveTargetPath(link.target, currentPath)),
      ...info.incoming.map(link => link.target)
    ];

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        const distance = currentHops + 1;
        const existingDistance = related.get(neighbor);
        
        if (!existingDistance || distance < existingDistance) {
          related.set(neighbor, distance);
        }
        
        this.traverseGraph(neighbor, distance, maxHops, visited, related);
      }
    }
  }

  private generateSuggestions(brokenTarget: string): string[] {
    const suggestions: string[] = [];
    const targetLower = brokenTarget.toLowerCase();
    
    for (const existingFile of this.fileExists) {
      const existingLower = existingFile.toLowerCase();
      
      if (existingLower.includes(targetLower) || targetLower.includes(existingLower)) {
        suggestions.push(existingFile);
      }
    }
    
    return suggestions.slice(0, 5);
  }

  private resolveTargetPath(target: string, currentPath: string): string {
    if (target.startsWith('/')) {
      return this.normalizePath(target);
    }
    
    if (target.startsWith('./') || target.startsWith('../')) {
      const currentDir = currentPath.split('/').slice(0, -1);
      const targetParts = target.split('/');
      
      for (const part of targetParts) {
        if (part === '..') {
          currentDir.pop();
        } else if (part !== '.' && part !== '') {
          currentDir.push(part);
        }
      }
      
      return this.normalizePath(currentDir.join('/'));
    }
    
    const currentDir = currentPath.split('/').slice(0, -1);
    const targetPath = [...currentDir, target].join('/');
    return this.normalizePath(targetPath);
  }

  private normalizePath(path: string): string {
    return path
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/')
      .replace(/\/$/, '')
      .toLowerCase();
  }
}