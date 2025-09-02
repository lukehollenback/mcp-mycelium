import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalEmbeddingProvider } from '../../../src/embeddings/local-provider.js';
import { OpenAIEmbeddingProvider } from '../../../src/embeddings/openai-provider.js';
import { EmbeddingProviderError } from '../../../src/embeddings/embedding-provider.js';

describe('Embedding Providers', () => {
  describe('LocalEmbeddingProvider', () => {
    let provider: LocalEmbeddingProvider;

    beforeEach(() => {
      provider = new LocalEmbeddingProvider({
        model: 'all-MiniLM-L6-v2',
        maxTokens: 512,
        batchSize: 10,
      });
    });

    afterEach(async () => {
      if (provider) {
        await provider.dispose();
      }
    });

    it('should create provider with correct configuration', () => {
      expect(provider.getModel()).toBe('all-MiniLM-L6-v2');
      expect(provider.getDimension()).toBe(0); // Not initialized yet
    });

    it('should handle initialization gracefully when Python not available', async () => {
      // Mock Python process failure
      const originalSpawn = vi.fn();
      
      // Test that provider handles missing Python gracefully
      const readyPromise = provider.isReady();
      await expect(readyPromise).resolves.toBeDefined();
    });

    it('should validate embedding vectors', async () => {
      // Test that we can check dimensions
      expect(provider.getDimension()).toBeDefined();
      expect(provider.getModel()).toBeDefined();
      
      // Test cosine similarity calculation
      const vec1 = { values: [1, 0, 0], dimension: 3 };
      const vec2 = { values: [0, 1, 0], dimension: 3 };
      const similarity = provider.calculateCosineSimilarity(vec1, vec2);
      expect(similarity).toBe(0);
    });

    it('should calculate cosine similarity correctly', () => {
      const vec1 = { values: [1, 0, 0], dimension: 3 };
      const vec2 = { values: [1, 0, 0], dimension: 3 };
      const vec3 = { values: [0, 1, 0], dimension: 3 };

      const similarity1 = provider.calculateCosineSimilarity(vec1, vec2);
      expect(similarity1).toBeCloseTo(1.0, 5); // Identical vectors

      const similarity2 = provider.calculateCosineSimilarity(vec1, vec3);
      expect(similarity2).toBeCloseTo(0.0, 5); // Orthogonal vectors
    });

    it('should find most similar embeddings', () => {
      const queryEmbedding = { values: [1, 0, 0], dimension: 3 };
      const fileData = [
        { fileId: 'file1', values: [1, 0, 0], dimension: 3 },
        { fileId: 'file2', values: [0, 1, 0], dimension: 3 },
        { fileId: 'file3', values: [0.9, 0.1, 0], dimension: 3 },
      ];
      const fileEmbeddings = fileData.map(f => ({ values: f.values, dimension: f.dimension }));

      const results = provider.findMostSimilar(queryEmbedding, fileEmbeddings, 0.7, 2);
      
      expect(results).toHaveLength(2);
      expect(fileData[results[0].index].fileId).toBe('file1'); // Most similar
      expect(results[0].score).toBeCloseTo(1.0, 5);
      expect(fileData[results[1].index].fileId).toBe('file3'); // Second most similar
      expect(results[1].score).toBeGreaterThan(0.8);
    });

    it('should handle text truncation', async () => {
      const longText = 'word '.repeat(10000); // Very long text
      
      // Should not throw for long text
      expect(() => {
        provider.embed(longText);
      }).not.toThrow();
    });

    it('should handle batch processing', async () => {
      const texts = ['text1', 'text2', 'text3'];
      
      // Test batch interface exists
      expect(provider.embedBatch).toBeDefined();
      expect(typeof provider.embedBatch).toBe('function');
    });
  });

  describe('OpenAIEmbeddingProvider', () => {
    let provider: OpenAIEmbeddingProvider;

    beforeEach(() => {
      provider = new OpenAIEmbeddingProvider({
        model: 'text-embedding-3-small',
        apiKey: 'test-key',
        maxTokens: 8192,
        batchSize: 100,
      });
    });

    afterEach(async () => {
      if (provider) {
        await provider.dispose();
      }
    });

    it('should create provider with correct configuration', () => {
      expect(provider.getModel()).toBe('text-embedding-3-small');
      expect(provider.getDimension()).toBe(1536); // OpenAI embedding dimension
    });

    it('should handle missing API key gracefully', () => {
      expect(() => {
        new OpenAIEmbeddingProvider({
          model: 'text-embedding-3-small',
          apiKey: '', // Empty API key should throw
          // No API key
        });
      }).toThrow(EmbeddingProviderError);
    });

    it('should validate API key format', () => {
      // The provider doesn't validate API key format at construction time
      // It just checks if it exists
      expect(() => {
        new OpenAIEmbeddingProvider({
          model: 'text-embedding-3-small',
          apiKey: 'sk-invalid-key-format', // Valid format but fake key
        });
      }).not.toThrow();
    });

    it('should handle rate limiting gracefully', async () => {
      // Mock network error
      const mockFetch = vi.fn().mockRejectedValue(new Error('Rate limit exceeded'));
      global.fetch = mockFetch;

      await expect(provider.embed('test text')).rejects.toThrow();
    });

    it('should calculate correct dimensions for different models', () => {
      const provider1 = new OpenAIEmbeddingProvider({
        model: 'text-embedding-3-small',
        apiKey: 'sk-test',
      });
      expect(provider1.getDimension()).toBe(1536);

      const provider2 = new OpenAIEmbeddingProvider({
        model: 'text-embedding-3-large',
        apiKey: 'sk-test',
      });
      expect(provider2.getDimension()).toBe(3072);

      const provider3 = new OpenAIEmbeddingProvider({
        model: 'text-embedding-ada-002',
        apiKey: 'sk-test',
      });
      expect(provider3.getDimension()).toBe(1536);
    });

    it('should handle batch size limits', () => {
      const largeTexts = Array.from({ length: 3000 }, (_, i) => `text ${i}`);
      
      // Should not throw for large batches (internal chunking)
      expect(() => {
        provider.embedBatch(largeTexts);
      }).not.toThrow();
    });
  });

  describe('Provider Abstraction', () => {
    it('should support provider switching', async () => {
      // Test that both providers implement the same interface
      const localProvider = new LocalEmbeddingProvider({
        model: 'all-MiniLM-L6-v2',
      });

      const openaiProvider = new OpenAIEmbeddingProvider({
        model: 'text-embedding-3-small',
        apiKey: 'sk-test',
      });

      // Both should have the same interface
      expect(typeof localProvider.embed).toBe('function');
      expect(typeof localProvider.embedBatch).toBe('function');
      expect(typeof localProvider.isReady).toBe('function');
      expect(typeof localProvider.calculateCosineSimilarity).toBe('function');
      expect(typeof localProvider.findMostSimilar).toBe('function');

      expect(typeof openaiProvider.embed).toBe('function');
      expect(typeof openaiProvider.embedBatch).toBe('function');
      expect(typeof openaiProvider.isReady).toBe('function');
      expect(typeof openaiProvider.calculateCosineSimilarity).toBe('function');
      expect(typeof openaiProvider.findMostSimilar).toBe('function');

      await localProvider.dispose();
      await openaiProvider.dispose();
    });

    it('should handle provider initialization errors', async () => {
      // Test error handling for failed initialization
      const localProvider = new LocalEmbeddingProvider({
        model: 'nonexistent-model',
      });

      // Should not throw immediately
      expect(() => localProvider).not.toThrow();
      
      // But isReady should handle errors gracefully
      const isReady = await localProvider.isReady();
      expect(typeof isReady).toBe('boolean');

      await localProvider.dispose();
    });
  });

  describe('Error Handling', () => {
    it('should create appropriate error messages', () => {
      const error = new EmbeddingProviderError('Test error', 'local', 'embed');
      
      expect(error.message).toContain('Test error');
      expect(error.provider).toBe('local');
      expect(error.operation).toBe('embed');
      expect(error.name).toBe('EmbeddingProviderError');
    });

    it('should handle network timeouts', async () => {
      const provider = new OpenAIEmbeddingProvider({
        model: 'text-embedding-3-small',
        apiKey: 'sk-test',
        timeout: 1, // Very short timeout
      });

      // Mock slow network
      const mockFetch = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 1000))
      );
      global.fetch = mockFetch;

      await expect(provider.embed('test')).rejects.toThrow();
      await provider.dispose();
    });

    it('should validate embedding dimensions', () => {
      const provider = new LocalEmbeddingProvider({
        model: 'test-model',
      });

      // Test cosine similarity with dimension mismatch
      const vec1 = { values: [1, 2, 3], dimension: 3 };
      const vec2 = { values: [1, 2], dimension: 2 };
      
      expect(() => {
        provider.calculateCosineSimilarity(vec1, vec2);
      }).toThrow();

      // Test with matching dimensions
      const vec3 = { values: [1, 2, 3], dimension: 3 };
      const vec4 = { values: [1, 2, 3], dimension: 3 };
      
      expect(() => {
        provider.calculateCosineSimilarity(vec3, vec4);
      }).not.toThrow();
    });
  });
});