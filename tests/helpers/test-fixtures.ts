import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export interface TestFile {
  path: string;
  content: string;
  frontmatter?: Record<string, any>;
}

export interface TestVault {
  name: string;
  path: string;
  files: TestFile[];
}

export class TestVaultManager {
  private vaults: TestVault[] = [];
  private tempDir: string;

  constructor() {
    this.tempDir = join(tmpdir(), 'mcp-mycelium-test-' + Date.now());
    mkdirSync(this.tempDir, { recursive: true });
  }

  createVault(name: string, files: TestFile[] = []): TestVault {
    const vaultPath = join(this.tempDir, name);
    mkdirSync(vaultPath, { recursive: true });

    const vault: TestVault = {
      name,
      path: vaultPath,
      files: [],
    };

    for (const file of files) {
      this.addFileToVault(vault, file);
    }

    this.vaults.push(vault);
    return vault;
  }

  addFileToVault(vault: TestVault, file: TestFile): void {
    const fullPath = join(vault.path, file.path);
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    
    if (dir !== vault.path) {
      mkdirSync(dir, { recursive: true });
    }

    let content = file.content;
    if (file.frontmatter && Object.keys(file.frontmatter).length > 0) {
      const frontmatterYaml = Object.entries(file.frontmatter)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join('\n');
      content = `---\n${frontmatterYaml}\n---\n\n${file.content}`;
    }

    writeFileSync(fullPath, content);
    vault.files.push(file);
  }

  cleanup(): void {
    if (existsSync(this.tempDir)) {
      rmSync(this.tempDir, { recursive: true, force: true });
    }
  }

  getTempDir(): string {
    return this.tempDir;
  }

  getConfigDir(): string {
    const configDir = join(this.tempDir, 'config');
    mkdirSync(configDir, { recursive: true });
    mkdirSync(join(configDir, 'vaults'), { recursive: true });
    mkdirSync(join(configDir, 'validators'), { recursive: true });
    return configDir;
  }
}

export const sampleFiles: TestFile[] = [
  {
    path: 'notes/getting-started.md',
    frontmatter: {
      title: 'Getting Started',
      created: '2024-01-01T00:00:00Z',
      modified: '2024-01-01T00:00:00Z',
      tags: ['tutorial', 'basics'],
    },
    content: `# Getting Started

Welcome to your knowledge base! This note will help you understand the basics.

## Key Concepts

- Use [[Linking Notes]] to connect ideas
- Add #tags to organize content
- Create templates for consistent structure

## Next Steps

1. Read about [[Advanced Features]]
2. Set up your first #project
3. Explore the graph view`,
  },
  {
    path: 'notes/linking-notes.md',
    frontmatter: {
      title: 'Linking Notes',
      created: '2024-01-02T00:00:00Z',
      modified: '2024-01-02T00:00:00Z',
      tags: ['tutorial', 'linking'],
    },
    content: `# Linking Notes

Links are the foundation of a knowledge graph. There are several ways to link notes:

## WikiLinks

Use double brackets: [[Getting Started]]

You can also use alias text: [[Getting Started|Start Here]]

## Markdown Links

Standard markdown links work too: [Advanced Features](./advanced-features.md)

## Benefits

- Creates connections between ideas
- Enables graph navigation
- Improves discoverability`,
  },
  {
    path: 'notes/advanced-features.md',
    frontmatter: {
      title: 'Advanced Features',
      created: '2024-01-03T00:00:00Z',
      modified: '2024-01-03T00:00:00Z',
      tags: ['advanced', 'features'],
    },
    content: `# Advanced Features

This note covers advanced functionality available in the system.

## Semantic Search

Find content by meaning, not just keywords. The system uses embeddings to understand context.

## Graph Analytics

- Centrality metrics
- Community detection  
- Path analysis

## Templates

Create consistent structures for different types of notes. See [[Getting Started]] for basics.

## Validation

Ensure content quality with configurable rules and automatic fixes.`,
  },
  {
    path: 'projects/project-alpha.md',
    frontmatter: {
      title: 'Project Alpha',
      created: '2024-01-04T00:00:00Z',
      modified: '2024-01-04T00:00:00Z',
      tags: ['project', 'alpha', 'active'],
      status: 'in-progress',
    },
    content: `# Project Alpha

A sample project to demonstrate organizational capabilities.

## Overview

This project showcases how to use the knowledge base for project management.

## Related Notes

- [[Getting Started]] - Foundation concepts
- [[Advanced Features]] - Technical capabilities

## Tasks

- [x] Set up project structure
- [ ] Create documentation
- [ ] Implement features

## Tags

This note uses multiple tags: #project #alpha #active`,
  },
  {
    path: 'daily/2024-01-01.md',
    frontmatter: {
      title: 'Daily Note - January 1, 2024',
      date: '2024-01-01',
      created: '2024-01-01T00:00:00Z',
      modified: '2024-01-01T00:00:00Z',
      tags: ['daily', 'reflection'],
    },
    content: `# Daily Note - January 1, 2024

## Today's Focus

- Set up knowledge base
- Create initial notes
- Learn the system

## Accomplishments

- Created [[Getting Started]] guide
- Established tagging system
- Set up project structure

## Tomorrow's Plan

- Add more content
- Explore [[Advanced Features]]
- Create project notes`,
  },
];

export function createMockEmbeddingProvider() {
  return {
    embed: async (text: string) => ({
      embedding: {
        values: Array.from({ length: 384 }, () => Math.random()),
        dimension: 384,
      },
      model: 'mock-model',
    }),
    embedBatch: async (texts: string[]) => ({
      embeddings: texts.map(() => ({
        values: Array.from({ length: 384 }, () => Math.random()),
        dimension: 384,
      })),
      model: 'mock-model',
    }),
    getDimension: () => 384,
    getModel: () => 'mock-model',
    isReady: async () => true,
    calculateCosineSimilarity: (a: any, b: any) => Math.random() * 0.5 + 0.5, // Return realistic similarity scores
    findMostSimilar: (queryEmbedding: any, fileEmbeddings: any[], limit: number = 10) => {
      // Return mock similar files with scores
      return fileEmbeddings.slice(0, Math.min(limit, fileEmbeddings.length)).map((embedding, index) => ({
        fileId: embedding.fileId || `file${index}`,
        score: Math.random() * 0.3 + 0.7, // High similarity scores for testing
        embedding: embedding,
      }));
    },
    dispose: async () => {},
  };
}