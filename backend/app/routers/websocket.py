import asyncio
import base64
import json
import logging
import os
import uuid
from datetime import datetime
from typing import List, Optional

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.database import AsyncSessionLocal
from app.models.session import Session, SoapNote
from app.services.soap_generator import generate_soap
from app.services.transcription import transcribe_chunk

load_dotenv()

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])

API_KEY = os.getenv("API_KEY", "")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "vetscribe-audio")
AWS_REGION = os.getenv("AWS_REGION", "us-west-2")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _validate_api_key(api_key: Optional[str]) -> bool:
    """Return True if the provided key matches the configured API_KEY."""
    return bool(api_key and api_key == API_KEY)


async def _upload_audio_to_s3(
    session_id: uuid.UUID,
    audio_bytes: bytes,
) -> Optional[str]:
    """
    Upload combined audio bytes to S3.

    Runs in a thread pool so we don't block the event loop.
    Returns the S3 key on success, or None on failure.
    """
    s3_key = f"sessions/{session_id}/audio.wav"

    def _do_upload():
        s3 = boto3.client("s3", region_name=AWS_REGION)
        s3.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=s3_key,
            Body=audio_bytes,
            ContentType="audio/wav",
        )
        return s3_key

    try:
        key = await asyncio.to_thread(_do_upload)
        return key
    except Exception as exc:
        logger.warning("S3 upload skipped for session %s: %s", session_id, exc)
        return None


async def _update_session_field(session_id: uuid.UUID, **fields) -> None:
    """Open a fresh DB session and update arbitrary Session fields."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Session).where(Session.id == session_id))
        session = result.scalar_one_or_none()
        if session is None:
            return
        for key, value in fields.items():
            setattr(session, key, value)
        await db.commit()


async def _save_soap_note(session_id: uuid.UUID, soap_data: dict) -> None:
    """Upsert a SoapNote record for the given session."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SoapNote).where(SoapNote.session_id == session_id)
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.subjective = soap_data["subjective"]
            existing.objective = soap_data["objective"]
            existing.assessment = soap_data["assessment"]
            existing.plan = soap_data["plan"]
        else:
            db.add(SoapNote(session_id=session_id, **soap_data))
        await db.commit()


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@router.websocket("/ws/sessions/{session_id}")
async def websocket_session(websocket: WebSocket, session_id: uuid.UUID) -> None:
    """
    Real-time audio streaming endpoint.

    Authentication: pass api_key as a query parameter
        e.g. wss://host/ws/sessions/{id}?api_key=...

    Supported client → server messages:
        Binary frame              → raw audio bytes to transcribe
        {"type": "audio", "data": "<base64>"}  → base64-encoded audio
        {"type": "ping"}          → keepalive
        {"type": "pause"}         → mark session paused
        {"type": "resume"}        → mark session recording
        {"type": "stop"}          → finalise session and generate SOAP

    Server → client messages:
        {"type": "pong"}
        {"type": "transcript", "text": "..."}
        {"type": "soap", "data": {...}}
        {"type": "error", "message": "..."}
    """
    # --- 1. Authenticate via query param ---
    api_key = websocket.query_params.get("api_key")
    if not _validate_api_key(api_key):
        await websocket.close(code=4001, reason="Unauthorised: invalid API key.")
        return

    # --- 2. Load session from DB ---
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Session)
            .options(selectinload(Session.soap_note))
            .where(Session.id == session_id)
        )
        session = result.scalar_one_or_none()
        if session is None:
            await websocket.close(code=4004, reason=f"Session {session_id} not found.")
            return

        # Mark as recording and capture start time
        session.status = "recording"
        started_at = datetime.utcnow()
        await db.commit()

    await websocket.accept()
    logger.info("WebSocket connected for session %s", session_id)

    # --- 3. In-memory state ---
    accumulated_transcript: str = ""
    audio_chunks: List[bytes] = []

    # --- 4. Message loop ---
    try:
        while True:
            try:
                message = await websocket.receive()
            except RuntimeError:
                break

            if message.get("type") == "websocket.disconnect":
                break

            # ---- Binary frame: raw audio bytes ----
            if "bytes" in message and message["bytes"] is not None:
                audio_bytes = message["bytes"]
                audio_chunks.append(audio_bytes)
                chunk_text = await transcribe_chunk(
                    audio_bytes,
                    previous_transcript=accumulated_transcript,
                )
                if chunk_text:
                    accumulated_transcript += " " + chunk_text if accumulated_transcript else chunk_text
                    # Persist transcript incrementally
                    await _update_session_field(session_id, raw_transcript=accumulated_transcript)
                    await websocket.send_json({"type": "transcript", "text": chunk_text})

            # ---- Text frame: JSON control message ----
            elif "text" in message and message["text"] is not None:
                try:
                    data = json.loads(message["text"])
                except json.JSONDecodeError:
                    await websocket.send_json({"type": "error", "message": "Invalid JSON."})
                    continue

                msg_type = data.get("type")

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})

                elif msg_type == "pause":
                    await _update_session_field(session_id, status="paused")
                    logger.info("Session %s paused.", session_id)

                elif msg_type == "resume":
                    await _update_session_field(session_id, status="recording")
                    logger.info("Session %s resumed.", session_id)

                elif msg_type == "audio":
                    # Base64-encoded audio sent as a JSON message
                    try:
                        audio_bytes = base64.b64decode(data["data"])
                    except (KeyError, Exception) as exc:
                        await websocket.send_json(
                            {"type": "error", "message": f"Failed to decode audio: {exc}"}
                        )
                        continue

                    audio_chunks.append(audio_bytes)
                    chunk_text = await transcribe_chunk(
                        audio_bytes,
                        previous_transcript=accumulated_transcript,
                    )
                    if chunk_text:
                        accumulated_transcript += " " + chunk_text if accumulated_transcript else chunk_text
                        await _update_session_field(session_id, raw_transcript=accumulated_transcript)
                        await websocket.send_json({"type": "transcript", "text": chunk_text})

                elif msg_type == "stop":
                    await _handle_stop(
                        websocket=websocket,
                        session_id=session_id,
                        accumulated_transcript=accumulated_transcript,
                        audio_chunks=audio_chunks,
                        started_at=started_at,
                    )
                    # Stop flow closes the session; break out of the message loop.
                    break

                else:
                    await websocket.send_json(
                        {"type": "error", "message": f"Unknown message type: {msg_type!r}"}
                    )

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for session %s", session_id)
        # If still in-progress, persist transcript and mark failed
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Session).where(Session.id == session_id))
            session = result.scalar_one_or_none()
            if session and session.status in ("recording", "paused"):
                session.status = "failed"
                if accumulated_transcript:
                    session.raw_transcript = accumulated_transcript
                await db.commit()

    except Exception as exc:
        logger.error("Unexpected error in WebSocket handler for session %s: %s", session_id, exc, exc_info=True)
        try:
            await websocket.send_json({"type": "error", "message": "Internal server error."})
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Stop flow (extracted for readability)
# ---------------------------------------------------------------------------

async def _handle_stop(
    websocket: WebSocket,
    session_id: uuid.UUID,
    accumulated_transcript: str,
    audio_chunks: List[bytes],
    started_at: datetime,
) -> None:
    """
    Finalise a recording session:
    1. Mark status as "processing".
    2. Upload audio to S3 (fire-and-forget — we await it but don't block on
       success so the user gets the SOAP note even if S3 is unavailable).
    3. Generate SOAP note via Claude.
    4. Persist results and notify client.
    """
    ended_at = datetime.utcnow()
    duration_seconds = int((ended_at - started_at).total_seconds())

    await _update_session_field(
        session_id,
        status="processing",
        ended_at=ended_at,
        duration_seconds=duration_seconds,
        raw_transcript=accumulated_transcript or None,
    )

    # Upload audio to S3 (fire and forget — run concurrently with SOAP generation)
    combined_audio = b"".join(audio_chunks)
    s3_upload_task = asyncio.create_task(
        _upload_audio_to_s3(session_id, combined_audio) if combined_audio else _noop()
    )

    # Generate SOAP note
    try:
        soap_data = await generate_soap(accumulated_transcript)
    except ValueError as exc:
        logger.error("SOAP generation failed for session %s: %s", session_id, exc)
        await _update_session_field(session_id, status="failed")
        await websocket.send_json(
            {"type": "error", "message": "SOAP generation failed. Transcript saved."}
        )
        # Still await S3 upload so the task isn't abandoned
        await s3_upload_task
        return

    # Save SOAP note to DB
    await _save_soap_note(session_id, soap_data)

    # Await S3 upload result and persist S3 key if successful
    s3_key = await s3_upload_task
    update_fields = {"status": "completed"}
    if s3_key:
        update_fields["audio_s3_key"] = s3_key
    await _update_session_field(session_id, **update_fields)

    await websocket.send_json({"type": "soap", "data": soap_data})
    logger.info("Session %s completed successfully.", session_id)


async def _noop() -> None:
    """No-op coroutine used when there is no audio to upload."""
    return None
