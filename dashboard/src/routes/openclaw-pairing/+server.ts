// GET  — the pending OpenClaw device pairing requests.
// POST {requestId} — approve one.
//
// R2 of §9: the operator's way back into the Control UI without a terminal. The
// id is read at the moment the button is pressed rather than from what was
// rendered, because a refused browser mints a new request id on every retry --
// four were observed for one device within thirty minutes on 2026-09-19 -- so an
// id that has been sitting in a page is stale.
import { json, error } from '@sveltejs/kit';
import { approve, pendingRequests } from '$lib/server/pairing';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const { ok, pending, message } = await pendingRequests();
  return json({ ok, pending, message });
};

export const POST: RequestHandler = async ({ request }) => {
  const origin = request.headers.get('origin');
  if (process.env.ORIGIN && origin !== process.env.ORIGIN) {
    return new Response('Forbidden', { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const asked = typeof body?.requestId === 'string' ? body.requestId : '';

  // "latest" approves whatever is pending now. It is what the card sends, so the
  // operator cannot approve an id that was current when the page rendered.
  let requestId = asked;
  if (asked === 'latest') {
    const { ok, pending, message } = await pendingRequests();
    if (!ok) throw error(502, message);
    if (pending.length === 0) {
      return json({ ok: false, message: 'Nothing is waiting for approval.' }, { status: 409 });
    }
    requestId = pending[0].requestId;
  }

  const result = await approve(requestId);
  return json({ ok: result.ok, message: result.message }, { status: result.status });
};
