import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

# ---------------------------------------------------------------------------
# SQLAlchemy ORM Models
# ---------------------------------------------------------------------------


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # Allowed values: recording | paused | processing | completed | failed
    status: Mapped[str] = mapped_column(String, nullable=False, default="recording")
    audio_s3_key: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    raw_transcript: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # One-to-one relationship — accessed as session.soap_note
    soap_note: Mapped[Optional["SoapNote"]] = relationship(
        "SoapNote", back_populates="session", uselist=False, cascade="all, delete-orphan"
    )


class SoapNote(Base):
    __tablename__ = "soap_notes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,  # enforces one-per-session at the DB level
    )
    subjective: Mapped[str] = mapped_column(Text, nullable=False)
    objective: Mapped[str] = mapped_column(Text, nullable=False)
    assessment: Mapped[str] = mapped_column(Text, nullable=False)
    plan: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    session: Mapped["Session"] = relationship("Session", back_populates="soap_note")


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

from pydantic import BaseModel, ConfigDict  # noqa: E402 — kept near the models they mirror


class SessionCreate(BaseModel):
    """No fields — a session is auto-created with defaults."""
    pass


class SessionUpdate(BaseModel):
    name: Optional[str] = None


class SoapNoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    subjective: str
    objective: str
    assessment: str
    plan: str
    created_at: datetime


class SessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: Optional[str]
    status: str
    audio_s3_key: Optional[str]
    raw_transcript: Optional[str]
    duration_seconds: Optional[int]
    created_at: datetime
    ended_at: Optional[datetime]
    soap_note: Optional[SoapNoteResponse] = None
