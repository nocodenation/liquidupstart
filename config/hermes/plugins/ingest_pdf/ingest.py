"""PDF -> RAG ingestion logic for the ingest_pdf Hermes tool.

Ported from config/hermes/tmp/ingest_pdf.py (the standalone host-side script that
the OpenCode ingest_pdf.ts was derived from), adapted to run *inside the Hermes
container* as a non-interactive tool:

  * No argparse / no interactive cost prompt — args come from the tool call.
  * No .env file — config comes from process env (POSTGREST_*, OPENCODE_*).
  * Output is collected into a structured dict + step log instead of printing.
  * Three embedding backends, all over plain `requests` (the `openai` SDK in the
    venv is left untouched to avoid disturbing Hermes' pinned deps):
      - self_hosted: POST $OPENCODE_EMBEDDING_HOST/v1/embeddings  (4096-dim
        llama-embed-nemotron-8b -> vector(4096))
      - openai:      POST https://api.openai.com/v1/embeddings    (text-embedding-3-large,
        3072-dim, zero-padded to 4096 to share the same vector(4096) column; uses $OPENAI_API_KEY)
      - openrouter:  POST https://openrouter.ai/api/v1/embeddings (openai/text-embedding-3-large,
        same OpenAI-compatible shape + 3072->4096 padding; uses $OPENROUTER_API_KEY)

The API-key backends use the provider-native names ($OPENAI_API_KEY /
$OPENROUTER_API_KEY) that Hermes already loads from config/hermes/.env — there
are no OPENCODE_* aliases for them (unlike the OpenCode/OpenClaw ports).

Backend selection (mirrors the OpenCode/OpenClaw ingest_pdf tools):
  - auto: use the only configured backend; if MORE THAN ONE is configured, raise
    BackendChoiceRequired so the tool asks the user to pick (needs_backend_choice).
  - self_hosted / openai / openrouter force one; error if that one isn't configured.
  - the raw float vector is inserted as a pgvector text literal; binary
    quantization is applied at index time by the DB, so we store full precision.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from urllib.parse import quote

import requests

# tiktoken is baked into the image (cache pre-warmed at build time). Fall back to
# char-based chunking if it is somehow unavailable, matching the original script.
try:
    import tiktoken

    _ENCODING = tiktoken.get_encoding("cl100k_base")
    _HAS_TIKTOKEN = True
except Exception:  # pragma: no cover - defensive
    _ENCODING = None
    _HAS_TIKTOKEN = False

# --- Config ---------------------------------------------------------------

DEFAULT_POSTGREST = "http://postgrest_app:3000"  # docker service URL (in-network)
OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"
DEFAULT_OPENAI_MODEL = "text-embedding-3-large"
# OpenRouter exposes the same OpenAI-compatible /embeddings shape; models are
# provider-prefixed (e.g. openai/text-embedding-3-large, 3072-dim).
OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings"
DEFAULT_OPENROUTER_MODEL = "openai/text-embedding-3-large"

# RAG schema column is vector(4096): the self-hosted llama-embed-nemotron-8b emits
# 4096 dims natively; OpenAI's largest model is 3072-dim, so OpenAI vectors are
# right-padded with zeros up to this width to share the same column (the zero
# tail doesn't affect cosine / inner-product ranking within an all-OpenAI table).
EMBED_DIMS = 4096

CHUNK_TOKENS = 400
CHUNK_OVERLAP = 50

OPENAI_BATCH = 64       # OpenAI accepts arrays; batch to cut round-trips
SELF_HOSTED_BATCH = 1   # match the documented single-input self-hosted usage
# rag_chunks insert batch — keep request bodies small (each 4096-dim row is ~37 KB).
PGREST_INSERT_BATCH_HIDIM = 10
PGREST_INSERT_BATCH_LODIM = 50

MAX_RETRIES = 6
INITIAL_BACKOFF_S = 2.0
MAX_BACKOFF_S = 60.0

# OpenAI embedding catalog (for the optional cost estimate / dims default).
EMBED_MODELS = {
    "text-embedding-3-small": {"native_dims": 1536, "configurable": True, "price_per_1m_usd": 0.02},
    "text-embedding-3-large": {"native_dims": 3072, "configurable": True, "price_per_1m_usd": 0.13},
    "text-embedding-ada-002": {"native_dims": 1536, "configurable": False, "price_per_1m_usd": 0.10},
}


class IngestError(Exception):
    """Raised for user-facing configuration / validation failures."""


class BackendChoiceRequired(Exception):
    """Raised when more than one embedding backend is configured but the caller
    didn't pick one (embedding_backend=auto). The tool surfaces this as a prompt
    asking the user to choose, rather than silently defaulting to one backend."""

    def __init__(self, backends: dict[str, str]):
        # backends: {backend_name: human-readable label}
        self.backends = backends
        super().__init__("embedding backend choice required")


# --- PDF -> text ----------------------------------------------------------

def _extract_pages(pdf_path: Path, log) -> list[str]:
    import pypdf

    reader = pypdf.PdfReader(str(pdf_path))
    pages: list[str] = []
    for i, page in enumerate(reader.pages):
        try:
            txt = page.extract_text() or ""
        except Exception as e:
            log(f"  warning: page {i + 1} extract failed: {e}")
            txt = ""
        pages.append(txt)
    return pages


# --- Chunking -------------------------------------------------------------

def _tokens(text: str) -> list[int]:
    return _ENCODING.encode(text) if _HAS_TIKTOKEN else []


def _chunk_text(text: str, chunk_size: int = CHUNK_TOKENS, overlap: int = CHUNK_OVERLAP) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if _HAS_TIKTOKEN:
        toks = _ENCODING.encode(text)
        if len(toks) <= chunk_size:
            return [text]
        step = chunk_size - overlap
        chunks: list[str] = []
        for start in range(0, len(toks), step):
            window = toks[start : start + chunk_size]
            if not window:
                break
            chunks.append(_ENCODING.decode(window))
            if start + chunk_size >= len(toks):
                break
        return chunks
    # Fallback: char-based (1 token ~ 4 chars for English)
    char_size = chunk_size * 4
    char_overlap = overlap * 4
    if len(text) <= char_size:
        return [text]
    step = char_size - char_overlap
    return [text[i : i + char_size] for i in range(0, len(text), step) if text[i : i + char_size]]


def _build_chunks(pages: list[str]) -> list[dict]:
    out: list[dict] = []
    chunk_idx = 0
    for page_no, page_text in enumerate(pages, start=1):
        for piece in _chunk_text(page_text):
            piece_clean = piece.strip()
            if not piece_clean:
                continue
            out.append(
                {
                    "chunk_index": chunk_idx,
                    "content": piece_clean,
                    "token_count": len(_tokens(piece_clean)) if _HAS_TIKTOKEN else None,
                    "metadata": {"page": page_no},
                }
            )
            chunk_idx += 1
    return out


def _estimate_tokens(texts: list[str]) -> int:
    if _HAS_TIKTOKEN:
        return sum(len(_ENCODING.encode(t)) for t in texts)
    return sum(max(1, len(t) // 4) for t in texts)


# --- Embeddings -----------------------------------------------------------

def _retryable_status(status: int | None) -> bool:
    return status in {408, 425, 429, 500, 502, 503, 504}


def _embed_self_hosted(host: str, model: str, texts: list[str], log) -> list[list[float]]:
    url = f"{host.rstrip('/')}/v1/embeddings"
    out: list[list[float]] = []
    total = len(texts)
    for i, text in enumerate(texts):
        attempt = 0
        backoff = INITIAL_BACKOFF_S
        while True:
            try:
                r = requests.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    data=json.dumps({"model": model, "input": text}),
                    timeout=120,
                )
            except requests.RequestException as e:
                attempt += 1
                if attempt > MAX_RETRIES:
                    raise IngestError(f"network error contacting {url}: {e}")
                log(f"  transient network error: {e}; retry {attempt}/{MAX_RETRIES} in {backoff:.1f}s")
                time.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF_S)
                continue
            if r.ok:
                body = r.json()
                # Accept OpenAI-style (data[0].embedding) and llama.cpp-native (embedding).
                vec = None
                if isinstance(body.get("data"), list) and body["data"]:
                    vec = body["data"][0].get("embedding")
                if vec is None:
                    vec = body.get("embedding")
                if not isinstance(vec, list):
                    raise IngestError("embedding response missing 'data[0].embedding' or 'embedding'")
                out.append(vec)
                break
            if not _retryable_status(r.status_code):
                raise IngestError(f"embedding HTTP {r.status_code}: {r.text[:300]}")
            attempt += 1
            if attempt > MAX_RETRIES:
                raise IngestError(f"embedding HTTP {r.status_code} after {MAX_RETRIES} retries: {r.text[:300]}")
            wait = backoff
            ra = r.headers.get("retry-after")
            if ra:
                try:
                    wait = max(wait, float(ra))
                except ValueError:
                    pass
            log(f"  transient HTTP {r.status_code}; retry {attempt}/{MAX_RETRIES} in {wait:.1f}s")
            time.sleep(wait)
            backoff = min(backoff * 2, MAX_BACKOFF_S)
        if (i + 1) % 10 == 0 or i + 1 == total:
            log(f"  embedded {i + 1}/{total}")
    return out


def _pad_to_dims(vec: list[float], dims: int) -> list[float]:
    """Right-pad a vector with zeros up to `dims` (OpenAI <= 3072 -> 4096 column)."""
    if len(vec) == dims:
        return vec
    if len(vec) > dims:
        raise IngestError(f"embedding has {len(vec)} dims, more than the {dims}-dim column")
    return vec + [0.0] * (dims - len(vec))


def _embed_openai_compat(url: str, api_key: str, model: str, texts: list[str], log, label: str) -> list[list[float]]:
    """Embed via an OpenAI-compatible /v1/embeddings endpoint (openai or openrouter).
    `label` is used only in log/error messages."""
    out: list[list[float]] = []
    total = len(texts)
    for i in range(0, total, OPENAI_BATCH):
        batch = texts[i : i + OPENAI_BATCH]
        attempt = 0
        backoff = INITIAL_BACKOFF_S
        while True:
            try:
                r = requests.post(
                    url,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {api_key}",
                    },
                    data=json.dumps({"model": model, "input": batch}),
                    timeout=120,
                )
            except requests.RequestException as e:
                attempt += 1
                if attempt > MAX_RETRIES:
                    raise IngestError(f"network error contacting {label}: {e}")
                log(f"  transient network error ({label}); retry {attempt}/{MAX_RETRIES} in {backoff:.1f}s")
                time.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF_S)
                continue
            if r.ok:
                data = r.json().get("data") or []
                out.extend(_pad_to_dims(d["embedding"], EMBED_DIMS) for d in data)
                break
            # insufficient_quota is permanent — do not retry.
            code = None
            try:
                code = (r.json().get("error") or {}).get("code")
            except Exception:
                pass
            if code == "insufficient_quota":
                raise IngestError(f"{label} insufficient_quota — fix billing and retry")
            if not _retryable_status(r.status_code):
                raise IngestError(f"{label} HTTP {r.status_code}: {r.text[:300]}")
            attempt += 1
            if attempt > MAX_RETRIES:
                raise IngestError(f"{label} HTTP {r.status_code} after {MAX_RETRIES} retries: {r.text[:300]}")
            wait = backoff
            ra = r.headers.get("retry-after")
            if ra:
                try:
                    wait = max(wait, float(ra))
                except ValueError:
                    pass
            log(f"  transient HTTP {r.status_code} ({label}); retry {attempt}/{MAX_RETRIES} in {wait:.1f}s")
            time.sleep(wait)
            backoff = min(backoff * 2, MAX_BACKOFF_S)
        log(f"  embedded {min(i + OPENAI_BATCH, total)}/{total}")
        time.sleep(0.05)
    return out


# --- File fingerprint -----------------------------------------------------

def _file_fingerprint(path: Path, hash_chunk_size: int = 1024 * 1024) -> dict:
    st = path.stat()
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            block = f.read(hash_chunk_size)
            if not block:
                break
            h.update(block)
    return {"file_size": st.st_size, "mtime": st.st_mtime, "sha256": h.hexdigest()}


def _fingerprint_matches(fp_new: dict, meta_existing: dict) -> tuple[bool, str]:
    sha = meta_existing.get("sha256")
    if sha:
        if sha == fp_new["sha256"]:
            return True, "sha256 match"
        return False, f"sha256 differs (db={sha[:12]}..., new={fp_new['sha256'][:12]}...)"
    size_db = meta_existing.get("file_size")
    mtime_db = meta_existing.get("mtime")
    if size_db is not None and mtime_db is not None:
        if size_db == fp_new["file_size"] and abs(mtime_db - fp_new["mtime"]) < 1e-3:
            return True, "size+mtime match"
        return False, (
            f"size/mtime differ (db={size_db}/{mtime_db}, new={fp_new['file_size']}/{fp_new['mtime']})"
        )
    return False, "no fingerprint in existing row"


# --- PostgREST writers ----------------------------------------------------

def _pgrest_get_existing_by_filename(session: requests.Session, base: str, filename: str, log) -> list[dict]:
    url = f"{base}/rag_documents?select=id,filename,source_path,metadata&filename=eq.{quote(filename, safe='')}"
    r = session.get(url, timeout=60)
    if not r.ok:
        log(f"warning: filename lookup failed: {r.status_code} {r.text[:200]}")
        return []
    return r.json()


def _pgrest_insert(session: requests.Session, base: str, table: str, rows: list[dict]) -> list[dict]:
    url = f"{base}/{table}"
    r = session.post(
        url,
        headers={"Content-Type": "application/json", "Prefer": "return=representation"},
        data=json.dumps(rows),
        timeout=120,
    )
    if not r.ok:
        raise IngestError(f"PostgREST insert failed ({table}): {r.status_code} {r.text[:300]}")
    return r.json()


def _vector_literal(vec: list[float]) -> str:
    return "[" + ",".join(f"{x:.7f}" for x in vec) + "]"


# --- Schema preflight -----------------------------------------------------

def _table_exists(session: requests.Session, base: str, table: str) -> bool:
    """True if PostgREST can see the table. A missing table returns 404
    (PGRST205); an existing one returns 200 for a limit=0 select."""
    try:
        r = session.get(f"{base}/{table}?limit=0", timeout=30)
    except requests.RequestException:
        # Can't tell — assume present and let the real insert surface the error.
        return True
    return r.status_code == 200


def _expected_dims(backend: str | None, cfg: dict) -> int:
    # Both backends store vector(4096): self-hosted natively, OpenAI zero-padded.
    return EMBED_DIMS


def _required_schema(dims: int) -> dict:
    """The exact tables + columns this tool writes to, as guidance for the LLM."""
    return {
        "rag_documents": {
            "id": "seqnumber (primary key, auto-increment)",
            "filename": "string (text)",
            "source_path": "string (text)",
            "metadata": "jsonb",
        },
        "rag_chunks": {
            "id": "seqnumber (primary key, auto-increment)",
            "document_id": "integer, references rag_documents(id)",
            "chunk_index": "integer",
            "content": "string (text)",
            "token_count": "integer",
            "metadata": "jsonb",
            "embedding": f"vector({dims})",
        },
    }


def _schema_setup_hint(dims: int) -> list[str]:
    return [
        "Create rag_documents and rag_chunks with the columns in required_schema.",
        "Typed columns can be created with the create_table RPC (map the embedding "
        f"column type 'vector' -> vector({dims})); metadata must be jsonb and "
        "rag_chunks.document_id should reference rag_documents(id) — add those with SQL "
        "if create_table cannot.",
        f"The embedding column MUST be vector({dims}) (raw floats), NOT bit({dims}). "
        f"bit({dims}) is only an internal index projection (binary_quantize(col)::"
        f"bit({dims})); a bit embedding column breaks find_closest_vectors.",
        "After the tables exist, add the index: POST /rpc/create_vector_index with "
        "{\"p_table_name\": \"rag_chunks\", \"p_embedding_column_name\": \"embedding\"}.",
        "See the vector-search skill for the full embed/store/index/search workflow.",
        "Then call ingest_pdf again with the same arguments.",
    ]


# --- Path resolution ------------------------------------------------------

def _resolve_input(raw: str) -> Path:
    p = Path(raw)
    if p.is_absolute():
        return p
    for base in (Path.cwd(), Path("/data")):
        cand = base / raw
        if cand.exists():
            return cand
    return Path.cwd() / raw


def _find_pdfs(folder: Path, log) -> list[Path]:
    pdfs: list[Path] = []
    other = 0
    for entry in folder.iterdir():
        if entry.is_dir():
            continue
        if entry.suffix.lower() == ".pdf":
            pdfs.append(entry)
        else:
            other += 1
    if other:
        log(f"note: {other} non-PDF file(s) in folder skipped")
    pdfs.sort(key=lambda p: p.name.casefold())
    return pdfs


# --- Backend resolution ---------------------------------------------------

def _resolve_backend(args: dict) -> tuple[str, dict]:
    """Return (backend, cfg). backend in {'self_hosted','openai','openrouter'}.
    Raises IngestError when the requested/only backend is unavailable, and
    BackendChoiceRequired when >1 backend is configured under auto."""
    embed_host = os.environ.get("OPENCODE_EMBEDDING_HOST", "").strip()
    embed_model_env = os.environ.get("OPENCODE_EMBEDDING_MODEL", "").strip()
    # Hermes loads config/hermes/.env into the process env at startup
    # (load_hermes_dotenv, override=true), so the API-key backends read the
    # provider-native names that already live in that file — no OPENCODE_* aliases.
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    openrouter_key = os.environ.get("OPENROUTER_API_KEY", "").strip()

    model_override = args.get("model")

    # Build the set of available backends (name -> {cfg, label}). The OpenAI and
    # OpenRouter vectors are zero-padded to EMBED_DIMS in _embed_openai_compat,
    # so every backend fills vector(4096).
    available: dict[str, dict] = {}
    if embed_host and embed_model_env:
        available["self_hosted"] = {
            "cfg": {"host": embed_host, "model": model_override or embed_model_env},
            "label": f"{embed_model_env} via {embed_host} (4096-dim, no API cost)",
        }
    if openai_key:
        available["openai"] = {
            "cfg": {"url": OPENAI_EMBEDDINGS_URL, "key": openai_key, "model": model_override or DEFAULT_OPENAI_MODEL},
            "label": f"{DEFAULT_OPENAI_MODEL} (3072-dim, zero-padded to 4096; uses the OpenAI key/quota)",
        }
    if openrouter_key:
        available["openrouter"] = {
            "cfg": {"url": OPENROUTER_EMBEDDINGS_URL, "key": openrouter_key, "model": model_override or DEFAULT_OPENROUTER_MODEL},
            "label": f"{DEFAULT_OPENROUTER_MODEL} (3072-dim, zero-padded to 4096; uses the OpenRouter key/quota)",
        }

    requested = (args.get("embedding_backend") or "auto").lower()
    if requested != "auto":
        if requested in available:
            return requested, available[requested]["cfg"]
        need = {
            "self_hosted": "OPENCODE_EMBEDDING_HOST and OPENCODE_EMBEDDING_MODEL",
            "openai": "OPENAI_API_KEY",
            "openrouter": "OPENROUTER_API_KEY",
        }
        raise IngestError(f"embedding_backend={requested} requires {need.get(requested, 'its configuration')}")

    # auto
    if not available:
        raise IngestError(
            "no embedding backend configured: set OPENCODE_EMBEDDING_HOST + "
            "OPENCODE_EMBEDDING_MODEL (self-hosted), OPENAI_API_KEY (OpenAI), "
            "or OPENROUTER_API_KEY (OpenRouter)."
        )
    if len(available) == 1:
        name = next(iter(available))
        return name, available[name]["cfg"]
    # More than one available and no explicit choice: ask the user.
    raise BackendChoiceRequired({k: v["label"] for k, v in available.items()})


def _embed(backend: str, cfg: dict, texts: list[str], log) -> list[list[float]]:
    if backend == "self_hosted":
        return _embed_self_hosted(cfg["host"], cfg["model"], texts, log)
    # openai / openrouter share the OpenAI-compatible path; backend name = label.
    return _embed_openai_compat(cfg["url"], cfg["key"], cfg["model"], texts, log, backend)


# --- Orchestration --------------------------------------------------------

def run_ingest(args: dict) -> dict:
    """Run the ingestion. Returns a structured result dict (never raises for the
    expected error cases — those land in result['error'])."""
    log_lines: list[str] = []

    def log(line: str) -> None:
        log_lines.append(line)

    def done(payload: dict) -> dict:
        payload.setdefault("log", "\n".join(log_lines))
        return payload

    raw_input = (args.get("input") or "").strip()
    if not raw_input:
        return done({"success": False, "error": "input is required (PDF file or folder path)"})

    dry_run = bool(args.get("dry_run"))
    estimate_only = bool(args.get("estimate_only"))
    skip_existing = bool(args.get("skip_existing"))
    collision_policy = (args.get("collision_policy") or "fingerprint").lower()

    needs_embed = not (dry_run or estimate_only)
    needs_pgrest = not (dry_run or estimate_only)

    # Resolve embedding backend early so estimate/dry-run can report it, but only
    # *require* it when we will actually embed.
    backend = None
    cfg: dict = {}
    try:
        backend, cfg = _resolve_backend(args)
    except BackendChoiceRequired as e:
        if needs_embed:
            options = ", ".join(f"'{name}'" for name in e.backends)
            return done(
                {
                    "success": False,
                    "needs_backend_choice": True,
                    "error": (
                        "NEEDS USER INPUT — multiple embedding backends are configured. Do NOT "
                        "choose one yourself and do NOT call ingest_pdf again yet. Present these "
                        "options to the user verbatim and STOP your turn until they reply, then "
                        f"re-run ingest_pdf with embedding_backend set to one of: {options}."
                    ),
                    "backends": e.backends,
                }
            )
        log(f"note: multiple embedding backends configured; embedding_backend choice deferred")
    except IngestError as e:
        if needs_embed:
            return done({"success": False, "error": str(e)})
        log(f"note: {e}")

    # PostgREST config
    postgrest_url = (os.environ.get("POSTGREST_URL") or DEFAULT_POSTGREST).rstrip("/")
    api_key = (os.environ.get("POSTGREST_API_KEY") or os.environ.get("API_KEY") or "").strip()
    if needs_pgrest and not api_key:
        return done({"success": False, "error": "POSTGREST_API_KEY not set"})

    # Preflight: for a real ingest, make sure the destination tables exist BEFORE
    # doing the expensive work (reading PDFs + embedding). If they're missing,
    # hand the LLM the exact schema to create so it can set things up and re-run.
    if needs_pgrest:
        pf = requests.Session()
        pf.headers.update({"Authorization": f"Bearer {api_key}"})
        missing = [t for t in ("rag_documents", "rag_chunks") if not _table_exists(pf, postgrest_url, t)]
        if missing:
            dims = _expected_dims(backend, cfg)
            log(f"preflight: missing table(s): {', '.join(missing)}")
            return done(
                {
                    "success": False,
                    "needs_schema": True,
                    "error": (
                        f"required table(s) missing: {', '.join(missing)}. Create the RAG "
                        "schema (see required_schema / setup) before ingesting, then re-run."
                    ),
                    "missing_tables": missing,
                    "embedding_dims": dims,
                    "embedding_backend": backend,
                    "required_schema": _required_schema(dims),
                    "setup": _schema_setup_hint(dims),
                }
            )

    # Resolve input into a list of PDFs
    input_path = _resolve_input(raw_input)
    if input_path.is_file():
        pdf_paths = [input_path]
        folder_mode = False
    elif input_path.is_dir():
        folder_mode = True
        pdf_paths = _find_pdfs(input_path, log)
        if not pdf_paths:
            return done({"success": False, "error": f"no .pdf files found in {input_path}"})
        log(f"folder mode: {len(pdf_paths)} PDF(s) found in {input_path}")
        if args.get("title"):
            log("note: title is ignored in folder mode")
    else:
        return done({"success": False, "error": f"not a file or directory: {input_path}"})

    # Phase 1: parse + chunk + fingerprint
    prepared: list[dict] = []
    parse_failures: list[dict] = []
    for idx, pdf in enumerate(pdf_paths, start=1):
        log(f"\n=== [{idx}/{len(pdf_paths)}] {pdf.name} ===")
        try:
            log(f"[1/5] reading PDF: {pdf}")
            pages = _extract_pages(pdf, log)
            total_chars = sum(len(p) for p in pages)
            log(f"      pages={len(pages)} chars={total_chars}")
            if total_chars == 0:
                raise IngestError("no extractable text (scanned PDF? OCR not supported)")
            log(f"[2/5] chunking (~{CHUNK_TOKENS} tokens, {CHUNK_OVERLAP} overlap, tiktoken={_HAS_TIKTOKEN})")
            chunks = _build_chunks(pages)
            log(f"      chunks={len(chunks)}")
            if not chunks:
                raise IngestError("no chunks produced")
        except Exception as e:
            log(f"  SKIP: parse failure: {type(e).__name__}: {e}")
            parse_failures.append({"file": pdf.name, "error": f"{type(e).__name__}: {e}"})
            continue
        try:
            fp = _file_fingerprint(pdf)
        except Exception as e:
            log(f"  warning: fingerprint failed for {pdf.name}: {e}")
            fp = None
        tokens = _estimate_tokens([c["content"] for c in chunks])
        log(f"      total_tokens~={tokens}" + (f"  sha256={fp['sha256'][:12]}..." if fp else ""))
        prepared.append({"path": pdf, "pages": pages, "chunks": chunks, "tokens": tokens, "fingerprint": fp})

    if not prepared:
        return done(
            {
                "success": False,
                "error": "no PDFs successfully parsed; nothing to ingest",
                "parse_failures": parse_failures,
            }
        )

    # Phase 1b: dedup against rag_documents
    dedup_skips: list[dict] = []
    if skip_existing and not api_key:
        log("warning: skip_existing requires POSTGREST_API_KEY; dedup check disabled")
    if skip_existing and api_key:
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {api_key}"})
        kept: list[dict] = []
        for p in prepared:
            existing = _pgrest_get_existing_by_filename(session, postgrest_url, p["path"].name, log)
            if not existing:
                kept.append(p)
                continue
            existing_ids = [str(r["id"]) for r in existing]
            if collision_policy == "ingest":
                log(f"  collision: {p['path'].name} matches doc_id(s) {','.join(existing_ids)} -- policy=ingest")
                kept.append(p)
                continue
            if collision_policy == "skip":
                reason = f"filename match (doc_id={','.join(existing_ids)}), policy=skip"
                log(f"  SKIP {p['path'].name}: {reason}")
                dedup_skips.append({"file": p["path"].name, "reason": reason})
                continue
            if collision_policy == "fail":
                return done(
                    {
                        "success": False,
                        "error": f"filename match for {p['path'].name} (doc_id={','.join(existing_ids)}); policy=fail",
                    }
                )
            # fingerprint policy
            if not p["fingerprint"]:
                reason = f"filename match (doc_id={','.join(existing_ids)}), local fingerprint unavailable"
                log(f"  SKIP {p['path'].name}: {reason}")
                dedup_skips.append({"file": p["path"].name, "reason": reason})
                continue
            any_match = False
            matched_id = None
            matched_why = ""
            no_fp_rows: list[int] = []
            mismatch_details: list[str] = []
            for row in existing:
                meta = row.get("metadata") or {}
                matched, why = _fingerprint_matches(p["fingerprint"], meta)
                if matched:
                    any_match = True
                    matched_id = row["id"]
                    matched_why = why
                    break
                if "no fingerprint" in why:
                    no_fp_rows.append(row["id"])
                else:
                    mismatch_details.append(f"id={row['id']} {why}")
            if any_match:
                reason = f"fingerprint duplicate of doc_id={matched_id} ({matched_why})"
                log(f"  SKIP {p['path'].name}: {reason}")
                dedup_skips.append({"file": p["path"].name, "reason": reason})
                continue
            if no_fp_rows and not mismatch_details:
                reason = f"filename match (doc_id={','.join(map(str, no_fp_rows))}) has no fingerprint in DB; assuming duplicate"
                log(f"  SKIP {p['path'].name}: {reason}")
                dedup_skips.append({"file": p["path"].name, "reason": reason})
                continue
            log(
                f"  collision: {p['path'].name} matches doc_id(s) {','.join(existing_ids)} "
                "but fingerprint differs -- ingesting as new row"
            )
            kept.append(p)
        prepared = kept
        if not prepared:
            return done(
                {
                    "success": True,
                    "summary": "nothing to ingest after dedup; all files already present",
                    "documents": [],
                    "skipped": dedup_skips,
                    "parse_failures": parse_failures,
                }
            )

    total_tokens = sum(p["tokens"] for p in prepared)
    total_chunks = sum(len(p["chunks"]) for p in prepared)
    backend_label = backend or "<none>"
    log(f"\nbatch total: {len(prepared)} doc(s), {total_chunks} chunk(s), ~{total_tokens} tokens (backend={backend_label})")

    if dry_run:
        sample = prepared[0]["chunks"][0]
        return done(
            {
                "success": True,
                "mode": "dry_run",
                "documents": len(prepared),
                "total_chunks": total_chunks,
                "total_tokens": total_tokens,
                "sample_chunk": {**sample, "content": sample["content"][:300] + "..."},
            }
        )

    if estimate_only:
        payload = {
            "success": True,
            "mode": "estimate_only",
            "documents": len(prepared),
            "total_chunks": total_chunks,
            "total_tokens": total_tokens,
            "backend": backend_label,
        }
        if backend == "openai":
            price = EMBED_MODELS.get(cfg["model"], {}).get("price_per_1m_usd")
            if price is not None:
                payload["est_cost_usd"] = round(total_tokens / 1_000_000 * price, 6)
        return done(payload)

    # Phase 2: embed + insert
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {api_key}"})
    title_override = args.get("title") if not folder_mode else None

    successes: list[dict] = []
    ingest_failures: list[dict] = []
    for idx, p in enumerate(prepared, start=1):
        log(f"\n=== INGEST [{idx}/{len(prepared)}] {p['path'].name} ===")
        try:
            chunk_texts = [c["content"] for c in p["chunks"]]
            log(f"[3/5] embedding via {backend_label} ({cfg.get('model', '')})")
            vecs = _embed(backend, cfg, chunk_texts, log)
            if len(vecs) != len(p["chunks"]):
                raise IngestError(f"embedding count mismatch {len(vecs)} vs {len(p['chunks'])}")
            dims = len(vecs[0]) if vecs else 0

            log("[4/5] inserting rag_documents row")
            doc_meta = {
                "title": title_override or p["path"].stem,
                "page_count": len(p["pages"]),
                "chunk_count": len(p["chunks"]),
                "embed_backend": backend_label,
                "embed_model": cfg.get("model", ""),
                "embed_dims": dims,
                "chunk_tokens": CHUNK_TOKENS,
                "chunk_overlap": CHUNK_OVERLAP,
            }
            if p["fingerprint"]:
                doc_meta.update(p["fingerprint"])
            doc_rows = _pgrest_insert(
                session,
                postgrest_url,
                "rag_documents",
                [{"filename": p["path"].name, "source_path": str(p["path"].resolve()), "metadata": doc_meta}],
            )
            doc_id = doc_rows[0]["id"]
            log(f"      document_id={doc_id}")

            log(f"[5/5] inserting rag_chunks ({len(p['chunks'])} rows)")
            batch = PGREST_INSERT_BATCH_HIDIM if dims > 1024 else PGREST_INSERT_BATCH_LODIM
            for i in range(0, len(p["chunks"]), batch):
                bc = p["chunks"][i : i + batch]
                bv = vecs[i : i + batch]
                rows = [
                    {
                        "document_id": doc_id,
                        "chunk_index": c["chunk_index"],
                        "content": c["content"],
                        "token_count": c["token_count"],
                        "metadata": c["metadata"],
                        "embedding": _vector_literal(v),
                    }
                    for c, v in zip(bc, bv)
                ]
                _pgrest_insert(session, postgrest_url, "rag_chunks", rows)
                log(f"      inserted {min(i + batch, len(p['chunks']))}/{len(p['chunks'])}")

            successes.append({"file": p["path"].name, "document_id": doc_id, "chunks": len(p["chunks"])})
        except Exception as e:
            log(f"  SKIP: ingest failure: {type(e).__name__}: {e}")
            ingest_failures.append({"file": p["path"].name, "error": f"{type(e).__name__}: {e}"})

    return done(
        {
            "success": len(successes) > 0 and not ingest_failures,
            "summary": f"ingested {len(successes)}/{len(pdf_paths)} document(s)",
            "documents": successes,
            "skipped": dedup_skips,
            "parse_failures": parse_failures,
            "ingest_failures": ingest_failures,
            "backend": backend_label,
        }
    )
