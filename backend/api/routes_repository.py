from backend.services.repository import ingest_repository
from fastapi import APIRouter, HTTPException
from pydantic import AnyUrl, BaseModel

router = APIRouter()

class RepositoryCreate(BaseModel):
    repo_url: AnyUrl

@router.post("/repository")
def create_repository(payload: RepositoryCreate):
    try:
        result = ingest_repository(str(payload.repo_url))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": str(e)})