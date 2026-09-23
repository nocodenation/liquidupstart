#!/usr/bin/env bash
# Prove that a test can fail.
#
#   ./tests/mutate.sh                      every entry in tests/mutations.json
#   ./tests/mutate.sh --case A4-7          one entry
#   ./tests/mutate.sh --registry F --root D  against another registry and tree
#
# For each entry it makes the smallest edit to the SUBJECT that should break the
# rule the case protects, runs only the test file that owns the case, and
# requires the named test to go red. The subject is restored however the run
# ends.
#
# Why this exists: FEATURE-test-mutation.md. In short -- 543 cases pass and, until
# this runs, not one of them has been shown to be capable of failing. A case that
# would pass over any implementation is indistinguishable from one that protects
# something.
#
# The four outcomes, and why there are four rather than two:
#
#   validated   the named test failed and at least one test still passed
#   refused     EVERY test in the file failed -- a syntax error, not a control
#   failed      the named test passed; the entry does not protect what it claims
#   unresolved  nothing went red at all
#
# `unresolved` is the one that matters. A green run reads as "no case protects
# this rule", which is exactly the discovery this tool exists to make -- and in
# the sample of 2026-09-19 that reading was wrong four times out of thirteen,
# because the mutation was too narrow, landed at the wrong site, or replaced one
# of two occurrences. So a green run is never reported as a finding. It is
# reported as a question, and it needs a second mutation of a different shape
# before anybody may conclude anything from it.
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
  bun -e '
    const fs = require("fs"), path = require("path");
    const [registry, root] = process.argv.slice(1);
    const entries = JSON.parse(fs.readFileSync(registry, "utf8")).map((e) => e.case);
    const dir = path.join(root, "docs");
    const specs = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => /^TEST-SPEC-.*\.md$/.test(f)) : [];
    const ids = new Set();
    for (const f of specs) {
      const body = fs.readFileSync(path.join(dir, f), "utf8");
      // An overview row: the id is the first cell, optionally bolded.
      for (const m of body.matchAll(/^\|\s*\*{0,2}([A-Z]+[0-9]*[a-z]?-[0-9]+)\*{0,2}\s*\|/gm)) {
        ids.add(m[1]);
      }
    }
    const missing = [...ids].filter((i) => !entries.includes(i)).sort();
    const orphan = entries.filter((e) => !ids.has(e)).sort();
    console.log(`specified=${ids.size} registered=${entries.length} missing=${missing.length} orphaned=${orphan.length}`);
    if (missing.length) console.log("missing:  " + missing.join(" "));
    if (orphan.length) console.log("orphaned: " + orphan.join(" "));
  ' "$REGISTRY" "$ROOT"
  exit 0
fi

# The registry is JSON because a reviewer reads it; the orchestration is bash
# because that is where the restore trap lives. bun does the parsing -- the suite
# already requires it, so this adds no dependency.
rows="$(bun -e '
  const fs = require("fs");
  const rows = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!Array.isArray(rows)) { console.error("registry is not a list"); process.exit(2); }
  for (const r of rows) {
    for (const k of ["case", "file", "spec", "from", "to", "mustFail"]) {
      if (typeof r[k] !== "string") {
        console.error(`entry ${r.case ?? "?"} has no ${k}`); process.exit(2);
      }
    }
    // from/to travel base64-encoded. Tabs and newlines are the record separators
    // here, and the first version simply refused any value carrying one -- which
    // made a multi-line mutation impossible, and a rule that spans two lines is
    // exactly the kind worth breaking. Found by MU-5, whose own fixture needs to
    // empty a whole file.
    const ids = [r.case, r.file, r.spec, r.mustFail];
    if (ids.some((v) => /[\t\n]/.test(v))) {
      console.error(`entry ${r.case} has a tab or newline in a name or a path`); process.exit(2);
    }
    // An empty `from` has nothing to find, and indexOf("") answers 0 forever.
    if (r.from === "") { console.error(`entry ${r.case} has an empty from`); process.exit(2); }
    if (r.mustFail === "") { console.error(`entry ${r.case} has an empty mustFail`); process.exit(2); }
    // A leading dot so no field is ever empty on the wire. Tab is IFS whitespace
    // and bash collapses a run of it into one delimiter, so an empty `to` --
    // which is what a deletion mutation looks like, the most natural shape there
    // is -- shifted every later field left by one: `to` received the mustFail
    // text and `must` became empty, and an empty needle matches any failing
    // line. The entry then read VALIDATED over a mutation that had tested
    // nothing. Finding 1 of the 2026-09-22 review.
    const b64 = (s) => "." + Buffer.from(s, "utf8").toString("base64");
    console.log([r.case, r.file, r.spec, b64(r.from), b64(r.to), r.mustFail].join("\t"));
  }
' "$REGISTRY")" || exit 2

SUBJECT=""      # the file currently mutated, for the trap
BACKUP=""
restore() {
  if [[ -n "$SUBJECT" && -n "$BACKUP" && -f "$BACKUP" ]]; then
    cp "$BACKUP" "$SUBJECT"
    rm -f "$BACKUP"
    SUBJECT=""; BACKUP=""
  fi
}
# EXIT alone is not enough: bash runs an INT handler and then carries on, which
# is how tests/verify/m-b2.sh promised restoration on Ctrl-C and never delivered
# it. Each signal restores and then exits, so the handler cannot be resumed past.
trap 'restore' EXIT
trap 'restore; exit 130' INT
trap 'restore; exit 143' TERM

validated=0; failed=0; unresolved=0; refused=0
report=""

add() { report="${report}$1"$'\n'; }

while IFS=$'\t' read -r id file spec from to must; do
  [[ -n "$id" ]] || continue
  [[ -z "$ONLY" || "$ONLY" == "$id" ]] || continue

  abs="${ROOT}/${file}"
  absspec="${ROOT}/${spec}"

  # The registry mutates subjects, never assertions. A tool that can rewrite the
  # tests can make anything pass.
  #
  # Matched on the file being a TEST, after normalising the path, rather than on
  # the literal prefix `tests/`. `./tests/unit/x.test.ts`, `tests/../tests/...`
  # and `dashboard/src/foo.test.ts` -- the suite CLAUDE.md runs with `bun test
  # src` -- all walked straight past the prefix form. And the prefix was too wide
  # as well as too narrow: `tests/run.sh` is a subject in its own right, and A0-4
  # was refused as though it were an assertion. Finding 3 of 2026-09-22.
  norm="$file"
  if command -v realpath >/dev/null 2>&1 && [[ -e "$abs" ]]; then
    norm="$(realpath --relative-to="$ROOT" "$abs" 2>/dev/null || echo "$file")"
  fi
  case "$norm" in
    *.test.ts|*.test.tsx|*.test.js|*.spec.ts)
      add "REFUSED   ${id}  names a test file as its subject"; refused=$((refused+1)); continue ;;
    ../*|/*)
      add "REFUSED   ${id}  its subject is outside the repository"; refused=$((refused+1)); continue ;;
  esac

  if [[ ! -f "$abs" ]]; then
    add "REFUSED   ${id}  no such subject: ${file}"; refused=$((refused+1)); continue
  fi
  if [[ ! -f "$absspec" ]]; then
    add "REFUSED   ${id}  no such test file: ${spec}"; refused=$((refused+1)); continue
  fi

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
    let n = 0, i = 0;
    while ((i = body.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
    console.log(String(n));
  ' "$abs")"
  if [[ "$hits" == "0" ]]; then
    add "REFUSED   ${id}  its 'from' is not in ${file} -- the subject moved"; refused=$((refused+1)); continue
  fi
  if [[ "$hits" != "1" ]]; then
    add "REFUSED   ${id}  its 'from' occurs ${hits} times in ${file}"; refused=$((refused+1)); continue
  fi

  # Without a backup the mutation must not happen at all. There is no `set -e`
  # here on purpose, so a failed mktemp left BACKUP empty, cp failed, SUBJECT was
  # set anyway -- and restore() requires a BACKUP, so the operator's tracked file
  # stayed mutated with nothing to put back. Finding 5 of 2026-09-22.
  # An explicit template, for two reasons. A bare `mktemp` on macOS ignores
  # TMPDIR, so the backup went somewhere no case could look -- which is why the
  # cleanup assertion could not fail, whatever the code did (item 6). And a named
  # file says who left it behind when one is found.
  if ! BACKUP="$(mktemp "${TMPDIR:-/tmp}/lu-mutate.XXXXXX" 2>/dev/null)" || [[ -z "$BACKUP" ]] || ! cp "$abs" "$BACKUP"; then
    [[ -n "$BACKUP" ]] && rm -f "$BACKUP"
    BACKUP=""
    add "REFUSED   ${id}  could not back ${file} up, so it was not touched"
    refused=$((refused+1)); continue
  fi
  SUBJECT="$abs"
  FROM="$from" TO="$to" bun -e '
    const fs = require("fs");
    const p = process.argv[1];
    const d = (s) => Buffer.from(s.slice(1), "base64").toString("utf8");
    const body = fs.readFileSync(p, "utf8");
    // Not a regular expression: `$&` and friends in a replacement string would
    // be interpreted, and a subject full of shell variables is exactly where
    // that bites.
    const needle = d(process.env.FROM);
    const at = body.indexOf(needle);
    fs.writeFileSync(p, body.slice(0, at) + d(process.env.TO) + body.slice(at + needle.length));
  ' "$abs"

  out="$(cd "$ROOT" && bun test --timeout "$TIMEOUT_MS" "$spec" 2>&1)"
  restore

  # bun names a test on the line only when it FAILS; passing ones appear solely
  # in the tally at the end. Counting "(pass)" lines therefore reported zero
  # survivors for every entry and classified each one as a broken file -- found
  # on the first real run of this script, which is the reason it exists.
  # Anchored at the end of the line, not searched inside it. bun prints
  # `(fail) describe > name [12.34ms]`, so a substring match let a *different*
  # failing test stand in for the named one whenever its name merely contained
  # it -- `field A is carried` matched by `field A is carried on restart`, with
  # the named test still green. The entry then read VALIDATED while protecting
  # nothing. The timing suffix is stripped first, and the comparison is a plain
  # string one so a name carrying regex characters cannot change its meaning.
  # Finding 4 of 2026-09-22.
  named_failed="$(printf '%s\n' "$out" | MUST="$must" awk '
    BEGIN { m = ENVIRON["MUST"]; hit = 0 }
    index($0, "(fail)") > 0 {
      line = $0
      sub(/ \[[0-9.]+ *m?s\]$/, "", line)
      if (length(line) >= length(m) && substr(line, length(line) - length(m) + 1) == m) hit = 1
    }
    END { print hit }')"
  passes="$(printf '%s\n' "$out" | awk '/^ *[0-9]+ pass$/ { n += $1 } END { print n+0 }')"
  fails="$(printf '%s\n' "$out" | awk '/^ *[0-9]+ fail$/ { n += $1 } END { print n+0 }')"

  # A survivor is required only where one can exist. A file holding a single test
  # reddens entirely when that test reddens, and the "broken file" rule below
  # would then refuse every honest entry against it -- found while backfilling
  # A4-6, whose spec has exactly one test.
  total=$((passes + fails))
  survivor_needed=1
  [[ "$total" -le 1 ]] && survivor_needed=0

  # No test ran at all. bun missing, bun crashing, a spec filter matching no
  # file, or a mutation that breaks the spec at load time -- bun reports that as
  # a file-level error, not as an `N fail` line -- all produced a tally of zero
  # and zero, which the branch below read as "nothing went red" and exited 0.
  # A run that could not run is the one thing this tool must never call a
  # result. Finding 2 of 2026-09-22.
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

# A run over an empty registry, or a --case that matches nothing, prints four
# zeros and exits 0 -- indistinguishable from a healthy run, which is the exact
# shape this tool exists to remove. It was written into MU-2's block as a hazard
# and then shipped anyway; found on the first run against a main-based branch
# whose registry is legitimately empty.
seen=$((validated + failed + refused + unresolved))
if [[ -n "$ONLY" && "$seen" == "0" ]]; then
  echo "mutate: no entry for case ${ONLY} in ${REGISTRY}" >&2
  exit 2
fi
if [[ "$seen" == "0" ]]; then
  echo "registry is empty: nothing was validated, and that is not the same as everything passing."
fi

echo "validated=${validated} failed=${failed} refused=${refused} unresolved=${unresolved}"

# Unresolved is deliberately not an error: it is a question for the author, and
# turning it into a failure would push people towards a mutation that reddens
# something rather than the one that tests the rule.
if (( failed > 0 || refused > 0 )); then exit 1; fi
exit 0
