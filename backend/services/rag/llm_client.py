from backend.config import OPENAI_API_KEY
from openai import OpenAI
from typing import List

_client = OpenAI(api_key=OPENAI_API_KEY)
EMBEDDING_MODEL = "text-embedding-3-small"

def embed_texts(texts: List[str]) -> List[List[float]]:
    if not texts:
        return []

    response = _client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=texts,
    )

    embeddings: List[List[float]] = [item.embedding for item in response.data]
    return embeddings