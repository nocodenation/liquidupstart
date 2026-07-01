# Privacy Gateway — Work Handoff

Last updated: 2026-07-01 · Branch: `feature/privacy-gateway` · M1–M7 uncommitted (see *Git*).

A local "anonymize → cloud LLM → de-anonymize" proxy that sits between the stack's coding agents
(OpenClaw/OpenCode) and the cloud LLM APIs. Spec: `docs/privacy-gateway.md`. App lives under
`config/privacy-gateway/app/` (FastAPI, uv, Python 3.12).

## Status: ALL milestones done (M0–M7). Mode-B: Grok+Copilot live-proven; Codex cert-trust solved (system-store injection wired). Only authed live calls + deferred items remain.

> **Mode-B enablement model (2026-07-01, simplified):** the `PRIVACY_GATEWAY_MITM_*` flags were
> **removed**. mode-B for a backend = `PRIVACY_GATEWAY_ENABLE` (gateway profile on) **AND**
> `ENABLE_XAI_GROK`/`ENABLE_GITHUB_COPILOT`/`ENABLE_OPENAI_CODEX`. The gateway reads those root flags
> via `config.py` `validation_alias`; `serve.py` starts `:443` when `settings.mitm_active` (any enabled);
> OpenClaw steers a vendor host only for its enabled backend; the dashboard renders every `*_ENABLE`
> flag as a Switch (`env-meta.ts`). Plan/verify: `docs/privacy-gateway-modeb-flags.md`,
> `config/privacy-gateway/verify-modeb-flags.sh` (runs pytest **and** `bun test`). Needs image rebuild
> + `.env` cleanup (stale `MITM_*` lines are ignored).

| # | Milestone | State | Plan / progress / verify |
|---|---|---|---|
| 0 | Prototype: FastAPI service + anonymization core | ✅ | `docs/privacy-gateway-milestone-0.md` |
| 1 | Stack wiring (compose/build/start, agent base-URL injection) | ✅ | `…milestone-1.md` · `verify-m1.sh` |
| 2 | Anthropic streaming SSE de-anon | ✅ | `…milestone-2.md` · `PROGRESS.md` · `verify-m2.sh` |
| 3 | OpenAI Chat Completions path (+ streaming + OpenCode wiring) | ✅ | `…milestone-3.md` · `PROGRESS-m3.md` · `verify-m3.sh` |
| 4a | Local-LLM second-pass detection + egress gating | ✅ | `…milestone-4.md` · `PROGRESS-m4.md` · `verify-m4.sh` |
| 4b | Semantic abstractive rewrite + faithfulness (standalone engine) | ✅ | `…milestone-4b.md` · `PROGRESS-m4b.md` · `verify-m4b.sh` |
| 5 | OpenAI Responses adapter (+ streaming) | ✅ | `…milestone-5.md` · `PROGRESS-m5.md` · `verify-m5.sh` |
| 7 | **Harden**: at-rest vault encryption, TTL, outbound re-scan backstop, type-only audit | ✅ | `…milestone-7.md` · `PROGRESS-m7.md` · `verify-m7.sh` |
| 6.0 | **Mode-B infra**: local CA + multi-SAN leaf, dual-port launcher, Host-dispatch (app-only) | ✅ | `…milestone-6.md` · `PROGRESS-m6-0.md` · `verify-m6-0.sh` |
| 6.1 | **Mode-B Grok** + OpenClaw CA trust/steering (stack-touching) | ✅ live acceptance PASSED | `…milestone-6.md` · `PROGRESS-m6-1.md` · `verify-m6-1.sh` |
| 6.2 | **Mode-B Copilot** (steers `api.githubcopilot.com` only; `api.github.com` untouched) | ✅ code done; **live: TLS-trust + full pipeline reaches real Copilot** (only a real authed agent call left) | `…milestone-6.md` · `PROGRESS-m6-2.md` · `verify-m6-2.sh` |
| 6.3 | **Mode-B Codex** (`chatgpt.com/backend-api/codex/responses`, Responses protocol) | ✅ code done; **live: cert-trust solved** (Rust codex uses OpenSSL+system store → system-store CA injection wired; only authed call left) | `…milestone-6.md` · `PROGRESS-m6-3.md` · `verify-m6-3.sh` |

All `verify-m*.sh` live in `config/privacy-gateway/`. Per-milestone implementation write-ups are in
`config/privacy-gateway/spec/` (`0N_*` for M2, `m3_*`/`m4_*`/`m4b_*`/`m5_*` for the rest).

**Test suite: 153 passing** (+2 integration-marked, require a live LLM). Dashboard: `bun test src` (18).
Run:
```bash
cd config/privacy-gateway/app && uv run pytest -q -m "not integration"
```

## What the gateway can do now

- **Three wire protocols**, non-streaming **and** streaming SSE, each anonymize-out / de-anon-back:
  - Anthropic Messages — `POST /anthropic/v1/messages`
  - OpenAI Chat Completions — `POST /{provider}/v1/chat/completions` (`openai`, `xai`)
  - OpenAI Responses — `POST /{provider}/v1/responses`
- **Detection**: Presidio per-language NER (en/de/fr/es/it/pt) + custom recognizers + detect-secrets,
  optionally + a **local-LLM second-pass** for quasi-identifiers (gated on `PRIVACY_GATEWAY_LOCAL_LLM_ENABLE`).
- **Egress gate** (`core/gate.py`, shared by all routes): sufficiency score → `off|log|block`
  (`PRIVACY_GATEWAY_GATE_MODE`, default `log`). `block`+high → 403; `log` → `x-privacy-gateway-risk` header.
- **Semantic rewrite engine** (`core/semantic/`): rewrite→faithfulness→re-inference loop. **Built
  + tested standalone; NOT wired into live traffic** (deliberate — see *Deferred*).
- **Stack wiring**: Compose `privacy-gateway` service behind a `profiles: [privacy-gateway]` gate,
  default-off via `PRIVACY_GATEWAY_ENABLE`. OpenCode `anthropic`/`openai` providers + claude-cli get
  base-URL injection when enabled.
- **Hardening (M7)**: vault persisted **AES-GCM at rest** under `./volumes/privacy-gateway/`
  (`/data` in-container; auto-generated `vault.key` or BYO `PRIVACY_GATEWAY_VAULT_KEY`), TTL-on-load
  (`PRIVACY_GATEWAY_VAULT_TTL`); **fail-closed outbound backstop** re-scans the assembled anonymized
  request for secrets before egress (`PRIVACY_GATEWAY_BACKSTOP_MODE`, default `block` → 403); **audit
  log** of masked entity **types** only (`audit.jsonl`, `PRIVACY_GATEWAY_AUDIT_ENABLE`). All hang off
  `Gateway.finalize()`; active only when `vault_dir` is set (tests/default run ephemeral).

## How this work is done — the LOOP workflow (repeat for M6/M7)

Each milestone followed the same recipe (see `docs/CLAUDE_CODE_loops.md`):

1. **Scaffold** (before any code):
   - `docs/privacy-gateway-milestone-<N>.md` — plan: reuse map, locked decisions, splits, mandatory tests.
   - `config/privacy-gateway/PROGRESS-m<N>.md` — checkbox per split.
   - `config/privacy-gateway/verify-m<N>.sh` — the machine-checkable finish line: mandatory **named**
     tests present + each split's `spec/` file written + every PROGRESS box ticked + full suite green
     (+ wiring greps / `docker compose config` for stack-touching milestones).
   - Run `verify-m<N>.sh` to confirm a **RED baseline** (proves the finish line is real).
2. **Set the goal**: `/goal Implement … Done = verify-m<N>.sh prints "M<N> VERIFY: PASS" … Or stop after N turns.`
   (The user fires `/goal`; the Stop hook re-invokes until the verify passes.)
3. **Per split, tests-first**: write the mandatory failing tests → show RED → implement (reuse the
   engine, don't rewrite it) → `uv run pytest` green → write `spec/m<N>_0X_*.md` → tick PROGRESS.
4. **Finish**: `verify-m<N>.sh` exits 0; update the memory note + this handoff.

Scope decisions worth a quick `AskUserQuestion` (did this for M4): heavy new deps (e.g. AlignScore),
or UX forks that don't fit a headless proxy (interactive gate dialog). Otherwise decide + document.

## Conventions / constraints (from CLAUDE.md + this codebase)

- **Zero code comments by default** — everywhere, including config/YAML/shell. Explain in chat, not files.
  (`.env.example` is the exception: it's the user-facing contract and is comment-documented per its own style.)
- **`.env.example` is the contract** — add keys there; gateway reads `PRIVACY_GATEWAY_*` (prefix) via
  `config.py`. Computed/runtime values (e.g. `PRIVACY_GATEWAY_ANTHROPIC_URL`) go via compose `environment:`,
  NOT the `env_template` path (that only injects declared root-`.env` keys).
- **Fixed container names, no `${APP_ID}`** (the design doc's `${APP_ID}` is stale).
- **nginx is autogenerated**; container↔container calls bypass it.
- **Do NOT `git commit`** automatically — suggest a message; the user commits.
- **Reuse the engine**: `core/restore.py` (boundary-aware literal restore), `core/streaming/sse.py`
  (`SSEFramer`, works for all three SSE dialects), `core/streaming/window.py` (`stable_restored`
  sliding-window), `Session`, `core/vault`, `core/scoring.py`, `core/gate.py`. Don't reinvent.
- **Tests are offline**: LLM calls use `conftest.FakeLocalLLMClient` (cassettes); live path is
  `integration`-marked.

### ⚠️ Tooling gotcha seen this session
The `Write` tool intermittently appended a stray `</content>` line to created files (broke a `.py`
mid-run once). After every `Write`, strip it and re-check:
```bash
sed -i '${/^<\/content>$/d}' <file>   # and: uv run python -c "import ast; ast.parse(open('<file>').read())"
```
Eyeball file tails when reviewing the diff.

## Deferred (tracked, intentional)

- **Live semantic wiring** — the M4b engine isn't applied to live traffic (silently rewriting agent
  requests violates the design's "offer, never auto-apply"). Needs a decision surface (dashboard) +
  per-field application. One defensible auto path: in `block` mode, rewrite-instead-of-reject.
- **Real two-directional AlignScore** — M4b uses the LLM judge behind a `FaithfulnessScorer` interface;
  AlignScore is a documented drop-in (a ~355M model, image growth).
- **Semantic de-anon / relocation cascade** (tier-2 reversibility) — generalizations are recorded
  (`restorable=False`) but not restored.
- **gemini-compat route + OpenCode xai wiring** — adapter is wire-compatible; gemini's `/v1beta/openai`
  path + registry-resolved `google` provider make wiring it a separate step.
- **M7 allowlist "can't-anonymize → keep local-only"** — the design lists it under M7 but it's a
  routing/decision UX surface (dashboard), not a headless-proxy control. The other three M7 controls
  (at-rest encryption, TTL, backstop, audit) shipped; this one deferred.

## Next up

- **✅ M6.1 live cert-trust acceptance — PASSED (2026-07-01).** Real stack, `MITM_ENABLE=1
  MITM_GROK=1`: gateway writes CA + serves `:8080`+`:443`; `openclaw-gateway` `/etc/hosts` steers
  `api.x.ai`→gateway; Node TLS to `api.x.ai` returns `authorized:true`, `issuer=privacy-gateway
  local CA`; a POST round-tripped through the gateway to the **real** `api.x.ai` (got a genuine xAI
  `Model not found` 400 — proves full interception→anonymize→forward→de-anon). **Mode-B is proven
  for Grok.** (Ordering note: `openclaw-gateway` must start *after* the gateway writes the CA — its
  60s wait covers a clean `up`; if it raced, `docker restart openclaw-gateway`.) A `200` needs a real
  xAI subscription token + valid model name via the actual Grok agent.
- **Latent M7 bug fixed en route:** `PRIVACY_GATEWAY_VAULT_TTL=` (empty string from compose) crashed
  `Settings()` (pydantic `float | None` can't parse `""`). Added a `field_validator` (`config.py`) +
  `tests/test_config.py`. Rebuild the privacy-gateway image to pick it up.
- **M6.2 — Copilot: code done + LIVE-tested on host rhea (2026-07-01).** `tls.connect` probe to
  `api.githubcopilot.com` from openclaw → `authorized:true`, `issuer=privacy-gateway local CA` (trust +
  interception work). A POST through the gateway reached **real** Copilot servers, which returned a
  genuine `400 "Authorization header is badly formatted"` (rejecting only the *dummy* token) — so the
  full pipeline (intercept→anonymize→forward→real Copilot) is transparent to GitHub; no transport-level
  block observed. Steers `api.githubcopilot.com` only; `api.github.com` never touched. **Remaining:** a
  real *authenticated* Copilot completion via the agent (needs GitHub Copilot auth in OpenClaw) — that's
  the only thing that would surface any client-side app-layer cert check. The documented Biz/Ent
  self-signed rejection did **not** manifest at the transport layer here.
- **Bug fixed during the Copilot test:** `forward_exchange` did `resp.json()` unconditionally →
  **500** when an upstream returned a non-JSON error body (Copilot's 400/401 are plain text; Grok's
  happened to be JSON, hiding it). Now the error path passes non-JSON bodies through verbatim
  (`api/exchange.py`) + regression test `tests/test_exchange_errors.py`. Affects all mode-A/B routes.
- **M6.3 — Codex: code done + LIVE cert-trust SOLVED (2026-07-01, host rhea).** `chatgpt.com` +
  `/backend-api/codex/responses` → **Responses** adapter (M5); `ChatGPT-Account-ID` + `originator`
  preserved; `MITM_CODEX`-gated `chatgpt.com` steer; `verify-m6-3.sh` PASS. **Finding:** OpenClaw's
  Codex runtime is the **real Rust `codex` binary** (`@openai/codex-linux-x64`, `codex-cli 0.139.0`) —
  `NODE_EXTRA_CA_CERTS` doesn't apply, BUT the binary uses **`native-tls` + the system CA store**
  (strings show `SSL_CERT_FILE`/`/etc/ssl/certs`/`ca-certificates.crt`, **no** webpki bundled roots).
  Live-proven: curl (same OpenSSL/system path) cert-error → **405** after `update-ca-certificates`.
  So the **system-store CA injection is now WIRED** into the `openclaw-gateway` command block (append-
  only, gated on mode-B). A Node POST already reached the real ChatGPT backend (genuine 401 on a dummy
  token). **Remaining:** an authenticated Codex completion (needs ChatGPT OAuth in OpenClaw) — restart
  `openclaw-gateway` to pick up the wired injection (the running container already has it via a manual
  `update-ca-certificates` I ran).

**Only live probes remain** — all M6 code is done + offline-verified. Two out-of-loop human tests:
(a) an authenticated Copilot completion via the agent; (b) a real Codex/Rust cert-trust probe.

## Resume checklist

1. `cd config/privacy-gateway/app && uv run pytest -q -m "not integration"` → expect **153 passed**
   (dashboard: `cd dashboard && bun test src` → 18).
2. Read `docs/privacy-gateway.md` (binding spec) + the latest `spec/` files for context.
3. All milestones are code-complete. Remaining = the two live probes above (Copilot authed call,
   Codex Rust probe) + optional review/commit. The deferred items below are the only open build work.
4. Human acceptance (out of loop) for stack-touching work: build image
   (`./config/scripts/build/privacy-gateway.sh`), run, curl a payload — see the M1 runbook pattern.
   Ops gotcha: recreating `privacy-gateway` changes its IP → `docker restart openclaw-gateway` to
   re-run its `/etc/hosts` steer against the new IP.

## Git

Suggested commit (review the diff first — loops produce confident slop):
```
feat: privacy-gateway M1–M7 — wiring, streaming de-anon (Anthropic/OpenAI/Responses),
      local-LLM detection + egress gating, semantic rewrite engine, at-rest vault
      encryption + TTL + fail-closed outbound backstop + type-only audit log
```
Then continue on `feature/privacy-gateway`.
