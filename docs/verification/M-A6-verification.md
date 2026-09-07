## M-A6 — independent verification

Run on the host with `./tests/verify/m-a6.sh` on 2026-09-03 14:32 CEST, following §9 of
`docs/TEST-SPEC-git-integration.md`. The script performs the same seven checks the section lists
for hand execution, judges each one, and restores everything it moved — including on `Ctrl-C`.

| Check | What it proves | Result |
|---|---|---|
| 1 | milestone suite green | **PASS** — EXIT=0 |
| 2 | no regression across earlier milestones | **PASS** — EXIT=0 |
| 3 | the sanctioned path publishes from inside the container | **PASS** — git-publish exited 0 and agent/probe is on the bare remote |
| 4 | a raw push is refused naming the command, and main for its policy | **PASS** — raw refusal names git-publish; main refused for 'protected'; remote untouched |
| 5 | the system case genuinely needs the container | **PASS** — red at EXIT=1, green again at EXIT=0 |
| 6 | the raw-push refusals are decided by the hook | **PASS** — hook aside: A6-12 A6-6 A6-8 A6-9 red, EXIT=1; hook back: EXIT=0 |
| 7 | the publishing cases are decided by the command | **PASS** — stub in place: A6-1 A6-11 A6-12 A6-2 A6-3 A6-4 A6-5 A6-7 A6-8 red, EXIT=1; content restored: EXIT=0 |

### Output

<details><summary>Check 1 — the milestone suite</summary>

```
(pass) A6-10 the project root does not point at the stack's shared hook [8.06ms]
(pass) A6-10 the project root carries no declaration, so no rule of this feature reads it [14.58ms]

tests/contract/m-a6.command-mounted.test.ts:
(pass) A6-12 the services that carry git-repo-info are the ones expected [0.22ms]
(pass) A6-12 every one of them mounts git-publish read-only at the same place on PATH [0.12ms]
(pass) A6-12 the command on disk is an executable POSIX shell script [0.19ms]

tests/contract/m-a6.refusal-next-step.test.ts:
(pass) A6-11 both sources are read and each contributes refusals [0.11ms]
(pass) A6-11 every refusal names a command, a branch form or an action [0.14ms]
(pass) A6-11 no refusal is a single line that ends at the refusal [0.02ms]

tests/system/m-a6.publish-in-container.test.ts:
(pass) the stack is running [33.34ms]
(pass) A6-12 git-publish is on PATH in openclaw-gateway, under that name [129.43ms]
(pass) A6-12 git-publish is on PATH in opencode, under that name [126.13ms]
(pass) A6-12 the write-capable clone is in place and governed by the hook [0.08ms]
(pass) A6-12 an agent publishes through the command, and the branch reaches the remote [504.43ms]
(pass) A6-12 a raw push from the same clone is refused and told to use the command [404.46ms]

 34 pass
 0 fail
 109 expect() calls
Ran 34 tests across 7 files. [10.52s]
```
</details>

<details><summary>Check 2 — the whole suite</summary>

```
(pass) renderEnv > substitutes values into a CRLF example and emits LF
(pass) formatValue > quotes when needed [0.05ms]
(pass) env-meta > classifies build-affecting keys [0.02ms]
(pass) env-meta > picks input widgets [0.04ms]
(pass) env-meta > collapse defaults: no collapsed sections; PER-IMAGE OVERRIDES subheading collapses [0.07ms]
(pass) env-meta > section descriptions: keyword match with first-sentence fallback [0.03ms]
(pass) env-meta > strips marker suffixes from display titles [0.12ms]
(pass) real .env.example > round-trips byte-identically [0.35ms]
(pass) real .env.example > finds the marked sections with their fields [0.39ms]
(pass) real .env.example > finds every KEY= line of the file as a field [0.47ms]

src/lib/server/project.test.ts:
(pass) app password > paths resolve under the project volumes dir [0.04ms]
(pass) app password > reads null when the file does not exist [0.13ms]
(pass) app password > writes the trimmed value with a trailing newline at mode 0600 [0.41ms]
(pass) app password > creates the directory when it is missing [0.53ms]
(pass) app password > reads back the trimmed value [0.15ms]
(pass) app password > reads null when the file holds only whitespace [0.18ms]
(pass) app password > reads null instead of throwing when the path is a directory [0.27ms]
(pass) app password > an in-place rewrite replaces the previous value [0.33ms]

 27 pass
 0 fail
 71 expect() calls
Ran 27 tests across 2 files. [27.00ms]
```
</details>

<details><summary>Check 3 — the sanctioned path, bypassing the suite</summary>

```
PUBLISH EXIT=0
To /repos/.a6-hand/beta.git
 * [new branch]      agent/probe -> agent/probe
published agent/probe to origin, at commit ed41b68.
  ed41b68  add probe note
Say what you published and where; whether it goes further is the operator's call.
ON REMOTE:   agent/probe
```
</details>

<details><summary>Check 4 — a raw push, and the rule order</summary>

```
RAW EXIT=1
pre-push refused: this push did not come through git-publish.
git-publish is the one way work leaves this stack: it reads the declaration, checks the branch namespace, scans the commits for credentials, and then pushes.
Run git-publish from this clone instead of git push, and report what it says.
error: failed to push some refs to '/repos/.a6-hand/beta.git'
MAIN EXIT=1
pre-push refused: main is the default branch here and this repository's policy is protected.
Push a feature branch instead: git switch -c <name>, then git push -u origin <name>.
Changing main is the operator's call — report what you have and ask.
error: failed to push some refs to '/repos/.a6-hand/beta.git'
REMOTE MAIN: seed
RAW ON REMOTE: 
```
</details>

<details><summary>Check 5 — negative control: the container</summary>

```
with openclaw-gateway stopped: EXIT=1
(fail) the stack is running [23.86ms]
(fail) A6-12 git-publish is on PATH in openclaw-gateway, under that name [92.98ms]
(fail) A6-12 the write-capable clone is in place and governed by the hook [0.79ms]
(fail) A6-12 an agent publishes through the command, and the branch reaches the remote [93.21ms]
(fail) A6-12 a raw push from the same clone is refused and told to use the command [94.52ms]
5 tests failed:
(fail) the stack is running [23.86ms]
(fail) A6-12 git-publish is on PATH in openclaw-gateway, under that name [92.98ms]

with it running again: EXIT=0
```
</details>

<details><summary>Check 6 — negative control: the hook</summary>

```
with both copies of the hook moved aside: EXIT=1, cases red: A6-12 A6-6 A6-8 A6-9 
Received: "To /var/folders/dh/s85twrf55h38892y77m0t8040000gn/T/lu-a6-guards-BfWQqR/beta.git\n ! [rejected]        agent/probe -> agent/probe (fetch first)\nerror: failed to push some refs to '/var/folders/dh/s85twrf55h38892y77m0t8040000gn/T/lu-a6-guards-BfWQqR/beta.git'\nhint: Updates were rejected because the remote contains work that you do not\nhint: have locally. This is usually caused by another repository pushing to\nhint: the same ref. If you want to integrate the remote changes, use\nhint: 'git pull' before pushing again.\nhint: See the 'Note about fast-forwards' in 'git push --help' for details.\ngit-publish: the push was not accepted, and nothing was published.\nThe message above says what refused it. Report it as it stands and ask the operator; do not look for another way through.\n"
(fail) a push the hook rejects is reported by git-publish, and spends no token [817.71ms]
(fail) A6-6 a raw push with no token is refused, and told what to run instead [351.22ms]
(fail) A6-8 a second push cannot ride on the token the first one consumed [572.54ms]
(fail) A6-9 a push to the protected default branch is refused for being that, not for its path [348.82ms]
(fail) A6-12 a raw push from the same clone is refused and told to use the command [405.36ms]
6 tests failed:
(fail) a push the hook rejects is reported by git-publish, and spends no token [817.71ms]
(fail) A6-6 a raw push with no token is refused, and told what to run instead [351.22ms]
(fail) A6-8 a second push cannot ride on the token the first one consumed [572.54ms]

with them restored: EXIT=0
```
</details>

<details><summary>Check 7 — negative control: the command</summary>

```
with the command truncated in place: EXIT=1, cases red: A6-1 A6-11 A6-12 A6-2 A6-3 A6-4 A6-5 A6-7 A6-8 
(fail) git-publish --help explains itself and exits 0 [255.48ms]
(fail) git-publish given more than a remote refuses and shows the usage [230.15ms]
(fail) git-publish outside a repository says so and names where repositories live [4.13ms]
(fail) git-publish on a detached HEAD refuses and names the branch to make [284.97ms]
(fail) git-publish pointed at a remote that does not exist names the command that answers [274.50ms]
(fail) git-publish in a clone declared read refuses before any branch rule [276.51ms]
(fail) git-publish in a clone carrying no declaration refuses and names git-repo-info [282.23ms]
(fail) git-publish with nothing new to send says so and exits 0 [273.79ms]
(fail) git-publish refuses a commit adding .env, naming the file [295.52ms]
(fail) a push the hook rejects is reported by git-publish, and spends no token [271.17ms]

with its content restored: EXIT=0
```
</details>

The full log of this run is in `.pr-drafts/M-A6-verification.log`.

Checks 4, 6 and 7 are where this milestone is actually decided. Check 4 runs the rule order by
hand: a push to `main` on a protected repository must be refused for **being that**, not for
the path it took, and if that message ever changes A4-3, A5-4 and A5-5 keep passing while
asserting nothing. Check 6 removes the hook and expects exactly the raw-push cases to go red;
check 7 replaces the command's **content** — truncated in place, never renamed, because the
single-file bind mount follows the inode and a rename would leave the container reading the old
file and the suite green for the wrong reason — and expects the publishing cases to go red.

---

## Still open, and with the operator

**A6-13** is manual, and it is the case this milestone exists to make possible. A5-10 was run
three times and observed nothing: over the branch rule an agent reads the declaration and
complies before the hook can run, which is correct behaviour and leaves nothing to watch. The
secret scan is announced by no declared value, so it cannot be pre-empted — the agent commits,
publishes, and is refused. What is observed is what it does next. The procedure, the verbatim
prompt and the pass/fail line are in §9 of the test specification.

**The pass and the fail leave the same remote state**, which is why this case records a
transcript rather than a verdict: removing the secret and saying so is the correct fix, and
removing it silently is the failure. §3.1 still stands — an agent running as root can write the
token file, edit the hook or remove it. M-A6 buys legibility, not security.
