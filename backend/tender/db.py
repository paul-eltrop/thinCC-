# Supabase-Persistenz fuer Tenders. Ersetzt das alte JSON-File-Modell aus
# state.py: tenders Row + tender_requirements + tender_coverage werden via
# supabase_service Client gelesen, geschrieben und gejoined.

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Literal, Optional

from auth import supabase_service

Importance = Literal["critical", "high", "medium", "low"]
CoverageStatus = Literal["covered", "partial", "missing"]
Recommendation = Literal["no_go", "apply", "apply_with_input"]


@dataclass
class Requirement:
    id: str
    text: str
    category: str
    importance: Importance
    is_critical: bool
    related_doc_types: list[str] = field(default_factory=list)


@dataclass
class RequirementCoverage:
    requirement_id: str
    status: CoverageStatus = "missing"
    confidence: float = 0.0
    evidence: Optional[str] = None
    sources: list[dict] = field(default_factory=list)
    user_provided: bool = False
    notes: Optional[str] = None


@dataclass
class TenderRanking:
    score: float
    recommendation: Recommendation
    has_critical_gap: bool
    reasoning: str


@dataclass
class Tender:
    id: str
    company_id: str
    name: str
    filename: Optional[str]
    parsed_text: str
    scan_status: str
    requirements: list[Requirement] = field(default_factory=list)
    coverage: dict[str, RequirementCoverage] = field(default_factory=dict)
    ranking: Optional[TenderRanking] = None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_requirement_id(tender_id: str, idx: int) -> str:
    return f"{tender_id}_req_{idx:03d}"


def _row_to_requirement(row: dict) -> Requirement:
    return Requirement(
        id=row["id"],
        text=row["text"],
        category=row["category"],
        importance=row["importance"],
        is_critical=bool(row.get("is_critical")),
        related_doc_types=list(row.get("related_doc_types") or []),
    )


def _row_to_coverage(row: dict) -> RequirementCoverage:
    return RequirementCoverage(
        requirement_id=row["requirement_id"],
        status=row.get("status", "missing"),
        confidence=float(row.get("confidence") or 0.0),
        evidence=row.get("evidence"),
        sources=list(row.get("sources") or []),
        user_provided=bool(row.get("user_provided")),
        notes=row.get("notes"),
    )


def load_tender_full(company_id: str, tender_id: str) -> Optional[Tender]:
    sb = supabase_service()
    tender_row = (
        sb.table("tenders")
        .select("*")
        .eq("id", tender_id)
        .eq("company_id", company_id)
        .maybe_single()
        .execute()
    )
    if not tender_row or not tender_row.data:
        return None
    row = tender_row.data

    req_rows = (
        sb.table("tender_requirements")
        .select("*")
        .eq("tender_id", tender_id)
        .order("req_idx")
        .execute()
        .data
        or []
    )
    requirements = [_row_to_requirement(r) for r in req_rows]

    coverage_map: dict[str, RequirementCoverage] = {}
    if requirements:
        cov_rows = (
            sb.table("tender_coverage")
            .select("*")
            .in_("requirement_id", [r.id for r in requirements])
            .execute()
            .data
            or []
        )
        coverage_map = {c["requirement_id"]: _row_to_coverage(c) for c in cov_rows}

    ranking = None
    if row.get("score") is not None and row.get("recommendation"):
        ranking = TenderRanking(
            score=float(row["score"]),
            recommendation=row["recommendation"],
            has_critical_gap=bool(row.get("has_critical_gap")),
            reasoning=row.get("reasoning") or "",
        )

    return Tender(
        id=row["id"],
        company_id=row["company_id"],
        name=row.get("name") or "",
        filename=row.get("filename"),
        parsed_text=row.get("parsed_text") or "",
        scan_status=row.get("scan_status") or "pending",
        requirements=requirements,
        coverage=coverage_map,
        ranking=ranking,
    )


def set_parsed_text(tender_id: str, text: str) -> None:
    supabase_service().table("tenders").update({"parsed_text": text}).eq("id", tender_id).execute()


def clear_scan_state(tender_id: str) -> None:
    sb = supabase_service()
    sb.table("tender_requirements").delete().eq("tender_id", tender_id).execute()
    sb.table("tenders").update({
        "scan_status": "pending",
        "score": None,
        "recommendation": None,
        "has_critical_gap": None,
        "reasoning": None,
        "requirement_count": 0,
        "scanned_at": None,
    }).eq("id", tender_id).execute()


def insert_requirement(tender_id: str, requirement: Requirement, idx: int) -> None:
    row = {
        "id": requirement.id,
        "tender_id": tender_id,
        "req_idx": idx,
        "text": requirement.text,
        "category": requirement.category,
        "importance": requirement.importance,
        "is_critical": requirement.is_critical,
        "related_doc_types": requirement.related_doc_types,
    }
    supabase_service().table("tender_requirements").insert(row).execute()


def upsert_coverage(coverage: RequirementCoverage) -> None:
    row = {
        "requirement_id": coverage.requirement_id,
        "status": coverage.status,
        "confidence": float(coverage.confidence),
        "evidence": coverage.evidence,
        "sources": coverage.sources,
        "user_provided": coverage.user_provided,
        "notes": coverage.notes,
        "updated_at": now_iso(),
    }
    (
        supabase_service()
        .table("tender_coverage")
        .upsert(row, on_conflict="requirement_id")
        .execute()
    )


def update_tender_scan_meta(tender_id: str, **fields) -> None:
    if not fields:
        return
    supabase_service().table("tenders").update(fields).eq("id", tender_id).execute()


def serialize_tender(tender: Tender) -> dict:
    return {
        "id": tender.id,
        "company_id": tender.company_id,
        "name": tender.name,
        "filename": tender.filename,
        "scan_status": tender.scan_status,
        "requirements": [asdict(r) for r in tender.requirements],
        "coverage": {rid: asdict(c) for rid, c in tender.coverage.items()},
        "ranking": asdict(tender.ranking) if tender.ranking else None,
    }
