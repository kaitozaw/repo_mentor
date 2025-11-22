import faiss
import json
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from backend.services.storage.s3 import read_text, read_bytes
from backend.services.rag.llm_client import embed_texts

# In-memory cache for FAISS indices and chunks
_cache: Dict[str, Tuple[Any, List[Dict[str, Any]]]] = {}

def _extract_commit_id_from_query(query: str) -> Optional[str]:
    """Extract commit ID or hash from query if present."""
    import re

    # Match full chunk ID format: YYYYMMDDHHmmss_hash
    chunk_id_pattern = r'\d{14}_[a-f0-9]{40}'
    match = re.search(chunk_id_pattern, query)
    if match:
        return match.group(0)

    # Match just the commit hash (40 char hex - full hash)
    hash_pattern = r'[a-f0-9]{40}'
    match = re.search(hash_pattern, query)
    if match:
        return match.group(0)

    # Match short commit hash (7-39 char hex)
    short_hash_pattern = r'[a-f0-9]{7,39}'
    match = re.search(short_hash_pattern, query)
    if match:
        return match.group(0)

    return None

def _is_recency_query(query: str) -> bool:
    """Check if the query is asking about recent/latest changes."""
    query_lower = query.lower()
    recency_keywords = [
        "recent", "latest", "last", "new", "newest",
        "current", "updated", "what changed", "what's new",
        "what are the changes", "what updates"
    ]
    return any(keyword in query_lower for keyword in recency_keywords)

def _extract_date_from_chunk_id(chunk_id: str) -> int:
    """Extract date timestamp from chunk ID format: YYYYMMDDHHmmss_hash"""
    try:
        date_part = chunk_id.split('_')[0]
        return int(date_part)
    except:
        return 0

def retrieve_chunks(repo_id: str, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """
    Retrieve the most relevant chunks for a given query using FAISS.

    For recency queries (e.g., "recent changes", "latest updates"):
    - Fetches more candidates (top_k * 3)
    - Re-ranks by combining semantic similarity and recency

    For feature-specific recency queries (e.g., "recent auth changes"):
    - Uses semantic search to find relevant commits
    - Returns the most recent ones from that set

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

        # 3. Check if query contains a commit ID or hash
        commit_id = _extract_commit_id_from_query(query)
        if commit_id:
            # Direct lookup by commit ID or hash
            results = []
            for chunk in chunks:
                chunk_id = chunk["id"]
                # Match full chunk ID or just the hash part
                if chunk_id == commit_id or chunk_id.endswith(f"_{commit_id}") or commit_id in chunk_id:
                    results.append({
                        "id": chunk_id,
                        "text": chunk["text"],
                        "similarity": 1.0  # Perfect match
                    })

            # If we found exact match(es), return them
            if results:
                return results[:top_k]

            # If no exact match, fall through to semantic search
            # (user might have pasted a partial hash or wrong hash)

        # 4. Generate embedding for the query
        try:
            query_embeddings = embed_texts([query])
            if not query_embeddings:
                raise Exception("Failed to generate embeddings - empty response")
        except Exception as embed_error:
            print(f"OpenAI embedding error: {type(embed_error).__name__}: {str(embed_error)}")
            raise Exception(f"Failed to generate query embedding: {str(embed_error)}")

        query_vector = np.array(query_embeddings[0], dtype=np.float32).reshape(1, -1)

        # 5. Normalize query vector for cosine similarity (FAISS uses inner product)
        faiss.normalize_L2(query_vector)

        # 6. Determine if this is a recency query
        is_recency = _is_recency_query(query)

        # For recency queries, fetch more candidates to re-rank
        search_k = min(top_k * 3 if is_recency else top_k, len(chunks))

        # 7. Search the index
        similarities, indices = index.search(query_vector, search_k)

        # 8. Format candidates
        candidates = []
        for similarity, idx in zip(similarities[0], indices[0]):
            if idx < len(chunks):
                chunk = chunks[idx]
                candidates.append({
                    "id": chunk["id"],
                    "text": chunk["text"],
                    "similarity": float(similarity),
                    "date": _extract_date_from_chunk_id(chunk["id"])
                })

        # 9. Re-rank for recency queries
        if is_recency and len(candidates) > 0:
            # Normalize dates to 0-1 range
            max_date = max(c["date"] for c in candidates)
            min_date = min(c["date"] for c in candidates)
            date_range = max_date - min_date if max_date > min_date else 1

            # Combine semantic similarity (70%) and recency (30%)
            for candidate in candidates:
                recency_score = (candidate["date"] - min_date) / date_range
                candidate["combined_score"] = (0.7 * candidate["similarity"]) + (0.3 * recency_score)

            # Sort by combined score and take top_k
            candidates.sort(key=lambda x: x["combined_score"], reverse=True)
            results = candidates[:top_k]
        else:
            # For non-recency queries, just use semantic similarity
            results = candidates[:top_k]

        # 10. Return results (remove internal scoring fields)
        return [
            {
                "id": r["id"],
                "text": r["text"],
                "similarity": r["similarity"]
            }
            for r in results
        ]

    except FileNotFoundError as e:
        print(f"FileNotFoundError: {str(e)}")
        raise Exception(f"Repository {repo_id} not found or not indexed. Please ingest the repository first.")
    except Exception as e:
        print(f"Error during retrieval: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise Exception(f"Failed to retrieve chunks: {str(e)}")
