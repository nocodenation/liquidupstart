/**
 * M-B6 · Integration · The two images agree about who owns the shared index
 *
 * Purpose:  M2 of the 2026-10-01 review, answered by moving rather than by
 *           narrowing. `volumes/liquid/api` was a host bind that had to be
 *           `chmod 777`, so anything on this machine could write the runtime
 *           record `nar-build` compiles against. Measured 2026-10-09: the mode
 *           could not be narrowed while it was a bind -- under rootless Docker the
 *           host user maps to container root while Liquid runs as nifi -- and
 *           asking Liquid for its version instead needs credentials the builder
 *           deliberately does not hold, both endpoints answering 401.
 *
 *           So it is a volume shared between `liquid` and `nar_builder` now, and
 *           that moves the problem to one docker behaves quietly about: **a fresh
 *           named volume takes the ownership of the image path it is first mounted
 *           on.** Neither service declares a `depends_on` that fixes the order, so
 *           both images carry the directory with the same owner and the order stops
 *           mattering.
 *
 *           `nar_builder`'s Dockerfile therefore holds a numeric `chown 1000:1000`
 *           for a path it only ever reads. **That number is the thing this case
 *           exists for.** A number copied from another image is exactly the rule an
 *           agent has to remember that CLAUDE.md argues against, so it is measured
 *           here against the name it stands for rather than trusted.
 * Given:    the builder image built from `config/nar_builder` in this run, and
 *           `ghcr.io/nocodenation/liquid-nifi:latest`, the base the Liquid image is
 *           built FROM -- pulled, not built, so this case needs no `liquid.sh` run
 * When:     `nifi`'s uid is read out of the base image and the owner of
 *           `/liquid/api` out of the builder image
 * Then:     they are the same number, the Liquid template gives `api/` to the
 *           **name** `nifi`, and `compose.yml` shares one volume with the builder's
 *           side read-only and no host bind left
 * Covers:   B6-33, B6-34, M2 of the 2026-10-01 review, FR21, NFR7
 * Unhappy:  B6-33 is the finding -- two numbers that have to agree and nothing
 *           making them. B6-34 is the counterpart: it would be satisfied by
 *           deleting the mount altogether, which would break the builder, so it
 *           asserts the sharing as well as the absence.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import { builderImage } from '../lib/builderimage';

const IMAGE = builderImage();
const BASE = 'ghcr.io/nocodenation/liquid-nifi:latest';
const SHARED = '/liquid/api';

describe('B6-33 the number in one Dockerfile tracks the name in the other', () => {
  test('B6-33 the builder gives the shared directory to the uid nifi has in the Liquid base', () => {
    const uid = sh(['docker', 'run', '--rm', '--entrypoint', 'sh', BASE, '-c', 'id -u nifi']);
    const owner = sh([
      'docker', 'run', '--rm', '--entrypoint', 'sh', IMAGE, '-c',
      `stat -c %u ${SHARED}`
    ]);
    expect({ base: uid.code, builder: owner.code }).toEqual({ base: 0, builder: 0 });
    // The claim: not that either is 1000, but that they are the same. If the base
    // image ever renumbers nifi, this reddens and names both readings.
    expect({ nifiInBase: uid.stdout.trim(), ownerInBuilder: owner.stdout.trim() }).toEqual({
      nifiInBase: uid.stdout.trim(),
      ownerInBuilder: uid.stdout.trim()
    });
  }, 900_000);

  test('B6-33 and the Liquid image gives it to the name, not to a number', () => {
    // The other end of the chain. Read as text because building the Liquid image
    // takes an apt-get; what matters is that its side is written as `nifi:nifi`,
    // so the builder's number is tracking something rather than guessing.
    const tpl = readFileSync(join(repoRoot, 'config/liquid/templates/Dockerfile'), 'utf8');
    expect(tpl).toContain('/opt/nifi/nifi-current/api');
    expect(tpl).toMatch(/chown nifi:nifi[^\n]*\\\n\s*\/opt\/nifi\/nifi-current\/api/);
  });

  test('B6-33 and the shared directory is not world-writable in either image', () => {
    // What the move buys. The host bind had to be 777; a volume owned by the user
    // that writes it needs nothing of the kind.
    const mode = sh([
      'docker', 'run', '--rm', '--entrypoint', 'sh', IMAGE, '-c', `stat -c %a ${SHARED}`
    ]);
    expect(mode.code).toBe(0);
    expect(mode.stdout.trim()).not.toMatch(/[2367]$/);
  }, 900_000);
});

describe('B6-34 the counterpart: it is shared, and the host bind is gone', () => {
  const compose = readFileSync(join(repoRoot, 'compose.yml'), 'utf8');

  test('B6-34 one volume, written by Liquid and read-only for the builder', () => {
    expect(compose).toContain('liquid_api:/opt/nifi/nifi-current/api');
    expect(compose).toContain('liquid_api:/liquid/api:ro');
    // Declared, or compose refuses the file.
    expect(compose).toMatch(/^volumes:\n\s+liquid_api:/m);
  });

  test('B6-34 and nothing binds the host path any more', () => {
    // The finding was the host side being writable, so its absence is the repair.
    // Asserted together with the sharing above: on its own this would be satisfied
    // by removing the mount, which would leave the builder unable to read the index
    // and every build refused.
    expect(compose).not.toContain('./volumes/liquid/api');
    // The start script must not **create** or **chmod** it any more. Not: must
    // not mention it -- the first version of this forbade the string outright and
    // reddened on the notice the script prints about the leftover directory, which
    // exists on purpose. A ban that forces you to delete the honest sentence is
    // the wrong ban.
    const start = readFileSync(join(repoRoot, 'config/scripts/start/liquid.sh'), 'utf8');
    const commandLines = start.split('\n').filter((l) => !l.trimStart().startsWith('#'));
    const creates = commandLines.filter(
      (l) => /\$\{STATE_DIR\}\/api/.test(l) && /\b(mkdir|chmod|chown|install)\b/.test(l)
    );
    expect(creates).toEqual([]);
    // And it does still name it, so the operator is told the leftover is dead.
    expect(start).toContain('is left over from before');
  });
});
