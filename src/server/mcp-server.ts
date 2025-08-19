import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { ConfigurationManager, ConfigManager } from '../utils/config.js';
import { VaultManager } from '../core/vault-manager.js';
import { SearchEngine } from '../core/search-engine.js';
import { GraphAnalyzer } from '../graph/graph-analyzer.js';
import { EmbeddingProvider } from '../embeddings/embedding-provider.js';
import { LocalEmbeddingProvider } from '../embeddings/local-provider.js';
import { OpenAIEmbeddingProvider } from '../embeddings/openai-provider.js';
import {
  createAllTools,
  ToolContext,
  handleSearchContent,
  handleSemanticSearch,
  handleTextSearch,
  handleReadFile,
  handleWriteFile,
  handleUpdateFile,
  handleCreateFile,
  handleDeleteFile,
  handleGetFileMetadata,
  handleGetTags,
  handleGetFilesByTag,
  handleGetBacklinks,
  handleFindRelated,
  handleGetGraphStats,
  handleFindShortestPath,
  handleGetBrokenLinks,
  handleAnalyzeCommunities,
  handleGetInfluentialFiles,
  handleListVaults,
  handleListFiles,
  handleValidateFile,
  handleSuggestTags,
  handleGetTemplates,
  handlePreviewTemplate,
  handleGetRecentFiles,
  handleBulkSearch,
  handleBulkValidate,
  handleReindexVault,
  handleBulkTagOperation,
  handleExportGraph,
  handleAnalyzeVaultHealth,
} from './tools/index.js';
import pino from 'pino';

export interface MCPServerOptions {
  configDir: string;
  vaultPaths: string[];
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  enablePerformanceMetrics?: boolean;
}

export class MCPMyceliumServer {
  private server: Server;
  private logger: pino.Logger;
  private config?: ConfigManager;
  private vaultManager?: VaultManager;
  private searchEngine?: SearchEngine;
  private graphAnalyzer?: GraphAnalyzer;
  private embeddingProvider?: EmbeddingProvider;
  private isInitialized = false;
  private performanceMetrics = new Map<string, { calls: number; totalTime: number; errors: number }>();

  constructor(private options: MCPServerOptions) {
    this.logger = pino({
      name: 'MCPMyceliumServer',
      level: options.logLevel || 'info',
      transport: options.logLevel === 'debug' ? {
        target: 'pino-pretty',
        options: { colorize: true },
      } : undefined,
    });

    this.server = new Server(
      {
        name: 'mcp-mycelium',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupServerHandlers();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('Server already initialized');
      return;
    }

    try {
      this.logger.info('Initializing MCP Mycelium Server');

      const configManager = new ConfigurationManager(
        this.options.configDir,
        this.options.vaultPaths
      );

      this.config = await configManager.load();
      this.logger.info({ vaults: this.config.vaults.size }, 'Configuration loaded');

      await this.initializeEmbeddingProvider();
      await this.initializeVaultManager();
      await this.initializeSearchEngine();
      await this.initializeGraphAnalyzer();

      this.isInitialized = true;
      this.logger.info('MCP Mycelium Server initialized successfully');

    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize server');
      throw new Error(`Server initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      this.logger.info('MCP Mycelium Server started');

      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());

    } catch (error) {
      this.logger.error({ error }, 'Failed to start server');
      throw new Error(`Server startup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down MCP Mycelium Server');

    try {
      if (this.vaultManager) {
        await this.vaultManager.shutdown();
      }

      if (this.embeddingProvider) {
        await this.embeddingProvider.dispose();
      }

      if (this.options.enablePerformanceMetrics) {
        this.logPerformanceMetrics();
      }

      this.logger.info('Server shutdown complete');
      process.exit(0);

    } catch (error) {
      this.logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  }

  private setupServerHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      if (!this.isInitialized) {
        throw new McpError(ErrorCode.InternalError, 'Server not initialized');
      }

      const tools = createAllTools(this.getToolContext());
      this.logger.debug({ toolCount: tools.length }, 'Listed tools');
      
      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!this.isInitialized) {
        throw new McpError(ErrorCode.InternalError, 'Server not initialized');
      }

      const { name, arguments: args } = request.params;
      const startTime = Date.now();
      
      try {
        this.logger.debug({ tool: name, args }, 'Executing tool');
        
        const result = await this.handleToolCall(name, args || {});
        
        if (this.options.enablePerformanceMetrics) {
          this.updateMetrics(name, Date.now() - startTime, false);
        }

        this.logger.debug({ tool: name, duration: Date.now() - startTime }, 'Tool execution completed');
        
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };

      } catch (error) {
        if (this.options.enablePerformanceMetrics) {
          this.updateMetrics(name, Date.now() - startTime, true);
        }

        this.logger.error({ tool: name, error, duration: Date.now() - startTime }, 'Tool execution failed');
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new McpError(ErrorCode.InternalError, `Tool '${name}' failed: ${errorMessage}`);
      }
    });
  }

  private async handleToolCall(name: string, args: any): Promise<any> {
    const context = this.getToolContext();

    switch (name) {
      // Search Tools
      case 'search_content':
        return handleSearchContent(args, context);
      case 'semantic_search':
        return handleSemanticSearch(args, context);
      case 'text_search':
        return handleTextSearch(args, context);

      // File Tools
      case 'read_file':
        return handleReadFile(args, context);
      case 'write_file':
        return handleWriteFile(args, context);
      case 'update_file':
        return handleUpdateFile(args, context);
      case 'create_file':
        return handleCreateFile(args, context);
      case 'delete_file':
        return handleDeleteFile(args, context);
      case 'get_file_metadata':
        return handleGetFileMetadata(args, context);

      // Graph Tools
      case 'get_tags':
        return handleGetTags(args, context);
      case 'get_files_by_tag':
        return handleGetFilesByTag(args, context);
      case 'get_backlinks':
        return handleGetBacklinks(args, context);
      case 'find_related':
        return handleFindRelated(args, context);
      case 'get_graph_stats':
        return handleGetGraphStats(args, context);
      case 'find_shortest_path':
        return handleFindShortestPath(args, context);
      case 'get_broken_links':
        return handleGetBrokenLinks(args, context);
      case 'analyze_communities':
        return handleAnalyzeCommunities(args, context);
      case 'get_influential_files':
        return handleGetInfluentialFiles(args, context);

      // Discovery Tools
      case 'list_vaults':
        return handleListVaults(args, context);
      case 'list_files':
        return handleListFiles(args, context);
      case 'validate_file':
        return handleValidateFile(args, context);
      case 'suggest_tags':
        return handleSuggestTags(args, context);
      case 'get_templates':
        return handleGetTemplates(args, context);
      case 'preview_template':
        return handlePreviewTemplate(args, context);
      case 'get_recent_files':
        return handleGetRecentFiles(args, context);

      // Bulk Tools
      case 'bulk_search':
        return handleBulkSearch(args, context);
      case 'bulk_validate':
        return handleBulkValidate(args, context);
      case 'reindex_vault':
        return handleReindexVault(args, context);
      case 'bulk_tag_operation':
        return handleBulkTagOperation(args, context);
      case 'export_graph':
        return handleExportGraph(args, context);
      case 'analyze_vault_health':
        return handleAnalyzeVaultHealth(args, context);

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  }

  private getToolContext(): ToolContext {
    if (!this.vaultManager || !this.searchEngine || !this.graphAnalyzer) {
      throw new McpError(ErrorCode.InternalError, 'Server components not initialized');
    }

    return {
      vaultManager: this.vaultManager,
      searchEngine: this.searchEngine,
      graphAnalyzer: this.graphAnalyzer,
    };
  }

  private async initializeEmbeddingProvider(): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    const embeddingConfig = this.config.global.server.embeddings;
    
    try {
      switch (embeddingConfig.provider) {
        case 'local':
          this.embeddingProvider = new LocalEmbeddingProvider({
            model: embeddingConfig.model,
            maxTokens: 8192,
            batchSize: 32,
          });
          break;

        case 'openai':
          if (!embeddingConfig.api_key) {
            this.logger.warn('OpenAI API key not provided, falling back to local embeddings');
            this.embeddingProvider = new LocalEmbeddingProvider({
              model: 'all-MiniLM-L6-v2',
              maxTokens: 8192,
              batchSize: 32,
            });
          } else {
            this.embeddingProvider = new OpenAIEmbeddingProvider({
              model: embeddingConfig.model,
              apiKey: embeddingConfig.api_key,
              maxTokens: 8191,
              batchSize: 100,
            });
          }
          break;

        default:
          throw new Error(`Unknown embedding provider: ${embeddingConfig.provider}`);
      }

      const isReady = await this.embeddingProvider.isReady();
      if (!isReady) {
        this.logger.warn('Embedding provider not ready, semantic search will be limited');
      } else {
        this.logger.info({ 
          provider: embeddingConfig.provider, 
          model: embeddingConfig.model 
        }, 'Embedding provider initialized');
      }

    } catch (error) {
      this.logger.warn({ error }, 'Failed to initialize embedding provider, continuing without embeddings');
      this.embeddingProvider = undefined;
    }
  }

  private async initializeVaultManager(): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    this.vaultManager = new VaultManager(this.config);
    await this.vaultManager.initialize();
    
    this.logger.info('Vault manager initialized');
  }

  private async initializeSearchEngine(): Promise<void> {
    if (!this.config || !this.vaultManager) {
      throw new Error('Dependencies not initialized');
    }

    const searchConfig = this.config.global.server.search;
    
    // Get engines from the first vault (they should be similar across vaults)
    const firstVault = this.vaultManager.listVaults()[0];
    if (!firstVault) {
      throw new Error('No vaults available');
    }

    const vault = this.vaultManager.getVault(firstVault.name);
    
    this.searchEngine = new SearchEngine(
      this.embeddingProvider,
      vault.tagEngine,
      vault.backlinkEngine,
      searchConfig.ranking_weights,
      searchConfig.max_results,
      searchConfig.similarity_threshold
    );

    this.logger.info('Search engine initialized');
  }

  private async initializeGraphAnalyzer(): Promise<void> {
    if (!this.vaultManager) {
      throw new Error('Vault manager not initialized');
    }

    const firstVault = this.vaultManager.listVaults()[0];
    if (!firstVault) {
      throw new Error('No vaults available');
    }

    const vault = this.vaultManager.getVault(firstVault.name);
    
    this.graphAnalyzer = new GraphAnalyzer(
      vault.tagEngine,
      vault.backlinkEngine
    );

    this.logger.info('Graph analyzer initialized');
  }

  private updateMetrics(toolName: string, duration: number, isError: boolean): void {
    const metrics = this.performanceMetrics.get(toolName) || { calls: 0, totalTime: 0, errors: 0 };
    
    metrics.calls++;
    metrics.totalTime += duration;
    if (isError) {
      metrics.errors++;
    }
    
    this.performanceMetrics.set(toolName, metrics);
  }

  private logPerformanceMetrics(): void {
    if (this.performanceMetrics.size === 0) {
      return;
    }

    this.logger.info('Performance Metrics Summary:');
    
    for (const [toolName, metrics] of this.performanceMetrics) {
      const avgTime = metrics.totalTime / metrics.calls;
      const errorRate = (metrics.errors / metrics.calls) * 100;
      
      this.logger.info({
        tool: toolName,
        calls: metrics.calls,
        averageTime: `${avgTime.toFixed(2)}ms`,
        totalTime: `${metrics.totalTime}ms`,
        errorRate: `${errorRate.toFixed(2)}%`,
      }, 'Tool metrics');
    }
  }

  getStats(): {
    initialized: boolean;
    vaults: number;
    tools: number;
    performanceMetrics: Map<string, any>;
  } {
    return {
      initialized: this.isInitialized,
      vaults: this.vaultManager?.listVaults().length || 0,
      tools: this.isInitialized ? createAllTools(this.getToolContext()).length : 0,
      performanceMetrics: this.performanceMetrics,
    };
  }
}