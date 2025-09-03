export interface EmbeddingVector {
  values: number[];
  dimension: number;
}

export interface EmbeddingResult {
  embedding: EmbeddingVector;
  tokens?: number;
  model: string;
}

export interface EmbeddingBatch {
  embeddings: EmbeddingVector[];
  totalTokens?: number;
  model: string;
}

export interface SimilarityResult {
  score: number;
  index: number;
}

export interface OpenAIEmbeddingConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  batchSize?: number;
  timeout?: number;
}

export class EmbeddingError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

export class OpenAIEmbeddings {
  private config: OpenAIEmbeddingConfig;

  constructor(config: OpenAIEmbeddingConfig) {
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new EmbeddingError('OpenAI API key is required', 'constructor');
    }

    this.config = {
      maxTokens: 8192,
      batchSize: 100,
      timeout: 30000,
      ...config,
    };
  }

  async embed(text: string): Promise<EmbeddingResult> {
    if (!text || text.trim() === '') {
      throw new EmbeddingError('Text cannot be empty', 'embed');
    }

    const chunks = this.chunkText(text, this.config.maxTokens || 8192);
    
    if (chunks.length === 1) {
      return this.embedSingle(chunks[0]);
    }

    // For multiple chunks, embed each and average
    const results = await Promise.all(chunks.map(chunk => this.embedSingle(chunk)));
    const avgEmbedding = this.averageEmbeddings(results.map(r => r.embedding));
    
    return {
      embedding: avgEmbedding,
      tokens: results.reduce((sum, r) => sum + (r.tokens || 0), 0),
      model: this.config.model,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingBatch> {
    if (!texts || texts.length === 0) {
      throw new EmbeddingError('Texts array cannot be empty', 'embedBatch');
    }

    const batchSize = this.config.batchSize || 100;
    const batches: string[][] = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }

    const allResults: EmbeddingResult[] = [];
    
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(text => this.embed(text))
      );
      allResults.push(...batchResults);
    }

    return {
      embeddings: allResults.map(r => r.embedding),
      totalTokens: allResults.reduce((sum, r) => sum + (r.tokens || 0), 0),
      model: this.config.model,
    };
  }

  private async embedSingle(text: string): Promise<EmbeddingResult> {
    const url = 'https://api.openai.com/v1/embeddings';
    
    const requestBody = {
      input: text,
      model: this.config.model,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.config.timeout || 30000),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new EmbeddingError(
          `OpenAI API error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`,
          'embed'
        );
      }

      const data = await response.json();
      
      if (!data.data || !data.data[0] || !data.data[0].embedding) {
        throw new EmbeddingError('Invalid response from OpenAI API', 'embed');
      }

      const embedding = data.data[0].embedding;
      
      return {
        embedding: {
          values: embedding,
          dimension: embedding.length,
        },
        tokens: data.usage?.total_tokens,
        model: this.config.model,
      };
    } catch (error) {
      if (error instanceof EmbeddingError) {
        throw error;
      }
      
      throw new EmbeddingError(
        `Failed to embed text: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'embed',
        error instanceof Error ? error : undefined
      );
    }
  }

  getDimension(): number {
    // OpenAI model dimensions
    const dimensions: Record<string, number> = {
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      'text-embedding-ada-002': 1536,
    };

    return dimensions[this.config.model] || 1536;
  }

  getModel(): string {
    return this.config.model;
  }

  calculateCosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
    if (a.dimension !== b.dimension) {
      throw new Error(`Embedding dimensions don't match: ${a.dimension} vs ${b.dimension}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.dimension; i++) {
      dotProduct += a.values[i] * b.values[i];
      normA += a.values[i] * a.values[i];
      normB += b.values[i] * b.values[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  findMostSimilar(
    query: EmbeddingVector,
    candidates: EmbeddingVector[],
    threshold: number = 0.7,
    limit: number = 10
  ): SimilarityResult[] {
    const similarities: SimilarityResult[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const score = this.calculateCosineSimilarity(query, candidates[i]);
      
      if (score >= threshold) {
        similarities.push({ score, index: i });
      }
    }

    return similarities
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private chunkText(text: string, maxTokens: number): string[] {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const chunks: string[] = [];
    let currentChunk = '';
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      const potentialChunk = currentChunk + (currentChunk ? '. ' : '') + trimmedSentence;
      
      if (this.estimateTokens(potentialChunk) > maxTokens && currentChunk) {
        chunks.push(currentChunk);
        currentChunk = trimmedSentence;
      } else {
        currentChunk = potentialChunk;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks.length > 0 ? chunks : [text];
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private averageEmbeddings(embeddings: EmbeddingVector[]): EmbeddingVector {
    if (embeddings.length === 0) {
      throw new Error('Cannot average empty embeddings array');
    }

    const dimension = embeddings[0].dimension;
    const avgValues = new Array(dimension).fill(0);

    for (const embedding of embeddings) {
      if (embedding.dimension !== dimension) {
        throw new Error('All embeddings must have the same dimension for averaging');
      }
      
      for (let i = 0; i < dimension; i++) {
        avgValues[i] += embedding.values[i];
      }
    }

    for (let i = 0; i < dimension; i++) {
      avgValues[i] /= embeddings.length;
    }

    return {
      values: avgValues,
      dimension,
    };
  }

  async dispose(): Promise<void> {
    // No cleanup needed for OpenAI embeddings
  }
}

export interface EmbeddingCache {
  get(key: string): EmbeddingVector | undefined;
  set(key: string, embedding: EmbeddingVector): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
}

export class LRUEmbeddingCache implements EmbeddingCache {
  private cache = new Map<string, { embedding: EmbeddingVector; timestamp: number }>();
  
  constructor(private maxSize: number = 1000) {}

  get(key: string): EmbeddingVector | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      entry.timestamp = Date.now();
      return entry.embedding;
    }
    return undefined;
  }

  set(key: string, embedding: EmbeddingVector): void {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }
    
    this.cache.set(key, { embedding, timestamp: Date.now() });
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  private evictOldest(): void {
    let oldestKey = '';
    let oldestTime = Date.now();
    
    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}