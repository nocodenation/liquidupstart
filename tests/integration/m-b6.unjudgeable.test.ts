/**
 * M-B6 · Integration · A bundle that cannot be judged is not deployed
 *
 * Purpose:  D2 of the 2026-10-01 review, and it is a product change rather than a
 *           documentation one.
 *
 *           Two sentences disagreed. `config/liquid/entrypoint.sh` told the
 *           operator "The NAR builder cannot judge bundles and will refuse them
 *           all" when it could not write the load index; `build.sh` printed
 *           "Warning: ... is missing; <bundle> is deployed unchecked" and
 *           deployed it. One of them had to go, and the question is not which
 *           text is accurate but which behaviour is right.
 *
 *           **Deploying unchecked is the shape S4 removed from narcheck two days
 *           earlier**, where a library with nothing to judge produced a pass.
 *           Everything downstream reads a file in the load path as proof that it
 *           was judged, and NiFi loads what is there within seconds either way.
 *           So the builder refuses, and the entrypoint was the sentence with the
 *           right intent.
 *
 *           When this is reached, Liquid is up -- the reachability probe answered
 *           -- and the index is still absent, which means Liquid could not write
 *           it. That is S8's condition, repaired in the same commit so that the
 *           instance survives it and the operator is told where to look.
 * Given:    The builder image built from `config/nar_builder` in this run; a
 *           source that compiles at /repos/probe; `/liquid/api/runtime` so the
 *           target resolves; stub `mvn` and `curl` over the real binaries; and
 *           `/liquid/api/lib-classes.txt` removed, which is the one file the
 *           deployment gate tests for.
 * When:     build.sh builds that source, then builds it again with the index put
 *           back.
 * Then:     The first is refused with nothing in the drop directory; the second
 *           deploys.
 * Covers:   B6-29, B6-30, FR30, FR36
 * Unhappy:  B6-29 is the refusal. B6-30 is the counterpart, and it is what stops
 *           the change being met by refusing every build: with an index the same
 *           bundle goes through.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import { builderImage } from '../lib/builderimage';

const IMAGE = builderImage();
const BUILD = join(repoRoot, 'config/nar_builder/build.sh');
// narcheck is mounted into the builder in compose.yml rather than copied into the
// image -- it belongs to Liquid and runs in both containers. A throwaway container
// has to mount it too, or the deployment gate fails on the checker's absence
// instead of on the index's, and the counterpart can never pass.
const NARCHECK = join(repoRoot, 'config/liquid/narcheck.py');

const work = mkdtempSync(join(tmpdir(), 'm-b6-unjudgeable-'));
const src = join(work, 'repos', 'probe');
const drop = join(work, 'drop');
mkdirSync(join(src, 'src/main/java/p'), { recursive: true });
mkdirSync(join(src, 'src/main/resources/META-INF/services'), { recursive: true });
mkdirSync(drop, { recursive: true });
writeFileSync(join(src, 'src/main/java/p/C.java'), 'package p;\npublic class C {}\n');
writeFileSync(
  join(src, 'src/main/resources/META-INF/services/org.apache.nifi.processor.Processor'),
  'p.C\n'
);
afterAll(() => rmSync(work, { recursive: true, force: true }));

// Plain string literals, not a template literal.
const PROBE =
  [
    "set -u",
    "mkdir -p /liquid/api /liquid/logs",
    "printf \"nifi_version=2.11.0\\njava_version=21.0.1\\n\" > /liquid/api/runtime",
    "# Stubs over the real binaries: run_maven goes through su, which resets PATH.",
    "printf \"#!/bin/sh\\nexit 0\\n\" > \"$(command -v curl)\"; chmod 755 \"$(command -v curl)\"",
    "cat > \"$(command -v mvn)\" <<\"MVN\"",
    "#!/bin/sh",
    "case \" $* \" in *\" dependency:list \"*) echo \"[INFO]    org.apache.nifi:nifi-api:jar:2.10.0:compile\"; exit 0;; esac",
    "proj=\"\"",
    "for a in \"$@\"; do case \"$a\" in */pom.xml) proj=\"$(dirname \"$a\")\";; esac; done",
    "# A real archive carrying one non-class entry, because narcheck opens what it",
    "# is handed: a file holding the word \"built\" is refused as unreadable, which is",
    "# correct of it and made the counterpart fail for the wrong reason.",
    "mkdir -p \"${proj}/target\"",
    "python3 -c \"import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'w'); z.writestr('notes.txt','probe'); z.close()\" \"${proj}/target/made-1.0.0.nar\"",
    "exit 0",
    "MVN",
    "chmod 755 \"$(command -v mvn)\"",
    "",
    "# No index: the one file the deployment gate tests for.",
    "rm -f /liquid/api/lib-classes.txt",
    "sh /probe/build.sh build probe > /tmp/o 2>&1; echo \"noindex-exit=$?\"",
    "# The whole refusal, not the first three lines: the remedy is at the end of it,",
    "# and a probe that truncates its own evidence makes an assertion look wrong.",
    "sed \"s/^/noindex-said: /\" /tmp/o",
    "printf \"noindex-drop=[%s]\\n\" \"$(ls -A /deploy/nar_extensions | tr \"\\n\" \" \")\"",
    "",
    "# The counterpart: with an index, the same build deploys.",
    "printf \"org/apache/nifi/processor/Processor\\n\" > /liquid/api/lib-classes.txt",
    "printf \"org/apache/nifi/processor\\n\" > /liquid/api/api-packages.txt",
    ": > /liquid/api/nar-classes.txt",
    ": > /liquid/api/nar-parents.txt",
    "sh /probe/build.sh build probe > /tmp/o2 2>&1; echo \"withindex-exit=$?\"",
    "printf \"withindex-drop=[%s]\\n\" \"$(ls -A /deploy/nar_extensions | tr \"\\n\" \" \")\"",
  ].join('\n') + '\n';

let out = '';
beforeAll(() => {
  const script = join(work, 'probe.sh');
  writeFileSync(script, PROBE, { mode: 0o755 });
  const r = sh([
    'docker', 'run', '--rm',
    '-v', `${BUILD}:/probe/build.sh:ro`,
    '-v', `${join(work, 'repos')}:/repos:ro`,
    '-v', `${drop}:/deploy/nar_extensions`,
    '-v', `${script}:/probe.sh:ro`,
    '-v', `${NARCHECK}:/opt/builder/narcheck.py:ro`,
    '--entrypoint', 'sh', IMAGE, '/probe.sh'
  ]);
  out = r.output;
  if (!out.includes('withindex-drop=[')) {
    throw new Error(`the probe did not finish (exit ${r.code}):\n${out}`);
  }
}, 900_000);

const field = (name) => (out.match(new RegExp(`${name}=([^\\n]*)`)) ?? [, ''])[1];

describe('B6-29 a bundle the builder cannot judge is refused', () => {
  test('B6-29 the build refuses rather than deploying with a warning', () => {
    // Before: exit 0 and "is deployed unchecked".
    expect(field('noindex-exit')).not.toBe('0');
    expect(out).toMatch(/noindex-said: .*cannot be judged/);
  });

  test('B6-29 and nothing reached the load path', () => {
    expect(field('noindex-drop')).toBe('[]');
  });

  test('B6-29 the refusal says where the operator should look', () => {
    // The condition is Liquid running and the index absent, which means Liquid
    // could not write it -- so the remedy is about Liquid, not about the bundle.
    expect(out).toMatch(/logs liquid|volumes\/liquid\/api/);
  });
});

describe('B6-30 the counterpart: with an index the same bundle deploys', () => {
  test('B6-30 it is built and written into the load path', () => {
    // Without this, B6-29 is met by refusing every build.
    expect(field('withindex-exit')).toBe('0');
    expect(field('withindex-drop')).toContain('.nar');
  });
});
