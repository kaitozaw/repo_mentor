import faiss
import json
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from backend.services.storage.s3 import read_text, read_bytes
from backend.services.rag.llm_client import embed_texts

# In-memory cache for FAISS indices and chunks
_cache: Dict[str, Tuple[Any, List[Dict[str, Any]]]] = {}

def retrieve_chunks(repo_id: str, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """
    Retrieve the most relevant chunks for a given query using FAISS.

    Args:
        repo_id: Repository identifier (e.g., "kaitozaw_dev_agents")
        query: User's query text
        top_k: Number of top results to return (default: 5)

    Returns:
        List of dicts containing:
        - id: chunk ID
        - text: chunk content
        - similarity: similarity score
    """
    try:
        # Check cache first
        if repo_id in _cache:
            index, chunks = _cache[repo_id]
        else:
            # Define paths
            index_path = f"repos/{repo_id}/rag/index.faiss"
            chunks_path = f"repos/{repo_id}/rag/chunks.jsonl"

            # 1. Load FAISS index
            index_bytes = read_bytes(index_path)
            index = faiss.deserialize_index(np.frombuffer(index_bytes, dtype=np.uint8))

            # 2. Load chunks metadata
            chunks_text = read_text(chunks_path)
            chunks = []
            for line in chunks_text.strip().split('\n'):
                if line:
                    chunks.append(json.loads(line))

            # Cache for future requests
            _cache[repo_id] = (index, chunks)

        if not chunks:
            return []

        # 3. Generate embedding for the query
        try:
            query_embeddings = embed_texts([query])
            if not query_embeddings:
                raise Exception("Failed to generate embeddings - empty response")
        except Exception as embed_error:
            print(f"OpenAI embedding error: {type(embed_error).__name__}: {str(embed_error)}")
            raise Exception(f"Failed to generate query embedding: {str(embed_error)}")

        query_vector = np.array(query_embeddings[0], dtype=np.float32).reshape(1, -1)

        # 4. Normalize query vector for cosine similarity (FAISS uses inner product)
        faiss.normalize_L2(query_vector)

        # 5. Search the index
        similarities, indices = index.search(query_vector, min(top_k, len(chunks)))

        # 6. Format results
        results = []
        for i, (similarity, idx) in enumerate(zip(similarities[0], indices[0])):
            if idx < len(chunks):
                chunk = chunks[idx]
                results.append({
                    "id": chunk["id"],
                    "text": chunk["text"],
                    "similarity": float(similarity)
                })

        return results

    except FileNotFoundError as e:
        print(f"FileNotFoundError: {str(e)}")
        raise Exception(f"Repository {repo_id} not found or not indexed. Please ingest the repository first.")
    except Exception as e:
        print(f"Error during retrieval: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise Exception(f"Failed to retrieve chunks: {str(e)}")
