from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.middleware.auth import APIKeyMiddleware
from app.routers import sessions, websocket

app = FastAPI(
    title="VetScribe AI",
    description="AI-powered veterinary consultation scribe backend.",
    version="1.0.0",
)

# ---------------------------------------------------------------------------
# CORS — allow all origins for MVP; tighten per-env in production
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# API Key authentication (excludes OPTIONS + WebSocket upgrades)
# ---------------------------------------------------------------------------
app.add_middleware(APIKeyMiddleware)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(sessions.router)
app.include_router(websocket.router)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health", tags=["health"])
async def health_check() -> dict:
    return {"status": "ok"}
