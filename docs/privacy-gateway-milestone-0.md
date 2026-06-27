# Milestone 0 — Privacy Gateway: FastAPI service + anonymization core

## Context

`docs/privacy-gateway.md` specifies a Privacy Gateway that anonymizes agent→cloud-LLM traffic
(surrogate substitution out, de-anonymize back). Milestone 0 in that doc is a *standalone*
prototype that validates the anonymization core (Presidio reversible round-trip on a real
`/v1/messages` payload, European-language (en/de/fr/es/it/pt), custom recognizers, detect-secrets, local-LLM second pass +
sufficiency score) against a **collision acceptance bar: zero false restores + ≥ target
correct-restore rate, surrogate-regeneration rate logged**.

**Decision deviation from the doc (intentional):** we build the **FastAPI service from the start**
rather than a throwaway library. This merges doc-M0 (core validation) with the FastAPI
non-streaming shim of doc-M1, so the core is developed inside the real service. Kept **out of M0**:
SSE streaming de-anon (doc M2), OpenAI/Responses adapters (M3/M5), semantic/abstractive rewrite +
faithfulness (M4), mode-B TLS-MITM (M6), at-rest encryption (M7), and all stack wiring that touches
shared files (compose.yml service entry, top-level build/start orchestrators, nginx, agent base-URL
injection) — those stay in M1. The doc's Milestones table should later be updated to reflect this
merged M0; not edited as part of this plan.

**Decisions locked in:** FastAPI service from the start · packaging via **uv + pyproject.toml +
uv.lock** · NER via **spaCy per-language models, lingua-routed** (behind a pluggable engine interface
so a transformer can swap in later) · **scope is European (space-segmented) languages only —
en/de/fr/es/it/pt; no CJK/Thai** (drops the non-segmented-script corpus case and the inert-boundary
restore branch the parent doc had specified).

**Outcome:** a runnable, containerizable FastAPI app exposing a non-streaming
`POST /anthropic/v1/messages` that anonymizes → forwards to a configurable upstream → de-anonymizes,
plus a pytest corpus that proves the acceptance bar with the local-LLM layer off (deterministic),
and an informational run with it on.

## Where it lives

All new code under `config/privacy-gateway/` (mirrors the doc's anchor + the `hermes` Python
precedent; M1 `COPY`s `app/` into the image):

The package splits into two layers: **`api/`** (the FastAPI transport boundary + upstream
forwarding) and **`core/`** (the transport-agnostic anonymization engine, independently testable,
reused unchanged by later milestones). Only `main.py` and `config.py` sit at the package root;
every other module lives in a responsibility subpackage. Multi-module concerns are packages
(`detection/`, `vault/`, `llm/`, `adapters/`); single-concern engine modules (`restore.py`,
`scoring.py`) are flat files under `core/` that graduate to packages when M4 adds their extra tiers.

```
config/privacy-gateway/
  app/
    pyproject.toml, uv.lock, README.md
    privacy_gateway/
      __init__.py
      main.py                       # uvicorn entrypoint exposing `app` (-> api.app:create_app)
      config.py                     # Settings (frozen) from env; NO import-time env reads elsewhere

      api/                          # transport boundary: FastAPI + upstream forwarding
        __init__.py
        app.py                      # create_app(settings) -> FastAPI
        deps.py                     # DI: build the core Gateway, provide a per-request Session
        upstream.py                 # httpx forwarder to PRIVACY_GATEWAY_UPSTREAM (real api.anthropic.com / mock)
        routes/
          __init__.py
          anthropic.py              # POST /anthropic/v1/messages (non-streaming) + HEAD /; preserve query string
          health.py                 # /healthz

      core/                         # transport-agnostic anonymization engine (M1 reuses unchanged)
        __init__.py
        gateway.py                  # Gateway / Session orchestrator (public surface)
        models.py                   # Span, FieldRef, Surrogate, AnonResult, Sufficiency
        errors.py                   # FailClosed, LLMUnavailable, ...
        metrics.py                  # regeneration / restore / fail-closed counters (types, not values)
        restore.py                  # de-anon cascade head (literal tier; grows to a package in M4)
        scoring.py                  # sufficiency: deterministic floor + adversarial LLM pass (grows in M4)
        detection/
          __init__.py
          detector.py               # orchestrate layers -> merged span list (dedup/precedence)
          presidio.py               # EngineProvider impls (SpacyMultiEngine default) + analyzer build
          recognizers.py            # custom PatternRecognizers (internal hostnames / ID formats)
          secrets.py                # detect-secrets in-process -> SECRET spans
          language.py               # lingua per-field detect + confidence + fallback
        vault/
          __init__.py
          store.py                  # bidirectional consistent map + collision bookkeeping
          surrogate.py              # Faker surrogates + collision-safety invariants + fail-closed
          policy.py                 # ENTITY_POLICY: per-type restorable / faker-provider / lang-detect / min-len
        llm/
          __init__.py
          client.py                 # OpenAI-compat client over LOCAL_LLM_API_BASE (/v1/chat/completions,/v1/models)
          second_pass.py            # LLM residual-span detector (substring-validated) merged as a recognizer
        adapters/
          __init__.py
          anthropic_messages.py     # extract inbound fields / apply surrogates / de-anon response
    tests/                          # unit + corpus acceptance + integration markers + LLM cassettes
    corpus/                         # <lang>/<case>.request.json + .labels.json + .response.json
  templates/Dockerfile              # build template (__SYSTEM_DEPENDENCIES__, # POST_INSTALL_COMMANDS) — local build only in M0
```

## Core design (maps to doc concepts)

### Vault + collision-safety invariants (`core/vault/`)
- `fwd: (entity_type, original) -> VaultEntry` — process-wide for cross-turn/tool consistency.
- `rev: conversation_id -> {replacement -> VaultEntry}` — **conversation-scoped** (a surrogate minted
  in conversation A must never restore in B). Only `restorable=True` entries enter `rev`.
- `_live_surrogates[conversation_id]` (set + length-sorted list) for cheap uniqueness/non-substring
  checks; `_originals_seen` for the bijective ≠-original check. TTL-bounded so the live set stays small.
- `VaultEntry`: original, replacement, entity_type, transform_type=`surrogate` (M0), cardinality=
  `one_to_one` (M0), conversation_id, session_id, restorable, created_at.
- Surrogate generation: reuse on `fwd` hit; else Faker draw → normalize charset → `_accept`; after K
  failures append a rare affix; else `FailClosed` (never forward un-anonymized). `_accept` enforces:
  `cand != original`, `cand ∉ live_originals`, `cand ∉ live_surrogates`, not a sub/superstring of any
  live surrogate (both directions), safe charset (`[A-Za-z0-9 .\-_@]` + Unicode letters; exclude
  `"' \` + control + regex metachars), distinctiveness (not a common dictionary word, not present in
  `ctx.prompt_corpus`, prefer multi-token, avoid ≤3 chars), type-consistent.
- `ENTITY_POLICY` marks short/structured types (`DATE_TIME`, numeric IDs, ports, `AGE`, short
  codes/initials) `restorable=False`: still anonymized outbound, but excluded from `rev` → never
  literal-restored. **This rule is the primary zero-false-restore safeguard.**

### Restore cascade head (`core/restore.py`) — M0 = literal tier only
Parse-aware JSON walk (restore only string *values*, never keys/numbers/structure). Within a string:
single-pass cursor, longest-first candidate match by first-char bucket, boundary-aware
(`s[i-1]`/`s[i+L]` non-word) so `Alice` doesn't fire inside `Malice`; case-sensitive `startswith`; cursor
advances past the inserted original (`i += len(matched)`) so no re-cascade. The boundary guard is
unconditional — scope is European (space-segmented) languages only, so no per-span script detection.
Fuzzy/semantic tiers are M4.

### Detection (`core/detection/`)
spaCy multi-model `AnalyzerEngine` (per-language `*_lg`/`*_md`), routed by lingua →
`analyze(text, language=...)`; custom `PatternRecognizer`s for internal hostnames/ID formats;
`detect-secrets` in-process for high-entropy secrets; spans merged with precedence/dedup. Short/
structured fields skip lingua+NER (lingua is unreliable on them) → regex + secrets only, default-lang
fallback below a confidence threshold. `EngineProvider` interface keeps a transformer engine a config flip.

### Anthropic adapter (`core/adapters/anthropic_messages.py`)
Inbound anonymize: `system`, `messages[].content` (string or text/`tool_result` blocks), assistant
`tool_use.input` string leaves in multi-turn payloads. Leave untouched: `model`, `max_tokens`,
`tools[]` schemas (Risk #1 V1), ids/roles/types, image/document sources. Each location is a `FieldRef`
(JSON pointer + getter/setter) so surrogates write back in place. Outbound de-anon: `content[]` text +
`tool_use.input` string leaves via the restore walk.

### Local-LLM layer (`core/llm/`, `core/scoring.py`) — additive, built last
Thin OpenAI-compat client (Bearer optional, low temp, timeout+1 retry, reason-first JSON: parse last
fenced object). Second-pass detector returns `{reasoning, spans:[{text,type}]}`; **every span must be
an exact case-sensitive substring** (reject hallucinations) → merged into the same surrogate/vault
pipeline. Sufficiency = worst of: deterministic floor (re-run analyzer on anonymized text; any residual
entity ≥0.85 → High) and adversarial judge-model pass (per-attribute rarity → approx `k`/0–1 risk,
verbalized confidence; sample 2–3× only on low confidence). M0 computes/logs/asserts the score; the
user-decision gate UX is M4.

### Upstream forwarding (`api/upstream.py`, `api/routes/anthropic.py`)
Endpoint: anonymize request → `httpx` POST to `PRIVACY_GATEWAY_UPSTREAM` (default real
`api.anthropic.com`; tests point it at a mock that echoes surrogates) passing auth headers untouched →
de-anonymize JSON response. Answer `HEAD /` preflight and preserve the request query string (the two
Risk #1 capture gotchas) now, cheap, de-risks M1. Streaming deferred (M2): M0 is non-streaming only.

## Build order (sub-phases)

1. **Skeleton + lock.** `pyproject.toml` + `uv.lock` (resolve presidio/spaCy/langchain early — riskiest
   install), package scaffold, `config.py`, `core/models.py` + `core/errors.py`, `api/app.py` + `main.py`,
   a `/healthz` route.
2. **Detection.** `core/detection/` + per-language unit tests (spans only).
3. **Vault + surrogates.** `core/vault/` (store/surrogate/policy) + property tests (invariants, fail-closed).
4. **Restore head.** `core/restore.py` + false-restore trap tests.
5. **Adapter + gateway + route.** `core/adapters/`, `core/gateway.py`, `api/routes/anthropic.py` +
   `api/upstream.py`. First full round-trip through the FastAPI app (TestClient + mock upstream).
6. **Corpus + acceptance bar.** European-language (en/de/fr/es/it/pt) labelled corpus; tune to **zero false restores** + restore
   target with the **LLM layer off**; pin metric floors.
7. **LLM layer.** `core/llm/` + `core/scoring.py` with recorded cassettes (offline) + an integration
   marker (real endpoint). Re-run corpus LLM-on as an informational metrics run.
8. **Dockerfile.** `templates/Dockerfile` (python base + uv sync + spaCy models + uvicorn); validate
   `docker build` / `docker run` locally. Stack registration (build/start orchestrators, compose,
   nginx, agent wiring) deferred to M1.

## Verification

- **Unit/property:** `uv run pytest tests/ -m "not integration"` — vault invariants (bijective,
  non-substring, charset, `restorable` excluded from `rev`, fail-closed after K+affix), restore
  (`Alice`/`Malice`, longest-first shadowing, single-pass non-recascade, parse-aware key/number
  untouched, cross-conversation isolation, non-restorable date trap), detection
  per language, adapter round-trip.
- **Acceptance bar (the gate):** `tests/test_corpus.py` parametrized over `corpus/` via FastAPI
  TestClient + a mock upstream that embeds surrogates (incl. a `tool_use.input` numeric field equal to
  a non-restorable surrogate-date's digits — the trap). Assert **false restores = 0** (wrong/over
  substitutions, restores into keys/numbers, cross-conversation), **correct-restore rate ≥ target**
  (start ~0.95, pin a regression floor), **regeneration rate ≤ ceiling**. Corpus covers en + de/fr/es/
  it/pt, with tool_use/tool_result/secrets/date+ID/quasi-identifier cases.
  This run must pass with the **LLM layer off** (reproducible).
- **LLM offline:** `tests/test_second_pass.py`, `tests/test_scoring.py` against recorded cassettes
  (`FakeLocalLLMClient`) — deterministic.
- **LLM integration (manual/nightly):** `uv run pytest -m integration` with
  `PRIVACY_GATEWAY_LOCAL_LLM_ENABLE=1` + `LOCAL_LLM_API_BASE` set — assert structural validity (valid
  JSON, substrings real, score∈[0,1]), not exact values.
- **Service smoke:** `uv run uvicorn privacy_gateway.main:app` (or `docker run`), then a `curl`
  `POST /anthropic/v1/messages` with a captured payload against a mock upstream; confirm anonymized
  body leaves and the response comes back de-anonymized; `HEAD /` answered; query string preserved.

## Critical files
- `docs/privacy-gateway.md` — binding spec (Vault, Reversibility, Detection, roster, Milestones row 0).
- `config/hermes/plugins/ingest_pdf/{__init__.py,requirements.txt}` — Python-package + zero-comment +
  uv-at-build-time precedent to mirror.
- `config/opencode/templates/Dockerfile` — template markers (`__SYSTEM_DEPENDENCIES__`,
  `# POST_INSTALL_COMMANDS`, `COPY`/`EXPOSE`/`ENTRYPOINT`) the `templates/Dockerfile` follows.
- `.env.example` (`LOCAL_LLM_API_BASE`/`_HOST_IP`/`_API_KEY`) — the contract the LLM client consumes;
  new `PRIVACY_GATEWAY_*` keys declared here in M1.
- `config/scripts/build/{opencode.sh,lib/dockerfile-render.sh}` — reference for the M1 build script (not edited in M0).

## Risks / unknowns
- `PresidioReversibleAnonymizer` reversal lacks boundary/longest-first/parse-aware/`restorable`
  semantics (the LiteLLM-Presidio bug class the doc cites) → use it only for detection+Faker mapping
  bootstrap; own vault + restore are authoritative.
- Faker emits punctuation/short/whitespace values hostile to single-pass JSON substitution → charset
  whitelist + distinctiveness + affix fallback; watch the regeneration metric for hot types; some types
  need a controlled synthetic generator.
- spaCy multi-language `*_lg` models are multi-GB → offer `*_md` option, gate behind a uv extra; the
  pluggable engine lets a single transformer replace them if footprint is unacceptable.
- lingua weak on short fields → skip NER for short/structured, confidence threshold + default-lang
  fallback; track language-detection accuracy vs gold.
- Non-restorable structured types are the main false-restore vector → corpus must include traps that
  *would* false-restore if the `restorable=False`→excluded-from-`rev` rule regressed.
- LLM second pass over-flags + hallucinates non-substrings (substring-validation mandatory) and is
  uncalibrated + slow (keep toggleable, out of the deterministic acceptance bar).
