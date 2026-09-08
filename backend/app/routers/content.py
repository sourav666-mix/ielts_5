"""ATLAS IELTS Academy — content generation relays (§4.4, §5.5, §7.5, §8.3, §4.5).

Design: these routes are AUTH + AI relay, nothing more. Normalisation
is the frontend's single gatekeeper (Batches 5–8 contract) — the model's
JSON passes straight back, and a malformed generation surfaces as the
client's warm "didn't come back complete" retry, exactly as built.

Two backend-owned responsibilities live here:
  · §13.3 Kokoro voice injection on listening transcripts (server
    resolves one voice per speaker at generation time)
  · §12.3 targeted routing: focusTypes present → the stronger
    question-writing model (READING_QA/LISTENING_QA targeted=True)
"""

from typing import Any

from fastapi import APIRouter, Body, Depends

from app.ai import Task, chat_json_with_fallback
from app.ai import prompts
from app.ai.client import AIError, WARM_UNREADABLE
from app.deps import get_current_user
from app.models import User

router = APIRouter(tags=["content"])


def _require_dict(data: Any) -> dict:
    if not isinstance(data, dict):
        raise AIError(WARM_UNREADABLE, 502)
    return data


# ── Module 1: Reading (§4) ────────────────────────────────────

@router.post("/reading/generate")
async def reading_generate(
    payload: dict = Body(...),
    user: User = Depends(get_current_user),
) -> dict:
    """§4.4 call 1 — theme + 3 passages + 30 vocabulary items."""
    messages = prompts.reading_generation_messages(payload)
    return _require_dict(await chat_json_with_fallback(Task.READING_GEN, messages))


@router.post("/reading/questions")
async def reading_questions(
    payload: dict = Body(...),
    user: User = Depends(get_current_user),
) -> dict:
    """§4.4 call 2 — 40 questions against the exact passage text."""
    passages = payload.get("passages") or []
    messages = prompts.reading_questions_messages(payload, passages)
    targeted = bool(payload.get("focusTypes"))          # §12.3 targeted day
    return _require_dict(
        await chat_json_with_fallback(Task.READING_QA, messages, targeted=targeted)
    )


@router.post("/reading/insight")
async def reading_insight(
    payload: dict = Body(...),
    user: User = Depends(get_current_user),
) -> dict:
    """§4.5 — warm coaching insight on today's misses."""
    messages = prompts.reading_insight_messages(payload)
    return _require_dict(await chat_json_with_fallback(Task.READING_INSIGHT, messages))


# ── Module 2: Listening (§5) ───────────────────────────────────

@router.post("/listening/generate")
async def listening_generate(
    payload: dict = Body(...),
    user: User = Depends(get_current_user),
) -> dict:
    """§5.5 call 1 — 4 transcripts; §13.3 voices injected before return."""
    messages = prompts.listening_generation_messages(payload)
    data = _require_dict(await chat_json_with_fallback(Task.LISTENING_GEN, messages))
    parts = data.get("parts")
    if isinstance(parts, list):
        for part in parts:
            if isinstance(part, dict):
                prompts.assign_speaker_voices(part)      # §13.3 — server-side resolution
    return data


@router.post("/listening/questions")
async def listening_questions(
    payload: dict = Body(...),
    user: User = Depends(get_current_user),
) -> dict:
    """§5.5 call 2 — 40 questions keyed to the speakers' exact wording.

    The frontend's payload shape is {part, title, speakers: [names],
    lines: [{speaker, text}], mapData?} (File 53); the prompt builder
    wants {title, speakers: [{name, accent}], transcript, mapData} —
    the adapter below bridges the two, keeping mapData when present
    (needed for PLAN_MAP_LABELING banks)."""
    adapted = _adapt_listening_parts(payload.get("parts"))
    messages = prompts.listening_questions_messages(payload, adapted)
    targeted = bool(payload.get("focusTypes"))
    return _require_dict(
        await chat_json_with_fallback(Task.LISTENING_QA, messages, targeted=targeted)
    )


def _adapt_listening_parts(parts: Any) -> list:
    adapted = []
    for part in parts or []:
        if not isinstance(part, dict):
            continue
        speakers = [
            s if isinstance(s, dict) else {"name": str(s)}
            for s in (part.get("speakers") or [])
        ]
        lines = part.get("lines") if part.get("lines") is not None else part.get("transcript")
        adapted.append(
            {
                "title": part.get("title"),
                "speakers": speakers,
                "transcript": lines or [],
                "mapData": part.get("mapData"),
            }
        )
    return adapted


# ── Retrieval warm-up (§8.3) ───────────────────────────────────

@router.post("/warmup/reading")
async def warmup_reading(
    payload: dict = Body(...),
    user: User = Depends(get_current_user),
) -> dict:
    missed = payload.get("missed") or []
    messages = prompts.warmup_questions_messages("reading", missed)
    return _require_dict(await chat_json_with_fallback(Task.WARMUP, messages))


@router.post("/warmup/listening")
async def warmup_listening(
    payload: dict = Body(...),
    user: User = Depends(get_current_user),
) -> dict:
    missed = payload.get("missed") or []
    messages = prompts.warmup_questions_messages("listening", missed)
    return _require_dict(await chat_json_with_fallback(Task.WARMUP, messages))


# ── Module 4: Speaking (§7) ────────────────────────────────────

@router.post("/speaking/generate")
async def speaking_generate(
    payload: dict = Body(...),
    user: User = Depends(get_current_user),
) -> dict:
    """§7.5 call 1 — one whole round: part1[5], cueCard, part3[6]."""
    messages = prompts.speaking_generation_messages(payload)
    return _require_dict(await chat_json_with_fallback(Task.SPEAKING_GEN, messages))


@router.post("/speaking/feedback")
async def speaking_feedback(
    payload: dict = Body(...),
    user: User = Depends(get_current_user),
) -> dict:
    """§7.6 — per-answer feedback after EVERY single answer."""
    messages = prompts.speaking_feedback_messages(payload)
    return _require_dict(await chat_json_with_fallback(Task.SPEAKING_FEEDBACK, messages))