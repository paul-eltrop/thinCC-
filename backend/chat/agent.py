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


def gather_rag_hints(question: Question) -> list[Document]:
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


def build_system_prompt(
    question: Question,
    open_list: list[Question],
    rag_hints: list[Document],
    state: dict[str, QuestionState],
) -> str:
    qs = state.get(question.id)
    notes = qs.notes if qs and qs.notes else "(keine)"
    remaining = len(open_list)

    return f"""Du bist ein freundlicher Onboarding-Agent fuer ein Beratungsunternehmen.
Deine Aufgabe ist es, fehlende Informationen ueber die Firma zu sammeln, damit
sie sich auf Tender bewerben kann. Du fuehrst den User durch eine Liste offener
Fragen — eine nach der anderen.

REGELN:
- Stelle IMMER nur EINE Frage pro Nachricht.
- Sei kurz, freundlich, professionell. Keine langen Vortraege.
- Wenn du in der Wissensbasis schon Hinweise findest, formuliere die Frage
  als Verifikation: "Ich habe gefunden, dass ihr X. Stimmt das noch?"
- Wenn die Wissensbasis nichts hergibt, stelle die Frage offen.
- Erwaehne kurz wieviele Fragen noch ausstehen, damit der User Orientierung hat.
- Wenn der User mit deiner Frage fertig ist, kommt die naechste Frage automatisch
  im naechsten Turn — du musst nicht "weiter?" fragen.

KONTEXT:
Noch offene Fragen ({remaining} insgesamt):
{_format_open_list(open_list)}

AKTUELLE FRAGE (die du jetzt stellen sollst):
ID: {question.id}
Importance: {question.importance}
Frage: {question.text}
Scanner-Notes: {notes}

VORWISSEN aus der Wissensbasis fuer diese Frage:
{_format_hints(rag_hints)}

Stelle jetzt die aktuelle Frage in einem Satz, ggf. mit Verifikations-Hinweis
falls oben Vorwissen steht."""


def _persist_user_answer(question_id: str, answer: str) -> None:
    from company.questions import get_question

    question = get_question(question_id)
    if not question:
        return

    write_qa_to_rag(question_id, question.text, answer)
    update_question_state(
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
) -> NextTurn:
    if current_question_id and history and history[-1].role == "user":
        answer_text = history[-1].content.strip()
        if answer_text:
            _persist_user_answer(current_question_id, answer_text)

    questions = load_questions()
    state = load_state()
    next_question = pick_next_question(state, questions)

    if next_question is None:
        return NextTurn(current_question_id=None, done=True, system_prompt=DONE_PROMPT)

    open_list = open_questions(state, questions)
    rag_hints = gather_rag_hints(next_question)
    system_prompt = build_system_prompt(next_question, open_list, rag_hints, state)

    return NextTurn(
        current_question_id=next_question.id,
        done=False,
        system_prompt=system_prompt,
    )
