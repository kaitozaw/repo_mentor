from backend.services.storage.s3 import list_json_stems, read_json, write_text
from typing import Any, Dict, List
import json

def build_rag_chunks(repo_id: str) -> None:
    commits_prefix = f"repos/{repo_id}/commits/"
    commit_stems = sorted(list_json_stems(commits_prefix))
    chunks: List[Dict[str, Any]] = []
    for stem in commit_stems:
        commit_key = f"{commits_prefix}{stem}.json"
        commit = read_json(commit_key)
        if not commit:
            continue

        text = _generate_chunk_text(commit)
        chunks.append(
            {
                "id": stem,
                "text": text,
            }
        )

    key = f"repos/{repo_id}/rag/chunks.jsonl"
    lines = [json.dumps(c, ensure_ascii=False) for c in chunks]
    jsonl = "\n".join(lines) + ("\n" if lines else "")

    write_text(key, jsonl)

def _generate_chunk_text(commit: Dict[str, Any]) -> str:
    header = f"{commit['committer_date']} {commit['hash']}\n{commit['msg']}"
    files = commit.get("files", [])
    file_summaries: List[str] = []

    for f in files[:1]:
        file_summaries.append(
            f"- {f.get('filename')} ({f.get('change_type')})"
        )

    body = "\n".join(file_summaries)
    return header + ("\n" + body if body else "")