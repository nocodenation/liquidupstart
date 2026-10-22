# Backlog

Small things worth doing that are deliberately not being done now, so that deferring them stays a
decision rather than an omission. Each entry says what, where, and why it was left.

Until 2026-09-14 each feature branch carried its own file and none repeated another. #11 merged into
`main` on that day, so the entries the OpenClaw 2026.9.1 migration deferred arrived here with it and
are kept under their own heading below rather than mixed in.

## Open findings

**The mutation runner's bound does not reach a process the spec itself started.** `tests/mutate.sh`
spawns the spec with `exec` inside its subshell, so the run budget and the TERM handler reach `bun`
itself — which is finding 2 of the third re-review, and `MU-48` to `MU-51` hold it. What they do not
reach is a **grandchild**: a spec that starts a process of its own, say a container or a server,
leaves it running when the budget fires, and if that process holds the `--reporter-outfile` it can
write the record after the handler has removed it. That is the shape finding 2 was about, one level
further down.

The repair is to put the spec in its own process group — `setsid` or `set -m`, then signal `-$pid` —
which is what `dashboard/src/lib/server/pairing.ts` does for the same reason (A2 of #15's
2026-10-01 review, where an orphaned `docker run` held the pipes). It is deferred because no entry in
either registry starts such a process today, so the exposure is reachable only by a case nobody has
written, and because signalling a group from a script that is itself run under a test runner needs its
own measurement — the runner must not take its own parent down.

**Recorded 2026-10-14, after N3 of the fourth re-review found that two places pointed here and
nothing was here.** `tests/mutate.sh:370` and `tests/integration/m-mu.runner.test.ts` both said it was
in this file. `PROCEDURE-mutation-control.md`, corrected in that same round, says that *"a pointer to
a file the reader cannot open is worse than no pointer"* — which is exactly what those two were.

---

**The read limits bound the cost of judging a bundle; they do not make it small.** N6 of the
2026-10-14 re-review closed the way past them — `zf.read` inflated a member whole before truncating
it to a declared size, so an entry that *claimed* 1000 bytes cost 1610 MB from an 815,695-byte file,
and the read is now bounded by what the directory declares. What remains is the honest case: a bundle
may still cost up to 256 MiB of bundled jar **plus** up to 512 MiB of held class bytes. The reviewer
measured **764 MB from a 1.7 KB `.nar` carrying two 250 MB "classes"**, and the check runs inside the
Liquid container against an inbox the agents can write.

The fix is to stream the class parse instead of holding each class's bytes — `class_references`
already walks the constant pool linearly, so it does not need the whole array in memory, and
`MAX_CLASS_BYTES` would then bound nothing that matters. It is deferred because it changes the one
function every refusal depends on, and the limits make the exposure bounded rather than open.

**This entry exists because the reply to the 2026-10-13 review said it already did.** It claimed four
items were deferred here; S3 and S9 were, this one and the next were not. N8 of the 2026-10-14
re-review found that by looking, which is the only way a claim like that gets checked. Recorded
2026-10-14 with the measurement, as M7/N3/N6's residual.

---

**#10's controls are run by hand and are not in the mutation registry.** Every case on that branch
earns its green by reverting the code it guards and watching it redden — written up per case in
`docs/TEST-SPEC-liquid-java-extensions.md` — but the reverts are performed by a person, recorded in
prose, and nothing re-runs them. #18 builds the runner and lands it with an **empty** registry, which
is where those mutations belong: one entry per guarded behaviour, so a control that stops reddening
is a red suite rather than a paragraph nobody re-reads.

Deferred until #18 is merged, because registering mutations against a tool that is still under review
would have to be rewritten when its format settles. **Also recorded late**, for the same reason as the
entry above: the reply of 2026-10-13 said it was already here.

---

**~~After a build, the host user cannot delete `volumes/nar_builder/m2` on rootless Docker — and
`cleanup.sh` has no leg for it.~~** N7(2) of the 2026-10-14 re-review, measured by the reviewer: the
host directory ends up owned by `101499` with every Maven-written subdirectory `101499:100998`, so
`rm -rf volumes/nar_builder/m2` as the host user fails with `Permission denied` and the tree has to
be removed from a container. That contradicts CLAUDE.md's *"a reset is just deleting `volumes/`"*. It
is a consequence of B1's build user and only becomes reachable with C2's `chown`, because before it
the build user could write nothing there.

**~~Recorded against #25 rather than fixed here, by decision.~~ #25 merged on 2026-10-16, so both
entries above describe a mount that no longer exists** — `grep volumes/nar_builder/m2 compose.yml`
on `main` finds nothing. Kept struck through rather than deleted, because the reasoning is the
record of a decision that held: #25 removed `/m2` altogether — each
build resolves into its own repository under its own work directory, discarded with the build — so
there is no shared cache for the host to be locked out of. Adding a containerised `rm -rf` to
`cleanup.sh`, which is a destructive script, for a directory the next branch deletes would be code
with a short life. **What holds in between**, if #10 merges before #25: an operator who wants that
cache gone removes it from a container, e.g.
`docker run --rm -v "$PWD/volumes/nar_builder:/v" alpine rm -rf /v/m2`. Not reproducible on this
machine — it is Docker Desktop, where bind mounts ignore ownership — so it stands on the reviewer's
rootless Linux measurement and on `cleanup.sh` having no such leg, which is readable here.

---

**~~`tests/lib/builderimage.ts` leaks its per-run image on normal exits, not only on killed runs.~~**
*Fixed 2026-10-14 as `B6-39`, the same day it was recorded. Kept because the measurement is the
interesting part and because the first explanation of it, in the reply to the 2026-10-13 review, was
wrong.*

Observed by the reviewer out of scope — two runs, two leftovers, bun 1.4.2 — and read by us as a
killed-run problem, since the cleanup sits on `process.on('exit')`. **It is not.** Measured: a single
passing file leaves its image behind, because that handler does not run in bun 1.4.2 at all. 21
images at about 1 GB each had accumulated by the end of the day, **9 of them from one default-tier
round**. Earlier the same day the Docker VM had filled to 100% at 57 of 59 GB, and a build failing
with `No space left on device` is indistinguishable from a product failure in that output — which is
what produced a false "harness artifact" reading in a review round.

The repair is not to delete more reliably: an `afterAll` was already measured wrong, because every
file captures the tag at module load and the first file's `afterAll` pulls the image out from under
the rest (8 fail across three files). It is to **mint fewer** — the tag is now a hash of the build
context, so two runs over one tree share an image, and a bounded sweep takes superseded ones but
never the image in use, never one built in the last two hours, and never a tag outside the two
schemes this file has used. Three separate processes now share one image, measured.
---

**Answered in part 2026-10-20 by #28, and the two halves it does not cover are stated below rather
than closed.** `TR-4` is built for the third of the three checks sketched here — *across test files,
no id on two different titles* — and that is the one this entry called the one that mattered. It was
written against #27's parent, where the `A8-24`/`A8-25`/`A8-26` collision still existed, so it has
been seen to fail against a real one: it reports those three ids there and is green on the repair.
Its detail block is `TR-4` in [`docs/TEST-SPEC-case-id-traceability.md`](docs/TEST-SPEC-case-id-traceability.md),
and the shape is **two routes rather than one**: an id carried by several test files is accepted when
its own detail block's *Implemented by* names every one of them, which is the computed answer the
house rule asks for, and otherwise only through a reviewed entry naming that exact file set. Of 15
such ids on the tree of 2026-10-20, the computed route takes 4 and the list carries 11, and an entry
whose block has come to claim its files is reported as redundant — so entries leave as blocks catch up.
*(It said "the list can only shrink"; nothing stops an entry being added. Corrected 2026-10-21.)*

**The other two checks are still open, with what they would find today measured** in that document's
*No id is carried by two test files unless that is on record* section: the per-document duplicate
check is **not buildable as stated**, because one row per scenario means 50 of 459 id/document pairs
legitimately carry several rows; the cross-document check **finds exactly one id, `SP-2`**, which is
by design and would need an exemption on its first run. A third class neither check reaches is
`A16-20`: one file, one id, and a specification row that is not its case.

*The original entry follows, as written on 2026-10-12; its "Not built here" is that day's.*

~~**Nothing checks that a case id is used once.** `TR-1` compares the ids in test titles against the
ids in `TEST-SPEC-*.md` rows, in both directions, and has nothing to say about two different cases
sharing one id.~~

That is not hypothetical. `OC-40` and `OC-42` were specified on #15 on 2026-09-19 — two signed detail
blocks, a traceability row, test headers and a comment in `config/scripts/start/openclaw.sh` — and the
same two numbers were assigned again on `main` on 2026-10-09 while back-filling rows for tests that
had none. Four cases, two ids. **`OC-40` collided between two automated tests**,
`m-oc.identity-scopes` on #15 and `m-oc.bound-arguments` on `main`, and both branches' suites were
green throughout: each tree held only one of the two. It surfaced on 2026-10-12 when #15 was merged
with `main`, as a conflict in the specification rather than as a failing test. `main`'s pair was
renumbered to `OC-63` and `OC-64` because it was the later and much cheaper half to move.

**What a check would be.** Per specification file, no id in a first table cell twice; across files, no
id declared in two documents; and across test files, no id on two different titles. The third is the
one that matters and it is the one `TR-1` is already positioned to do — it builds `Map<id, files[]>`
and then throws the file list away.

Not built here because it belongs with `TR-1` and would arrive with its own controls and rows, and
because the collision it exists against is being repaired in the same breath — building the check and
the repair together would leave the check never having been seen to fail against a real collision.
**The repair should go first and the check second, against this commit's parent**, where a real
collision still exists to catch.

Recorded 2026-10-12.
**The embedding credential gate speaks for two providers out of six.** `openclaw.sh` can say whether
an embedding backend has a credential for `openai` (is `OPENAI_API_KEY` set) and for `github-copilot`
(is the harness on). The schema also allows `ollama`, `local`, `gemini` and `lmstudio`, and for those
the start deliberately writes nothing and leaves `memory.search.enabled` as the operator set it —
blocker 3 of the 2026-09-28 review on #16, where writing it unconditionally had been switching their
memory off on every start.

**That is correct and it is not complete.** On those four the stack cannot tell the operator whether
memory search will do anything, because nothing checks the backend is reachable. The operator decided
on 2026-10-13 to fix the boundary first and document it, and to extend later.

**What extending needs, and why it is not one change.** "Has a credential" is an API key for `openai`
and a live harness for Copilot; for `ollama` or `lmstudio` it is a reachable endpoint, for `local` a
model on disk, for `gemini` another key. So it is **one measurement per provider** rather than one
condition, and the shape that fits is the one `registryReachable()` uses on #24: ask, cheaply, once,
and cache the answer. The log line should then name what it asked and what answered, because a gate
that silently decides is what blocker 3 was.

Not built with the repair because the repair is the operator's setting being left alone, which needs
no knowledge of any backend, and because each provider's check wants a live instance to be measured
against rather than reasoned about.

Recorded 2026-10-13.

---
**~~OC-15 and OC-16 depend on what else the machine is doing.~~** *Answered 2026-10-10, and it took
two repairs rather than one. The operator chose "a precondition of its own", and measurement showed a
precondition could not reach the thing that failed: the registry was reachable in both failing runs
and the machine was busy. `SP-3` asks whether a registry answers and skips them on an offline machine;
their own **180-second** budget answers the load, against a quiet build measured at **14 seconds** on
one machine and **45** on another. The 60 they had failed twice under load on the first and held,
unloaded, on the second. The cost is stated at the test: a genuinely broken build now takes three
minutes to say so. The original entry follows. (Corrected 2026-10-21: this gave 14 seconds alone and
"four times".)*

**OC-15 and OC-16 depend on what else the machine is doing.** Both build an image inside a 60-second
budget. They failed in two measurements -- `Received: 130` and `this test timed out after 60000ms` --
and **passed in two later runs taken on a quiet machine**, so the budget is not simply too small.
*Corrected 2026-10-09: this entry first said "on this machine it is not enough", which was a
conclusion from the two failures alone.* A case whose colour depends on the load is the worse of the
two findings, because it is what makes red stop meaning anything. Not a regression either way, and
not a missing precondition: docker is there and the build starts.

Two ways out, and the choice is the operator's. Raise the budget for these two, which makes a slow
network a slow suite rather than a red one. Or give them a precondition of their own -- a reachable
registry -- and skip them where it is absent, which is what `SP-1` would extend to. Measured
2026-10-09 on bun 1.3.13, macOS; `docs/TEST-SPEC-suite-preconditions.md` records it as the fourth
precondition it deliberately does not cover. Recorded 2026-10-09.

---

**Two different cases are both called A16-19, and eight A16 ids are in no specification.**
`tests/component/m-a16.skip-panel.test.ts` has `describe('A16-19 skip-all says it too, with the
space')` and `tests/contract/m-a16.text-only.test.ts` has `test('A16-19 git tracks test files, so
there is something to judge')`. They are unrelated. `--gaps` reads ids out of specifications, so a
registry entry naming A16-19 would be ambiguous in exactly the way #18's own finding 1 describes --
and `mutate.sh` refuses a `mustFail` that resolves to more than one test, so the collision would
surface as a refusal rather than a wrong answer. That is the good case; the bad one is a reader.

Found alongside: the A16 tests run to **A16-29** while `docs/TEST-SPEC-git-integration.md` documents
only to **A16-20**, so eight ids have no row and `--gaps` cannot see them. Both were reported during
the 2026-10-01 round and not fixed, because renumbering a signed-off id is a decision and this
branch's subject is the suite's preconditions. Recorded 2026-10-09.

---

**~~Two unrelated cases are both called A16-19, and renumbering a signed-off id is not mine to do.~~**
*Resolved 2026-10-10 on the operator's word, and the entry below got one thing wrong that is worth
keeping visible.*

It said `text-only`'s two A16-19 tests were half of the collision. They are not: that file carries
two tests under one id **legitimately** — "git tracks test files, so there is something to judge" is
the premise "no test file is binary to git" needs, the same shape as `TR-2`. The signed-off row
describes the second of those, not the first, which this entry also had backwards.

The real collision was `tests/component/m-a16.skip-panel.test.ts`, unrelated to either. **It moved,
to `A16-30`**, because there was nothing on that side to move in an approved document — and its own
header had never listed the id at all, which is the drift `TR-1` exists for and is how this was found.
Asked whether the choice of side mattered, the answer was almost no: one had a signed-off row and the
other had none. The original entry follows.

**Two unrelated cases are both called A16-19, and renumbering a signed-off id is not mine to do.**
`tests/component/m-a16.skip-panel.test.ts` has `describe('A16-19 skip-all says it too, with the
space')`; `tests/contract/m-a16.text-only.test.ts` has `test('A16-19 git tracks test files, so there
is something to judge')`. They share nothing but the number.

`TR-1` does not catch it, by construction: both resolve to a declared row, which is all that case
asserts. What does catch it is `mutate.sh`, which refuses a `mustFail` resolving to more than one
test -- so a registry entry naming A16-19 surfaces as a refusal rather than a wrong answer. That is
the good failure mode, and it is why this is recorded rather than urgent.

The row in `docs/TEST-SPEC-git-integration.md` describes the `text-only` one. Whichever is renumbered,
its id moves in a signed-off specification and in a test title at once, which is an operator decision.
Recorded 2026-10-09, alongside the thirteen ids that *were* documented.

---

**The builder's own port trusts any container on the stack network.** S3 of the 2026-10-01 review
has two halves, and only one is closed. The nginx vhost no longer admits the LAN — the gateway is
denied before the subnet is allowed, and B6-21 to B6-23 measure it — but the reviewer's second
half stands untouched: *"every container on the compose network can POST to
`http://nar_builder:8770/build` with the header directly, past the vhost."* `X-Liquid-Agent: 1` is a
marker, not authentication, and `BuildServer` has nothing else to check.

The reviewer's own suggestion is the right shape: a shared secret mounted only into the agent
containers and checked by the server. It is deferred rather than declined, and the reason is
sequencing: with B1's privilege drop in place, what a caller past the vhost can now reach is a build
that runs as an unprivileged user over a read-only `/repos`, which is a different exposure from the
one S3 was written against. Closing it needs a secret in `.env.example`, a mount in three agent
services, a check in `BuildServer.java` and a case on both sides — more than a line, and it changes
the contract every caller uses.

Until then the honest statement is the one above: on this stack, any container can trigger a build.
Recorded 2026-10-08, after the decision had been sitting only in the body of commit `03f5620`.

---

**~~The runtime values still go into the synthesised pom unvalidated.~~** *Answered 2026-10-09 by
moving the directory, not by validating the values. Kept because how the answer was reached is the
point: two proposed fixes were measured and both were wrong before the third worked.*

**The measurement that settled it.** With `volumes/liquid/api` a shared volume, a sentinel written on
the host — `nifi_version=0.0.0-SENTINEL` — is invisible to the builder, which goes on reading
`2.11.0`, and `nar-build target` still resolves `nifi_api_version 2.10.0` through
`read_from liquid at liquid:8833 (runtime)`. Before the move that sentinel **was** the attack this
entry describes: the builder would have compiled against NiFi 0.0.0. The directory is `nifi:nifi 755`
in both images now, and the builder's mount answers `Read-only file system` to a `touch`. B6-33 and
B6-34; CLAUDE.md's rule distinguishes state from a generated index rather than carrying an exception.

The two that did not work, measured rather than argued: a **version pattern** narrows what can be
written to something that still parses and stops nothing, since a host-side writer picks a valid
version as easily as an invalid one; and the **mode** could not be narrowed while the directory was a
bind, because under rootless Docker the host user maps to container root while Liquid runs as nifi —
`chmod 755` there would simply have stopped Liquid starting. Asking Liquid for its version instead
needs credentials the builder deliberately does not hold: `/nifi-api/flow/about` and
`/nifi-api/system-diagnostics` both answer 401.

*The original entry follows.*

**The runtime values still go into the synthesised pom unvalidated.** M2 of the 2026-10-01 review
asked for two things: validate the NiFi and Java versions against a version pattern before they
reach the pom, and stop the log fallback trusting any line matching `Starting NiFi X using Java Y`.
Neither is done. What was applied is one line: the `UNRESOLVED` refusal now names which record the
version came from, so an operator can tell the authoritative `/liquid/api/runtime` from the
expiring log line when the version is the thing in doubt.

**Why the rest was not applied as proposed.** A pattern check guards against Liquid lying to the
builder. The reviewer's own note names the real exposure differently —
`config/scripts/start/liquid.sh` makes that directory `chmod 777`, so **anything on the host** can
write the record — and a pattern narrows what can be written to something that still parses while
stopping nothing, because a host-side writer can choose a valid version as easily as an invalid one.

**And the mode is not the fix either, measured 2026-10-09.** NiFi runs as uid 1000 inside the
container, and under rootless Docker — the arrangement CLAUDE.md documents — the host user maps to
container root, so a 755 directory owned by the operator appears root-owned inside and uid 1000
cannot write it. That is why `$STATE_DIR`, `api/` and the drop directory are all 777. The exposure is
structural to *state in a browsable host directory, written by a container process under a different
uid*, and narrowing this one line would only stop Liquid starting.

**The obvious alternative does not exist.** The builder already talks to Liquid over HTTPS, so it
could ask for the version rather than read a file. Measured: `/nifi-api/flow/about` and
`/nifi-api/system-diagnostics` both answer **401**, and the builder deliberately holds no credentials
(FR25).

**What contains it today, and only partly.** A bundle compiled against the wrong API is judged at
deployment against the classes the running Liquid loads (FR36, B6-29). A version that is too **high**
produces references the index does not have and is refused; one that is too **low** resolves and
deploys, compiled against an older API than the instance runs. *Read out of `narcheck.py:396`, where
a reference whose package is not in the judged set is skipped — reasoned from the code, not run.*

**~~So the decision left is one the operator has to take, and it is not about the pom.~~ Taken, and
merged.** `480455b`, *"M2 answered by moving the index out of the host’s reach, not by validating
it"*, went in with #25 on 2026-10-16: `compose.yml` declares `liquid_api` as a volume shared between
`liquid` and `nar_builder`, `volumes/liquid/api` is no longer a host bind, and `CLAUDE.md` carries
the narrowed rule — *"all **state** lives in browsable `./volumes/` bind mounts; never use named
Docker volumes **for it**"* — which is the argument the paragraph below records as the one for it.
The host write path this entry is about is closed. What it said, and what was decided: carry
`volumes/liquid/api` as a volume shared between `liquid` and `nar_builder` instead of a host bind,
the way `nar_extensions` already is — which closes the host's write path completely and contradicts
CLAUDE.md's *"all state lives in browsable ./volumes/ bind mounts; never use named Docker volumes"*.
The index is generated and arguably not state worth browsing, which is the argument for; the rule is
the argument against. Either way, `liquid.sh` now says at the line what it costs rather than leaving
a reader to infer it.

Recorded 2026-10-08, measured and rewritten 2026-10-09.

---

**S9's machine dependencies: the moving tag is answered, and B5-15 and B5-16 still reach Maven Central.** The builder image is no longer taken from whatever
`liquidupstart/nar-builder:latest` happens to be on the host: `tests/lib/builderimage.ts` builds it
from the tree under test and tags it per run, eight files use it, and the specification records the
change. What is still true of the default-tier M-B5 cases is the rest of the reviewer's sentence:
they pin `ghcr.io/nocodenation/liquid-nifi:latest`, which is a moving tag, and `nifi-kafka-nar-2.11.0.nar`,
`nifi-api-2.10.0.jar` and a 2.11.0 `START_LINE` with it, so an image upgrade turns them red — and
B5-15 and B5-16 reach Maven Central. Pinning the image by digest is the obvious half of the repair
and would need re-pinning on every upgrade, which is the trade the operator should make rather than
a branch under review. Recorded 2026-10-08.

**The operator made it on 2026-10-16, and chose neither half of that sentence.** A digest stops the
surprise and buys a different cost: until a hand re-pins, the suite tests an image the stack no
longer runs. Keeping the tag and letting the red arrive was the other option, and it is the shape
three separate hours went into today — an environment reading as a product defect. So: **the tag
stays moving, and an upgrade is made legible.** `tests/lib/liquidimage.ts` reads the versions out of
the image, the nine files name the tag through one constant instead of nine copies, `tests/run.sh`
says before every run which state the image is in, and the cases that pin the image **skip** rather
than fail. `B5-33`.

**Reviewed 2026-10-20, and the first shape did not survive a real move.** It had been simulated by
moving `WRITTEN_AGAINST` with the image unchanged, so every bundle the cases name was still there.
Against an image with those bundles renamed — `B5-34`, which runs the nine files in a child process
against one — `m-b5.hand-drop`'s file-level `beforeAll` still ran, found no bundle to rewrite and threw
`ENOENT`: 0 pass / 1 fail, the red this exists to remove. The skips were also too wide: thirteen cases
that pin nothing of the image, among them B5-4 over every shipped bundle and B6-26's contract check,
skipped on any move, so a release that broke them would have shipped green. And the detector read no
Java, which B5-18's startup line pins; the runner printed the pinned pair as a match with the daemon
down; and nothing tied `WRITTEN_AGAINST` to the literals. All repaired on the branch, each with a case
that reddens when the repair is taken back; `B5-34` is 5 pass / 0 fail against the moved image.

**Reviewed again 2026-10-21, and the skip was one flag for three readings.** A Java patch under an
unchanged NiFi skipped every pinned case: measured by the reviewer, fifteen cases skipped against an
image they pass on. Each case now skips on the reading it pins, and `B5-34` also runs a Java-only
move. **And the scope stops at the image.** The stack-tier M-B4 cases `B4-4`, `B4-6` and
`m-b4.placement-check` pin the API pair through the live installation rather than the tag, and are
neither scanned nor skipped; they redden on an API release after a rebuild.

What is deliberately *not* asserted is that the image agrees with the pinned pair: that agreement is
the question, and asserting it would make an upstream release red — the defect being removed. And
`B5-15` and `B5-16` still reach Maven Central, which this does not touch: that half of S9 is open.

---

**~~Four milestone-A cases read the live installation without saying so, and are red in any bare
checkout.~~** *Answered by #22, merged into `main` on 2026-10-10 and present on this branch since the
merge of 2026-10-12.* The repair is `tests/lib/preconditions.ts`: three values a case asks for —
`STARTED`, `IN_GIT_REPO`, `DASHBOARD_DEPS` — computed from current state rather than a rule somebody
remembers, with the eight dependent files guarded and each skip given a voice. The entry is kept
because the reasoning below is what produced that shape, and because **its last paragraph did not
travel with it**: see the note there.

The entry as it stood:

**Four milestone-A cases read the live installation without saying so, and are red in any bare
checkout.** `tests/lib/paths.ts:5` computes `repoRoot` from the test file's own location, so in a
worktree it is the worktree. The state these four assert is created only by
`config/scripts/start/git.sh` — `volumes/_git-secrets` at lines 60-61, the shared `pre-push` hook at
83, `known_hosts` at 141, `volumes/repos` mode 777 at 58-59 — and that script never ran there:

- `tests/contract/m-a3.known-hosts.test.ts:32` and `:49` — A3-3, both halves.
- `tests/contract/m-a4.clones-governed.test.ts:37` — A4-16.
- `tests/integration/m-a1.workspace-dir.test.ts:65` — A1-4, on the mode.

Measured 2026-10-07 while the whole default tier was run from the #10 worktree: 4 red there, and all
four green in `/Users/christof/repos/liquidupstart`, where a start has run (`volumes/repos` 777,
`volumes/_git-secrets` 700, `hooks/pre-push` 755). So the product is right and the cases carry an
unstated precondition — they pass or fail on which directory the suite was started from, which is
the one thing their headers do not mention.

The repair is a computed precondition rather than a remembered rule, in the spirit of CLAUDE.md:
`export const INSTALLED = existsSync(join(repoRoot, 'volumes', '_git-secrets'));` in
`tests/lib/gitfixture.ts` — `git.sh:60` is the only thing that creates that directory, so its
presence *is* the question "installation or bare checkout" — and `test.skipIf(!INSTALLED)` on the
four. It also needs the three test headers to state the precondition, and the three signed-off
detail blocks in `docs/TEST-SPEC-git-integration.md` (A1-4 at :359, A3-3 at :628, A4-16 at :1656) to
record the skip as a decision rather than leave it silent.

**And the installation is not the answer either, which is what makes this worth an entry.** Moving
the run there satisfies those four and breaks ten others, because a release install has no `.git`
and no `dashboard/node_modules`. Measured the same day, `tests/run.sh --system` from
`~/.liquidupstart`: **919 pass / 10 fail / 1 error**, every failure milestone-A and none from the
Java/NAR work.

- No `.git`: `tests/component/m-a6.operator-repository.test.ts:30` wants
  `git rev-parse --is-inside-work-tree` to say `true` and gets `""`;
  `tests/contract/m-a16.text-only.test.ts:45` wants more than 50 tracked test files and counts 0;
  `tests/contract/m-a5.nested-clone.test.ts` A5-8, all three halves, asks `git check-ignore` and
  `git status` about `volumes/`; and A16-16, A16-17 and A16-24 read a card against clone state.
- No `dashboard/node_modules`: `tests/lib/mount.ts` cannot resolve
  `@happy-dom/global-registrator`, which takes A16-18 down as an error rather than a failure.

So **neither location satisfies the whole suite**: a worktree has git and no started state, an
installation has the started state and no git. The two halves need two computed preconditions, not
one — `INSTALLED` as above, and a `TRACKED` (or the same question asked of `git rev-parse`) for the
cases that read the repository. Each is one value read at the moment it is needed, which is the
form CLAUDE.md argues for; the present arrangement is an assumption about the reader's working
directory, which is the form it argues against.

**Why it is deferred rather than done:** these are milestone-A files, on `main` since #9. Fixing
them inside #10 would put unrelated git-integration changes into a pull request under review for the
Java/NAR work. It belongs in its own branch off `main`, the way the `git.sh` manifest write became
#21.

Found while answering D2 and M6 of the 2026-10-01 review. Recorded 2026-10-07.

---

**A fifth file writes into the operator's `volumes/repos` from the default tier. Still open, and
`main` no longer records it.** `tests/contract/m-a5.nested-clone.test.ts` builds `reposDir` from
`repoRoot` and writes a git repository into it — `git init -q -b main <reposDir>/.a5-nested-probe`,
read out of the file on 2026-10-12. It is green, because it creates everything it asserts against, so
it was never in the failure set above — but a default-tier run leaves state in whichever checkout it
was started from, which `tests/run.sh:18-23` says is the stack levels' privilege and not the default
tier's.

**#22 does not close it, and it is worth saying why rather than assuming the merge did.** That branch
*did* change this file — it gave it `IN_GIT_REPO` — but a precondition decides whether a case **runs**,
not whether it **writes**. The `git init` is unchanged. And when #22 rewrote `BACKLOG.md` this
paragraph went with the rest of the entry, so on `main` the concern is recorded nowhere: checked
2026-10-12, `grep -c "fifth file writes into the operator"` against `origin/main:BACKLOG.md` is **0**.
It survives here, which is the only copy that still has it. Recorded 2026-10-07, confirmed open
2026-10-12.

---

**~~The shared Maven cache stays writable by build-time code.~~** *Closed 2026-10-11 on
`feature/builder-seeded-cache`: there is no shared cache. Each build resolves into its own local
repository, copied from a seed the image build owns, and discarded with the build. FR26 is rewritten,
FR37 to FR40 are new, M-B7 carries the cases and B1-9 is rewritten because its premise was the mount.
**It is faster than what it replaces, which neither of the priced options predicted** — 7 s and 0
downloads against 67 s and 665 downloads on a first build, and against 9 s warm. The two readings
that inverted the plan are in the test specification: a `file://` seed loses 28.5 MB to
`_remote.repositories` re-verification, and an unpinned lifecycle loses 6.9 MB to metadata. What stays
open is a project with its own `pom.xml`, which cannot be given the pins — the security property holds
for it, the speed is unmeasured.*

The entry as it stood, because the priced options are what the measurement contradicted:

**The shared Maven cache stays writable by build-time code.** `compose.yml` mounts
`./volumes/nar_builder/m2:/m2` read-write, and Maven runs there as the unprivileged `builder` user,
which can write it. So a pom, a plugin or a dependency can plant an artifact that **every later
build** resolves from — persistence that survives until somebody clears the directory.

This is the last of B1's **four** legs, 2026-10-01 review — the entry said three on 2026-10-04 and was
wrong, because the drop directory had been recorded as closed when it was not. The other three are
closed: `/repos` is read-only, `/opt/builder` is unreachable to the build user, and the drop directory
is mounted under a root-only parent since 2026-10-05 (B6-1 to B6-4). The operator decided on
2026-10-04 to take those two and price this one separately, because closing it costs build capability
rather than configuration:

- **A per-build cache** — a fresh `-Dmaven.repo.local` per build, or an overlay over a seeded one.
  Every build then re-downloads its dependencies, so a build goes from seconds to minutes and needs
  the network every time. An overlay (`lowerdir` the seeded cache, `upperdir` per build) keeps the
  speed and needs a privileged mount or fuse-overlayfs in the builder, which is more capability than
  the thing it protects against.
- **A read-only pre-seeded cache** — no runtime cost, and it refuses any dependency nobody seeded,
  which for an operator writing their own processors is likely unusable.
- **A read-only seed as a `file://` remote, with a per-build local repository** — added 2026-10-09,
  **and the figures published that day were wrong. Corrected 2026-10-10, below.** The seed is
  declared as a repository and a pluginRepository; each build gets its own `-Dmaven.repo.local`.

  **What was published on 2026-10-09, and what it actually measured.** The entry said
  `exit=0, 3 seconds, 47 jars copied, seed untouched`, against the installation's 84 MB / 256-jar
  cache with `--network none`. Re-run on 2026-10-10 against the skeleton `build.sh` itself generates,
  that arrangement **fails**:

  ```
  [ERROR] Error resolving version for plugin 'org.apache.maven.plugins:maven-resources-plugin'
          from the repositories [local, liquid-seed (file:///seed), central]:
          Plugin not found in any plugin repository
  ```

  and it fails the same way against the accumulated 256-jar cache and against a purpose-built seed.
  So the 2026-10-09 run was measuring a different build from the one `nar-build` performs — the
  number was real and the thing it was taken on was not the subject. **A measurement is only as good
  as the subject it was run against, and that is the half this got wrong.**

  **The mechanism, which is the useful part.** A local repository is not a remote repository. Maven
  writes the repository-qualified `maven-metadata-central.xml` into a local repository and never the
  unqualified `maven-metadata.xml` that a `file://` remote is looked up for — measured on the
  installation's cache: **5 files matching `maven-metadata*.xml`, 0 named `maven-metadata.xml`.**
  Artifact resolution does not need that file and **plugin *version* resolution does**, so a seed can
  serve a version that is pinned and cannot serve one that has to be resolved. Maven resolves a
  version for **every plugin the lifecycle binds**, including goals the build never executes: with
  `resources`, `compiler`, `jar` and `surefire` pinned it still refused on `maven-install-plugin`,
  whose goal `package` does not reach.

  **With the whole default lifecycle pinned, it works.** Measured 2026-10-10, seed built by a
  dedicated step in the image build — the arrangement the operator chose on 2026-10-09 — using the
  same pins the later build uses, so the seed is by construction that build's closure:

  ```
  the seeding step, in the image build       24.1 s   178 jars   57,406,710 B   67.7 MB layer
  a build against it, --network none         exit=0    3 s   73 jars copied into the per-build repo
    compiled 1 source file, produced seed-probe-nar-1.0.0.nar
    nifi-api-2.11.0.jar served by file:///opt/builder/m2-seed, nothing else reachable
    seed after the build: 178 jars, mtime unchanged, `touch` by the build user refused
  a version the seed lacks, --network none   exit=1    2 s   refuses, rather than half-building
  today's shape, one shared cache, rw        exit=0    2 s   the baseline
  ```

  **So the honest cost is one second per build on this probe, not zero**, plus a 67.7 MB image layer
  and 24 seconds of image build time. Pinning made the seed *smaller and faster* to build than an
  unpinned one (178 jars / 24.1 s against 214 / 33.3 s), because an unpinned resolution pulls metadata
  and several versions of each plugin.

  **A result that was not expected and bears on the “what should the warm-up pull in” question.** One
  skeleton build's closure is **178 jars against the 256** that months of real use accumulated in the
  installation. The common case needs no curating — the seed is whatever the generated skeleton
  itself pulls.

  **The limit, and it is the one that decides this.** `build.sh` generates that pom only for the
  **synthesised** project. A project that brings its own `pom.xml` goes through untouched, so the pins
  cannot be put there, and an author's unpinned pom still needs version resolution from central. The
  offline property therefore holds for the skeleton and **not in general**, and the per-build
  repository means such a project re-downloads its closure on **every** build. Not measured: a real
  processor with a large closure, which is where that cost would show.

  **What survives the correction.** The security property does not depend on any of it: a per-build
  local repository discarded with the build closes the write path for every build, pinned or not,
  synthesised or the author's own. `-o` remains unusable — Maven's offline mode forbids every remote
  including `file://`, measured, failing on `maven-resources-plugin` before compiling — so a network
  that must be closed has to be closed at the container.

  **And option (d) is measured now too, as a consequence.** Promoting what a build downloaded into the
  next seed works: the per-build repository wrote **259 `_remote.repositories` files** naming
  `liquid-seed` and **0 metadata files**, and offering that repository as the next seed built
  `exit=0`. It works for the same reason and under the same condition — everything pinned, so no
  metadata is wanted.

What makes it the least urgent of the three: it needs a *later* build to pick the artifact up, and it
reaches nothing outside the builder — where `/repos` read-write was a path to the containers that hold
the deploy keys. Recorded 2026-10-04.

---

**~~Liquid autoloads from the drop directory, and everything this feature says about deployment is
built on the assumption that it does not.~~** *Answered 2026-09-14/15. Kept because how the answer
was reached is the point; FR29, FR30 and FR36 in `docs/FEATURE-liquid-java-extensions.md` carry the
outcome, and `docs/verification/M-B4-verification.md` the evidence. The decision was not to argue
with the auto-loader but to move the check to the moment of placement, and to take a refused bundle
out of the load path into `refused/` rather than leave it lying where NiFi would load it.*
Measured 2026-09-09, while a red check in `tests/verify/m-b4.sh` refused to be explained. It is the
largest open question this feature has.

```
nifi.nar.library.autoload.directory=/opt/nifi/nifi-current/nar_extensions
```

**The measurement.** A NAR named `b4-autoload-nar-1.0.0.nar` was built into
`volumes/nar_extensions` and nothing else was done — no restart, no copy. After **20 seconds**
`org.nocodenation.probe.AutoloadProbe` was listed by `/nifi-api/flow/processor-types`, the container's
`StartedAt` was unchanged, and the NAR was **not** in `lib/`. Independently, the catalogue was already
listing `ProbeA` and `ProbeB` — B3-3's concurrency fixtures, which the suite writes into the drop
directory and deletes again, which were never in `lib/`, and which no restart followed. NiFi loads
them and does not unload them.

**What that puts in question, none of it settled:**

- **FR36 and M-B4.** The guard refuses to copy a mismatched bundle into `lib/`. NiFi loads it from the
  drop directory anyway, about twenty seconds later. The milestone is built, its 32 cases are green,
  and it guards a path that is not the one that loads. This is why §4's check 3 stayed red through two
  repairs of the check.
- **FR29, and what `nar-build` prints to an agent.** *"Liquid loads NARs from /nar_extensions at
  startup only. Ask the operator to restart it"* — the restart is not required. That sentence reaches
  every agent that builds a NAR.
- **FR30.** *"On start, every `*.nar` in it is copied into `lib/`"* holds, and appears to be
  redundant: the autoload directory would have reached the load path without it.
- **M-B3's check 3.** It established that Liquid lists what `nar-build` produces. It never separated
  whether that was the copy into `lib/` or the autoload directory.
- **Where the setting lives.** `volumes/liquid/conf/nifi.properties:37` — persistent local state. The
  stock `apache/nifi:2.11.0` image says `./extensions`. Nothing in `config/liquid/`, `compose.yml`,
  `.env.example` or a `NIFI_*` variable sets it, so **a fresh installation may not behave the way this
  one does**, and no branch carries the difference.

**Deliberately not repaired on 2026-09-09.** Two explanations for the red check were offered and
withdrawn that day — a leftover unpacked bundle, and an answer from the instance being replaced — and
the third is the first that rests on a measured configuration value rather than on reasoning about
behaviour. The right next step is to decide what the deployment path *should* be, not to adjust a
guard until a check goes green.

**~~Nothing in the stack notices a NAR built against an API Liquid does not provide.~~** *Closed
2026-09-15: `nar-build` now refuses such a bundle before it enters the drop directory, judging it
against an index of the running distribution's `lib/`. The entrypoint keeps its own check for
bundles placed by hand. What follows was the case for doing it, and it still reads true.*
Established by B3-2 on 2026-09-08, and the reason FR23 was rewritten the same day. A NAR compiled
against `nifi-api` 2.11.0, referencing a class the loaded 2.10.0 jar does not contain, is accepted:
the bundle loads, the processor is listed in the catalogue, and `nifi-app.log` says nothing. The
break waits for the first run of the processor — inferred from how the JVM resolves method
signatures, and **not yet tested**.

`nar-build` prevents it at the source by resolving the API through `nifi-utils`, which is FR27, and
that covers every NAR this stack builds. It does not cover a NAR built elsewhere and dropped into
`volumes/nar_extensions` by hand, which is a documented path in the `liquid` skill.

**The first half was done on 2026-09-09, and the inference was wrong about when.** A mismatched
processor was added from the canvas against a stack built from this branch. It fails at
**instantiation**, not at trigger: `POST /nifi-api/process-groups/<id>/processors` answers **500**
with `java.lang.NoClassDefFoundError: org/apache/nifi/controller/NodeConnectionState`. The processor
never reaches the canvas, so it never runs — the predicted error type was right and the predicted
moment was not. The control ran beside it flawlessly: the same processor built against the resolved
2.10.0 reached 4,114,541 invocations in five minutes.

**Two things came out of it that are worse than the original finding.** The error is written to
`nifi-user.log` and **not** to `nifi-app.log`, which is where every check in this repository looks —
so "the framework says nothing" was a conclusion drawn from one log rather than an observation. And
the UI turns the 500 into `/nifi/#/error` reading *"Your session has expired. Please click on the
Home button to renew the session."* That is false, and it points the operator at re-authentication,
which reproduces the failure. Both are recorded in B3-2 and in §4, and §4 now reads both logs.

**~~What is still open is the deployment-time check.~~** *Built as M-B4 and, on 2026-09-15, moved to
where deployment actually happens.* The entrypoint's walk into `lib/` turned out not to be that
place: NiFi auto-loads from the drop directory, so a bundle refused there was loaded anyway. The
check now runs in `nar-build`, between writing the artifact as a dot-file the auto-loader skips and
renaming it into place, and a refused bundle is moved to `refused/` — a subdirectory the auto-loader
does not descend into. Measured on 2026-09-15: placed 06:43:13, loaded 06:43:18, `500` at 06:43:37
with the real error in `nifi-user.log` and nothing in `nifi-app.log`.

**Nothing sweeps a staging file the builder abandoned.**
Introduced by M-B3's own fix on 2026-09-08, and recorded because it is a property the milestone
changed rather than one it found. `config/nar_builder/build.sh` used to stage into
`${DROP}/.${base}.part`, a name derived from the artifact alone: two concurrent builds of one source
wrote into a single file, which is the defect B3-4 exists for. The staging path is now private to the
build process, `${DROP}/.${base}.$$.part` — and with that, the old name's one accidental virtue is
gone. A leftover used to be overwritten by the next build of the same artifact; now every abandoned
attempt keeps a name of its own and nothing ever touches it again. The `trap` covers `INT` and
`TERM`, so a `SIGKILL`, a container stop mid-copy or a `docker compose down` during a build leaves a
file in `volumes/nar_extensions` for good.

**It is litter, not a hazard, and that was checked rather than assumed.** Liquid's entrypoint counts
with `find -name "*.nar"` and iterates `"$DROP_DIR"/*.nar`; a name with a leading dot and a `.part`
suffix matches neither, so nothing reaches `lib/`. B3-4 asserts the directory is clean after a normal
pair, which is the case that matters for the fix; nothing asserts it after an abandoned build,
because nothing cleans up after one.

**Left because the cheap fix is not obviously the right one.** A sweep of `.*.part` at the start of
`build_command` would delete the staging file of a build running concurrently — the very situation
this milestone made safe. Sweeping only files older than some age reintroduces a criterion that
depends on when you look, which this project has already removed once. The honest options are an age
the builder itself owns, or leaving the directory's hygiene to `cleanup.sh`, and neither is worth
deciding under a milestone that is otherwise closed.

**A locally built image can belong to another branch, and nothing on this one says so.**
Met on 2026-09-07, during the first dashboard-driven start this project has ever performed. This
branch pins `ghcr.io/openclaw/openclaw:2026.7.1` and its start script writes the configuration that
version takes. The image on the machine, `liquidupstart/openclaw:latest`, was **2026.9.1** — built
eight hours earlier from `feature/openclaw-2026-9-1`, because images live on the host and not in the
branch. The start wrote a `cliBackends` key, a 2026.9.1 binary answered *"Unrecognized key"*, and
under a pty it asked `Run "openclaw doctor --fix" now? [Y/n]` in a one-shot container with no stdin.

**The only symptom was a container that did not come back.** Nothing compared the pin against the
image; nothing named a version at all. Removing the container by hand let the start continue, and it
then completed: the gateway migrated the legacy key away by itself, reported `restarts=0` and
`healthy`, and the stack came up with all twenty containers. So the failure mode after the hang is
worse than the hang — an installation that looks entirely correct while running a version this branch
does not pin, silently rewriting its own configuration on every start.

**The answer already exists one branch over.** `feature/openclaw-2026-9-1` reads
`openclaw --version` out of the built image and `meta.lastTouchedVersion` out of the state, and
refuses rather than guessing — *facts are computed, conduct is taught*, applied to exactly this. On
`main` and on this branch that probe does not exist, so the check arrives whenever #13 lands.

**And it is not OpenClaw's problem.** Four images are built locally, all tagged `:latest`, and
nothing anywhere compares a built image against the branch that should have built it. The same class
struck twice in one day: `liquidupstart/opencode:latest` had to be rebuilt while M-A8 ran, because
OC-20 had built it from a `main`-shaped checkout and it carried no `ssh`, so A3-7 failed against it.
A cheap first move is a start-time line naming what each locally built image was built from —
`.liquidupstart-version` and the build manifest already exist for exactly this kind of question.

**The toolbox image had no `git` and no `openssh`, and the start script's git step runs inside it.**
*Observed and fixed 2026-09-07. Kept because how it was found is the point.*
`scripts/linux/start.sh` runs `config/scripts/start/git.sh` at line 139; the dashboard's Build and
Start buttons run those scripts in the **toolbox** container
(`dashboard/src/routes/run/+server.ts`), and `config/toolbox/Dockerfile` installed bash,
ca-certificates, curl, gnupg, openssl, gawk, sed, grep, coreutils, procps, a JRE and the Docker CLI
on `debian:bookworm-slim` — none of which brings `git`, `ssh` or `ssh-keygen`.

**It was first written here as a reading, not an observation**, and deliberately left that way: the
toolbox image is not built while writing tests, so nobody had watched it fail. The entry named the
two steps to take. Both were taken the same day. The image was built and asked — `git: ABSENT`,
`ssh: ABSENT`, `ssh-keygen: ABSENT` — and then `git.sh` was run inside it against a throwaway
project: `line 17: ssh-keygen: command not found`, `EXIT=127`.

**The reading understated it.** It said an operator "reaches key generation with no `ssh-keygen`",
which sounds like a missing key. `start.sh` sets `set -euo pipefail` on line 2 and calls `git.sh`
unguarded on line 139, fourteen lines before `docker compose up -d`. The failure did not cost the git
step; it cost **the whole start** — no services, no stack, one line of output. And `git.sh` does not
exist on `main`, so the defect arrived with this feature and broke the path `CLAUDE.md` calls
recommended. It survived because every start in this project's history was typed into a terminal.

Fixed by adding `git openssh-client`, and covered by **A8-19**, which runs the git step inside the
image rather than listing what the image should contain — so the next start script to grow a
dependency fails there too. The same gap existed in `dashboard/Dockerfile` and was fixed by M-A8, and
M-A3 found it in the agent images. Three images, one mistake, three separate discoveries: nothing
compares what the scripts invoke against what the images carry.

**nginx appends to `X-Forwarded-For` instead of overwriting it.**
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` has been in this repository since
2026-06-01, arriving with the original webdb-playground base, and appears seventeen times: sixteen in
`config/nginx/templates/nginx.conf` and once in the generator that emits the hundred Liquid ingress
blocks. It preserves whatever the client sent and appends the real address, so a request arriving with
its own `X-Forwarded-For` has that value passed downstream as the first hop.

**Not a defect anyone has demonstrated.** It surfaced on 2026-09-05 while repairing OpenClaw's
`proxy_attribution_required`, and was changed to `$remote_addr` on the assumption it was part of that
fix. It was not: measured afterwards, appending with a narrow `gateway.trustedProxies` answers HTTP
200 exactly as overwriting does. The change was reverted, because a hotfix for a released stack
should carry only what the break requires.

What would settle it: whether anything downstream reads the first entry and trusts it — NextCloud,
OpenProject and pgAdmin all have their own trusted-proxy handling, and none has been checked. Against
that stands a real cost: overwriting discards the true client address for an operator who puts their
own reverse proxy in front of this stack. Decide it on those two facts, not on the tidiness of the
directive.

**`cleanup.sh` asks for a sudo password in the middle of a long run, and need not ask at all.**
Noticed during A7-5 on 2026-09-05. Under rootless Docker the host user maps to container root, so
files the containers wrote belong to subordinate UIDs and the host user cannot remove them; the plain
`rm -rf volumes/` fails and the script falls back to `sudo`.

Deleting from inside a container avoids the prompt entirely — there the ownership is root's own:

    docker run --rm -v "${PROJECT_DIR}/volumes:/v" alpine sh -c 'rm -rf /v/..?* /v/.[!.]* /v/*'

The script already has the shape for it: plain removal, then a fallback. The container attempt
belongs between the two, with `sudo` kept as the last resort for a host without a working Docker.

And if `sudo` is still reached, the prompt belongs at the **start** of the script rather than four
minutes in, where it arrives long after the operator has looked away — and where missing it leaves a
half-cleared directory. `cleanup.sh` lives on `main`, so this is stack work rather than this
feature's, and is recorded rather than fixed here.

**The Claude CLI install could not fail, and shipped a broken image.** *Fixed 2026-09-05.*
Found by A7-5's cold start — the first rebuild of `liquidupstart/openclaw:latest` in weeks. The start
reported `EXIT=0`, printed every URL and password, and OpenClaw could not serve a single request:
`Error: claude native binary not installed`.

**npm 12 blocks install scripts by default.** `@anthropic-ai/claude-code` fetches its native binary
in a `postinstall` (`node install.cjs`), and npm's new `allowScripts` mechanism skipped it with a
warning while the install itself succeeded. The image shipped a launcher with nothing to launch. The
base image `ghcr.io/openclaw/openclaw:latest` is one of the seven moving tags A7-5 lists and was
pulled that morning, bringing node 24.19.0 and npm 12.0.2 — so the stack's build broke because
something upstream changed a default, which is exactly the failure mode A7-5 was written to surface
and the only place in this repository where it could have surfaced.

The rendered line is now
`RUN npm install -g --allow-scripts=@anthropic-ai/claude-code @anthropic-ai/claude-code && claude --version`.
The first half makes it work; the second makes the next silent failure loud, in the manner of the
`|| true` removed from Liquid's entrypoint in M-B2. Verified in the running container: the install
then reports `changed 2 packages` and `claude --version` answers `2.1.261 (Claude Code)`.

**Two corrections to this entry's first version, kept because how the wrong answer was reached
matters.** It blamed `optionalDependencies` being silently skipped — the package does declare eight
platform packages, none was installed, and that looked sufficient. It is not what happened:
`install.cjs` fetches the binary itself, and no platform package is installed even now that it works.
And it ruled out blocked scripts by reading `npm config get ignore-scripts`, which is `false` —
the wrong knob entirely, since npm 12 blocks through `allowScripts` instead. A cause was excluded by
checking something adjacent to it, and the remaining theory was then written down as fact. Re-running
the install is what corrected it, which is the same discipline this project applies everywhere else:
reproduce before concluding.

**`bun_runner` reports unhealthy with no app, and says nothing about it.** *The first half was fixed by #12 on 2026-09-06; the second half stands.*
Seen during A7-5 on 2026-09-05, thirty minutes into a cold start. Its healthcheck probes port 3000;
`volumes/bun_app` is empty because the reset removed it, so nothing listens and the container is
marked unhealthy. Its log is **completely empty** — not a line about starting, about finding no app,
or about what would change it.

**And the healthcheck hides it for exactly as long as anyone is watching.** `start_period` is 5m, so
for the first five minutes after every start Docker reports `health: starting` rather than
`unhealthy`. That is the window in which an operator still has the terminal in front of them: they
see "starting", read it as warming up, and turn away. The unhealthy state appears afterwards, when
nobody is looking. It is a plausible reason this has gone unnoticed, and it means "check right after
the start" is not a way to find it.

Whether idle-without-an-app should report unhealthy is a judgement for whoever owns the service. What
is not a judgement is that the state is **indistinguishable from broken**: the first thing a new
operator does is a cold start, and it ends with one of nineteen services red and nothing anywhere
that explains it. One line on startup — "no application in /bun_app; serving nothing until one is
added" — would settle it either way.

Not this feature's, so recorded rather than fixed. The causal chain is strongly suggested by the
empty directory, the port the check probes and the silent log, but has not been confirmed by watching
the service become healthy once an app exists.

**#12 closed the part that makes a working stack look broken.** The check no longer probes port 3000
when `/bun_app/package.json` is absent, so a stack with no application deployed reports healthy —
five cases in `docs/CASES-bun-runner-health.md` on that branch, signed off before the one line
changed. This branch does not carry the fix; it is cut from `main` alongside it.

What is left is the silence: the log still says nothing, and the check still infers the state instead
of reading one the entrypoint publishes. That alternative is on `feature/openclaw-2026-9-1`'s
`BACKLOG.md`, where #12's own record could reach a backlog file.

**The harness models one precondition where there are two.**
Found during A7-5 on 2026-09-05, in the window between `cleanup.sh` and the first `start.sh`. Four
cases fail there that `--no-system` does not skip: A3-3 twice (`known_hosts` seeded), A4-16 (the
shared hook present and executable) and A1-4 (the live workspace). None of them needs the containers
running; all of them need **the start script to have run at least once**, because they assert its
output. `stackGuard` covers "containers are up" and nothing covers "the start has produced its
files", so `--no-system` promises a suite that runs without the stack and does not deliver one.

The cost is not only the broken promise. On a machine that has never started, these fail with
`expected true, received false`, while the system cases fail with *"stack not running … Start the
stack with ./scripts/linux/start.sh"* — the same difference between a refusal that names the next
step and one that does not, which FR20 exists to remove. A second guard asserting the start's
artefacts, with that message, would fix both halves.

Deferred rather than fixed because it is harness work discovered mid-procedure, and A7-5's own record
should carry it once the case completes.

**One unreproduced intermittent failure in the full suite.**
Recorded in the amendment to A5-3's detail block. The M-A5 fixture failed to build once during the
operator's second verification run and has not reproduced since — four consecutive runs, the
aside-and-restore sequence repeated by hand, and the setup executed by hand in the container were all
green. No cause is claimed. Two changes narrowed its surface: the probe directory is now unique per
run, and the setup's output is asserted before its exit code, so the next occurrence will say what
git said instead of only `received: 1`.

**The proof of passage is per clone, not per publication.**
Found by A7-4 on 2026-09-04, and recorded rather than fixed. `git-publish` writes
`.git/liquidupstart-publish` immediately before pushing and removes it afterwards whether or not the
push was accepted, and the hook consumes whatever it finds there. With two publications in flight in
one clone, the permission one mints can therefore be consumed by the other's hook or removed by the
other's cleanup. It **fails closed** — the loser is refused in the hook's words and nothing reaches
the remote, which is what FR18 asks for — so this is not a defect; but which of two well-behaved
publications succeeds is decided by timing. A per-invocation permission (a token naming the process,
or the ref and sha it was minted for, checked by the hook) would remove the interaction. It is
deferred because it changes the mechanism M-A6 signed off, and no requirement asks for it.

**The `git config` error in the A5-9 transcript is inferred, not observed.**
OpenClaw showed `Bash failed: run git config` and the exact argument list is not in the screenshots.
The reading — a `git config --get` on an unset key, which exits 1 — follows from the clone carrying
no local `user.name` or `user.email` and the identity coming from the environment. Expanding the
`Tool error Bash` row in OpenClaw would confirm or refute it. Low value, recorded so the inference is
not later read as an observation.

## Carried over from the 2026.9.1 migration

*Merged from `main` with #11 on 2026-09-14. Open against the same codebase, recorded separately so
their origin stays readable.*

**`down.sh` leaves behind every container the current branch does not declare.**
Met on 2026-09-08 while switching from `feature/liquid-java-extensions` to this branch: `nar_builder`
survived the teardown and kept running alongside a stack that has no such service, because
`docker compose down` acts on the services in the **current** `compose.yml` and that branch's service
is not in this one. It is the branch-shaped-stack problem from `HANDOFF.md`, one layer down — the
containers that come *up* are this branch's, and the ones that were already there are not
reconsidered.

**It is the one thing this week that announced itself.** Every compose invocation prints
`WARN Found orphan containers (nar_builder) for this project … you can run this command with the
--remove-orphans flag`. Nothing had to be diagnosed; the tool names the problem and the flag. That is
also the risk: a warning on every call that nobody acts on is how a project learns to read past
warnings, which is the failure `HANDOFF.md` records as *a check that cries wolf*.

**Not fixed here on purpose.** `scripts/linux/down.sh` is **byte-identical on `main`, #9, #10 and
#13** — one `docker compose down`, ten lines. Adding `--remove-orphans` on this branch alone leaves
the other three, and the same repair arriving separately in several places is how one file becomes
two that differ. It also changes what teardown means for every stack: `--remove-orphans` removes
whatever the current file does not declare, which is right here and worth a deliberate decision
rather than a drive-by. The orphan itself was removed by hand with `docker rm -f nar_builder`.

**The Claude login expires, and the one idea that might remove the expiry is unmeasured.**
The login lives only in `volumes/_openclaw-claude` and does not survive a reset; the migration cost
four interactive sign-ins in two days. A long-lived `CLAUDE_CODE_OAUTH_TOKEN` was measured and
**refused** — the in-process Agent SDK that serves turns on 2026.9.1 does not authenticate from it,
and leaving it in `.env` would make `start.sh` skip the sign-in, trading a loud failure for a silent
one. That measurement is final and is recorded in `docs/verification/RESULT-openclaw-2026-9-1.md`
§11.

What remains is an idea, stated as an idea: the Claude **CLI** does accept the token, so a CLI call
made with it might materialise a `.credentials.json` that the SDK then reads — which would give the
start an unattended path to valid credentials. Nobody has measured that, and the last two coherent
inferences about this bundle were both wrong. Measure before building: one command in a throwaway
container decides it.

**The `bun_runner` entrypoint should publish its own state instead of being inferred.**
*The finding itself is not here.* It is on `feature/git-integration` and
`feature/liquid-java-extensions` as *"`bun_runner` reports unhealthy with no app, and says nothing
about it"*, found by A7-5 on 2026-09-05 — and **#12 has since fixed the half that made a healthy
stack look broken**: the check no longer probes port 3000 when `/bun_app/package.json` is absent.
This entry is only what #12 deliberately did not do, recorded here because #12 is cut from `main` and
had no backlog to write into.

The check now answers "is something listening on 3000, if an app is deployed?" and infers the rest.
The faithful answer is for the entrypoint to write `waiting` / `building` / `serving` to a file the
check reads — a computed fact rather than an inference, and this project's own idiom. Rejected **for
that branch only**: it changes the entrypoint and therefore the image, on a repair of the released
stack whose whole value is being reviewable in two minutes.

It would also close the gap #12 leaves and states in numbers: while `bun install && bun run build`
runs, `package.json` exists and nothing listens yet, so the check fails. Bounded by `retries: 10` at
`interval: 30s` — a false negative of the same family, only narrower. And the empty log the original
finding named is still empty; one line on startup would settle what the state means either way.

**The OpenClaw CLI cannot reach its own gateway here, and `OPENCLAW_GATEWAY_TOKEN` is a dangling
contract key.** Triggering a turn from inside the container fails both ways: without `--local` the
gateway answers `unauthorized`, and with `--local` it refuses because a gateway is already running
for the same state directory. The cause is the same one behind the September `openclaw devices
approve` failure — `gateway.auth.mode` is `trusted-proxy`, there is no `gateway.auth.token`, and the
CLI sends no identity header. `openclaw doctor` names it: *"Gateway identity-header auth has no
configured token/password path for machine clients."*

Worked around by stopping the gateway and running `--local` in a throwaway container. Not fixed:
giving the gateway a token changes the authentication model, which is not what a version migration
should carry. `.env.example` line 53 already declares `OPENCLAW_GATEWAY_TOKEN` and **nothing reads
it** — the obvious place to start if this is taken up, and worth removing if it is not, because a
declared key nothing consumes is a promise the contract does not keep.

**`volumes/_openclaw-claude/skills` cannot be removed, and the cause was not established.**
An empty directory that resists deletion by its owner with a writable parent, by `rmdir`, and by `rm`
inside a privileged container, which answers `Operation not permitted`. It carries no macOS flags and
is not a mount point.

Sidestepped rather than solved: `docs/PROCEDURE-cold-start.md` §1 archives state with `tar` instead
of copying trees and refreshing them with `rm -rf`, so an archive is one file that gets overwritten
and the whole class of problem disappears. That is the right shape regardless of the cause, which is
why establishing the cause is worth little — recorded so that the next person to meet it does not
spend an hour on it as this run did.

**Two `:latest` fallbacks remain in the `ingest-pdf` plugin build scripts.**
`${OPENCLAW_IMAGE:-ghcr.io/openclaw/openclaw:latest}`, in scripts neither `build.sh` nor `start.sh`
invokes. The plugin's bundle is checked in, so rebuilding it to remove a papercut carries more risk
than the papercut warrants. Every fallback on a path the stack actually walks was removed during the
migration; these two are what is left.

**~~`timeout -k` on the bounded docker runs.~~** *Done 2026-09-14, and this entry was wrong.*
Suggested in the third review of #11 as an optional improvement to N1 (OC-60 since the 2026-09-30 rename), and deferred here on the
grounds that the situation justifying it could not be produced. It produced itself two days later: a
suite run hung fifteen minutes on the N1 (OC-60) case itself, a hand-run of the same command sat attached to
a live container for eight minutes, and an outer `timeout 40` around the whole thing did not return
either — GNU timeout waits for its child after signalling. In that window three of four attempts
needed the kill (rc 137 after the grace) rather than the signal (rc 124). It is **intermittent and
state-dependent**: an hour later, four of four ended at SIGTERM in eight seconds, same host, same
stack, and the four control runs of the case passed without `-k`. So the rate is not a property of
the system, and no cause was established. What is established is that the bound can fail to return
at all, and that without `-k` the start then hangs forever. The lesson is not about `-k`:
**"I cannot reproduce it" is a statement about the attempt, not about the system**, and it is a weak
reason to defer something whose cost was one flag.

**`HANDOFF.md` mixes two kinds of content, and only one of them ages.**
It carries durable project knowledge — the lessons, which four other documents already cite as rules
(*"`HANDOFF.md` records the general rule"*) — alongside the state of one machine at one moment. The
second kind goes stale, and because both live in one file, all of it reads as stale. Splitting the
lessons into `docs/LESSONS.md` would leave the handover holding state and plans only, and would put
the cited rules where a citation expects to find them.

Deferred on 2026-09-15 rather than done: it touches four cross-references while #9 and #10 are under
review, and moving files under a reviewer mid-review is how a review gets read twice. The cheap half
was done instead — the file and `CLAUDE.md` now say what the handover is, what it is not, and which
copy is current.

**~~The repositories card contradicts the key panel while the start is waiting.~~** *Done
2026-09-17, as M-A12 -- the manifest is written after pass 1 as well, and again at the end.* Kept for
what it records: the entry below was written as a deferral and built four hours later, which is the
right order round. The original text:
`git.sh` writes `volumes/_git-secrets/repositories.json` in its third pass, at the end. So while the
start waits for a deploy key, the card above it still describes the **last completed** start.
Observed by the operator on 2026-09-17: the panel said *"Add a deploy key to continue — 1 of 2"* and
the card below it said *"1 of 4 prepared repositories could not be reached … 1 declared repository
has no deploy key yet. Start the stack so it gets one."* — while that start was running. Nothing is
wrong in either statement; they describe different moments, and the card cannot know about a
repository declared since the last start.

The fix is small: write the manifest provisionally after pass 1, where every clone has already been
attempted and the outcome per repository is known, and write it again at the end. The case is
*"while the start waits, the card does not contradict the panel"* — one start against a remote that
refuses, the manifest read during the wait rather than after it.

Deferred on 2026-09-17 rather than done: M-A9 had just been observed end to end, review points 1 to
4 of #9 were answered, and the reply to the review had been waiting since that morning. The
contradiction is visible but harmless, and it lasts only as long as a wait does.

**~~A system case did not give the operator's gateway configuration back.~~** *Done 2026-09-17, as
M-A11.* `tests/system/m-oc.{codex-plugin,proxy-attribution,device-scopes}.test.ts` write
`volumes/_openclaw/openclaw.json` and restart the gateway. After a run the file had lost
`"claude-cli/*"` from `agents.defaults.models` — the entry `openclaw.sh` writes so that the model
policy it derives lists the CLI's own provider — and the gateway was left exited 127, which took 26
M-B4 cases down with it.

Both halves are now built, and the entry is kept because what it found is worth more than the fix.
*The restores were the wrong shape twice over:* two of the three put back a **single field** into a
document read back at restore time, so whatever else had changed in between survived wearing the
original's name; and each file captured its own "original", so a file whose capture happened after
another had already written held the changed state as the thing to restore.
`tests/lib/installation.ts` captures whole files, once per path however many files ask for it, and
A11-9 refuses a bespoke restore beside it. *And the tier was opt-out:* `./tests/run.sh m-oc` ran it,
`--no-system` turned it off. A default that is safe only when you remember a flag is not a default,
so `--system` is now how you ask for it, `--no-system` describes the default, and every run says how
many files it did not run and how to run them.


**The start waits on one missing deploy key at a time, and the panel shows it that way.**
Proposed by the operator on 2026-09-18, watching the queue: *"die 1. Karte wird zu schnell von der
2. überdeckt ... vielleicht wäre eine Anordnung als Tabs sinnvoller"*. The immediate complaint is
fixed -- the panel now stays on the repository that was skipped for five seconds, and the queue
advances afterwards -- but the shape underneath is what produced it.

`git.sh` waits **sequentially**: `lu_wait_for_operator` for repository 1, and only when that is
settled does it look at repository 2. So an operator who registers the second key while the start is
waiting on the first sees nothing happen until the first is skipped or registered. Tabs over a
sequential wait would promise a freedom the process does not have, which is worse than a queue that
shows its order honestly.

The improvement is the other way round: **wait on every outstanding key at once**, cloning each the
moment its own key appears, in whatever order the operator works. The panel then becomes a set of
equals rather than a queue, and tabs are the honest presentation of that rather than decoration.

Not built here because it changes M-A9's wait, which was signed off as a queue, and because four
questions have to be answered first -- by the operator, before any case is written:

1. **The budget.** It is one deadline for the whole start, refreshed whenever the operator acts. With
   three keys outstanding at once, does one registration refresh it for all three? Probably yes, but
   it is a decision.
2. **The sign-ins.** Claude, Codex, Copilot and Grok wait the same way and are also sequential. Do
   they join the same tabs -- one place for everything the start is waiting on -- or stay separate?
   They differ in kind: a sign-in has a flow with a code to paste, a deploy key has a page to visit.
3. **What "done" means.** With a queue, the panel closes when the last one is settled. With a set,
   does the panel close as each is settled, or stay until all are, with settled ones marked?
4. **The log.** The markers were designed for a queue (`::aiw-git-key-required::<slug>`, last one
   wins). A set needs per-repository state in the log, or the panel and the log will disagree -- which
   is the shape of half the findings this feature has already produced.

Recorded 2026-09-18.

**A run killed mid-clone leaves a clone that the next run adopts.**
M-A15 stops two runs from preparing one repository at the same time, which is what produced a
dashboard Test reporting a repository as reachable while a start was still trying to clone it. It
does not cover the leftovers: `git clone` writes `dest/.git` and the remote within 20 ms, so a run
killed in that window leaves a half-written clone whose `remote.origin.url` already matches the
declaration. The next run sees a `.git` with the right origin and adopts it as a finished clone.

There is no cheap inspection that settles it -- a clone in flight and a finished clone of an **empty**
repository are the same thing on disk, a repository with a remote and no commits. What would settle
it is a marker of the run's own: the lock directory could hold the destination it is cloning into,
and a `.git` whose lock is gone but whose clone never completed could be recognised and removed. That
is a design decision with an edge case of its own (an operator's half-done manual clone), so it is
written down rather than guessed at.

Recorded 2026-09-18, when the lock was built. The window is narrow and needs a run to die inside it;
the reason it is here is that `docs/FEATURE-git-integration.md` and the test specification both say
it is, and a document that claims a record must have one.

---

## Does the mid-term memory remember the right things? — deferred 2026-09-20, with a trigger

**The mechanism is measured and works; the value is unmeasurable until the stack is used.**
`docs/FEATURE-memory-midterm.md` §2.2 has the detail. In short: `memory-core` indexes, ranks, and
explains its decisions, and promotion into `MEMORY.md` requires an entry to be recalled **three times
across three distinct queries** within thirty days. This installation has produced one session
summary ever and asked no questions, so nothing has been promoted, and nothing will be.

**Do not wait for it.** Days accumulate and recalls do not, and `maxAgeDays=30` means the fifteen
entries now in the store drop out on 2026-10-19 unpromoted. A daily look would show the same zero
until then — the accumulating-nothing that looks like accumulating evidence.

**The trigger:** once OpenClaw has been used in earnest for about a week, run
`openclaw memory promote --json` and read `recalls`, `uniqueQueries` and `score`. Promotions happening
would give M-M3 a baseline to beat and might remove the need for it; thresholds never being reached
under real use makes the thresholds the thing to tune, and they are readable rather than guessed.

**A synthetic conversation was considered and refused.** It would answer only what was put into it,
and this project has enough of those.

## `operator.admin` is reachable from any container on the stack network

**Not a defect of the git integration, and not of the pairing recovery either — it predates both.**
Raised by the reviewer on 2026-09-28 against #9's base `e33d1e6`, measured live, and recorded here at
their request. It is a design question, and the answer changes nginx.

**Rewritten 2026-10-02, and what stood here was wrong about this branch's own feature.** The entry
existed on two branches: this one from 2026-09-30, and #19, which carried the decision taken later
that day. The #19 copy is removed — approving a harness fix should not also sign off a trust boundary —
and this is now the only one. The version it replaces proposed *"set `X-Forwarded-User` only for
requests arriving from the host rather than from the stack's network, or do not route the agents to the
`openclaw.localhost` vhost at all"* and called that the direction that answers the finding. **It would
break the recovery path #15 exists to provide**, which runs its CLI inside that network and through
that vhost. The catch is below, and it is why the decision went to a named address instead.

nginx attaches one constant identity to every request it forwards —
`X-Forwarded-User "user@nocodenation.org"` — and the proxy's address is in OpenClaw's
`trustedProxies`. So a container on the stack network that connects to OpenClaw through nginx with a
fresh device key, presenting itself as the Control UI, is auto-approved with `operator.admin` and no
human involved:

```
security audit: trusted-proxy browser device auto-approved user=user@nocodenation.org device=…
  scopes=operator.admin,operator.approvals,operator.pairing,operator.questions,operator.read,operator.talk,operator.write
```

`exec.approvals.get` then succeeds. Every condition of the auto-approval is either under the client's
control or true for every request: `clientId: openclaw-control-ui` is a connect parameter with no
provenance check, `allowedOrigins` is `["*"]`, and `clientBuildId: "dev"` is accepted because it is a
cache-bust guard rather than a boundary.

**The finding is about the agents.** Admin in the Control UI is expected — it is the operator's own
machine. The agents run on the same network, and `operator.admin` covers `exec.approvals.set` —
whether an agent's shell commands need the operator's approval — as well as `config.apply`,
`terminal.open` and `plugins.install`. An agent steered by a prompt injection in a page or a
repository it read can switch off the step that is meant to supervise it.

**The local network is a second thing, and not what the decision below is about.** The proxy port was
published on every host interface, so anything on the LAN could do the same. That was a promise
`README.md` had made since 2026-07-17 and the compose file did not keep; **#20 repaired it**, merged as `fb6d6ec`
on 2026-10-16, with `SYSTEM_BIND_ADDRESS` defaulting to `127.0.0.1`. Read the identity rule below as doing nothing about
the LAN, and the binding as doing nothing about the agents.

They are not independent, though, and the reviewer's measurement of 2026-10-01 is why: on rootless
Docker a request to `127.0.0.1` and a request to the host's LAN address both reached nginx with the
same `$remote_addr`, the bridge gateway (`10.231.7.1`), while a container on the network arrived as
`10.231.7.3`. So any rule that keys on the address cannot tell the operator's own browser from the LAN
until the port is bound. **#20 was a precondition of the direction below**, not a smaller thing beside
it, and it is in place: the port binds to `127.0.0.1` by default as of `fb6d6ec`, so a rule that keys
on the address can now tell the operator's browser from the LAN.

**What #15 changed, and did not.** It moved admin out of the device auto-approval cap into
`gateway.auth.identityScopes`. That removes a pairing step a container could script and stops the
gateway logging its SECURITY WARNING; it leaves the exposure as it is, because the identity is what
nginx asserts for everything.

**The direction, decided by the operator on 2026-09-30:** nginx asserts the identity for the host and
for one named address on the stack network, and for nothing else. It sets `X-Forwarded-User`
unconditionally in three vhosts today — `openclaw.localhost`, `bridge.openclaw.localhost` and
`msteams.openclaw.localhost`, at lines 92, 114 and 136 of
**`config/nginx/templates/nginx.conf`**. That file, not `config/nginx/nginx.conf`: the rendered one is
generated and is not in the repository, and editing it is how a fix survives until the next render.

An address is a position on a network, not a principal. Whoever holds it gets the identity, so the
rule is only as strong as the guarantee that nothing else can hold it — which is the next paragraph,
and the reason this is not one line.

**The catch that shaped the decision.** The obvious form — *"only for requests from the host"* —
breaks the recovery path #15 exists to provide. `config/scripts/openclaw-pairing.sh` runs a throwaway
OpenClaw CLI **inside the stack network** (`--network "$NETWORK"`, with
`--add-host openclaw.localhost:${PROXY_IP}`), because a CLI reaching the gateway directly sends no
identity header and is refused — the dead end of 2026-09-19. So a stack-network client has to keep the
identity, and the question is what nginx can tell that container apart by.

*Two answers were weighed:*

1. **A fixed address.** nginx sets the identity for the host and that address alone. **Chosen.**
2. **A shared secret in a header.** More flexible, and it adds a secret to generate, mount, rotate and
   keep out of logs. Rejected: this stack's argument is that a fact you can read beats one you have to
   remember.

**What the fixed address costs, which an earlier version of this entry understated.** It said the
choice "introduces nothing new to keep". That was false, and the reviewer's #15 review of 2026-10-01
is what corrected it:

- **The pairing helper has no fixed address today.** It runs `docker run --network "$NETWORK"` with no
  `--ip`, so docker assigns one from the pool. A pinned address means a new `.env.example` key, a new
  variable in the nginx template, and an `--ip` on that `docker run` — three things to keep in step,
  not none.
- **Two concurrent helper runs collide.** With the address pinned, the second `docker run` fails with
  *address already in use*. Today they simply get different addresses.
- **An orphaned helper holds the address.** A run killed before its cleanup keeps the container, and
  the next one cannot have the address until something removes it.
- **In its favour, and unsaid until now:** `ip_range: ${SYSTEM_NETWORK_POOL:-10.99.0.128/25}` in
  `compose.yml:898` keeps docker's dynamic pool above `.128`, so a pinned address below it cannot be
  handed to anything else. That is the guarantee the rule needs, and it already exists — **and it is
  enforced rather than assumed**: `lu_ip_in_cidr` in `scripts/linux/start.sh` refuses a
  `SYSTEM_PROXY_IP` that falls inside the pool, and does it before `down.sh` runs, which
  `m-oc.env-reads` holds in four cases. Extending that guard to a second pinned key is the known
  shape of the work, not new ground. It is also where the cost sits: the pool is a variable with a
  default, so two keys have to agree and nothing checks the new one until the guard is extended. That
  is the lesson of the subnet pin, one layer along — ask what else knows the number you just wrote
  down.

Narrowing `allowedOrigins` does not help: a non-browser client sends whatever `Origin` it likes.

**What had to be measured before any of it was written, and two of the four now are.** Whether nginx
can distinguish host traffic at all, and by what. The four combinations that matter are **rootless and
rootful, on Linux and on macOS**, with loopback and LAN read separately in each. The two that are
measured are the **diagonal** — they differ in both dimensions — and they agree:

| Measured | Loopback | The host's LAN address | A container on the stack network |
|---|---|---|---|
| Linux, **rootless**, reviewer, 2026-10-01 | `10.231.7.1` | `10.231.7.1` | `10.231.7.3` |
| macOS, **rootful** (Docker Desktop 4.93.0), 2026-10-10 | `192.168.65.1` | `192.168.65.1` | `10.99.0.148` |

Different mechanisms — a bridge gateway on one, a userland proxy on the other — and the same verdict
on the LAN half.

> **Retracted 2026-10-13, and it was the load-bearing half.** This entry said *"Host against container
> separates, on both. That is the half the decision rests on, and it holds."* **It does not hold.** The
> reviewer measured the route neither row had: a container **on the stack network** reaching the host's
> LAN address through the **published port**. On rootless Linux it arrived as the host; re-measured the
> same day on macOS/rootful with `tests/verify/address-routes.sh`, it arrives as the host there too.
> Both rows had only ever measured a stack container talking to nginx **directly**, where of course it
> arrives as itself. My own sixth macOS reading — a container on an *unrelated* network, through the
> published port, arriving as the host — pointed straight at it, and I did not follow it.
>
> So **neither half separates while the port is published on all interfaces**, and the agent case this
> entry says the rule answers is open, not closed.

**The matrix, reproducible as of 2026-10-13.** `tests/verify/address-routes.sh` builds a throwaway
network with the stack's own shape, a throwaway nginx returning `$remote_addr`, and asks every route.
macOS, rootful, Docker 29.8.1:

| client → target | `$remote_addr` |
|---|---|
| host → `127.0.0.1`, published on all interfaces | `192.168.65.1` |
| host → the host's LAN address | `192.168.65.1` |
| stack-network container → nginx **directly** | `10.77.5.130`, its own |
| **stack-network container → the host's LAN address** | **`192.168.65.1`, the host** |
| container on an unrelated network → the host's LAN address | `192.168.65.1` |
| stack-network container → the network gateway, published port | `10.77.5.130`, its own |
| host → `127.0.0.1`, **bound to loopback** | **`10.77.5.128`, the gateway** |
| **stack-network container → the host's LAN address, bound to loopback** | **no answer** |

**Three things in that table change the entry.**

1. **The last row is why #20 is enough for this.** With the port bound to loopback the container's
   route through it is simply refused, so the published port — not the network — is what let a
   container present itself as the host. #20 is therefore a precondition for **both** halves of the
   rule, not only for host-against-LAN as written above.
2. **The host's address is not fixed, and it is not `.1`.** With the port on all interfaces the host
   arrives as the userland proxy's `192.168.65.1`; bound to loopback it arrives as the **network
   gateway**, which docker sets to the **first address of the pool** — `10.77.5.128` here, because
   `ip_range` starts there and no `gateway:` is declared. The reviewer found the same on Linux. So any
   rule naming the host address must **compute it from the running network** rather than carry a
   constant.
3. **The binding coupling below is larger than it was written.** Opening `SYSTEM_BIND_ADDRESS` does not
   only expose the LAN: it hands the identity to **every container on the host**, agents included, by
   the route in the fourth row. The guard proposed there — refuse, or do not assert, when the bind
   address is not a loopback address — is unchanged in shape and carries more weight.

**Still not measured:** rootful Linux, the `slirp4netns` and `pasta` port drivers, and a request from
a second physical machine. Two of the four combinations remain, and the probe above is what they should
be measured with so the readings can be compared rather than retold.

The macOS reading was taken six ways, because one reading of an address is a reading of a route and not
of a property: IPv4 loopback, IPv6 loopback (`openclaw.localhost` resolves to both here), the hostname,
the host's LAN address, and — to get a client out of the host's own network namespace — a container on
an unrelated docker network reaching the published port through `host-gateway` and through that LAN
address. **All six arrived as `192.168.65.1`.**

*And the sentence that followed was wrong: "the stack-network container was the only client that
arrived as itself".* It arrives as itself when it talks to nginx **directly**, which is the only way
it was asked. Through the published port it arrives as the host — see the retraction above. Six
readings of one route are still one route.

**Still not measured, and stated rather than implied:** no reading was taken from a second physical
machine. Both rows above originate on the host under test, as did the reviewer's. What the six readings
establish is that the published port collapses the source address of every client that is not on the
stack network, which is the mechanism a LAN peer would also arrive through — but it is an inference from
the route, and the measurement that would close it is one `curl` from another machine.

**One thing was observed that had until now only been read.** `ip_range: ${SYSTEM_NETWORK_POOL:-10.99.0.128/25}`
is the guarantee the pinned address depends on, and the entry above argued it from `compose.yml`. The
container in the table arrived from `10.99.0.148` — inside the pool, where docker's dynamic assignment
belongs — while the proxy itself sits at `10.99.0.2`, below it. The guarantee is now a reading.

**What the pair above does to the decision.** It does not overturn the fixed address; it makes
**#20 a hard precondition rather than an ordering preference**, on two of two combinations measured and
by two unrelated mechanisms. And it exposes a coupling that no document has yet named: #20 makes the
binding a *variable*, `SYSTEM_BIND_ADDRESS`, defaulting to `127.0.0.1` and openable. An operator who
opens the port for a reason that has nothing to do with OpenClaw — reaching pgAdmin from a laptop —
would, once the identity rule is in, hand `operator.admin` to the LAN, silently, because the host
address the rule names is the address the LAN arrives as.

**So the rule cannot be written as a rule about an address alone.** The shape that fits this stack is
the one `lu_ip_in_cidr` already uses: a guard that refuses the combination. If `SYSTEM_BIND_ADDRESS` is
not a loopback address, either the start refuses, or nginx does not assert the identity at all and the
operator is told why. That is a computed answer where the alternative is an operator remembering that
two unrelated keys constrain each other — which is the thing this project does not rely on.

**That is the operator's decision and it is open.** It is written up for #15 rather than built.

**Not built in #9, #15 or #19** because it changes the stack's trust boundary rather than any of those
features, and every case for it has to be written against a live gateway.

Recorded 2026-09-30, direction decided the same day, corrected here 2026-10-02, second measurement
and the binding coupling added 2026-10-10.

---

## The toolbox image does not follow its own Dockerfile

Raised by the reviewer on 2026-09-30 as "not asked for", alongside the blocking finding it belongs to.
`update.sh` now removes the toolbox so an update replaces it (A8-27), and the git step refuses before the
teardown when the tools are missing (A8-24) — but the image still only changes when something removes
it.

The durable form is a label carrying a hash of `config/toolbox/Dockerfile` and `toolbox-entry.sh`. The
dashboard compares it to the image it finds and rebuilds when it differs, so the image follows its
recipe on every path — a checkout updated with `git pull`, an installer update, or a hand-built image.
That is the computed answer rather than the remembered rule: nothing has to know that this particular
update needs a rebuild.

Not built with the blocking fix because the two changes there are enough to merge, and this one touches
the dashboard's build path, which no case currently drives.

Recorded 2026-09-30.

---

## ~~A checker that cannot be opened is reported as a bundle that cannot link~~ — repaired

`config/nar_builder/build.sh:776` gates deployment on `[ -f "$NAR_CHECK" ] && [ -f "${LIQUID_INDEX}/lib-classes.txt" ]`.
Both tests stat. When `narcheck.py` is present but unreadable, the first test passes, `python3 "$NAR_CHECK"`
fails to open it, the non-zero status is read as a refusal, and the operator is told the bundle *"cannot link
against the NiFi API the running Liquid loads"* — a verdict about their code that nothing reached. The
interpreter's own `can't open file` line is printed below it, which is the only clue that no check ran.

The honest message already exists, in the `else` arm of the same test: it names `${NAR_CHECK}` or the index as
missing and refuses without deploying. So the fix is to make the guard answer the question the branch below it
assumes — that the checker can actually be run — rather than whether a directory entry exists. Reading the
first bytes, or running it with no arguments and requiring the usage text, both do that; so does inverting the
gate to treat any failure to *invoke* the checker as the missing-checker case, which keeps one honest message
for every way it can be unavailable.

Found 2026-10-16 while measuring `B7-5`'s four remaining scenarios on this branch, where it refused four builds
that had in fact succeeded. The cause there was a Docker Desktop `/host_mnt` placeholder left by moving a
worktree, which made a single-file bind mount stat-able but unreadable — a state no code of ours creates, and
exactly the reason the message matters: the stack said "your bundle cannot link" when the truth was "I could
not look".

Not fixed with the measurement because the measurement is what #25 is in review for, and this changes the gate
that decides what reaches Liquid's autoloader — the one place on this branch where a quick edit is the wrong
shape. It needs its own case: a negative control that makes the checker unreadable and reads the message.

**Repaired 2026-10-16**, same day, in `fix/narcheck-unavailable`. The gate now reads the checker
rather than stating it — `narcheck_available` in `config/nar_builder/build.sh` — and a checker it
cannot open takes the honest arm, which now says *"this is about the check, not about the code"*.
The repair also found a second instance of the same class: `narcheck` returns 1 both for a bundle
the index refuses and for anything it could not read, and the headline above it asserted the first
over whatever followed — including over its own words *"the index of what Liquid can load is not
readable"*. The headline now names both and lets the check give the reason. `B6-40`, seven
scenarios, each shown able to fail. *(Superseded on 2026-10-20: `check-index` answers 3 for an index
it cannot read, and the headline for status 1 is the specific one again — FR36a.)*

Recorded 2026-10-16.
