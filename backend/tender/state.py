# Datenmodelle und JSON-Persistenz fuer Tender. Jeder Tender ist eine
# eigene JSON-Datei unter data/tenders/. Schreibvorgaenge sind atomar
# ueber temp file + os.replace, analog zu company.state.

import json
import os
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

TENDERS_DIR = Path(__file__).resolve().parent.parent / "data" / "tenders"

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
    filename: str
    uploaded_at: str
    parsed_text: str
    requirements: list[Requirement] = field(default_factory=list)
    coverage: dict[str, RequirementCoverage] = field(default_factory=dict)
    ranking: Optional[TenderRanking] = None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_tender_id(filename: str) -> str:
    stem = Path(filename).stem.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", stem).strip("-") or "tender"
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return f"{slug}-{timestamp}"


def _tender_path(tender_id: str) -> Path:
    return TENDERS_DIR / f"{tender_id}.json"


def _tender_from_dict(data: dict) -> Tender:
    requirements = [Requirement(**r) for r in data.get("requirements", [])]
    coverage = {
        rid: RequirementCoverage(**c)
        for rid, c in data.get("coverage", {}).items()
    }
    ranking_raw = data.get("ranking")
    ranking = TenderRanking(**ranking_raw) if ranking_raw else None
    return Tender(
        id=data["id"],
        filename=data["filename"],
        uploaded_at=data["uploaded_at"],
        parsed_text=data.get("parsed_text", ""),
        requirements=requirements,
        coverage=coverage,
        ranking=ranking,
    )


def load_tender(tender_id: str) -> Optional[Tender]:
    path = _tender_path(tender_id)
    if not path.exists():
        return None
    raw = json.loads(path.read_text(encoding="utf-8"))
    return _tender_from_dict(raw)


def save_tender(tender: Tender) -> None:
    TENDERS_DIR.mkdir(parents=True, exist_ok=True)
    path = _tender_path(tender.id)

    serialized = {
        "id": tender.id,
        "filename": tender.filename,
        "uploaded_at": tender.uploaded_at,
        "parsed_text": tender.parsed_text,
        "requirements": [asdict(r) for r in tender.requirements],
        "coverage": {rid: asdict(c) for rid, c in tender.coverage.items()},
        "ranking": asdict(tender.ranking) if tender.ranking else None,
    }

    temp_path = path.with_suffix(".json.tmp")
    temp_path.write_text(json.dumps(serialized, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(temp_path, path)


def delete_tender(tender_id: str) -> bool:
    path = _tender_path(tender_id)
    if not path.exists():
        return False
    path.unlink()
    return True


def list_tenders() -> list[dict]:
    """Lightweight Liste aller Tender: id, filename, uploaded_at, score, recommendation."""
    if not TENDERS_DIR.exists():
        return []

    summaries = []
    for path in sorted(TENDERS_DIR.glob("*.json")):
        raw = json.loads(path.read_text(encoding="utf-8"))
        ranking = raw.get("ranking") or {}
        summaries.append({
            "id": raw["id"],
            "filename": raw["filename"],
            "uploaded_at": raw["uploaded_at"],
            "score": ranking.get("score"),
            "recommendation": ranking.get("recommendation"),
            "requirement_count": len(raw.get("requirements", [])),
        })

    summaries.sort(key=lambda s: s["uploaded_at"], reverse=True)
    return summaries
