/**
 * N9 — the two start scripts read .env the same way, and a missing key does not
 * end the start.
 *
 * Purpose: `start.sh` and `config/scripts/start/openclaw.sh` now derive the same
 * docker network name from `SYSTEM_HTTP_PORT`, so they have to agree on what
 * that value is. They did not: `openclaw.sh` stripped both quote kinds,
 * `start.sh` only double ones, and compose's dotenv parser accepts either. A
 * hand-written `SYSTEM_HTTP_PORT='8080'` made start.sh create and label
 * `..._'8080'` while openclaw.sh inspected `..._8080`, which did not exist —
 * so the wide RFC1918 fallback was written and the quoted stray survived every
 * down with its compose labels.
 *
 * And a second failure, introduced on 2026-09-11 while pinning the subnet and
 * caught by starting the stack: `V="$(grep -E '^KEY=' "$ENV_FILE" | ...)"` under
 * `set -euo pipefail` ends the script when the key is absent, because grep exits
 * 1 and pipefail passes it through. Every .env written before a new key exists —
 * that is, every existing installation — hit it, silently, after down.sh had
 * already emptied the stack. It is the same shape as the state-probe abort this
 * branch fixed one commit earlier.
 *
 * Given  the two start scripts as text, and their get_env helpers
 * When   every .env read is examined, and the helper is run
 * Then   each read goes through get_env, and get_env strips both quote kinds and
 *        returns empty for a key that is not there
 *
 * Requirements covered: OC-G3, N9 of the #11 second review.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const SCRIPTS = ['scripts/linux/start.sh', 'config/scripts/start/openclaw.sh'];

describe('N9 both start scripts read .env through one tolerant helper', () => {
  test('each defines get_env', () => {
    for (const f of SCRIPTS) {
      const body = readFileSync(join(repoRoot, f), 'utf8');
      expect({ file: f, has: /^get_env\(\) \{|^  get_env\(\) \{/m.test(body) }).toEqual({
        file: f,
        has: true
      });
    }
  });

  test('and no raw grep reads .env beside it', () => {
    const offenders: string[] = [];
    for (const f of SCRIPTS) {
      readFileSync(join(repoRoot, f), 'utf8')
        .split('\n')
        .forEach((text, i) => {
          if (/^\s*(#|\/\/|\*)/.test(text)) return;
          if (/=\s*"\$\(grep -E ['"]\^[A-Z_]+=/.test(text)) offenders.push(`${f}:${i + 1}  ${text.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  test('get_env strips both quote kinds and tolerates a missing key', () => {
    // Run the helper as each script actually holds it, rather than a copy: a test
    // carrying its own copy stops testing the thing the moment the two drift.
    const dir = mkdtempSync(join(tmpdir(), 'lu-env-'));
    const env = join(dir, '.env');
    writeFileSync(env, "SYSTEM_HTTP_PORT='8080'\nLIQUID_USERNAME=\"liquid\"\nBARE=9000\n");
    for (const f of SCRIPTS) {
      const probe = join(dir, 'probe.sh');
      const body = readFileSync(join(repoRoot, f), 'utf8');
      const start = body.split('\n').findIndex((l) => /^\s*get_env\(\) \{/.test(l));
      const end = body.split('\n').findIndex((l, i) => i > start && /^\s*\}/.test(l));
      const helper = body.split('\n').slice(start, end + 1).join('\n');
      writeFileSync(
        probe,
        `set -euo pipefail\nENV_FILE=${env}\nCONFIG_JSON=${env}\n${helper}\n` +
          `echo "[$(get_env SYSTEM_HTTP_PORT)][$(get_env LIQUID_USERNAME)]` +
          `[$(get_env BARE)][$(get_env ABSENT)]reached"\n`
      );
      const r = sh(['bash', probe]);
      expect({ file: f, out: r.output.trim() }).toEqual({
        file: f,
        out: '[8080][liquid][9000][]reached'
      });
    }
  });
});
