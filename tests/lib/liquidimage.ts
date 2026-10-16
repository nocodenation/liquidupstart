// The Liquid image the M-B cases run, and whether it is still the one they were
// written against.
//
// S9 of the 2026-10-01 review, second half. Nine files named
// `ghcr.io/nocodenation/liquid-nifi:latest` themselves — a moving tag — and six of
// them also pin what that tag happened to contain: NiFi 2.11.0 and the API 2.10.0,
// in assertions and in fixture text. So an upstream image upgrade turns those cases
// red, and the red is about somebody else's release.
//
// Pinning by digest was the obvious repair and was weighed against this one. It
// stops the surprise and buys a different cost: until a hand re-pins, the suite
// tests an image the stack no longer runs. The operator chose to keep the moving
// tag and make an upgrade **legible** instead, which is the shape CLAUDE.md asks
// for — a value read at the moment it is needed rather than a rule somebody has to
// remember. The versions are read out of the image; nothing here is told what they
// are.
//
// What this is not: a check that the image is *correct*. It answers one question —
// has it moved from what these cases were written against — and says so in words
// that name the upgrade rather than the author's code.

import { sh } from './shell';

export const LIQUID_IMAGE = 'ghcr.io/nocodenation/liquid-nifi:latest';

// What the six version-pinning files were written against, read off the image on
// 2026-10-16: `/opt/nifi/nifi-2.11.0` and `lib/nifi-api-2.10.0.jar`. Re-pin here,
// in one place, when an upgrade is taken deliberately; the files themselves then
// need their literals moved, which is the work this makes visible instead of
// letting a red suite imply it.
export const WRITTEN_AGAINST = { nifi: '2.11.0', api: '2.10.0' } as const;

export type Versions = { nifi: string | null; api: string | null };

// Both versions live in paths inside the image, so one container answers both and
// neither is derived from the other: NiFi's own version names a directory, and the
// API it ships is a jar in `lib`. Read, never assumed — the API version is a minor
// behind the distribution's and that gap is exactly what B5-15 to B5-18 are about.
const PROBE = [
  'd=$(ls -d /opt/nifi/nifi-[0-9]* 2>/dev/null | grep -v toolkit | head -1)',
  'echo "nifi=$(basename "${d:-}" | sed "s/^nifi-//")"',
  'a=$(ls /opt/nifi/nifi-current/lib/nifi-api-*.jar 2>/dev/null | head -1)',
  'echo "api=$(basename "${a:-}" | sed "s/^nifi-api-//;s/\\.jar$//")"'
].join('; ');

let cached: Versions | undefined;

export function liquidImageVersions(): Versions {
  // Once per process: the files that consult this run in one bun process, and a
  // `docker run` each would cost more than the question is worth.
  if (cached) return cached;
  const r = sh(['docker', 'run', '--rm', '--entrypoint', 'sh', LIQUID_IMAGE, '-c', PROBE]);
  const read = (key: string) => r.stdout.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim() || null;
  cached = r.code === 0 ? { nifi: read('nifi'), api: read('api') } : { nifi: null, api: null };
  return cached;
}

// The message, as a pure function of the two readings, so a case can put both
// answers through it without an image and without a network. The lesson of
// B6-40 applied before it could repeat: a decision that only runs inside a
// container is a decision nobody measures.
export function movedMessage(written: Versions, found: Versions): string | null {
  if (found.nifi === null && found.api === null) return null; // could not read: not "moved"
  if (found.nifi === written.nifi && found.api === written.api) return null;
  return [
    `${LIQUID_IMAGE} has moved since these cases were written.`,
    `  written against  nifi ${written.nifi}, api ${written.api}`,
    `  now in the image nifi ${found.nifi ?? 'unreadable'}, api ${found.api ?? 'unreadable'}`,
    '  This is an upstream release, not a defect in the code under test.',
    '  Re-pin WRITTEN_AGAINST in tests/lib/liquidimage.ts and move the literals',
    '  in the six files that assert these versions; then these cases read the new one.'
  ].join('\n');
}

// Null when the image is the one the cases were written against, or when it could
// not be read at all — "cannot measure" is not "moved", the same rule the disk
// guard carries.
export function liquidImageMoved(): string | null {
  return movedMessage(WRITTEN_AGAINST, liquidImageVersions());
}

export const LIQUID_MOVED = liquidImageMoved();
