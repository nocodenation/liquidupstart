/**
 * OpenCode tool — PDF ingester for the Liquid Upstart RAG store. Extracts text,
 * chunks (~400 tokens / 50 overlap), embeds each chunk, and inserts into
 * rag_documents / rag_chunks via PostgREST (column `vector(2560)`).
 *
 * Backends (resolveBackend): self_hosted (2560-dim native), openai and
 * openrouter (text-embedding-3-large, 3072-dim truncated to 2560). Auto-picks
 * the only one configured; with >1 it asks the user via embedding_backend.
 *
 * Tool surface: input (PDF file/folder), title? (single-file), dry_run?,
 * estimate_only?, skip_existing?, collision_policy?, embedding_backend?.
 */

import { tool } from "@opencode-ai/plugin"
import * as path from "node:path"
import * as fs from "node:fs/promises"
import * as crypto from "node:crypto"
import { getEncoding } from "js-tiktoken"
import { extractText, getDocumentProxy } from "unpdf"

// === Config ===
const DEFAULT_POSTGREST = "http://postgrest_app:3000"
const EMBED_DIMS = 2560 // vector(2560): self-hosted emits this natively; OpenAI is zero-padded/truncated to it
const CHUNK_TOKENS = 400
const CHUNK_OVERLAP = 50
const MAX_RETRIES = 6
const INITIAL_BACKOFF_S = 2.0
const MAX_BACKOFF_S = 60.0

// text-embedding-3-large is 3072-dim (max), so vectors are fit to EMBED_DIMS
// to share the vector(2560) column; truncation/padding does not affect
// cosine/inner-product ranking within a single-backend table.
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"
const DEFAULT_OPENAI_MODEL = "text-embedding-3-large"
// OpenRouter exposes the same /embeddings shape; models are provider-prefixed.
const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings"
const DEFAULT_OPENROUTER_MODEL = "openai/text-embedding-3-large"
const OPENAI_BATCH = 64 // accepts an input array; batch to cut round-trips

type Backend = "self_hosted" | "openai" | "openrouter"
type BackendConfig = { backend: Backend; model: string; host?: string; apiKey?: string; url?: string }

const enc = getEncoding("cl100k_base")

type Chunk = {
    chunk_index: number
    content: string
    token_count: number | null
    metadata: Record<string, unknown>
}

type Fingerprint = { file_size: number; mtime: number; sha256: string }

type Logger = (line: string) => void

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// === PDF -> per-page text ===
async function extractPages(pdfPath: string, log: Logger): Promise<string[]> {
    const buf = await fs.readFile(pdfPath)
    const pdf = await getDocumentProxy(new Uint8Array(buf))
    const result = await extractText(pdf, { mergePages: false })
    const pages: string[] = Array.isArray(result.text) ? result.text : [String(result.text ?? "")]
    for (let i = 0; i < pages.length; i++) {
        if (typeof pages[i] !== "string") {
            log(`  warning: page ${i + 1} extract returned non-string`)
            pages[i] = ""
        }
    }
    return pages
}

// === Chunking ===
function chunkText(text: string, chunkSize = CHUNK_TOKENS, overlap = CHUNK_OVERLAP): string[] {
    const trimmed = text.trim()
    if (!trimmed) return []
    const toks = enc.encode(trimmed)
    if (toks.length <= chunkSize) return [trimmed]
    const step = chunkSize - overlap
    const chunks: string[] = []
    for (let start = 0; start < toks.length; start += step) {
        const window = toks.slice(start, start + chunkSize)
        if (!window.length) break
        chunks.push(enc.decode(window))
        if (start + chunkSize >= toks.length) break
    }
    return chunks
}

function buildChunks(pages: string[]): Chunk[] {
    const out: Chunk[] = []
    let chunkIdx = 0
    pages.forEach((pageText, i) => {
        const pageNo = i + 1
        for (const piece of chunkText(pageText)) {
            const pieceClean = piece.trim()
            if (!pieceClean) continue
            out.push({
                chunk_index: chunkIdx,
                content: pieceClean,
                token_count: enc.encode(pieceClean).length,
                metadata: { page: pageNo },
            })
            chunkIdx++
        }
    })
    return out
}

function estimateTokens(texts: string[]): number {
    return texts.reduce((acc, t) => acc + enc.encode(t).length, 0)
}

// === Embedding via self-hosted OpenAI-compatible endpoint ===
type EmbeddingResponse = {
    data?: Array<{ embedding: number[] }>
    embedding?: number[]
}

function vectorLiteral(vec: number[]): string {
    // pgvector accepts "[v1,v2,...]" as a string literal; PostgREST casts on insert.
    return "[" + vec.map((x) => x.toFixed(7)).join(",") + "]"
}

async function embedText(host: string, model: string, text: string, log: Logger, apiKey?: string): Promise<number[]> {
    const url = `${host.replace(/\/$/, "")}/v1/embeddings`
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`
    let attempt = 0
    let backoff = INITIAL_BACKOFF_S
    while (true) {
        let r: Response
        try {
            r = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify({ model, input: text }),
            })
        } catch (e) {
            // Network-level error (DNS, refused, reset) — treat as transient.
            attempt++
            if (attempt > MAX_RETRIES) throw e
            const msg = (e as { message?: string })?.message ?? String(e)
            log(`  transient network error contacting ${url}: ${msg}, retry ${attempt}/${MAX_RETRIES} in ${backoff.toFixed(1)}s`)
            await sleep(backoff * 1000)
            backoff = Math.min(backoff * 2, MAX_BACKOFF_S)
            continue
        }
        if (r.ok) {
            const body = (await r.json()) as EmbeddingResponse
            // Accept OpenAI-style (data[0].embedding) and llama.cpp-native (embedding).
            const vec = body.data?.[0]?.embedding ?? body.embedding
            if (!Array.isArray(vec)) {
                throw new Error("embedding response missing 'data[0].embedding' or 'embedding'")
            }
            if (vec.length !== EMBED_DIMS) {
                throw new Error(`expected ${EMBED_DIMS} dims, got ${vec.length}`)
            }
            return vec
        }
        // HTTP error — retry only on rate-limit / transient server / timeout codes.
        const retryable = [408, 425, 429, 500, 502, 503, 504].includes(r.status)
        if (!retryable) {
            const txt = await r.text().catch(() => "")
            throw new Error(`embedding HTTP ${r.status}: ${txt}`)
        }
        attempt++
        if (attempt > MAX_RETRIES) {
            const txt = await r.text().catch(() => "")
            throw new Error(`embedding HTTP ${r.status} after ${MAX_RETRIES} retries: ${txt}`)
        }
        let wait = backoff
        const ra = r.headers.get("retry-after")
        if (ra) {
            const n = parseFloat(ra)
            if (Number.isFinite(n)) wait = Math.max(wait, n)
        }
        log(`  transient HTTP ${r.status} from embedding endpoint, retry ${attempt}/${MAX_RETRIES} in ${wait.toFixed(1)}s`)
        await sleep(wait * 1000)
        backoff = Math.min(backoff * 2, MAX_BACKOFF_S)
    }
}

async function embedAll(
    host: string,
    model: string,
    texts: string[],
    log: Logger,
    apiKey?: string,
): Promise<number[][]> {
    // Embed sequentially (one string per request) to match the documented
    // instructions.md usage, even though some servers accept an array.
    const out: number[][] = []
    const total = texts.length
    for (let i = 0; i < total; i++) {
        out.push(await embedText(host, model, texts[i], log, apiKey))
        if ((i + 1) % 10 === 0 || i + 1 === total) {
            log(`  embedded ${i + 1}/${total}`)
        }
    }
    return out
}

// === Embedding via OpenAI-compatible endpoints (openai, openrouter) ===
// Fit a hosted vector to the column width: right-pad short vectors with zeros,
// truncate longer ones (e.g. 3072-dim text-embedding-3-large -> 2560).
async function discoverEmbeddingModel(host: string, apiKey: string | undefined, log: Logger): Promise<string> {
    const url = `${host.replace(/\/$/, "")}/v1/models`
    const headers: Record<string, string> = {}
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`
    const r = await fetch(url, { headers })
    if (!r.ok) throw new Error(`could not list models at ${url}: HTTP ${r.status}`)
    const body = (await r.json()) as { data?: Array<{ id?: string }> }
    const ids = (body.data ?? []).map((m) => m.id).filter((x): x is string => !!x)
    const embeds = ids.filter((id) => /embed/i.test(id))
    if (embeds.length === 1) {
        log(`  auto-detected embedding model: ${embeds[0]}`)
        return embeds[0]
    }
    if (embeds.length > 1) {
        throw new Error(`multiple embedding models at ${url} (${embeds.join(", ")}); the gateway must serve exactly one embedding model (an id containing "embed")`)
    }
    if (ids.length === 1) {
        log(`  using the only model reported by ${url}: ${ids[0]}`)
        return ids[0]
    }
    throw new Error(`could not auto-detect an embedding model from ${url} (${ids.join(", ") || "no models reported"}); the gateway must serve an embedding model (an id containing "embed")`)
}

function padToDims(vec: number[], dims: number): number[] {
    if (vec.length === dims) return vec
    if (vec.length > dims) return vec.slice(0, dims)
    return vec.concat(new Array(dims - vec.length).fill(0))
}

// Embed via an OpenAI-compatible /v1/embeddings endpoint (`label` for logs).
async function embedOpenAICompat(
    url: string,
    apiKey: string,
    model: string,
    texts: string[],
    log: Logger,
    label: string,
): Promise<number[][]> {
    const out: number[][] = []
    const total = texts.length
    for (let i = 0; i < total; i += OPENAI_BATCH) {
        const batch = texts.slice(i, i + OPENAI_BATCH)
        let attempt = 0
        let backoff = INITIAL_BACKOFF_S
        while (true) {
            let r: Response
            try {
                r = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                    body: JSON.stringify({ model, input: batch }),
                })
            } catch (e) {
                attempt++
                if (attempt > MAX_RETRIES) throw e
                const msg = (e as { message?: string })?.message ?? String(e)
                log(`  transient network error contacting ${label}: ${msg}, retry ${attempt}/${MAX_RETRIES} in ${backoff.toFixed(1)}s`)
                await sleep(backoff * 1000)
                backoff = Math.min(backoff * 2, MAX_BACKOFF_S)
                continue
            }
            if (r.ok) {
                const body = (await r.json()) as { data?: Array<{ embedding: number[] }> }
                for (const d of body.data ?? []) out.push(padToDims(d.embedding, EMBED_DIMS))
                break
            }
            const txt = await r.text().catch(() => "")
            // insufficient_quota is permanent — do not retry.
            let code: string | undefined
            try {
                code = (JSON.parse(txt) as { error?: { code?: string } })?.error?.code
            } catch {
                // non-JSON body
            }
            if (code === "insufficient_quota") throw new Error(`${label} insufficient_quota — fix billing and retry`)
            const retryable = [408, 425, 429, 500, 502, 503, 504].includes(r.status)
            if (!retryable) throw new Error(`${label} HTTP ${r.status}: ${txt}`)
            attempt++
            if (attempt > MAX_RETRIES) throw new Error(`${label} HTTP ${r.status} after ${MAX_RETRIES} retries: ${txt}`)
            let wait = backoff
            const ra = r.headers.get("retry-after")
            if (ra) {
                const n = parseFloat(ra)
                if (Number.isFinite(n)) wait = Math.max(wait, n)
            }
            log(`  transient HTTP ${r.status} from ${label}, retry ${attempt}/${MAX_RETRIES} in ${wait.toFixed(1)}s`)
            await sleep(wait * 1000)
            backoff = Math.min(backoff * 2, MAX_BACKOFF_S)
        }
        log(`  embedded ${Math.min(i + OPENAI_BATCH, total)}/${total}`)
    }
    return out
}

// Dispatch to the selected embedding backend.
async function embedChunks(cfg: BackendConfig, texts: string[], log: Logger): Promise<number[][]> {
    if (cfg.backend === "self_hosted") return embedAll(cfg.host!, cfg.model, texts, log, cfg.apiKey)
    return embedOpenAICompat(cfg.url!, cfg.apiKey!, cfg.model, texts, log, cfg.backend)
}

// === Backend resolution ===
type BackendResolution = { ok: true; cfg: BackendConfig } | { ok: false; message: string }

// Env var(s) each backend needs, for "not configured" messages.
const BACKEND_NEED: Record<string, string> = {
    self_hosted: "LOCAL_LLM_API_BASE",
    openai: "OPENAI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
}

type AvailBackend = { backend: Backend; cfg: BackendConfig; label: string }

// The configured backends, in priority order.
function availableBackends(env: NodeJS.ProcessEnv): AvailBackend[] {
    const embedHost = (env.LOCAL_LLM_API_BASE ?? "").trim()
    const embedKey = (env.LOCAL_LLM_API_KEY ?? "").trim()
    // `||` not `??`: a present-but-empty var (compose's `KEY: ${KEY:-}` -> "")
    // falls through to the next source instead of shadowing it.
    const openaiKey = (env.OPENAI_API_KEY || "").trim()
    const openrouterKey = (env.OPENROUTER_API_KEY ?? "").trim()

    const available: AvailBackend[] = []
    if (embedHost) {
        available.push({
            backend: "self_hosted",
            cfg: { backend: "self_hosted", host: embedHost, model: "", apiKey: embedKey || undefined },
            label: `self_hosted: auto-detect via ${embedHost}/v1/models (2560-dim, no API cost)`,
        })
    }
    if (openaiKey) {
        available.push({
            backend: "openai",
            cfg: { backend: "openai", apiKey: openaiKey, model: DEFAULT_OPENAI_MODEL, url: OPENAI_EMBEDDINGS_URL },
            label: `openai: ${DEFAULT_OPENAI_MODEL} (3072-dim, truncated to 2560; uses the OpenAI key/quota)`,
        })
    }
    if (openrouterKey) {
        available.push({
            backend: "openrouter",
            cfg: { backend: "openrouter", apiKey: openrouterKey, model: DEFAULT_OPENROUTER_MODEL, url: OPENROUTER_EMBEDDINGS_URL },
            label: `openrouter: ${DEFAULT_OPENROUTER_MODEL} (3072-dim, truncated to 2560; uses the OpenRouter key/quota)`,
        })
    }
    return available
}

// Pick the backend for a FRESH corpus from env + optional `embedding_backend`.
// With >1 configured and no explicit choice, returns ok:false asking the user
// to choose. Existing corpora go through resolvePinnedBackend instead.
function resolveBackend(requested: string | undefined, env: NodeJS.ProcessEnv): BackendResolution {
    const available = availableBackends(env)

    const req = (requested ?? "").toLowerCase()
    if (req) {
        const found = available.find((a) => a.backend === req)
        if (found) return { ok: true, cfg: found.cfg }
        return { ok: false, message: `error: embedding_backend=${req} requires ${BACKEND_NEED[req] ?? "its configuration"}.` }
    }

    // auto / unset
    if (available.length === 0) {
        return {
            ok: false,
            message:
                "error: no embedding backend configured. Set LOCAL_LLM_API_BASE (self-hosted), OPENAI_API_KEY (OpenAI), or OPENROUTER_API_KEY (OpenRouter), then re-run.",
        }
    }
    if (available.length === 1) return { ok: true, cfg: available[0].cfg }
    return {
        ok: false,
        message: [
            `NEEDS USER INPUT — ${available.length} embedding backends are configured. Do NOT choose one yourself and do NOT call ingest_pdf again yet. Present these options to the user verbatim and STOP your turn until they reply; then re-run ingest_pdf with embedding_backend set to one of [${available.map((a) => a.backend).join(", ")}]:`,
            ...available.map((a) => `  - ${a.label}`),
        ].join("\n"),
    }
}

// Resolve the backend for a corpus that already has embeddings, forcing the SAME
// (backend, model) that produced them — different models = different vector
// spaces and must never be mixed in one rag_chunks table. ok:false if unusable.
function resolvePinnedBackend(
    pinned: { backend: string; model: string },
    requested: string | undefined,
    env: NodeJS.ProcessEnv,
): BackendResolution {
    const wantBackend = pinned.backend
    const wantModel = pinned.model

    const req = (requested ?? "").toLowerCase()
    if (req && req !== wantBackend) {
        return {
            ok: false,
            message: `error: this RAG corpus was embedded with model '${wantModel}' via the '${wantBackend}' backend; ingesting with '${req}' would mix incompatible vector spaces. Re-run with embedding_backend='${wantBackend}' (or omit it), or use a fresh corpus.`,
        }
    }

    const found = availableBackends(env).find((a) => a.backend === wantBackend)
    if (!found) {
        return {
            ok: false,
            message: `error: this RAG corpus was embedded with model '${wantModel}' via the '${wantBackend}' backend, which is not configured now (needs ${BACKEND_NEED[wantBackend] ?? "its configuration"}). Restore it to add more documents, or ingest into a fresh corpus.`,
        }
    }

    const cfg = { ...found.cfg }
    if (wantBackend === "self_hosted") {
        if (cfg.model && cfg.model !== wantModel) {
            return {
                ok: false,
                message: `error: this RAG corpus was embedded with the self-hosted model '${wantModel}', but the endpoint is now configured for '${cfg.model}'. These are incompatible — point LOCAL_LLM_API_BASE at a gateway serving '${wantModel}', or ingest into a fresh corpus.`,
            }
        }
    } else {
        // openai / openrouter: call the exact pinned model; a model-not-found
        // error surfaces at embed time.
        cfg.model = wantModel
    }
    return { ok: true, cfg }
}

// The (backend, model) the corpus was first embedded with, from the earliest
// rag_documents row. null for a fresh/unknown corpus.
async function pinnedIdentity(base: string, apiKey: string): Promise<{ backend: string; model: string } | null> {
    try {
        const r = await fetch(`${base}/rag_documents?select=metadata&order=id.asc&limit=1`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        })
        if (!r.ok) return null
        const rows = (await r.json()) as Array<{ metadata?: Record<string, unknown> }>
        const meta = rows[0]?.metadata
        const backend = meta?.embed_backend
        const model = meta?.embed_model
        if (typeof backend === "string" && backend && typeof model === "string" && model) {
            return { backend, model }
        }
        return null
    } catch {
        return null
    }
}

// === File fingerprint ===
async function fileFingerprint(filePath: string): Promise<Fingerprint> {
    const st = await fs.stat(filePath)
    const h = crypto.createHash("sha256")
    const buf = await fs.readFile(filePath)
    h.update(buf)
    return {
        file_size: st.size,
        mtime: st.mtimeMs / 1000, // seconds, to align with python-side scripts
        sha256: h.digest("hex"),
    }
}

function fingerprintMatches(
    fpNew: Fingerprint,
    metaExisting: Record<string, unknown>,
): [boolean, string] {
    const sha = metaExisting?.sha256 as string | undefined
    if (sha) {
        if (sha === fpNew.sha256) return [true, "sha256 match"]
        return [false, `sha256 differs (db=${sha.slice(0, 12)}..., new=${fpNew.sha256.slice(0, 12)}...)`]
    }
    const sizeDb = metaExisting?.file_size as number | undefined
    const mtimeDb = metaExisting?.mtime as number | undefined
    if (sizeDb != null && mtimeDb != null) {
        if (sizeDb === fpNew.file_size && Math.abs(mtimeDb - fpNew.mtime) < 1e-3) {
            return [true, "size+mtime match"]
        }
        return [false, `size/mtime differ (db=${sizeDb}/${mtimeDb}, new=${fpNew.file_size}/${fpNew.mtime})`]
    }
    return [false, "no fingerprint in existing row"]
}

// === PostgREST writers ===
type PgrestDocRow = { id: number; filename: string; source_path: string; metadata: Record<string, unknown> }

async function pgrestGetExistingByFilename(
    base: string,
    apiKey: string,
    filename: string,
    log: Logger,
): Promise<PgrestDocRow[]> {
    const url = `${base}/rag_documents?select=id,filename,source_path,metadata&filename=eq.${encodeURIComponent(filename)}`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (!r.ok) {
        log(`warning: filename lookup failed: ${r.status} ${await r.text()}`)
        return []
    }
    return (await r.json()) as PgrestDocRow[]
}

async function pgrestInsert(
    base: string,
    apiKey: string,
    table: string,
    rows: unknown[],
    log: Logger,
): Promise<unknown[]> {
    const url = `${base}/${table}`
    const r = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Prefer: "return=representation",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(rows),
    })
    if (!r.ok) {
        const txt = await r.text()
        log(`error inserting into ${table}: ${r.status} ${txt}`)
        throw new Error(`PostgREST insert failed (${table}): ${r.status} ${txt}`)
    }
    return (await r.json()) as unknown[]
}

// === Schema preflight ===
async function pgrestTableExists(base: string, apiKey: string, table: string): Promise<boolean> {
    // limit=0 select: 200 = exists, 404 (PGRST205) = missing. On network error
    // assume present and let the real insert surface it.
    try {
        const r = await fetch(`${base}/${table}?limit=0`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        })
        return r.ok
    } catch {
        return true
    }
}

function requiredSchemaMessage(missing: string[], dims: number): string {
    // Hand the LLM the exact tables this tool writes to so it can create them
    // and re-run, instead of failing only after the expensive work.
    return [
        `error: required table(s) missing: ${missing.join(", ")}.`,
        "Create the RAG schema before ingesting, then call ingest_pdf again with the same arguments.",
        "",
        "Required tables:",
        "  rag_documents(",
        "    id           seqnumber primary key (auto-increment),",
        "    filename     text,",
        "    source_path  text,",
        "    metadata     jsonb",
        "  )",
        "  rag_chunks(",
        "    id           seqnumber primary key (auto-increment),",
        "    document_id  integer references rag_documents(id),",
        "    chunk_index  integer,",
        "    content      text,",
        "    token_count  integer,",
        "    metadata     jsonb,",
        `    embedding    vector(${dims})`,
        "  )",
        "",
        "Setup:",
        `  1. Create both tables (embedding column type vector(${dims})). Typed columns can use the`,
        "     create_table RPC (map the embedding column type 'vector'); metadata must be jsonb and",
        "     rag_chunks.document_id should reference rag_documents(id).",
        "  2. Add the HNSW index: POST /rpc/create_vector_index",
        '     {"p_table_name": "rag_chunks", "p_embedding_column_name": "embedding"}.',
        "  3. See the vector-search skill, then re-run ingest_pdf.",
    ].join("\n")
}

// === Per-file orchestration ===
async function preparePdf(pdfPath: string, log: Logger): Promise<{ pages: string[]; chunks: Chunk[] }> {
    log(`[1/5] reading PDF: ${pdfPath}`)
    const pages = await extractPages(pdfPath, log)
    const totalChars = pages.reduce((a, p) => a + p.length, 0)
    log(`      pages=${pages.length} chars=${totalChars}`)
    if (totalChars === 0) throw new Error("no extractable text (scanned PDF? OCR not supported)")
    log(`[2/5] chunking (~${CHUNK_TOKENS} tokens, ${CHUNK_OVERLAP} overlap)`)
    const chunks = buildChunks(pages)
    log(`      chunks=${chunks.length}`)
    if (!chunks.length) throw new Error("no chunks produced")
    return { pages, chunks }
}

async function ingestOne(
    args: {
        pdfPath: string
        pages: string[]
        chunks: Chunk[]
        backend: BackendConfig
        apiKey: string
        postgrestUrl: string
        titleOverride: string | null
        fingerprint: Fingerprint | null
    },
    log: Logger,
): Promise<{ documentId: number; chunkCount: number }> {
    const { pdfPath, pages, chunks, backend, apiKey, postgrestUrl, titleOverride, fingerprint } = args
    log(`[3/5] embedding via ${backend.backend} model=${backend.model} (dims=${EMBED_DIMS})`)
    const chunkTexts = chunks.map((c) => c.content)
    const vecs = await embedChunks(backend, chunkTexts, log)
    if (vecs.length !== chunks.length) {
        throw new Error(`embedding count mismatch ${vecs.length} vs ${chunks.length}`)
    }

    log(`[4/5] inserting rag_documents row`)
    const docMeta: Record<string, unknown> = {
        title: titleOverride ?? path.basename(pdfPath, path.extname(pdfPath)),
        page_count: pages.length,
        chunk_count: chunks.length,
        embed_backend: backend.backend,
        embed_model: backend.model,
        embed_dims: EMBED_DIMS,
        chunk_tokens: CHUNK_TOKENS,
        chunk_overlap: CHUNK_OVERLAP,
    }
    if (fingerprint) Object.assign(docMeta, fingerprint)
    const docRows = (await pgrestInsert(
        postgrestUrl,
        apiKey,
        "rag_documents",
        [{ filename: path.basename(pdfPath), source_path: path.resolve(pdfPath), metadata: docMeta }],
        log,
    )) as Array<{ id: number }>
    const docId = docRows[0].id
    log(`      document_id=${docId}`)

    log(`[5/5] inserting rag_chunks (${chunks.length} rows)`)
    // Each row is ~23 KB (2560 floats at 7-decimal precision + content); 10 rows
    // per request stays under the nginx proxy's default 1 MB limit.
    const BATCH = 10
    for (let i = 0; i < chunks.length; i += BATCH) {
        const batchChunks = chunks.slice(i, i + BATCH)
        const batchVecs = vecs.slice(i, i + BATCH)
        const rows = batchChunks.map((c, idx) => ({
            document_id: docId,
            chunk_index: c.chunk_index,
            content: c.content,
            token_count: c.token_count,
            metadata: c.metadata,
            embedding: vectorLiteral(batchVecs[idx]),
        }))
        await pgrestInsert(postgrestUrl, apiKey, "rag_chunks", rows, log)
        log(`      inserted ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`)
    }
    return { documentId: docId, chunkCount: chunks.length }
}

async function findPdfs(folder: string, log: Logger): Promise<string[]> {
    const entries = await fs.readdir(folder, { withFileTypes: true })
    const pdfs: string[] = []
    let other = 0
    for (const e of entries) {
        if (e.isDirectory()) continue
        if (e.name.toLowerCase().endsWith(".pdf")) pdfs.push(path.join(folder, e.name))
        else other++
    }
    if (other) log(`note: ${other} non-PDF file(s) in folder skipped`)
    pdfs.sort((a, b) => path.basename(a).toLowerCase().localeCompare(path.basename(b).toLowerCase()))
    return pdfs
}

// === Tool definition ===
export default tool({
    description:
        "Ingest a PDF (or folder of PDFs) into the Liquid Upstart RAG store (rag_documents, rag_chunks) via PostgREST. Extracts text, chunks ~400 tokens with 50-token overlap, embeds each chunk, and inserts rows with a raw 2560-dim float vector (binary quantization is applied at index time by pgvector). The embedding backend is the self-hosted LOCAL_LLM_API_BASE endpoint, OpenAI (OPENAI_API_KEY), or OpenRouter (OPENROUTER_API_KEY); if more than one is configured, the tool asks you to choose via embedding_backend.",
    args: {
        input: tool.schema
            .string()
            .describe("Absolute or worktree-relative path to a PDF file OR a folder of PDFs (non-recursive). Files uploaded by the user typically live under /data."),
        title: tool.schema
            .string()
            .optional()
            .describe("Override document title (single-file mode only; ignored for folders). Defaults to filename stem."),
        dry_run: tool.schema
            .boolean()
            .optional()
            .describe("Parse and chunk but do not call the embedding endpoint or write to DB."),
        estimate_only: tool.schema
            .boolean()
            .optional()
            .describe("Print chunk + token totals per file and the batch sum, then exit (no API calls)."),
        skip_existing: tool.schema
            .boolean()
            .optional()
            .describe("Look up filename in rag_documents and skip if already ingested (see collision_policy)."),
        collision_policy: tool.schema
            .enum(["fingerprint", "skip", "ingest", "fail"])
            .optional()
            .describe(
                "How to handle filename matches when skip_existing is set. fingerprint (default): compare size+mtime+sha256, skip if same. skip: always skip. ingest: always ingest a new row. fail: abort the batch.",
            ),
        embedding_backend: tool.schema
            .enum(["self_hosted", "openai", "openrouter"])
            .optional()
            .describe(
                "Which embedding backend to use. self_hosted = LOCAL_LLM_API_BASE/MODEL (2560-dim). openai = OPENAI_API_KEY (text-embedding-3-large). openrouter = OPENROUTER_API_KEY (openai/text-embedding-3-large). The OpenAI/OpenRouter vectors are 3072-dim, truncated to 2560. Leave unset to auto-select the only configured backend; if MORE THAN ONE is configured the tool returns a prompt asking the user to pick — set this and re-run.",
            ),
    },
    async execute(args, context) {
        const logBuf: string[] = []
        const log: Logger = (line) => logBuf.push(line)

        const collisionPolicy = (args.collision_policy ?? "fingerprint") as
            | "fingerprint"
            | "skip"
            | "ingest"
            | "fail"
        const dryRun = !!args.dry_run
        const estimateOnly = !!args.estimate_only
        const skipExisting = !!args.skip_existing

        // Resolve input against the session working directory / worktree.
        const baseDir = context.directory ?? context.worktree ?? process.cwd()
        const inputPath = path.isAbsolute(args.input) ? args.input : path.resolve(baseDir, args.input)

        let pdfPaths: string[]
        let folderMode = false
        try {
            const st = await fs.stat(inputPath)
            if (st.isFile()) {
                pdfPaths = [inputPath]
            } else if (st.isDirectory()) {
                pdfPaths = await findPdfs(inputPath, log)
                folderMode = true
                if (!pdfPaths.length) return `error: no .pdf files found in ${inputPath}`
                log(`folder mode: ${pdfPaths.length} PDF(s) found in ${inputPath}`)
                for (const p of pdfPaths) log(`  - ${path.basename(p)}`)
                if (args.title) log(`note: title is ignored in folder mode`)
            } else {
                return `error: not a file or directory: ${inputPath}`
            }
        } catch (e) {
            const msg = (e as { message?: string })?.message ?? String(e)
            return `error: cannot stat ${inputPath}: ${msg}`
        }

        // Env / config — all from process.env (no .env file in the container).
        const apiKey = process.env.POSTGREST_API_KEY ?? ""
        const postgrestUrl = process.env.POSTGREST_URL ?? DEFAULT_POSTGREST

        const needsEmbed = !(dryRun || estimateOnly)
        const needsPgrest = !(dryRun || estimateOnly)

        if (needsPgrest && !apiKey) return "error: POSTGREST_API_KEY not set"

        // Preflight: verify destination tables exist BEFORE the expensive work
        // (reading PDFs + embedding); if missing, return the required schema.
        if (needsPgrest) {
            const missing: string[] = []
            for (const t of ["rag_documents", "rag_chunks"]) {
                if (!(await pgrestTableExists(postgrestUrl, apiKey, t))) missing.push(t)
            }
            if (missing.length) return requiredSchemaMessage(missing, EMBED_DIMS)
        }

        // Resolve the embedding backend (real ingest only). If the corpus already
        // has documents, PIN to the model that produced them (different models =
        // incompatible vector spaces); otherwise resolve freely.
        let backend: BackendConfig | null = null
        if (needsEmbed) {
            const pinned = await pinnedIdentity(postgrestUrl, apiKey)
            const res = pinned
                ? resolvePinnedBackend(pinned, args.embedding_backend, process.env)
                : resolveBackend(args.embedding_backend, process.env)
            if (!res.ok) return res.message
            backend = res.cfg
            if (backend.backend === "self_hosted" && !backend.model) {
                try {
                    backend.model = await discoverEmbeddingModel(backend.host!, backend.apiKey, log)
                } catch (e) {
                    return (e as { message?: string })?.message ?? String(e)
                }
            }
            if (pinned && pinned.backend === "self_hosted" && backend.model !== pinned.model) {
                return `error: this RAG corpus was embedded with the self-hosted model '${pinned.model}', but the endpoint now resolves to '${backend.model}'. The gateway must serve the embedding model '${pinned.model}', or ingest into a fresh corpus.`
            }
            log(
                `embedding backend: ${backend.backend} (model=${backend.model}, dims=${EMBED_DIMS})` +
                    (pinned ? " [pinned to existing corpus]" : ""),
            )
        }

        // Phase 1: parse + chunk + fingerprint each PDF.
        type Prepared = {
            path: string
            pages: string[]
            chunks: Chunk[]
            tokens: number
            fingerprint: Fingerprint | null
        }
        const prepared: Prepared[] = []
        const parseFailures: [string, string][] = []
        for (let idx = 0; idx < pdfPaths.length; idx++) {
            const pdf = pdfPaths[idx]
            log(`\n=== [${idx + 1}/${pdfPaths.length}] ${path.basename(pdf)} ===`)
            let pages: string[]
            let chunks: Chunk[]
            try {
                ;({ pages, chunks } = await preparePdf(pdf, log))
            } catch (e) {
                const name = (e as { constructor?: { name?: string } })?.constructor?.name ?? "Error"
                const msg = (e as { message?: string })?.message ?? String(e)
                log(`  SKIP: parse failure: ${name}: ${msg}`)
                parseFailures.push([pdf, `${name}: ${msg}`])
                continue
            }
            let fp: Fingerprint | null = null
            try {
                fp = await fileFingerprint(pdf)
            } catch (e) {
                const msg = (e as { message?: string })?.message ?? String(e)
                log(`  warning: fingerprint failed for ${path.basename(pdf)}: ${msg}`)
            }
            const tokens = estimateTokens(chunks.map((c) => c.content))
            log(`      total_tokens~=${tokens}` + (fp ? `  sha256=${fp.sha256.slice(0, 12)}...` : ""))
            prepared.push({ path: pdf, pages, chunks, tokens, fingerprint: fp })
        }

        if (!prepared.length) {
            log("error: no PDFs successfully parsed; nothing to ingest")
            return logBuf.join("\n")
        }

        // Phase 1b: dedup against rag_documents
        const dedupSkips: [string, string][] = []
        let prep = prepared
        if (skipExisting && !apiKey) {
            log("warning: skip_existing requires POSTGREST_API_KEY; dedup check disabled")
        }
        if (skipExisting && apiKey) {
            const kept: Prepared[] = []
            for (const p of prep) {
                const existing = await pgrestGetExistingByFilename(
                    postgrestUrl,
                    apiKey,
                    path.basename(p.path),
                    log,
                )
                if (!existing.length) {
                    kept.push(p)
                    continue
                }
                const existingIds = existing.map((r) => String(r.id))
                if (collisionPolicy === "ingest") {
                    log(`  collision: ${path.basename(p.path)} matches doc_id(s) ${existingIds.join(",")} -- policy=ingest, will create new row`)
                    kept.push(p)
                    continue
                }
                if (collisionPolicy === "skip") {
                    const reason = `filename match (doc_id=${existingIds.join(",")}), policy=skip`
                    log(`  SKIP ${path.basename(p.path)}: ${reason}`)
                    dedupSkips.push([p.path, reason])
                    continue
                }
                if (collisionPolicy === "fail") {
                    log(`error: filename match for ${path.basename(p.path)} (doc_id=${existingIds.join(",")}); policy=fail`)
                    return logBuf.join("\n")
                }
                // fingerprint policy
                if (!p.fingerprint) {
                    const reason = `filename match (doc_id=${existingIds.join(",")}), local fingerprint unavailable`
                    log(`  SKIP ${path.basename(p.path)}: ${reason}`)
                    dedupSkips.push([p.path, reason])
                    continue
                }
                let anyMatch = false
                let matchedId: number | null = null
                let matchedWhy = ""
                const noFpRows: number[] = []
                const mismatchDetails: string[] = []
                for (const row of existing) {
                    const meta = (row.metadata ?? {}) as Record<string, unknown>
                    const [matched, why] = fingerprintMatches(p.fingerprint, meta)
                    if (matched) {
                        anyMatch = true
                        matchedId = row.id
                        matchedWhy = why
                        break
                    }
                    if (why.includes("no fingerprint")) noFpRows.push(row.id)
                    else mismatchDetails.push(`id=${row.id} ${why}`)
                }
                if (anyMatch) {
                    const reason = `fingerprint duplicate of doc_id=${matchedId} (${matchedWhy})`
                    log(`  SKIP ${path.basename(p.path)}: ${reason}`)
                    dedupSkips.push([p.path, reason])
                    continue
                }
                if (noFpRows.length && !mismatchDetails.length) {
                    const reason = `filename match (doc_id=${noFpRows.join(",")}) has no fingerprint in DB; assuming duplicate`
                    log(`  SKIP ${path.basename(p.path)}: ${reason}`)
                    dedupSkips.push([p.path, reason])
                    continue
                }
                log(`  collision: ${path.basename(p.path)} filename matches doc_id(s) ${existingIds.join(",")} but fingerprint differs -- ingesting as new row`)
                for (const d of mismatchDetails) log(`    ${d}`)
                kept.push(p)
            }
            prep = kept
            if (dedupSkips.length) log(`\nskipped ${dedupSkips.length} file(s) due to skip_existing`)
            if (!prep.length) {
                log("nothing to ingest after dedup; all files already present.")
                log("\n=== SUMMARY ===")
                log(`  succeeded: 0/${pdfPaths.length}`)
                log(`  skipped (dedup): ${dedupSkips.length}`)
                for (const [pth, reason] of dedupSkips) log(`    SKIP ${path.basename(pth)}: ${reason}`)
                if (parseFailures.length) {
                    log(`  parse failures: ${parseFailures.length}`)
                    for (const [pth, msg] of parseFailures) log(`    FAIL ${path.basename(pth)}: ${msg}`)
                }
                return logBuf.join("\n")
            }
        }

        // Batch totals (informational only — no cost estimate for self-hosted)
        const totalTokens = prep.reduce((a, p) => a + p.tokens, 0)
        const totalChunks = prep.reduce((a, p) => a + p.chunks.length, 0)
        const backendLabel = backend ? `${backend.backend}/${backend.model}` : "no-embed"
        log(`\nbatch total: ${prep.length} doc(s), ${totalChunks} chunk(s), ~${totalTokens} tokens (backend=${backendLabel}, dims=${EMBED_DIMS})`)

        if (dryRun) {
            const sample = prep[0].chunks[0]
            log("[dry-run] sample chunk[0] of first PDF:")
            log(JSON.stringify({ ...sample, content: sample.content.slice(0, 300) + "..." }, null, 2))
            return logBuf.join("\n")
        }
        if (estimateOnly) {
            log("[estimate-only] done; no API calls made.")
            return logBuf.join("\n")
        }

        // Phase 2: embed + insert
        const successes: [string, number, number][] = []
        const ingestFailures: [string, string][] = []
        const titleOverride = folderMode ? null : (args.title ?? null)
        for (let idx = 0; idx < prep.length; idx++) {
            const p = prep[idx]
            log(`\n=== INGEST [${idx + 1}/${prep.length}] ${path.basename(p.path)} ===`)
            try {
                const { documentId, chunkCount } = await ingestOne(
                    {
                        pdfPath: p.path,
                        pages: p.pages,
                        chunks: p.chunks,
                        backend: backend!,
                        apiKey,
                        postgrestUrl,
                        titleOverride,
                        fingerprint: p.fingerprint,
                    },
                    log,
                )
                successes.push([p.path, documentId, chunkCount])
            } catch (e) {
                const name = (e as { constructor?: { name?: string } })?.constructor?.name ?? "Error"
                const msg = (e as { message?: string })?.message ?? String(e)
                log(`  SKIP: ingest failure: ${name}: ${msg}`)
                ingestFailures.push([p.path, `${name}: ${msg}`])
            }
        }

        // Final summary
        log("\n=== SUMMARY ===")
        log(`  succeeded: ${successes.length}/${pdfPaths.length}`)
        for (const [pth, docId, n] of successes) log(`    OK   ${path.basename(pth)}  document_id=${docId}  chunks=${n}`)
        if (dedupSkips.length) {
            log(`  skipped (dedup): ${dedupSkips.length}`)
            for (const [pth, reason] of dedupSkips) log(`    SKIP ${path.basename(pth)}: ${reason}`)
        }
        if (parseFailures.length) {
            log(`  parse failures: ${parseFailures.length}`)
            for (const [pth, msg] of parseFailures) log(`    FAIL ${path.basename(pth)}: ${msg}`)
        }
        if (ingestFailures.length) {
            log(`  ingest failures: ${ingestFailures.length}`)
            for (const [pth, msg] of ingestFailures) log(`    FAIL ${path.basename(pth)}: ${msg}`)
        }

        return logBuf.join("\n")
    },
})
