/**
 * M-B2 · Integration · The built NAR still carries neither API
 *
 * Purpose:  M-B1's first synthesised pom bundled nifi-api-2.10.0.jar and
 *           slf4j-api into the archive, dragged in transitively by nifi-utils,
 *           which B1-5 caught by looking inside it. A NAR carrying its own copy
 *           of the API the framework provides is the silently-broken artifact
 *           FR23 exists to prevent. M-B2 changes how that very dependency's
 *           version is chosen, so the guarantee is re-asserted at the new
 *           version rather than assumed to have survived the change.
 * Given:    volumes/repos/.b2-bundles holding the B1-5 fixture —
 *           ProbeProcessor.java with an empty onTrigger body and
 *           src/main/resources/META-INF/services/org.apache.nifi.processor.Processor
 *           naming org.nocodenation.probe.ProbeProcessor. No pom.xml, so the
 *           project is synthesised with nifi-api resolved through nifi-utils.
 * When:     nar-build is run against it inside opencode and the resulting .nar
 *           in volumes/nar_extensions is listed with unzip.
 * Then:     Exit 0; the archive holds no nifi-api-*.jar and no slf4j-api-*.jar
 *           anywhere in it, and it does carry the processors jar — so the
 *           absence is a scoping decision and not an empty archive. The
 *           framework's own copies are the ones that load.
 * Covers:   B2-4, FR27, FR23
 * Unhappy:  The negative half is the assertion itself: either jar appearing in
 *           the entry list fails the case, which is how the M-B1 defect was
 *           found.
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
  DROP_HOST
} from '../lib/narfixture';
import type { Result } from '../lib/shell';

stackGuard(['liquid', 'nar_builder', 'opencode']);

const fx = seedSource('.b2-bundles');
const before = dropContents();
let run: Result;
let produced: string[] = [];
let entries: string[] = [];

afterAll(() => {
  dropFixture(fx);
  for (const f of produced) rmSync(join(DROP_HOST, f), { force: true });
});

test('B2-4 the build succeeds and writes one NAR', () => {
  run = narBuild('opencode', fx.container);
  produced = dropContents().filter((f) => !before.includes(f));
  expect(run.code).toBe(0);
  expect(produced.length).toBe(1);
  entries = narEntries(join(DROP_HOST, produced[0]));
}, 1_200_000);

test('B2-4 the archive was read and carries the processors jar', () => {
  expect(entries.length).toBeGreaterThan(0);
  expect(entries.some((e) => /processors.*\.jar$/.test(e))).toBe(true);
});

test('B2-4 no nifi-api jar is bundled', () => {
  expect(entries.filter((e) => /nifi-api-.*\.jar$/.test(e))).toEqual([]);
});

test('B2-4 no slf4j-api jar is bundled', () => {
  expect(entries.filter((e) => /slf4j-api-.*\.jar$/.test(e))).toEqual([]);
});
