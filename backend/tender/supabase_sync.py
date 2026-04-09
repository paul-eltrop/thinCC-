# Synchronisiert Tender-Metadaten in die Supabase tenders-Tabelle, damit
# das Frontend Listen via RLS holen kann. Nur Metadaten — die fette
# Coverage/Requirements-Map bleibt im JSON-File auf dem Backend.

from auth import supabase_service
from tender.state import Tender


def upsert_tender_row(tender: Tender, company_id: str) -> None:
    """Schreibt id/name/slug/status/score/recommendation/requirement_count nach
    public.tenders. Nutzt den Service-Client (bypassed RLS), weil das Backend
    schon ueber die JWT-Dependency die company_id authentifiziert hat."""
    score = tender.ranking.score if tender.ranking else None
    recommendation = tender.ranking.recommendation if tender.ranking else None

    row = {
        "id": tender.id,
        "company_id": company_id,
        "name": tender.filename,
        "slug": tender.id,
        "status": _status_from_recommendation(recommendation),
        "score": score,
        "recommendation": recommendation,
        "requirement_count": len(tender.requirements),
    }

    supabase_service().table("tenders").upsert(row, on_conflict="id").execute()


def delete_tender_row(tender_id: str) -> None:
    supabase_service().table("tenders").delete().eq("id", tender_id).execute()


def _status_from_recommendation(recommendation: str | None) -> str:
    if recommendation == "no_go":
        return "rejected"
    if recommendation == "apply":
        return "ready"
    if recommendation == "apply_with_input":
        return "drafting"
    return "new"
