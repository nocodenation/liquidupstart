#!/usr/bin/env bash
# Prove that a test can fail.
#
#   ./tests/mutate.sh                        every entry in tests/mutations.json
#   ./tests/mutate.sh --case A4-7            one entry
#   ./tests/mutate.sh --registry F --root D  against another registry and tree
#
# For each entry it makes the smallest edit to the SUBJECT that should break the
# rule the case protects, runs only the test file that owns the case, and
# requires the named test to go red. The subject is restored however the run
# ends.
#
# Outcomes: validated, refused, failed, unresolved. A green run is never a
# finding -- it is `unresolved`, a question for the author, and it needs a
# second mutation of a different shape before anything may be concluded from it.
#
# Why there are four outcomes rather than two, what each one costs, and what the
# 2026-09-19 sample measured: docs/PROCEDURE-mutation-control.md.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGISTRY="${ROOT}/tests/mutations.json"
ONLY=""
TIMEOUT_MS="${MUTATE_TIMEOUT_MS:-120000}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --registry) REGISTRY="$2"; shift 2 ;;
    --root)     ROOT="$2";     shift 2 ;;
    --case)     ONLY="$2";     shift 2 ;;
    --timeout)  TIMEOUT_MS="$2"; shift 2 ;;
    --gaps)     GAPS=1;        shift   ;;
    -h|--help)  sed -n '2,8p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "mutate: unknown argument: $1" >&2; exit 2 ;;
  esac
done

[[ -f "$REGISTRY" ]] || { echo "mutate: no registry at ${REGISTRY}" >&2; exit 2; }

# The registry's own coverage, which is the thing nobody notices going stale: a
# hundred validated entries say nothing while three hundred cases carry none. The
# gap is computed from the specifications rather than counted by hand, and a case
# id in the registry that no specification mentions is reported too -- it means a
# case was renamed or deleted and its entry outlived it.
if [[ "${GAPS:-0}" == "1" ]]; then
  # try/catch and an explicit exit, not an uncaught throw. In bun 1.3.13 a
  # program that calls require() runs as CJS, and an uncaught error there exits
  # **0 with no message** -- measured 2026-09-28. Every `|| exit` around a
  # `bun -e` in this file was therefore decorative.
  bun -e '
   try {
    const fs = require("fs"), path = require("path");
    const [registry, root] = process.argv.slice(1);
    const raw = JSON.parse(fs.readFileSync(registry, "utf8"));
    const entries = raw.map((e) => e.case);
    // An exemption is a registered decision, and the decision is the reason. It
    // was counted as covered and the reason never shown, so the one thing a
    // reader needs in order to disagree with it was the one thing --gaps hid.
    // Item 5 of the 2026-09-29 review of #17.
    const exempt = raw
      .filter((e) => typeof e.exempt === "string" && e.exempt !== "")
      .map((e) => [e.case, e.exempt]);
    const dir = path.join(root, "docs");
    const specs = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => /^TEST-SPEC-.*\.md$/.test(f)) : [];
    const ids = new Set();
    // First cells that look like a case id and are not counted. The pattern
    // below requires the id to end in digits, and a manual case does not:
    // `A16-M1` in TEST-SPEC-git-integration.md was neither counted nor listed,
    // so a reader comparing 299 against the registry had no way to know one row
    // had been passed over. Arguably right -- a manual check has nothing to
    // register -- but silence is the wrong way to be right. Reported rather than
    // counted, so the number keeps its meaning. The Minor of the 2026-10-01
    // re-review.
    const unmatched = new Set();
    for (const f of specs) {
      const body = fs.readFileSync(path.join(dir, f), "utf8");
      // An overview row: the id is the first cell, optionally bolded.
      // The loose shape has to be a superset of the counted one, or widening the
      // report narrows the count. The first attempt used `[A-Z][A-Z0-9]*-` and
      // dropped every id with a lowercase tail -- `A3e-1` and its kind -- which
      // took `specified` from 299 to 284 while claiming to report what it passed
      // over. Measured, which is the only reason it was noticed.
      for (const m of body.matchAll(/^\|\s*\*{0,2}([A-Z][A-Za-z0-9]*-[A-Za-z0-9]+)\*{0,2}\s*\|/gm)) {
        if (/^[A-Z]+[0-9]*[a-z]?-[0-9]+$/.test(m[1])) ids.add(m[1]);
        else unmatched.add(m[1] + " (" + f + ")");
      }
    }
    const missing = [...ids].filter((i) => !entries.includes(i)).sort();
    const orphan = entries.filter((e) => !ids.has(e)).sort();
    console.log(`specified=${ids.size} registered=${entries.length} missing=${missing.length} orphaned=${orphan.length} exempt=${exempt.length}`);
    if (missing.length) console.log("missing:  " + missing.join(" "));
    if (orphan.length) console.log("orphaned: " + orphan.join(" "));
    if (unmatched.size) console.log("not counted, their ids are not of the registered shape: " + [...unmatched].sort().join(" "));
    for (const [id, reason] of exempt) console.log(`exempt:   ${id}  ${reason}`);
    if (!specs.length) { console.error("no TEST-SPEC-*.md under " + dir + ": nothing to compare against"); process.exit(2); }
    // An orphan is an entry whose case no specification mentions any more: it was
    // renamed or deleted and the entry outlived it. That is a registry saying it
    // covers something that is not there, so it is an error rather than a line in
    // a report nobody reads. Missing entries are not -- a gap is the ordinary
    // state of a registry being filled in.
    if (orphan.length) {
      console.error(`${orphan.length} registered case(s) are in no TEST-SPEC: renamed, deleted, or misspelt`);
      process.exit(1);
    }
   } catch (e) { console.error("mutate --gaps: " + (e && e.message ? e.message : e)); process.exit(2); }
  ' "$REGISTRY" "$ROOT" || exit $?
  exit 0
fi

# The registry is JSON because a reviewer reads it; the orchestration is bash
# because that is where the restore trap lives. bun does the parsing -- the suite
# already requires it, so this adds no dependency.
rows="$(bun -e '
 try {
  const fs = require("fs");
  const rows = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!Array.isArray(rows)) { console.error("registry is not a list"); process.exit(2); }
  const clean = (v) => typeof v === "string" && v !== "" && !/[\t\n]/.test(v);
  for (const r of rows) {
    // An exemption is a registered decision, not a missing entry: an assertion
    // about an artefact already on disk cannot have a mutation, because changing
    // the code that produced it changes nothing about the file. A3-3 reads
    // volumes/_git-secrets/known_hosts, and the keyscan that wrote it ran days
    // ago.
    //
    // It goes through the same checks as everything else. The first version
    // returned before them, so a newline in the reason produced a phantom entry
    // ("REFUSED written days ago no such subject:"), an empty case gave
    // "REFUSED - no such subject: -", and an entry carrying both an exemption and
    // a mutation was silently exempted with its mutation never run. Item 4 of the
    // 2026-09-29 review of #17.
    const exempt = typeof r.exempt === "string" && r.exempt !== "";
    if (exempt) {
      if (!clean(r.case)) {
        console.error(`an exempt entry has no usable case id`); process.exit(2);
      }
      if (/[\t\n]/.test(r.exempt)) {
        console.error(`entry ${r.case} has a tab or newline in its exempt reason`); process.exit(2);
      }
      // Both is a contradiction, and silently honouring one of them is how a
      // mutation stops running without anyone deciding that.
      const alsoMutates = ["file", "spec", "from", "to", "mustFail"].some(
        (k) => typeof r[k] === "string" && r[k] !== ""
      );
      if (alsoMutates) {
        console.error(`entry ${r.case} is exempt and also carries a mutation: pick one`); process.exit(2);
      }
      console.log(["exempt", r.case, "-", "-", ".", ".", "false", r.exempt].join("\t"));
      continue;
    }
    if (r.exempt !== undefined && !exempt) {
      console.error(`entry ${r.case ?? "?"} has an empty exempt: give the reason, or remove the field`);
      process.exit(2);
    }
    for (const k of ["case", "file", "spec", "from", "to", "mustFail"]) {
      if (typeof r[k] !== "string") {
        console.error(`entry ${r.case ?? "?"} has no ${k}`); process.exit(2);
      }
    }
    // from/to travel base64-encoded: tab and newline are the record separators
    // here, and a mutation may legitimately span lines.
    for (const k of ["case", "file", "spec"]) {
      if (r[k] === "") { console.error(`entry ${r.case || "?"} has an empty ${k}`); process.exit(2); }
    }
    const ids = [r.case, r.file, r.spec, r.mustFail];
    if (ids.some((v) => /[\t\n]/.test(v))) {
      console.error(`entry ${r.case} has a tab or newline in a name or a path`); process.exit(2);
    }
    // An empty `from` has nothing to find, and indexOf("") answers 0 forever.
    if (r.from === "") { console.error(`entry ${r.case} has an empty from`); process.exit(2); }
    if (r.mustFail === "") { console.error(`entry ${r.case} has an empty mustFail`); process.exit(2); }
    // A leading dot so no field is ever empty on the wire: tab is IFS
    // whitespace, and bash collapses a run of it into one delimiter, which
    // shifts every later field. PROCEDURE-mutation-control.md, "the wire format".
    if (r.all !== undefined && typeof r.all !== "boolean") {
      console.error(`entry ${r.case} has a non-boolean all`); process.exit(2);
    }
    const b64 = (s) => "." + Buffer.from(s, "utf8").toString("base64");
    // The first column says which shape the row is. The runner on #17 overloaded
    // the `all` column to carry "exempt" as well, which is the same conflation
    // that produced the shifted-field defect the leading dot exists for.
    //
    // No apostrophes anywhere in this program: it is one single-quoted bash
    // string, and one of them ends it.
    console.log(["mutate", r.case, r.file, r.spec, b64(r.from), b64(r.to),
                 r.all === true ? "true" : "false", r.mustFail].join("\t"));
  }
  } catch (e) { console.error("registry: " + (e && e.message ? e.message : e)); process.exit(2); }
' "$REGISTRY")" || exit 2

SUBJECT=""      # the file currently mutated, for the trap
BACKUP=""
# The run's machine-readable record. One path for the whole run, made here
# rather than inside run_spec: run_spec is called in a command substitution, so
# an assignment there happens in a subshell and never reaches the caller -- the
# reader then found no file and refused every entry as "did not run".
JUNIT="$(mktemp "${TMPDIR:-/tmp}/lu-mutate-junit.XXXXXX")"
# Written by run_spec when it had to stop the run. A file rather than a variable,
# for the same reason JUNIT is a fixed path: run_spec is called in a command
# substitution, so an assignment there never reaches the caller.
TIMED_OUT="${JUNIT}.timedout"
RUN_OUT="${JUNIT}.out"
# The backup goes only after the copy back has succeeded. cp can fail with the
# subject already truncated -- a full disk, a read-only mount, a parent replaced
# mid-run -- and deleting it anyway leaves the tracked file broken with nothing
# to put back.
restore() {
  # A backup exists from the moment it is taken, and SUBJECT is set only after
  # the baseline has run -- so a signal during the baseline left the copy in
  # TMPDIR for ever. Measured at 0018c6d: TERM while the unmutated spec ran gives
  # exit 143, the subject untouched, and `lu-mutate.XXXXXX` still there. Nothing
  # was mutated, so there is nothing to put back and the copy is simply rubbish.
  # Finding 8 of the third re-review.
  if [[ -z "$SUBJECT" && -n "$BACKUP" ]]; then
    rm -f "$BACKUP"; BACKUP=""
    return
  fi
  if [[ -n "$SUBJECT" && -n "$BACKUP" && -f "$BACKUP" ]]; then
    if cp "$BACKUP" "$SUBJECT"; then
      rm -f "$BACKUP"
    else
      echo "mutate: could not restore ${SUBJECT}; the backup is kept at ${BACKUP}" >&2
      RESTORE_FAILED=1
    fi
    SUBJECT=""; BACKUP=""
  fi
}
RESTORE_FAILED=0
# Each signal restores and then exits: bash resumes past an INT handler, so a
# trap that only restores does not hold on Ctrl-C.
# A signal stops the run rather than being noted and ignored. The child goes
# first, or bash waits for it before running the handler; then the subject goes
# back and nothing is reported, because an interrupted run reached no verdict.
interrupted() {  # interrupted <status> <name>
  [[ -n "$CHILD_PID" ]] && kill -TERM "$CHILD_PID" 2>/dev/null
  restore
  rm -f "$JUNIT" "$TIMED_OUT" "$RUN_OUT"
  echo "mutate: stopped by ${2}; no entry was judged past this point, and the subject is back." >&2
  exit "$1"
}
trap 'restore; rm -f "$JUNIT" "$TIMED_OUT" "$RUN_OUT"' EXIT
trap 'interrupted 130 SIGINT' INT
trap 'interrupted 143 SIGTERM' TERM

# `./` matters: a bare path is a substring filter over every test file under
# ROOT, so a sibling `x.test.tsx` was counted into the tally of `x.test.ts` and
# each run scanned the whole repository including volumes/. And colour off,
# because ANSI codes break both the `(fail)` scan and the tally regexes -- with
# FORCE_COLOR in the environment every entry came back REFUSED 0/0.
# The run, and a machine-readable record of it beside the human one.
#
# JUNIT is where the per-test result comes from, because the console is not the
# same for everybody.
#
# **Corrected 2026-10-01.** This said bun 1.3.13 names a test on its own line only
# when it FAILS while 1.4.2 also prints `(pass)`. Both versions do both. What
# differs is whether the shell looks like an agent: with CLAUDECODE set, either
# version prints the failing line alone. The original measurement ran 1.3.13 in an
# agent shell and 1.4.2 in a container without it, so the cause was confounded and
# the conclusion attributed to the version. Finding 4 of the 2026-09-30 review.
#
# The real reason is the better one: the same machine gives a person and an agent
# different consoles, and that does not expire with the next release. The record is
# written identically for both. `--reporter=junit` names every case exactly, with a
# <failure> child for the red ones and a <skipped> child for the ones that did not
# run. Item 3 of the 2026-09-29 re-review; MU-45 holds the measurement.
#
# What `mustFail` may name: a test, a describe path joined by " > ", or a describe
# whose tests it stands for. See named_state.

# The whole run is bounded, not only each test in it.
#
# bun --timeout ends a test that awaits too long; it cannot end one that never
# yields. A mutation that turns a fetch into `while (true) {}` hung the runner for
# ever -- and an async hang came back VALIDATED, because bun reddened the test and
# the run carried on. Either way the budget was a promise the tool did not keep.
# Item 6 of the 2026-09-29 review of #17, specified as MU-10 and never built.
#
# Not `timeout(1)`: macOS ships none, and this runs on the operator machine as
# well as in the image. A background child plus a polled deadline needs nothing
# but bash.
#
# The verdict is REFUSED. A run that did not finish measured nothing, which is
# what refused means here -- and `failed` means something else: the named test
# passed and the entry protects something other than it.
RUN_BUDGET_MS="${MUTATE_RUN_BUDGET_MS:-300000}"
# Checked, because every way of getting it wrong failed differently and two of
# them failed silently. Measured at 0018c6d: `5m` gave an arithmetic error on
# every poll, no bound at all, and the entry still printed VALIDATED with exit 0;
# `abc` killed the runner with `unbound variable` and no report, leaving
# lu-mutate.XXXXXX and lu-mutate-junit.XXXXXX behind; `0` refused every entry,
# which is at least visible. Finding 4 of the third re-review.
#
# `exit 2` rather than a refusal: a setting the caller got wrong is not a verdict
# about an entry, and the other bad-input paths in this script exit 2 as well.
case "$RUN_BUDGET_MS" in
  ''|*[!0-9]*)
    echo "mutate: MUTATE_RUN_BUDGET_MS is milliseconds, a whole number above zero -- got '${RUN_BUDGET_MS}'" >&2
    exit 2 ;;
esac
if (( RUN_BUDGET_MS <= 0 )); then
  echo "mutate: MUTATE_RUN_BUDGET_MS is milliseconds, a whole number above zero -- got '${RUN_BUDGET_MS}'" >&2
  exit 2
fi

# It leaves its output in RUN_OUT rather than printing it, and the caller reads
# that file.
#
# The reason is the trap. `out="$(run_spec ...)"` put the whole run inside a
# command substitution, and bash defers a trap until the current foreground
# command completes -- so a SIGINT sent to the runner was acted on only after the
# run had finished by itself. Measured 2026-09-30 by carrying out MU-6s interrupt
# half as the manual check it is: `kill -INT` while the mutated subject was on
# disk, and the run carried on for its full 41 seconds and then reported
# VALIDATED. The subject came back, because the ordinary path restored it -- and
# the verdict was one the run had not earned. Ctrl-C in a terminal was never
# affected: that signals the whole foreground process group, so bun dies and the
# substitution ends. A signal sent to the script alone -- which is what a
# supervisor or a task runner does -- was.
#
# With the loop in the parent shell a trap fires within one poll, and CHILD_PID
# lets the handler take bun with it.
CHILD_PID=""

run_spec() {  # run_spec <spec>; output lands in RUN_OUT
  # Removed first, so a run that writes nothing cannot be read as the previous
  # run's result.
  rm -f "$JUNIT" "$TIMED_OUT" "$RUN_OUT"
  # `exec`, so that CHILD_PID is bun's pid and not the subshell's.
  #
  # Without it the budget and the handler stopped the wrapping subshell and bun
  # ran on: measured at 0018c6d, a mutation that makes the named test spin gives
  # `REFUSED ... did not finish within 3000ms`, the subject restored, and
  # `bun test` still at 98.7% CPU five seconds later. The suite's own MU-37 and
  # MU-39 left three such processes behind on every run. Worse, the orphan still
  # holds --reporter-outfile and **writes the record after the handler removed
  # it**: `lu-mutate-junit.XXXXXX` reappeared in TMPDIR eight seconds after the
  # runner had gone, and that file is where every later entry reads its verdict.
  # So "takes bun with it" was simply false. Finding 2 of the third re-review.
  #
  # The assignments are exported rather than prefixed: `exec` replaces the shell,
  # and a prefix on a special builtin is not the same thing.
  #
  # What this still does not reach is a process the spec itself started -- that
  # needs a process group, and it is in BACKLOG.md rather than here.
  (cd "$ROOT" && export FORCE_COLOR=0 NO_COLOR=1 \
     && exec bun test --timeout "$TIMEOUT_MS" \
      --reporter=junit --reporter-outfile="$JUNIT" "./$1" >"$RUN_OUT" 2>&1) &
  CHILD_PID=$!
  local waited=0
  while kill -0 "$CHILD_PID" 2>/dev/null; do
    if (( waited >= RUN_BUDGET_MS )); then
      # TERM first, then KILL: bun writes the report on the way out when it can,
      # and a killed run with no report is harder to explain than a stopped one.
      kill -TERM "$CHILD_PID" 2>/dev/null
      sleep 1
      kill -KILL "$CHILD_PID" 2>/dev/null
      : > "$TIMED_OUT"
      break
    fi
    sleep 0.1
    waited=$((waited + 100))
  done
  wait "$CHILD_PID" 2>/dev/null
  CHILD_PID=""
}

# `pass`, `fail` or `none` for the named test.
#
# The baseline used `bun test -t "$must"`, and -t is a regular expression
# matched anywhere in the full name -- so a name carrying `(`, `[`, `+` or `*`
# was refused as "did not run", and a sibling whose name merely contained the
# named one was run too, so a red sibling refused the entry. Escaping and
# anchoring does not settle it: -t matches the describe and test names joined by
# a space, so an anchored `field A is carried$` still admits `not field A is
# carried`. The record names them separately.
named_state() {  # named_state <name>
  [[ -f "$JUNIT" ]] || { printf none; return; }
  MUST="$1" bun -e '
   try {
    const fs = require("fs");
    const xml = fs.readFileSync(process.argv[1], "utf8");
    const want = process.env.MUST;
    const un = (s) => s.replace(/&quot;/g, String.fromCharCode(34)).replace(/&apos;/g, String.fromCharCode(39))
                       .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const attr = (tag, k) => {
      const m = tag.match(new RegExp("\\b" + k + "=\"([^\"]*)\""));
      return m ? un(m[1]) : "";
    };

    // The describe path comes from the nesting of <testsuite> elements, not from
    // classname. classname is innermost-first, and bun 1.3.13 escapes it twice --
    // `inner &amp;gt; outer` for what the console prints as `outer > inner` -- so
    // reading it made the verdict depend on which bun was installed, which is the
    // one thing this reader exists to avoid. The nesting is written the same way
    // by both and escaped once. Finding 2 of the 2026-09-30 review.
    //
    // The first <testsuite> is the file; its name is a path, not a describe.
    const stack = [];
    let depth = 0;
    let ran = 0, red = 0;
    const ids = new Set();

    const re = /<\/?(testsuite|testcase)\b([^>]*?)(\/?)>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const closing = m[0].startsWith("</");
      const kind = m[1];
      const tag = m[0];

      if (kind === "testsuite") {
        if (closing) { depth -= 1; if (depth >= 1) stack.pop(); }
        else { depth += 1; if (depth >= 2) stack.push(attr(tag, "name")); }
        continue;
      }
      if (closing) continue;

      const name = attr(tag, "name");
      const segs = stack.slice();
      const path = segs.join(" > ");
      const full = path ? path + " > " + name : name;

      // A case in this project is often a describe block whose tests are
      // generated in a loop, so a block name stands for every test under it:
      // red if any is red, not run if none ran. Segments are compared whole, so
      // MU-27 still holds -- a name is never matched by part of another.
      // Finding 5.
      // Which *thing* the name resolved to, not merely whether it matched.
      //
      // The predicate below used to be a plain OR, and "red if any is red" then
      // credited whichever test happened to redden. Measured at 0018c6d with a
      // spec holding two blocks, policy and mode, each containing a test named
      // "rejects a bad value": an entry meaning the
      // policy test, mutating MODE, printed
      // `VALIDATED FX-1  rejects a bad value  (1 red, 2 green)` and exit 0 while
      // the policy test stayed green. A false VALIDATED is the one thing this
      // tool must not produce. Finding 1 of the third re-review.
      //
      // The runner already refuses a `from` that occurs twice, because nobody
      // can say which occurrence carried the rule. This is that same ambiguity
      // on the other side, so it gets the same answer: collect what the name
      // resolved to and let the caller refuse when it is more than one thing.
      //
      // A leaf match is identified by its describe chain, so the same test name
      // under two different blocks is two things. A block match is identified by
      // the block name, so a describe standing for twenty generated tests stays
      // one thing -- which is the case this predicate was widened for.
      let identity = "";
      if (name === want || full === want) identity = "test@" + path;
      else if (path === want || segs.includes(want) || (path !== "" && path.startsWith(want + " > "))) {
        identity = "block@" + want;
      } else continue;
      ids.add(identity);

      const body = m[3] === "/"
        ? ""
        : (() => {
            const at = xml.indexOf("</testcase>", re.lastIndex);
            return at === -1 ? xml.slice(re.lastIndex) : xml.slice(re.lastIndex, at);
          })();

      // A skipped test did not run, and reading it as green let test.skip,
      // test.todo, test.if(false) and everything under describe.skip pass the
      // baseline -- finding 8 of the first review again, for the variant the
      // refusal message itself names. Finding 1.
      if (/<skipped\b/.test(body)) continue;

      ran += 1;
      if (/<(failure|error)\b/.test(body)) red += 1;
    }

    console.log(ids.size > 1 ? "ambiguous" : red > 0 ? "fail" : ran > 0 ? "pass" : "none");
   } catch (e) { console.error("junit: " + (e && e.message ? e.message : e)); process.exit(2); }
  ' "$JUNIT" 2>/dev/null || printf none
}

# How many tests ran and how many reddened, from the record rather than from the
# console.
#
# `tally` reads bun summary lines out of combined stdout and stderr, and a test
# can print one. Measured at 0018c6d: a two-test spec where both redden under the
# mutation -- the broken-file condition -- with one test doing
# `console.log(" 3 pass")` printed `VALIDATED ... (2 red, 3 green)` instead of the
# refusal. A false VALIDATED, from a line the subject under test chose.
# Finding 6 of the third re-review.
#
# The record cannot be written by the spec. It carries the numbers directly:
# `<testsuites ... tests="2" failures="2" skipped="0">`, measured on bun 1.3.13.
# Skipped tests are taken off the total, because a skipped test did not run --
# the same rule named_state applies per test.
counts() {  # counts; prints "<ran> <red>"
  [[ -f "$JUNIT" ]] || { printf '0 0'; return; }
  bun -e '
   try {
    const fs = require("fs");
    const xml = fs.readFileSync(process.argv[1], "utf8");
    const m = xml.match(/<testsuites\b[^>]*>/);
    if (!m) { console.log("0 0"); process.exit(0); }
    const n = (k) => {
      const a = m[0].match(new RegExp("\\b" + k + "=\"([0-9]+)\""));
      return a ? parseInt(a[1], 10) : 0;
    };
    const ran = n("tests") - n("skipped");
    console.log((ran < 0 ? 0 : ran) + " " + n("failures"));
   } catch (e) { console.log("0 0"); }
  ' "$JUNIT" 2>/dev/null || printf '0 0'
}

# Where a path leads, after every link on it.
#
# The shape checks above are lexical, on the string the registry carries, and a
# link needs none of them: measured at 0018c6d with `alias.sh -> spec/a.test.ts`
# and `file: "alias.sh"`, the runner rewrote the assertion inside the test file
# and printed VALIDATED -- the redness it credited was the test's own source
# being edited. A directory link, `lnk/helper.ts -> tests/lib`, passed the same
# way. MU-9, MU-21 and MU-28 claim that property holds. Finding 5 of the third
# re-review.
#
# `readlink` in a loop rather than `realpath -f` or `readlink -f`: neither is
# portable to the BSD userland this project already tripped over once, and the
# comment on the lexical normaliser above says why. The directory part is
# resolved by `cd`+`pwd -P`, which also catches the directory-link case, where
# the final component is not a link at all.
resolve_path() {  # resolve_path <path>; prints it with every link followed
  local p="$1" n=0 t d
  while [[ -L "$p" && $n -lt 40 ]]; do
    t="$(readlink "$p")"
    case "$t" in
      /*) p="$t" ;;
      *)  p="$(dirname "$p")/$t" ;;
    esac
    n=$((n+1))
  done
  d="$(cd "$(dirname "$p")" 2>/dev/null && pwd -P)" || return 1
  [[ -n "$d" ]] || return 1
  printf '%s/%s' "$d" "$(basename "$p")"
}

# The names of the tests that reddened, for a message that can be acted on.
red_names() {  # red_names; prints the failing test names, comma separated
  [[ -f "$JUNIT" ]] || return 0
  bun -e '
   try {
    const fs = require("fs");
    const xml = fs.readFileSync(process.argv[1], "utf8");
    const un = (t) => t.replace(/&quot;/g, String.fromCharCode(34)).replace(/&apos;/g, String.fromCharCode(39))
                       .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const out = [];
    const re = /<testcase\b([^>]*?)(\/?)>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      if (m[2] === "/") continue;
      const at = xml.indexOf("</testcase>", re.lastIndex);
      const body = at === -1 ? xml.slice(re.lastIndex) : xml.slice(re.lastIndex, at);
      if (!/<(failure|error)\b/.test(body)) continue;
      const nm = m[1].match(/\bname="([^"]*)"/);
      if (nm) out.push(un(nm[1]));
    }
    console.log(out.join(", "));
   } catch (e) { }
  ' "$JUNIT" 2>/dev/null || true
}

tally() {  # tally <output> <word>
  printf '%s\n' "$1" | awk -v w="$2" '$0 ~ ("^ *[0-9]+ " w "$") { n += $1 } END { print n+0 }'
}

validated=0; failed=0; unresolved=0; refused=0; exempt=0
report=""

add() { report="${report}$1"$'\n'; }

while IFS=$'\t' read -r kind id file spec from to all must; do
  [[ -n "$id" ]] || continue
  [[ -z "$ONLY" || "$ONLY" == "$id" ]] || continue

  # A registered decision, not a missing entry, and it is reported as its own
  # outcome so a reader can tell the two apart in the tally.
  if [[ "$kind" == "exempt" ]]; then
    add "EXEMPT    ${id}  ${must}"
    exempt=$((exempt+1)); continue
  fi

  abs="${ROOT}/${file}"
  absspec="${ROOT}/${spec}"

  # The registry mutates subjects, never assertions. A tool that can rewrite the
  # tests can make anything pass.
  #
  # The rule is the file being a TEST, not living under tests/: a path may reach
  # one from anywhere, and tests/run.sh is a subject in its own right.
  # Normalised with the shell rather than realpath: BSD realpath has no
  # --relative-to, so the macOS fallback kept the raw path and a/../../x passed
  # the outside-the-repository check.
  norm="$(printf '%s' "$file" | awk -F/ '
    { n = 0
      for (i = 1; i <= NF; i++) {
        if ($i == "" || $i == ".") continue
        if ($i == "..") { if (n > 0) n--; else { print "OUTSIDE"; exit } ; continue }
        seg[++n] = $i
      }
      out = ""
      for (i = 1; i <= n; i++) out = out (i > 1 ? "/" : "") seg[i]
      print out }')"
  if [[ "$norm" == "OUTSIDE" || "$file" == /* ]]; then
    add "REFUSED   ${id}  its subject is outside the repository"; refused=$((refused+1)); continue
  fi
  case "$norm" in
    *.test.*|*.spec.*|*_test.*|*_spec.*|*.snap)
      add "REFUSED   ${id}  names a test file as its subject"; refused=$((refused+1)); continue ;;
    tests/lib/*|*/__snapshots__/*|tests/mutations.json|tests/mutate.sh)
      add "REFUSED   ${id}  names test infrastructure as its subject: assertions read it"
      refused=$((refused+1)); continue ;;
  esac

  if [[ ! -f "$abs" ]]; then
    add "REFUSED   ${id}  no such subject: ${file}"; refused=$((refused+1)); continue
  fi
  if [[ ! -f "$absspec" ]]; then
    add "REFUSED   ${id}  no such test file: ${spec}"; refused=$((refused+1)); continue
  fi

  # The same two refusals, against the resolved path. Lower-cased as well,
  # because the patterns are case-sensitive and this project's own development
  # machine has a case-insensitive filesystem: `X.TEST.ts` reached the same file
  # and matched none of them. The reviewer named that half as reasoned rather
  # than run; it is run here.
  if ! lead="$(resolve_path "$abs")"; then
    add "REFUSED   ${id}  could not resolve where ${file} leads"; refused=$((refused+1)); continue
  fi
  root_p="$(cd "$ROOT" && pwd -P)"
  case "${lead}/" in
    "${root_p}"/*) rel="${lead#"${root_p}/"}" ;;
    *)
      add "REFUSED   ${id}  ${file} leads to ${lead}, which is outside the repository"
      refused=$((refused+1)); continue ;;
  esac
  rel_lc="$(printf '%s' "$rel" | tr '[:upper:]' '[:lower:]')"
  case "$rel_lc" in
    *.test.*|*.spec.*|*_test.*|*_spec.*|*.snap)
      add "REFUSED   ${id}  ${file} leads to ${rel}, which is a test file"
      refused=$((refused+1)); continue ;;
    tests/lib/*|*/__snapshots__/*|tests/mutations.json|tests/mutate.sh)
      add "REFUSED   ${id}  ${file} leads to ${rel}, which is test infrastructure: assertions read it"
      refused=$((refused+1)); continue ;;
  esac

  # Restoration works by putting back what was there, so it cannot run over
  # somebody else's uncommitted work -- "restore" would mean "discard it".
  if git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1 \
     && git -C "$ROOT" ls-files --error-unmatch -- "$file" >/dev/null 2>&1 \
     && [[ -n "$(git -C "$ROOT" status --porcelain -- "$file")" ]]; then
    add "REFUSED   ${id}  ${file} has uncommitted changes"; refused=$((refused+1)); continue
  fi

  # Exactly once, or the experiment is not controlled: none means the subject
  # moved and the mutation describes something that no longer exists; more than
  # one means we cannot say which occurrence carried the rule.
  hits="$(FROM="$from" bun -e '
    const fs = require("fs");
    const body = fs.readFileSync(process.argv[1], "utf8");
    const needle = Buffer.from(process.env.FROM.slice(1), "base64").toString("utf8");
    // Advanced by one, not by the needle: `aa` occurs twice in `aaa`, and
    // "exactly one site" has to mean exactly one.
    let n = 0, i = 0;
    while ((i = body.indexOf(needle, i)) !== -1) { n++; i += 1; }
    console.log(String(n));
  ' "$abs")"
  if [[ ! "$hits" =~ ^[0-9]+$ ]]; then
    add "REFUSED   ${id}  could not count occurrences in ${file}"; refused=$((refused+1)); continue
  fi
  if [[ "$hits" == "0" ]]; then
    add "REFUSED   ${id}  its 'from' is not in ${file} -- the subject moved"; refused=$((refused+1)); continue
  fi
  # A `from` that occurs more than once is refused unless the entry says every
  # occurrence is meant. It is a declaration rather than a loosening: the reason a
  # second occurrence is usually a mistake is that the author had one in mind, and
  # `"all": true` is where they say otherwise. A3c-8 needs it -- the same mount
  # line appears in compose.yml once per agent service, and the case requires all
  # three.
  if [[ "$hits" != "1" && "$all" != "true" ]]; then
    add "REFUSED   ${id}  its 'from' occurs ${hits} times in ${file}; set \"all\": true if every one is meant"
    refused=$((refused+1)); continue
  fi

  # No backup, no mutation. There is no `set -e` here on purpose, so every step
  # of taking one has to be checked where it happens.
  # An explicit template: a bare `mktemp` on macOS ignores TMPDIR, which puts the
  # backup where no case can look, and the name says who left one behind.
  if ! BACKUP="$(mktemp "${TMPDIR:-/tmp}/lu-mutate.XXXXXX" 2>/dev/null)" || [[ -z "$BACKUP" ]] || ! cp "$abs" "$BACKUP"; then
    [[ -n "$BACKUP" ]] && rm -f "$BACKUP"
    BACKUP=""
    add "REFUSED   ${id}  could not back ${file} up, so it was not touched"
    refused=$((refused+1)); continue
  fi
  # The baseline. Without it a test that is already red -- a stack that is down,
  # a timeout, a flake -- is attributed to the mutation, and any edit at all
  # reads as VALIDATED. The whole spec runs and the record is read per test, so
  # the baseline answers three questions at once: does the named test exist, did
  # it run, was it green.
  run_spec "$spec"
  base="$(cat "$RUN_OUT" 2>/dev/null)"
  if [[ -f "$TIMED_OUT" ]]; then
    rm -f "$BACKUP"; BACKUP=""
    add "REFUSED   ${id}  ${spec} did not finish within ${RUN_BUDGET_MS}ms unmutated -- nothing was measured"
    refused=$((refused+1)); continue
  fi
  # A spec that threw at import has the same tally to read before the mutation as
  # after it, and without reading it the baseline reported the named test as
  # renamed or misspelt -- which sends the author looking at the name instead of
  # at the error. Seen once in roughly twenty runs of A12-1, whose spec does its
  # work at load time; staged deterministically with a spec that throws at import.
  # Finding 6 of the 2026-09-30 review.
  base_errors="$(tally "$base" error)"
  # Corroborated by the record, for the reason the mutated run's check is: a test
  # that prints a line shaped like bun's summary had its entry refused as "did
  # not load before the mutation" -- measured at 0018c6d with a spec doing
  # `console.log(" 1 error")`. A baseline that really did not load ran nothing.
  read -r base_ran _ <<<"$(counts)"
  if [[ "$base_errors" != "0" && "$base_ran" == "0" ]]; then
    rm -f "$BACKUP"; BACKUP=""
    add "REFUSED   ${id}  ${spec} did not load before the mutation -- ${base_errors} error(s), so the baseline measured nothing"
    refused=$((refused+1)); continue
  fi

  case "$(named_state "$must")" in
    fail)
      rm -f "$BACKUP"; BACKUP=""
      add "REFUSED   ${id}  '${must}' is already red before the mutation"
      refused=$((refused+1)); continue ;;
    none)
      rm -f "$BACKUP"; BACKUP=""
      add "REFUSED   ${id}  '${must}' did not run in ${spec} -- renamed, skipped, or misspelt"
      refused=$((refused+1)); continue ;;
    ambiguous)
      rm -f "$BACKUP"; BACKUP=""
      add "REFUSED   ${id}  '${must}' resolves to more than one test in ${spec}; name it in full, as 'describe > test'"
      refused=$((refused+1)); continue ;;
  esac

  # A red sibling before the mutation, and the same answer the named test gets.
  #
  # The baseline ran the whole spec and kept only the named test's state, so
  # anything else that was red went unnoticed and the count after the mutation
  # carried it. Measured at 0018c6d: a spec with one unrelated red test and a
  # mutation on a line nothing asserts gave
  # `FAILED ... 1 test(s) red but not 'the policy is protected'` -- nothing
  # reddened, so by this tool's own definition that is unresolved, not failed.
  # And a spec whose other test was already red, with a correct mutation, gave
  # `REFUSED ... every test ... failed -- that is a broken file`, which blames the
  # mutation for a file that was broken beforehand. Both failed safe and both
  # stated the wrong reason. Finding 3 of the third re-review.
  #
  # The rule is the one already applied to the named test one case up: a control
  # means "everything green except what the mutation reddens", so a baseline that
  # is red anywhere measured nothing. It names the tests rather than counting
  # them, because a count sends the author looking.
  read -r _ base_red <<<"$(counts)"
  if [[ "$base_red" != "0" ]]; then
    rm -f "$BACKUP"; BACKUP=""
    add "REFUSED   ${id}  ${spec} is already red before the mutation: ${base_red} test(s) -- $(red_names)"
    refused=$((refused+1)); continue
  fi

  SUBJECT="$abs"
  FROM="$from" TO="$to" ALL="$all" bun -e '
   try {
    const fs = require("fs");
    const p = process.argv[1];
    const d = (s) => Buffer.from(s.slice(1), "base64").toString("utf8");
    const body = fs.readFileSync(p, "utf8");
    // Not a regular expression: `$&` and friends in a replacement string would
    // be interpreted, and a subject full of shell variables is exactly where
    // that bites. split/join for the same reason -- replaceAll with a string
    // needle is literal, but the replacement still honours those escapes.
    const needle = d(process.env.FROM);
    const to = d(process.env.TO);
    if (process.env.ALL === "true") {
      fs.writeFileSync(p, body.split(needle).join(to));
    } else {
      const at = body.indexOf(needle);
      fs.writeFileSync(p, body.slice(0, at) + to + body.slice(at + needle.length));
    }
   } catch (e) { console.error("write: " + (e && e.message ? e.message : e)); process.exit(2); }
  ' "$abs" || true

  # The write is verified, not assumed. A read-only subject or a bun that dies
  # mid-write left the file untouched, the spec ran against the original, and
  # the result was UNRESOLVED -- or VALIDATED, once the baseline was missing too.
  # cmp answers 0 for identical, 1 for different and **2 for trouble** -- a file
  # it cannot open, which is what a spec that deletes its own subject leaves. Only
  # 0 refused, so trouble read as "the mutation reached it" and the run went on
  # against no mutation at all. Anything but 1 is a refusal. Finding 3 of the
  # 2026-09-30 review, and the line above it already claimed the write was
  # verified rather than assumed.
  cmp -s "$abs" "$BACKUP"; cmp_status=$?
  if [[ "$cmp_status" != "1" ]]; then
    add "REFUSED   ${id}  the mutation did not reach ${file}"; refused=$((refused+1)); restore; continue
  fi

  run_spec "$spec"
  out="$(cat "$RUN_OUT" 2>/dev/null)"
  timed_out=""
  [[ -f "$TIMED_OUT" ]] && timed_out=1
  restore

  # A run the budget had to stop answered nothing, whatever bun managed to write
  # before it went. The subject is already back -- `restore` above, and the traps
  # if this is interrupted -- which is MU-10s other half.
  if [[ -n "$timed_out" ]]; then
    add "REFUSED   ${id}  ${spec} did not finish within ${RUN_BUDGET_MS}ms under the mutation -- the mutation may have made it hang, and a run that did not finish is not a result"
    refused=$((refused+1)); continue
  fi

  # The named test's own verdict, by exact name. Survivors are counted from the
  # tally below, which is a summary line both bun versions print.
  named_failed=0
  [[ "$(named_state "$must")" == "fail" ]] && named_failed=1

  read -r ran red <<<"$(counts)"
  fails="$red"
  passes=$(( ran - red ))
  (( passes < 0 )) && passes=0
  errors="$(tally "$out" error)"

  # bun 1.4.2 reports an import-time throw as `0 pass / 1 fail / 1 error`, not
  # as an empty tally. The earlier comment claimed otherwise and MU-20 only
  # covered a file with no tests, so a spec the mutation broke at load time was
  # read as "the entry protects nothing". It did not run at all.
  # Corroborated, because `errors` still comes from the console and a test can
  # print a line shaped like bun's: at 0018c6d a test doing
  # `console.log(" 1 error")` had its entry refused as "did not load". A spec that
  # really did not load ran nothing, so the record agrees -- and when the record
  # shows tests, the console line is the subject talking.
  #
  # Not measured here: what bun 1.4.2 writes to the record for an import-time
  # throw. The comment below records that it reports `0 pass / 1 fail / 1 error`
  # on the console; on 1.3.13 it writes no record at all, which is what makes
  # `ran == 0` the right corroboration. Either way the entry is refused -- the
  # wording is what could differ, and the reviewer runs 1.4.2.
  if [[ "$errors" != "0" && "$ran" == "0" ]]; then
    add "REFUSED   ${id}  ${spec} did not load -- ${errors} error(s), so nothing was measured"
    refused=$((refused+1)); continue
  fi

  # A survivor is required only where one can exist: a file holding a single test
  # reddens entirely when that test reddens.
  total=$((passes + fails))
  survivor_needed=1
  [[ "$total" -le 1 ]] && survivor_needed=0

  # A tally of zero and zero means no test executed -- bun absent, bun crashing,
  # a filter matching nothing, or a spec the mutation broke at load time. A run
  # that could not run is never a result.
  if [[ "$total" == "0" ]]; then
    add "REFUSED   ${id}  no test executed in ${spec} -- the run did not happen, so it answered nothing"
    refused=$((refused+1)); continue
  fi

  if [[ "$fails" == "0" ]]; then
    add "UNRESOLVED ${id}  nothing went red -- needs a second mutation of another shape before this counts as a finding"
    unresolved=$((unresolved+1))
  elif [[ "$named_failed" == "1" && ( "$passes" -gt 0 || "$survivor_needed" == "0" ) ]]; then
    add "VALIDATED ${id}  ${must}  (${fails} red, ${passes} green)"
    validated=$((validated+1))
  elif [[ "$named_failed" == "1" ]]; then
    add "REFUSED   ${id}  every test in ${spec} failed -- that is a broken file, not a control"
    refused=$((refused+1))
  else
    add "FAILED    ${id}  ${fails} test(s) red but not '${must}'"
    failed=$((failed+1))
  fi
done <<< "$rows"

printf '%s' "$report"

# Four zeros and exit 0 is indistinguishable from a healthy run, so an empty
# registry says so and a --case matching nothing is an error.
seen=$((validated + failed + refused + unresolved + exempt))
if [[ -n "$ONLY" && "$seen" == "0" ]]; then
  echo "mutate: no entry for case ${ONLY} in ${REGISTRY}" >&2
  exit 2
fi
if [[ "$seen" == "0" ]]; then
  echo "registry is empty: nothing was validated, and that is not the same as everything passing."
fi

echo "validated=${validated} failed=${failed} refused=${refused} unresolved=${unresolved} exempt=${exempt}"

# Unresolved is deliberately not an error: making it one pushes authors towards
# a mutation that reddens something rather than the one that tests the rule.
if (( RESTORE_FAILED > 0 )); then
  echo "mutate: at least one subject could not be restored; see the message above." >&2
  exit 1
fi
if (( failed > 0 || refused > 0 )); then exit 1; fi
exit 0
