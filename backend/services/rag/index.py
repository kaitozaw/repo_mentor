from backend.services.rag.llm_client import embed_texts
from backend.services.storage.s3 import read_text, write_bytes
from pathlib import Path
from typing import List
import faiss
import json
import numpy as np
import tempfile

def build_rag_index(repo_id: str) -> None:
    chunks_key = f"repos/{repo_id}/rag/chunks.jsonl"
    jsonl = read_text(chunks_key)
    if not jsonl:
        return

    ids: List[str] = []
    texts: List[str] = []
    
    for line in jsonl.splitlines():
        line = line.strip()
        if not line:
            continue
        obj = json.loads(line)
        ids.append(obj["id"])
        texts.append(obj["text"])

    if not texts:
        return

    vectors = embed_texts(texts)
    vecs = np.array(vectors, dtype="float32")
    dim = vecs.shape[1]

    index = faiss.IndexFlatIP(dim)
    index.add(vecs)

    key = f"repos/{repo_id}/rag/index.faiss"
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "index.faiss"
        faiss.write_index(index, str(path))
        data = path.read_bytes()

    write_bytes(key, data)