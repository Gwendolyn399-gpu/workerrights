from collections.abc import Generator

from sqlalchemy import Engine, create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend.config import settings


class Base(DeclarativeBase):
    pass


is_sqlite = settings.database_url.startswith("sqlite")

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if is_sqlite else {},
    pool_pre_ping=True,
)

if is_sqlite:

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _connection_record):  # type: ignore[no-untyped-def]
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrate_case_revisions(bind: Engine) -> None:
    """Upgrade existing SQLite cases without replacing rows; safe to repeat."""
    if bind.dialect.name != "sqlite":
        return
    with bind.begin() as connection:
        columns = {column["name"] for column in inspect(connection).get_columns("cases")}
        if "facts_revision" not in columns:
            connection.execute(text(
                "ALTER TABLE cases ADD COLUMN facts_revision INTEGER NOT NULL DEFAULT 0"
            ))
        if "derived_results" not in columns:
            connection.execute(text(
                "ALTER TABLE cases ADD COLUMN derived_results JSON NOT NULL DEFAULT '{}'"
            ))


def init_database() -> None:
    from backend import models  # noqa: F401  (register mappers)
    from backend.database.seed import seed_all

    Base.metadata.create_all(bind=engine)
    migrate_case_revisions(engine)
    with SessionLocal() as db:
        seed_all(db)
