import os
from typing import AsyncGenerator

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

load_dotenv()

def _build_database_url() -> str:
    """
    Build the async SQLAlchemy database URL.

    Locally: reads DATABASE_URL directly from .env.
    On AWS App Runner: individual DB_* env vars are injected from Secrets Manager
    because App Runner cannot inject a secret field into the middle of a string.
    """
    if url := os.getenv("DATABASE_URL"):
        return url

    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "5432")
    name = os.getenv("DB_NAME", "vetscribe")
    user = os.getenv("DB_USER", "postgres")
    password = os.getenv("DB_PASSWORD", "password")
    return f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{name}"

DATABASE_URL = _build_database_url()

engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # Set to True for SQL query logging during development
    pool_pre_ping=True,  # Verify connections before use to handle stale connections
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
