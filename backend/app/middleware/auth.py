import os

from dotenv import load_dotenv
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

load_dotenv()

API_KEY = os.getenv("API_KEY", "")


class APIKeyMiddleware(BaseHTTPMiddleware):
    """
    Validates the X-API-Key header on every inbound request.

    Exceptions:
    - OPTIONS requests are allowed through for CORS preflight handling.
    - WebSocket upgrade requests are NOT validated here — the WS router
      validates the api_key query parameter itself.
    """

    async def dispatch(self, request: Request, call_next):
        # Let CORS preflight pass without authentication
        if request.method == "OPTIONS":
            return await call_next(request)

        # WebSocket connections send the key as a query param; skip header check
        if request.headers.get("upgrade", "").lower() == "websocket":
            return await call_next(request)

        provided_key = request.headers.get("X-API-Key", "")

        if not provided_key or provided_key != API_KEY:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or missing API key."},
            )

        return await call_next(request)
