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

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sh, type Result } from './shell';
import { repoRoot } from './paths';

// The tag is read out of the product's own recipe, so the cases run what the stack
// builds Liquid from and there is no second copy to drift: a constant here would
// have gone on probing `:latest` after the Dockerfile was pinned to anything else.
// LU_TEST_LIQUID_IMAGE is for B5-34 alone, which runs these files against an image
// that has moved.
export const PRODUCT_DOCKERFILE = 'config/liquid/templates/Dockerfile';

export function productLiquidImage(dockerfile: string = join(repoRoot, PRODUCT_DOCKERFILE)): string {
  const from = readFileSync(dockerfile, 'utf8').match(/^FROM\s+(\S+)/m)?.[1];
  if (!from) throw new Error(`no FROM line in ${dockerfile}`);
  return from;
}

export const LIQUID_IMAGE = process.env.LU_TEST_LIQUID_IMAGE || productLiquidImage();

// What the version-pinning files were written against, read off the image on
// 2026-10-16: `/opt/nifi/nifi-2.11.0`, `lib/nifi-api-2.10.0.jar`, and the Java
// that B5-18's startup line names. Re-pin here when an upgrade is taken
// deliberately; B5-33 then names every literal still at the old version.
export const WRITTEN_AGAINST = { nifi: '2.11.0', api: '2.10.0', java: '21.0.12+10-LTS' } as const;

export type Versions = { nifi: string | null; api: string | null; java: string | null };

const UNREADABLE: Versions = { nifi: null, api: null, java: null };

// All three live in the image, so one container answers them and none is derived
// from another: NiFi's own version names a directory, the API it ships is a jar in
// `lib`, and Java is whatever `java -version` reports, read the way the entrypoint
// reads it for the runtime record. The API runs a minor behind the distribution and
// that gap is what B5-15 to B5-18 are about; Java can move under an unchanged NiFi
// when the base image takes a patch, and B5-18 pins it.
const PROBE = [
  'd=$(ls -d /opt/nifi/nifi-[0-9]* 2>/dev/null | grep -v toolkit | head -1)',
  'echo "nifi=$(basename "${d:-}" | sed "s/^nifi-//")"',
  'a=$(ls /opt/nifi/nifi-current/lib/nifi-api-*.jar 2>/dev/null | head -1)',
  'echo "api=$(basename "${a:-}" | sed "s/^nifi-api-//;s/\\.jar$//")"',
  'echo "java=$(java -version 2>&1 | sed -n "s/.*(build \\([^)]*\\)).*/\\1/p" | head -1)"'
].join('; ');

let cached: Versions | undefined;

export function liquidImageVersions(): Versions {
  // Once per process: the files that consult this run in one bun process, and a
  // `docker run` each would cost more than the question is worth.
  if (cached) return cached;
  let r: Result | null = null;
  try {
    r = sh(['docker', 'run', '--rm', '--entrypoint', 'sh', LIQUID_IMAGE, '-c', PROBE]);
  } catch {
    // No docker on PATH: Bun.spawnSync throws rather than returning a code, and a
    // throw here is a throw at import in every file that reads LIQUID_MOVED.
  }
  const read = (key: string) => r?.stdout.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim() || null;
  cached = r && r.code === 0 ? { nifi: read('nifi'), api: read('api'), java: read('java') } : UNREADABLE;
  return cached;
}

const unreadable = (v: Versions) => v.nifi === null && v.api === null && v.java === null;

// The message, as a pure function of two readings, so a case can put both
// answers through it without an image and without a network. The lesson of
// B6-40 applied before it could repeat: a decision that only runs inside a
// container is a decision nobody measures.
export function movedMessage(written: Versions, found: Versions): string | null {
  if (unreadable(found)) return null; // could not read: not "moved"
  if (found.nifi === written.nifi && found.api === written.api && found.java === written.java) return null;
  const show = (v: Versions) => `nifi ${v.nifi ?? 'unreadable'}, api ${v.api ?? 'unreadable'}, java ${v.java ?? 'unreadable'}`;
  return [
    `${LIQUID_IMAGE} has moved since these cases were written.`,
    `  written against  ${show(written)}`,
    `  now in the image ${show(found)}`,
    '  This is an upstream release, not a defect in the code under test.',
    '  Re-pin WRITTEN_AGAINST in tests/lib/liquidimage.ts; B5-33 then names',
    '  every literal still at the old version, and these cases read the new one.'
  ].join('\n');
}

// The line tests/run.sh prints, in all three states. "Cannot measure" has words of
// its own: it used to fall through to the matching line and print the pinned
// versions as though they had been read.
export function preflightLine(written: Versions, found: Versions): string {
  if (unreadable(found)) {
    return `liquid image: could not be read (${LIQUID_IMAGE}), so whether it moved is unknown; continuing`;
  }
  const moved = movedMessage(written, found);
  if (moved === null) {
    return `liquid image: nifi ${found.nifi}, api ${found.api}, java ${found.java}, as the cases expect`;
  }
  return `liquid image MOVED, and the M-B cases that pin it will skip:\n${moved}`;
}

// Null when the image is the one the cases were written against, or when it could
// not be read at all — "cannot measure" is not "moved", the same rule the disk
// guard carries.
export function liquidImageMoved(): string | null {
  return movedMessage(WRITTEN_AGAINST, liquidImageVersions());
}

export const LIQUID_MOVED = liquidImageMoved();

// Every code line in the test tree that names something inside the image by its
// version: a bundle or the API jar under the image's `lib`, or the startup line
// B5-18 compares the runtime record with. Hand-made fixtures elsewhere (a fake
// `/w/lib/nifi-api-2.10.0.jar`, a record printed into the builder) are not the
// image and are not matched; header prose is not held either.
// `name` is the file inside the image, where the literal names one.
export type PinnedLiteral = { file: string; line: number; key: keyof Versions; version: string; name?: string };

const LIB_NAME = /(?:\$\{LIB\}|\/opt\/nifi\/nifi-current\/lib)\/(nifi-(api|[a-z0-9-]+-nar)-(\d+\.\d+\.\d+)\.(?:jar|nar))/g;
const START_LINE = /Starting NiFi (\d+\.\d+\.\d+) using Java (\S+)/;

export function pinnedLiterals(testsDir: string = join(repoRoot, 'tests')): PinnedLiteral[] {
  const found: PinnedLiteral[] = [];
  for (const tier of readdirSync(testsDir)) {
    let names: string[];
    try {
      names = readdirSync(join(testsDir, tier)).filter((n) => n.endsWith('.test.ts'));
    } catch {
      continue;
    }
    for (const name of names) {
      const file = `tests/${tier}/${name}`;
      readFileSync(join(testsDir, tier, name), 'utf8').split('\n').forEach((text, i) => {
        if (/^\s*(\*|\/\/|\/\*)/.test(text)) return;
        for (const m of text.matchAll(LIB_NAME)) {
          found.push({ file, line: i + 1, key: m[2] === 'api' ? 'api' : 'nifi', version: m[3], name: m[1] });
        }
        const s = text.match(START_LINE);
        if (s) {
          found.push({ file, line: i + 1, key: 'nifi', version: s[1] });
          found.push({ file, line: i + 1, key: 'java', version: s[2] });
        }
      });
    }
  }
  return found;
}
