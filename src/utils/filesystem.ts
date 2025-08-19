import { readFileSync, writeFileSync, statSync, readdirSync, existsSync } from 'fs';
import { resolve, join, relative, normalize, sep } from 'path';
import { promisify } from 'util';

export interface FileStats {
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
}

export interface FileInfo {
  path: string;
  relativePath: string;
  stats: FileStats;
  exists: boolean;
}

export class FilesystemError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly path: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'FilesystemError';
  }
}

export class FilesystemManager {
  constructor(private basePath: string) {
    this.basePath = normalize(resolve(basePath));
  }

  normalizePath(filePath: string): string {
    const normalized = normalize(filePath);
    
    if (normalized.includes('..')) {
      throw new FilesystemError(
        'Path traversal not allowed',
        'normalize',
        filePath
      );
    }
    
    return normalized.startsWith(sep) ? normalized : join(this.basePath, normalized);
  }

  validatePath(filePath: string): string {
    const normalizedPath = this.normalizePath(filePath);
    const resolvedPath = resolve(normalizedPath);
    const resolvedBase = resolve(this.basePath);
    
    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new FilesystemError(
        'Path outside vault boundaries',
        'validate',
        filePath
      );
    }
    
    return resolvedPath;
  }

  getRelativePath(filePath: string): string {
    const absolutePath = this.validatePath(filePath);
    return relative(this.basePath, absolutePath);
  }

  async readFile(filePath: string): Promise<string> {
    try {
      const validatedPath = this.validatePath(filePath);
      return readFileSync(validatedPath, 'utf8');
    } catch (error) {
      if (error instanceof FilesystemError) {
        throw error;
      }
      throw new FilesystemError(
        `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'read',
        filePath,
        error instanceof Error ? error : undefined
      );
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      const validatedPath = this.validatePath(filePath);
      writeFileSync(validatedPath, content, 'utf8');
    } catch (error) {
      if (error instanceof FilesystemError) {
        throw error;
      }
      throw new FilesystemError(
        `Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'write',
        filePath,
        error instanceof Error ? error : undefined
      );
    }
  }

  async getFileInfo(filePath: string): Promise<FileInfo> {
    try {
      const validatedPath = this.validatePath(filePath);
      const relativePath = this.getRelativePath(filePath);
      
      const exists = existsSync(validatedPath);
      if (!exists) {
        return {
          path: validatedPath,
          relativePath,
          exists: false,
          stats: {
            size: 0,
            created: new Date(0),
            modified: new Date(0),
            accessed: new Date(0),
          },
        };
      }
      
      const stats = statSync(validatedPath);
      return {
        path: validatedPath,
        relativePath,
        exists: true,
        stats: {
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          accessed: stats.atime,
        },
      };
    } catch (error) {
      if (error instanceof FilesystemError) {
        throw error;
      }
      throw new FilesystemError(
        `Failed to get file info: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'stat',
        filePath,
        error instanceof Error ? error : undefined
      );
    }
  }

  async listFiles(pattern?: RegExp): Promise<FileInfo[]> {
    try {
      const files: FileInfo[] = [];
      await this.walkDirectory(this.basePath, (filePath) => {
        const relativePath = relative(this.basePath, filePath);
        if (!pattern || pattern.test(relativePath)) {
          const stats = statSync(filePath);
          files.push({
            path: filePath,
            relativePath,
            exists: true,
            stats: {
              size: stats.size,
              created: stats.birthtime,
              modified: stats.mtime,
              accessed: stats.atime,
            },
          });
        }
      });
      return files;
    } catch (error) {
      throw new FilesystemError(
        `Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'list',
        this.basePath,
        error instanceof Error ? error : undefined
      );
    }
  }

  async listMarkdownFiles(): Promise<FileInfo[]> {
    return this.listFiles(/\.md$/i);
  }

  private async walkDirectory(dir: string, callback: (filePath: string) => void): Promise<void> {
    const items = readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = join(dir, item.name);
      
      if (item.isDirectory()) {
        if (!item.name.startsWith('.') && item.name !== 'node_modules') {
          await this.walkDirectory(fullPath, callback);
        }
      } else if (item.isFile()) {
        callback(fullPath);
      }
    }
  }

  sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  ensureMarkdownExtension(filename: string): string {
    return filename.endsWith('.md') ? filename : `${filename}.md`;
  }

  isMarkdownFile(filePath: string): boolean {
    return /\.md$/i.test(filePath);
  }

  generateTimestamp(): string {
    return new Date().toISOString();
  }

  formatDateForFrontmatter(date: Date, format: string): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    
    return format
      .replace('YYYY', String(year))
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hour)
      .replace('mm', minute)
      .replace('ss', second);
  }
}