/**
 * M-B5 · Integration · What narcheck resolves against, and what it looks at
 *
 * Purpose:  Blockers 3 and 5 of the 2026-09-28 review, and they pull in
 *           opposite directions — the check refused bundles Liquid loads
 *           happily, and missed the failure it was built for.
 *
 *           **Too strict.** A package counted as judged if nifi-api provides
 *           it, but classes resolved only against the bundle and `lib/*.jar`.
 *           A NAR inherits its declared parent's classes at runtime, so a
 *           reference the parent provides resolves in Liquid and was refused
 *           here. Measured against the stock image: **11 of 118** shipped NARs
 *           refused, `nifi-standard-nar` among them. The documents call a false
 *           refusal worse than no check.
 *
 *           **Too loose.** Only CONSTANT_Class entries were read, so a type
 *           named only in a method or field signature was invisible — which is
 *           precisely `NoClassDefFoundError … at Class.getDeclaredMethods0`,
 *           the failure FR23 and FR36 measured, since that is descriptor
 *           resolution when NiFi reflects over the processor.
 * Given:    `ghcr.io/nocodenation/liquid-nifi:latest` and its own
 *           `/opt/nifi/nifi-current/lib`, which holds 118 NARs and
 *           `nifi-api-2.10.0.jar`; `narcheck.py` mounted in from this checkout;
 *           and two classes compiled in the image with its own `javac` — one
 *           naming `org.apache.nifi.flowfile.FlowFile` only in a method
 *           signature, one returning the string
 *           `"org/apache/nifi/processor/Invented"` and nothing else.
 * When:     `narcheck check` runs over every stock NAR, over one with its
 *           `Nar-Dependency-*` manifest lines removed, and `narcheck refs`
 *           over the two classes.
 * Then:     Every stock NAR is accepted; the one with no declared parent is
 *           refused; the signature type is reported; the string literal is not.
 * Covers:   B5-4, B5-5, B5-6, B5-7, FR23, FR36
 * Unhappy:  B5-5 and B5-7 are the counterparts. Without B5-5 the parent chain
 *           could be met by resolving everything; without B5-7 the descriptor
 *           walk could be met by scanning every UTF-8 constant, which is how a
 *           class name inside a string would start being refused.
 */
import { test, expect, describe, beforeAll } from 'bun:test';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const IMAGE = 'ghcr.io/nocodenation/liquid-nifi:latest';
const NARCHECK = join(repoRoot, 'config/liquid/narcheck.py');
const LIB = '/opt/nifi/nifi-current/lib';

function inImage(script: string) {
  return sh([
    'docker', 'run', '--rm',
    '-v', `${NARCHECK}:/narcheck.py:ro`,
    '--entrypoint', 'sh', IMAGE, '-c', script
  ]);
}

describe('B5-4 the check accepts what Liquid already loads', () => {
  let out = '';
  beforeAll(() => {
    out = inImage(`
      refused=0; total=0
      for n in ${LIB}/*.nar; do
        total=$((total+1))
        python3 /narcheck.py check "$n" ${LIB} >/dev/null 2>&1 || refused=$((refused+1))
      done
      echo "total=$total refused=$refused"
    `).output;
  }, 900_000);

  test('B5-4 every NAR the image ships passes', () => {
    // A count of zero is not a result until something that must be there is
    // counted: the total says the loop actually ran over the shipped bundles.
    const total = Number(out.match(/total=(\d+)/)?.[1] ?? 0);
    const refused = Number(out.match(/refused=(\d+)/)?.[1] ?? -1);
    expect(total).toBeGreaterThan(100);
    expect(refused).toBe(0);
  });
});

describe('B5-5 but only because the parent is declared', () => {
  test('B5-5 the same classes with no parent declaration are refused', () => {
    // The counterpart. Resolving against the parent chain must not become
    // resolving against everything: strip the declaration and the very same
    // bundle has to be refused again.
    const r = inImage(`
      python3 - <<'EOF'
import zipfile
src = "${LIB}/nifi-kafka-nar-2.11.0.nar"
with zipfile.ZipFile(src) as zin, zipfile.ZipFile("/tmp/orphan.nar", "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == "META-INF/MANIFEST.MF":
            text = data.decode("utf-8", "replace")
            kept = [l for l in text.splitlines() if not l.lower().startswith("nar-dependency")]
            data = ("\\n".join(kept) + "\\n").encode()
        zout.writestr(item, data)
EOF
      python3 /narcheck.py check ${LIB}/nifi-kafka-nar-2.11.0.nar ${LIB} >/dev/null 2>&1 && echo "withParent=accepted" || echo "withParent=refused"
      python3 /narcheck.py check /tmp/orphan.nar ${LIB} >/dev/null 2>&1 && echo "orphan=accepted" || echo "orphan=refused"
    `);
    expect(r.output).toContain('withParent=accepted');
    expect(r.output).toContain('orphan=refused');
  }, 900_000);
});

describe('B5-6 a type named only in a signature is seen', () => {
  let out = '';
  beforeAll(() => {
    out = inImage(`
      mkdir -p /tmp/j/org/nocodenation && cd /tmp/j
      cat > org/nocodenation/Sig.java <<'EOF'
package org.nocodenation;
public class Sig {
  public org.apache.nifi.flowfile.FlowFile only(org.apache.nifi.flowfile.FlowFile f) { return f; }
}
EOF
      cat > org/nocodenation/Lit.java <<'EOF'
package org.nocodenation;
public class Lit {
  public String name() { return "org/apache/nifi/processor/Invented"; }
}
EOF
      javac -nowarn -cp ${LIB}/nifi-api-2.10.0.jar -d /tmp/out org/nocodenation/Sig.java org/nocodenation/Lit.java || exit 1
      echo "javapSees=$(javap -p -cp /tmp/out org.nocodenation.Sig | grep -c FlowFile)"
      echo "refsSees=$(python3 /narcheck.py refs /tmp/out/org/nocodenation/Sig.class | grep -c FlowFile)"
      echo "literal=$(python3 /narcheck.py refs /tmp/out/org/nocodenation/Lit.class | grep -c Invented)"
    `).output;
  }, 900_000);

  test('B5-6 the parser reports it, as javap does', () => {
    expect(out).toContain('javapSees=1');
    expect(out).toContain('refsSees=1');
  });

  test('B5-7 while a class name inside a string is still not a reference', () => {
    // The counterpart, and the reason the walk parses the class structure
    // rather than scanning every UTF-8 constant.
    expect(out).toContain('literal=0');
  });
});
