#!/usr/bin/env python3
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
