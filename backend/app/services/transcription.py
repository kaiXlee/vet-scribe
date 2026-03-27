import logging
import os
import tempfile

from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv()

logger = logging.getLogger(__name__)

_openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


async def transcribe_chunk(audio_bytes: bytes, previous_transcript: str = "") -> str:
    """
    Transcribe a single audio chunk using OpenAI Whisper.

    Instead of overlapping audio, we pass the tail of the previous transcript
    as the `prompt` parameter. This gives Whisper contextual continuity at
    chunk boundaries, which is cleaner and avoids duplicate audio processing.

    Args:
        audio_bytes: Raw WAV audio data for this chunk.
        previous_transcript: Cumulative transcript so far; the last 200
            characters are forwarded as the Whisper prompt.

    Returns:
        The transcribed text for this chunk, or an empty string on failure.
    """
    if not audio_bytes:
        return ""

    # Use the last 200 chars of the previous transcript as context prompt
    context_prompt = previous_transcript[-200:] if previous_transcript else ""

    try:
        # Write bytes to a named temp file — the OpenAI SDK requires a file-like
        # object with a name so it can infer the audio format.
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as audio_file:
                response = await _openai_client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    prompt=context_prompt if context_prompt else None,
                )
            return response.text or ""
        finally:
            # Always clean up the temp file
            os.unlink(tmp_path)

    except Exception as exc:
        logger.error("Whisper transcription failed: %s", exc, exc_info=True)
        return ""
