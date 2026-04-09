# Generiert Proposal-Drafts und beantwortet Improvement-Chats via Haystack
# OpenAIChatGenerator. Beide Funktionen sind tenant-aware: retrieve() bekommt
# IMMER company_id und scoped damit den RAG-Pull strikt auf die eigene Company.

import json
import re

from haystack.components.builders import ChatPromptBuilder
from haystack.components.generators.chat import OpenAIChatGenerator
from haystack.dataclasses import ChatMessage

import config
from pipeline import retrieve

GENERATE_SYSTEM_PROMPT = """You are an experienced bid manager and proposal writer. Create a structured proposal draft based on the tender and the information from our knowledge base.

Here are the relevant sections from our knowledge base:
{% for doc in documents %}
---
Source: {{ doc.meta.source_file }} | Type: {{ doc.meta.doc_type }} | Score: {{ doc.score }}
{{ doc.content }}
---
{% endfor %}

Produce the proposal draft in JSON format. Follow the style of a professional EU institutional proposal with the following structure:

{
  "title": "Meaningful proposal title based on the tender",
  "contracting_authority": "Name of the contracting authority/organisation",
  "sections": [
    {
      "id": "executive-summary",
      "title": "Executive Summary",
      "content": "Summary of the offer in 2-3 paragraphs. Who we are, what we offer, what the outcome is."
    },
    {
      "id": "problem-framing",
      "title": "Problem Framing",
      "content": "Analysis of the problem / task. Why is this relevant, what is the challenge."
    },
    {
      "id": "approach",
      "title": "Proposed Approach",
      "content": "Description of the solution approach. May contain Markdown tables for typologies or categorisations.\\n\\n| Category | Relevance | Approach |\\n|---|---|---|\\n| ... | ... | ... |"
    },
    {
      "id": "methodology",
      "title": "Methodology",
      "content": "Detailed methodology with sub-sections.\\n\\n### 3.1 Phase 1\\nDescription...\\n\\n### 3.2 Phase 2\\nDescription...\\n\\nUse bullet points for lists:\\n- Point 1\\n- Point 2"
    },
    {
      "id": "deliverables",
      "title": "Deliverables",
      "content": "Table of deliverables:\\n\\n| Deliverable | Description | Month |\\n|---|---|---|\\n| D1 | ... | M1-M2 |\\n| D2 | ... | M6 |"
    },
    {
      "id": "team",
      "title": "Team",
      "content": "Table of team members:\\n\\n| Name | Role | Days |\\n|---|---|---|\\n| [PLACEHOLDER: Name] | Project Lead | [PLACEHOLDER] |"
    },
    {
      "id": "pricing",
      "title": "Price",
      "content": "Pricing table:\\n\\n| Cost category | EUR |\\n|---|---|\\n| Staff costs | [PLACEHOLDER] |\\n| ... | ... |\\n| TOTAL (excl. VAT) | [PLACEHOLDER] |"
    }
  ]
}

Rules:
- Write professionally, clearly and precisely
- Use Markdown tables (| col1 | col2 |) for structured data
- Use ### for sub-sections within a section
- Use - for bullet lists
- Use **text** for emphasis
- Use ONLY verifiable information from the provided context. NEVER invent names, numbers, dates, prices or team members.
- NEVER use [PLACEHOLDER] markers
- If ANY information for a section is missing or uncertain, set content to EXACTLY "" (empty string). Do NOT write partial content, do NOT guess, do NOT make up data.
- A section is either COMPLETE with real data or EMPTY. There is no in-between.
- Each section that HAS real data should be substantial, not just headers
- Adapt the number and titles of the sections to the tender — the structure above is a guideline
- Add a top-level field "missing_info" as an array of objects with DETAILED questions. Each object has: {"section": "section title", "questions": ["specific question 1", "specific question 2", ...]}
- The questions must be concrete and actionable, e.g.:
  - BAD: "Please provide team details"
  - GOOD: ["Who is the project lead and how many days will they work?", "List each team member with their role, daily rate, and allocated days", "Are there any external subcontractors involved?"]
  - BAD: "Please provide pricing"
  - GOOD: ["What is the daily rate for each team member?", "Are there travel costs? If so, estimated total?", "Are there any equipment or license costs?", "What is the overhead/indirect cost percentage?"]
- Every section with content "" MUST have a corresponding entry in missing_info with at least 2-3 specific questions
- Respond ONLY with the JSON object, no additional text"""

CHAT_SYSTEM_PROMPT = """You are an experienced bid manager and proposal reviewer. The user is working on a proposal draft and needs help.

Current proposal draft (as JSON sections):
{{ proposal_sections_json }}

Tender:
{{ tender_text }}

Relevant information from the knowledge base:
{% for doc in documents %}
---
{{ doc.content }}
---
{% endfor %}

Your tasks:
- Answer questions about the proposal
- Give concrete improvement suggestions
- Be concrete and actionable, no generic tips

IMPORTANT — When the user asks you to change, rewrite or improve a section:
1. First write a short explanation of what you changed (1-2 sentences)
2. Then deliver the updated sections as a JSON block, enclosed in a ```json ... ``` markdown code block
3. The JSON must be an array of section objects with the fields: id, title, content
4. Deliver ONLY the changed sections in the JSON, not all of them
5. Keep the original section id

Example reply when changing a section:
I revised the executive summary and put more focus on the core competencies.

```json
[{"id": "executive-summary", "title": "Executive Summary", "content": "New improved content..."}]
```

When the user only asks a question or wants feedback, reply normally without a JSON block."""


def generate_proposal_draft(
    tender_text: str,
    company_id: str,
    extra_context: str = "",
) -> dict:
    """Single-Shot Generierung eines Proposal-Drafts. Returnt das raw Response-Text
    aus dem die Frontend-Logik das JSON-Objekt extrahiert."""
    if not tender_text.strip():
        raise ValueError("tender_text must not be empty.")

    documents = retrieve(
        tender_text,
        company_id=company_id,
        top_k=15,
        score_threshold=0.5,
    )

    prompt_builder = ChatPromptBuilder(
        template=[
            ChatMessage.from_system(GENERATE_SYSTEM_PROMPT),
            ChatMessage.from_user(
                "Tender:\n{{ tender_text }}\n\n"
                "Additional context:\n{{ extra_context }}"
            ),
        ],
    )
    llm = OpenAIChatGenerator(model=config.LLM_MODEL)

    prompt_result = prompt_builder.run(
        documents=documents,
        tender_text=tender_text,
        extra_context=extra_context,
    )
    llm_result = llm.run(prompt_result["prompt"])

    return {
        "raw_text": llm_result["replies"][0].text,
        "sources_used": len(documents),
    }


def chat_on_proposal(
    message: str,
    tender_text: str,
    sections: list[dict],
    history: list[dict],
    company_id: str,
) -> dict:
    """Chat-Turn fuer Proposal-Improvements. Wenn die LLM-Antwort einen
    ```json [...]``` Block enthaelt, werden die Section-Updates extrahiert
    und der Code-Block aus der angezeigten Antwort entfernt."""
    if not message.strip():
        raise ValueError("message must not be empty.")

    documents = retrieve(
        message,
        company_id=company_id,
        top_k=8,
        score_threshold=0.5,
    )

    sections_json = json.dumps(sections, ensure_ascii=False)

    messages = [ChatMessage.from_system(CHAT_SYSTEM_PROMPT)]
    for msg in history[-10:]:
        role = msg.get("role")
        content = msg.get("content", "")
        if role == "user":
            messages.append(ChatMessage.from_user(content))
        elif role == "assistant":
            messages.append(ChatMessage.from_assistant(content))
    messages.append(ChatMessage.from_user("{{ user_message }}"))

    prompt_builder = ChatPromptBuilder(template=messages)
    llm = OpenAIChatGenerator(model=config.LLM_MODEL)

    prompt_result = prompt_builder.run(
        documents=documents,
        tender_text=tender_text,
        proposal_sections_json=sections_json,
        user_message=message,
    )
    llm_result = llm.run(prompt_result["prompt"])

    reply_text = llm_result["replies"][0].text
    updated_sections = _extract_section_updates(reply_text)
    display_text = _strip_json_block(reply_text) if updated_sections else reply_text

    return {
        "reply": display_text,
        "updated_sections": updated_sections,
    }


def _extract_section_updates(text: str) -> list[dict] | None:
    matches = re.findall(r"```json\s*(\[[\s\S]*?\])\s*```", text)
    if not matches:
        return None
    all_sections = []
    for block in matches:
        try:
            parsed = json.loads(block)
        except (ValueError, KeyError):
            continue
        if not isinstance(parsed, list):
            continue
        for s in parsed:
            if isinstance(s, dict) and "id" in s and "title" in s and "content" in s:
                all_sections.append({"id": s["id"], "title": s["title"], "content": s["content"]})
    return all_sections or None


def _strip_json_block(text: str) -> str:
    return re.sub(r"\s*```json\s*\[[\s\S]*?\]\s*```\s*", "", text).strip()
