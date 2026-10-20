/**
 * M-OC · Integration · The route, driven rather than read
 *
 * Purpose:  B5 of the 2026-10-01 review: *"The route has no behavioural test: the
 *           Origin checks, the 409 from a `chooseRequest` refusal, the 502, the
 *           empty-body POST. OC-59 is a pattern over the source."* A pattern over
 *           the source cannot tell a check that runs from a check that is spelled
 *           out, which is the shape this milestone has several entries about.
 *
 *           It also holds C3 of the same review, repaired here: `wrongOrigin`
 *           refused an origin that **named itself** and differed, so a GET with no
 *           `Origin` header at all passed — and a GET spawns one `docker run` of
 *           the OpenClaw image. GET now checks exactly as POST does.
 * Given:    a throwaway project whose `config/scripts/openclaw-pairing.sh` is a
 *           stub, rewritten per scenario, and `ORIGIN` set to
 *           `http://dash.example`
 * When:     `GET` and `POST` are called with the header sets a browser really
 *           sends -- measured 2026-10-14, two local origins, headless Chrome, and
 *           recorded in the table under **Data**
 * Then:     a foreign origin is refused, and so are the two cross-origin shapes
 *           that send no `Origin` at all; the card's own GET, which also sends
 *           none, is served; a listing failure is 502; an unresolvable body is
 *           409; and a body naming the waiting device is approved
 * Covers:   OC-72, OC-59, R2
 * Data:     the stub answers `devices.list` with one of four listings, all stated
 *           in full below: `WAITING` (one Control UI browser, device
 *           `dev-alpha-aaaaaaaaaaaa`, request `09cc464f-...`, from `10.99.0.9`),
 *           `AMBIGUOUS` (that one plus `dev-beta-bbbbbbbbbbbb`), `NOT_OURS` (the
 *           node host, `openclaw-node`/`node`, which must not be approvable from
 *           this card) and `BROKEN` (exit 1 with `Gateway call failed:
 *           devices.list` on stderr). `ORIGIN` is `http://dash.example`; the
 *           foreign origin is `http://evil.example`.
 *
 *           The header sets are the measurement, not an invention. From a page on
 *           another port: `<img>` → no `Origin`, `Sec-Fetch-Site: same-site`,
 *           mode `no-cors`, dest `image`; `fetch(..., {mode:'no-cors'})` → the
 *           same without the dest; a plain cross-origin `fetch` → `Origin:
 *           http://localhost:7902`, site `same-site`. From the dashboard's own
 *           page: GET → **no `Origin`**, site `same-origin`; POST → `Origin`
 *           present, site `same-origin`. curl → neither header.
 *
 *           `same-site` and not `cross-site`, because both probes were on
 *           `localhost` and a port does not make a different site. A check
 *           written against `cross-site` would pass every case here and miss the
 *           one that matters: another service on another local port, which is
 *           this dashboard's ordinary neighbour.
 * Unhappy:  Seven of the thirteen scenarios are refusals, which is what a route is for.
 *           The six that permit are what keep them from being met by a route
 *           that refuses everything: a 403-for-all route, or one whose listing
 *           never parses, passes every refusal here on its own.
 *
 * On `$lib`: that is Vite's alias and bun knows nothing about it, so this file
 * registers the same one-line resolver `tests/lib/mount.ts` uses. No DOM is
 * involved here, so the component tier's machinery is not loaded.
 */
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { join } from 'node:path';
import { plugin } from 'bun';
import { repoRoot } from '../lib/paths';

const DASHBOARD = join(repoRoot, 'dashboard');
// A re-export of the real module rather than an `onResolve` hook: bun's runtime
// plugins honour `module` and not `onResolve`, which is why the identical hook in
// `tests/lib/mount.ts` has never had to work -- no component imports `$lib/`. The
// server module itself is part of what these cases drive, so it is the real one.
plugin({
  name: 'lib-alias',
  setup(build) {
    build.module('$lib/server/pairing', () => ({
      contents: `export * from ${JSON.stringify(join(DASHBOARD, 'src', 'lib', 'server', 'pairing.ts'))};`,
      loader: 'ts'
    }));
  }
});

const ORIGIN = 'http://dash.example';
const UUID = '09cc464f-690a-4a51-9ac9-c97b7011eb34';
const DEVICE = 'dev-alpha-aaaaaaaaaaaa';

/**
 * The directory and the script seam come from `tests/lib/pairingproject.ts`, for
 * the reason its header gives: one process per level, and `ENV_DIR` captured on
 * the first load of `$lib/server/project`. Adding this file is what made that a
 * live problem rather than a note -- see `OC-70`'s entry in the test
 * specification for the four cases it took down on the way.
 */
import { script } from '../lib/pairingproject';

/** A listing with one eligible request waiting. */
const WAITING = `#!/usr/bin/env bash
case "$2" in
  approve) printf '%s' '{"ok":true,"message":"Approved."}' ;;
  *) cat <<'JSON'
${JSON.stringify({
  pending: [
    {
      requestId: UUID,
      deviceId: DEVICE,
      clientId: 'openclaw-control-ui',
      role: 'operator',
      scopes: ['operator.read'],
      remoteIp: '10.99.0.9',
      ts: 1000
    }
  ],
  paired: []
})}
JSON
 ;;
esac
`;
/** A listing that fails, the way a stopped gateway does. */
const BROKEN = `#!/usr/bin/env bash\nprintf '%s' 'Gateway call failed: devices.list' >&2\nexit 1\n`;

/** Two *devices* waiting, which is the question only the operator can answer. */
const SECOND = 'dev-beta-bbbbbbbbbbbb';
const AMBIGUOUS = `#!/usr/bin/env bash
case "$2" in
  approve) printf '%s' '{"ok":true,"message":"Approved."}' ;;
  *) cat <<'JSON'
${JSON.stringify({
  pending: [
    {
      requestId: UUID,
      deviceId: DEVICE,
      clientId: 'openclaw-control-ui',
      role: 'operator',
      scopes: ['operator.read'],
      remoteIp: '10.99.0.9',
      ts: 1000
    },
    {
      requestId: '4bbf0a2c-5d1e-4a77-9f20-2c6d8e4b1a03',
      deviceId: SECOND,
      clientId: 'openclaw-control-ui',
      role: 'operator',
      scopes: ['operator.read'],
      remoteIp: '10.99.0.11',
      ts: 2000
    }
  ],
  paired: []
})}
JSON
 ;;
esac
`;

/**
 * One request pending that this card must not approve: the node host, which asks
 * as `openclaw-node` for the `node` role. Chosen because it is the shape the
 * stack really produces -- the gateway sees it on every node start -- so the
 * refusal is shown against something that exists rather than something invented.
 */
const NOT_OURS = `#!/usr/bin/env bash
case "$2" in
  approve) printf '%s' '{"ok":true,"message":"Approved."}' ;;
  *) cat <<'JSON'
${JSON.stringify({
  pending: [
    {
      requestId: 'c1d9f6b4-8e73-4d51-b0a2-7f3e5c9a1d26',
      deviceId: 'node-host-cccccccccccc',
      clientId: 'openclaw-node',
      role: 'node',
      scopes: ['node.run'],
      remoteIp: '10.99.0.2',
      ts: 1500
    }
  ],
  paired: []
})}
JSON
 ;;
esac
`;

script(WAITING);
// Through a variable, not a literal: bun resolves a literal `import()` specifier
// when it transpiles this file, which is before the plugin above has registered.
const ROUTE = join(DASHBOARD, 'src', 'routes', 'openclaw-pairing', '+server.ts');
const route = await import(ROUTE);

// `ORIGIN` is read per request, so it is set around each case rather than for the
// file: the level runs in one process and the route is not the only thing reading
// it.
let hadOrigin: string | undefined;
beforeEach(() => {
  hadOrigin = process.env.ORIGIN;
  process.env.ORIGIN = ORIGIN;
});
afterEach(() => {
  if (hadOrigin === undefined) delete process.env.ORIGIN;
  else process.env.ORIGIN = hadOrigin;
});

/** `headers` is given exactly as a browser sends it, absences included. */
const get = (headers: Record<string, string>) =>
  route.GET({
    request: new Request('http://dash.example/openclaw-pairing', { headers })
  } as never);

const post = (origin: string | null, body: unknown) =>
  route.POST({
    request: new Request('http://dash.example/openclaw-pairing', {
      method: 'POST',
      headers: origin ? { origin, 'content-type': 'application/json' } : {},
      body: typeof body === 'string' ? body : JSON.stringify(body)
    })
  } as never);

describe('OC-72 the route refuses what it should, and permits what it should', () => {
  test('OC-72 a GET whose Origin names another site is refused', async () => {
    script(WAITING);
    const r = await get({
      origin: 'http://evil.example',
      'sec-fetch-site': 'same-site',
      'sec-fetch-mode': 'cors'
    });
    expect(r.status).toBe(403);
  }, 30_000);

  test('OC-72 and the shape that sends no Origin at all -- the <img> tag -- is refused too', async () => {
    // C3, and the case the first form of the fix could not have had: an `<img>`
    // sends **no** `Origin`, so the old check saw nothing to compare. Headers
    // exactly as Chrome sent them on 2026-10-14 from a page on another port.
    script(WAITING);
    const r = await get({
      'sec-fetch-site': 'same-site',
      'sec-fetch-mode': 'no-cors',
      'sec-fetch-dest': 'image'
    });
    expect(r.status).toBe(403);
  }, 30_000);

  test('OC-72 and a no-cors fetch from such a page, which also sends none', async () => {
    script(WAITING);
    const r = await get({ 'sec-fetch-site': 'same-site', 'sec-fetch-mode': 'no-cors' });
    expect(r.status).toBe(403);
  }, 30_000);

  test('OC-72 the counterpart that the first fix broke: the card\'s own GET sends no Origin either', async () => {
    // This is why `Origin` cannot carry the GET check. The dashboard's own
    // same-origin `fetch` sends no `Origin` -- measured, not assumed -- so a check
    // that refused an absent one would 403 every operator. `same-origin` is what
    // separates it from the two cases above.
    script(WAITING);
    const r = await get({ 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' });
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
  }, 30_000);

  test('OC-72 and a client that is not a browser is still served', async () => {
    // curl sends neither header. It is not this threat -- the attack needs a
    // browser the operator already has open -- and refusing it would break every
    // probe the repository runs against a started stack.
    script(WAITING);
    const r = await get({});
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.ok).toBe(true);
    expect(body.pending).toHaveLength(1);
    // B1's field, end to end through the route.
    expect(body.pending[0].remoteAddress).toBe('10.99.0.9');
  }, 30_000);

  test('OC-72 a POST from another origin, and one with none, are both refused', async () => {
    // POST keeps the stricter check, and can: a browser appends `Origin` to every
    // POST -- the measurement has it on both the card's own and a cross-origin
    // form submission -- so an absent one is no browser and has nothing to
    // approve here.
    script(WAITING);
    expect((await post('http://evil.example', { deviceId: DEVICE })).status).toBe(403);
    expect((await post(null, { deviceId: DEVICE })).status).toBe(403);
  }, 30_000);

  test('OC-72 a listing that failed answers 502 rather than approving blind', async () => {
    // Every approval goes through the current list, so a list that could not be
    // read must stop the approval -- not fall through to one.
    script(BROKEN);
    let status = 0;
    try {
      await post(ORIGIN, { deviceId: DEVICE });
    } catch (e) {
      status = (e as { status?: number }).status ?? 0;
    }
    expect(status).toBe(502);
  }, 30_000);

  test('OC-72 a body naming nothing resolves to the one device waiting', async () => {
    // Not a refusal, which is what I first wrote here and the route corrected: a
    // body naming nothing with exactly one eligible device is the signed OC-50
    // property, reached through the route rather than through `chooseRequest`.
    script(WAITING);
    const r = await post(ORIGIN, {});
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
  }, 30_000);

  test('OC-72 and an unparseable body behaves as an empty one, not as a crash', async () => {
    // `request.json()` rejects, `.catch(() => null)` takes it, and `body?.x` on
    // null is `undefined`. The case exists because the alternative is a 500 from
    // an unhandled rejection, which no assertion on a valid body would catch.
    script(WAITING);
    const r = await post(ORIGIN, 'not json');
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
  }, 30_000);

  test('OC-72 two devices waiting is 409, because only the operator can answer it', async () => {
    script(AMBIGUOUS);
    const r = await post(ORIGIN, {});
    expect(r.status).toBe(409);
    const body = await r.json();
    expect(body.ok).toBe(false);
    // The count, not the device names: naming them is the card's job -- it draws
    // a row per device and the operator presses one -- and the route's job is to
    // refuse rather than guess. Asserted on the number so a route that collapsed
    // the two retries of one browser into "2 browsers" would fail here.
    expect(body.message).toMatch(/2 different browsers are waiting/);
  }, 30_000);

  test('OC-72 a requestId that is pending but not ours is refused, not approved', async () => {
    // The id is real and pending -- the node host's -- so an implementation that
    // trusted the id it was handed would approve the node host from this card.
    script(NOT_OURS);
    const r = await post(ORIGIN, { requestId: 'c1d9f6b4-8e73-4d51-b0a2-7f3e5c9a1d26' });
    expect(r.status).toBe(409);
    expect((await r.json()).ok).toBe(false);
  }, 30_000);

  test('OC-72 and with nothing of ours waiting, an empty body says so', async () => {
    script(NOT_OURS);
    const r = await post(ORIGIN, {});
    expect(r.status).toBe(409);
    const body = await r.json();
    expect(body.ok).toBe(false);
    expect(body.message).toMatch(/1 other request is pending/);
  }, 30_000);

  test('OC-72 the counterpart: the waiting device is approved', async () => {
    // Without this every refusal above could be met by a route that refuses
    // everything, which is the dead end this card exists to remove.
    script(WAITING);
    const r = await post(ORIGIN, { deviceId: DEVICE });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.ok).toBe(true);
  }, 30_000);
});
