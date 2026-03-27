import json
import logging
import os
from pathlib import Path

import anthropic
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_anthropic_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

# Load the system prompt once at module import time
_PROMPT_PATH = Path(__file__).parent / "soap_generator_prompt.txt"
_SYSTEM_PROMPT: str = _PROMPT_PATH.read_text(encoding="utf-8")

_REQUIRED_KEYS = {"subjective", "objective", "assessment", "plan"}


async def generate_soap(transcript: str) -> dict:
    """
    Generate a structured SOAP note from a raw consultation transcript.

    Calls the Anthropic Claude API with the veterinary scribe system prompt
    and expects a JSON response with exactly four keys: subjective, objective,
    assessment, and plan.

    Args:
        transcript: The full raw transcript of the veterinary consultation.

    Returns:
        A dict with keys: subjective, objective, assessment, plan.

    Raises:
        ValueError: If the Claude response is not valid JSON or is missing
            required keys.
    """
    if not transcript or not transcript.strip():
        raise ValueError("Transcript is empty — cannot generate SOAP note.")

    # The Anthropic SDK is synchronous; run in a thread to avoid blocking the
    # event loop. Using asyncio.to_thread keeps the interface async-friendly.
    import asyncio

    response = await asyncio.to_thread(
        _call_claude,
        transcript,
    )

    raw_text = response.content[0].text.strip()

    # Claude should return pure JSON per the system prompt, but strip any
    # accidental markdown code fences just in case.
    if raw_text.startswith("```"):
        # Remove ```json ... ``` wrapper
        raw_text = raw_text.split("```", 2)[1]
        if raw_text.lower().startswith("json"):
            raw_text = raw_text[4:]
        raw_text = raw_text.strip()

    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        logger.error("Claude returned non-JSON response: %s", raw_text[:500])
        raise ValueError(f"SOAP generation returned invalid JSON: {exc}") from exc

    missing = _REQUIRED_KEYS - set(data.keys())
    if missing:
        raise ValueError(f"SOAP response missing required keys: {missing}")

    return {key: data[key] for key in _REQUIRED_KEYS}


def _call_claude(transcript: str) -> anthropic.types.Message:
    """Synchronous Claude API call (wrapped in asyncio.to_thread by the caller)."""
    return _anthropic_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=_SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": transcript,
            }
        ],
    )
