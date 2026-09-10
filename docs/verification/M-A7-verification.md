## M-A7 — independent verification

Run on the host with `./tests/verify/m-a7.sh` on 2026-09-04 15:49 CEST, following §9 of
`docs/TEST-SPEC-git-integration.md`. The script performs the same eight checks the section lists
for hand execution, judges each one, and restores everything it changed — including on
`Ctrl-C`. It touches no `.env`, no GitHub remote and none of the operator's clones: the chain
builds its own throwaway declaration and local bare remotes, under `/repos/.a7-*`, and removes
them afterwards.

| Check | What it proves | Result |
|---|---|---|
| 1 | milestone suite green | **PASS** — EXIT=0 |
| 2 | no regression across earlier milestones | **PASS** — EXIT=0 |
| 3 | the chain reaches the remote from the agent's container | **PASS** — exit 0, agent/probe on e2e.git carrying 'add probe note', no token left |
| 4 | the chain stops where it should | **PASS** — non-zero exit, refusal names main and protected, remote still at seed |
| 5 | overlapping publications are safe or refuse, and leave no permission | **PASS** — 1 of 2 branches landed, 2 refusal(s) in words, no token left |
| 6 | the token cases are decided by the hook | **PASS** — stub in place: A7-3 A7-4 red, A7-1 and A7-2 green, EXIT=1; restored: EXIT=0 |
| 7 | every case in the milestone runs through git-publish | **PASS** — stub in place: A7-1 A7-2 A7-3 A7-4 red, EXIT=1; content restored: EXIT=0 |
| 8 | the suite is green again with the fixtures gone | **PASS** — EXIT=0, no .a7-* left in volumes/repos |

**One correction to check 5's wording, made after the run.** It reported "2 refusal(s)" beside "1 of 2
branches landed", which reads as three outcomes from two publications. The count was of *lines*
matching `refused`, and the hook's refusal occupies more than one; there was one publication accepted
and one refused. The evidence and the verdict are unaffected — the assertion requires at least one
refusal when fewer than two branches land, and that held — but the script now counts invocations
rather than lines, so the next run's summary says what happened. The same defect class as M-A6's
check 6, which printed every case id in the suite as having failed.

### Output

<details><summary>Check 1 — the milestone suite</summary>

```
(pass) A7-3 both publications succeed
(pass) A7-3 each remote holds its own commit and neither holds the other's [71.38ms]
(pass) A7-3 the two permissions are two paths, and neither outlives its publication [0.13ms]
(pass) A7-3 a permission in one clone admits nothing in the other [13.53ms]

tests/e2e/m-a7.chain-refused.test.ts:
(pass) the stack is running [33.00ms]
(pass) A7-2 the chain is arranged on the protected default branch [0.13ms]
(pass) A7-2 the publish is refused, naming the branch and the policy [0.06ms]
(pass) A7-2 the remote is exactly as the seed left it [0.04ms]
(pass) A7-2 a refused publish mints no permission [0.05ms]

tests/e2e/m-a7.chain.test.ts:
(pass) the stack is running [36.19ms]
(pass) A7-1 the start script clones the declared repository into the workspace [0.34ms]
(pass) A7-1 the clone it made carries the declaration, the hook and the identity [35.40ms]
(pass) A7-1 in the container the command, the hook and the key are all reachable [0.18ms]
(pass) A7-1 an agent commits and publishes, and the commit is on the remote [0.09ms]
(pass) A7-1 the commit on the remote carries the identity the stack configured [0.33ms]
(pass) A7-1 the permission the publish minted is gone once it returns [0.03ms]

 25 pass
 0 fail
 84 expect() calls
Ran 25 tests across 4 files. [8.90s]
```
</details>

<details><summary>Check 2 — the whole suite</summary>

```
(pass) renderEnv > substitutes values into a CRLF example and emits LF [0.09ms]
(pass) formatValue > quotes when needed [0.02ms]
(pass) env-meta > classifies build-affecting keys [0.04ms]
(pass) env-meta > picks input widgets [0.10ms]
(pass) env-meta > collapse defaults: no collapsed sections; PER-IMAGE OVERRIDES subheading collapses [0.03ms]
(pass) env-meta > section descriptions: keyword match with first-sentence fallback [0.14ms]
(pass) env-meta > strips marker suffixes from display titles [0.03ms]
(pass) real .env.example > round-trips byte-identically [0.51ms]
(pass) real .env.example > finds the marked sections with their fields [0.35ms]
(pass) real .env.example > finds every KEY= line of the file as a field [0.48ms]

src/lib/server/project.test.ts:
(pass) app password > paths resolve under the project volumes dir
(pass) app password > reads null when the file does not exist [0.14ms]
(pass) app password > writes the trimmed value with a trailing newline at mode 0600 [0.59ms]
(pass) app password > creates the directory when it is missing [0.37ms]
(pass) app password > reads back the trimmed value [0.10ms]
(pass) app password > reads null when the file holds only whitespace [0.07ms]
(pass) app password > reads null instead of throwing when the path is a directory [0.47ms]
(pass) app password > an in-place rewrite replaces the previous value [0.32ms]

 27 pass
 0 fail
 71 expect() calls
Ran 27 tests across 2 files. [29.00ms]
```
</details>

<details><summary>Check 3 — the chain by hand from the agent's container</summary>

```
HOOKSPATH: /git-secrets/hooks
PUBLISH EXIT=0
published agent/probe to origin, at commit 5910eab.
  5910eab  add probe note
Say what you published and where; whether it goes further is the operator's call.
ON REMOTE: add probe note
TOKEN: none
```
</details>

<details><summary>Check 4 — the same chain aimed at the default branch</summary>

```
PUBLISH EXIT=1
git-publish refused: main is the default branch here and this repository's policy is protected.
Publish from a branch of your own instead: git switch -c agent/<name>, then git-publish.
Changing main is the operator's call — report what you have and ask.
REMOTE MAIN: seed
REMOTE DIRECT: absent
```
</details>

<details><summary>Check 5 — two publications, overlapping, in one clone</summary>

```
PUBLISHED LINES: 1
P1: Say what you published and where; whether it goes further is the operator's call.
P2: The message above says what refused it. Report it as it stands and ask the operator; do not look for another way through.
REFUSALS: 2
BRANCHES: agent/probe agent/probe-1 
no token left
```
</details>

<details><summary>Check 6 — negative control: the hook</summary>

```
with the hook truncated to a permissive stub: EXIT=1, cases red: A7-3 A7-4 
(fail) A7-4 consuming a permission is a real event here: a push without one is refused [0.24ms]
(fail) A7-3 a permission in one clone admits nothing in the other [0.12ms]
2 tests failed:
(fail) A7-4 consuming a permission is a real event here: a push without one is refused [0.24ms]
(fail) A7-3 a permission in one clone admits nothing in the other [0.12ms]
 2 fail

with its content restored: EXIT=0
```
</details>

<details><summary>Check 7 — negative control: the command</summary>

```
with the command truncated in place: EXIT=1, cases red: A7-1 A7-2 A7-3 A7-4 
(fail) A7-4 the second publication began before the first had returned [0.92ms]
(fail) A7-4 every push that landed consumed a permission of its own [1.92ms]
(fail) A7-4 an invocation that was refused says what happened [0.70ms]
(fail) A7-3 the second publication began before the first had returned [0.20ms]
(fail) A7-3 both publications succeed [0.06ms]
(fail) A7-3 each remote holds its own commit and neither holds the other's [8.63ms]
(fail) A7-2 the publish is refused, naming the branch and the policy [0.30ms]
(fail) A7-1 an agent commits and publishes, and the commit is on the remote [0.12ms]
(fail) A7-1 the commit on the remote carries the identity the stack configured [0.06ms]
 9 fail

with its content restored: EXIT=0
```
</details>

<details><summary>Check 8 — cleanup, and the suite again</summary>

```
volumes/repos after cleanup: . .. agent-skills csv-columns liquidupstart 
(pass) app password > an in-place rewrite replaces the previous value [0.33ms]

 27 pass
 0 fail
 71 expect() calls
Ran 27 tests across 2 files. [30.00ms]
EXIT=0
```
</details>

The full log of this run is in `.pr-drafts/M-A7-verification.log`.

Check 5 is the one worth reading slowly. Two `git-publish` invocations overlap in one clone,
and the question is not whether both succeed — either outcome is acceptable — but whether a push
was admitted by a permission another invocation minted. The last line is the assertion that
matters: a token left behind after both have returned means one was written and never consumed,
which is the shape a stolen permission takes.

The two controls divide the milestone between the artefacts that decide it, and the lists were
derived from the sources before the run rather than read off it. **Check 6** makes the hook
permissive — truncated in place, never renamed, because it is bind-mounted as a single file and a
single-file mount follows the inode. A7-3 and A7-4 must go red, because each holds a probe that
requires a refusal; A7-1 and A7-2 must stay green, because the happy chain does not need the hook
to refuse anything and A7-2's refusal is `git-publish`'s own, decided before a push is
attempted. **Check 7** truncates the command, and all four must go red: every case in the
milestone publishes through it.
