# Privacy Gateway — Work Handoff

Last updated: 2026-06-30 · Branch: `feature/privacy-gateway` · Nothing committed yet (see *Git*).

A local "anonymize → cloud LLM → de-anonymize" proxy that sits between the stack's coding agents
(OpenClaw/OpenCode) and the cloud LLM APIs. Spec: `docs/privacy-gateway.md`. App lives under
`config/privacy-gateway/app/` (FastAPI, uv, Python 3.12).

## Status: M0–M5 done; M6, M7 + deferred items remain

| # | Milestone | State | Plan / progress / verify |
|---|---|---|---|
| 0 | Prototype: FastAPI service + anonymization core | ✅ | `docs/privacy-gateway-milestone-0.md` |
| 1 | Stack wiring (compose/build/start, agent base-URL injection) | ✅ | `…milestone-1.md` · `verify-m1.sh` |
| 2 | Anthropic streaming SSE de-anon | ✅ | `…milestone-2.md` · `PROGRESS.md` · `verify-m2.sh` |
| 3 | OpenAI Chat Completions path (+ streaming + OpenCode wiring) | ✅ | `…milestone-3.md` · `PROGRESS-m3.md` · `verify-m3.sh` |
| 4a | Local-LLM second-pass detection + egress gating | ✅ | `…milestone-4.md` · `PROGRESS-m4.md` · `verify-m4.sh` |
| 4b | Semantic abstractive rewrite + faithfulness (standalone engine) | ✅ | `…milestone-4b.md` · `PROGRESS-m4b.md` · `verify-m4b.sh` |
| 5 | OpenAI Responses adapter (+ streaming) | ✅ | `…milestone-5.md` · `PROGRESS-m5.md` · `verify-m5.sh` |
| 6 | **Mode-B TLS-MITM** for subscription plugins (Copilot/Codex/Grok) | ⬜ TODO | — |
| 7 | **Harden**: at-rest vault encryption, TTL, outbound re-scan backstop | ⬜ TODO | — |

All `verify-m*.sh` live in `config/privacy-gateway/`. Per-milestone implementation write-ups are in
`config/privacy-gateway/spec/` (`0N_*` for M2, `m3_*`/`m4_*`/`m4b_*`/`m5_*` for the rest).

**Test suite: 124 passing** (+2 integration-marked, require a live LLM). Run:
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

## Next up

- **M6 — Mode-B TLS-MITM** (the riskiest milestone): terminate TLS for the subscription plugins
  (Copilot `api.githubcopilot.com` + `api.github.com` token-exchange; Codex `chatgpt.com/backend-api/
  codex/responses`; Grok `api.x.ai/v1`), CA trusted inside the OpenClaw container, preserving
  identity-binding headers/origin. Per-backend, heavily risk-gated, ToS-sensitive (Risks #6–#7 in the
  design doc). The M5 Responses adapter is the prerequisite for Codex. Read `docs/privacy-gateway.md`
  → *Interception modes* / *Routing* / *Risks* first.
- **M7 — Harden**: encrypt vault at rest (AES-GCM under `./volumes/privacy-gateway/`); TTL/expiry;
  outbound re-scan backstop (hard-block on any secret leak in the model's completion); audit log of
  masked **types** (not values).

## Resume checklist

1. `cd config/privacy-gateway/app && uv run pytest -q -m "not integration"` → expect **124 passed**.
2. Read `docs/privacy-gateway.md` (binding spec) + the latest `spec/` files for context.
3. Pick M6 or M7; scaffold per the LOOP workflow above; RED baseline; `/goal`.
4. Human acceptance (out of loop) for stack-touching work: build image
   (`./config/scripts/build/privacy-gateway.sh`), run, curl a payload — see the M1 runbook pattern.

## Git

Suggested commit (review the diff first — loops produce confident slop):
```
feat: privacy-gateway M1–M5 — wiring, streaming de-anon (Anthropic/OpenAI/Responses),
      local-LLM detection + egress gating, semantic rewrite engine
```
Then continue on `feature/privacy-gateway`.
