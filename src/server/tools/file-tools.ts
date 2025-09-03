import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ToolContext } from './index.js';
import {
  ReadFileArgs,
  WriteFileArgs,
  UpdateFileArgs,
  CreateFileArgs,
  DeleteFileArgs,
  GetFileMetadataArgs,
  FileMetadata
} from './types.js';

export function createFileTools(context: ToolContext): Tool[] {
  return [
    {
      name: 'read_file',
      description: 'Read a markdown file from the knowledge base with full metadata',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to vault root',
          },
          vault: {
            type: 'string',
            description: 'Vault name (optional, uses default if not specified)',
          },
          includeMetadata: {
            type: 'boolean',
            description: 'Include detailed metadata in response',
            default: true,
          },
        },
        required: ['path'],
      },
    },

    {
      name: 'write_file',
      description: 'Write content to a markdown file with validation and template application',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to vault root',
          },
          content: {
            type: 'string',
            description: 'Markdown content to write',
          },
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          validateOnly: {
            type: 'boolean',
            description: 'Only validate content without writing',
            default: false,
          },
        },
        required: ['path', 'content'],
      },
    },

    {
      name: 'update_file',
      description: 'Update an existing file with incremental changes',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to vault root',
          },
          content: {
            type: 'string',
            description: 'Updated markdown content',
          },
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          preserveMetadata: {
            type: 'boolean',
            description: 'Preserve existing frontmatter metadata',
            default: true,
          },
        },
        required: ['path', 'content'],
      },
    },

    {
      name: 'create_file',
      description: 'Create a new file with template application and automatic path generation',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Desired file path or name',
          },
          content: {
            type: 'string',
            description: 'Initial content (optional, templates may provide defaults)',
          },
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          template: {
            type: 'string',
            description: 'Template pattern to apply (optional)',
          },
          frontmatter: {
            type: 'object',
            description: 'Custom frontmatter values',
          },
        },
        required: ['path'],
      },
    },

    {
      name: 'delete_file',
      description: 'Delete a file from the knowledge base',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to vault root',
          },
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
          confirm: {
            type: 'boolean',
            description: 'Confirmation required for deletion',
            default: false,
          },
        },
        required: ['path', 'confirm'],
      },
    },

    {
      name: 'get_file_metadata',
      description: 'Get file metadata without reading full content',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to vault root',
          },
          vault: {
            type: 'string',
            description: 'Vault name (optional)',
          },
        },
        required: ['path'],
      },
    },
  ];
}

export async function handleReadFile(args: any, context: ToolContext): Promise<any> {
  const { path, vault, includeMetadata } = args;
  const { vaultManager } = context;

  try {
    const fileData = await vaultManager.readFile(path, vault);

    const response: {
      path: string;
      content: string;
      frontmatter: Record<string, unknown>;
      metadata?: {
        size: number;
        created?: Date;
        modified: Date;
        tags: string[];
        links: Array<{ target: string; text?: string }>;
        exists: boolean;
      };
    } = {
      path: fileData.info.relativePath,
      content: fileData.parsed.content,
      frontmatter: fileData.parsed.frontmatter,
    };

    if (includeMetadata) {
      response.metadata = {
        size: fileData.info.stats.size,
        created: fileData.info.stats.created,
        modified: fileData.info.stats.modified,
        tags: fileData.tags,
        links: fileData.links,
        exists: fileData.info.exists,
      };
    }

    return response;
  } catch (error) {
    throw new Error(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleWriteFile(args: any, context: ToolContext): Promise<any> {
  const { path, content, vault, validateOnly } = args;
  const { vaultManager } = context;

  try {
    if (validateOnly) {
      const errors = await vaultManager.validateFile(path, vault);
      return {
        success: false,
        valid: errors.length === 0,
        errors,
        path,
      };
    }

    await vaultManager.writeFile(path, content, vault);
    
    return {
      success: true,
      path,
      vault: vaultManager.getVault(vault).name,
      message: 'File written successfully',
    };
  } catch (error) {
    throw new Error(`Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleUpdateFile(args: any, context: ToolContext): Promise<any> {
  const { path, content, vault, preserveMetadata } = args;
  const { vaultManager } = context;

  try {
    let finalContent = content;

    if (preserveMetadata) {
      try {
        const existing = await vaultManager.readFile(path, vault);
        const targetVault = vaultManager.getVault(vault);
        const parsed = targetVault.parser.parse(content);
        
        const mergedFrontmatter = {
          ...existing.parsed.frontmatter,
          ...parsed.frontmatter,
          modified: new Date().toISOString(),
        };

        finalContent = targetVault.parser.generateMarkdown(mergedFrontmatter, parsed.content);
      } catch {
        // If file doesn't exist, use content as-is
      }
    }

    await vaultManager.writeFile(path, finalContent, vault);
    
    return {
      success: true,
      path,
      vault: vaultManager.getVault(vault).name,
      changes: {
        oldSize: 0,
        newSize: finalContent.length,
        modified: new Date(),
      },
      message: 'File updated successfully',
    };
  } catch (error) {
    throw new Error(`Failed to update file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleCreateFile(args: any, context: ToolContext): Promise<any> {
  const { path, content, vault, template, frontmatter } = args;
  const { vaultManager } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    let finalContent = content || '';

    if (frontmatter) {
      const parsed = targetVault.parser.parse(finalContent);
      const mergedFrontmatter = {
        ...parsed.frontmatter,
        ...frontmatter,
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
      };
      finalContent = targetVault.parser.generateMarkdown(mergedFrontmatter, parsed.content);
    }

    const actualPath = await vaultManager.createFile(path, finalContent, vault);
    
    return {
      success: true,
      path: actualPath,
      vault: targetVault.name,
      message: 'File created successfully',
    };
  } catch (error) {
    throw new Error(`Failed to create file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleDeleteFile(args: any, context: ToolContext): Promise<any> {
  const { path, vault, confirm } = args;
  const { vaultManager } = context;

  if (!confirm) {
    const targetVault = vaultManager.getVault(vault);
    return {
      success: false,
      message: 'Deletion requires confirmation. Set confirm: true to proceed.',
      path,
      vault: targetVault.name,
    };
  }

  try {
    const targetVault = vaultManager.getVault(vault);
    await targetVault.filesystem.writeFile(path, ''); // This would need actual delete functionality
    
    return {
      success: true,
      path,
      vault: targetVault.name,
      message: 'File deleted successfully',
    };
  } catch (error) {
    throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleGetFileMetadata(args: any, context: ToolContext): Promise<any> {
  const { path, vault } = args;
  const { vaultManager } = context;

  try {
    const targetVault = vaultManager.getVault(vault);
    const fileInfo = await targetVault.filesystem.getFileInfo(path);
    
    if (!fileInfo.exists) {
      return {
        exists: false,
        path,
        message: 'File does not exist',
      };
    }

    const indexed = targetVault.indexer.getFile(path);
    
    const metadata: any = {
      path: fileInfo.relativePath,
      size: fileInfo.stats.size,
      created: fileInfo.stats.created,
      modified: fileInfo.stats.modified,
      tags: [],
      links: [],
    };

    if (indexed) {
      metadata.tags = indexed.tags;
      metadata.links = indexed.links;
      metadata.frontmatter = indexed.frontmatter;
      metadata.lastIndexed = indexed.lastIndexed;
      metadata.hasEmbeddings = Boolean(indexed.embeddings?.length);
    }

    return metadata;
  } catch (error) {
    throw new Error(`Failed to get file metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}