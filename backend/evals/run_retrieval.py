# Retrieval-Eval-Runner: laedt evals/dataset.json, fragt jede Query gegen
# das echte Qdrant ab (mit und ohne Reranker) und gibt Recall@1/5/10 + MRR
# als Vergleichstabelle aus. Kein LLM noetig — rein retrieval-seitig.

import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from auth import supabase_service
from pipeline import retrieve

DATASET_PATH = Path(__file__).parent / "dataset.json"
DEFAULT_FETCH_K = 10
WAIT_POLL_INTERVAL_SECONDS = 5
WAIT_MAX_SECONDS = 600


def list_indexing_documents(company_id: str) -> list[dict]:
    result = (
        supabase_service()
        .table("documents")
        .select("id, name, uploaded_at")
        .eq("company_id", company_id)
        .eq("status", "indexing")
        .execute()
    )
    return result.data or []


def wait_for_indexing(company_id: str) -> None:
    start = time.time()
    while True:
        pending = list_indexing_documents(company_id)
        if not pending:
            return
        elapsed = int(time.time() - start)
        if elapsed > WAIT_MAX_SECONDS:
            print(f"\nTIMEOUT: {len(pending)} Dokumente immer noch im Indexing nach {WAIT_MAX_SECONDS}s. Abbruch.")
            sys.exit(1)
        names = ", ".join(d["name"] for d in pending[:3])
        suffix = f" (+{len(pending) - 3} weitere)" if len(pending) > 3 else ""
        print(f"  [{elapsed:>3}s] warte auf {len(pending)} Dokument(e): {names}{suffix}")
        time.sleep(WAIT_POLL_INTERVAL_SECONDS)


def ensure_index_ready(company_id: str, wait: bool) -> None:
    pending = list_indexing_documents(company_id)
    if not pending:
        return
    if wait:
        print(f"{len(pending)} Dokument(e) noch im Indexing — warte bis fertig...")
        wait_for_indexing(company_id)
        print("Alle Dokumente ready, starte Eval.\n")
        return
    print(f"ERROR: {len(pending)} Dokument(e) sind noch im Indexing — Eval-Ergebnisse waeren verfaelscht.")
    print("Optionen:")
    print("  1. Mit --wait neustarten, dann wartet das Script automatisch.")
    print("  2. Im UI warten bis alle Cards 'ready' sind und nochmal starten.")
    print("\nAktuell indexierend:")
    for doc in pending:
        print(f"  - {doc['name']} (uploaded {doc['uploaded_at']})")
    sys.exit(1)


def load_dataset() -> dict:
    with open(DATASET_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def is_hit(chunk_source: str, expected_substrings: list[str]) -> bool:
    haystack = (chunk_source or "").lower()
    return any(needle.lower() in haystack for needle in expected_substrings)


def evaluate_query(query_entry: dict, company_id: str, rerank: bool, top_k: int) -> dict:
    filters = None
    if query_entry.get("filters_doc_types"):
        filters = {
            "field": "meta.doc_type",
            "operator": "in",
            "value": query_entry["filters_doc_types"],
        }

    chunks = retrieve(
        query_entry["query"],
        company_id=company_id,
        filters=filters,
        top_k=top_k,
        score_threshold=0.0,
        rerank=rerank,
    )

    expected = query_entry["expected_source_contains"]
    hit_ranks = [
        idx + 1
        for idx, c in enumerate(chunks)
        if is_hit(c.meta.get("source_file", ""), expected)
    ]
    first_hit_rank = hit_ranks[0] if hit_ranks else None

    return {
        "id": query_entry["id"],
        "query": query_entry["query"],
        "retrieved": [c.meta.get("source_file", "?") for c in chunks],
        "first_hit_rank": first_hit_rank,
        "hit_at_1": first_hit_rank == 1,
        "hit_at_5": first_hit_rank is not None and first_hit_rank <= 5,
        "hit_at_10": first_hit_rank is not None and first_hit_rank <= 10,
        "mrr": (1.0 / first_hit_rank) if first_hit_rank else 0.0,
    }


def aggregate(results: list[dict]) -> dict:
    n = len(results) or 1
    return {
        "count": len(results),
        "recall_at_1": sum(r["hit_at_1"] for r in results) / n,
        "recall_at_5": sum(r["hit_at_5"] for r in results) / n,
        "recall_at_10": sum(r["hit_at_10"] for r in results) / n,
        "mrr": sum(r["mrr"] for r in results) / n,
    }


def print_table(label: str, agg: dict) -> None:
    print(f"\n{label}")
    print("-" * len(label))
    print(f"  Recall@1   {agg['recall_at_1']:.2%}")
    print(f"  Recall@5   {agg['recall_at_5']:.2%}")
    print(f"  Recall@10  {agg['recall_at_10']:.2%}")
    print(f"  MRR        {agg['mrr']:.3f}")


def print_per_query_diff(no_rerank: list[dict], with_rerank: list[dict]) -> None:
    print("\nPer-Query (rank of first hit, '-' = miss):")
    print(f"  {'id':<6} {'no-rerank':>10} {'rerank':>10}  query")
    for a, b in zip(no_rerank, with_rerank):
        a_rank = str(a["first_hit_rank"]) if a["first_hit_rank"] else "-"
        b_rank = str(b["first_hit_rank"]) if b["first_hit_rank"] else "-"
        print(f"  {a['id']:<6} {a_rank:>10} {b_rank:>10}  {a['query'][:60]}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Retrieval-Eval gegen das echte Qdrant.")
    parser.add_argument("--wait", action="store_true", help="Warte auf laufende Indexing-Jobs statt abzubrechen.")
    args = parser.parse_args()

    company_id = os.environ.get("EVAL_COMPANY_ID", "").strip()
    if not company_id:
        print("ERROR: set EVAL_COMPANY_ID to the company UUID you want to evaluate against.")
        sys.exit(1)

    ensure_index_ready(company_id, wait=args.wait)

    top_k = int(os.environ.get("EVAL_TOP_K", DEFAULT_FETCH_K))
    dataset = load_dataset()
    queries = dataset["queries"]

    print(f"Eval set: {len(queries)} queries, company_id={company_id}, top_k={top_k}")

    no_rerank = [evaluate_query(q, company_id, rerank=False, top_k=top_k) for q in queries]
    with_rerank = [evaluate_query(q, company_id, rerank=True, top_k=top_k) for q in queries]

    print_table("Embedding-only", aggregate(no_rerank))
    print_table("With Cohere Rerank", aggregate(with_rerank))
    print_per_query_diff(no_rerank, with_rerank)


if __name__ == "__main__":
    main()
