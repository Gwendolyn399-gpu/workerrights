from sqlalchemy.orm import Session

from backend.legal.loader import load_channels, load_legal_documents, load_regions
from backend.models.legal import Channel, LegalDocument, LegalProvision, Region


def seed_all(db: Session) -> None:
    _seed_legal(db)
    _seed_regions(db)
    _seed_channels(db)
    db.commit()


def _seed_legal(db: Session) -> None:
    db.query(LegalProvision).delete()
    db.query(LegalDocument).delete()
    for payload in load_legal_documents():
        document = LegalDocument(
            id=payload["id"],
            title=payload["title"],
            doc_number=payload.get("doc_number", "待核验"),
            issuing_authority=payload.get("issuing_authority", "待核验"),
            region=payload.get("region", "national"),
            region_name=payload.get("region_name", "全国"),
            publish_date=payload.get("publish_date"),
            effective_date=payload.get("effective_date"),
            expiry_date=payload.get("expiry_date"),
            validity=payload.get("validity", "待核验"),
            official_url=payload.get("official_url"),
            official_source_name=payload.get("official_source_name"),
            last_verified_at=payload.get("last_verified_at"),
            verification_status=payload.get("verification_status", "pending"),
            source_note=payload.get("source_note"),
            topics=payload.get("topics", []),
        )
        db.add(document)
        for provision in payload.get("provisions", []):
            db.add(
                LegalProvision(
                    id=provision["id"],
                    document_id=document.id,
                    article=provision.get("article", ""),
                    heading=provision.get("heading", ""),
                    text=provision["text"],
                    topics=provision.get("topics", []),
                    conditions=provision.get("conditions", []),
                    keywords=provision.get("keywords", []),
                    verification_status=provision.get(
                        "verification_status", document.verification_status
                    ),
                )
            )
    db.flush()


def _seed_regions(db: Session) -> None:
    db.query(Region).delete()
    payload = load_regions()
    province = payload["province"]
    province_id = province["id"]
    db.add(
        Region(
            id=province_id,
            name=province["name"],
            level="province",
            parent_id=None,
            official_code=province.get("official_code"),
            sort_order=0,
        )
    )
    for city_index, city in enumerate(payload["cities"], start=1):
        city_id = f"{province_id}-{city['code']}"
        db.add(
            Region(
                id=city_id,
                name=city["name"],
                level="city",
                parent_id=province_id,
                official_code=city.get("code"),
                sort_order=city_index,
            )
        )
        for district_index, district in enumerate(city["districts"], start=1):
            if isinstance(district, str):
                name, code = district, None
            else:
                name, code = district[0], district[1]
            db.add(
                Region(
                    id=f"{city_id}-{district_index:02d}",
                    name=name,
                    level="district",
                    parent_id=city_id,
                    official_code=code,
                    sort_order=district_index,
                )
            )
    db.flush()


def _seed_channels(db: Session) -> None:
    db.query(Channel).delete()
    for payload in load_channels():
        db.add(
            Channel(
                id=payload["id"],
                name=payload["name"],
                category=payload["category"],
                scope=payload.get("scope", "national"),
                priority=payload.get("priority", 99),
                description=payload["description"],
                official_url=payload.get("official_url"),
                access_note=payload.get("access_note"),
                jurisdiction_rule=payload.get("jurisdiction_rule"),
                verification_status=payload.get("verification_status", "pending"),
                last_verified_at=payload.get("last_verified_at"),
                source_note=payload.get("source_note"),
                legal_basis=payload.get("legal_basis", []),
            )
        )
    db.flush()
