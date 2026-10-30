/**
 * M-CS · Integration · No pairing listing without OpenClaw
 *
 * Purpose:  The pairing card polls `GET /openclaw-pairing` every fifteen seconds, and each
 *           poll runs `config/scripts/openclaw-pairing.sh`, which runs the OpenClaw image.
 *           With OpenClaw switched off the image may be gone, and a tab opened before the
 *           switch would show an error on every poll. So the route answers an empty
 *           listing without running the script, and refuses an approval.
 * Given:    the project `tests/lib/pairingproject.ts` owns, whose
 *           `config/scripts/openclaw-pairing.sh` is replaced by a stub that writes `ran` to
 *           `pairing-ran` in the project and prints an empty listing; the route
 *           `dashboard/src/routes/openclaw-pairing/+server.ts`, called in-process as OC-72
 *           calls it, with the headers the card's own GET sends: no `Origin`,
 *           `Sec-Fetch-Site: same-origin`.
 * When:     GET and POST with `ENABLE_OPENCLAW=0` in the project's `.env`, then GET with
 *           `ENABLE_OPENCLAW=1`. Added on 2026-10-30, for the review on #56: GET with
 *           `ENABLE_OPENCLAW=1` while the stub script answers as the real one does for an image
 *           that is not built -- exit 3 and `liquidupstart/openclaw:latest is not built here.` on
 *           stderr -- and while it exits 3 with `boom` instead; POST while the stub answers so
 *           for every call, and while it lists a pending request and answers so for `approve`
 *           alone, an image removed between the listing and the press.
 * Then:     Off, GET answers 200 with `{ ok: true, disabled: true, pending: [], revoked: [] }`
 *           and no `pairing-ran`; POST answers 409 naming the switch. On, GET runs the
 *           script, `pairing-ran` exists, and the body is the stub's listing. The image not built
 *           is answered as OpenClaw off, so a card mounted from a saved `.env` that switched
 *           OpenClaw on before a build stays silent; an exit 3 without the line is the error it
 *           is, `ok: false` with the script's words. An approval against an image that is not
 *           built answers 409 naming it, where it said that nothing was waiting, and so does one
 *           whose image goes away between the listing and the approval, while an approval that
 *           exits 3 for a reason of its own still answers 502 with the CLI's words (the local
 *           reviews of 2026-10-30).
 * Covers:   CS-14, CS-FR10, CS-FR15
 * Negative: with OpenClaw off the script does not run; with its image not built, the answer
 *           is the switched-off one.
 * Counterpart: with OpenClaw on it does, so a route that never ran it cannot pass; and an
 *           exit 3 without the script's line still reads as a failure, so a route that called
 *           every exit 3 "not built" cannot pass.
 *
 * Test data: the stub prints `{"pending":[],"paired":[]}`. The `.env` files are
 * `ENABLE_OPENCLAW=0` and `ENABLE_OPENCLAW=1`, each alone; the file is removed afterwards,
 * because the other pairing files share this project and read an absent `.env` as on. The
 * POST body is `{"deviceId":"dev-alpha-aaaaaaaaaaaa"}`, OC-72's device. `boom` is shaped as a
 * failure of the CLI's own that happens to exit 3. The listing for the race is one pending
 * request of that device: `requestId` `11111111-2222-3333-4444-555555555555`, `clientId`
 * `openclaw-control-ui`, `role` `operator`, the shape the card's rule lets through.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectDir, script } from '../lib/pairingproject';
// Registers the `$lib` modules and SvelteKit's `json` the route imports.
import { ROUTES } from '../lib/svelte';

const MARKER = join(projectDir, 'pairing-ran');
const ENV = join(projectDir, '.env');
const REFUSAL = 'OpenClaw is switched off — turn it on under Which apps to run in Configuration first.';

script(`#!/usr/bin/env bash\nprintf 'ran' > ${JSON.stringify(MARKER)}\nprintf '%s' '{"pending":[],"paired":[]}'\n`);
const ROUTE = join(ROUTES, 'openclaw-pairing', '+server.ts');
const route = await import(ROUTE);

const previous = process.env.ENV_DIR;
afterAll(() => {
  rmSync(ENV, { force: true });
  rmSync(MARKER, { force: true });
  // The empty listing pairingproject writes, for the files after this one.
  script('#!/usr/bin/env bash\nprintf \'%s\' \'{"pending":[],"paired":[]}\'\n');
  if (previous === undefined) delete process.env.ENV_DIR;
  else process.env.ENV_DIR = previous;
});

async function call(method: 'GET' | 'POST', openclaw: '0' | '1') {
  process.env.ENV_DIR = projectDir;
  writeFileSync(ENV, `ENABLE_OPENCLAW=${openclaw}\n`);
  rmSync(MARKER, { force: true });
  const headers: Record<string, string> = { 'sec-fetch-site': 'same-origin' };
  if (method === 'POST') headers.origin = process.env.ORIGIN ?? 'http://localhost:7777';
  const request = new Request('http://localhost:7777/openclaw-pairing', {
    method,
    headers,
    ...(method === 'POST' ? { body: JSON.stringify({ deviceId: 'dev-alpha-aaaaaaaaaaaa' }) } : {})
  });
  const response: Response = await (method === 'GET' ? route.GET : route.POST)({ request });
  return { status: response.status, body: await response.json(), ran: existsSync(MARKER) };
}

describe('CS-14 no pairing listing without OpenClaw', () => {
  test('CS-14 the negative: with OpenClaw off, GET answers disabled and never runs the script', async () => {
    const r = await call('GET', '0');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, disabled: true, pending: [], revoked: [] });
    expect(r.ran).toBe(false);
  });

  test('CS-14 and POST answers 409 naming the switch', async () => {
    const r = await call('POST', '0');
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ ok: false, message: REFUSAL });
    expect(r.ran).toBe(false);
  });

  test('CS-14 the counterpart: with OpenClaw on, GET runs the script', async () => {
    const r = await call('GET', '1');
    expect(r.status).toBe(200);
    expect(r.ran).toBe(true);
    expect(r.body.ok).toBe(true);
    expect(r.body.pending).toEqual([]);
    expect(r.body).not.toHaveProperty('disabled');
  });

  test('CS-14 the negative: the script\'s answer for an image not built reads as switched off', async () => {
    script(`#!/usr/bin/env bash\nprintf 'ran' > ${JSON.stringify(MARKER)}\necho 'liquidupstart/openclaw:latest is not built here.' >&2\nexit 3\n`);
    const r = await call('GET', '1');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, disabled: true, pending: [], revoked: [] });
    expect(r.ran).toBe(true);
  });

  test('CS-14 and an approval against it answers 409 naming the image', async () => {
    script(`#!/usr/bin/env bash\necho 'liquidupstart/openclaw:latest is not built here.' >&2\nexit 3\n`);
    const r = await call('POST', '1');
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ ok: false, message: 'OpenClaw is switched on, but its image is not built yet — run Build first.' });
  });

  // The listing succeeds and the approval exits 3 with `stderr`: an image removed between the two.
  // The approve branch leaves a marker, so the answer is shown to come from `approve()`.
  const APPROVED = join(projectDir, 'approve-ran');
  afterAll(() => rmSync(APPROVED, { force: true }));
  const raceStub = (stderr: string) => {
    const listing = JSON.stringify({
      pending: [{ requestId: '11111111-2222-3333-4444-555555555555', deviceId: 'dev-alpha-aaaaaaaaaaaa', clientId: 'openclaw-control-ui', role: 'operator', scopes: [], ts: 1 }],
      paired: []
    });
    rmSync(APPROVED, { force: true });
    return `#!/usr/bin/env bash\nif [ "$2" = list ]; then printf '%s' '${listing}'; exit 0; fi\nprintf '%s' "$3" > ${JSON.stringify(APPROVED)}\n${stderr}\nexit 3\n`;
  };

  test('CS-14 and an image removed between the listing and the approval answers the same 409', async () => {
    script(raceStub(`echo 'liquidupstart/openclaw:latest is not built here.' >&2`));
    const r = await call('POST', '1');
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ ok: false, message: 'OpenClaw is switched on, but its image is not built yet — run Build first.' });
    expect(existsSync(APPROVED)).toBe(true);
  });

  test('CS-14 the counterpart: an approval that exits 3 without that line is the CLI\'s failure, as before', async () => {
    script(raceStub('echo boom >&2'));
    const r = await call('POST', '1');
    expect(r.status).toBe(502);
    expect(r.body).toEqual({ ok: false, message: 'boom' });
    expect(existsSync(APPROVED)).toBe(true);
  });

  test('CS-14 the counterpart: an exit 3 without that line is the error it is', async () => {
    script(`#!/usr/bin/env bash\necho boom >&2\nexit 3\n`);
    const r = await call('GET', '1');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(false);
    expect(r.body.message).toBe('boom');
    expect(r.body).not.toHaveProperty('disabled');
  });
});
