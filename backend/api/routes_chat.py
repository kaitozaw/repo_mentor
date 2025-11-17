from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

class ChatRequest(BaseModel):
    message: str

@router.post("/chat")
def chat(payload: ChatRequest):
    # TODO: implement RAG + LLM call via services.chat
    return {"message": "not implemented yet"}