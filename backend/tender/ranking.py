# Deterministisches Scoring fuer Tender. Aggregiert Coverage zu einem
# Score 0-100, prueft auf kritische Luecken und leitet eine Empfehlung ab.
# Reine Math, kein LLM.

from tender.state import Recommendation, Requirement, RequirementCoverage, TenderRanking

WEIGHTS = {"critical": 4.0, "high": 2.0, "medium": 1.0, "low": 0.5}
STATUS_FACTOR = {"covered": 1.0, "partial": 0.5, "missing": 0.0}

NO_GO_THRESHOLD = 35.0
APPLY_THRESHOLD = 70.0
MAX_GAPS_IN_REASONING = 3


def _format_reasoning(
    score: float,
    has_critical_gap: bool,
    requirements: list[Requirement],
    coverage: dict[str, RequirementCoverage],
) -> str:
    gaps = [
        r for r in requirements
        if coverage.get(r.id) and coverage[r.id].status != "covered"
    ]
    gaps.sort(key=lambda r: WEIGHTS.get(r.importance, 0), reverse=True)
    top_gaps = gaps[:MAX_GAPS_IN_REASONING]

    if has_critical_gap:
        prefix = f"Kritische Luecke vorhanden, Score {score:.0f}%."
    elif score < APPLY_THRESHOLD:
        prefix = f"Score {score:.0f}% — bewerben mit Zusatz-Input."
    else:
        prefix = f"Score {score:.0f}% — solide Basis fuer Bewerbung."

    if not top_gaps:
        return prefix
    gap_summary = "; ".join(f"{r.importance}: {r.text}" for r in top_gaps)
    return f"{prefix} Top-Luecken: {gap_summary}"


def compute_ranking(
    requirements: list[Requirement],
    coverage: dict[str, RequirementCoverage],
) -> TenderRanking:
    if not requirements:
        return TenderRanking(
            score=0.0,
            recommendation="no_go",
            has_critical_gap=False,
            reasoning="Keine Anforderungen extrahiert.",
        )

    weighted_sum = 0.0
    weight_total = 0.0
    has_critical_gap = False

    for req in requirements:
        weight = WEIGHTS.get(req.importance, 1.0)
        cov = coverage.get(req.id)
        status = cov.status if cov else "missing"
        factor = STATUS_FACTOR.get(status, 0.0)

        weighted_sum += weight * factor
        weight_total += weight

        if req.is_critical and status == "missing":
            has_critical_gap = True

    score = (weighted_sum / weight_total) * 100 if weight_total else 0.0

    recommendation: Recommendation
    if has_critical_gap or score < NO_GO_THRESHOLD:
        recommendation = "no_go"
    elif score < APPLY_THRESHOLD:
        recommendation = "apply_with_input"
    else:
        recommendation = "apply"

    return TenderRanking(
        score=round(score, 1),
        recommendation=recommendation,
        has_critical_gap=has_critical_gap,
        reasoning=_format_reasoning(score, has_critical_gap, requirements, coverage),
    )
