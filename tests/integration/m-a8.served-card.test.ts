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
 *           mid-JSON. Since 2026-10-27 the second project is also served with
 *           its declaration emptied, and then with one the parser refuses, before
 *           it is put back: the card reads .env on every request.
 * When:     The launchpad is fetched with GET /.
 * Then:     Every declared repository's label, public key and fingerprint are
 *           in the rendered markup — searched with the hydration payload
 *           stripped out, so a page that ships the data without drawing it
 *           fails; the second project's card names starting the stack as the
 *           next step; and the third says both repositories are declared and
 *           their state unknown, in both broken-manifest states, with the page
 *           still answering 200. A project that declares nothing is served no
 *           repositories card at all, and one whose declaration cannot be read
 *           keeps the card, with the parser's reason, and a hint that names the
 *           section *Git integration* rather than a number.
 * Covers:   A8-6, A8-7, A8-14, A8-20, A8-22, A8-25, A8-37, FR3, FR10, FR11, FR20, U2, U11
 * Unhappy:  A8-7 and A8-14 are the unhappy twins of A8-6: an empty card in
 *           either state reads as "nothing declared", which is false and leaves
 *           the operator with nothing to do next. A8-37's negative is the other
 *           direction: a card where nothing is declared reads as a fault, which is
 *           false too, and its counterparts keep the card wherever there is
 *           something to say.
 *
 * Test data for A8-37, written into the second project's .env in turn:
 * `GIT_REPOSITORIES` empty, by `declaredEnv(dir, '')`; and `git@github.com:nocodenation/liquid-flows.git|sometimes|protected`,
 * which `git-repos.sh parse` refuses with *"access must be read or write, not
 * 'sometimes'"*. The heading searched for is `Agent repositories`, the card's own;
 * the hint, *"Declare them under Git integration in the"*, with no `section` and
 * a number anywhere on the page.
 *
 * Amended 2026-09-30, after this file failed 2 of 3 runs on an idle machine.
 * Twice it was measuring the machine rather than the product, and both times the
 * red said A8-20 was broken.
 *
 * **The page was fetched before the container could see the write.** The project
 * is a bind mount and Docker Desktop propagates a host write with a delay, so a
 * manifest narrowed and fetched at once was served as it had been. A 1.5s wait
 * made it 3 of 3, which is what identified the cause -- and is why the wait is on
 * a condition rather than on the clock: a fixed sleep is a guess that goes flaky
 * again on a slower host.
 *
 * *Amended again 2026-10-02.* The first repair polled the **page** until it said
 * what the case expected, and that was worse than the flake in the way that
 * matters. A predicate about the product turns a product defect into a timeout:
 * reword the heading and the wait expires, bun reports one `(unnamed)` failure,
 * and none of the ten tests runs -- where before the repair the same change gave a
 * named A8-20 failure beside nine passes. The truncated-manifest predicate waited
 * for `could not be read`, which no assertion here checks, so it added an
 * assertion the specification does not have. A1 of the 2026-10-01 review.
 *
 * The wait is on the bytes the container reads -- `docker exec cat` against the
 * manifest -- and the verdict is left to the assertions, which is where it
 * belongs.
 *
 * **And two runs on one host destroyed each other.** The container names and the
 * image tag were fixed strings, and startDashboard runs `docker rm -f <name>`
 * before it starts, so a second checkout removed the first one's containers:
 * `could not start lu-a8-unprepared: … No such container`. Both carry a per-run
 * id now, from `RUN_ID` in tests/lib/dashboardserver.ts.
 *
 * Measured after both: 3 of 3 alone, and two concurrent runs from different
 * checkouts both green.
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
  awaitFileInContainer,
  throwawayTag,
  type Dashboard
} from '../lib/dashboardserver';
import { join } from 'node:path';

const TAG = throwawayTag('liquidupstart/dashboard:m-a8-served');
const TRUNCATED = '{\n  "generated": "2026-09-07T09:00:00Z",\n  "repositories": [\n    { "name": "liq';

const ready = newProject('lu-a8-served-ready-');
const unprepared = newProject('lu-a8-served-unprepared-');
const unknown = newProject('lu-a8-served-unknown-');
const MISDECLARATION = 'git@github.com:nocodenation/liquid-flows.git|sometimes|protected';
const started: Dashboard[] = [];

let readyPage: { status: number; html: string };
let unpreparedPage: { status: number; html: string };
let unknownPage: { status: number; html: string };
let truncatedPage: { status: number; html: string };
let driftedPage: { status: number; html: string };
let reloadedPage: { status: number; html: string };
let undeclaredPage: { status: number; html: string };
let misdeclaredPage: { status: number; html: string };

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

  // **allSettled, and everything that started is pushed before anything throws.**
  // `Promise.all` rejects on the first failure and abandons the other two, so a
  // single container that never published a port left two running dashboards and
  // an image behind -- with per-run names, nothing ever names them again, so the
  // leak is permanent. A2 of the 2026-10-01 review; the reply said this was done
  // and it was not, which the reviewer found by grepping for `allSettled` in
  // `tests/` and finding none, 2026-10-20.
  const outcomes = await Promise.allSettled([
    startDashboard(ready, 'lu-a8-ready', TAG),
    startDashboard(unprepared, 'lu-a8-unprepared', TAG),
    startDashboard(unknown, 'lu-a8-unknown', TAG)
  ]);
  for (const o of outcomes) if (o.status === 'fulfilled') started.push(o.value);
  const failed = outcomes.flatMap((o) => (o.status === 'rejected' ? [String(o.reason)] : []));
  // The failure is still a failure -- afterAll now has the survivors to stop.
  if (failed.length > 0) throw new Error(failed.join('; '));
  const [a, b, c] = started;

  readyPage = await get(a, '/');
  unpreparedPage = await get(b, '/');
  unknownPage = await get(c, '/');

  // A8-37, on the second project, and put back: nothing declared, then a
  // declaration the parser refuses. Waited on the bytes the container reads, as
  // the manifest writes below are.
  const unpreparedEnv = join(unprepared, '.env');
  for (const [declaration, keep] of [
    ['', (p: { status: number; html: string }) => (undeclaredPage = p)],
    [MISDECLARATION, (p: { status: number; html: string }) => (misdeclaredPage = p)]
  ] as const) {
    declaredEnv(unprepared, declaration);
    await awaitFileInContainer(b, unpreparedEnv, readFileSync(unpreparedEnv, 'utf8'));
    keep(await get(b, '/'));
  }
  declaredEnv(unprepared, PAIR_DECLARATION);
  await awaitFileInContainer(b, unpreparedEnv, readFileSync(unpreparedEnv, 'utf8'));

  writeFileSync(manifestPath(unknown), TRUNCATED);
  // Waited for, not assumed, and waited on the file rather than on the page: the
  // project is a bind mount and the container does not see a host write at once.
  // See awaitFileInContainer -- a predicate about the page would add an assertion
  // this case does not make, and report a product change as a timeout.
  await awaitFileInContainer(c, manifestPath(unknown), TRUNCATED);
  truncatedPage = await get(c, '/');

  // Last, and restored immediately: the manifest loses one of the two the
  // declaration names, which is what a save without a restart leaves and what a
  // scoped retry passes through. The page has to draw the pending list, not
  // merely carry it -- the same claim A8-6 makes about the repositories.
  reloadedPage = await get(a, '/');

  const whole = readFileSync(manifestPath(ready), 'utf8');
  const narrowed = JSON.parse(whole);
  narrowed.repositories = narrowed.repositories.slice(0, 1);
  const narrowedJson = JSON.stringify(narrowed, null, 2);
  writeFileSync(manifestPath(ready), narrowedJson);
  await awaitFileInContainer(a, manifestPath(ready), narrowedJson);
  driftedPage = await get(a, '/');
  writeFileSync(manifestPath(ready), whole);
  // An explicit budget, because the default is bun's 60s hook timeout: an image
  // build, three container starts and two waits all live in here, and past 60s bun
  // prints one `(unnamed)` failure and the diagnosis is lost. B1c of the
  // 2026-10-01 review.
}, 600_000);

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

test('A8-25 a second fetch reports the same state, because it is not held in a session', () => {
  // A8-17 step 5 asks an operator to reload and see the unreachable repository
  // still named. It was not performed on 2026-09-08, and it need not be: the
  // card is rendered server-side from the manifest, so a fresh request with no
  // prior exchange is the same claim, made without an installation to break.
  const first = withoutScripts(readyPage.html);
  const again = withoutScripts(reloadedPage.html);
  const block = (html: string) =>
    html.split('<li').find((b) => b.includes(`${SKILLS.host}/${SKILLS.path}`)) ?? '';

  expect(reloadedPage.status).toBe(200);
  expect(block(again)).toContain('unreachable');
  expect(block(again)).toBe(block(first));
});

test('A8-37 a project that declares no repository is served no repositories card', () => {
  expect(undeclaredPage.status).toBe(200);
  const markup = withoutScripts(undeclaredPage.html);

  expect(markup).not.toContain('Agent repositories');
  expect(markup).not.toContain('No repositories are declared');
});

test('A8-37 the counterpart: a declaration that cannot be read keeps the card, with the reason', () => {
  expect(misdeclaredPage.status).toBe(200);
  const markup = withoutScripts(misdeclaredPage.html);

  expect(markup).toContain('Agent repositories');
  expect(markup).toContain("access must be read or write, not 'sometimes'");
});

test('A8-37 and the card sends the operator to Git integration by name, not by a number', () => {
  // It said "section 10" after #5 had made Git integration section 11, and the
  // configuration view numbers its sections itself since A8-38: a number drifts.
  const markup = withoutScripts(misdeclaredPage.html);

  expect(markup).toContain('Declare them under Git integration in the');
  expect(markup).not.toMatch(/\bsections? \d/i);
});

test('A8-37 and a project that declares repositories keeps its card', () => {
  expect(withoutScripts(readyPage.html)).toContain('Agent repositories');
  expect(withoutScripts(unpreparedPage.html)).toContain('Agent repositories');
});
