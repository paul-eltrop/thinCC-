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
    "All questions have been answered. The onboarding chat is complete. "
    "You can close the chat now."
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
        return "(no relevant matches in the knowledge base)"
    lines = []
    for h in hints:
        source = h.meta.get("source_file", "unknown")
        lines.append(f"- [source: {source}] {h.content.strip()}")
    return "\n".join(lines)


def _format_open_list(open_list: list[Question]) -> str:
    if not open_list:
        return "(none)"
    return "\n".join(f"- [{q.importance}] {q.text}" for q in open_list)


def _format_all_questions_with_status(
    questions: list[Question],
    state: dict[str, QuestionState],
) -> str:
    if not questions:
        return "(no questions defined)"

    lines = []
    for q in questions:
        qs = state.get(q.id)
        status = "open"
        if qs and qs.status == "covered":
            status = "answered"
        elif qs and qs.status:
            status = qs.status
        lines.append(f"- [{q.importance}] {q.text} — {status}")
    return "\n".join(lines)


def _format_current_knowledge(state: dict[str, QuestionState]) -> str:
    lines = [f"- {qs.answer.strip()}" for qs in state.values() if qs and qs.answer]
    if not lines:
        return "(no knowledge collected yet)"
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

    return f"""You are a business analyst onboarding a consulting company.
Your goal: understand the company well enough that for any tender, you
could write a tailored proposal on their behalf.

APPROACH:
1. OPEN START — Start with a broad, open question. Let the user talk
   freely. Extract as many answers as possible from a single reply.
2. CLUSTER FOLLOW-UPS — Group open questions thematically. Ask one
   summarising question per topic block, not individual questions one
   by one.
3. TARGETED GAPS — Use single questions only for critical info you
   could not derive from earlier answers or the knowledge base.

RULES:
- NEVER ask for something you can already derive from the conversation
  or the knowledge base. Confirm instead: "I understood that you do X.
  Correct?"
- After each user reply, briefly summarise what you learned and which
  areas are still open.
- Show progress: "I have a good picture of your company, methodology
  and team. I still need details on references and compliance."
- If the user uploads a document, parse it first and only ask about
  what the document does NOT cover.
- Be conversational, not interrogative. No interview mode.

QUESTION DATABASE:
The following {total} questions need to be answered by the end.
Already answered: {answered_count}
Open: {open_count}

{_format_all_questions_with_status(questions, state)}

CURRENT KNOWLEDGE:
{_format_current_knowledge(state)}

ADDITIONAL CONTEXT FROM KNOWLEDGE BASE (for the next priority question):
{_format_hints(rag_hints)}

Decide yourself which question(s) to address next and whether to ask
them individually or as a cluster. Prioritise by importance."""


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
