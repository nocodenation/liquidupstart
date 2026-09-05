// Fail-closed same-origin guard for endpoints that execute host/docker commands.
// State-changing POSTs always carry an Origin header; same-origin GET/HEAD omit
// it, so fall back to the browser-set Sec-Fetch-Site (page JS cannot forge it).
// Returns a 403 Response to short-circuit with, or null when the request is allowed.
export function requireSameOrigin(request: Request): Response | null {
  const forbidden = () => new Response('Forbidden', { status: 403 });
  const expected = process.env.ORIGIN;
  if (!expected) return forbidden();

  const origin = request.headers.get('origin');
  if (origin !== null) return origin === expected ? null : forbidden();

  const site = request.headers.get('sec-fetch-site');
  if (site !== null) return site === 'same-origin' ? null : forbidden();

  return forbidden();
}
