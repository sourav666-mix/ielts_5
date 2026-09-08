"""ATLAS IELTS Academy — application settings.

Every key from the root .env.example (Batch 1) is consumed here or
explicitly ignored (the MYSQL_* values belong to docker compose —
pydantic-settings' extra="ignore" absorbs them harmlessly).

Model IDs are spec §12.3 defaults. ⚠ Slugs age fast — re-check the
provider catalogues before changing them; treat these as snapshots.
"""

import logging
import secrets

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_log = logging.getLogger("app.config")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,     # MODEL_READING_GEN ↔ model_reading_gen
        extra="ignore",           # MYSQL_* etc. are compose's, not ours
    )

    # ── API ───────────────────────────────────────────────────
    api_prefix: str = "/api"      # File 14 calls /api/... via the Vite proxy
    project_name: str = "ATLAS IELTS Academy"

    # ── Database ──────────────────────────────────────────────
    # Default = the docker-compose service name (compose injects the
    # exact same URL). Local runs override with DATABASE_URL —
    # backend/.env ships with a zero-setup SQLite URL so the app
    # runs with no Docker/MySQL installed.
    database_url: str = (
        "mysql+pymysql://atlas:atlas_secret_change_me@mysql:3306/atlas_ielts"
    )

    @field_validator("database_url")
    @classmethod
    def _normalize_database_url(cls, v: str) -> str:
        # Managed-host shorthands:
        # · Render Postgres hands out `postgres://` — SQLAlchemy only
        #   accepts `postgresql://` (psycopg2 is its default driver).
        # · Railway MySQL hands out `mysql://` — SQLAlchemy resolves
        #   that to the MySQLdb driver, which isn't installed; the app
        #   ships PyMySQL, so rewrite to `mysql+pymysql://`.
        if v.startswith("postgres://"):
            return "postgresql://" + v[len("postgres://"):]
        if v.startswith("mysql://"):
            return "mysql+pymysql://" + v[len("mysql://"):]
        return v

    # ── Security ──────────────────────────────────────────────
    # REQUIRED in production — set JWT_SECRET in the host's env
    # (Render dashboard / render.yaml). If it's missing the app no
    # longer hard-crashes at boot (alembic imports this module before
    # serving, so the crash killed the whole deploy); instead an
    # ephemeral secret is minted per boot with a loud warning.
    # ⚠ An ephemeral secret invalidates every token on restart —
    # set the env var for stable sign-ins.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 43200   # 30 days

    @field_validator("jwt_secret")
    @classmethod
    def _jwt_secret_strength(cls, v: str) -> str:
        if not v:
            generated = secrets.token_urlsafe(48)
            _log.warning(
                "JWT_SECRET is not set — minted an EPHEMERAL secret for this "
                "boot only. Every restart/deploy invalidates all sessions. "
                "Set JWT_SECRET in the environment for stable sign-ins."
            )
            return generated
        if len(v) < 32:
            raise ValueError(
                "JWT_SECRET must be at least 32 characters. Generate one with: "
                "python -c 'import secrets; print(secrets.token_urlsafe(48))'"
            )
        return v

    # ── AI providers (spec §12) ───────────────────────────────
    openrouter_api_key: str = ""
    groq_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    groq_base_url: str = "https://api.groq.com/openai/v1"

    # ── Model routing (spec §12.3) ────────────────────────────
    model_reading_gen: str = "deepseek/deepseek-v4-flash"
    model_reading_qa: str = "deepseek/deepseek-v4-flash"
    model_reading_qa_targeted: str = "qwen/qwen3.7-plus"
    model_reading_insight: str = "z-ai/glm-5.2"
    model_listening_gen: str = "deepseek/deepseek-v4-flash"
    model_listening_qa: str = "deepseek/deepseek-v4-flash"
    model_writing_gen: str = "google/gemini-3.8-flash"
    model_writing_grade: str = "openai/gpt-5.6-luna"
    model_writing_vision: str = "qwen/qwen3.8-flash"
    model_speaking_gen: str = "deepseek/deepseek-v4-flash"
    model_speaking_feedback: str = "openai/gpt-5.6-luna"
    model_fallback: str = "google/gemini-3.6-flash"

    # ── Voice (spec §13 — Kokoro-82M only, one provider) ──────
    tts_model: str = "hexgrad/kokoro-82m"
    tts_coach_voice: str = "af_heart"           # §13.5 — the coach's fixed identity
    stt_model: str = "whisper-large-v3-turbo"   # §13.4 — Groq

    # ── Task-1 diagram images (spec §14) ──────────────────────
    image_model: str = "google/gemini-3.1-flash-lite-image"

    # ── CORS ──────────────────────────────────────────────────
    frontend_origin: str = "http://localhost:5173"


settings = Settings()