import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAIEmbeddings, EmbeddingError } from '../../../src/embeddings/openai-embeddings.js';

describe('OpenAI Embeddings - Core Feature Tests', () => {
  // These tests assume a fully configured environment with OpenAI API key
  // They SHOULD FAIL HARD if API key is missing or invalid
  
  let embeddings: OpenAIEmbeddings;
  
  beforeEach(() => {
    const apiKey = process.env.OPENAI_API_KEY;
    
    // FAIL HARD if no API key - no graceful degradation in core tests
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required for core embedding tests. Set it to run these tests.');
    }

    embeddings = new OpenAIEmbeddings({
      apiKey: apiKey,
      model: 'text-embedding-3-small',
      maxTokens: 8192,
      batchSize: 10,
    });
  });

  it('should embed text and return valid vectors', async () => {
    // This should FAIL HARD if OpenAI API doesn't work
    const result = await embeddings.embed('This is a test sentence for OpenAI embedding.');
    
    expect(result).toBeDefined();
    expect(result.embedding).toBeDefined();
    expect(result.embedding.values).toBeInstanceOf(Array);
    expect(result.embedding.values.length).toBe(1536); // text-embedding-3-small dimension
    expect(result.embedding.dimension).toBe(1536);
    expect(result.model).toBe('text-embedding-3-small');
    expect(result.tokens).toBeGreaterThan(0);
    
    // All embedding values should be numbers
    result.embedding.values.forEach(value => {
      expect(typeof value).toBe('number');
      expect(isFinite(value)).toBe(true);
    });
  });

  it('should embed batch of texts', async () => {
    // This should FAIL HARD if batch embedding doesn't work
    const texts = [
      'First test sentence for batch embedding',
      'Second test sentence for batch embedding', 
      'Third test sentence for batch embedding'
    ];
    
    const result = await embeddings.embedBatch(texts);
    
    expect(result).toBeDefined();
    expect(result.embeddings).toHaveLength(3);
    expect(result.model).toBe('text-embedding-3-small');
    expect(result.totalTokens).toBeGreaterThan(0);
    
    result.embeddings.forEach(embedding => {
      expect(embedding.values).toBeInstanceOf(Array);
      expect(embedding.values.length).toBe(1536);
      expect(embedding.dimension).toBe(1536);
    });
  });

  it('should produce different embeddings for different texts', async () => {
    const text1 = 'The weather is sunny and bright today';
    const text2 = 'Machine learning algorithms are complex and powerful';
    
    const result1 = await embeddings.embed(text1);
    const result2 = await embeddings.embed(text2);
    
    // Embeddings should be different for different texts
    const similarity = embeddings.calculateCosineSimilarity(
      result1.embedding, 
      result2.embedding
    );
    
    // Should be less than perfect similarity (not identical)
    expect(similarity).toBeLessThan(0.95);
    expect(similarity).toBeGreaterThan(0.0);
  });

  it('should produce consistent embeddings for same text', async () => {
    const text = 'This is a consistent test sentence for reproducibility';
    
    const result1 = await embeddings.embed(text);
    const result2 = await embeddings.embed(text);
    
    // Should produce identical embeddings for identical input
    const similarity = embeddings.calculateCosineSimilarity(
      result1.embedding,
      result2.embedding
    );
    
    expect(similarity).toBeCloseTo(1.0, 5);
  });

  it('should handle long texts by chunking', async () => {
    // Create a very long text that will need chunking
    const longText = 'This is a test sentence. '.repeat(1000);
    
    const result = await embeddings.embed(longText);
    
    expect(result).toBeDefined();
    expect(result.embedding.values.length).toBe(1536);
    expect(result.tokens).toBeGreaterThan(100);
  });

  it('should find similar embeddings correctly', async () => {
    const queryText = 'artificial intelligence and machine learning';
    const texts = [
      'AI and ML are transforming technology',
      'The weather is nice today', 
      'Deep learning models require lots of data',
      'I like pizza for lunch'
    ];
    
    const queryResult = await embeddings.embed(queryText);
    const textResults = await embeddings.embedBatch(texts);
    
    const similarities = embeddings.findMostSimilar(
      queryResult.embedding,
      textResults.embeddings,
      0.5,
      2
    );
    
    expect(similarities.length).toBeGreaterThan(0);
    expect(similarities[0].score).toBeGreaterThan(0.5);
    
    // First result should be most similar (AI/ML related text)
    expect(similarities[0].index).toBe(0);
  });
});

describe('OpenAI Embeddings - Error Handling & Edge Cases', () => {
  it('should require API key at construction', () => {
    expect(() => {
      new OpenAIEmbeddings({
        model: 'text-embedding-3-small',
        apiKey: '', // Empty API key should throw
      });
    }).toThrow(EmbeddingError);
  });

  it('should handle invalid API key gracefully', async () => {
    const embeddings = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
      apiKey: 'sk-invalid-key-12345678901234567890123456789012',
    });

    // Should fail with clear error message
    await expect(embeddings.embed('test text')).rejects.toThrow(EmbeddingError);
  });

  it('should handle empty text gracefully', async () => {
    const embeddings = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
      apiKey: 'sk-fake-key-for-empty-text-test',
    });

    await expect(embeddings.embed('')).rejects.toThrow(EmbeddingError);
    await expect(embeddings.embed('   ')).rejects.toThrow(EmbeddingError);
  });

  it('should handle empty batch gracefully', async () => {
    const embeddings = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
      apiKey: 'sk-fake-key-for-batch-test',
    });

    await expect(embeddings.embedBatch([])).rejects.toThrow(EmbeddingError);
  });

  it('should handle network timeouts gracefully', async () => {
    const embeddings = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
      apiKey: 'sk-test',
      timeout: 1, // Very short timeout
    });

    // Mock slow network
    const mockFetch = vi.fn().mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 1000))
    );
    global.fetch = mockFetch;

    await expect(embeddings.embed('test')).rejects.toThrow();
  });

  it('should calculate correct dimensions for different models', () => {
    const embeddings1 = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
      apiKey: 'sk-test',
    });
    expect(embeddings1.getDimension()).toBe(1536);

    const embeddings2 = new OpenAIEmbeddings({
      model: 'text-embedding-3-large',
      apiKey: 'sk-test',
    });
    expect(embeddings2.getDimension()).toBe(3072);

    const embeddings3 = new OpenAIEmbeddings({
      model: 'text-embedding-ada-002',
      apiKey: 'sk-test',
    });
    expect(embeddings3.getDimension()).toBe(1536);
  });

  it('should calculate cosine similarity correctly', () => {
    const embeddings = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
      apiKey: 'sk-test',
    });
    
    // Test identical vectors
    const vec1 = { values: [1, 0, 0], dimension: 3 };
    const vec2 = { values: [1, 0, 0], dimension: 3 };
    expect(embeddings.calculateCosineSimilarity(vec1, vec2)).toBeCloseTo(1.0, 5);

    // Test orthogonal vectors  
    const vec3 = { values: [1, 0, 0], dimension: 3 };
    const vec4 = { values: [0, 1, 0], dimension: 3 };
    expect(embeddings.calculateCosineSimilarity(vec3, vec4)).toBeCloseTo(0.0, 5);

    // Test dimension mismatch error
    const vec5 = { values: [1, 2], dimension: 2 };
    expect(() => {
      embeddings.calculateCosineSimilarity(vec1, vec5);
    }).toThrow();
  });

  it('should find most similar embeddings correctly', () => {
    const embeddings = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
      apiKey: 'sk-test',
    });
    
    const queryEmbedding = { values: [1, 0, 0], dimension: 3 };
    const candidateEmbeddings = [
      { values: [1, 0, 0], dimension: 3 }, // Perfect match
      { values: [0, 1, 0], dimension: 3 }, // Orthogonal
      { values: [0.9, 0.1, 0], dimension: 3 }, // Close match
    ];

    const results = embeddings.findMostSimilar(queryEmbedding, candidateEmbeddings, 0.5, 2);
    
    expect(results).toHaveLength(2);
    expect(results[0].index).toBe(0); // Perfect match first
    expect(results[0].score).toBeCloseTo(1.0, 5);
    expect(results[1].index).toBe(2); // Close match second
    expect(results[1].score).toBeGreaterThan(0.8);
  });

  it('should create appropriate error messages', () => {
    const error = new EmbeddingError('Test error', 'embed');
    
    expect(error.message).toContain('Test error');
    expect(error.operation).toBe('embed');
    expect(error.name).toBe('EmbeddingError');
  });
});