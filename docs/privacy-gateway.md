# Privacy Gateway — Design Doc

Status: **proposal** (no code yet) · Branch: `feature/privacy-gateway`

## Goal

Insert a local "anonymize → cloud LLM → de-anonymize" privacy gateway between the
stack's agentic coding tools (OpenClaw, OpenCode) and the cloud LLM APIs (Claude and
others). Sensitive data (PII, internal hostnames/IDs, secrets) is replaced with
realistic surrogates before leaving the machine; the cloud only ever sees surrogates;
responses, tool-call arguments, and streamed output are de-anonymized locally before
the agent receives them.

This is **pseudonymization, not anonymization** — the mapping vault stays local and is
the highest-value secret. It reduces exposure; it does not remove GDPR obligations for
data sent to the cloud.

## Scope (decided)

- **Coverage:** everything — Anthropic-native `/v1/messages` **and** OpenAI-compatible
  `/v1/chat/completions`, all providers, across both agents.
- **Detection (first build):** Presidio (transformer NER + custom regex recognizers) +
  `detect-secrets`/gitleaks. The local-LLM second-pass detector on the DGX Spark is
  **deferred** to a later milestone.

## Architecture

One new locally-built service, `liquidupstart/privacy-gateway:${APP_ID}` — a FastAPI
app acting as a dual-protocol anonymizing reverse proxy. Agents reach it by container
name on the shared compose network (container→container by service name; nginx is
browser-only and is not involved).

```
OpenClaw (claude-cli)  ┐  ANTHROPIC_BASE_URL
OpenClaw (anthropic/*) ┤───────────────────────►  /anthropic/v1/messages ──┐
OpenCode (anthropic)   ┘                                                    │  api.anthropic.com
                                                                            ├─►  api.openai.com
OpenCode (openai)      ┐  OPENAI_BASE_URL                                   │  api.x.ai …
OpenClaw (codex/grok)  ┤───────────────────────►  /openai/v1/chat/...    ──┘
OpenCode (xai/gemini)  ┘                          anonymize │ de-anonymize
```

**Routing by path prefix, not model-name guessing.** Each agent provider's base-URL
points at a gateway path that names the upstream: `/anthropic` → native protocol,
api.anthropic.com; `/openai/v1`, `/xai/v1`, … → OpenAI-compat, respective upstream. The
gateway holds a `provider → {protocol, upstream}` map. Auth headers (`x-api-key`,
`authorization`) pass through untouched — the gateway never needs the API keys itself.

**Anonymization core is protocol-agnostic.** Both endpoints extract text fields → run
the same detect→surrogate→vault pipeline → forward → de-anonymize the response. Only the
schema adapters differ:

- Anthropic: `messages[].content` blocks, `tool_result` content (inbound),
  `tool_use.input` args (outbound).
- OpenAI: `messages[].content`, `tool` results (inbound), `tool_calls[].function.arguments`
  (outbound).

## Vault & consistency model

Because responses are de-anonymized **before** being returned, the agent's own
conversation history always holds real values. Next turn the agent resends real values,
which we re-anonymize inbound. Therefore we never de-anonymize history — the vault only
needs to map **same original → same surrogate consistently**.

The vault is a bidirectional consistent map:

- `fwd: original → surrogate` — keeps cross-turn / cross-tool-call consistency.
- `rev: surrogate → original` — de-anonymizes responses.

The cloud only ever sees surrogates.

- **Engine:** start from LangChain `PresidioReversibleAnonymizer(add_default_faker_operators=True, faker_seed=42)`
  for detection + Faker surrogates + the mapping; implement our **own** response
  substitution (literal, longest-surrogate-first) over content, tool-call args, and
  stream deltas.
- **Detectors:** Presidio transformer NER + custom `PatternRecognizer`s for internal
  hostnames/ID formats + `detect-secrets` (pure-Python, in-process) for high-entropy
  secrets; optional `gitleaks` binary.
- **Scope:** single-user self-hosted → process-scoped vault, persisted encrypted
  (AES-GCM) under `./volumes/privacy-gateway/` (host-disk convention), with TTL.
- **Fail-closed:** any detection/anonymization error blocks the request; never forward
  unscanned. Gateway is the only egress; the vault is never exposed over HTTP.

## Milestones

| # | Deliverable |
|---|---|
| **0** | **Prototype (no stack integration, 1–2 days).** Standalone script: `PresidioReversibleAnonymizer` round-trip on a real `/v1/messages` payload against Claude + custom recognizers + detect-secrets. Validates surrogate quality and reversal. |
| **1** | **Native `/v1/messages` shim, non-streaming.** FastAPI `/anthropic/v1/messages`; anonymize `messages` + `tool_result` inbound; forward; de-anonymize `content` + `tool_use.input`. Vault + fail-closed. Dockerized as a compose service; build + start scripts; `.env.example` keys. Wire `ANTHROPIC_BASE_URL` for OpenCode anthropic + OpenClaw anthropic API backends. |
| **2** | **Streaming SSE de-anon for `/v1/messages`** (the hard part). Iterate SSE, sliding-window buffer for surrogates split across chunks, de-anon `text_delta` + `input_json_delta`. |
| **3** | **OpenAI-compat path.** `/openai/v1/chat/completions` (+ `/xai`, gemini-compat), anonymize/de-anon incl. `tool_calls` + streaming. Wire `OPENAI_BASE_URL`/xai `baseURL` in OpenCode entrypoint + OpenClaw. |
| **4** | **Claude-CLI (OAuth) coverage.** Set `ANTHROPIC_BASE_URL` in `config/openclaw/openclaw-claude.sh` before `exec claude`. Risk-gated — see Risks. |
| **5** | **Harden.** Encrypt vault at rest; TTL/expiry; outbound re-scan backstop (LLM-Guard-`Sensitive` style) → hard-block on any secret leak; audit log of masked **types** (not values); allowlist flagging "can't-anonymize → keep local-only." |
| **6** | *(separate decision, later)* Local-LLM second-pass detector on the DGX Spark for implicit identifiers. |

## Stack-integration touch points

- **New service** in `compose.yml`: `privacy-gateway` (container suffixed `${APP_ID}`),
  on the existing private network, egress allowed.
- **Build:** `config/scripts/build/privacy-gateway.sh` (render Dockerfile via
  `lib/dockerfile-render.sh`); register in `scripts/linux/build.sh` + `start.sh`; mirror
  `.bat`. Image `liquidupstart/privacy-gateway:${APP_ID}`.
- **Start:** `config/scripts/start/privacy-gateway.sh` — when `PRIVACY_GATEWAY_ENABLE=1`,
  inject base-URL overrides into the agent services.
- **`.env.example` (the contract — add keys here first):** `PRIVACY_GATEWAY_ENABLE=0`,
  fail-closed flag, vault key/TTL, and the `ANTHROPIC_BASE_URL`/`OPENAI_BASE_URL`/etc.
  plumbing. Then thread overrides through `config/opencode/entrypoint.sh` (currently only
  Ollama has a `baseURL`) and the OpenClaw start/wrapper.
- **nginx:** untouched (autogenerated; internal calls bypass it).

## Risks / open decisions

1. **Claude-CLI OAuth + custom base-URL (Milestone 4).** Anthropic's OAuth flow is
   first-party-CLI-intended; redirecting it via `ANTHROPIC_BASE_URL` may be rejected or
   anti-abuse-flagged. API-key backends (`anthropic/*`, OpenCode) are safe. Fallback:
   claude-cli must run in API-key mode to be protected. Milestone 1 targets API-key paths
   first; OAuth is gated late.
2. **Surrogate collision.** Literal substring de-anon needs realistic, low-collision
   surrogates + longest-first replacement. Faker values are reasonably safe; known edge.
3. **System prompts & tool definitions** also carry sensitive data (internal tool
   names/descriptions). V1 leaves them untouched (masking can break tool dispatch);
   revisit later.
4. **Latency budget.** Presidio-only keeps per-request overhead low; the deferred
   local-LLM pass (M6) is the latency-heavy addition.
5. **Pseudonymization ≠ GDPR exemption.** The vault is re-identifying info; treat as risk
   reduction, keep it strictly local.

## Background / prior art

- Microsoft Presidio (`presidio-analyzer`/`-anonymizer`, `DeanonymizeEngine`).
- LangChain `PresidioReversibleAnonymizer` (Faker surrogates + reversible mapping) —
  closest reference implementation; the model to copy.
- LLM Guard `Anonymize`/`Deanonymize` + `Sensitive` output scanner (re-scan backstop).
- Academic: Hide-and-Seek (arXiv:2309.03057), PAPILLON (arXiv:2410.17127), Casper
  (arXiv:2408.07004), PP-TS and CoGenesis (survey arXiv:2404.06001 §III-A1).
- LiteLLM built-in Presidio guardrail is **not** used: its reversible de-anon is buggy
  on the Anthropic-native path (issue #22821 — PII never unmasked, 400 on tool calls,
  streaming SSE bytes pass through). We own a custom shim instead.
