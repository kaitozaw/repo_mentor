from backend.api.routes_repository import router as repository_router
from backend.api.routes_chat import router as chat_router
from backend.config import LOCAL_AWS
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Repo Mentor API")

if LOCAL_AWS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        allow_credentials=True,
    )

app.include_router(repository_router)
app.include_router(chat_router)