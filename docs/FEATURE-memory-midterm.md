# Feature: Mid-term Memory for the Agent Harnesses

Status: **Draft — for sign-off**
Branch: not cut yet; proposed `feature/memory-midterm`, from `main`
Written 2026-09-18

---

## 1. Purpose

The stack has two of the three memories an agent needs, and they sit at opposite ends.

| Term | What it is here | Where it lives |
|---|---|---|
| **Short** | the context window of one session | nowhere; it ends with the session |
| **Mid** | **missing** | — |
| **Long** | retrieval over a document corpus | `pgvector/pgvector:pg17`, tables `rag_documents` and `rag_chunks`, filled by the `ingest-pdf` plugin through PostgREST and `/v1/embeddings` |

What is missing is the layer in between: **what this installation has learned, decided and done, in
a form the next session can find.** Not the documents an agent was given — that is the long-term
store — and not the conversation it is having — that is the context. The things a colleague would
remember: that a repository declaration takes three fields, that `grep -v` under `pipefail` ends a
script, that the operator prefers to be asked before a push, that we chose Forgejo over Gitea on the
15th and why.

Today every one of those has to be rediscovered, restated in a handover file, or written into a
skill by hand. `HANDOFF.md` is that gap made visible: a file a human maintains because the machine
cannot.

### 1.1 What it is not

Three exclusions, written down because each is a thing a reader will otherwise assume this feature
covers.

- **Not the document corpus.** PDFs, specifications and pasted references belong in the RAG store
  that exists. If this feature ends up ingesting documents, it has grown into the long-term layer
  and the two will disagree about which answer is current.
- **Not a code map.** *"How does this codebase hang together"* is a different question with a
  different shape, and this repository already has a candidate answer for it in PR #8 (Graphify:
  per-clone knowledge graph, `query`/`path`/`explain`). That stays its own feature. Mixing them
  would make one component responsible for two kinds of staleness.
- **Not a second source of truth for decisions.** A decision recorded in `docs/` is the decision.
  Mid-term memory may *recall* it; it must not become the only place it exists, or the project
  loses the property that a human can read what was decided without asking a machine.

### 1.2 Use cases

- **U1 · The agent recalls what this installation already established.** An agent starting a fresh
  session on a task it has touched before retrieves what was learned then — decisions, conventions,
  dead ends — without the operator repeating it and without reading every document in the repository.
- **U2 · What one harness learns, the other can use.** OpenClaw and OpenCode work in the same
  workspace on the same repositories. A lesson learned in one is available in the other.
- **U3 · The operator can read, correct and delete what the agent remembers.** Including: see why a
  recalled claim was recalled, and remove a memory that is wrong. A memory nobody can audit is a
  rumour with a database behind it.
- **U4 · Memory survives a restart, an image rebuild and a stack reset that keeps `volumes/`.**
  It does not survive `cleanup.sh` any more than the rest of the state does, and that is stated
  rather than hoped for.
- **U5 · An unattended start needs none of it.** The stack starts, and works, with the mid-term
  memory absent, empty or switched off. This is the same promise `.env.example` makes about the git
  section, and the same reason.

Open questions for the operator are in §6.

## 2. What is already in the image

Found on 2026-09-18 by asking the running gateway (`openclaw plugins list`), not by reading
documentation: **OpenClaw 2026.9.1 ships three memory plugins, and two are switched off.**

| Plugin | Status here | What it does |
|---|---|---|
| `memory-core` | **enabled** | OpenClaw's core memory search. This is what `memory.search.*` configures — the subtree the 2026.9.1 migration relocated (`docs/FEATURE-openclaw-2026-9-1.md` §5.2). It has no embedding provider in this installation, because `ENABLE_GITHUB_COPILOT=0`, so it is enabled and idle. |
| `active-memory` | disabled | *"Runs bounded pre-reply memory retrieval and implements per-agent Remember across conversations."* This is mid-term memory, in the runtime we already ship. |
| `memory-wiki` | disabled | *"Persistent wiki compiler and Obsidian-friendly knowledge vault."* |

**So the first milestone is not an integration.** It is to switch on what is there, point it at an
embedding provider we already have, and find out what it does and does not do. Whatever we build
after that is measured against it, and if it suffices we build nothing.

Its known limit: these plugins live in OpenClaw. **OpenCode sees none of them**, so U2 cannot be met
by the zeroth option alone.

### 2.1 Measured 2026-09-19, and it corrects this section twice

Before switching anything on, the installation was read rather than described. Two of the claims
above are wrong, and the second finding is larger than the section it corrects.

**Correction 1 — there is no missing embedding provider.** §2 said `memory-core` is *"enabled and
idle, because `ENABLE_GITHUB_COPILOT=0`"*. The schema of the running version says otherwise:

> `memory.search.provider` — *"Selects the embedding backend used to build/query memory vectors.
> **Defaults to `openai`**"*

and the gateway container has `OPENAI_API_KEY` set. What is absent is not a provider but the
configuration: **`openclaw.json` has no `memory` key at all**, so everything runs on defaults.

The same schema already draws the distinction D1 asks for, as two sources of one index:

> `memory.search.sources` — *"`memory` reads MEMORY.md + memory files, and `sessions` includes
> transcript history."*

with `rememberAcrossConversations` for recall across private conversations, and `extraPaths` to index
further Markdown directories — `docs/` among them, if we want it.

**Correction 2 — the consolidation already runs, and it is empty.** `volumes/_openclaw/workspace/`
holds a `memory/` directory with a `dreaming/` subtree in three phases, `light`, `rem` and `deep`,
carrying one file per phase **for every day since 2026-09-11**, written at 05:00. Today's deep file,
in full:

```
# Deep Sleep
- Ranked 0 candidate(s) for durable promotion.
- Promoted 0 candidate(s) into MEMORY.md.
```

That is the mechanism this document was written to design: gather candidates, rank them, promote the
survivors into a durable store. It is installed, scheduled, has run for nine days — and has produced
nothing. **`MEMORY.md` does not exist**, because nothing was ever promoted. Its input would be
session summaries, and `memory/` holds exactly one, dated 2026-09-05.

**So M-M1 is smaller and sharper than written.** The question is no longer *what can these plugins
do* but *why does a running consolidation find zero candidates every day*. The likeliest answer is
the one this section already names: `active-memory`, the plugin that implements **Remember across
conversations**, is switched off, so nothing produces candidates for the ranking to rank.

**And the shape of it is familiar.** A pipeline that cannot gather looks exactly like a pipeline that
gathered and found nothing: both write *"0 candidates"* and both exit cleanly. This project has met
that three times in its own scripts — `if ! emit`, the unrebuilt image, the negative control that
silenced its own failure — and the lesson it drew there applies here unchanged: **ask what you would
see if this never ran, and if the answer is "the same thing", the output is decoration.** A daily
file saying *0 candidates* is the product's version of that, and nobody read it for nine days.

### 2.2 Measured 2026-09-20, and it answers M-M1 — the hypothesis in §2.1 was wrong

`active-memory` was switched on at 18:45 on 2026-09-19 to find out whether it was the reason. The
next morning's file read exactly as the nine before it:

```
# Deep Sleep
- Ranked 0 candidate(s) for durable promotion.
- Promoted 0 candidate(s) into MEMORY.md.
```

**That reads as "the plugin was not the reason", and taking it that way would have been a third
mistake in as many days**, because nothing had been written into the store overnight either. The
honest state at that point was *inconclusive*, not *negative*. What settled it was asking the tool
instead of the file.

**`openclaw memory promote --json` shows fifteen entries**, and `promote-explain` gives the reason for
each in one line:

```
score=0.789  recalls=0  uniqueQueries=1  ageDays=9.2
thresholds:  minScore=0.75  minRecallCount=3  minUniqueQueries=3  maxAgeDays=30
```

| | |
|---|---|
| **The score already clears its threshold** | 0.789 against 0.75 |
| **What is missing is recall** | Three retrievals are required across three distinct queries; there have been **none**, and one query ever |
| **Where the fifteen came from** | All from one file — `memory/2026-09-05-1630.md`, the single session summary this installation has ever produced — and all written at 05:00 on 2026-09-19, **before** `active-memory` was switched on. `memory-core` had been indexing the whole time |

**So §2.1's hypothesis is refuted.** The consolidation was never blocked by a disabled plugin. It is
blocked by the thing it is supposed to be blocked by: **promotion is earned by use, not by time.** An
entry becomes durable after being recalled repeatedly across separate questions — spaced repetition —
and this installation has asked no questions.

**And it is not a defect.** The system is refusing to turn a single mention into durable knowledge,
which is the same standard this project demands of its own tests. The only thing that was broken here
was the reading of it.

**What it costs to leave it running.** Nothing accumulates. `maxAgeDays=30` runs the other way: these
fifteen entries drop out of the window on 2026-10-19 without ever having been promoted, and a daily
look would show the same zero nineteen more times and then a quieter one. **Days accumulate; recalls
do not.**

### 2.3 What is deferred, and what triggers it

The **mechanism** question is answered and M-M1 is closed on it. The **value** question — whether the
right things survive and come back — cannot be answered without real use, and a synthetic
conversation would measure only what was put into it.

So it is deferred with a condition rather than left on a list:

> **When OpenClaw has been used in earnest for about a week, run `openclaw memory promote --json` and
> read `recalls`, `uniqueQueries` and `score` for the entries that appear.** If promotions happen,
> M-M3 (the bake-off) has a baseline to beat and may not be needed at all. If the thresholds are
> never reached under real use, they are the thing to tune, and they are readable rather than
> guessed: `minRecallCount`, `minUniqueQueries`, `minScore`, `maxAgeDays`.

The one change this installation carries in the meantime is a hand edit: `active-memory` enabled and
a `memory.search` block, neither written by `config/scripts/start/openclaw.sh`. **The next start
removes both**, and since §2.2 shows the plugin was not the blocker, that is a decision rather than a
loss — either put it in the start script for when use begins, or let the start take it back.

## 3. The candidates

### 3.1 ReMe — file-native memory, with a native OpenClaw plugin

`agentscope-ai/ReMe`, Apache-2.0, 3 487 stars, created 2024-08-29, last pushed 2026-09-16. Part of
AgentScope.

Memory is **ordinary Markdown with frontmatter and wikilinks**, in a workspace of four directories:
`session/` (conversation records), `daily/` (lightly processed summaries), `digest/` (consolidated
knowledge: `procedure/`, `wiki/`, `personal/`), `metadata/` (rebuildable indexes and caches).
Retrieval is BM25 by default, with optional embeddings and bounded wikilink traversal, fused by
reciprocal rank. Reached through HTTP (port 2333), MCP, CLI, Python, `SKILL.md` — and a **native
OpenClaw plugin** published in September 2026
(`openclaw plugins install clawhub:@agentscope-ai/reme-openclaw-plugin`), which hooks
`before_prompt_build` for recall and `agent_end` for capture. An LLM is needed only for the
automatic distillation ("Auto Memory", "Auto Dream"); without it, writing and BM25 recall need no
inference at all.

*Why it fits this stack.* The store is text under `volumes/`, so it is browsable, diffable and
reviewable — the property this project keeps choosing, from bind mounts to `.env.example`. It
reaches both harnesses. And its optional embeddings can point at the `/v1/embeddings` endpoint the
gateway already exposes rather than at a second inference path.

*What to watch.* The distillation that makes it useful is exactly the part that needs an LLM, so its
cost is per conversation and lands on whichever provider is configured. And several same-named
repositories exist; the canonical one is the AgentScope org.

### 3.2 MemPalace — verbatim transcripts, no LLM, strongest published recall

`MemPalace/mempalace`, MIT, 59 144 stars, created 2026-04-05, last pushed 2026-09-16.

Stores conversations **verbatim**, nothing summarised, in a hierarchy of wings (people/projects),
rooms (topics), halls (memory types) and drawers (the content), in SQLite/Chroma under
`~/.mempalace/` by default — with pluggable vector backends including **`pgvector`**, which is the
database this stack already runs. Embeddings are computed locally (`all-MiniLM-L6-v2` ~30 MB, or
`embeddinggemma-300m` for multilingual, ~300 MB in the image). **No LLM at write time and none at
read time**; optional reranking improves recall further. Reached through 45 MCP tools, a CLI
(`mempalace mine|search|wake-up`), three installable skills and auto-save hooks. Published results:
LongMemEval R@5 96.6 % raw and 98.4 % hybrid, LoCoMo R@10 88.9 %, ConvoMem 92.9 %, MemBench 80.3 %.

*Why it fits this stack.* No inference cost per memory, and with the `pgvector` backend the mid-term
store lands in the Postgres that already holds the long-term one — one database to back up, one to
reason about.

*What to watch.* Five months old, and popular out of proportion to its operating history. Verbatim
storage of everything an agent says is a larger surface than this stack has ever kept: the pre-push
hook exists because credentials end up in places nobody intended, and a transcript store is such a
place. §5 treats that as a requirement, not a footnote. And an opaque store sits badly with U3 —
searchable is not the same as readable.

### 3.3 Graphify — not a candidate here

PR #8 (`feature/graphify-integration`, opened 2026-08-17, untouched since) vendors the graphify CLI
into both agent images behind `ENABLE_GRAPHIFY`, with a skill and per-clone `graphify-out/`
artefacts. It answers structural questions about a corpus. It is a good thing and a different
feature; recorded here so the next reader does not have to re-derive why it is out of scope.

### 3.4 What else was considered

`mem0` and `zep` are the obvious commercial comparisons and are excluded on the same ground as
always here: this stack is self-hosted, and a memory that leaves the machine contradicts the reason
the machine exists. `cognee` and `letta` are open alternatives worth a second look **only if** both
candidates above fail their cases — named so the decision reads as a choice rather than as the first
two hits.

## 4. Milestones

**M-M1 · Switch on what is already here, and measure it — answered 2026-09-20.** The answer is §2.2,
and it is not the one this milestone was written expecting. The mechanism is alive, correctly
configured and able to explain its own decisions; what it is missing is **use**, and use cannot be
simulated without measuring what was put in. The value question is therefore deferred with a trigger
rather than left open — §2.3.

**M-M2 · Reach OpenCode.** Whatever M-M1 leaves standing, U2 needs the second harness. OpenCode
takes MCP servers through `opencode.json` (`type: local` with a command, or `type: remote` with a
URL) — verified against the live configuration on 2026-09-18, which has no `mcp` block yet, so the
path is open and unused.

**M-M3 · The bake-off, if M-M1 and M-M2 leave a gap.** One candidate, chosen against the cases from
§1.2 rather than against a README: the same tasks, the same questions, both stores, measured. The
loser is recorded with the reason.

**M-M4 · Operator control.** U3: read, correct, delete. A view in the dashboard if the store is
opaque; a directory listing if it is Markdown.

## 5. Requirements

**Functional**

- **FR-M1** An agent can record a memory and retrieve it in a later session, in both harnesses.
- **FR-M2** Every recalled item names its source, so a claim can be traced to what produced it.
- **FR-M3** The operator can read, correct and delete any memory without an agent's help.
- **FR-M4** Memory lives under `volumes/`, like every other piece of state in this stack.
- **FR-M5** The stack starts and runs with the feature off, empty, or its service absent.
- **FR-M6** Nothing is written to a remote. The mid-term store is local, like the rest.
- **FR-M7** There are **two** stores, addressed separately: the craft store and the record. §6 D1.
- **FR-M8** Every memory carries a **scope** — installation, project, or task — and a state of
  active or archived. Archiving never deletes; a memory returns to the working set when its task is
  reopened, or when a task that depends on it is picked up. §6 D2 and D4.
- **FR-M9** Every memory carries its **provenance and validation state**: who wrote it, and whether
  the operator has confirmed it. Retrieval weighs a confirmed memory above an unconfirmed one, and
  the state is visible wherever the memory is shown. §6 D5.
- **FR-M10** Whether an unconfirmed, agent-written memory may be recalled at all is **configurable**.
  Both settings are legitimate: off, the store grows by itself; on, it is validated. §6 D5.

**Non-functional**

- **NFR-M1 · No credential ever enters the store.** A transcript store collects what was said, and
  what was said includes keys, tokens and `.env` lines. This is the same hazard the pre-push hook
  exists for, and it needs its own guard here — a scan at write time, a refusal, or a store that
  never sees raw transcripts. Which, is a milestone decision; **that** it is required, is not.
- **NFR-M2 · Bounded.** Recall runs before a reply, so it has a time and token budget, and exceeding
  it degrades to no memory rather than to a slow agent. The same rule as every other bounded step in
  this stack.
- **NFR-M3 · Inspectable.** A memory that cannot be read by a person cannot be corrected by one, and
  U3 is then unmeetable whatever the interface claims.
- **NFR-M4 · The record store must be redacted at write time, not chosen away.** D1 asks for a store
  of decisions, preferences and who said what — which is the closest thing to a transcript this
  design has, and NFR-M1 forbids exactly what a transcript collects. These do not resolve by picking
  one: the store is wanted, so the credentials have to be removed on the way in. A refusal that drops
  the whole memory because one line looked like a key would lose the decision along with the secret,
  so the guard redacts rather than refuses, and says in the memory that it did.

## 6. What the operator decided, 2026-09-19

The five questions were answered on 2026-09-19. Four are settled; the third turned out to be two
questions, and the half that matters is still open.

### D1 · Two stores, because the two purposes pull apart

**Both are wanted, and they are not one store with two tags.**

| | What it holds | Why |
|---|---|---|
| **The craft store** | What the agent learned about developing in this codebase | So that the handling of code development can be *seen to improve* — the trial this project is, measured over time rather than felt |
| **The record** | Decisions, preferences, who said what | **This is what compaction loses.** A session is summarised, the summary keeps the conclusions and drops who argued what and why, and the next session inherits a decision with no reasoning attached |

The second is the sharper requirement, because the failure it addresses is observable and has
already happened repeatedly in this project: a conclusion survives, its measurement does not, and
nine days later someone acts on a sentence nobody can re-derive — §5.3 of the OpenClaw migration
document is exactly that, and it cost a locked-out browser.

**This changes the candidate question rather than answering it.** §3 was written as ReMe *or*
MemPalace. Two stores with opposite shapes may want both: a distilled, file-native store for craft,
and a verbatim one for the record. That is now a milestone decision, not a foregone one, and it must
be taken with the cost in view — two mechanisms is two things to run, two things to guard, and two
things that can disagree about the same event.

### D2 · Scope cascades, and the working scope is the task

**Craft memories are cross-repository.** A lesson about how to develop here does not stop at a
repository boundary, and on a larger project one store per repository would make the memory useless
exactly where it is most needed.

For everything else the scopes nest, and the working one is **the task**: the thing that has to be
finished. When it is finished its memory is **archived** — not deleted — and comes back when that
task is reopened, or when a task that depends on it is picked up.

```
installation  ──  project  ──  task   (active)
                                 └──  archived, indexed, recallable
```

**What has to be built rather than assumed**, and it is the whole difficulty of this decision: what
"a task" is, who declares it finished, and how a *dependency* between tasks is known. None of the
three is free, and a cascade whose levels nobody maintains degrades to one shared workspace with
extra machinery. That is the first thing the milestone has to answer.

### D3 · The question behind question three, restated

The operator asked whether *"may conversations be stored verbatim?"* points at *"are humans supposed
to be able to read it?"*.

**No — and the second is already settled.** Human readability is **NFR-M3**, required since this
document was written: a memory a person cannot read is one they cannot correct. Nothing about
verbatim storage follows from it in either direction, and the two often run opposite — a verbatim
store can be an opaque vector index, while a distilled store can be plain Markdown files a person
edits in an editor.

**What question three actually asks is what lands on disk.** A conversation held in this stack
contains `.env` lines, tokens and keys — this session printed an OpenAI key into a transcript on
2026-09-18, which is not hypothetical. Storing conversations verbatim means storing those too.

**Still open, therefore:** not *whether* the record store is wanted — D1 settles that — but the
mechanism that keeps NFR-M1 true while it exists. Recorded as **NFR-M4**: redact on the way in, and
say in the memory that redaction happened.

### D4 · Mid-term is between sessions at the shortest, a task at the longest

Never eternity. Beyond that, it is the database and the RAG store, which already exist.

Between the two ends, memories are **archived with an index** so they can be pulled back into the
working set when needed. Archiving is the mechanism D2 needs, and it is the same mechanism: a task
ends, its memories leave the working set without leaving the system.

### D5 · Both may write, and validation is a weight rather than a gate

Agent and operator both write. Whether an agent-written memory needs the operator's confirmation
**before it can be recalled as fact is configurable**, because both settings have merit: without it
the memory grows by itself, with it the memory is validated.

**The middle ground is the design, not a compromise.** A memory carries its validation state. An
operator-confirmed memory is *stored as validated* and weighs more at retrieval; an unconfirmed one
is still there and still findable, and when one turns up the operator can ask for it to be validated
before it is used. FR-M9 and FR-M10.

This is also the answer to a hazard §1.1 raises: a memory that is wrong is worse than no memory,
because it is recalled with the same confidence as a right one. A visible validation state is what
makes the difference legible instead of leaving it to whoever wrote it.

### What is still open

1. **NFR-M4's mechanism** — what redacts, where, and what the memory says about it.
2. **What a task is**, who ends it, and how a dependency between tasks becomes known. D2 rests on it.
3. **One store or two mechanisms**, now that D1 has made "ReMe or MemPalace" the wrong shape of
   question. The first milestone of §4 — switch on what the image already ships and measure — is
   unchanged by all of this and is still where to start.

---

*Sources for §3, read 2026-09-18:* [ReMe](https://github.com/agentscope-ai/ReMe),
[ReMe for OpenClaw](https://reme.agentscope.io/en/integrations/openclaw),
[MemPalace](https://github.com/MemPalace/mempalace),
[OpenCode MCP servers](https://opencode.ai/docs/mcp-servers/). Plugin states and the OpenCode
configuration were read from the running stack, not from documentation.
