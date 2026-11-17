from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from backend.database.db import Base


class LegalDocument(Base):
    __tablename__ = "legal_documents"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    doc_number: Mapped[str] = mapped_column(String(300), nullable=False, default="待核验")
    issuing_authority: Mapped[str] = mapped_column(String(300), nullable=False)
    region: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    region_name: Mapped[str] = mapped_column(String(80), nullable=False)
    publish_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    effective_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    expiry_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    validity: Mapped[str] = mapped_column(String(120), nullable=False, default="待核验")
    official_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    official_source_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    last_verified_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    verification_status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending")
    source_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    topics: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    provisions: Mapped[list["LegalProvision"]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="LegalProvision.id"
    )


class LegalProvision(Base):
    __tablename__ = "legal_provisions"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    document_id: Mapped[str] = mapped_column(
        ForeignKey("legal_documents.id", ondelete="CASCADE"), index=True, nullable=False
    )
    article: Mapped[str] = mapped_column(String(80), nullable=False)
    heading: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    text: Mapped[str] = mapped_column(Text, nullable=False)
    topics: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    conditions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    keywords: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    verification_status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending")

    document: Mapped[LegalDocument] = relationship(back_populates="provisions")


class Region(Base):
    __tablename__ = "regions"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    level: Mapped[str] = mapped_column(String(20), nullable=False)
    parent_id: Mapped[str | None] = mapped_column(String(80), ForeignKey("regions.id"), nullable=True)
    official_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Channel(Base):
    __tablename__ = "channels"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    scope: Mapped[str] = mapped_column(String(40), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=99)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    official_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    access_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    jurisdiction_rule: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending")
    last_verified_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    legal_basis: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
