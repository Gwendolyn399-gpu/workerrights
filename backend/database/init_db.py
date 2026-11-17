"""Initialize the SQLite database and load legal/region data.

Usage:
    .venv/Scripts/python.exe -m backend.database.init_db
"""

from backend.database.db import init_database


def main() -> None:
    init_database()
    print("Database initialized and knowledge data seeded.")


if __name__ == "__main__":
    main()
