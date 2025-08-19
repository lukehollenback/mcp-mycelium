import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import yaml from 'js-yaml';
import Ajv from 'ajv';

export interface EmbeddingsConfig {
  provider: 'local' | 'openai';
  model: string;
  api_key?: string;
}

export interface MonitoringConfig {
  debounce_ms: number;
  batch_size: number;
}

export interface RankingWeights {
  semantic: number;
  tags: number;
  recency: number;
  backlinks: number;
}

export interface SearchConfig {
  max_results: number;
  similarity_threshold: number;
  ranking_weights: RankingWeights;
}

export interface ServerConfig {
  embeddings: EmbeddingsConfig;
  monitoring: MonitoringConfig;
  search: SearchConfig;
}

export interface FrontmatterConfig {
  date_format: string;
  required_fields: string[];
}

export interface LinkConfig {
  patterns: string[];
}

export interface TagConfig {
  patterns: string[];
  frontmatter?: string;
}

export interface VaultDefaultConfig {
  frontmatter: FrontmatterConfig;
  links: LinkConfig;
  tags: TagConfig;
}

export interface TemplateSchema {
  type: string;
  items?: TemplateSchema;
  minimum?: number;
  maximum?: number;
}

export interface TemplateFrontmatter {
  required: string[];
  schema: Record<string, TemplateSchema>;
}

export interface Template {
  pattern: string;
  frontmatter: TemplateFrontmatter;
  content_template?: string;
}

export interface ValidationRule {
  name: string;
  pattern: string;
  script: string;
  on?: string[];
}

export interface ValidationConfig {
  rules: ValidationRule[];
}

export interface VaultConfig {
  name: string;
  path: string;
  templates?: Template[];
  validation?: ValidationConfig;
  frontmatter?: Partial<FrontmatterConfig>;
  links?: Partial<LinkConfig>;
  tags?: Partial<TagConfig>;
}

export interface GlobalConfig {
  server: ServerConfig;
  vaults: {
    default_config: VaultDefaultConfig;
  };
}

export interface ConfigManager {
  global: GlobalConfig;
  vaults: Map<string, VaultConfig>;
}

const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  server: {
    embeddings: {
      provider: 'local',
      model: 'all-MiniLM-L6-v2',
    },
    monitoring: {
      debounce_ms: 1000,
      batch_size: 50,
    },
    search: {
      max_results: 100,
      similarity_threshold: 0.7,
      ranking_weights: {
        semantic: 0.4,
        tags: 0.3,
        recency: 0.2,
        backlinks: 0.1,
      },
    },
  },
  vaults: {
    default_config: {
      frontmatter: {
        date_format: 'YYYY-MM-DD',
        required_fields: ['created', 'modified'],
      },
      links: {
        patterns: [
          '\\[\\[([^\\]]+)\\]\\]',
          '\\[([^\\]]+)\\]\\(([^\\)]+\\.md)\\)',
        ],
      },
      tags: {
        patterns: ['#([a-zA-Z0-9_/-]+)'],
        frontmatter: 'tags',
      },
    },
  },
};

const globalConfigSchema = {
  type: 'object',
  required: ['server', 'vaults'],
  properties: {
    server: {
      type: 'object',
      required: ['embeddings', 'monitoring', 'search'],
      properties: {
        embeddings: {
          type: 'object',
          required: ['provider', 'model'],
          properties: {
            provider: { type: 'string', enum: ['local', 'openai'] },
            model: { type: 'string' },
            api_key: { type: 'string' },
          },
        },
        monitoring: {
          type: 'object',
          required: ['debounce_ms', 'batch_size'],
          properties: {
            debounce_ms: { type: 'number', minimum: 100 },
            batch_size: { type: 'number', minimum: 1 },
          },
        },
        search: {
          type: 'object',
          required: ['max_results', 'similarity_threshold', 'ranking_weights'],
          properties: {
            max_results: { type: 'number', minimum: 1 },
            similarity_threshold: { type: 'number', minimum: 0, maximum: 1 },
            ranking_weights: {
              type: 'object',
              required: ['semantic', 'tags', 'recency', 'backlinks'],
              properties: {
                semantic: { type: 'number', minimum: 0, maximum: 1 },
                tags: { type: 'number', minimum: 0, maximum: 1 },
                recency: { type: 'number', minimum: 0, maximum: 1 },
                backlinks: { type: 'number', minimum: 0, maximum: 1 },
              },
            },
          },
        },
      },
    },
    vaults: {
      type: 'object',
      required: ['default_config'],
      properties: {
        default_config: {
          type: 'object',
          required: ['frontmatter', 'links', 'tags'],
          properties: {
            frontmatter: {
              type: 'object',
              required: ['date_format', 'required_fields'],
              properties: {
                date_format: { type: 'string' },
                required_fields: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
            links: {
              type: 'object',
              required: ['patterns'],
              properties: {
                patterns: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
            tags: {
              type: 'object',
              required: ['patterns'],
              properties: {
                patterns: {
                  type: 'array',
                  items: { type: 'string' },
                },
                frontmatter: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};

const vaultConfigSchema = {
  type: 'object',
  required: ['name', 'path'],
  properties: {
    name: { type: 'string' },
    path: { type: 'string' },
    templates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['pattern', 'frontmatter'],
        properties: {
          pattern: { type: 'string' },
          frontmatter: {
            type: 'object',
            required: ['required', 'schema'],
            properties: {
              required: {
                type: 'array',
                items: { type: 'string' },
              },
              schema: { type: 'object' },
            },
          },
          content_template: { type: 'string' },
        },
      },
    },
    validation: {
      type: 'object',
      properties: {
        rules: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'pattern', 'script'],
            properties: {
              name: { type: 'string' },
              pattern: { type: 'string' },
              script: { type: 'string' },
              on: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};

export class ConfigurationManager {
  private ajv = new Ajv();
  private globalConfigValidator = this.ajv.compile(globalConfigSchema);
  private vaultConfigValidator = this.ajv.compile(vaultConfigSchema);

  constructor(
    private configDir: string,
    private vaultPaths: string[]
  ) {}

  async load(): Promise<ConfigManager> {
    const global = await this.loadGlobalConfig();
    const vaults = await this.loadVaultConfigs();
    
    return { global, vaults };
  }

  private async loadGlobalConfig(): Promise<GlobalConfig> {
    const settingsPath = join(this.configDir, 'settings.yaml');
    
    if (!existsSync(settingsPath)) {
      return DEFAULT_GLOBAL_CONFIG;
    }

    try {
      const content = readFileSync(settingsPath, 'utf8');
      const config = yaml.load(content) as GlobalConfig;
      
      if (!this.globalConfigValidator(config)) {
        throw new Error(`Invalid global configuration: ${this.ajv.errorsText(this.globalConfigValidator.errors)}`);
      }

      return this.mergeWithDefaults(config);
    } catch (error) {
      throw new Error(`Failed to load global configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async loadVaultConfigs(): Promise<Map<string, VaultConfig>> {
    const vaults = new Map<string, VaultConfig>();
    const vaultConfigsDir = join(this.configDir, 'vaults');
    
    for (const vaultPath of this.vaultPaths) {
      const vaultName = this.getVaultName(vaultPath);
      const configPath = join(vaultConfigsDir, `${vaultName}.yaml`);
      
      let vaultConfig: VaultConfig;
      
      if (existsSync(configPath)) {
        try {
          const content = readFileSync(configPath, 'utf8');
          const config = yaml.load(content) as VaultConfig;
          
          if (!this.vaultConfigValidator(config)) {
            throw new Error(`Invalid vault configuration for ${vaultName}: ${this.ajv.errorsText(this.vaultConfigValidator.errors)}`);
          }
          
          vaultConfig = config;
        } catch (error) {
          throw new Error(`Failed to load vault configuration for ${vaultName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        vaultConfig = {
          name: vaultName,
          path: resolve(vaultPath),
        };
      }
      
      vaults.set(vaultName, vaultConfig);
    }
    
    return vaults;
  }

  private mergeWithDefaults(config: Partial<GlobalConfig>): GlobalConfig {
    return {
      server: {
        embeddings: { ...DEFAULT_GLOBAL_CONFIG.server.embeddings, ...config.server?.embeddings },
        monitoring: { ...DEFAULT_GLOBAL_CONFIG.server.monitoring, ...config.server?.monitoring },
        search: {
          ...DEFAULT_GLOBAL_CONFIG.server.search,
          ...config.server?.search,
          ranking_weights: {
            ...DEFAULT_GLOBAL_CONFIG.server.search.ranking_weights,
            ...config.server?.search?.ranking_weights,
          },
        },
      },
      vaults: {
        default_config: {
          frontmatter: {
            ...DEFAULT_GLOBAL_CONFIG.vaults.default_config.frontmatter,
            ...config.vaults?.default_config?.frontmatter,
          },
          links: {
            ...DEFAULT_GLOBAL_CONFIG.vaults.default_config.links,
            ...config.vaults?.default_config?.links,
          },
          tags: {
            ...DEFAULT_GLOBAL_CONFIG.vaults.default_config.tags,
            ...config.vaults?.default_config?.tags,
          },
        },
      },
    };
  }

  private getVaultName(vaultPath: string): string {
    return vaultPath.split('/').pop() || 'unnamed-vault';
  }

  getVaultConfig(vaultName: string, global: GlobalConfig): VaultConfig & { merged: VaultDefaultConfig } {
    const config = global.vaults.default_config;
    const vaultConfig = { name: vaultName, path: vaultName };
    
    return {
      ...vaultConfig,
      merged: {
        frontmatter: { ...config.frontmatter, ...vaultConfig.frontmatter },
        links: { ...config.links, ...vaultConfig.links },
        tags: { ...config.tags, ...vaultConfig.tags },
      },
    };
  }

  resolveEnvVars(text: string): string {
    return text.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      return process.env[varName] || match;
    });
  }
}