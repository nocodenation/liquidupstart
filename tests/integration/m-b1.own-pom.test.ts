/**
 * M-B1 · Integration · An author's own pom.xml is used, not overwritten
 *
 * Purpose:  The synthesiser must not become a ceiling. A processor needing a
 *           real dependency — an SSL context service API, a client library —
 *           can only declare it in a pom, and a tool that silently regenerated
 *           over it would be unusable for exactly the work it is meant to
 *           enable. This is a positive counterpart to B1-5, not an edge case.
 * Given:    volumes/repos/.b1-ownpom: the B1-5 fixture plus a pom.xml whose
 *           artifactId is probe-with-pom — distinguishable from anything the
 *           synthesiser produces, which names artifacts after the source
 *           directory — carrying org.apache.commons:commons-lang3:3.17.0, a
 *           dependency the synthesised form never adds. Its nifi-api version
 *           and compiler release are taken from nar-build --target, so the
 *           fixture bends to the running Liquid rather than pinning a literal.
 * When:     nar-build is run against that directory inside opencode.
 * Then:     Exit 0; the artifact is named from that pom; and the declared
 *           dependency is bundled in the NAR, which only happens if the author's
 *           pom was the one that was built.
 * Covers:   B1-6, U9, FR21
 * Unhappy:  A regenerated pom fails both assertions — the name would come from
 *           the directory and commons-lang3 would be absent.
 */
import { test, expect, afterAll } from 'bun:test';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { stackGuard } from '../lib/guard';
import {
  seedSource,
  dropFixture,
  narBuild,
  dropContents,
  narEntries,
  ownPom,
  target,
  targetField,
  OWN_POM_ARTIFACT,
  OWN_POM_DEPENDENCY,
  DROP_HOST
} from '../lib/narfixture';
import type { Result } from '../lib/shell';

stackGuard(['liquid', 'nar_builder', 'opencode']);

const resolved = target();
const fx = seedSource('.b1-ownpom', {
  pom: ownPom(
    targetField(resolved.stdout, 'nifi_api_version') || targetField(resolved.stdout, 'nifi_version'),
    targetField(resolved.stdout, 'java_major')
  )
});
const before = dropContents();
let run: Result;
let produced: string[] = [];

afterAll(() => {
  dropFixture(fx);
  for (const f of produced) rmSync(join(DROP_HOST, f), { force: true });
});

test('B1-6 the build succeeds', () => {
  run = narBuild('opencode', fx.container);
  produced = dropContents().filter((f) => !before.includes(f));
  expect(run.output).toBeTruthy();
  expect(run.code).toBe(0);
}, 1_200_000);

test('B1-6 the artifact is named from the author pom, not from the directory', () => {
  expect(produced.length).toBe(1);
  expect(produced[0]).toContain(OWN_POM_ARTIFACT);
  expect(produced[0]).not.toContain('b1-ownpom');
});

test('B1-6 the dependency the author declared is in the build', () => {
  const entries = narEntries(join(DROP_HOST, produced[0]));
  expect(entries.some((e) => e.includes(OWN_POM_DEPENDENCY))).toBe(true);
});
