# Privacy Gateway — Design Doc

Status: **proposal** · Branch: `feature/privacy-gateway`

## Goal

Insert a local "anonymize → cloud LLM → de-anonymize" privacy gateway between the
stack's agentic coding tools (OpenClaw, OpenCode) and the cloud LLM APIs (Claude and
others). Sensitive data (PII, internal hostnames/IDs, secrets) is replaced with
realistic surrogates before leaving the machine; the cloud only ever sees surrogates;
responses, tool-call arguments, and streamed output are de-anonymized locally before
the agent receives them.

By default this is **pseudonymization, not anonymization** — the mapping vault stays local and
is the highest-value secret. It reduces exposure; it does not remove GDPR obligations for data
sent to the cloud. When pseudonymization isn't enough, an opt-in **semantic** level
(abstractive rewriting) moves closer to true anonymization, trading away *full* reversibility for
**partial** reversibility on a spectrum — see *Detection & egress gating* and *Reversibility*.

## Scope (decided)

- **Coverage:** everything — Anthropic-native `/v1/messages` **and** OpenAI-compatible
  `/v1/chat/completions`, all providers, across both agents.
- **Languages:** the major European (space-segmented) languages — **en/de/fr/es/it/pt** — not
  English-only, and explicitly **not** CJK/Thai or other non-segmented scripts (out of scope).
  Each text field is language-detected, then run through that language's NER model; custom
  regex/secret recognizers run language-agnostically across all of them. (PII detection is
  language-specific: an English-only NER engine silently misses names/places in other
  languages and leaks them.)
- **Detection (layered, all on-box):** (1) Presidio per-language NER + custom regex
  recognizers, (2) `detect-secrets`/gitleaks for high-entropy secrets, (3) a **local-LLM
  second pass** for implicit / quasi-identifiers that pattern+NER miss. A lingua language
  detector picks the NER model per field. The local-LLM pass runs against the stack's
  already-configured local model (`LOCAL_LLM_API_BASE` / `LOCAL_LLM_HOST_IP` /
  `LOCAL_LLM_API_KEY`) — it is no longer deferred; it is a first-class detection level.
- **Backends:** not just `api.anthropic.com` / `api.openai.com` — also the four OpenClaw
  subscription backends (`OPENCLAW_ENABLE_CLAUDE_CLI`, `_COPILOT`, `_CODEX`, `_GROK`).
  Base-URL-redirectable, API-key paths are protected by a clean base-URL swap; the
  subscription/OAuth backends need transport-level interception (see Architecture →
  *Interception modes*).
- **Two anonymization levels:** **syntactic** (reversible span→surrogate substitution, the
  default) and, when that isn't enough, an opt-in **semantic** level that *rewrites/generalizes*
  the text to remove implicit identifiers. Semantic is **partially reversible** — recorded
  transformations restore on a spectrum (one-to-one generalizations relocatable in the reply;
  many-to-one collapses are k-anonymity and unrecoverable). See *Reversibility*.
- **Egress gating + faithfulness:** the local-LLM pass returns an **anonymization-sufficiency
  score**; below a threshold the request is **held for a user decision** — including the option
  to escalate to a semantic rewrite. When a semantic rewrite is produced, the local LLM also
  scores its **faithfulness** (does the rewrite still mean the same as the original, so the
  cloud LLM still does the right task) before it can be sent (see *Detection & egress gating*).

## Architecture

One new locally-built service, `liquidupstart/privacy-gateway:${APP_ID}` — a FastAPI app
acting as an anonymizing reverse proxy. Agents reach it by container name on the shared compose
network (container→container by service name; nginx is browser-only and not involved). It runs
two interception modes, because the four OpenClaw backends do **not** all expose a base-URL hook
(verified by research, 2026-06-24).

### Interception modes

- **(A) Base-URL redirect (clean, preferred — v1).** For any client that honors a base-URL
  override: OpenCode's `anthropic`/`openai`/`xai`/`gemini` providers **and claude-cli (Claude
  Code) in both API-key and subscription-OAuth modes** (empirically verified 2026-06-24 — see
  *claude-cli OAuth — verified* below). The client's base URL points at a gateway path that names the upstream; the gateway
  rewrites the body and forwards, passing auth headers (`x-api-key`, `Authorization: Bearer`,
  `anthropic-version`, `anthropic-beta`) through **untouched** — it never needs the keys/tokens.
- **(B) TLS-terminating interception (for the subscription plugins).** Copilot, Codex (ChatGPT),
  and Grok (SuperGrok) are OpenClaw built-in **plugins with hardcoded upstreams**, and their
  subscription tokens are **bound to the vendor host + identity headers** — no base-URL hook, so
  mode A can't reach them. To anonymize their bodies the gateway terminates TLS for the vendor
  hosts using a CA trusted **inside the OpenClaw container**, rewrites the JSON body, and forwards
  to the real upstream with the identity-binding headers/origin **preserved** (those are exactly
  what the anti-abuse layer checks; body anonymization is unaffected by leaving them intact). Mode
  B is heavier and risk-gated — see Risks. (claude-cli is **not** here: although it's also OAuth,
  it's the real Claude Code binary, which honors `ANTHROPIC_BASE_URL` and stays in mode A.)

```
                                   privacy-gateway-${APP_ID}
 OpenCode anthropic/openai/xai  ─┐   ┌───────────────────────────┐   api.anthropic.com
 claude-cli (Claude Code:        ┤A─►│ detect → surrogate → vault │─► api.openai.com / api.x.ai
   API-key OR OAuth)            ─┘   │  + local-LLM 2nd pass      │
                                     │  + sufficiency score/gate  │   api.githubcopilot.com
 OpenClaw Copilot  (plugin)    ─┐   │  de-anonymize response     │─► chatgpt.com/backend-api/…
 OpenClaw Codex    (plugin)    ─┤B─►│  (TLS-MITM, CA in container)│   api.x.ai/v1
 OpenClaw Grok     (plugin)    ─┘   └───────────────────────────┘
```

### claude-cli OAuth — verified (mode A)

Empirically verified against the running stack (Claude Code 2.1.187, 2026-06-24): with a
subscription `CLAUDE_CODE_OAUTH_TOKEN`, pointing `ANTHROPIC_BASE_URL` at a local proxy makes
Claude Code `POST /v1/messages?beta=true` to that proxy with `Authorization: Bearer <oauth>`
**and** `anthropic-beta: …,oauth-2025-04-20,…` intact — OAuth survives the base-URL override.
(The earlier "custom base URL disables OAuth / #33330" finding was about `ANTHROPIC_AUTH_TOKEN`,
a different code path.) So claude-cli uses **mode A**, not mode B — no TLS-MITM needed.

- **Wiring:** set `ANTHROPIC_BASE_URL=http://privacy-gateway-${APP_ID}:<port>/anthropic` in
  `config/openclaw/openclaw-claude.sh` before `exec claude` (the wrapper is the only place that
  survives OpenClaw's `CLAUDE_CLI_CLEAR_ENV` stripping). The gateway forwards to
  `api.anthropic.com` passing `Authorization`, `anthropic-version`, `anthropic-beta`,
  `user-agent` **untouched**; only the JSON body is rewritten.
- **Legality:** the traffic is genuine Claude Code using its own subscription OAuth (real UA +
  beta headers); Anthropic sees a normal Claude Code request. The Jan-2026 block targets OAuth
  tokens used *outside* Claude Code (lifted into custom SDKs/scripts) — we don't do that; we're
  a transparent body-anonymizer, the same category as the gateways Anthropic supports via
  `ANTHROPIC_BASE_URL`. Note also (per OpenClaw): when `ENABLE_ANTHROPIC_CLAUDE_CODE=1`, any
  `ANTHROPIC_API_KEY` is ignored — the anthropic path *is* claude-cli OAuth.
- **Two implementation gotchas from the capture:** Claude Code sends a `HEAD /` preflight
  before the POST (the gateway must answer it), and the request path carries a query string
  (`?beta=true`) the gateway must preserve.

### Routing / upstream map

| Backend (agent) | Auth | Wire protocol | Upstream host | Mode |
|---|---|---|---|---|
| OpenCode anthropic · OpenClaw anthropic API | API key | Anthropic Messages | `api.anthropic.com` | A |
| OpenCode openai | API key | OpenAI Chat Completions | `api.openai.com` | A |
| OpenCode xai / gemini | API key | OpenAI-compat | `api.x.ai` / Gemini | A |
| claude-cli (Claude Code) — API-key **or** subscription OAuth | passes through (`Authorization: Bearer` / `x-api-key` + `anthropic-beta`) | Anthropic Messages | `api.anthropic.com` | A (`ANTHROPIC_BASE_URL` in the wrapper; OAuth **verified** 2026-06-24) |
| OpenClaw **Copilot** | GH token → Copilot token (2-host exchange) | OpenAI Chat Completions | `api.githubcopilot.com` (+ `api.github.com`) | B |
| OpenClaw **Codex** (ChatGPT) | ChatGPT OAuth + `ChatGPT-Account-ID` | OpenAI **Responses** | `chatgpt.com/backend-api/codex/responses` | B |
| OpenClaw **Grok** (SuperGrok) | `auth.x.ai` OAuth | OpenAI Chat/Responses | `api.x.ai/v1` | B |

**Anonymization core is protocol-agnostic** across three wire schemas — schema adapters differ:

- Anthropic Messages: `messages[].content` blocks, `tool_result` content (inbound),
  `tool_use.input` args (outbound).
- OpenAI Chat Completions: `messages[].content`, `tool` results (inbound),
  `tool_calls[].function.arguments` (outbound).
- OpenAI Responses (Codex): `input[]` items + `instructions` (inbound), output items +
  function-call arguments (outbound). A third adapter — new vs the original two.

**Internal endpoint (mode A).** Container names carry the `${APP_ID}` suffix, so agents reach
the gateway at `http://privacy-gateway-${APP_ID}:<port>/<prefix>` on the shared network
(`nocodenation_liquid_upstart_network_${SYSTEM_HTTP_PORT}`). Injected overrides look like
`ANTHROPIC_BASE_URL=http://privacy-gateway-${APP_ID}:<port>/anthropic`. Pick a fixed internal
port (e.g. 8080), add it to `.env.example`. Egress to the public APIs is on the default bridge
network — allowed.

## Vault & consistency model

Because responses are de-anonymized **before** being returned, the agent's own
conversation history always holds real values. Next turn the agent resends real values,
which we re-anonymize inbound. Therefore we never de-anonymize history — the vault only
needs to map **same original → same surrogate consistently**.

The vault is a bidirectional consistent map. It records **one entry per transformation** so
both syntactic surrogates and (recorded) semantic generalizations can be reversed where possible:

- `fwd: original → replacement` — keeps cross-turn / cross-tool-call consistency.
- `rev: replacement → original` — de-anonymizes responses.
- per-entry metadata: `transform_type` (`surrogate` | `generalization`), `cardinality`
  (`one_to_one` | `many_to_one`), `entity_type`, `conversation_id`, session-stable id, and
  **`restorable: bool`** (set `false` for many-to-one or detail-dropping generalizations **and for
  surrogate types too short/structured to be made distinctive** — see *Reversibility*), plus an
  optional minimal semantic anchor to aid relocation.
- **Collision-safety invariants.** Surrogates are generated so the literal-restore step
  is safe. Each Faker draw is regenerated until it is **bijectively unique** — not equal to any
  existing surrogate *or any stored original* — **not a sub/superstring** of an existing surrogate,
  **not a common dictionary word**, and **not already present in the request's prompt text**; it is
  type-consistent, made distinctive (≥4 chars, prefer multi-token) where the type allows, and
  restricted to a **safe character set** (no quotes, backslashes, control, or regex metacharacters)
  so single-pass substitution can't break a JSON tool-call envelope or the matcher. Uniqueness /
  non-substring checks run against the **conversation-scoped** live set (TTL-bounded, so they stay
  cheap); after K failed draws append a rare affix, else fail-closed. Literal matching is
  **case-sensitive** (case-folding multiplies false restores). These invariants cover identifiers
  the *prompt* carries — the model's *completion* is unknowable here and is defended only by
  boundary matching, precision-first leave-as-surrogate, and the Milestone 7 outbound re-scan.

The cloud only ever sees replacements (surrogates or generalizations). **Security nuance:**
recording generalizations adds no new *originals* at rest (the vault already holds them), but the
restore-metadata makes a leaked vault more re-identifying *per entry* — keep that metadata
minimal and under the same protection as the originals.

- **Engine:** start from LangChain `PresidioReversibleAnonymizer(add_default_faker_operators=True, faker_seed=42)`
  for detection + Faker surrogates + the mapping; implement our **own** response
  substitution (literal, boundary-aware, longest-surrogate-first, single-pass) over content,
  tool-call args, and stream deltas — **parse-aware** for structured payloads, restoring only
  within JSON **string values** (`tool_use.input` / `tool_calls.arguments`), never keys, numbers,
  or structure.
- **Detectors (layered):** Presidio per-language NER + custom `PatternRecognizer`s for
  internal hostnames/ID formats + `detect-secrets` (pure-Python, in-process) for high-entropy
  secrets (optional `gitleaks`), **plus a local-LLM second pass** for implicit / quasi-
  identifiers — see *Detection & egress gating*.
- **Scope:** single-user self-hosted. The `fwd` consistency map can be process-wide for
  cross-tool reuse, but **`rev` restore lookups are conversation-scoped** (keyed by
  `conversation_id`) — a surrogate minted in one conversation must never restore inside another's
  reply. Persisted encrypted (AES-GCM) under `./volumes/privacy-gateway/` (host-disk convention),
  with TTL.
- **Fail-closed:** any detection/anonymization error blocks the request; never forward
  unscanned. Gateway is the only egress; the vault is never exposed over HTTP.

## Detection & egress gating

Anonymization has **two levels**:

- **Syntactic (reversible, default):** detect spans and replace them with realistic,
  type-consistent surrogates; the vault maps original↔surrogate and the response is
  de-anonymized before the agent sees it. This is pseudonymization — fully round-trippable.
- **Semantic (abstractive, opt-in, lossy):** *rewrite/generalize* the text so implicit /
  quasi-identifiers are removed while task-relevant meaning is preserved ("John, the VP who
  relocated from our Reykjavík office" → "a senior leader who recently transferred from a
  European office"). This is generalization, **not** reversible — see *Reversibility* below.

Pattern + NER + secret scanning are syntactic and catch *explicit* identifiers. They miss
**implicit / quasi-identifiers** — a job title + city + a distinctive detail — which an
adversarial LLM can re-identify at near-expert accuracy from otherwise innocuous text (Staab
et al., *Beyond Memorization*, ICLR 2024); classic redaction does **not** stop that inference,
which is exactly why a semantic level is needed. Three local-LLM uses close the gap; all run on
the stack's already-configured local model (`LOCAL_LLM_API_BASE` / `LOCAL_LLM_HOST_IP` /
`LOCAL_LLM_API_KEY`), so raw text stays on-box.

**(1) Second-pass detector.** After Presidio + detect-secrets, the local LLM is prompted to
extract any remaining sensitive spans (exact substrings + a type from a fixed taxonomy). Its
spans are merged into the same detect→surrogate→vault pipeline as another recognizer, so they
get consistent reversible surrogates like everything else. Reason-first JSON, low temperature,
single pass; short/structured fields skip the call.

**(2) Anonymization-sufficiency score → user decision.** The local LLM then acts as an
**adversary against the already-anonymized text** and returns a residual re-identification
risk. Define sufficiency as adversary-failure, **not span coverage** — partial masking is
over-credited otherwise (Staab et al., *LLMs are Advanced Anonymizers*, ICLR 2025). The score
is the worst case of two channels:

- **Deterministic floor** — any *unmasked* entity Presidio scored ≥ ~0.85 forces high risk.
- **Adversarial LLM pass** — list each residually inferable attribute, estimate per-attribute
  rarity, combine to an approximate `k` (k≈1 ⇒ uniquely identifiable) / 0–1 risk, plus a
  *verbalized* confidence (better-calibrated than logits — Tian et al., arXiv:2305.14975).
  Reasoning fields precede the score in the JSON; per-attribute decomposition beats one-shot
  (BRANCH, arXiv:2503.09674). Sample 2–3× and take the max **only** when first-pass confidence
  is low, to protect local-model latency.

Map to three buckets with a two-threshold gate (thresholds in `.env`):

| Bucket | Condition | Action |
|---|---|---|
| **Low** (sufficiency ≥ ~0.8) | no inferable attrs, large `k` | auto-proceed (optional quiet "protected" badge) |
| **Medium** (~0.5–0.8) | some residual hints | **soft gate** — friction prompt: *Send · Redact more · Edit · Keep local* |
| **High** (< ~0.5) | any unmasked Presidio ≥ 0.85, or small `k` | **hard gate** — block until: *Semantic rewrite · Edit · Keep local-only · Send anyway (logged) · Abort* |

**(3) Semantic anonymization (opt-in) + faithfulness check.** Syntactic substitution can't
fix a quasi-identifier that lives in the *phrasing* (role + place + detail) — no single span to
swap. When the sufficiency score is Medium/High, the gate **offers** (never auto-applies — users
distrust and dislike forced abstraction, Rescriber CHI 2025) a semantic rewrite. A
**rewrite → verify** loop, capped at 3–5 rounds (the privacy↔utility knob):

1. **Rewriter** (local model) — generalize quasi-identifiers, delete direct identifiers, keep
   task meaning. Constraint: a generalization is allowed only if the **original entails it**
   (truthful generalization — blocks hallucinated replacements; *Truthful Text Sanitization*,
   arXiv:2412.12928). Emits `{rewrite, transformations[]}`; each transformation is recorded in
   the vault (original ↔ replacement, cardinality, `restorable` flag) so the response can be
   **partially** de-anonymized afterward — see *Reversibility*.
2. **Faithfulness judge** — **must be a separate model / fresh context, never the rewriter
   in-context** (self-preference inflates self-graded faithfulness inside refine loops —
   arXiv:2402.11436; root cause is low-perplexity familiarity, arXiv:2410.21819). Scores whether
   the rewrite still means the same as the original.
3. **Re-inference adversary + arbitrator** — re-attack the rewrite; an arbitrator rejects
   *hallucinated* leaks so a false alarm doesn't force meaning-destroying edits.
4. **Targeted revise** only the flagged spans; loop.

**Faithfulness / semantic-correctness score (0–1).** Define as `min(precision, recall*)`:
- `precision` = rewrite ⊨ original — no **added/hallucinated** facts.
- `recall*` = original ⊨ rewrite over **non-sensitive** content only — no **dropped**
  task-relevant meaning (the intended redactions are excluded, or the score self-defeats since
  good anonymization deletes the PII by design).

Compute each as **two-directional** AlignScore (cheap learned [0,1] metric, arXiv:2305.16739)
cross-checked by the separate-model judge (G-Eval form-filling, reason-then-score,
arXiv:2303.16634). Bands (domain-calibrated; conservative defaults): **≥0.85** auto-acceptable ·
**0.70–0.85** surface the diff for a decision · **<0.70** warn (likely meaning-breaking).
Never trust a self-reported faithfulness number alone (LLM-judge overconfidence + self-
preference). Present the outcome as a **2-D (privacy, faithfulness) point**, not one scalar —
the two trade off, and there is no correlation between an attribute's risk and its utility cost,
so high-risk/low-utility detail can often be stripped "for free" (Adanonymizer, arXiv:2410.15044).
UX: show an original↔rewrite **diff** + the faithfulness band; *Accept · Edit · Keep
syntactic-only · Abort*.

### Reversibility — a spectrum, not a binary

Semantic rewrites are **not inherently one-way.** The vault already holds the originals (it must,
for syntactic surrogates), and the rewriter **records each transformation** (original ↔
replacement + metadata), so the information survives at rest. What actually gates restoration is
the *round-trip*: can de-anon (a) **relocate** the replacement in the model's reply and (b) map it
back **unambiguously**? That yields three tiers:

| Tier | Transform | Restorable? | Anonymization |
|---|---|---|---|
| **Fully reversible** | recorded surrogate substitution (distinctive 1:1 fake) | yes — deterministic vault swap; only failure is the model mutating the surrogate string, which fuzzy relocation handles | weakest |
| **Partially reversible** | recorded **one-to-one** generalization | yes *if* the generalized phrase can be relocated in the reply — needs **semantic** matching (low surface similarity), with false-match risk | medium |
| **Unrecoverable** | **many-to-one** generalization, or one that dropped detail the reply now needs | no — ambiguous *in principle*: the discriminating bits are gone from the text even though both originals sit in the vault | strongest |

The unrecoverable tier is **k-anonymity by construction** (Sweeney 2002): collapsing distinct
values into one equivalence class *is* the privacy mechanism, so the vault can't know which
original a given reply token meant. And the hard part for tier 2 is **relocation, not storage** —
a generalization ("age 34" → "30–39") has low surface similarity to its original, so the
Levenshtein/n-gram fuzzy matching that works for surrogates (which are corrupted *copies* of the
key) breaks down; it needs embedding/alignment matching.

**De-anon cascade (precision-first — a wrong restore is worse than a missed one):** literal exact
(boundary-aware, single-pass longest-first; boundary guard unconditional — European
space-segmented scope, no non-segmented-script case)
→ guarded fuzzy (high cutoff + length/word guards) → semantic/alignment (high cosine threshold,
one-to-one Hungarian assignment, verified by AlignScore/entailment) → **leave-generalized
fallback**. Entries the vault marks `restorable: false` are **never** restored — this covers
many-to-one / detail-dropped generalizations **and surrogate types that can't be made distinctive**
(dates, numeric IDs, ports, ages, short codes/initials): a fake date is still digits that would
match arbitrary numbers in the reply, so we anonymize them outbound but never literal-restore them
(precision-first — a surrogate date surviving in the reply is harmless; rewriting an unrelated
number is corruption). Realistic, type-consistent, session-stable surrogates still matter: they make
the tier-1 round-trip survive the model paraphrasing its reply (opaque tags like `<PERSON_14>`
get mangled; Faker-style values are rewritten *around*).

**Reversibility-by-construction (opt-in lever).** Instructing the rewriter toward *consistent,
distinctive, one-to-one* generalizations (closer to human-readable surrogates than to collapsing
generic terms) shifts content from tier 3 up to tier 2 — **more restorable, but less anonymous**
(the distinctiveness that enables mapping is also more identifying, and it makes a leaked vault
more re-identifying per entry). Same privacy↔utility axis as the sufficiency/faithfulness scores;
surface it as *more restorable = less anonymous*. If a use case truly needs high-fidelity recovery
of generalized content, the proven alternative is a Hide-and-Seek-style **trained local recovery
model** (original as in-context conditioning), not a string-relocation vault — at the cost of a
model and residual lossiness (arXiv:2309.03057). No surveyed system records
original↔generalization for output restoration, so the cascade above is our own design.

This score-surfaced **user decision point** is the deliberate design: the human-in-the-loop
sanitizers (Rescriber CHI 2025, Casper) gate on *binary* detection without a calibrated score;
the tools that produce a numeric risk (Presidio, LLM Guard, the Staab line) are fully automatic
with **no** human gate. Combining them is the novel piece. UX guardrails from the HCI evidence:
show *what* was masked and *why the remainder is risky* (detection educates users — Rescriber);
reserve the hard interrupt for high risk and use light friction for medium (warning habituation
sets in by the second exposure — Anderson/Vance, MISQ 2018); offer per-entity accept/reject and
a "report false positive" path (LLM detectors over-flag — PAPILLON). Remembered decisions live
in the local vault (user-deletable); avoid silent persistent allowlists for high-risk types.

There is **no universal threshold** — re-identification risk is release-context dependent
(El Emam/Scaiano 2016); the thresholds are tunable and default conservative.

## Local model roster

Three local-LLM roles run on the stack's existing model server (one llama.cpp endpoint via the
`LOCAL_LLM_*` config, models addressed by name). The roster is a **role → model mapping behind
env keys**, not a hard dependency — each role is selected at runtime so any compatible model
swaps in cleanly. The models below are the **current (mid-2026) test-system** picks; this is a
**test rig, not production hardware** (a DGX Spark: 128 GB unified / ~273 GB/s, so LLM decode is
bandwidth-bound → MoE for the latency-critical role). Production will likely differ — keep the
selection in env, never hardcode a model.

| Role | Env key | Model (test rig) | Why |
|---|---|---|---|
| **Rewriter / detector** — per field, latency-critical | `PRIVACY_GATEWAY_REWRITER_MODEL` | **Qwen3.5-35B-A3B** (MoE, 3B active, Apache-2.0) | 3B-active decode keeps per-field latency low on bandwidth-bound HW; 201-language coverage; strong JSON / instruction-following for detection + abstractive rewrite |
| **Judge** — faithfulness + adversarial re-inference, infrequent | `PRIVACY_GATEWAY_JUDGE_MODEL` | **gemma4-31b** (dense, Apache-2.0) — *already loaded* | **Different family** from the rewriter (avoids self-preference bias in self-grading); 140+ languages; dense is fine for an infrequently-called role |
| **Embedder** — de-anon relocation + similarity | `PRIVACY_GATEWAY_EMBED_MODEL` | **qwen3-embed-4b** (2560-dim) — *already loaded* | Powers the semantic-relocation cascade (*Reversibility*) and similarity; kept at 4B for the test rig (Qwen3-Embedding-8B is a drop-in Apache-2.0 upgrade later) |

Notes:
- **Family diversity is deliberate:** rewriter (Qwen) ≠ judge (Gemma). A model over-rates its
  own rewrite (self-preference, perplexity-driven), so the judge must be a different family.
- **Latency split:** the rewriter is called per field → MoE (low active params) is essential (a
  dense 31B measured ~30 s/field in early local testing); the judge runs only on opt-in semantic escalation, so dense
  is acceptable. All three resident ≈ 60 GB at Q6_K, leaving ample room for large agent KV caches.
- **Deterministic cross-check** (AlignScore ~355 M) runs in the gateway *container*, not on the
  model server — independent of this roster.
- **Build note:** 2026 architectures need a recent llama.cpp (Qwen3.5 hybrid MoE; Gemma 4) —
  verify before loading.
- Only one model needs adding to the current server (the Qwen3.5 rewriter); judge + embedder are
  already running.

## Milestones

| # | Deliverable | Mode |
|---|---|---|
| **0** | **Prototype (standalone).** `PresidioReversibleAnonymizer` round-trip on a real `/v1/messages` payload + custom recognizers + detect-secrets, **European-language** (en/de/fr/es/it/pt, per-language NER + lingua), with the local-LLM second pass + sufficiency score. Validates surrogate quality, reversal, language coverage. **Collision acceptance bar:** on a labelled corpus of real payloads, **zero false restores** + ≥ target correct-restore rate, surrogate-regeneration rate logged. | — |
| **1** | **Native `/v1/messages` shim, non-streaming.** FastAPI `/anthropic/v1/messages`; anonymize `messages` + `tool_result` inbound; forward; de-anonymize `content` + `tool_use.input`. Vault + fail-closed. Dockerized; build + start scripts; `.env.example` keys. Wire `ANTHROPIC_BASE_URL` for OpenCode (add `"baseURL"` to the `anthropic` provider's `options` in `config/opencode/entrypoint.sh`, mirroring `llamacpp` at line 73) + **claude-cli** (Claude Code — API-key *and* subscription-OAuth) via `ANTHROPIC_BASE_URL` in `openclaw-claude.sh` (verified — see *claude-cli OAuth — verified*). | A |
| **2** | **Streaming SSE de-anon for `/v1/messages`** (the hard part). Iterate SSE, sliding-window buffer for surrogates split across chunks, de-anon `text_delta` + `input_json_delta`. | A |
| **3** | **OpenAI Chat Completions path.** `/openai/v1/chat/completions` (+ `/xai`, gemini-compat), anonymize/de-anon incl. `tool_calls` + streaming. Wire `OPENAI_BASE_URL`/xai `baseURL` in OpenCode entrypoint. | A |
| **4** | **Local-LLM detection + egress gating + semantic anonymization** (was deferred M6; now in scope). Second-pass detector merged as a recognizer; anonymization-sufficiency score; soft/hard user-decision gate; `.env` thresholds. **Opt-in semantic (abstractive) rewrite** via a rewrite→verify loop with a **faithfulness score** (separate-model judge + two-directional AlignScore) and truthful-generalization (entailment) constraint; reversibility limited to syntactic spans. Calls the stack's `LOCAL_LLM_API_BASE`. Split into sub-steps (detector → score/gate → semantic rewrite+faithfulness) if it gets large. | A/B |
| **5** | **OpenAI Responses adapter.** Third schema adapter for `…/responses` (Codex uses it, not Chat Completions). Enables redirectable Responses traffic and is a prerequisite for Codex under mode B. | A/B |
| **6** | **Mode-B TLS interception for the subscription plugins.** CA trusted inside the OpenClaw container; intercept + body-anonymize **Copilot** (`api.githubcopilot.com` + the `api.github.com` token-exchange), **Codex** (`chatgpt.com/backend-api/codex/responses`), **Grok** (`api.x.ai/v1`) — preserving identity-binding headers/origin. (claude-cli is **not** here — it's mode A; see *claude-cli OAuth — verified*.) Per-backend sub-steps; heavily risk-gated (Risks #6, #7). | B |
| **7** | **Harden.** Encrypt vault at rest; TTL/expiry; outbound re-scan backstop (LLM-Guard-`Sensitive` style) → hard-block on any secret leak; audit log of masked **types** (not values); allowlist flagging "can't-anonymize → keep local-only." | — |

## Stack-integration touch points

*(Wiring below verified against the codebase on 2026-06-24.)*

- **New service** in `compose.yml`: `privacy-gateway` (container `privacy-gateway-${APP_ID}`),
  on `nocodenation_liquid_upstart_network`, egress allowed. **Enable mechanism — open
  decision (see Risk #5):** either a Compose `profiles:` gate (service only starts when
  `PRIVACY_GATEWAY_ENABLE=1`) or always-defined-but-idle with the flag gating only the
  base-URL injection. The `hermes` precedent is source-comment toggling across 5 files
  (compose, `build.sh`, `start.sh`, proxy `depends_on`, proxy aliases) — but it's a
  browser-facing service, so most of that doesn't apply here.
- **Build:** `config/scripts/build/privacy-gateway.sh` (render Dockerfile from
  `config/privacy-gateway/templates/` via `lib/dockerfile-render.sh`, using
  `resolve_image_settings "PRIVACY_GATEWAY"`); register in `scripts/linux/build.sh` +
  `start.sh`; mirror `.bat`. Image `liquidupstart/privacy-gateway:${APP_ID}`.
- **Start:** `config/scripts/start/privacy-gateway.sh` — when `PRIVACY_GATEWAY_ENABLE=1`,
  inject base-URL overrides into the agent services. **OpenCode:** add a conditional
  `"baseURL"` line to the relevant `options` blocks in `config/opencode/entrypoint.sh`
  (those blocks exist per-provider; only `llamacpp` currently sets `baseURL`). **OpenClaw
  claude-cli:** set `ANTHROPIC_BASE_URL` in `config/openclaw/openclaw-claude.sh` before
  `exec claude` (mode A, verified — see *claude-cli OAuth — verified*); this *is* the anthropic path when
  `ENABLE_ANTHROPIC_CLAUDE_CODE=1` (the `ANTHROPIC_API_KEY` is ignored then). **OpenClaw
  API-key providers:** `openclaw.json` does carry a per-provider `baseUrl` (confirmed in the
  running config — `models.providers.<id>.baseUrl`), so an API-key anthropic/openai provider
  can be redirected via the `openclaw.json` patch in `config/scripts/start/openclaw.sh`
  (Risk #4).
- **`.env.example` (the contract — add keys here first):** `PRIVACY_GATEWAY_ENABLE=0`,
  internal port, fail-closed flag, vault key/TTL, the `ANTHROPIC_BASE_URL`/`OPENAI_BASE_URL`/etc.
  plumbing, plus the new detection/gating keys (`PRIVACY_GATEWAY_LOCAL_LLM_ENABLE`,
  score thresholds, languages), the model-roster keys (`PRIVACY_GATEWAY_REWRITER_MODEL` /
  `_JUDGE_MODEL` / `_EMBED_MODEL`, resolved against the existing `LOCAL_LLM_*` endpoint), and
  mode-B toggles (`PRIVACY_GATEWAY_MITM_ENABLE`, per-backend flags). **Per the contract, also
  declare any new keys in each consuming service's template first** —
  `config/openclaw/templates/env_template` does not list `ANTHROPIC_BASE_URL`/etc.
- **Local-LLM detector reuses the existing config.** The gateway calls the stack's already-set
  `LOCAL_LLM_API_BASE` / `LOCAL_LLM_HOST_IP` / `LOCAL_LLM_API_KEY` (OpenAI-compat,
  `…/v1/chat/completions`, Bearer auth). On the compose network the `local_llm` alias resolves
  via `extra_hosts: "${LOCAL_LLM_HOST}:${LOCAL_LLM_HOST_IP}"` (same pattern the agent services
  use). Pin a chat model (`PRIVACY_GATEWAY_LOCAL_LLM_MODEL`) or discover via `/v1/models`.
- **Mode-B (subscription plugins) needs trust + routing in the OpenClaw container** (M6):
  bake a gateway-generated CA into the OpenClaw image's trust store (`NODE_EXTRA_CA_CERTS` for
  the Node runtime), and steer the vendor hosts to the gateway (per-container `extra_hosts`/DNS,
  not host-wide). Keep this off by default and per-backend gated. claude-cli does **not** need
  any of this — it's mode A via `ANTHROPIC_BASE_URL` in the wrapper.
- **nginx:** untouched (autogenerated; internal calls bypass it).

## Risks / open decisions

1. **System prompts & tool definitions carry sensitive data (internal tool names/descriptions).**
   **V1** leaves tool schemas untouched — *opaque* masking measurably degrades dispatch (definition
   names correlate with tool purpose and LLMs infer behaviour from them — naming effects
   arXiv:2307.12488, ToolTweak arXiv:2510.02554). **V2** anonymizes them through the **M4 semantic
   level**, not surrogate substitution: *generalize* internal identifiers while preserving function
   (`query_acme_prod_db` → `query_customer_database`), gated by the same **truthful-generalization +
   faithfulness** checks (faithfulness here = dispatch still works). Use **one-to-one** generalized
   tool names (the *Reversibility* distinctiveness lever) so the returned `tool_use.name`
   de-anonymizes as a clean round-trip; call arguments + results already flow through the normal
   pipeline; system prompts get the same entity + semantic treatment. **Out of scope —
   local-orchestrator delegation (PAPILLON / AirGapAgent):** having the local model
   rewrite-and-reconstruct each call, or run the agent loop and delegate only sanitized sub-questions
   to the cloud, keeps tool defs fully local but **breaks the transparent-proxy design** and is
   bounded by local agentic capability (the gap Claude fills); PAPILLON is validated only single-turn,
   no tool use. Credible future architecture, deliberately not V1/V2 (*Background → tool-definition
   privacy & delegation*).
2. **Latency budget.** Presidio-only keeps per-request overhead low; the local-LLM pass (M4)
   is the latency-heavy addition (a single field can cost seconds on a large local model —
   early local testing measured ~30 s/field on a dense 31B, `gemma4-31b`). Mitigations: run it only on free-text
   fields (skip short/structured ones), single low-temperature pass, gate self-consistency
   sampling on low confidence only, and consider making the second-pass detector and the
   score independently toggleable so users trade latency for assurance.
3. **Pseudonymization ≠ GDPR exemption.** The vault is re-identifying info; treat as risk
   reduction, keep it strictly local.
4. **OpenClaw per-provider baseURL.** OpenClaw is itself an LLM gateway; its backends are
   wired by patching `openclaw.json` in `config/scripts/start/openclaw.sh`. Research clarified
   the split: the **subscription backends are bundled plugins/runtimes** (`copilot`/`codex`/
   `xai`) with **no** base-URL hook — confirmed, hence mode B (Risks #6–#7). For the **API-key
   anthropic** provider, whether OpenClaw's config (or a plain `ANTHROPIC_BASE_URL` env) can
   redirect the upstream is still the open M1 item. OpenCode is unaffected (its provider
   `options.baseURL` is a known, supported field). claude-cli reads `ANTHROPIC_BASE_URL` via the
   `openclaw-claude.sh` wrapper — clean in **both** API-key and OAuth modes (verified — see
   *claude-cli OAuth — verified*).
   Update: `openclaw.json` *does* carry `models.providers.<id>.baseUrl` (confirmed in the running
   config), so the API-key anthropic path is redirectable too — though it's unused whenever
   claude-cli is enabled.
5. **Enable mechanism (Compose profiles vs. always-on).** A `profiles:` gate avoids running
   an idle container when disabled but adds a Compose feature the stack doesn't use elsewhere;
   always-defined-but-idle is simpler and keeps the toggle purely in the start-script
   injection. Decide before Milestone 1's Dockerization step.
6. **Mode-B needs TLS-MITM with a CA trusted inside the OpenClaw container (Milestone 6).**
   The subscription backends (Copilot/Codex/Grok) are OpenClaw **built-in plugins/runtimes with
   hardcoded upstreams** — research found **no** per-provider base-URL hook, so config redirect
   is impossible; transport interception is the only option. That means generating a local CA,
   installing it in the OpenClaw image's trust store, and DNS/route-steering the vendor hosts to
   the gateway. Cost: CA lifecycle, breakage when a client pins TLS, and **ToS / anti-abuse
   exposure** for intercepting subscription traffic. Make mode B opt-in per backend; document
   the ToS risk; API-key/mode-A paths remain the safe default.
7. **Subscription auth is host- and identity-bound — anonymize the body, not the envelope.**
   Each subscription backend binds its token to its own host + an identity signal the anti-abuse
   layer checks: Codex needs `ChatGPT-Account-ID` + `originator` and must stay on
   `chatgpt.com/backend-api/codex/responses`; Copilot needs the IDE header allowlist
   (`copilot-integration-id`, `editor-version`, …) **and a second token-exchange call to
   `api.github.com`**; Grok OAuth has `api.x.ai` origin-pinning. The gateway must forward these
   **untouched** and reach the real upstream — it can only scrub the JSON body, not the
   identity envelope. Copilot's two-host flow means interception must not break
   `api.github.com/copilot_internal/v2/token` (and must avoid hijacking unrelated `gh`/git).
8. **Scoring calibration (Milestone 4).** LLM PII detectors **over-flag** (false positives
   dominate — PAPILLON), verbalized confidence is better-calibrated than logits but still
   imperfect, and there is **no universal risk threshold** (context-dependent). Keep a coarse
   risk bucket separate from a fine 0–1 confidence, default thresholds conservative, offer a
   "report false positive" path, and validate the scorer against a stronger adversary LLM.
9. **User-decision fatigue.** Warning habituation sets in by the second exposure (Anderson/
   Vance, MISQ 2018). Reserve the hard block for high risk; use light friction for medium;
   explain *what* and *why*; remember decisions in the local vault — but avoid silent
   persistent allowlists for high-risk categories.
10. **Semantic anonymization is partially reversible and can distort the task (Milestone 4).**
    Abstractive rewriting has three failure modes: **over-generalization** ("cancer diagnosis" →
    "medical condition" destroys task meaning), **under-generalization** (leaves re-identifying
    cues), and **hallucination** (invented replacements). Mitigations: keep it strictly opt-in;
    truthful-generalization (entailment) constraint against hallucination; faithfulness gate
    against over-generalization; re-inference adversary against under-generalization.
    Reversibility is a **spectrum** (see *Reversibility*): one-to-one generalizations are
    restorable via recorded transformations + a precision-first relocation cascade; many-to-one
    collapses are k-anonymity and **genuinely unrecoverable** — mark them `restorable: false`.
    De-anon must bias to precision: a **wrong restoration** (false semantic match) is worse than
    leaving content generalized, so the cascade always falls through to leave-generalized.
11. **Faithfulness judge reliability (Milestone 4).** A model grading its own rewrite
    over-rates it (self-preference, amplified inside refine loops — arXiv:2402.11436).
    **Resolved by the roster** (*Local model roster*): the judge (`gemma4-31b`) is a different
    family from the rewriter (`Qwen3.5-35B-A3B`). Still cross-check with a deterministic metric
    (two-directional AlignScore) and don't rely on a self-reported faithfulness number. Residual
    cost: rewrite + judge + adversary, ×rounds — gate the whole semantic path on the user opting
    in, and cap rounds.

## Background / prior art

**Anonymization core**
- Microsoft Presidio (`presidio-analyzer`/`-anonymizer`, `DeanonymizeEngine`); per-entity 0–1
  score with `AnalysisExplanation` — the deterministic floor for the sufficiency score.
- LangChain `PresidioReversibleAnonymizer` (Faker surrogates + reversible mapping) — closest
  reference implementation; the model to copy.
- LLM Guard `Anonymize`/`Deanonymize` + `Sensitive` output scanner (re-scan backstop); exposes
  a `risk_score` + `threshold` (automatic, no human gate).
- LiteLLM built-in Presidio guardrail is **not** used: its reversible de-anon is buggy on the
  Anthropic-native path (issue #22821 — PII never unmasked, 400 on tool calls, streaming SSE
  bytes pass through). We own a custom shim instead.

**Local sanitization + human-in-the-loop** (the model for M4's gate)
- Rescriber (CHI 2025, arXiv:2410.11876) — local-LLM PII sanitization, per-entity user panel,
  Replace vs **Abstract**, response write-back; binary gate, no score.
- Casper (arXiv:2408.07004) — 3 local layers (regex → NER → topic LLM), asymmetric gating.
- PAPILLON / PUPA (arXiv:2410.17127) — privacy-conscious delegation; LLM-judge leakage metric
  (~86% human agreement; false positives dominate). Hide-and-Seek (arXiv:2309.03057).

**Tool-definition privacy & delegation** (the model for Risk #1)
- AirGapAgent (CCS 2024, arXiv:2405.05175) — a local **data-minimizer** LLM decides, by contextual
  integrity, what may be exposed to the third party before the capable model runs (protection
  <35%→>85%). The model for "keep sensitive tool defs/data local, expose per-task."
- PAPILLON (arXiv:2410.17127) reused as **delegation** (not just the leakage metric): local Prompt
  Creator abstracts → cloud answers → local Aggregator reconstructs; 85.5% quality / 7.5% leakage,
  but **single-turn, no tool use** — the agentic case is open.
- Tool-dispatch sensitivity to names: definition names correlate with purpose and drive selection
  accuracy, so opaque/shuffled renames degrade it (naming effects, arXiv:2307.12488) and tools can
  be adversarially renamed to hijack selection (ToolTweak, arXiv:2510.02554) — hence
  generalize-preserving-function, never opaquely mask.
- Inference-time info-flow gate: PrivacyChecker / *Privacy in Action* (arXiv:2509.17488) — a
  standalone mediator checks flows but reasons with the *same* cloud model (no local firewall).
- Split inference (PFID arXiv:2406.12238, Split-and-Denoise arXiv:2310.09130) ships hidden states
  not text — **inapplicable to closed API models** (can't run Claude's layers locally).

**Residual re-identification risk scoring** (the model for the sufficiency score)
- Staab et al., *Beyond Memorization* (ICLR 2024, arXiv:2310.07298) — adversarial LLM inference
  of attributes from innocuous text; the threat model.
- Staab et al., *LLMs are Advanced Anonymizers* (ICLR 2025, arXiv:2402.13846) — privacy =
  "no longer inferable by an adversarial LLM"; per-attribute, span-coverage over-credits.
- BRANCH (arXiv:2503.09674) — per-attribute Bayesian decomposition → joint `k`. TAB / k-anonymity
  for free text (arXiv:2202.00443). El Emam/Scaiano (JBI 2016) — risk is context-dependent.
- Calibration: verbalized confidence > logits (arXiv:2305.14975); reason-first, don't constrain
  reasoning into strict JSON (arXiv:2408.02442); warning habituation (Anderson/Vance, MISQ 2018).

**Semantic / abstractive anonymization + faithfulness** (the model for M4's semantic level)
- Rescriber "Abstract" mode (arXiv:2410.11876) — per-span generalize vs redact; reverses only
  substitution, treats abstraction as one-way; users preferred redaction and distrusted awkward
  abstraction → offer, don't default.
- Truthful Text Sanitization (arXiv:2412.12928) — generalize over suppress, gated by an
  **entailment** constraint (original must entail the replacement) to block hallucination;
  deepen abstraction while an inference attack still succeeds. Three failure modes named:
  over-/under-generalization, hallucination.
- Staab *LLMs are Advanced Anonymizers* (arXiv:2402.13846) — feedback-guided adversarial
  rewrite loop, privacy↔utility frontier by rounds. DP paraphrase: DP-Prompt (arXiv:2310.16111).
  Falsification/decoy: IncogniText (arXiv:2407.02956). Reversal-by-generation: HaS
  (arXiv:2309.03057); never-send + re-inject: ConfusionPrompt (arXiv:2401.00870).
- Faithfulness scoring: AlignScore (arXiv:2305.16739, learned [0,1], run **both directions**),
  SummaC (arXiv:2111.09525), G-Eval LLM-judge (arXiv:2303.16634). Self-grading bias:
  Pride-and-Prejudice (arXiv:2402.11436), perplexity-not-recognition (arXiv:2410.21819) ⇒ use a
  separate-model judge. Privacy–utility UX: Adanonymizer 2-D control (arXiv:2410.15044).

**Semantic reversibility (the model for the spectrum + de-anon cascade)**
- k-anonymity / generalization is one-way *by construction* — collapsing values into an
  equivalence class is the privacy mechanism (Sweeney 2002; Samarati & Sweeney). Information-loss
  metrics (Discernibility, NCP) quantify the discarded bits. This is the unrecoverable tier.
- Reversibility ↔ anonymization-strength is the **pseudonymization vs anonymization** axis
  (GDPR Art. 4(5): pseudonymization retains "additional information that allows reversal").
- Relocating a recorded generalization in a paraphrased reply needs **alignment/embedding**
  matching, not surrogate-style fuzzy string match: span alignment (arXiv:2106.02569, SimAlign
  arXiv:2004.08728, awesome-align arXiv:2101.08231) + a verification gate (AlignScore). Bias to
  precision (RapidFuzz with guards; high cosine threshold; Hungarian one-to-one assignment).
- LangChain/Presidio reversal relocates **surrogates only** (original↔surrogate entity pairs, 5
  matching strategies) — no generalization concept. HaS (arXiv:2309.03057) recovers via a
  **trained** local model, not a stored map. No surveyed system records original↔generalization
  to restore output — the recorded-transformation cascade here is a new design point.

**Backend interception (mode B)** — endpoints/auth confirmed by research, 2026-06-24
- Copilot: OpenAI Chat Completions at `api.githubcopilot.com`; two-token flow via
  `api.github.com/copilot_internal/v2/token`; validated IDE headers (`copilot-integration-id`,
  `editor-version`, …); ref community proxy `ericc-ch/copilot-api`.
- Codex (ChatGPT): OpenAI **Responses** at `chatgpt.com/backend-api/codex/responses`; OAuth +
  `ChatGPT-Account-ID` + `originator: codex_cli_rs`; `OPENAI_BASE_URL` override exists.
- Grok (SuperGrok): `api.x.ai/v1`, OpenAI-compat; `auth.x.ai` OAuth; custom base URL forces
  API-key mode (disables subscription).
- Claude Code: `ANTHROPIC_BASE_URL` officially supported (Bedrock/Vertex/LiteLLM gateways);
  `ANTHROPIC_AUTH_TOKEN` → Bearer, `ANTHROPIC_API_KEY` → `x-api-key`; OAuth + custom base URL
  broken (anthropics/claude-code#33330).
