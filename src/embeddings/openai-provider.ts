import { EmbeddingProvider, EmbeddingResult, EmbeddingBatch, EmbeddingVector, EmbeddingProviderError } from './embedding-provider.js';
import fetch from 'node-fetch';
import pino from 'pino';

interface OpenAIEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

export class OpenAIEmbeddingProvider extends EmbeddingProvider {
  private logger = pino({ name: 'OpenAIEmbeddingProvider' });
  private readonly apiUrl = 'https://api.openai.com/v1/embeddings';
  private modelDimensions: Record<string, number> = {
    'text-embedding-3-small': 1536,
    'text-embedding-3-large': 3072,
    'text-embedding-ada-002': 1536,
  };

  constructor(config: { model: string; apiKey: string; maxTokens?: number; batchSize?: number; timeout?: number }) {
    super(config);
    
    if (!config.apiKey) {
      throw new EmbeddingProviderError(
        'OpenAI API key is required',
        'openai',
        'constructor'
      );
    }
  }

  async embed(text: string): Promise<EmbeddingResult> {
    try {
      const response = await this.makeRequest([text]);
      
      if (response.data.length === 0) {
        throw new Error('No embedding returned from OpenAI API');
      }

      const embeddingData = response.data[0];
      this.validateEmbedding(embeddingData.embedding);

      return {
        embedding: {
          values: embeddingData.embedding,
          dimension: embeddingData.embedding.length,
        },
        tokens: response.usage.total_tokens,
        model: response.model,
      };
    } catch (error) {
      throw new EmbeddingProviderError(
        `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'openai',
        'embed',
        error instanceof Error ? error : undefined
      );
    }
  }

  async embedBatch(texts: string[]): Promise<EmbeddingBatch> {
    try {
      const batchSize = this.config.batchSize || 100;
      const embeddings: EmbeddingVector[] = [];
      let totalTokens = 0;

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const response = await this.makeRequest(batch);
        
        const batchEmbeddings = response.data
          .sort((a, b) => a.index - b.index)
          .map(item => {
            this.validateEmbedding(item.embedding);
            return {
              values: item.embedding,
              dimension: item.embedding.length,
            };
          });

        embeddings.push(...batchEmbeddings);
        totalTokens += response.usage.total_tokens;

        if (i + batchSize < texts.length) {
          await this.sleep(100);
        }
      }

      return {
        embeddings,
        totalTokens,
        model: this.config.model,
      };
    } catch (error) {
      throw new EmbeddingProviderError(
        `Failed to generate batch embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'openai',
        'embedBatch',
        error instanceof Error ? error : undefined
      );
    }
  }

  getDimension(): number {
    return this.modelDimensions[this.config.model] || 1536;
  }

  getModel(): string {
    return this.config.model;
  }

  async isReady(): Promise<boolean> {
    try {
      const testResponse = await this.makeRequest(['test'], true);
      return testResponse !== null;
    } catch {
      return false;
    }
  }

  private async makeRequest(texts: string[], isDryRun: boolean = false): Promise<OpenAIEmbeddingResponse> {
    const maxTokens = this.config.maxTokens || 8191;
    const truncatedTexts = texts.map(text => 
      this.truncateText(text, maxTokens)
    );

    const requestBody = {
      input: truncatedTexts,
      model: this.config.model,
      encoding_format: 'float',
    };

    const controller = new AbortController();
    const timeoutMs = this.config.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'mcp-mycelium/1.0.0',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json() as OpenAIErrorResponse;
        const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        
        this.logger.error({
          status: response.status,
          error: errorData.error,
          model: this.config.model,
        }, 'OpenAI API error');

        throw new Error(`OpenAI API error: ${errorMessage}`);
      }

      const data = await response.json() as OpenAIEmbeddingResponse;

      if (isDryRun) {
        this.logger.debug('OpenAI API connection test successful');
      } else {
        this.logger.debug({
          model: data.model,
          tokens: data.usage.total_tokens,
          embeddingCount: data.data.length,
        }, 'OpenAI embedding request completed');
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  private truncateText(text: string, maxTokens: number): string {
    const estimatedTokens = this.estimateTokens(text);
    
    if (estimatedTokens <= maxTokens) {
      return text;
    }

    const ratio = maxTokens / estimatedTokens;
    const truncatedLength = Math.floor(text.length * ratio * 0.9);
    
    return text.substring(0, truncatedLength);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getUsageStats(): Promise<{
    model: string;
    requestCount: number;
    totalTokens: number;
    estimatedCost: number;
  }> {
    return {
      model: this.config.model,
      requestCount: 0,
      totalTokens: 0,
      estimatedCost: 0,
    };
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.isReady();
      return true;
    } catch (error) {
      this.logger.error({ error }, 'OpenAI API key validation failed');
      return false;
    }
  }

  getSupportedModels(): string[] {
    return Object.keys(this.modelDimensions);
  }

  getModelInfo(model: string): { dimension: number; maxTokens: number; costPer1kTokens: number } | null {
    const costs: Record<string, number> = {
      'text-embedding-3-small': 0.00002,
      'text-embedding-3-large': 0.00013,
      'text-embedding-ada-002': 0.00010,
    };

    const maxTokens: Record<string, number> = {
      'text-embedding-3-small': 8191,
      'text-embedding-3-large': 8191,
      'text-embedding-ada-002': 8191,
    };

    if (!this.modelDimensions[model]) {
      return null;
    }

    return {
      dimension: this.modelDimensions[model],
      maxTokens: maxTokens[model] || 8191,
      costPer1kTokens: costs[model] || 0.0001,
    };
  }
}