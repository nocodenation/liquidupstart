"""Hermes plugin: ingest PDFs into the WebDB Playground RAG store.

Registers a single LLM-callable tool, ``ingest_pdf``. The heavy lifting lives
in :mod:`ingest`; this module only declares the tool schema and wires the
handler into the plugin registry via ``register(ctx)``.

Loaded by Hermes from ``~/.hermes/plugins/ingest_pdf/`` (mounted there from
``config/hermes/plugins/ingest_pdf`` in this repo). Enable it by adding
``ingest_pdf`` to ``plugins.enabled`` in ``~/.hermes/config.yaml``.
"""

from __future__ import annotations

import json

from .ingest import run_ingest

# The description fields are what the LLM sees and steer when/how it invokes the tool.
INGEST_PDF_SCHEMA = {
    "name": "ingest_pdf",
    "description": (
        "Ingest a PDF (or a folder of PDFs) into the RAG store (rag_documents, "
        "rag_chunks) via PostgREST. Extracts text page-by-page, chunks ~400 "
        "tokens with 50-token overlap, embeds each chunk, and inserts rows with "
        "the raw 4096-dim float vector. The embedding backend is the self-hosted "
        "OPENCODE_EMBEDDING_HOST endpoint, OpenAI (OPENAI_API_KEY), or "
        "OpenRouter (OPENROUTER_API_KEY); if only one is configured it is "
        "used automatically, and if MORE THAN ONE is configured the tool returns "
        "needs_backend_choice=true so you can ask the user to pick (then re-run "
        "with embedding_backend set). Returns a JSON summary "
        "(documents created, chunk counts, skips, failures) plus a step log. "
        "If the destination tables (rag_documents, rag_chunks) do not exist yet, the "
        "tool does NO work and instead returns needs_schema=true with the exact "
        "required_schema and setup steps — create those tables, then call this tool "
        "again with the same arguments."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "input": {
                "type": "string",
                "description": (
                    "Absolute path, or path relative to the working dir / /data, "
                    "to a PDF file OR a folder of PDFs (non-recursive). "
                    "User-uploaded files typically live under /data."
                ),
            },
            "title": {
                "type": "string",
                "description": (
                    "Override the document title (single-file mode only; ignored "
                    "for folders). Defaults to the filename stem."
                ),
            },
            "dry_run": {
                "type": "boolean",
                "description": "Parse + chunk only; do not embed or write to the DB.",
            },
            "estimate_only": {
                "type": "boolean",
                "description": (
                    "Report chunk + token totals (and OpenAI cost estimate when "
                    "the OpenAI backend is selected), then stop. No API/DB calls."
                ),
            },
            "skip_existing": {
                "type": "boolean",
                "description": (
                    "Look up the filename in rag_documents and skip if already "
                    "ingested (see collision_policy)."
                ),
            },
            "collision_policy": {
                "type": "string",
                "enum": ["fingerprint", "skip", "ingest", "fail"],
                "description": (
                    "How to handle a filename match when skip_existing is set. "
                    "fingerprint (default): compare size+mtime+sha256, skip if same, "
                    "ingest a new row if different. skip: always skip. ingest: always "
                    "ingest a new row. fail: abort the batch."
                ),
            },
            "embedding_backend": {
                "type": "string",
                "enum": ["auto", "self_hosted", "openai", "openrouter"],
                "description": (
                    "Embedding backend. auto (default): use the only configured "
                    "backend; if MORE THAN ONE of self-hosted (OPENCODE_EMBEDDING_"
                    "HOST+MODEL), OpenAI (OPENAI_API_KEY) and OpenRouter "
                    "(OPENROUTER_API_KEY) is configured, the tool returns "
                    "needs_backend_choice so you can ask the user. self_hosted / "
                    "openai / openrouter force one. OpenAI/OpenRouter vectors "
                    "(3072-dim) are zero-padded to the 4096-dim column."
                ),
            },
            "model": {
                "type": "string",
                "description": (
                    "Override the embedding model. Self-hosted: defaults to "
                    "OPENCODE_EMBEDDING_MODEL. OpenAI: text-embedding-3-large. "
                    "OpenRouter: openai/text-embedding-3-large."
                ),
            },
        },
        "required": ["input"],
    },
}


def _handle_ingest_pdf(args: dict, **_kw) -> str:
    """Tool entrypoint. Must return a JSON string and never raise."""
    try:
        result = run_ingest(args or {})
        return json.dumps(result, ensure_ascii=False)
    except Exception as exc:  # belt-and-suspenders; run_ingest already guards
        return json.dumps(
            {"success": False, "error": f"{type(exc).__name__}: {exc}"},
            ensure_ascii=False,
        )


def _check_available() -> bool:
    """Always advertise the tool; missing-config is reported at call time so the
    model learns *why* it cannot ingest (per the design notes), rather than the
    tool silently disappearing."""
    return True


def register(ctx) -> None:
    """Entry point called once by the Hermes plugin loader."""
    ctx.register_tool(
        name="ingest_pdf",
        toolset="rag",
        schema=INGEST_PDF_SCHEMA,
        handler=_handle_ingest_pdf,
        check_fn=_check_available,
        emoji="📄",
    )
