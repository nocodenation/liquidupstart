/**
 * M-B6 · Integration · The refusal path names a file without executing it
 *
 * Purpose:  C1 of the 2026-10-13 re-review, and it was a live hole. Both the
 *           builder and the watcher rewrite narcheck's refusal so it names the
 *           file the operator dropped rather than the internal dot-copy, and both
 *           did it with `sed "s|${part}|...|g"` -- which puts an
 *           attacker-controlled basename unescaped on **both sides** of a `sed`
 *           expression. GNU sed, which both images ship, has an `e` command that
 *           executes the pattern space, so a name shaped `x|y|;e <cmd>;#.nar`
 *           closes the `s`, opens an `e`, and runs `<cmd>`.
 *
 *           The reviewer reproduced it as **root** in the builder and as **nifi**
 *           in Liquid. The watcher leg needs no builder at all: the inbox is
 *           writable by the agents, so a file dropped there with such a name runs
 *           a command inside the Liquid container.
 *
 *           Reproduced again here before the repair, against the exact string the
 *           script builds: `rc=0`, and a `PWNED` marker holding
 *           `uid=0(root) gid=0(root)`.
 * Given:    the two shipped scripts, and a basename carrying a `sed` payload.
 * When:     each script's own substitution is run over a refusal naming the
 *           dot-copy
 * Then:     no command runs, the dot-path is gone from the text, and an ordinary
 *           name containing `|` survives unmangled -- and a shell where `&`
 *           cannot go wrong is refused by name
 * Covers:   B6-35, FR30, FR36
 * Unhappy:  The payload is the negative half. The ordinary `|` name is its
 *           counterpart and it is not decoration: the reviewer's suggested fix
 *           (`awk -v` with `gsub`) stops the execution and still mangles that
 *           name, because `gsub`'s first argument is a regular expression. That
 *           is N4 of the same review, and without this scenario the suite would
 *           have accepted a fix that left it open.
 *
 * What this drives, said exactly, because a control showed the first version of
 * this header claiming more than the cases do. There are two halves and they are
 * not interchangeable:
 *
 *   - **the mechanism**: the replacement each script uses, run with the payload
 *     under the shell that script declares. `build.sh`'s is extracted from the
 *     shipped file, so a drifted copy cannot satisfy it.
 *   - **the wiring**: that the shipped call site uses that replacement and no
 *     `sed` substitution remains in either file's code.
 *
 * **The mechanism half alone does not notice a changed call site.** Measured:
 * putting the old `sed` line back at `build.sh`'s call site reddens only the
 * wiring case, because `literal_replace` is still defined in the file and the
 * mechanism case calls it directly. So the wiring case is not decoration around a
 * behavioural check -- it is the half that sees the defect being reintroduced, and
 * saying otherwise would have been the "a case that cannot fail" shape this
 * milestone has three entries about.
 *
 * Neither half drives a whole failing build with a crafted `<finalName>`. That
 * needs Maven Central and a pom per payload and would measure the same line
 * through four more moving parts; the gap is stated rather than papered over.
 *
 * **Both legs run in `debian:bookworm-slim`, and the case has no build
 * precondition.** #29: the watcher leg ran in `liquidupstart/liquid:latest`, and
 * where that was never built `docker run` exited 125 and four scenarios failed
 * with `Received: ""`. Any bash will do for the quoted form, which is correct in
 * every bash; what the case needs is a shell in which the `&` defect *can* show,
 * because in `bash:5.1` the `&` and `\&` scenarios were measured green on it. So
 * `run()` asserts the exit code and a canary, `${c//X/&&}` printing `XX`, read
 * from the shell that then evaluates the line, through `watcherRunVerdict`
 * (B6-47). The canary proves the shell can show the defect, not that it is
 * Liquid's; that is all the case needs of it. B6-47's integration row, the same
 * run with `patsub_replacement` off, sits beside the scenarios it guards.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh, wasInterrupted } from '../lib/shell';
import { watcherRunVerdict } from '../lib/watchershell';

const BUILD_SH = join(repoRoot, 'config/nar_builder/build.sh');
const WATCH_SH = join(repoRoot, 'config/liquid/nar-watch.sh');

/** A basename that closes a `sed s|…|…|` and opens an `e` command. */
// **A name that could actually exist**, which the first form was not: a basename
// cannot contain `/`, and this one carried `id>/tmp/PWNED`. As a string handed to
// a replacement it demonstrated the hole perfectly; as a file dropped into the
// inbox -- which is the path C1 is about -- it could never have been created.
// The redirection is therefore relative, and the marker is looked for in the
// working directory. N8 of the 2026-10-14 re-review; the reviewer's own
// reproduction used this form.
const PAYLOAD = 'x|y|;e id>>PWNED;#.nar';
/** The same shape without the `;e` -- N4's benign leg. */
const ORDINARY = 'ordinary|name.nar';
// N5's two. `&` is the one that mattered: with bash 5.2's `patsub_replacement`
// an unquoted `&` in the replacement stands for the matched text, which here is
// the dot-copy path the substitution exists to remove. `R&D` is an ordinary
// name, not a payload. `\&` is the escape for a literal `&`, so a name carrying
// it lost the backslash instead -- a quieter wrong answer than the first.
const AMPERSAND = 'R&D-tools.nar';
const BACKSLASH = 'back\\&slash.nar';

/** Code only: a comment quoting the old line must not satisfy a structural check. */
const code = (p: string) =>
  readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');

describe('B6-35 the builder leg: the replacement it uses treats a name as text', () => {
  // build.sh is `#!/bin/sh`, so the replacement is POSIX parameter expansion with
  // a quoted pattern. The function is taken out of the shipped file rather than
  // restated here, so the case cannot pass against a copy that has drifted.
  const run = (base: string) =>
    sh([
      'docker', 'run', '--rm', '-v', `${BUILD_SH}:/build.sh:ro`,
      '--entrypoint', 'sh', 'debian:bookworm-slim', '-c',
      `eval "$(sed -n '/^literal_replace() {/,/^}/p' /build.sh)"
       DROP=/deploy/nar_extensions
       base='${base.replace(/'/g, "'\\''")}'
       part="$DROP/.$base.1.part"
       out="$(literal_replace "refused $part: a reason, and again $part" "$part" "$DROP/$base")"
       printf 'OUT=%s\\n' "$out"
       printf 'RAN=%s\\n' "$([ -e /tmp/PWNED ] || [ -e ./PWNED ] && echo yes || echo no)"`
    ]);
    // No bound but the test's own: the 120_000 that stood here was sh()'s extraEnv,
    // which copies nothing from a number. B6-37's block.

  test('B6-35 the payload runs nothing and the dot-path is gone', () => {
    const r = run(PAYLOAD);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('RAN=no');
    // The substitution still did its job: no internal dot-copy name survives.
    expect(r.stdout).not.toContain('.part');
    expect(r.stdout).toContain(`/deploy/nar_extensions/${PAYLOAD}`);
  }, 180_000);

  test('B6-35 and an ordinary name containing a pipe is not mangled', () => {
    // The counterpart that rules out awk/gsub: there, this came back three times
    // over, because `|` is alternation to a regex engine.
    const r = run(ORDINARY);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`OUT=refused /deploy/nar_extensions/${ORDINARY}: a reason`);
  }, 180_000);
});

describe('B6-35 the watcher leg, which needs no builder, and its wiring', () => {
  /**
   * The shipped line, taken out of the file and run — not restated here.
   *
   * **Both halves of this were wrong until N5.** The scenario restated the
   * expansion inline, so it could not see what `nar-watch.sh` actually spells;
   * and the restatement was itself unquoted, so it reproduced the defect without
   * noticing. The wiring half then pinned the defective spelling verbatim, which
   * is how a one-character fault survived a case written about that very line.
   *
   * So the line is extracted by `grep -F` on its own opening, the way the builder
   * leg extracts `literal_replace`, and `$1` is set the way `judge` receives it.
   * A spelling change is then run rather than asserted. It runs in
   * `debian:bookworm-slim`, which needs no build (#29), and the shell is asked
   * rather than assumed: before the eval it prints `CANARY=` from `${c//X/&&}`,
   * which is `XX` only where an unquoted `&` is the matched text, and its
   * `BASH=` version. A run that did not exit 0, or whose shell cannot show the
   * `&` defect, throws `watcherRunVerdict`'s message before any scenario reads
   * `OUT=`. `prefix` runs first; B6-47 uses it to turn the option off.
   */
  const RUN_TIMEOUT_MS = 150_000;
  const run = (base: string, prefix = '') => {
    const r = sh([
      'docker', 'run', '--rm', '-v', `${WATCH_SH}:/nar-watch.sh:ro`,
      '--entrypoint', 'bash', 'debian:bookworm-slim', '-c',
      `${prefix}
       c=X; printf 'CANARY=%s\\n' "\${c//X/&&}"
       printf 'BASH=%s\\n' "$BASH_VERSION"
       base='${base.replace(/'/g, "'\\''")}'
       LOAD_DIR=/nar_extensions
       inbox=/nar_inbox
       part="$LOAD_DIR/.$base.part"
       REFUSAL="refused $part: a reason, and again $part"
       line="$(grep -F 'REFUSAL="\${REFUSAL//' /nar-watch.sh | head -1)"
       printf 'LINE=%s\\n' "$line"
       set -- "$inbox/$base"
       eval "$line"
       printf 'OUT=%s\\n' "$REFUSAL"
       printf 'RAN=%s\\n' "$([ -e /tmp/PWNED ] || [ -e ./PWNED ] && echo yes || echo no)"`
    ], undefined, {}, RUN_TIMEOUT_MS);
    // Inside the scenarios' 180_000, so a stalled pull is reported as one.
    if (wasInterrupted(r)) {
      const how = r.timedOut ? `ran past its ${RUN_TIMEOUT_MS / 1000}s timeout` : `was interrupted (exit ${r.code})`;
      throw new Error(`the watcher run ${how}, so this run measured nothing; a statement about the machine, not the code under test`);
    }
    const verdict = watcherRunVerdict(r.code, r.stdout, r.stderr);
    if (verdict !== null) throw new Error(verdict);
    return r;
  };

  test('B6-47 a shell with patsub_replacement off is refused by the same verdict', () => {
    // The in-suite proof that the canary reads the shell, not the image name.
    // Its counterpart is every run() scenario of B6-35. The BASH= value is not
    // asserted, so a point update of the image cannot redden this.
    expect(() => run(ORDINARY, 'shopt -u patsub_replacement')).toThrow(/cannot show the & defect[\s\S]*CANARY=&&/);
  }, 180_000);

  test('B6-35 the payload runs nothing through the watcher substitution', () => {
    const r = run(PAYLOAD);
    expect(r.stdout).toContain('RAN=no');
    expect(r.stdout).not.toContain('.part');
    expect(r.stdout).toContain(`/nar_inbox/${PAYLOAD}`);
  }, 180_000);

  test('B6-35 and an ordinary name containing a pipe is not mangled', () => {
    const r = run(ORDINARY);
    expect(r.stdout).toContain(`OUT=refused /nar_inbox/${ORDINARY}: a reason`);
  }, 180_000);

  test('B6-35 and a name containing & names the file, not the dot-copy path', () => {
    // N5, measured: this answered `/nar_inbox/R` + the whole dot-copy path +
    // `D-tools.nar`, so the operator was pointed at a path that does not exist.
    const r = run(AMPERSAND);
    expect(r.stdout).toContain(`OUT=refused /nar_inbox/${AMPERSAND}: a reason`);
    // The specific wrong answer, named so it cannot come back quietly.
    expect(r.stdout).not.toContain('/nar_inbox/R/nar_extensions');
    expect(r.stdout).not.toContain('.part');
  }, 180_000);

  test('B6-35 and a name containing \\& keeps its backslash', () => {
    // The quieter half: `\&` is the escape for a literal `&`, so the shipped
    // line dropped the backslash and named a file that does not exist either.
    const r = run(BACKSLASH);
    expect(r.stdout).toContain(`OUT=refused /nar_inbox/${BACKSLASH}: a reason`);
  }, 180_000);

  test('B6-35 and no unquoted replacement is left in the shipped file', () => {
    // What text is good for, and only that. The behaviour is held by the
    // extraction above; this guards the defect's spelling rather than the fix's,
    // because pinning the fix is what let N5 through: the old assertion was
    // green **on** the defect.
    expect(code(WATCH_SH)).not.toContain('/$1}"');
    expect(code(WATCH_SH)).toContain('"$1"}"');
  });
});

describe('B6-35 the wiring: the regex engine is gone from both refusal paths', () => {
  test('B6-35 neither script substitutes with sed any more', () => {
    // Structural, and checked against code rather than text: both files carry
    // comments quoting the old `sed "s|...|...|g"` line, and a check that matched
    // those would pass against the defect itself.
    for (const p of [BUILD_SH, WATCH_SH]) {
      expect(code(p)).not.toMatch(/sed\s+"s\|/);
    }
    // And the replacement each one does use is present.
    expect(code(BUILD_SH)).toContain('literal_replace "$refusal" "$part"');
  });
});
