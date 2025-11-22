from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from backend.services.chat import chat_with_repo

router = APIRouter()

class ChatRequest(BaseModel):
    repo_id: str
    message: str
    top_k: Optional[int] = 5

class ChatResponse(BaseModel):
    message: str
    retrieved_chunks: list
    error: Optional[str] = None

@router.post("/chat", response_model=ChatResponse)
def chat(payload: ChatRequest):
    """
    Chat endpoint for querying a repository using RAG.

    Request body:
    - repo_id: Repository identifier (e.g., "kaitozaw_dev_agents")
    - message: User's question about the repository
    - top_k: (Optional) Number of relevant chunks to retrieve (default: 5)

    Returns:
    - message: AI-generated response
    - retrieved_chunks: List of chunks used for context
    - error: (Optional) Error message if something went wrong

    Example request:
    {
        "repo_id": "kaitozaw_dev_agents",
        "message": "What changes were made to the planning system?",
        "top_k": 5
    }
    """
    try:
        # Validate repo_id
        if not payload.repo_id or not payload.repo_id.strip():
            raise HTTPException(
                status_code=400,
                detail="repo_id is required and cannot be empty"
            )

        # Validate message
        if not payload.message or not payload.message.strip():
            raise HTTPException(
                status_code=400,
                detail="message is required and cannot be empty"
            )

        # Validate top_k
        if payload.top_k and (payload.top_k < 1 or payload.top_k > 20):
            raise HTTPException(
                status_code=400,
                detail="top_k must be between 1 and 20"
            )

        # Call the chat service
        result = chat_with_repo(
            repo_id=payload.repo_id,
            user_message=payload.message,
            top_k=payload.top_k or 5
        )

        return ChatResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )
