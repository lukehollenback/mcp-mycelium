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

export interface EmbeddingProviderConfig {
  model: string;
  apiKey?: string;
  maxTokens?: number;
  batchSize?: number;
  timeout?: number;
}

export abstract class EmbeddingProvider {
  protected config: EmbeddingProviderConfig;

  constructor(config: EmbeddingProviderConfig) {
    this.config = config;
  }

  abstract async embed(text: string): Promise<EmbeddingResult>;
  
  abstract async embedBatch(texts: string[]): Promise<EmbeddingBatch>;
  
  abstract getDimension(): number;
  
  abstract getModel(): string;
  
  abstract isReady(): Promise<boolean>;

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

  protected validateEmbedding(embedding: number[]): void {
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Invalid embedding: must be non-empty array');
    }

    if (embedding.some(val => typeof val !== 'number' || !isFinite(val))) {
      throw new Error('Invalid embedding: contains non-numeric or infinite values');
    }
  }

  protected normalizeEmbedding(embedding: number[]): number[] {
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return magnitude === 0 ? embedding : embedding.map(val => val / magnitude);
  }

  protected chunkText(text: string, maxTokens: number = 512): string[] {
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

  protected estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async dispose(): Promise<void> {
  }
}

export class EmbeddingProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'EmbeddingProviderError';
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