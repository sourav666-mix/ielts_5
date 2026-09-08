"""ATLAS IELTS Academy — writing routes (§6, §14).

/writing/grade implements §12.3's two-step photo/PDF routing:
    cheap vision model transcribes the upload → strong grading
    model marks the transcription (with a transcribed=True flag so
    the prompt grades the handwriting's errors, not a cleaned text).
The transcription rides back as `extractedText` for the results view
(File 63's normalizeFeedback reads it).

/writing/model-answer enforces §6.6 SERVER-SIDE: Mock phase → 403.
The frontend hides the button too, but the server is the rule.
"""

import base64
import json

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile

from app.ai import Task, chat_json_with_fallback
from app.ai import prompts
from app.ai.client import AIError, WARM_UNREADABLE, generate_image
from app.deps import get_current_user
from app.models import User

router = APIRouter(tags=["writing"])

MAX_FILE_BYTES = 10 * 1024 * 1024   # matches the frontend's cap (File 67)


def _require_dict(data) -> dict:
    if not isinstance(data, dict):
        raise AIError(WARM_UNREADABLE, 502)
    return data


def _target_band(user: User) -> float:
    profile = user.profile
    return float(profile.target_band) if profile is not None else 6.5


@router.post("/writing/generate")
async def writing_generate(
    payload: dict = Body(...),
    user: User = Depends(get_current_user),
) -> dict:
    """§6.2/§6.3 — Task 1 (visual + chartData) + Task 2 (essay type)."""
    messages = prompts.writing_generation_messages(payload)
    return _require_dict(await chat_json_with_fallback(Task.WRITING_GEN, messages))


# ── /writing/grade — multipart, vision two-step (§6.4/§6.5) ────

def _media_kind(file: UploadFile) -> str:
    mime = (file.content_type or "").lower()
    name = (file.filename or "").lower()
    if mime.startswith("image/") or name.endswith((".jpg", ".jpeg", ".png", ".webp", ".heic")):
        return "image"
    if mime == "application/pdf" or name.endswith(".pdf"):
        return "pdf"
    raise AIError("That file type won't work — a photo or a PDF, please.", 400)


async def _resolve_text(file: UploadFile | None, label: str, typed_text: str):
    """Vision-transcribe an upload, or fall back to typed text.

    Returns (text_for_grading, transcribed_flag, extracted_text, word_count).
    """
    if file is None:
        return typed_text, False, None, None

    raw = await file.read()
    if not raw:
        return typed_text, False, None, None
    if len(raw) > MAX_FILE_BYTES:
        raise AIError(
            "That file is over 10 MB — a photo of one essay should be well under.", 413
        )

    kind = _media_kind(file)
    mime = (file.content_type or "").lower() or (
        "application/pdf" if kind == "pdf" else "image/jpeg"
    )
    data_url = f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"

    vision = _require_dict(
        await chat_json_with_fallback(
            Task.WRITING_VISION,
            prompts.writing_vision_messages(
                task_label=label,
                media_kind=kind,
                data_url=data_url,
                filename=file.filename or "upload",
            ),
        )
    )
    text = str(vision.get("transcription") or "").strip()
    if not text:
        raise AIError(
            f"The coach couldn't read that {label.lower()} upload — try a clearer "
            "photo, or type it instead.",
            422,
        )
    words = vision.get("wordCount")
    return text, True, text, words if isinstance(words, int) else None


@router.post("/writing/grade")
async def writing_grade(
    task1: str = Form(...),
    task2: str = Form(...),
    task1Text: str = Form(""),
    task2Text: str = Form(""),
    task1File: UploadFile | None = File(None),
    task2File: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
) -> dict:
    try:
        task1_data = json.loads(task1)
        task2_data = json.loads(task2)
    except ValueError:
        raise AIError("The task details didn't parse — refresh the page and try again.", 400)
    if not isinstance(task1_data, dict) or not isinstance(task2_data, dict):
        raise AIError("The task details didn't parse — refresh the page and try again.", 400)

    # Step 1 — vision transcription of any uploads (§12.3 two-step)
    t1_text, t1_flag, t1_extracted, t1_words = await _resolve_text(task1File, "Task 1", task1Text)
    t2_text, t2_flag, t2_extracted, t2_words = await _resolve_text(task2File, "Task 2", task2Text)

    # Step 2 — grade (transcriptions flagged so the prompt grades the real work)
    messages = prompts.writing_grading_messages(
        task1=task1_data,
        task2=task2_data,
        task1_text=t1_text,
        task2_text=t2_text,
        task1_transcribed=t1_flag,
        task2_transcribed=t2_flag,
        target_band=_target_band(user),
    )
    graded = _require_dict(await chat_json_with_fallback(Task.WRITING_GRADE, messages))

    for key in ("task1", "task2"):
        if not isinstance(graded.get(key), dict):
            raise AIError(WARM_UNREADABLE, 502)

    # Attach the vision layer's results for the frontend (File 63 reads both).
    if t1_extracted is not None:
        graded["task1"]["extractedText"] = t1_extracted
    if isinstance(t1_words, int):
        graded["task1"]["wordCount"] = t1_words
    if t2_extracted is not None:
        graded["task2"]["extractedText"] = t2_extracted
    if isinstance(t2_words, int):
        graded["task2"]["wordCount"] = t2_words
    return graded


# ── /writing/model-answer — §6.6, enforced server-side ────────

@router.post("/writing/model-answer")
async def writing_model_answer(
    payload: dict = Body(...),
    user: User = Depends(get_current_user),
) -> dict:
    profile = user.profile
    if profile is not None and profile.phase != "practice":
        raise HTTPException(
            status_code=403,
            detail=(
                "Model answers are a Training-phase companion — under Mock conditions "
                "they're switched off, just like the real exam."
            ),
        )

    task_key = payload.get("task")
    task_data = payload.get("taskData")
    if task_key not in ("task1", "task2") or not isinstance(task_data, dict):
        raise AIError("That model-answer request didn't parse — refresh and try again.", 400)

    messages = prompts.writing_model_answer_messages(
        task_data,
        task_number=1 if task_key == "task1" else 2,
        target_band=_target_band(user),
    )
    return _require_dict(await chat_json_with_fallback(Task.WRITING_MODEL, messages))


# ── /writing/image — §14.4, process/map only ───────────────────

def _infer_visual_type(chart_data: dict) -> str:
    if isinstance(chart_data.get("steps"), list):
        return "process_diagram"
    if isinstance(chart_data.get("before"), dict) and isinstance(chart_data.get("after"), dict):
        return "map"
    raise AIError(
        "Charts and tables stay as real data — only process and map visuals get illustrated.",
        400,
    )


@router.post("/writing/image")
async def writing_image(
    payload: dict = Body(...),
    user: User = Depends(get_current_user),
) -> dict:
    chart_data = payload.get("chartData")
    if not isinstance(chart_data, dict):
        raise AIError("That diagram request didn't parse — refresh and try again.", 400)

    visual_type = payload.get("visualType") or _infer_visual_type(chart_data)
    if visual_type not in ("process_diagram", "map"):
        raise AIError(
            "Charts and tables stay as real data — only process and map visuals get illustrated.",
            400,
        )

    prompt = prompts.task1_image_prompt(visual_type, chart_data)
    url = await generate_image(prompt)
    return {"url": url}