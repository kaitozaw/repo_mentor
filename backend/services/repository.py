from datetime import datetime
from pydriller import Repository
from typing import Any, Dict, List, Set
from .storage.s3 import write_json, list_json_stems
from .rag.chunks import build_rag_chunks
from .rag.index import build_rag_index

def ingest_repository(repo_url: str) -> Dict[str, Any]:
    repo_id = _build_repo_folder_name(repo_url)

    # First Layer
    _build_commits(repo_url, repo_id)

    # Second Layer
    build_rag_chunks(repo_id)

    # Third Layer
    build_rag_index(repo_id)

    return {
        "repo_id": repo_id
    }

def _build_commits(repo_url: str, repo_id: str) -> None:
    prefix = f"repos/{repo_id}/commits/"
    existing_commit_ids: Set[str] = list_json_stems(prefix)

    for commit in Repository(repo_url).traverse_commits():
        dt: datetime = commit.committer_date
        date_str = dt.strftime("%Y%m%d%H%M%S")
        commit_id = f"{date_str}_{commit.hash}"
        if commit_id in existing_commit_ids:
            continue

        payload: Dict[str, Any] = {
            "committer_date": commit.committer_date.isoformat(),
            "hash": commit.hash,
            "msg": commit.msg,
            "author": {
                "name": commit.author.name,
                "email": commit.author.email,
            },
            "meta": {
                "branches": [str(b) for b in commit.branches] if commit.branches else [],
                "in_main_branch": commit.in_main_branch,
                "merge": commit.merge,
            },
            "stats": {
                "insertions": commit.insertions,
                "deletions": commit.deletions,
                "lines": commit.lines,
                "files": commit.files,
            },
            "files": _build_files_payload(commit),
        }
        key = f"{prefix}{commit_id}.json"
        write_json(key, payload)

def _build_files_payload(commit) -> List[Dict[str, Any]]:
    files: List[Dict[str, Any]] = []
    for mf in commit.modified_files:
        if hasattr(mf.change_type, "name"):
            change_type = mf.change_type.name
        else:
            change_type = str(mf.change_type)
        files.append(
            {
                "old_path": mf.old_path,
                "new_path": mf.new_path,
                "filename": mf.filename,
                "change_type": change_type,
                "diff_parsed": mf.diff_parsed,
                "added_lines": mf.added_lines,
                "deleted_lines": mf.deleted_lines,
                "source_code": mf.source_code,
                "source_code_before": mf.source_code_before,
            }
        )
    return files

def _build_repo_folder_name(repo_url: str) -> str:
    cleaned = repo_url.rstrip("/")
    if cleaned.endswith(".git"):
        cleaned = cleaned[:-4]

    cleaned = cleaned.replace(":", "/")
    parts = cleaned.split("/")
    if len(parts) < 2:
        return "repo"

    owner = parts[-2]
    repo = parts[-1]

    return f"{owner}_{repo}"