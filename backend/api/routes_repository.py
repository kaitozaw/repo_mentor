from backend.services.repository import get_latest_repository_job, start_ingest_repository_job
from fastapi import APIRouter, HTTPException
from pydantic import AnyUrl, BaseModel

router = APIRouter()

class RepositoryCreate(BaseModel):
    repo_url: AnyUrl

@router.get("/repository/{repo_id}")
def get_repository_state(repo_id: str):
    job = get_latest_repository_job(repo_id)
    if not job:
        raise HTTPException(status_code=404, detail={"error": "repository job not found"})
    return job

@router.post("/repository")
def create_repository(payload: RepositoryCreate):
    try:
        result = start_ingest_repository_job(str(payload.repo_url))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": str(e)})