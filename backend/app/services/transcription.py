import logging
import os
import tempfile

from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv()

logger = logging.getLogger(__name__)

_openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Vocab primer biases Whisper toward recognizing English medical terms within Chinese speech.
_VOCAB_PRIMER = (
    "獸醫診所 consultation, blood test, CBC, BUN, creatinine, ALT, AST, glucose, "
    "X-Ray, ultrasound, ECG, CT scan, kidney, liver, pancreas, heart, lung, "
    "diabetes, pancreatitis, renal failure, body weight, temperature, heart rate"
)


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

    # Vocab primer + last 200 chars of previous transcript for context
    context_tail = previous_transcript[-200:] if previous_transcript else ""
    context_prompt = _VOCAB_PRIMER + " " + context_tail if context_tail else _VOCAB_PRIMER

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
                    prompt=context_prompt,
                    response_format="verbose_json",
                )

            # Filter out segments where Whisper thinks there's no speech
            segments = response.segments or []
            real_text = []
            for seg in segments:
                if getattr(seg, "no_speech_prob", 0.0) < 0.6:
                    real_text.append(seg.text)

            return "".join(real_text).strip()
        finally:
            # Always clean up the temp file
            os.unlink(tmp_path)

    except Exception as exc:
        logger.error("Whisper transcription failed: %s", exc, exc_info=True)
        return ""
