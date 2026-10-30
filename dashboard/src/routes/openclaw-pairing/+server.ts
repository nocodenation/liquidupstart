// GET  — the pending OpenClaw device pairing requests.
// POST {deviceId} or {requestId} — approve one.
//
// R2 of §9: the operator's way back into the Control UI without a terminal. The
// request id is read at the moment the button is pressed rather than from what
// was rendered, because a refused browser mints a new request id on every retry
// -- four were observed for one device within thirty minutes on 2026-09-19 -- so
// an id that has been sitting in a page is stale. The card therefore names the
// device and this resolves that device's current request.
import { json, error } from '@sveltejs/kit';
import {
  OPENCLAW_NOT_BUILT,
  OPENCLAW_OFF_REFUSAL,
  approve,
  chooseRequest,
  openclawOn,
  pendingRequests
} from '$lib/server/pairing';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
  // C3 of the 2026-10-01 review. A GET here spawns one `docker run` of the
  // OpenClaw image, so any page the operator had open could make the dashboard do
  // that once per request -- through an `<img>` tag, whose response it cannot read
  // but whose work it still costs. The old check only refused an origin that
  // *names itself* and differs, which is the loud shape and not the quiet one.
  //
  // `Origin` cannot carry this on a GET, and that was measured rather than
  // assumed: two local origins, headless Chrome, 2026-10-14. The card's own
  // same-origin `fetch` GET sends **no** `Origin` at all, so refusing an absent
  // one would 403 every operator -- the first form of this fix did exactly that.
  // A cross-origin `<img>` and a `no-cors` fetch send none either. The one header
  // that separates them is `Sec-Fetch-Site`.
  //
  // Checked against `same-origin` rather than for `cross-site`: both probes were
  // on `localhost`, different ports, and Chrome called the attacker `same-site`.
  // Another service on another local port is this dashboard's ordinary
  // neighbour, so a `cross-site` test would miss precisely the realistic case.
  //
  // Absent on both means a client that is not a browser -- curl, which sends
  // neither -- and that is not this threat: the attack needs a browser the
  // operator already has open. POST keeps its own stricter check below, because
  // a browser does append `Origin` to every POST.
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (process.env.ORIGIN && origin && origin !== process.env.ORIGIN) {
    return new Response('Forbidden', { status: 403 });
  }
  if (site && site !== 'same-origin') {
    return new Response('Forbidden', { status: 403 });
  }
  // A tab opened before OpenClaw was switched off keeps polling. It gets an empty listing,
  // and the script, which runs the OpenClaw image, does not run. CS-FR10.
  if (!openclawOn()) {
    return json({ ok: true, disabled: true, pending: [], revoked: [] });
  }
  // `revoked` travels too: a refused browser stops asking and the gateway drops
  // the request after five minutes, so without it the card is empty for an
  // operator who arrives late. A4 of the 2026-10-01 review.
  const { ok, disabled, pending, revoked, message } = await pendingRequests();
  // The image not built yet answers as switched off does (CS-FR10).
  if (disabled) return json({ ok: true, disabled: true, pending: [], revoked: [] });
  return json({ ok, pending, revoked, message });
};

export const POST: RequestHandler = async ({ request }) => {
  const origin = request.headers.get('origin');
  if (process.env.ORIGIN && origin !== process.env.ORIGIN) {
    return new Response('Forbidden', { status: 403 });
  }
  if (!openclawOn()) {
    return json({ ok: false, message: OPENCLAW_OFF_REFUSAL }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const requestId = typeof body?.requestId === 'string' ? body.requestId : '';
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId : '';

  // Every approval goes through the current list, including one that names an id:
  // an id decides nothing on its own, because a request the operator never meant
  // carries a perfectly valid one. `latest` used to be resolved to pending[0] --
  // the newest request of any device -- which is finding 2 of the 2026-09-29
  // review.
  const { ok, disabled, pending, message } = await pendingRequests();
  // Nothing to approve against an image that is not built, and saying "nothing is waiting"
  // would name the wrong cause (CS-FR10).
  if (disabled) return json({ ok: false, message: OPENCLAW_NOT_BUILT }, { status: 409 });
  if (!ok) throw error(502, message);

  const choice = chooseRequest(pending, { requestId, deviceId });
  if (choice.kind === 'refuse') {
    return json({ ok: false, message: choice.message }, { status: choice.status });
  }

  const result = await approve(choice.requestId);
  return json({ ok: result.ok, message: result.message }, { status: result.status });
};
