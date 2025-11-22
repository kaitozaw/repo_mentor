from backend.services.storage.s3 import list_commits, read_json, write_text
from backend.services.rag.prompt import summarise_commit
from typing import Any, Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor
import json
import os

# --- Configs ---
CODE_EXTS = {
    ".py",
    ".js", ".ts", ".jsx", ".tsx",
    ".html", ".htm", ".css", ".scss",
    ".java", ".kt", ".kts",
    ".c", ".h", ".cpp", ".cc", ".hpp",
    ".go",
    ".rs",
    ".sql",
    ".sh", ".bash", ".zsh",
    ".rb",
    ".php",
    ".cs",
    ".swift", ".m", ".mm",
    ".ini", ".cfg",
}
MAX_FILES_FOR_LLM = 20
MAX_LINES_PER_SNIPPET = 40
MAX_WORKERS = 10

# --- Core logic ---
def build_rag_chunks(repo_id: str) -> None:
    commits_prefix = f"repos/{repo_id}/commits/"
    commit_stems = sorted(list_commits(commits_prefix))
    chunks: List[Dict[str, Any]] = []

    def _process(stem: str) -> Optional[Dict[str, Any]]:
        commit_key = f"{commits_prefix}{stem}.json"
        commit = read_json(commit_key)
        if not commit:
            return None
        text = _generate_chunk_text(commit)
        return {"id": stem, "text": text}

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = [executor.submit(_process, stem) for stem in commit_stems]
        for fut in futures:
            result = fut.result()
            if result:
                chunks.append(result)

    key = f"repos/{repo_id}/rag/chunks.jsonl"
    lines = [json.dumps(c, ensure_ascii=False) for c in chunks]
    jsonl = "\n".join(lines) + ("\n" if lines else "")
    write_text(key, jsonl)

def _generate_chunk_text(commit: Dict[str, Any]) -> str:
    header = _build_header(commit)

    if _is_noise_commit(commit):
        body = _build_noise_summary(commit)
        return header + ("\n\n" + body if body else "")

    try:
        payload = _create_llm_payload(commit)
        llm_summary = summarise_commit(payload)
        body = llm_summary or _build_fallback_body(commit)
    except Exception:
        body = _build_fallback_body(commit)

    return header + ("\n\n" + body if body else "")

# --- Header / simple summaries ---
def _build_header(commit: Dict[str, Any]) -> str:
    date = commit.get("committer_date", "")
    h = commit.get("hash", "")
    msg = commit.get("msg", "")
    author = (commit.get("author") or {}).get("name") or ""
    branches = (commit.get("meta") or {}).get("branches") or []

    header_lines: List[str] = [f"{date} {h}"]
    if msg:
        header_lines.append(f"Message: {msg}")
    if author or branches:
        parts: List[str] = []
        if author:
            parts.append(f"author={author}")
        if branches:
            parts.append("branches=" + ",".join(branches))
        header_lines.append(" ".join(parts))

    return "\n".join(header_lines)

def _build_noise_summary(commit: Dict[str, Any]) -> str:
    files = commit.get("files", []) or []
    lines: List[str] = []
    lines.append("Summary:")
    lines.append("- Updated configuration / documentation / non-code assets.")
    lines.append("")
    lines.append("Files:")
    for f in files:
        path = _file_path(f) or "unknown"
        change_type = f.get("change_type") or "MODIFY"
        lines.append(f"- {path} ({change_type})")
    return "\n".join(lines)

def _build_fallback_body(commit: Dict[str, Any]) -> str:
    files = commit.get("files", []) or []
    lines: List[str] = []
    lines.append("Summary:")
    lines.append("- Commit details could not be fully summarized by the LLM.")
    lines.append("")
    lines.append("Files:")
    for f in files[:5]:
        path = _file_path(f) or "unknown"
        change_type = f.get("change_type") or "MODIFY"
        lines.append(f"- {path} ({change_type})")
    if len(files) > 5:
        lines.append(f"- ... (+{len(files) - 5} more files)")
    return "\n".join(lines)

# --- Noise detection ---
def _is_noise_commit(commit: Dict[str, Any]) -> bool:
    message = (commit.get("msg") or "").lower()
    stats = commit.get("stats") or {}
    total_changes = int(stats.get("insertions", 0)) + int(stats.get("deletions", 0))
    files = commit.get("files", []) or []

    noise_keywords = ["format", "fmt", "prettier", "black", "lint", "typo", "docs", "doc", "readme", "chore"]
    if any(k in message for k in noise_keywords) and total_changes <= 20:
        return True

    has_code_file = any(_is_code_file(_file_path(f)) for f in files)
    if not has_code_file:
        return True

    if not files:
        return True

    return False

# --- LLM payload creation ---
def _create_llm_payload(commit: Dict[str, Any]) -> Dict[str, Any]:
    meta = commit.get("meta") or {}
    stats = commit.get("stats") or {}
    files = commit.get("files", []) or []

    commit_part: Dict[str, Any] = {
        "committer_date": commit.get("committer_date"),
        "hash": commit.get("hash"),
        "msg": commit.get("msg"),
        "author": (commit.get("author") or {}).get("name"),
        "branches": meta.get("branches") or [],
        "is_merge": bool(meta.get("merge")),
        
        "stats": {
            "files": stats.get("files"),
            "insertions": stats.get("insertions"),
            "deletions": stats.get("deletions"),
        },
    }

    code_files: List[Dict[str, Any]] = []
    other_files: List[Dict[str, Any]] = []

    for f in files:
        path = _file_path(f)
        entry: Dict[str, Any] = {
            "path": path,
            "change_type": f.get("change_type") or "MODIFY",
            "added_lines": f.get("added_lines", 0),
            "deleted_lines": f.get("deleted_lines", 0),
            "added_snippet": [],
            "deleted_snippet": [],
        }

        if _is_code_file(path):
            snippets = _extract_code_snippets(f)
            entry["added_snippet"] = snippets["added_snippet"]
            entry["deleted_snippet"] = snippets["deleted_snippet"]
            code_files.append(entry)
        else:
            other_files.append(entry)

    ordered_files = code_files + other_files
    limited_files = ordered_files[:MAX_FILES_FOR_LLM]

    return {"commit": commit_part, "files": limited_files}

def _extract_code_snippets(f: Dict[str, Any]) -> Dict[str, List[str]]:
    diff = f.get("diff_parsed") or {}
    added = diff.get("added") or []
    deleted = diff.get("deleted") or []

    added_texts = [t for _, t in added][:MAX_LINES_PER_SNIPPET]
    deleted_texts = [t for _, t in deleted][:MAX_LINES_PER_SNIPPET]

    return {
        "added_snippet": added_texts,
        "deleted_snippet": deleted_texts,
    }

# --- Utility ---
def _file_path(f: Dict[str, Any]) -> str:
    return f.get("new_path") or f.get("old_path") or f.get("filename") or ""

def _is_code_file(path: str) -> bool:
    _, ext = os.path.splitext(path)
    return ext in CODE_EXTS