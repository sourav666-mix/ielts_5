# ==============================================================
# ATLAS IELTS Academy — backend image
# Dev (docker-compose.yml) overlays ./backend as /app and runs
#   alembic upgrade head && uvicorn --reload
# so this image's CMD is the PRODUCTION entrypoint; dev just
# replaces it. Self-contained either way.
# ==============================================================

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Dependencies first — the layer Docker can cache.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code (overlaid by the dev bind mount; canonical here).
COPY . .

# Non-root runtime. The dev bind mount is only ever read
# (uvicorn --reload reads; alembic writes nothing).
RUN useradd --create-home appuser
USER appuser

EXPOSE 8000

# JWT_SECRET & friends arrive via environment (compose env_file).
# Production entrypoint (Render Docker / any container host):
# migrate FIRST so a fresh database has today's schema, then serve.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]