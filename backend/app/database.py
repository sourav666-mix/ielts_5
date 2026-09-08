"""ATLAS IELTS Academy — database engine, session, Base.

Discipline (documented once, honoured everywhere in Batches 10–11):

* JSON columns carry no in-place mutation tracking. Services must
  always ASSIGN FRESH objects (row.record = new_dict) — the
  frontend's PUT-full-object contract makes that natural.
* expire_on_commit=False so JSON-heavy responses can be built after
  commit without refresh churn.
* All datetimes are NAIVE UTC (see models.utcnow). MySQL DATETIME
  stores wall-clock; storing UTC consistently removes the classic
  aware/naive comparison bug.
* utf8mb4 is enforced twice: MySQL server flags (docker compose) +
  the explicit connect charset below (PyMySQL 1.x defaults to it,
  but explicit beats implicit in a production build).
"""

from collections.abc import Generator

from sqlalchemy import MetaData, create_engine
from sqlalchemy.orm import Session, DeclarativeBase, sessionmaker

from app.config import settings

# Deterministic constraint names — keeps autogenerate diffs clean.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(referred_table_name)s_%(column_0_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


# SQLite (the zero-setup local-dev default) rejects MySQL-only
# driver args and needs no pool churn; MySQL keeps the tuned pool.
# NOTE: the utf8mb4 charset arg is MySQL-ONLY — passing it to
# psycopg2 (Render PostgreSQL) fails at connect time.
_IS_SQLITE = settings.database_url.startswith("sqlite")
_IS_MYSQL = settings.database_url.startswith("mysql")

engine = create_engine(
    settings.database_url,
    pool_pre_ping=not _IS_SQLITE,   # survive MySQL wait_timeout drops
    pool_recycle=3600,
    pool_size=10,
    max_overflow=20,
    connect_args=(
        {"check_same_thread": False}
        if _IS_SQLITE
        else ({"charset": "utf8mb4"} if _IS_MYSQL else {})
    ),
)

if _IS_SQLITE:
    # Local-dev convenience: the Docker path migrates via Alembic,
    # but there is no Alembic/MySQL locally, so provision the file
    # database's schema directly on first boot. Import the model
    # modules first so every table is registered on Base.metadata —
    # models.py imports Base from here, which is already defined
    # above, so this bottom-of-module import is safe (no cycle).
    import app.models as _models  # noqa: F401  (registers tables)

    Base.metadata.create_all(bind=engine)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency — one session per request, always closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()