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
import { approve, chooseRequest, pendingRequests } from '$lib/server/pairing';
import type { RequestHandler } from './$types';

// The same Origin check as POST. A GET spawns one `docker run` of the OpenClaw
// image, so any page the operator had open could make the dashboard do that once
// per request -- through an `<img>` tag, whose response it cannot read but whose
// work it still costs. Minor of the 2026-09-29 review.
//
// An absent Origin passes: a same-origin GET from the address bar sends none.
// What is refused is a different origin naming itself.
function wrongOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return !!process.env.ORIGIN && !!origin && origin !== process.env.ORIGIN;
}

export const GET: RequestHandler = async ({ request }) => {
  if (wrongOrigin(request)) return new Response('Forbidden', { status: 403 });
  const { ok, pending, message } = await pendingRequests();
  return json({ ok, pending, message });
};

export const POST: RequestHandler = async ({ request }) => {
  const origin = request.headers.get('origin');
  if (process.env.ORIGIN && origin !== process.env.ORIGIN) {
    return new Response('Forbidden', { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const requestId = typeof body?.requestId === 'string' ? body.requestId : '';
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId : '';

  // Every approval goes through the current list, including one that names an id:
  // an id decides nothing on its own, because a request the operator never meant
  // carries a perfectly valid one. `latest` used to be resolved to pending[0] --
  // the newest request of any device -- which is finding 2 of the 2026-09-29
  // review.
  const { ok, pending, message } = await pendingRequests();
  if (!ok) throw error(502, message);

  const choice = chooseRequest(pending, { requestId, deviceId });
  if (choice.kind === 'refuse') {
    return json({ ok: false, message: choice.message }, { status: choice.status });
  }

  const result = await approve(choice.requestId);
  return json({ ok: result.ok, message: result.message }, { status: result.status });
};
