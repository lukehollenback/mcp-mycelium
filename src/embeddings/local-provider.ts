import { EmbeddingProvider, EmbeddingResult, EmbeddingBatch, EmbeddingVector, EmbeddingProviderError } from './embedding-provider.js';
import { spawn, ChildProcess } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import pino from 'pino';

interface PythonEmbeddingResponse {
  embedding?: number[];
  embeddings?: number[][];
  error?: string;
  dimension?: number;
  model?: string;
}

export class LocalEmbeddingProvider extends EmbeddingProvider {
  private pythonProcess?: ChildProcess;
  private isInitialized = false;
  private modelDimension = 0;
  private logger = pino({ name: 'LocalEmbeddingProvider' });
  private requestId = 0;
  private pendingRequests = new Map<number, { resolve: Function; reject: Function }>();

  constructor(config: { model: string; maxTokens?: number; batchSize?: number }) {
    super(config);
    this.ensurePythonScript();
  }

  async embed(text: string): Promise<EmbeddingResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const response = await this.sendRequest({
        action: 'embed',
        text: text.substring(0, this.config.maxTokens || 8192),
        model: this.config.model,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      if (!response.embedding) {
        throw new Error('No embedding returned from Python process');
      }

      this.validateEmbedding(response.embedding);

      return {
        embedding: {
          values: response.embedding,
          dimension: response.embedding.length,
        },
        model: this.config.model,
      };
    } catch (error) {
      throw new EmbeddingProviderError(
        `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'local',
        'embed',
        error instanceof Error ? error : undefined
      );
    }
  }

  async embedBatch(texts: string[]): Promise<EmbeddingBatch> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const truncatedTexts = texts.map(text => 
        text.substring(0, this.config.maxTokens || 8192)
      );

      const response = await this.sendRequest({
        action: 'embed_batch',
        texts: truncatedTexts,
        model: this.config.model,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      if (!response.embeddings) {
        throw new Error('No embeddings returned from Python process');
      }

      const embeddings: EmbeddingVector[] = response.embeddings.map(embedding => {
        this.validateEmbedding(embedding);
        return {
          values: embedding,
          dimension: embedding.length,
        };
      });

      return {
        embeddings,
        model: this.config.model,
      };
    } catch (error) {
      throw new EmbeddingProviderError(
        `Failed to generate batch embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'local',
        'embedBatch',
        error instanceof Error ? error : undefined
      );
    }
  }

  getDimension(): number {
    return this.modelDimension;
  }

  getModel(): string {
    return this.config.model;
  }

  async isReady(): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }
      return this.pythonProcess !== undefined;
    } catch {
      return false;
    }
  }

  async dispose(): Promise<void> {
    if (this.pythonProcess) {
      this.pythonProcess.kill();
      this.pythonProcess = undefined;
    }
    this.isInitialized = false;
    this.pendingRequests.clear();
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info({ model: this.config.model }, 'Initializing local embedding provider');

      await this.startPythonProcess();
      await this.testConnection();
      
      this.isInitialized = true;
      this.logger.info('Local embedding provider initialized successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize local embedding provider');
      throw new EmbeddingProviderError(
        `Failed to initialize local provider: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'local',
        'initialize',
        error instanceof Error ? error : undefined
      );
    }
  }

  private async startPythonProcess(): Promise<void> {
    const scriptPath = join(process.cwd(), 'embedding_server.py');
    
    this.pythonProcess = spawn('python3', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    this.pythonProcess.on('error', (error) => {
      this.logger.error({ error }, 'Python process error');
      this.handleProcessError(error);
    });

    this.pythonProcess.on('exit', (code, signal) => {
      this.logger.warn({ code, signal }, 'Python process exited');
      this.handleProcessExit(code, signal);
    });

    if (this.pythonProcess.stdout) {
      this.pythonProcess.stdout.on('data', (data) => {
        this.handleStdout(data.toString());
      });
    }

    if (this.pythonProcess.stderr) {
      this.pythonProcess.stderr.on('data', (data) => {
        this.logger.error({ stderr: data.toString() }, 'Python process stderr');
      });
    }

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Python process startup timeout'));
      }, 30000);

      const checkReady = () => {
        if (this.pythonProcess && this.pythonProcess.pid) {
          clearTimeout(timeout);
          resolve(undefined);
        }
      };

      setTimeout(checkReady, 1000);
    });
  }

  private async testConnection(): Promise<void> {
    const response = await this.sendRequest({
      action: 'info',
      model: this.config.model,
    });

    if (response.error) {
      throw new Error(response.error);
    }

    if (response.dimension) {
      this.modelDimension = response.dimension;
    }
  }

  private async sendRequest(request: any): Promise<PythonEmbeddingResponse> {
    return new Promise((resolve, reject) => {
      if (!this.pythonProcess || !this.pythonProcess.stdin) {
        reject(new Error('Python process not available'));
        return;
      }

      const id = ++this.requestId;
      const requestWithId = { ...request, id };

      this.pendingRequests.set(id, { resolve, reject });

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }, this.config.timeout || 30000);

      this.pendingRequests.set(id, {
        resolve: (response: PythonEmbeddingResponse) => {
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          resolve(response);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          reject(error);
        },
      });

      try {
        this.pythonProcess.stdin.write(JSON.stringify(requestWithId) + '\n');
      } catch (error) {
        this.pendingRequests.delete(id);
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  private handleStdout(data: string): void {
    const lines = data.trim().split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const response = JSON.parse(line) as PythonEmbeddingResponse & { id?: number };
        
        if (response.id && this.pendingRequests.has(response.id)) {
          const { resolve } = this.pendingRequests.get(response.id)!;
          resolve(response);
        }
      } catch (error) {
        this.logger.error({ line, error }, 'Failed to parse Python response');
      }
    }
  }

  private handleProcessError(error: Error): void {
    for (const { reject } of this.pendingRequests.values()) {
      reject(error);
    }
    this.pendingRequests.clear();
  }

  private handleProcessExit(code: number | null, signal: string | null): void {
    const error = new Error(`Python process exited with code ${code}, signal ${signal}`);
    
    for (const { reject } of this.pendingRequests.values()) {
      reject(error);
    }
    this.pendingRequests.clear();
    this.isInitialized = false;
  }

  private ensurePythonScript(): void {
    const scriptPath = join(process.cwd(), 'embedding_server.py');
    
    if (!existsSync(scriptPath)) {
      this.createPythonScript(scriptPath);
    }
  }

  private createPythonScript(scriptPath: string): void {
    const pythonScript = `#!/usr/bin/env python3
import json
import sys
import traceback
from sentence_transformers import SentenceTransformer
import torch

class EmbeddingServer:
    def __init__(self):
        self.models = {}
        
    def load_model(self, model_name):
        if model_name not in self.models:
            try:
                self.models[model_name] = SentenceTransformer(model_name)
            except Exception as e:
                return {"error": f"Failed to load model {model_name}: {str(e)}"}
        return {"success": True}
    
    def get_model_info(self, model_name):
        result = self.load_model(model_name)
        if "error" in result:
            return result
            
        model = self.models[model_name]
        dimension = model.get_sentence_embedding_dimension()
        
        return {
            "model": model_name,
            "dimension": dimension
        }
    
    def embed_text(self, text, model_name):
        result = self.load_model(model_name)
        if "error" in result:
            return result
            
        try:
            model = self.models[model_name]
            embedding = model.encode(text, convert_to_numpy=True)
            return {
                "embedding": embedding.tolist(),
                "model": model_name
            }
        except Exception as e:
            return {"error": f"Failed to generate embedding: {str(e)}"}
    
    def embed_batch(self, texts, model_name):
        result = self.load_model(model_name)
        if "error" in result:
            return result
            
        try:
            model = self.models[model_name]
            embeddings = model.encode(texts, convert_to_numpy=True)
            return {
                "embeddings": embeddings.tolist(),
                "model": model_name
            }
        except Exception as e:
            return {"error": f"Failed to generate batch embeddings: {str(e)}"}

def main():
    server = EmbeddingServer()
    
    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
                
            try:
                request = json.loads(line)
                request_id = request.get("id")
                action = request.get("action")
                
                if action == "info":
                    response = server.get_model_info(request["model"])
                elif action == "embed":
                    response = server.embed_text(request["text"], request["model"])
                elif action == "embed_batch":
                    response = server.embed_batch(request["texts"], request["model"])
                else:
                    response = {"error": f"Unknown action: {action}"}
                
                if request_id:
                    response["id"] = request_id
                    
                print(json.dumps(response), flush=True)
                
            except json.JSONDecodeError as e:
                error_response = {"error": f"Invalid JSON: {str(e)}"}
                if "id" in locals():
                    error_response["id"] = request_id
                print(json.dumps(error_response), flush=True)
            except Exception as e:
                error_response = {"error": f"Unexpected error: {str(e)}"}
                if "id" in locals():
                    error_response["id"] = request_id
                print(json.dumps(error_response), flush=True)
                
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(json.dumps({"error": f"Server error: {str(e)}"}), flush=True)

if __name__ == "__main__":
    main()
`;

    writeFileSync(scriptPath, pythonScript);
    this.logger.info({ scriptPath }, 'Created Python embedding script');
  }
}