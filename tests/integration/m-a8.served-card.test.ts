/**
 * M-A8 · Integration · The launchpad an operator actually opens
 *
 * Purpose:  A8-4 proves the repositories reach the page object; it cannot prove
 *           anything renders them, and a load returning a field no template
 *           reads is the same defect one layer up. .env.example promises the
 *           operator that "the dashboard shows you each key", so the claim
 *           under test is a served page, fetched over HTTP from a dashboard
 *           this test builds and starts for itself. Two of the three states it
 *           covers are states a working installation does not have — before the
 *           first start there are no keys, and a manifest can go missing while
 *           the declaration still names two repositories — so a fixture project
 *           is the only way to reach them.
 * Given:    Three fixture projects, each served by its own container of the
 *           real dashboard image with ENV_DIR pointing at it: one declaring
 *           liquid-flows (write|protected, cloned) and agent-skills
 *           (read|direct, failed) with their generated keys and a manifest; one
 *           declaring both with no volumes/_git-secrets at all; and one
 *           declaring both with keys but no manifest, then a manifest truncated
 *           mid-JSON.
 * When:     The launchpad is fetched with GET /.
 * Then:     Every declared repository's label, public key and fingerprint are
 *           in the rendered markup — searched with the hydration payload
 *           stripped out, so a page that ships the data without drawing it
 *           fails; the second project's card names starting the stack as the
 *           next step; and the third says both repositories are declared and
 *           their state unknown, in both broken-manifest states, with the page
 *           still answering 200.
 * Covers:   A8-6, A8-7, A8-14, A8-20, A8-22, FR3, FR10, FR11, FR20, U2, U11
 * Unhappy:  A8-7 and A8-14 are the unhappy twins of A8-6: an empty card in
 *           either state reads as "nothing declared", which is false and leaves
 *           the operator with nothing to do next.
 */
import { test, expect, afterAll, beforeAll } from 'bun:test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import {
  FLOWS,
  PAIR_DECLARATION,
  SKILLS,
  declaredEnv,
  generateKeyPair,
  manifestPath,
  newProject,
  pairProject,
  readManifestFile,
  resetProject,
  sha256Of
} from '../lib/gitproject';
import {
  buildDashboardImage,
  get,
  removeImage,
  startDashboard,
  withoutScripts,
  type Dashboard
} from '../lib/dashboardserver';
import { join } from 'node:path';

const TAG = 'liquidupstart/dashboard:m-a8-served';
const TRUNCATED = '{\n  "generated": "2026-09-07T09:00:00Z",\n  "repositories": [\n    { "name": "liq';

const ready = newProject('lu-a8-served-ready-');
const unprepared = newProject('lu-a8-served-unprepared-');
const unknown = newProject('lu-a8-served-unknown-');
const started: Dashboard[] = [];

let readyPage: { status: number; html: string };
let unpreparedPage: { status: number; html: string };
let unknownPage: { status: number; html: string };
let truncatedPage: { status: number; html: string };
let driftedPage: { status: number; html: string };

beforeAll(async () => {
  const built = buildDashboardImage(TAG);
  expect(built.code, `docker build failed:\n${built.output}`).toBe(0);

  pairProject(ready);

  resetProject(unprepared);
  declaredEnv(unprepared, PAIR_DECLARATION);

  resetProject(unknown);
  declaredEnv(unknown, PAIR_DECLARATION);
  generateKeyPair(unknown, FLOWS.slug);
  generateKeyPair(unknown, SKILLS.slug);

  const [a, b, c] = await Promise.all([
    startDashboard(ready, 'lu-a8-ready', TAG),
    startDashboard(unprepared, 'lu-a8-unprepared', TAG),
    startDashboard(unknown, 'lu-a8-unknown', TAG)
  ]);
  started.push(a, b, c);

  readyPage = await get(a, '/');
  unpreparedPage = await get(b, '/');
  unknownPage = await get(c, '/');

  writeFileSync(manifestPath(unknown), TRUNCATED);
  truncatedPage = await get(c, '/');

  // Last, and restored immediately: the manifest loses one of the two the
  // declaration names, which is what a save without a restart leaves and what a
  // scoped retry passes through. The page has to draw the pending list, not
  // merely carry it -- the same claim A8-6 makes about the repositories.
  const whole = readFileSync(manifestPath(ready), 'utf8');
  const narrowed = JSON.parse(whole);
  narrowed.repositories = narrowed.repositories.slice(0, 1);
  writeFileSync(manifestPath(ready), JSON.stringify(narrowed, null, 2));
  driftedPage = await get(a, '/');
  writeFileSync(manifestPath(ready), whole);
});

afterAll(() => {
  for (const dashboard of started) dashboard.stop();
  removeImage(TAG);
  for (const dir of [ready, unprepared, unknown]) rmSync(dir, { recursive: true, force: true });
});

test('A8-6 the launchpad answers, and names every repository the manifest declares', () => {
  expect(readyPage.status).toBe(200);
  const markup = withoutScripts(readyPage.html);

  for (const entry of readManifestFile(ready).repositories) {
    expect(markup).toContain(`${entry.host}/${entry.path}`);
  }
});

test('A8-6 each repository shows the public key on disk, and its fingerprint', () => {
  const markup = withoutScripts(readyPage.html);

  for (const entry of readManifestFile(ready).repositories) {
    const file = join(ready, entry.publicKeyFile);
    expect(markup).toContain(readFileSync(file, 'utf8').trim());
    expect(markup).toContain(sha256Of(file));
  }
});

test('A8-6 the card is served even though the stack is not running', () => {
  const markup = withoutScripts(readyPage.html);

  expect(markup).not.toContain('Liquid.MX');
  expect(markup).toContain('github.com/nocodenation/liquid-flows');
});

test('A8-7 before the first start the card names starting the stack as the next step', () => {
  expect(unpreparedPage.status).toBe(200);
  const markup = withoutScripts(unpreparedPage.html);

  expect(markup.toLowerCase()).toContain('start the stack');
  expect(markup).toContain('2 repositories are declared');
  expect(markup).toContain('github.com/nocodenation/liquid-flows');
  expect(markup).toContain('github.com/nocodenation/agent-skills');
  expect(markup).not.toContain('No repositories are declared');
});

test('A8-14 a declaration with no manifest is reported as declared and unaccounted for', () => {
  expect(unknownPage.status).toBe(200);
  const markup = withoutScripts(unknownPage.html);

  expect(markup).toContain('2 repositories are declared');
  expect(markup).toContain('state is unknown');
  expect(markup.toLowerCase()).toContain('start the stack');
  expect(markup).not.toContain('No repositories are declared');
});

test('A8-14 a manifest truncated mid-JSON reads the same, and does not crash the page', () => {
  expect(truncatedPage.status).toBe(200);
  const markup = withoutScripts(truncatedPage.html);

  expect(markup).toContain('2 repositories are declared');
  expect(markup).toContain('state is unknown');
  expect(markup).toContain('github.com/nocodenation/agent-skills');
});

test('A8-20 a repository the manifest lost is still drawn, and named as pending', () => {
  const markup = withoutScripts(driftedPage.html);

  expect(driftedPage.status).toBe(200);
  expect(markup).toContain('github.com/nocodenation/agent-skills');
  expect(markup).toContain('not yet prepared');
  expect(markup).toContain('no deploy key yet');
});

test('A8-22 the unreachable repository is served with the control that tests it', () => {
  // Between A8-9 (canRetry is false on the cloned one) and A8-8 (the action
  // really clones) sits the question neither asks: is a control drawn that
  // reaches the action. The same defect that started this milestone -- a route
  // that was correct and called by nothing -- one layer further out.
  const markup = withoutScripts(readyPage.html);
  const blocks = markup.split('<li').filter((b) => b.includes('gitrepo-head'));
  const of = (label: string) => blocks.find((b) => b.includes(label)) ?? '';

  expect(blocks.length).toBe(2);
  expect(of(`${SKILLS.host}/${SKILLS.path}`)).toContain('Test this repository');
});

test('A8-22 and the cloned one is not, because it needs no test', () => {
  const markup = withoutScripts(readyPage.html);
  const blocks = markup.split('<li').filter((b) => b.includes('gitrepo-head'));
  const of = (label: string) => blocks.find((b) => b.includes(label)) ?? '';

  expect(of(`${FLOWS.host}/${FLOWS.path}`)).not.toContain('Test this repository');
});
