from datetime import datetime, timezone
from pydriller import Repository
from typing import Any, Dict, List, Optional, Set
from .storage.s3 import list_json_stems, read_json, write_json
from .rag.chunks import build_rag_chunks
from .rag.index import build_rag_index
import threading
import uuid

def get_latest_repository_job(repo_id: str) -> Optional[Dict[str, Any]]:
    prefix = f"repos/{repo_id}/jobs/"
    stems = list_json_stems(prefix)
    if not stems:
        return None

    latest: Optional[Dict[str, Any]] = None

    for stem in stems:
        key = f"{prefix}{stem}.json"
        job = read_json(key)
        if not job:
            continue
        created_at = job.get("created_at")
        if not created_at:
            continue
        if latest is None or created_at > latest.get("created_at", ""):
            latest = job

    return latest

def ingest_repository(repo_url: str) -> Dict[str, Any]:
    repo_id = _build_repo_folder_name(repo_url)

    # --- First layer ---
    _build_commits(repo_url, repo_id)

    # --- Second layer ---
    build_rag_chunks(repo_id)

    # --- Third layer ---
    build_rag_index(repo_id)

    return {"repo_id": repo_id}

def start_ingest_repository_job(repo_url: str) -> Dict[str, Any]:
    repo_id = _build_repo_folder_name(repo_url)
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    job = {
        "job_id": job_id,
        "created_at": now,
        "repo_url": repo_url,
        "status": "accepted",
    }
    _create_job(repo_id, job_id, job)

    def _run():
        _update_job_status(repo_id, job_id, "running")
        try:
            ingest_repository(repo_url)
            _update_job_status(repo_id, job_id, "completed")
        except Exception as e:
            _update_job_status(repo_id, job_id, "failed", error=str(e))

    t = threading.Thread(target=_run, daemon=True)
    t.start()

    return {"repo_id": repo_id}

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
                "files": commit.files,
                "insertions": commit.insertions,
                "deletions": commit.deletions,
                "lines": commit.lines,
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

def _create_job(repo_id: str, job_id: str, job: Dict[str, Any]) -> None:
    key = f"repos/{repo_id}/jobs/{job_id}.json"
    write_json(key, job)

def _update_job_status(repo_id: str, job_id: str, status: str, **extra: Any) -> None:
    key = f"repos/{repo_id}/jobs/{job_id}.json"
    job = read_json(key) or {}
    job["status"] = status
    if extra:
        job.update(extra)
    write_json(key, job)