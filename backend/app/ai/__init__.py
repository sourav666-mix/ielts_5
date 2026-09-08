"""ATLAS IELTS Academy — AI layer (spec §12, §13, §14).

    client.py    one HTTP layer for OpenRouter + Groq: chat, TTS,
                 STT, images — retries, warm errors, robust JSON
    router.py    task → model chains (§12.3) with cross-provider
                 fallback (§12.1) and whole-request deadline budgets
    prompts.py   the §12.4 warm-tone prompt library, §13.3 Kokoro
                 voice resolution, §14.4 image prompt construction

⚠ Batch 11's main.py MUST register an exception handler for
AIError (warm message + .status as JSON {detail}) — otherwise
every AI failure surfaces as a bare 500.
"""

from app.ai.client import AIError
from app.ai.router import Task, chat_json_with_fallback, chat_with_fallback

__all__ = ["AIError", "Task", "chat_with_fallback", "chat_json_with_fallback"]