#!/usr/bin/env node

import { Command } from 'commander';
import { MCPMyceliumServer } from './server/mcp-server.js';
import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import pino from 'pino';

const program = new Command();

program
  .name('mcp-mycelium')
  .description('A sophisticated Model Context Protocol server for managing markdown-based knowledge bases')
  .version('1.0.0');

program
  .argument('<vaults...>', 'One or more vault directories to manage')
  .option('-c, --config <dir>', 'Configuration directory', './config')
  .option('-l, --log-level <level>', 'Log level (debug, info, warn, error)', 'info')
  .option('-m, --metrics', 'Enable performance metrics', false)
  .option('-d, --dry-run', 'Validate configuration without starting server', false)
  .option('-v, --validate', 'Validate vaults and configuration', false)
  .action(async (vaults: string[], options) => {
    const logger = pino({
      name: 'mcp-mycelium-cli',
      level: options.logLevel,
      transport: options.logLevel === 'debug' ? {
        target: 'pino-pretty',
        options: { colorize: true },
      } : undefined,
    });

    try {
      const configDir = resolve(options.config);
      const vaultPaths = vaults.map(vault => resolve(vault));

      logger.info({
        configDir,
        vaultPaths,
        logLevel: options.logLevel,
        metrics: options.metrics,
      }, 'Starting MCP Mycelium Server');

      if (!existsSync(configDir)) {
        logger.info({ configDir }, 'Creating configuration directory');
        mkdirSync(configDir, { recursive: true });
        mkdirSync(resolve(configDir, 'vaults'), { recursive: true });
        mkdirSync(resolve(configDir, 'validators'), { recursive: true });
      }

      for (const vaultPath of vaultPaths) {
        if (!existsSync(vaultPath)) {
          logger.error({ vaultPath }, 'Vault directory does not exist');
          process.exit(1);
        }
      }

      if (options.validate) {
        await validateConfiguration(configDir, vaultPaths, logger);
        return;
      }

      const server = new MCPMyceliumServer({
        configDir,
        vaultPaths,
        logLevel: options.logLevel,
        enablePerformanceMetrics: options.metrics,
      });

      if (options.dryRun) {
        logger.info('Dry run mode: validating configuration only');
        await server.initialize();
        const stats = server.getStats();
        
        logger.info({
          initialized: stats.initialized,
          vaults: stats.vaults,
          tools: stats.tools,
        }, 'Configuration validation successful');
        
        return;
      }

      await server.start();

    } catch (error) {
      logger.error({ error }, 'Failed to start server');
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize a new vault with basic configuration')
  .argument('<vault-path>', 'Path to create the new vault')
  .option('-c, --config <dir>', 'Configuration directory', './config')
  .option('-t, --template <name>', 'Vault template to use', 'basic')
  .action(async (vaultPath: string, options) => {
    const logger = pino({ name: 'mcp-mycelium-init' });
    
    try {
      await initializeVault(resolve(vaultPath), resolve(options.config), options.template, logger);
      logger.info({ vaultPath, template: options.template }, 'Vault initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize vault');
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate vault configuration and content')
  .argument('<vaults...>', 'Vault directories to validate')
  .option('-c, --config <dir>', 'Configuration directory', './config')
  .option('-f, --fix', 'Attempt to auto-fix validation errors', false)
  .action(async (vaults: string[], options) => {
    const logger = pino({ name: 'mcp-mycelium-validate' });
    
    try {
      const configDir = resolve(options.config);
      const vaultPaths = vaults.map(vault => resolve(vault));
      
      const results = await validateConfiguration(configDir, vaultPaths, logger, options.fix);
      
      let hasErrors = false;
      for (const [vault, result] of results) {
        if (!result.valid) {
          hasErrors = true;
          logger.error({ vault, errors: result.errors }, 'Validation failed');
        } else {
          logger.info({ vault }, 'Validation passed');
        }
      }
      
      if (hasErrors) {
        process.exit(1);
      }
      
    } catch (error) {
      logger.error({ error }, 'Validation failed');
      process.exit(1);
    }
  });

program
  .command('reindex')
  .description('Force reindexing of vault content')
  .argument('<vaults...>', 'Vault directories to reindex')
  .option('-c, --config <dir>', 'Configuration directory', './config')
  .option('-e, --embeddings', 'Rebuild embeddings', false)
  .action(async (vaults: string[], options) => {
    const logger = pino({ name: 'mcp-mycelium-reindex' });
    
    try {
      await reindexVaults(vaults.map(v => resolve(v)), resolve(options.config), options.embeddings, logger);
      logger.info('Reindexing completed successfully');
    } catch (error) {
      logger.error({ error }, 'Reindexing failed');
      process.exit(1);
    }
  });

async function validateConfiguration(
  configDir: string,
  vaultPaths: string[],
  logger: pino.Logger,
  autoFix: boolean = false
): Promise<Map<string, { valid: boolean; errors: string[] }>> {
  const { ConfigurationManager } = await import('./utils/config.js');
  const { VaultManager } = await import('./core/vault-manager.js');
  
  const results = new Map<string, { valid: boolean; errors: string[] }>();
  
  try {
    const configManager = new ConfigurationManager(configDir, vaultPaths);
    const config = await configManager.load();
    
    const vaultManager = new VaultManager(config);
    await vaultManager.initialize();
    
    for (const vaultPath of vaultPaths) {
      const vaultName = vaultPath.split('/').pop() || 'unknown';
      logger.info({ vault: vaultName }, 'Validating vault');
      
      try {
        const vault = vaultManager.getVault(vaultName);
        const files = await vault.filesystem.listMarkdownFiles();
        
        let errors: string[] = [];
        let fixed = 0;
        
        for (const file of files) {
          try {
            const validationErrors = await vaultManager.validateFile(file.relativePath, vaultName);
            
            if (validationErrors.length > 0) {
              if (autoFix) {
                try {
                  const content = await vault.filesystem.readFile(file.relativePath);
                  const { content: fixedContent, applied } = await vault.validator.autoFix(content, file.relativePath);
                  
                  if (applied.length > 0) {
                    await vault.filesystem.writeFile(file.relativePath, fixedContent);
                    fixed++;
                    logger.info({ file: file.relativePath, fixes: applied }, 'Auto-fixed file');
                  } else {
                    errors.push(...validationErrors.map(e => `${file.relativePath}: ${e}`));
                  }
                } catch (fixError) {
                  errors.push(`${file.relativePath}: Failed to auto-fix - ${fixError instanceof Error ? fixError.message : 'Unknown error'}`);
                }
              } else {
                errors.push(...validationErrors.map(e => `${file.relativePath}: ${e}`));
              }
            }
          } catch (fileError) {
            errors.push(`${file.relativePath}: ${fileError instanceof Error ? fileError.message : 'Unknown error'}`);
          }
        }
        
        results.set(vaultName, {
          valid: errors.length === 0,
          errors,
        });
        
        if (autoFix && fixed > 0) {
          logger.info({ vault: vaultName, fixed }, 'Auto-fixed files');
        }
        
      } catch (vaultError) {
        results.set(vaultName, {
          valid: false,
          errors: [vaultError instanceof Error ? vaultError.message : 'Unknown error'],
        });
      }
    }
    
    await vaultManager.shutdown();
    
  } catch (error) {
    logger.error({ error }, 'Configuration validation failed');
    throw error;
  }
  
  return results;
}

async function initializeVault(vaultPath: string, configDir: string, template: string, logger: pino.Logger): Promise<void> {
  if (existsSync(vaultPath)) {
    throw new Error(`Vault directory already exists: ${vaultPath}`);
  }
  
  mkdirSync(vaultPath, { recursive: true });
  mkdirSync(configDir, { recursive: true });
  mkdirSync(resolve(configDir, 'vaults'), { recursive: true });
  
  const vaultName = vaultPath.split('/').pop() || 'vault';
  const welcomeContent = `---
title: Welcome to ${vaultName}
created: ${new Date().toISOString()}
modified: ${new Date().toISOString()}
tags: [welcome, getting-started]
---

# Welcome to Your Knowledge Base

This is your new knowledge base managed by MCP Mycelium. Here are some tips to get started:

## Getting Started

- Create new notes by linking to them: [[My First Note]]
- Use #tags to organize your content
- Link between notes to build a knowledge graph

## Features

- **Semantic Search**: Find content by meaning, not just keywords
- **Graph Analytics**: Discover connections between your notes
- **Templates**: Consistent structure for different types of content
- **Validation**: Ensure your content follows best practices

Happy note-taking!
`;
  
  const { writeFileSync } = await import('fs');
  writeFileSync(resolve(vaultPath, 'Welcome.md'), welcomeContent);
  
  const vaultConfig = {
    name: vaultName,
    path: vaultPath,
    templates: [
      {
        pattern: '^daily/\\d{4}-\\d{2}-\\d{2}\\.md$',
        frontmatter: {
          required: ['date', 'tags'],
          schema: {
            date: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
        content_template: `## Today's Focus\n\n## Accomplishments\n\n## Tomorrow's Plan\n`,
      },
    ],
    validation: {
      rules: [
        {
          name: 'required-frontmatter',
          pattern: '.*\\.md$',
          script: 'built-in',
        },
      ],
    },
  };
  
  const yaml = await import('js-yaml');
  writeFileSync(
    resolve(configDir, 'vaults', `${vaultName}.yaml`),
    yaml.dump(vaultConfig)
  );
  
  logger.info({ vaultPath, configPath: resolve(configDir, 'vaults', `${vaultName}.yaml`) }, 'Vault configuration created');
}

async function reindexVaults(vaultPaths: string[], configDir: string, includeEmbeddings: boolean, logger: pino.Logger): Promise<void> {
  const { ConfigurationManager } = await import('./utils/config.js');
  const { VaultManager } = await import('./core/vault-manager.js');
  
  const configManager = new ConfigurationManager(configDir, vaultPaths);
  const config = await configManager.load();
  
  const vaultManager = new VaultManager(config);
  await vaultManager.initialize();
  
  for (const vaultPath of vaultPaths) {
    const vaultName = vaultPath.split('/').pop() || 'unknown';
    logger.info({ vault: vaultName, includeEmbeddings }, 'Starting reindex');
    
    const vault = vaultManager.getVault(vaultName);
    await vault.indexer.reindexAll();
    
    const stats = vault.indexer.getStats();
    logger.info({
      vault: vaultName,
      files: stats.totalFiles,
      embeddings: stats.totalEmbeddings,
      duration: stats.indexBuildTime,
    }, 'Reindex completed');
  }
  
  await vaultManager.shutdown();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}