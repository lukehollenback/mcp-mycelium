import matter from 'gray-matter';

export interface ParsedMarkdown {
  frontmatter: Record<string, any>;
  content: string;
  excerpt?: string;
}

export interface LinkMatch {
  type: 'wikilink' | 'markdown';
  target: string;
  text: string;
  line: number;
  start: number;
  end: number;
}

export interface TagMatch {
  tag: string;
  line: number;
  start: number;
  end: number;
}

export interface HeaderMatch {
  level: number;
  text: string;
  line: number;
  start: number;
  end: number;
}

export class MarkdownParseError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'MarkdownParseError';
  }
}

export class MarkdownParser {
  private linkPatterns: RegExp[];
  private tagPatterns: RegExp[];
  private headerPattern = /^(#{1,6})\s+(.+)$/gm;

  constructor(
    linkPatterns: string[] = [
      '\\[\\[([^\\]]+)\\]\\]',
      '\\[([^\\]]+)\\]\\(([^\\)]+\\.md)\\)',
    ],
    tagPatterns: string[] = ['#([a-zA-Z0-9_/-]+)']
  ) {
    this.linkPatterns = linkPatterns.map(pattern => new RegExp(pattern, 'g'));
    this.tagPatterns = tagPatterns.map(pattern => new RegExp(pattern, 'g'));
  }

  parse(content: string, filePath?: string): ParsedMarkdown {
    try {
      const parsed = matter(content);
      
      return {
        frontmatter: parsed.data || {},
        content: parsed.content,
        excerpt: parsed.excerpt,
      };
    } catch (error) {
      throw new MarkdownParseError(
        `Failed to parse markdown: ${error instanceof Error ? error.message : 'Unknown error'}`,
        filePath || 'unknown',
        error instanceof Error ? error : undefined
      );
    }
  }

  extractLinks(content: string): LinkMatch[] {
    const links: LinkMatch[] = [];
    const lines = content.split('\n');
    
    lines.forEach((line, lineIndex) => {
      this.linkPatterns.forEach(pattern => {
        pattern.lastIndex = 0;
        let match;
        
        while ((match = pattern.exec(line)) !== null) {
          const isWikilink = match[0].startsWith('[[');
          
          if (isWikilink) {
            const fullMatch = match[1];
            const parts = fullMatch.split('|');
            const target = parts[0].trim();
            const text = parts[1]?.trim() || target;
            
            links.push({
              type: 'wikilink',
              target,
              text,
              line: lineIndex + 1,
              start: match.index!,
              end: match.index! + match[0].length,
            });
          } else {
            const text = match[1];
            const target = match[2];
            
            links.push({
              type: 'markdown',
              target,
              text,
              line: lineIndex + 1,
              start: match.index!,
              end: match.index! + match[0].length,
            });
          }
        }
      });
    });
    
    return links;
  }

  extractTags(content: string, frontmatterTags?: string[]): TagMatch[] {
    const tags: TagMatch[] = [];
    const lines = content.split('\n');
    
    if (frontmatterTags) {
      frontmatterTags.forEach(tag => {
        tags.push({
          tag: tag.startsWith('#') ? tag.slice(1) : tag,
          line: 0,
          start: 0,
          end: 0,
        });
      });
    }
    
    lines.forEach((line, lineIndex) => {
      this.tagPatterns.forEach(pattern => {
        pattern.lastIndex = 0;
        let match;
        
        while ((match = pattern.exec(line)) !== null) {
          const tag = match[1];
          
          if (!tags.some(t => t.tag === tag)) {
            tags.push({
              tag,
              line: lineIndex + 1,
              start: match.index!,
              end: match.index! + match[0].length,
            });
          }
        }
      });
    });
    
    return tags;
  }

  extractHeaders(content: string): HeaderMatch[] {
    const headers: HeaderMatch[] = [];
    const lines = content.split('\n');
    
    lines.forEach((line, lineIndex) => {
      const match = /^(#{1,6})\s+(.+)$/.exec(line);
      if (match) {
        headers.push({
          level: match[1].length,
          text: match[2].trim(),
          line: lineIndex + 1,
          start: 0,
          end: line.length,
        });
      }
    });
    
    return headers;
  }

  splitIntoChunks(content: string, maxChunkSize: number = 1000): string[] {
    const chunks: string[] = [];
    const headers = this.extractHeaders(content);
    const lines = content.split('\n');
    
    if (headers.length === 0) {
      return this.splitByParagraphs(content, maxChunkSize);
    }
    
    let currentChunk = '';
    let currentHeader = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isHeader = /^#{1,6}\s+/.test(line);
      
      if (isHeader && currentChunk.length > 0) {
        if (currentChunk.length > maxChunkSize) {
          chunks.push(...this.splitByParagraphs(currentChunk, maxChunkSize));
        } else {
          chunks.push(currentChunk.trim());
        }
        currentChunk = currentHeader + '\n';
      }
      
      if (isHeader) {
        currentHeader = line;
      }
      
      currentChunk += line + '\n';
    }
    
    if (currentChunk.trim()) {
      if (currentChunk.length > maxChunkSize) {
        chunks.push(...this.splitByParagraphs(currentChunk, maxChunkSize));
      } else {
        chunks.push(currentChunk.trim());
      }
    }
    
    return chunks.filter(chunk => chunk.trim().length > 0);
  }

  private splitByParagraphs(content: string, maxChunkSize: number): string[] {
    const chunks: string[] = [];
    const paragraphs = content.split(/\n\s*\n/);
    
    let currentChunk = '';
    
    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = paragraph;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }

  generateMarkdown(frontmatter: Record<string, any>, content: string): string {
    if (Object.keys(frontmatter).length === 0) {
      return content;
    }
    
    return matter.stringify(content, frontmatter);
  }

  validateFrontmatter(frontmatter: Record<string, any>, requiredFields: string[]): string[] {
    const errors: string[] = [];
    
    for (const field of requiredFields) {
      if (!(field in frontmatter)) {
        errors.push(`Missing required field: ${field}`);
      } else if (frontmatter[field] === null || frontmatter[field] === undefined) {
        errors.push(`Field ${field} cannot be null or undefined`);
      }
    }
    
    return errors;
  }

  normalizeTags(tags: string[]): string[] {
    return tags
      .map(tag => tag.replace(/^#/, '').trim())
      .filter(tag => tag.length > 0)
      .map(tag => tag.toLowerCase())
      .filter((tag, index, array) => array.indexOf(tag) === index);
  }

  resolveWikilink(link: string, currentFilePath: string): string {
    const cleanLink = link.replace(/[\[\]]/g, '').split('|')[0].trim();
    
    if (cleanLink.includes('/')) {
      return cleanLink.endsWith('.md') ? cleanLink : `${cleanLink}.md`;
    }
    
    const pathParts = currentFilePath.split('/');
    pathParts.pop();
    pathParts.push(cleanLink.endsWith('.md') ? cleanLink : `${cleanLink}.md`);
    
    return pathParts.join('/');
  }

  extractPlainText(content: string): string {
    return content
      .replace(/!\[[^\]]*\]\([^\)]+\)/g, '')
      .replace(/\[[^\]]+\]\([^\)]+\)/g, '$1')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/#{1,6}\s+/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/---[\s\S]*?---/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}