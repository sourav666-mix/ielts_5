"""ATLAS IELTS Academy — content generation relays (§4.4, §5.5, §7.5, §8.3, §4.5).

Design: these routes are AUTH + AI relay, nothing more. Normalisation
is the frontend's single gatekeeper (Batches 5–8 contract) — the model's
JSON passes straight back, and a malformed generation surfaces as the
client's warm "didn't come back complete" retry, exactly as built.

LATENCY: generation fans OUT. Output tokens dominate LLM latency, so
each module's work is split into small concurrent requests
(asyncio.gather) and composed back into the EXACT response shape the
original single-call design produced — the frontend contract is
untouched, the wall clock drops from the SUM of all outputs to
roughly the MAX of one piece:

    Reading    theme → 3 passages ∥ → 3 question sets ∥ (merged, renumbered)
    Listening  theme → 4 parts ∥    → 4 question sets ∥ (merged, renumbered)

Two backend-owned responsibilities live here:
  · §13.3 Kokoro voice injection on listening transcripts (server
    resolves one voice per speaker at generation time)
  · §12.3 targeted routing: focusTypes present → the stronger
    question-writing model (READING_QA/LISTENING_QA targeted=True)
"""

import asyncio

from typing import Any

from fastapi import APIRouter, Body, Depends

from app.ai import Task, chat_json_with_fallback
from app.ai import prompts
from app.ai import prompts_parallel as pp
from app.ai.client import AIError, WARM_UNREADABLE
from app.deps import get_current_user
from app.models import User

router = APIRouter(tags=["content"])


def _require_dict(data: Any) -> dict:
    if not isinstance(data, dict):
        raise AIError(WARM_UNREADABLE, 502)
    return data


def _distribute(total: int, buckets: int) -> list[int]:
    """Split `total` questions across `buckets` as evenly as possible
    (later buckets absorb the remainder, matching the real test where
    the hardest section carries the extra questions)."""
    base, extra = divmod(total, buckets)
    return [base + (1 if i >= buckets - extra else 0) for i in range(buckets)]


# ── Module 1: Reading (§4) ────────────────────────────────────

@router.post("/reading/generate")
async def reading_generate(
    payload: dict = Body(...),
    user: User = Depends(get_current_user),
) -> dict:
    """§4.4 call 1 — theme + 3 passages + 30 vocabulary items.

    Parallel form: a tiny theme/titles call first (keeps the three
    passages coherent), then all three passage+vocab calls race
    concurrently and are stitched back in order.
    """
    theme_data = _require_dict(
        await chat_json_with_fallback(
            Task.READING_GEN, pp.reading_theme_messages(payload), max_tokens=300,
        )
    )
    theme = str(theme_data.get("theme") or "").strip() or "Today’s reading"
    titles = [str(t).strip() for t in (theme_data.get("titles") or []) if str(t).strip()]
    while len(titles) < 3:
        titles.append(f"Passage {len(titles) + 1}")

    async def one_passage(index: int) -> dict:
        data = _require_dict(
            await chat_json_with_fallback(
                Task.READING_GEN,
                pp.reading_passage_messages(payload, theme=theme, title=titles[index], index=index),
            )
        )
        passage = data.get("passage")
        if not isinstance(passage, dict) or not str(passage.get("text") or "").strip():
            raise AIError(WARM_UNREADABLE, 502)
        return passage

    passages = list(await asyncio.gather(*(one_passage(i) for i in range(3))))
    return {"theme": theme, "passages": passages}


@router.post("/reading/questions")
async def reading_questions(
    payload: dict = Body(...),
    user: User = Depends(get_current_user),
) -> dict:
    """§4.4 call 2 — 40 questions against the exact passage text.

    Parallel form: one concurrent call PER PASSAGE (13/13/14), then a
    merge that renumbers 1–40 in passage order, stamps the passage
    index server-side (the model's value is never trusted) and
    rebuilds headingBanks — the exact shape the single-call prompt
    produced.
    """
    passages = payload.get("passages") or []
    targeted = bool(payload.get("focusTypes"))          # §12.3 targeted day
    counts = _distribute(40, max(1, len(passages)))

    async def one_passage(index: int, count: int) -> dict:
        return _require_dict(
            await chat_json_with_fallback(
                Task.READING_QA,
                pp.reading_questions_one_messages(
                    payload, passages[index], index=index, count=count, first_number=1,
                ),
                targeted=targeted,
            )
        )

    results = await asyncio.gather(
        *(one_passage(i, counts[i]) for i in range(len(passages)))
    )

    questions: list[dict] = []
    heading_banks: list[list] = []
    number = 1
    for index, data in enumerate(results):
        heading_banks.append(list(data.get("headingBank") or []))
        for q in data.get("questions") or []:
            if not isinstance(q, dict):
                continue
            q = dict(q)
            q["number"] = number            # continuous 1–40, passage order
            q["passage"] = index            # stamped server-side
            questions.append(q)
            number += 1
    return {"questions": questions, "headingBanks": heading_banks}


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
    """§5.5 call 1 — 4 transcripts; §13.3 voices injected before return.

    Parallel form: a tiny theme/scenarios call keeps the four parts
    coherent, then all four part calls race concurrently.
    """
    theme_data = _require_dict(
        await chat_json_with_fallback(
            Task.LISTENING_GEN, pp.listening_theme_messages(payload), max_tokens=300,
        )
    )
    theme = str(theme_data.get("theme") or "").strip() or "Today’s listening"
    specs = [s for s in (theme_data.get("parts") or []) if isinstance(s, dict)]
    while len(specs) < 4:
        specs.append({"title": f"Part {len(specs) + 1}", "scenario": "today’s scenario"})

    async def one_part(part_number: int) -> dict:
        spec = specs[part_number - 1]
        data = _require_dict(
            await chat_json_with_fallback(
                Task.LISTENING_GEN,
                pp.listening_part_messages(
                    payload,
                    theme=theme,
                    title=str(spec.get("title") or f"Part {part_number}"),
                    scenario=str(spec.get("scenario") or ""),
                    part_number=part_number,
                ),
            )
        )
        part = data.get("part")
        if not isinstance(part, dict) and isinstance(data.get("transcript"), list):
            # Some model families drift to emitting the part object at the
            # TOP LEVEL (no "part" wrapper) — unwrap instead of failing.
            part = data
        if (
            not isinstance(part, dict)
            or not isinstance(part.get("transcript") or [], list)
            or not (part.get("transcript") or [])
        ):
            raise AIError(WARM_UNREADABLE, 502)
        return part

    parts = list(await asyncio.gather(*(one_part(n) for n in range(1, 5))))
    for part in parts:
        prompts.assign_speaker_voices(part)      # §13.3 — server-side resolution
    return {"theme": theme, "parts": parts}


@router.post("/listening/questions")
async def listening_questions(
    payload: dict = Body(...),
    user: User = Depends(get_current_user),
) -> dict:
    """§5.5 call 2 — 40 questions keyed to the speakers' exact wording.

    Parallel form: one concurrent call PER PART (10 each), then a merge
    that renumbers 1–40 in part order and stamps the part number
    server-side.

    The frontend's payload shape is {part, title, speakers: [names],
    lines: [{speaker, text}], mapData?} (File 53); the prompt builder
    wants {title, speakers: [{name, accent}], transcript, mapData} —
    the adapter below bridges the two, keeping mapData when present
    (needed for PLAN_MAP_LABELING banks)."""
    adapted = _adapt_listening_parts(payload.get("parts"))
    targeted = bool(payload.get("focusTypes"))
    counts = _distribute(40, max(1, len(adapted)))

    async def one_part(part_number: int, count: int) -> dict:
        return _require_dict(
            await chat_json_with_fallback(
                Task.LISTENING_QA,
                pp.listening_questions_one_messages(
                    payload,
                    adapted[part_number - 1],
                    part_number=part_number,
                    count=count,
                    first_number=1,
                ),
                targeted=targeted,
            )
        )

    results = await asyncio.gather(
        *(one_part(n, counts[n - 1]) for n in range(1, len(adapted) + 1))
    )

    questions: list[dict] = []
    number = 1
    for part_index, data in enumerate(results):
        for q in data.get("questions") or []:
            if not isinstance(q, dict):
                continue
            q = dict(q)
            q["number"] = number            # continuous 1–40, part order
            q["part"] = part_index + 1      # stamped server-side
            questions.append(q)
            number += 1
    return {"questions": questions}


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