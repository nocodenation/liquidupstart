/**
 * M-A0 · Contract · What the README promises, the configuration has to do
 *
 * Purpose:  This pairing exists because it failed once, expensively. `README.md`
 *           said *"All services bind to `localhost`"* from 2026-07-17 while
 *           `compose.yml` published the proxy on every interface, and the two
 *           said different things for two and a half months with nothing
 *           noticing — not three reviews, not a 560-case suite. `A0-7` and `A0-8`
 *           hold that one promise to its configuration.
 *
 *           On 2026-10-17 the README gained a section on building Java extensions
 *           for Liquid, and on the same reading it was found making a claim that
 *           had quietly become false: *"Four images are built locally"*, listing
 *           four and omitting `nar-builder`. `scripts/linux/build.sh` builds
 *           **five**. `CLAUDE.md` had already been corrected to five; the README
 *           had not, which is the two-copies defect in its usual shape.
 *
 *           So the new section is held to the same rule as the old promise: what
 *           the document tells a reader they can do, the stack has to be
 *           configured to do.
 * Given:    `README.md`, `compose.yml` and `scripts/linux/build.sh`, read as text
 * When:     Each promise in the new section is matched against the configuration
 *           that would have to carry it
 * Then:     The builder is a declared service, `nar-build` is mounted into the
 *           agent containers, the count of locally built images matches what the
 *           build script builds, and the two limits the section quotes are the
 *           two the checker enforces
 * Covers:   A0-11
 * Negative: The count. A document that says "four" while five are built is the
 *           defect this file exists for, and it is the one scenario here that was
 *           red when it was written.
 *
 * Not asserted: that a build works. That is `B1-5` and the M-B milestones, which
 *           drive the real builder. This file asks only whether the document and
 *           the configuration agree — which is the thing that went wrong before.
 */

import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
const compose = readFileSync(join(repoRoot, 'compose.yml'), 'utf8');
const buildScript = readFileSync(join(repoRoot, 'scripts/linux/build.sh'), 'utf8');
const narcheck = readFileSync(join(repoRoot, 'config/liquid/narcheck.py'), 'utf8');

describe('A0-11 the README section on Java extensions is backed by the configuration', () => {
  test('A0-11 it tells the reader the stack builds NARs, and the builder is a declared service', () => {
    expect(readme).toContain('## Java extensions for Liquid');
    expect(compose).toMatch(/^ {2}nar_builder:$/m);
  });

  test('A0-11 it tells them to run `nar-build` in an agent container, and the command is mounted there', () => {
    // The promise is "run this in an agent container". Three services carry the
    // command, so the claim holds for whichever one the reader opens.
    expect(readme).toContain('nar-build --target');
    const mounts = compose
      .split('\n')
      .filter((l) => l.includes('/usr/local/bin/nar-build'));
    expect(mounts.length, 'nar-build is not mounted into any service').toBeGreaterThanOrEqual(3);
    for (const m of mounts) expect(m).toContain(':ro');
  });

  test('A0-11 it says the deployment is judged first, and a refusal directory exists for what fails', () => {
    expect(readme).toContain('volumes/nar_extensions/refused/');
    expect(compose).toContain('./volumes/nar_extensions');
  });

  test('A0-11 the two limits it quotes are the two the checker enforces', () => {
    // Quoted figures in prose are the kind that drift. These are the ones in the
    // file, and if either constant moves the README has to move with it.
    expect(readme).toMatch(/\*\*256 MiB\*\*/);
    expect(readme).toMatch(/\*\*512 MiB\*\*/);
    expect(narcheck).toMatch(/^MAX_BUNDLED_JAR_BYTES = 256 << 20$/m);
    expect(narcheck).toMatch(/^MAX_CLASS_BYTES = 512 << 20$/m);
  });

  test('A0-11 the negative: the count of locally built images is the number actually built', () => {
    // Red when this was written: the README said four and listed four, omitting
    // nar-builder, while build.sh builds five. CLAUDE.md had already been
    // corrected and the README had not.
    const built = [...buildScript.matchAll(/^"\$\{PROJECT_DIR\}\/config\/scripts\/build\/([a-z-]+)\.sh"/gm)].map(
      (m) => m[1]
    );
    expect(built.length, 'no build steps found').toBeGreaterThan(0);
    const words: Record<number, string> = { 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven' };
    expect(readme).toContain(`${words[built.length]} images are built locally`);
    // And each one is named, so the list cannot drift from the count.
    for (const name of built) expect(readme).toContain(name);
  });
});
