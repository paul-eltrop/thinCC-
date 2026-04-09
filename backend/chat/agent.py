# Kernlogik des Onboarding-Chat-Agents: bestimmt die naechste offene Frage,
# zieht frische RAG-Hints und baut den System-Prompt fuer den OpenAI-Call.
# Persistiert User-Antworten ueber denselben Pfad wie der direct-answer-endpoint.

from dataclasses import dataclass
from typing import Literal, Optional

from haystack.dataclasses import Document

from company.questions import Question, load_questions
from company.rag_sync import write_qa_to_rag
from company.state import QuestionState, load_state, now_iso, update_question_state
from pipeline import retrieve

CHAT_RETRIEVE_TOP_K = 5
CHAT_RETRIEVE_THRESHOLD = 0.5
IMPORTANCE_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}
STATUS_ORDER = {"missing": 0, "unscanned": 1, "partial": 2, "covered": 3}

DONE_PROMPT = (
    "Alle Fragen sind beantwortet. Der Onboarding-Chat ist abgeschlossen. "
    "Du kannst den Chat jetzt schliessen."
)


@dataclass
class ChatMessage:
    role: Literal["user", "assistant"]
    content: str


@dataclass
class NextTurn:
    current_question_id: Optional[str]
    done: bool
    system_prompt: str


def open_questions(
    state: dict[str, QuestionState],
    questions: list[Question],
) -> list[Question]:
    open_list = []
    for q in questions:
        qs = state.get(q.id)
        if qs and qs.status == "covered":
            continue
        open_list.append(q)

    def sort_key(q: Question) -> tuple[int, int]:
        qs = state.get(q.id)
        status = qs.status if qs else "unscanned"
        return (IMPORTANCE_ORDER.get(q.importance, 99), STATUS_ORDER.get(status, 99))

    open_list.sort(key=sort_key)
    return open_list


def pick_next_question(
    state: dict[str, QuestionState],
    questions: list[Question],
) -> Optional[Question]:
    open_list = open_questions(state, questions)
    return open_list[0] if open_list else None


def gather_rag_hints(question: Question, company_id: str) -> list[Document]:
    filters = None
    if question.related_doc_types:
        allowed_types = list(question.related_doc_types) + ["qa_answer"]
        filters = {
            "field": "meta.doc_type",
            "operator": "in",
            "value": allowed_types,
        }

    return retrieve(
        question.text,
        company_id=company_id,
        filters=filters,
        top_k=CHAT_RETRIEVE_TOP_K,
        score_threshold=CHAT_RETRIEVE_THRESHOLD,
    )


def _format_hints(hints: list[Document]) -> str:
    if not hints:
        return "(keine relevanten Treffer in der Wissensbasis)"
    lines = []
    for h in hints:
        source = h.meta.get("source_file", "unbekannt")
        lines.append(f"- [Quelle: {source}] {h.content.strip()}")
    return "\n".join(lines)


def _format_open_list(open_list: list[Question]) -> str:
    if not open_list:
        return "(keine)"
    return "\n".join(f"- [{q.importance}] {q.text}" for q in open_list)


def _format_all_questions_with_status(
    questions: list[Question],
    state: dict[str, QuestionState],
) -> str:
    if not questions:
        return "(keine Fragen definiert)"

    lines = []
    for q in questions:
        qs = state.get(q.id)
        status = "offen"
        if qs and qs.status == "covered":
            status = "beantwortet"
        elif qs and qs.status:
            status = qs.status
        lines.append(f"- [{q.importance}] {q.text} — {status}")

    return "\n".join(lines)


def _format_current_knowledge(state: dict[str, QuestionState]) -> str:
    lines = []
    for qs in state.values():
        if qs and qs.answer:
            lines.append(f"- {qs.answer.strip()}")

    if not lines:
        return "(keine aktuellen Kenntnisse)"
    return "\n".join(lines)


def build_system_prompt(
    question: Question,
    questions: list[Question],
    open_list: list[Question],
    rag_hints: list[Document],
    state: dict[str, QuestionState],
) -> str:
    total = len(questions)
    answered_count = sum(1 for qs in state.values() if qs and qs.status == "covered")
    open_count = len(open_list)

    return f"""Du bist ein Business-Analyst der ein Beratungsunternehmen onboardet.
Dein Ziel: das Unternehmen so gut verstehen, dass du für jede
Ausschreibung die passende Bewerbung schreiben könntest.

ABLAUF:
1. OFFENER START — Starte mit einer breiten, offenen Frage. Lass den
   User frei erzählen. Extrahiere daraus so viele Antworten wie möglich.
2. CLUSTER-FOLLOW-UPS — Gruppiere offene Fragen thematisch. Stelle
   pro Themenblock eine zusammenfassende Frage, nicht Einzelfragen.
3. GEZIELTE LÜCKEN — Stelle Einzelfragen nur für kritische Infos
   die du nicht ableiten konntest.

REGELN:
- Frage NIEMALS etwas, das du aus dem bisherigen Gespräch oder der
  Wissensbasis ableiten kannst. Bestätige stattdessen: "Ich habe
  verstanden dass ihr X. Korrekt?"
- Fasse nach jeder User-Antwort kurz zusammen was du gelernt hast
  und welche Bereiche noch offen sind.
- Zeig Fortschritt: "Ich habe jetzt ein gutes Bild von eurer Firma,
  Methodik, und eurem Team. Mir fehlen noch Details zu Referenzen
  und Compliance."
- Wenn der User ein Dokument hochlädt, parse es zuerst und stelle
  nur Fragen zu dem was das Dokument NICHT abdeckt.
- Sei conversational, nicht interrogativ. Kein Verhör-Modus.

FRAGEN-DATENBANK:
Die folgenden {total} Fragen müssen am Ende beantwortet sein.
Bereits beantwortet: {answered_count}
Offen: {open_count}

{_format_all_questions_with_status(questions, state)}

BISHERIGES WISSEN:
{_format_current_knowledge(state)}

Entscheide selbst welche Frage(n) du als nächstes adressierst und
ob du sie einzeln oder als Cluster stellst. Priorisiere nach
Importance."""


def _persist_user_answer(company_id: str, question_id: str, answer: str) -> None:
    from company.questions import get_question

    question = get_question(question_id)
    if not question:
        return

    write_qa_to_rag(company_id, question_id, question.text, answer)
    update_question_state(
        company_id,
        question_id,
        status="covered",
        answer=answer,
        confidence=1.0,
        sources=[{"source_file": "company_qa", "score": 1.0}],
        user_provided=True,
        last_scanned=now_iso(),
        notes=None,
    )


def prepare_turn(
    history: list[ChatMessage],
    current_question_id: Optional[str],
    company_id: str,
) -> NextTurn:
    if current_question_id and history and history[-1].role == "user":
        answer_text = history[-1].content.strip()
        if answer_text:
            _persist_user_answer(company_id, current_question_id, answer_text)

    questions = load_questions()
    state = load_state(company_id)
    next_question = pick_next_question(state, questions)

    if next_question is None:
        return NextTurn(current_question_id=None, done=True, system_prompt=DONE_PROMPT)

    open_list = open_questions(state, questions)
    rag_hints = gather_rag_hints(next_question, company_id)
    system_prompt = build_system_prompt(next_question, questions, open_list, rag_hints, state)

    return NextTurn(
        current_question_id=next_question.id,
        done=False,
        system_prompt=system_prompt,
    )
