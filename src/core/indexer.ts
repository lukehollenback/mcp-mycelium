import { FilesystemManager, FileInfo } from '../utils/filesystem.js';
import { MarkdownParser } from '../utils/markdown-parser.js';
import { TagEngine } from '../graph/tag-engine.js';
import { BacklinkEngine } from '../graph/backlink-engine.js';
import { EmbeddingProvider, EmbeddingVector, LRUEmbeddingCache } from '../embeddings/embedding-provider.js';
import pino from 'pino';

export interface IndexedFile {
  path: string;
  relativePath: string;
  lastModified: Date;
  size: number;
  contentHash: string;
  frontmatter: Record<string, any>;
  content: string;
  plainText: string;
  chunks: string[];
  tags: string[];
  links: Array<{
    target: string;
    text: string;
    type: 'wikilink' | 'markdown';
    line: number;
  }>;
  embeddings?: EmbeddingVector[];
  lastIndexed: Date;
}

export interface IndexStats {
  totalFiles: number;
  indexedFiles: number;
  totalSize: number;
  totalEmbeddings: number;
  lastIndexTime: Date;
  indexBuildTime: number;
}

export class IndexerError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'IndexerError';
  }
}

export class Indexer {
  private files = new Map<string, IndexedFile>();
  private logger = pino({ name: 'Indexer' });
  private embeddingProvider?: EmbeddingProvider;
  private embeddingCache = new LRUEmbeddingCache(1000);
  private isBuilding = false;
  private lastIndexTime = new Date(0);
  private indexBuildStartTime = 0;

  constructor(
    private _filesystem: FilesystemManager,
    private _parser: MarkdownParser,
    private _tagEngine: TagEngine,
    private _backlinkEngine: BacklinkEngine,
    embeddingProvider?: EmbeddingProvider
  ) {
    this.embeddingProvider = embeddingProvider;
  }

  async buildInitialIndex(): Promise<void> {
    if (this.isBuilding) {
      this.logger.warn('Index build already in progress');
      return;
    }

    this.isBuilding = true;
    this.indexBuildStartTime = Date.now();

    try {
      this.logger.info('Starting initial index build');

      const files = await this._filesystem.listMarkdownFiles();
      
      this.logger.info({ fileCount: files.length }, 'Found markdown files');

      for (const fileInfo of files) {
        try {
          await this.indexFile(fileInfo);
        } catch (error) {
          this.logger.error({ 
            file: fileInfo.relativePath, 
            error 
          }, 'Failed to index file during initial build');
        }
      }

      await this.buildEmbeddings();

      this.lastIndexTime = new Date();
      this.logger.info({ 
        fileCount: this.files.size,
        duration: Date.now() - this.indexBuildStartTime 
      }, 'Initial index build completed');

    } catch (error) {
      this.logger.error({ error }, 'Failed to build initial index');
      throw new IndexerError(
        `Failed to build initial index: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'all',
        'buildInitial',
        error instanceof Error ? error : undefined
      );
    } finally {
      this.isBuilding = false;
    }
  }

  async updateFile(filePath: string): Promise<void> {
    try {
      const fileInfo = await this._filesystem.getFileInfo(filePath);
      
      if (!fileInfo.exists) {
        await this.removeFile(filePath);
        return;
      }

      const existing = this.files.get(fileInfo.relativePath);
      
      if (existing && existing.lastModified >= fileInfo.stats.modified) {
        this.logger.debug({ file: fileInfo.relativePath }, 'File not modified, skipping update');
        return;
      }

      await this.indexFile(fileInfo);
      this.logger.debug({ file: fileInfo.relativePath }, 'File updated in index');

    } catch (error) {
      this.logger.error({ file: filePath, error }, 'Failed to update file');
      throw new IndexerError(
        `Failed to update file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        filePath,
        'update',
        error instanceof Error ? error : undefined
      );
    }
  }

  async removeFile(filePath: string): Promise<void> {
    try {
      const relativePath = this._filesystem.getRelativePath(filePath);
      const existing = this.files.get(relativePath);
      
      if (!existing) {
        return;
      }

      this._tagEngine.removeTags(relativePath);
      this._backlinkEngine.removeFile(relativePath);
      this.files.delete(relativePath);

      this.logger.debug({ file: relativePath }, 'File removed from index');

    } catch (error) {
      this.logger.error({ file: filePath, error }, 'Failed to remove file');
      throw new IndexerError(
        `Failed to remove file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        filePath,
        'remove',
        error instanceof Error ? error : undefined
      );
    }
  }

  async reindexAll(): Promise<void> {
    this.logger.info('Starting full reindex');
    
    this.files.clear();
    this._tagEngine.clear();
    this._backlinkEngine.clear();
    this.embeddingCache.clear();

    await this.buildInitialIndex();
  }

  getFile(filePath: string): IndexedFile | undefined {
    const relativePath = this._filesystem.getRelativePath(filePath);
    return this.files.get(relativePath);
  }

  getAllFiles(): IndexedFile[] {
    return Array.from(this.files.values());
  }

  getFilesByTag(tags: string[]): IndexedFile[] {
    const filePaths = this._tagEngine.getFilesByTags(tags);
    return filePaths.map(path => this.files.get(path)).filter(Boolean) as IndexedFile[];
  }

  searchFiles(query: string): IndexedFile[] {
    const lowerQuery = query.toLowerCase();
    const results: IndexedFile[] = [];

    for (const file of this.files.values()) {
      if (file.plainText.toLowerCase().includes(lowerQuery) ||
          file.frontmatter.title?.toLowerCase().includes(lowerQuery) ||
          file.tags.some(tag => tag.toLowerCase().includes(lowerQuery))) {
        results.push(file);
      }
    }

    return results;
  }

  getStats(): IndexStats {
    let totalSize = 0;
    let totalEmbeddings = 0;

    for (const file of this.files.values()) {
      totalSize += file.size;
      if (file.embeddings) {
        totalEmbeddings += file.embeddings.length;
      }
    }

    return {
      totalFiles: this.files.size,
      indexedFiles: this.files.size,
      totalSize,
      totalEmbeddings,
      lastIndexTime: this.lastIndexTime,
      indexBuildTime: this.isBuilding ? Date.now() - this.indexBuildStartTime : 0,
    };
  }

  getFileCount(): number {
    return this.files.size;
  }

  getLastIndexTime(): Date {
    return this.lastIndexTime;
  }

  async setEmbeddingProvider(provider: EmbeddingProvider): Promise<void> {
    this.embeddingProvider = provider;
    await this.buildEmbeddings();
  }

  async getFileEmbeddings(filePath: string): Promise<EmbeddingVector[]> {
    const file = this.getFile(filePath);
    if (!file) {
      throw new IndexerError('File not found in index', filePath, 'getEmbeddings');
    }

    if (file.embeddings) {
      return file.embeddings;
    }

    if (!this.embeddingProvider) {
      throw new IndexerError('No embedding provider available', filePath, 'getEmbeddings');
    }

    const embeddings = await this.generateEmbeddings(file.chunks);
    file.embeddings = embeddings;
    
    return embeddings;
  }

  private async indexFile(fileInfo: FileInfo): Promise<void> {
    const content = await this._filesystem.readFile(fileInfo.path);
    const parsed = this._parser.parse(content, fileInfo.path);
    
    const contentHash = this.generateContentHash(content);
    const plainText = this._parser.extractPlainText(parsed.content);
    const chunks = this._parser.splitIntoChunks(plainText);
    
    const frontmatterTags = Array.isArray(parsed.frontmatter.tags) 
      ? parsed.frontmatter.tags 
      : [];
    const allTags = this._parser.extractTags(parsed.content, frontmatterTags);
    const links = this._parser.extractLinks(parsed.content);

    const indexedFile: IndexedFile = {
      path: fileInfo.path,
      relativePath: fileInfo.relativePath,
      lastModified: fileInfo.stats.modified,
      size: fileInfo.stats.size,
      contentHash,
      frontmatter: parsed.frontmatter,
      content: parsed.content,
      plainText,
      chunks,
      tags: allTags.map(t => t.tag),
      links: links.map(l => ({
        target: l.target,
        text: l.text,
        type: l.type,
        line: l.line,
      })),
      lastIndexed: new Date(),
    };

    this.files.set(fileInfo.relativePath, indexedFile);

    this._tagEngine.updateFileTags(fileInfo.relativePath, indexedFile.tags);
    
    this._backlinkEngine.updateFileLinks(fileInfo.relativePath, indexedFile.links.map(l => ({
      target: l.target,
      text: l.text,
      line: l.line,
      type: l.type,
    })));

    this._backlinkEngine.registerFileExists(fileInfo.relativePath);
  }

  private async buildEmbeddings(): Promise<void> {
    if (!this.embeddingProvider) {
      this.logger.debug('No embedding provider, skipping embedding generation');
      return;
    }

    this.logger.info('Building embeddings for indexed files');

    const filesToEmbed = Array.from(this.files.values()).filter(f => !f.embeddings);
    
    if (filesToEmbed.length === 0) {
      this.logger.debug('All files already have embeddings');
      return;
    }

    let processed = 0;
    for (const file of filesToEmbed) {
      try {
        file.embeddings = await this.generateEmbeddings(file.chunks);
        processed++;
        
        if (processed % 10 === 0) {
          this.logger.debug({ processed, total: filesToEmbed.length }, 'Embedding progress');
        }
      } catch (error) {
        this.logger.error({ 
          file: file.relativePath, 
          error 
        }, 'Failed to generate embeddings for file');
      }
    }

    this.logger.info({ processed }, 'Embedding generation completed');
  }

  private async generateEmbeddings(chunks: string[]): Promise<EmbeddingVector[]> {
    if (!this.embeddingProvider) {
      return [];
    }

    const embeddings: EmbeddingVector[] = [];

    for (const chunk of chunks) {
      const cacheKey = this.generateCacheKey(chunk);
      let embedding = this.embeddingCache.get(cacheKey);

      if (!embedding) {
        const result = await this.embeddingProvider.embed(chunk);
        embedding = result.embedding;
        this.embeddingCache.set(cacheKey, embedding);
      }

      embeddings.push(embedding);
    }

    return embeddings;
  }

  private generateContentHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private generateCacheKey(text: string): string {
    if (!this.embeddingProvider) {
      return '';
    }
    return `${this.embeddingProvider.getModel()}:${this.generateContentHash(text)}`;
  }
}