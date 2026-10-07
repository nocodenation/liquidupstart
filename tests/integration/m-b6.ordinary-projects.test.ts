/**
 * M-B6 · Integration · Three ways an ordinary project failed or was replaced
 *
 * Purpose:  S7 of the 2026-10-01 review, in three parts that share the same
 *           lines of `config/nar_builder/build.sh` and the refusal text one of
 *           them prints, so they are one change.
 *
 *           **S7a.** `find "$proj" -type d -name target -prune -exec rm -rf {} +`
 *           removed every directory called `target`, including a Java *package*
 *           of that name. A project holding `com/acme/target/T.java` failed with
 *           `package com.acme.target does not exist`, HTTP 422, and nothing in
 *           the message pointed at the builder.
 *
 *           **S7b.** The synthesised artifact id was the leaf directory name and
 *           the version was always 1.0.0, so `/repos/good/proc` and
 *           `/repos/other/proc` both produced `proc-nar-1.0.0.nar`: the second
 *           replaced the first in the drop directory and reported a plain
 *           success.
 *
 *           **S7c.** Only the named directory was copied, so a module whose pom
 *           declares a parent one level up could not resolve it -- "Some problems
 *           were encountered while processing the POMs", 422 -- and the refusal
 *           then advised "point nar-build at its directory", which is what the
 *           author had just done.
 *
 *           **And repairing S7a reopened item 10 of the 2026-09-28 review**,
 *           which is why the three are one change and not three. That item was a
 *           leftover `old-stale-0.9.nar` in the source tree being reported as
 *           freshly built; the blanket `rm -rf` is what had closed it. Removing
 *           only a module's own build directory leaves a `target/` that sits
 *           beside no pom -- and the search still looked there. Cleaning and
 *           searching follow one rule now: a bundle counts when it sits directly
 *           in a `target/` next to a `pom.xml`, which is where
 *           nifi-nar-maven-plugin writes and nowhere else.
 * Given:    The builder image built from `config/nar_builder` in this run and
 *           tagged per run; a stub `mvn` that answers the api probe, reports the
 *           arguments it was given and what survived the copy, and writes one
 *           bundle into the module's own `target/` named after the pom's own
 *           artifactId; a stub `curl` with the real one kept aside; and
 *           `/liquid/api/runtime` holding `nifi_version=2.0.0`.
 *
 *           Three sources: `/repos/pkg` with a pom and
 *           `processors/src/main/java/com/acme/target/T.java`; `/repos/good/proc`
 *           and `/repos/other/proc`, both without a pom so the project is
 *           synthesised, each with one class and a service descriptor; and
 *           `/repos/multi` whose pom lists the module `nar`, with
 *           `/repos/multi/nar/pom.xml` declaring it as parent.
 *
 *           Since D2 the probe also supplies a checker that permits and an empty
 *           `/liquid/api/lib-classes.txt`. A build that cannot be judged is refused
 *           now rather than deployed with a warning, and in a throwaway container
 *           neither the mounted checker nor Liquid's index is there -- so without
 *           them every build here would measure D2 instead of this file's subject.
 *           B6-29 and B6-30 are where the gate itself is measured, with the real
 *           checker.
 * When:     Each is built.
 * Then:     The Java package survives the copy; the two synthesised bundles are
 *           named apart; and the reactor root is copied with the module named by
 *           `-pl`.
 * Covers:   B6-18, B6-19, B6-20, FR24
 * Unhappy:  All three are failures of ordinary projects, so the counterparts are
 *           in B6-8 and B6-9 -- a test fixture is still ignored, and two genuine
 *           module bundles are still refused rather than guessed between.
 *
 * **What these cases cannot show, and the reviewer measured instead.** With a
 * stub `mvn` none of the three *fails*: the exit code was 0 on the unfixed tree
 * for S7a and S7c as well, because nothing compiles and nothing resolves a pom.
 * What the stub can show is the mechanism, and that is what is asserted here --
 * `s7a-package=deleted` against `kept`, one bundle against two, no `-pl` against
 * `-pl nar`. The 422s and the Maven messages are his, with real Maven, and are
 * quoted in the Purpose above rather than reproduced.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const RUN = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const IMAGE = `liquidupstart/nar-builder:b6s7-${RUN}`;

const work = mkdtempSync(join(tmpdir(), 'm-b6-ordinary-'));
const probe = join(work, 'ordinary.sh');

// Plain string literals, not a template literal.
const PROBE =
  [
    "#!/bin/sh",
    "set -u",
    "mkdir -p /liquid/api /deploy/nar_extensions",
    "printf \"nifi_version=2.0.0\\njava_version=21.0.1\\n\" > /liquid/api/runtime",
    "# The deployment gate, stood down on purpose.",
    "#",
    "# Since D2 build.sh refuses with 2 when it cannot judge a bundle, instead of",
    "# deploying it with a warning. The gate runs when /opt/builder/narcheck.py and",
    "# the load index are both present -- in the stack narcheck is mounted from",
    "# config/liquid/narcheck.py (compose.yml) and Liquid writes the index on every",
    "# start, and in a throwaway container neither is there. This case is about",
    "# project shapes, not about narcheck, so it supplies a checker that permits and",
    "# an empty index rather than the real pair: an EMPTY file, because build.sh runs",
    "# the checker as `python3 narcheck.py`, under which an empty file exits 0.",
    "# B6-29 and B6-30 are where the real gate is measured, with the real checker.",
    ": > /opt/builder/narcheck.py",
    ": > /liquid/api/lib-classes.txt",
    "cp \"$(command -v curl)\" /realcurl",
    "printf '#!/bin/sh\\nexit 0\\n' > \"$(command -v curl)\"; chmod 755 \"$(command -v curl)\"",
    "cat > \"$(command -v mvn)\" <<'MVN'",
    "#!/bin/sh",
    "case \" $* \" in *\" dependency:list \"*) echo \"[INFO]    org.apache.nifi:nifi-api:jar:2.0.0:compile\"; exit 0 ;; esac",
    "echo \"ARGV: $*\" >> /tmp/argv.log",
    "proj=\"\"",
    "for a in \"$@\"; do case \"$a\" in */pom.xml) proj=\"$(dirname \"$a\")\";; esac; done",
    "# report what survived the copy",
    "[ -f \"${proj}/processors/src/main/java/com/acme/target/T.java\" ] && echo \"PKGTARGET: kept\" >> /tmp/argv.log || echo \"PKGTARGET: deleted\" >> /tmp/argv.log",
    "[ -f \"${proj}/pom.xml\" ] && echo \"PARENTPOM: present\" >> /tmp/argv.log || echo \"PARENTPOM: absent\" >> /tmp/argv.log",
    "mod=\"\"",
    "for a in \"$@\"; do case \"$prev\" in -pl) mod=\"$a\";; esac; prev=\"$a\"; done 2>/dev/null",
    "tgt=\"${proj}\"",
    "case \" $* \" in *\" -pl \"*) tgt=\"${proj}/$(printf '%s' \"$*\" | sed -n 's/.*-pl \\([^ ]*\\).*/\\1/p')\";; esac",
    "# The artifact id out of the pom Maven was handed, so a synthesised bundle is",
    "# named the way the real plugin would name it.",
    "# The project's own artifactId is the first one in the file; the ones after it",
    "# are dependencies. Reading the last gave slf4j-api, which is the stub being",
    "# wrong rather than the product.",
    "aid=\"$(sed -n 's|.*<artifactId>\\([^<]*\\)</artifactId>.*|\\1|p' \"${tgt}/pom.xml\" 2>/dev/null | head -1)\"",
    "[ -n \"$aid\" ] || aid=out",
    "# Into the module's own target, which is where the real plugin writes and what",
    "# the builder now searches: a target beside a pom.xml.",
    "mkdir -p \"${tgt}/target\"; printf 'built\\n' > \"${tgt}/target/${aid}-1.0.0.nar\"",
    "exit 0",
    "MVN",
    "chmod 755 \"$(command -v mvn)\"",
    "",
    "echo \"=== S7a: a Java package named target ===\"",
    ": > /tmp/argv.log; chmod 666 /tmp/argv.log",
    "mkdir -p /repos/pkg/processors/src/main/java/com/acme/target /repos/pkg/processors/target",
    "printf 'package com.acme.target; class T {}\\n' > /repos/pkg/processors/src/main/java/com/acme/target/T.java",
    "printf 'stale\\n' > /repos/pkg/processors/target/old.nar",
    "printf '<project><modelVersion>4.0.0</modelVersion><groupId>g</groupId><artifactId>pkg</artifactId><version>1.0.0</version></project>\\n' > /repos/pkg/pom.xml",
    "sh /opt/builder/build.sh build pkg >/tmp/a.log 2>&1",
    "echo \"s7a-exit=$?\"",
    "grep -m1 PKGTARGET /tmp/argv.log | sed 's/PKGTARGET: /s7a-package=/'",
    "",
    "echo \"=== S7b: two repositories, same leaf, no pom ===\"",
    "rm -rf /deploy/nar_extensions/*; : > /tmp/argv.log; chmod 666 /tmp/argv.log",
    "for r in good other; do",
    "  mkdir -p \"/repos/$r/proc/src/main/java/p\" \"/repos/$r/proc/src/main/resources/META-INF/services\"",
    "  printf 'package p; class C {}\\n' > \"/repos/$r/proc/src/main/java/p/C.java\"",
    "  printf 'p.C\\n' > \"/repos/$r/proc/src/main/resources/META-INF/services/org.apache.nifi.processor.Processor\"",
    "done",
    "sh /opt/builder/build.sh build good/proc >/tmp/b1.log 2>&1; echo \"s7b-first=$?\"",
    "sh /opt/builder/build.sh build other/proc >/tmp/b2.log 2>&1; echo \"s7b-second=$?\"",
    "echo \"s7b-drop=[$(ls -A /deploy/nar_extensions | sort | tr '\\n' ' ')]\"",
    "",
    "echo \"=== S7c: a module whose parent pom is one level up ===\"",
    ": > /tmp/argv.log; chmod 666 /tmp/argv.log",
    "mkdir -p /repos/multi/nar",
    "printf '<project><modelVersion>4.0.0</modelVersion><groupId>g</groupId><artifactId>multi</artifactId><version>1.0.0</version><packaging>pom</packaging><modules><module>nar</module></modules></project>\\n' > /repos/multi/pom.xml",
    "printf '<project><modelVersion>4.0.0</modelVersion><parent><groupId>g</groupId><artifactId>multi</artifactId><version>1.0.0</version></parent><artifactId>nar</artifactId></project>\\n' > /repos/multi/nar/pom.xml",
    "sh /opt/builder/build.sh build multi/nar >/tmp/c.log 2>&1",
    "echo \"s7c-exit=$?\"",
    "grep -m1 PARENTPOM /tmp/argv.log | sed 's/PARENTPOM: /s7c-parent=/'",
    "# Always emitted, even when there is no -pl: a line that simply does not appear",
    "# turns a product change into one unnamed failure with no case run, which is",
    "# A1 of the 2026-10-01 review. The first control run of this file did exactly",
    "# that -- 0 pass / 1 fail \"(unnamed)\" against the unfixed tree.",
    "pl=\"$(grep -m1 \"ARGV:\" /tmp/argv.log | grep -o -- \"-pl [^ ]*\" || true)\"",
    "echo \"s7c-pl=${pl:-none}\"",
  ].join('\n') + '\n';

writeFileSync(probe, PROBE, { mode: 0o755 });

let out = '';
beforeAll(() => {
  const built = sh(['docker', 'build', '-q', '-t', IMAGE, join(repoRoot, 'config/nar_builder')]);
  if (built.code !== 0) throw new Error(`the builder image did not build:\n${built.output}`);
  const r = sh([
    'docker', 'run', '--rm', '-v', `${probe}:/ordinary.sh:ro`,
    '--entrypoint', 'sh', IMAGE, '/ordinary.sh'
  ]);
  out = r.output;
  if (!out.includes('s7c-pl=')) {
    throw new Error(`the probe did not finish (exit ${r.code}):\n${out}`);
  }
}, 900_000);

afterAll(() => {
  sh(['docker', 'rmi', '-f', IMAGE]);
  rmSync(work, { recursive: true, force: true });
});

const field = (name) => (out.match(new RegExp(`${name}=([^\\n]*)`)) ?? [, ''])[1];

describe('B6-18 a Java package named target is not a build directory', () => {
  test('B6-18 the package survives the copy', () => {
    // Against the unfixed tree: `deleted`.
    expect(field('s7a-package')).toBe('kept');
  });

  test('B6-18 and the build still deploys', () => {
    // The counterpart inside the same scenario: keeping the package must not
    // cost the build. It also shows the search and the clean-up agree -- a
    // `target/` beside no pom is neither removed nor counted.
    expect(field('s7a-exit')).toBe('0');
  });
});

describe('B6-19 two repositories with the same leaf do not overwrite each other', () => {
  test('B6-19 both bundles are in the drop directory, named apart', () => {
    // Against the unfixed tree: `[proc-1.0.0.nar ]`, one file, the second build
    // having replaced the first and reported success.
    const drop = field('s7b-drop');
    expect(drop).toContain('good-proc-1.0.0.nar');
    expect(drop).toContain('other-proc-1.0.0.nar');
  });

  test('B6-19 and both builds succeeded', () => {
    expect({ first: field('s7b-first'), second: field('s7b-second') }).toEqual({
      first: '0',
      second: '0'
    });
  });
});

describe('B6-20 a module is built inside the project that owns its parent pom', () => {
  test('B6-20 the reactor root is copied, so the parent pom is there', () => {
    expect(field('s7c-parent')).toBe('present');
  });

  test('B6-20 and the module is named rather than built alone', () => {
    // This is the assertion that separates the trees: without it the copy holds
    // only the module, and Maven cannot resolve the parent it declares.
    expect(field('s7c-pl')).toBe('-pl nar');
  });
});
