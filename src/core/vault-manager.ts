import { ConfigManager, VaultConfig, GlobalConfig } from '../utils/config.js';
import { FilesystemManager, FileInfo } from '../utils/filesystem.js';
import { MarkdownParser, ParsedMarkdown } from '../utils/markdown-parser.js';
import { FileMonitor } from './file-monitor.js';
import { Indexer } from './indexer.js';
import { TagEngine } from '../graph/tag-engine.js';
import { BacklinkEngine } from '../graph/backlink-engine.js';
import { TemplateEngine } from '../templates/template-engine.js';
import { Validator } from '../templates/validator.js';
import pino from 'pino';

export interface VaultInstance {
  name: string;
  config: VaultConfig;
  filesystem: FilesystemManager;
  parser: MarkdownParser;
  monitor: FileMonitor;
  indexer: Indexer;
  tagEngine: TagEngine;
  backlinkEngine: BacklinkEngine;
  templateEngine: TemplateEngine;
  validator: Validator;
}

export interface VaultFileData {
  info: FileInfo;
  parsed: ParsedMarkdown;
  tags: string[];
  links: Array<{ target: string; text: string; type: string }>;
}

export class VaultManagerError extends Error {
  constructor(
    message: string,
    public readonly vaultName: string,
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'VaultManagerError';
  }
}

export class VaultManager {
  private vaults = new Map<string, VaultInstance>();
  private logger = pino({ name: 'VaultManager' });
  private isInitialized = false;

  constructor(
    private config: ConfigManager
  ) {}

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.logger.info('Initializing vault manager');

    try {
      for (const [vaultName, vaultConfig] of this.config.vaults) {
        await this.initializeVault(vaultName, vaultConfig);
      }

      for (const vault of this.vaults.values()) {
        await vault.monitor.start();
        await vault.indexer.buildInitialIndex();
      }

      this.isInitialized = true;
      this.logger.info(`Initialized ${this.vaults.size} vaults`);
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize vault manager');
      throw new VaultManagerError(
        'Failed to initialize vault manager',
        'all',
        'initialize',
        error instanceof Error ? error : undefined
      );
    }
  }

  private async initializeVault(vaultName: string, vaultConfig: VaultConfig): Promise<void> {
    try {
      this.logger.info({ vaultName, path: vaultConfig.path }, 'Initializing vault');

      const defaultConfig = this.config.global.vaults.default_config;
      const mergedConfig = this.mergeVaultConfig(vaultConfig, defaultConfig);

      const filesystem = new FilesystemManager(vaultConfig.path);
      const parser = new MarkdownParser(
        mergedConfig.links.patterns,
        mergedConfig.tags.patterns
      );

      const monitor = new FileMonitor(
        vaultConfig.path,
        this.config.global.server.monitoring.debounce_ms
      );

      const tagEngine = new TagEngine();
      const backlinkEngine = new BacklinkEngine();
      const indexer = new Indexer(filesystem, parser, tagEngine, backlinkEngine);
      const templateEngine = new TemplateEngine(vaultConfig.templates || []);
      const validator = new Validator(vaultConfig.validation?.rules || []);

      monitor.on('fileChanged', async (filePath: string) => {
        await this.handleFileChange(vaultName, filePath);
      });

      monitor.on('fileDeleted', async (filePath: string) => {
        await this.handleFileDelete(vaultName, filePath);
      });

      const vault: VaultInstance = {
        name: vaultName,
        config: vaultConfig,
        filesystem,
        parser,
        monitor,
        indexer,
        tagEngine,
        backlinkEngine,
        templateEngine,
        validator,
      };

      this.vaults.set(vaultName, vault);
      this.logger.info({ vaultName }, 'Vault initialized successfully');
    } catch (error) {
      this.logger.error({ vaultName, error }, 'Failed to initialize vault');
      throw new VaultManagerError(
        `Failed to initialize vault: ${error instanceof Error ? error.message : 'Unknown error'}`,
        vaultName,
        'initialize',
        error instanceof Error ? error : undefined
      );
    }
  }

  private mergeVaultConfig(vaultConfig: VaultConfig, defaultConfig: Record<string, unknown>): Record<string, unknown> {
    return {
      frontmatter: { ...defaultConfig.frontmatter, ...vaultConfig.frontmatter },
      links: { ...defaultConfig.links, ...vaultConfig.links },
      tags: { ...defaultConfig.tags, ...vaultConfig.tags },
    };
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down vault manager');

    const shutdownPromises = Array.from(this.vaults.values()).map(async (vault) => {
      try {
        await vault.monitor.stop();
      } catch (error) {
        this.logger.error({ vault: vault.name, error }, 'Error stopping vault monitor');
      }
    });

    await Promise.all(shutdownPromises);
    this.vaults.clear();
    this.isInitialized = false;
    this.logger.info('Vault manager shut down');
  }

  getVault(vaultName?: string): VaultInstance {
    if (!this.isInitialized) {
      throw new VaultManagerError('Vault manager not initialized', vaultName || 'unknown', 'get');
    }

    if (!vaultName) {
      const firstVault = this.vaults.values().next().value;
      if (!firstVault) {
        throw new VaultManagerError('No vaults available', 'none', 'get');
      }
      return firstVault;
    }

    const vault = this.vaults.get(vaultName);
    if (!vault) {
      throw new VaultManagerError(`Vault not found: ${vaultName}`, vaultName, 'get');
    }

    return vault;
  }

  listVaults(): Array<{ name: string; path: string; fileCount: number }> {
    return Array.from(this.vaults.values()).map(vault => ({
      name: vault.name,
      path: vault.config.path,
      fileCount: vault.indexer.getFileCount(),
    }));
  }

  async readFile(filePath: string, vaultName?: string): Promise<VaultFileData> {
    const vault = this.getVault(vaultName);

    try {
      const info = await vault.filesystem.getFileInfo(filePath);
      if (!info.exists) {
        throw new VaultManagerError(`File not found: ${filePath}`, vault.name, 'read');
      }

      const content = await vault.filesystem.readFile(filePath);
      const parsed = vault.parser.parse(content, filePath);
      
      const frontmatterTags = Array.isArray(parsed.frontmatter.tags) 
        ? parsed.frontmatter.tags 
        : [];
      
      const allTags = vault.parser.extractTags(parsed.content, frontmatterTags);
      const links = vault.parser.extractLinks(parsed.content);

      return {
        info,
        parsed,
        tags: allTags.map(t => t.tag),
        links: links.map(l => ({ target: l.target, text: l.text, type: l.type })),
      };
    } catch (error) {
      if (error instanceof VaultManagerError) {
        throw error;
      }
      throw new VaultManagerError(
        `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        vault.name,
        'read',
        error instanceof Error ? error : undefined
      );
    }
  }

  async writeFile(filePath: string, content: string, vaultName?: string): Promise<void> {
    const vault = this.getVault(vaultName);

    try {
      const validationErrors = await vault.validator.validateContent(content, filePath);
      if (validationErrors.length > 0) {
        throw new VaultManagerError(
          `Validation failed: ${validationErrors.join(', ')}`,
          vault.name,
          'write'
        );
      }

      await vault.filesystem.writeFile(filePath, content);
      await this.handleFileChange(vault.name, filePath);
    } catch (error) {
      if (error instanceof VaultManagerError) {
        throw error;
      }
      throw new VaultManagerError(
        `Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        vault.name,
        'write',
        error instanceof Error ? error : undefined
      );
    }
  }

  async createFile(filePath: string, content?: string, vaultName?: string): Promise<string> {
    const vault = this.getVault(vaultName);

    try {
      const template = vault.templateEngine.getTemplateForPath(filePath);
      let finalContent = content || '';

      if (template) {
        finalContent = vault.templateEngine.applyTemplate(template, finalContent);
      }

      const sanitizedPath = vault.filesystem.ensureMarkdownExtension(
        vault.filesystem.sanitizeFilename(filePath)
      );

      await this.writeFile(sanitizedPath, finalContent, vaultName);
      return sanitizedPath;
    } catch (error) {
      throw new VaultManagerError(
        `Failed to create file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        vault.name,
        'create',
        error instanceof Error ? error : undefined
      );
    }
  }

  async listFiles(vaultName?: string, pattern?: string): Promise<FileInfo[]> {
    const vault = this.getVault(vaultName);

    try {
      const regex = pattern ? new RegExp(pattern) : undefined;
      return await vault.filesystem.listMarkdownFiles();
    } catch (error) {
      throw new VaultManagerError(
        `Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`,
        vault.name,
        'list',
        error instanceof Error ? error : undefined
      );
    }
  }

  async validateFile(filePath: string, vaultName?: string): Promise<string[]> {
    const vault = this.getVault(vaultName);

    try {
      const content = await vault.filesystem.readFile(filePath);
      return await vault.validator.validateContent(content, filePath);
    } catch (error) {
      throw new VaultManagerError(
        `Failed to validate file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        vault.name,
        'validate',
        error instanceof Error ? error : undefined
      );
    }
  }

  private async handleFileChange(vaultName: string, filePath: string): Promise<void> {
    const vault = this.vaults.get(vaultName);
    if (!vault) return;

    try {
      this.logger.debug({ vaultName, filePath }, 'Handling file change');
      
      if (vault.filesystem.isMarkdownFile(filePath)) {
        await vault.indexer.updateFile(filePath);
      }
    } catch (error) {
      this.logger.error({ vaultName, filePath, error }, 'Error handling file change');
    }
  }

  private async handleFileDelete(vaultName: string, filePath: string): Promise<void> {
    const vault = this.vaults.get(vaultName);
    if (!vault) return;

    try {
      this.logger.debug({ vaultName, filePath }, 'Handling file deletion');
      
      if (vault.filesystem.isMarkdownFile(filePath)) {
        await vault.indexer.removeFile(filePath);
      }
    } catch (error) {
      this.logger.error({ vaultName, filePath, error }, 'Error handling file deletion');
    }
  }

  getStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [name, vault] of this.vaults) {
      stats[name] = {
        fileCount: vault.indexer.getFileCount(),
        tagCount: vault.tagEngine.getTagCount(),
        linkCount: vault.backlinkEngine.getLinkCount(),
        backlinkCount: vault.backlinkEngine.getLinkCount(), // Same as linkCount for compatibility
        lastIndexed: vault.indexer.getLastIndexTime(),
      };
    }
    
    return stats;
  }
}