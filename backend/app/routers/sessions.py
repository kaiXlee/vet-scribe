import logging
import os
import uuid
from typing import List

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.models.session import Session, SoapNote, SessionCreate, SessionResponse, SessionUpdate
from app.services.soap_generator import generate_soap

load_dotenv()

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sessions"])

S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "vetscribe-audio")
AWS_REGION = os.getenv("AWS_REGION", "us-west-2")


def _get_s3_client():
    return boto3.client("s3", region_name=AWS_REGION)


async def _get_session_or_404(session_id: uuid.UUID, db: AsyncSession) -> Session:
    """Fetch a session with its soap_note eagerly loaded, or raise 404."""
    result = await db.execute(
        select(Session)
        .options(selectinload(Session.soap_note))
        .where(Session.id == session_id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")
    return session


# ---------------------------------------------------------------------------
# POST /sessions — create a new session
# ---------------------------------------------------------------------------

@router.post("/sessions", response_model=SessionResponse, status_code=201)
async def create_session(
    _body: SessionCreate = SessionCreate(),
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    session = Session()
    db.add(session)
    await db.commit()
    await db.refresh(session)
    # Eagerly load soap_note (will be None for a new session)
    await db.execute(
        select(Session).options(selectinload(Session.soap_note)).where(Session.id == session.id)
    )
    return SessionResponse.model_validate(session)


# ---------------------------------------------------------------------------
# GET /sessions — list all sessions
# ---------------------------------------------------------------------------

@router.get("/sessions", response_model=List[SessionResponse])
async def list_sessions(db: AsyncSession = Depends(get_db)) -> List[SessionResponse]:
    result = await db.execute(
        select(Session)
        .options(selectinload(Session.soap_note))
        .order_by(Session.created_at.desc())
    )
    sessions = result.scalars().all()
    return [SessionResponse.model_validate(s) for s in sessions]


# ---------------------------------------------------------------------------
# GET /sessions/{session_id} — get a single session
# ---------------------------------------------------------------------------

@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    session = await _get_session_or_404(session_id, db)
    return SessionResponse.model_validate(session)


# ---------------------------------------------------------------------------
# PATCH /sessions/{session_id} — update session name
# ---------------------------------------------------------------------------

@router.patch("/sessions/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: uuid.UUID,
    body: SessionUpdate,
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    session = await _get_session_or_404(session_id, db)
    if body.name is not None:
        session.name = body.name
    await db.commit()
    await db.refresh(session)
    # Reload with soap_note after update
    result = await db.execute(
        select(Session).options(selectinload(Session.soap_note)).where(Session.id == session.id)
    )
    session = result.scalar_one()
    return SessionResponse.model_validate(session)


# ---------------------------------------------------------------------------
# DELETE /sessions/{session_id} — delete session, soap note, and S3 audio
# ---------------------------------------------------------------------------

@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    session = await _get_session_or_404(session_id, db)

    # Delete audio from S3 if it was uploaded
    if session.audio_s3_key:
        try:
            s3 = _get_s3_client()
            s3.delete_object(Bucket=S3_BUCKET_NAME, Key=session.audio_s3_key)
        except ClientError as exc:
            # Log but don't block deletion — the DB record should still be removed
            logger.warning("Failed to delete S3 object %s: %s", session.audio_s3_key, exc)

    # Cascade delete handles the associated soap_note row
    await db.delete(session)
    await db.commit()


# ---------------------------------------------------------------------------
# POST /sessions/{session_id}/retry-soap — regenerate SOAP from saved transcript
# ---------------------------------------------------------------------------

@router.post("/sessions/{session_id}/retry-soap", response_model=SessionResponse)
async def retry_soap(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    session = await _get_session_or_404(session_id, db)

    if not session.raw_transcript:
        raise HTTPException(
            status_code=422,
            detail="No transcript available for this session. Record audio first.",
        )

    try:
        soap_data = await generate_soap(session.raw_transcript)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # Upsert the soap note — update if one already exists, otherwise create
    if session.soap_note:
        session.soap_note.subjective = soap_data["subjective"]
        session.soap_note.objective = soap_data["objective"]
        session.soap_note.assessment = soap_data["assessment"]
        session.soap_note.plan = soap_data["plan"]
    else:
        soap_note = SoapNote(
            session_id=session.id,
            **soap_data,
        )
        db.add(soap_note)

    session.status = "completed"
    await db.commit()

    # Re-fetch with all relationships populated
    result = await db.execute(
        select(Session).options(selectinload(Session.soap_note)).where(Session.id == session.id)
    )
    session = result.scalar_one()
    return SessionResponse.model_validate(session)
