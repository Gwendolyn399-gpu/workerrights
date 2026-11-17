"""Vector retrieval upgrade path (PostgreSQL + pgvector).

The prototype runs fully offline with ``LegalRetriever`` (Chinese bigram lexical
scoring over SQLite). For production:

1. Set ``DATABASE_URL=postgresql+psycopg://...``.
2. Enable the pgvector extension and add an ``embedding vector(1024)`` column to
   ``legal_provisions``.
3. Generate embeddings for ``heading + text + topics + conditions``.
4. Replace ``LegalRetriever.search`` with a hybrid search (vector + lexical
   score) while keeping the same return shape so agents do not change.

No cloud embedding API is called in this prototype. Implementing this adapter
must not put model keys in the frontend.
"""

from dataclasses import dataclass


@dataclass
class VectorSearchConfig:
    embedding_model: str = "pending"
    dimensions: int = 1024
    hybrid_weight: float = 0.6


def vector_backend_available() -> bool:
    return False
