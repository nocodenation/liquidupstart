/**
 * M-B5 · Unit · The load directory is reachable from inside the container only
 *
 * Purpose:  The half of item 11 that a booted container cannot hold. B5-28
 *           shows that a refused bundle dropped into `nar_inbox` never loads --
 *           but it mounts the inbox itself, so it would keep passing if
 *           `compose.yml` went back to mounting the operator's drop directory
 *           straight onto `nar_extensions`. That mount is the whole defect: the
 *           image's `start.sh` points
 *           `nifi.nar.library.autoload.directory` at `${NIFI_HOME}/nar_extensions`
 *           on every start, so anything mounted there is loaded unjudged.
 *
 *           So the arrangement is held here, where it is written down.
 * Given:    This checkout's `compose.yml` and `config/liquid/templates/Dockerfile`.
 * When:     The `liquid` service block and the image recipe are read.
 * Then:     `./volumes/nar_extensions` reaches the container as `nar_inbox`,
 *           nothing is mounted onto `nar_extensions`, and the image carries the
 *           watcher that is the only writer to it.
 * Covers:   B5-31, B5-32, FR30, FR36
 * Unhappy:  B5-31 is the mount that must not exist; B5-32 is the counterpart --
 *           the inbox must still arrive, or the drop directory is gone and
 *           nobody can deploy anything at all.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serviceBlock } from '../lib/compose-file';
import { repoRoot } from '../lib/paths';

const liquid = serviceBlock('liquid');
const LOAD_PATH = '/opt/nifi/nifi-current/nar_extensions';
const INBOX_PATH = '/opt/nifi/nifi-current/nar_inbox';

describe('B5-31 nothing outside the container writes to the load directory', () => {
  test('B5-31 no mount lands on it', () => {
    // The line that used to be here is the defect: a host directory mounted at
    // the auto-load directory is a load path with no check in front of it.
    const mounts = liquid
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- ./') || l.startsWith('- /'));
    expect(mounts.filter((m) => m.includes(`:${LOAD_PATH}`))).toEqual([]);
  });

  test('B5-31 and no other service reaches it either', () => {
    const text = readFileSync(join(repoRoot, 'compose.yml'), 'utf8');
    expect(text).not.toContain(`:${LOAD_PATH}`);
  });
});

describe('B5-32 while the inbox still arrives, and the watcher with it', () => {
  test('B5-32 the counterpart: the drop directory is mounted as the inbox', () => {
    // Without this the operator's drop directory would not reach Liquid at all,
    // which passes B5-31 and deploys nothing.
    expect(liquid).toContain(`./volumes/nar_extensions:${INBOX_PATH}`);
  });

  test('B5-32 and the image carries nar-watch.sh, the only writer to the load path', () => {
    const dockerfile = readFileSync(
      join(repoRoot, 'config/liquid/templates/Dockerfile'),
      'utf8'
    );
    expect(dockerfile).toContain('./nar-watch.sh /opt/nifi/scripts/nar-watch.sh');
    const entry = readFileSync(join(repoRoot, 'config/liquid/entrypoint.sh'), 'utf8');
    expect(entry).toMatch(/"\$NAR_WATCH" &/);
  });
});
