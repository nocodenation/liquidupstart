/**
 * When docker says a thing was made, in milliseconds, or `null` if it will not say.
 *
 * Containers and images answer RFC 3339 (`2026-10-20T15:04:44.737Z`); a network,
 * and every `{{.CreatedAt}}`, a Go `time.Time` with spaces in it
 * (`2026-10-20 15:04:44.637957344 +0000 UTC`). The match anchors on the date, the
 * time and the offset, so nothing after the offset reaches the parser.
 * Unreadable is `null`, and keeps the object in every sweep that asks.
 */
export function parseDockerTime(stamp: string): number | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s*(Z|[+-]\d{2}:?\d{2})/.exec(
    stamp.trim()
  );
  if (!m) return null;
  const zone = m[3] === 'Z' ? 'Z' : m[3].length === 5 ? `${m[3].slice(0, 3)}:${m[3].slice(3)}` : m[3];
  const ms = Date.parse(`${m[1]}T${m[2]}${zone}`);
  return Number.isFinite(ms) ? ms : null;
}
