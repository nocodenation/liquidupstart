/**
 * M-CS · Integration · The pairing script runs no image that is not built
 *
 * Purpose:  The pairing card is mounted by the saved switch, and every poll runs
 *           `config/scripts/openclaw-pairing.sh`, which runs `liquidupstart/openclaw:latest`.
 *           Switched on and saved before a build, that image is missing, and `docker run`
 *           then pulled it from Docker Hub, whose `liquidupstart` namespace belongs to
 *           nobody: whatever anyone put there would have run on the stack network every
 *           fifteen seconds (Timur's review on #56, decision 14). The script asks for the
 *           image first and says when it is missing, and its run says `--pull never`.
 * Given:    the real script, run as `openclaw-pairing.sh <dir> list` with a `mkdtemp` project
 *           whose `.env` is empty; a stub `docker` first on `PATH` that logs its arguments,
 *           exits 1 for `inspect proxy` so the script's fallbacks stand, answers `image
 *           inspect` as docker does for a missing image while the file `missing` exists in the
 *           project, as docker does without an engine while the file `down` exists, and with 0
 *           otherwise, and for `run` prints the listing `{"pending":[],"paired":[]}`.
 * When:     The script runs with `missing` present, with `down` present, and with neither.
 * Then:     Missing: exit 3, `liquidupstart/openclaw:latest is not built here.` on stderr, a
 *           docker log holding `image inspect liquidupstart/openclaw:latest` and no line that
 *           starts `run`. No engine: exit 1, docker's own words on stderr and no `run`, so the
 *           card shows the failure rather than going silent (the local review of 2026-10-30).
 *           Present: exit 0, the listing on stdout, and one `run` line, which starts `run
 *           --pull never`.
 * Covers:   CS-14, CS-FR10, CS-FR15
 * Negative: with the image missing nothing is run, so nothing can be pulled; with the engine
 *           failing, the failure is not passed off as an image that is not built.
 * Counterpart: with the image there the script runs it, so a script that never ran anything
 *           cannot pass; and it runs it with `--pull never`.
 *
 * Test data: docker's words for a missing image, `Error response from daemon: No such image:
 * liquidupstart/openclaw:latest`, and for an engine that is not there, `failed to connect to the
 * docker API at unix:///var/run/docker.sock; check if the path is correct and if the daemon is
 * running: dial unix /var/run/docker.sock: connect: no such file or directory`, both measured
 * with docker 29.9.2 on 2026-10-30, the second through a socket path that does not exist, each
 * exiting 1. The stub's listing
 * `{"pending":[],"paired":[]}`, the marker files `missing` and `down`, the
 * image `liquidupstart/openclaw:latest`, which the script names itself. The `.env` is empty, so
 * the network and port are the script's fallbacks; the stub's `inspect proxy` exits 1 so that
 * nothing observed replaces them.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const SCRIPT = join(repoRoot, 'config/scripts/openclaw-pairing.sh');
const dir = mkdtempSync(join(tmpdir(), 'lu-cs14s-'));
const bin = join(dir, 'bin');
const log = join(dir, 'docker.log');
const MISSING = join(dir, 'missing');
const DOWN = join(dir, 'down');
mkdirSync(bin);
writeFileSync(join(dir, '.env'), '');
writeFileSync(
  join(bin, 'docker'),
  `#!/bin/sh
printf '%s\\n' "$*" >> ${JSON.stringify(log)}
case "$1 $2" in
  "inspect proxy") exit 1 ;;
  "image inspect")
    [ -f ${JSON.stringify(MISSING)} ] && { echo "Error response from daemon: No such image: $3" >&2; exit 1; }
    [ -f ${JSON.stringify(DOWN)} ] && { echo 'failed to connect to the docker API at unix:///var/run/docker.sock; check if the path is correct and if the daemon is running: dial unix /var/run/docker.sock: connect: no such file or directory' >&2; exit 1; }
    exit 0 ;;
esac
[ "$1" = run ] && printf '%s' '{"pending":[],"paired":[]}'
exit 0
`
);
chmodSync(join(bin, 'docker'), 0o755);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function list(state: 'missing' | 'down' | 'present') {
  rmSync(log, { force: true });
  for (const [file, on] of [[MISSING, state === 'missing'], [DOWN, state === 'down']] as const) {
    if (on) writeFileSync(file, '');
    else rmSync(file, { force: true });
  }
  const r = sh(['bash', SCRIPT, dir, 'list'], dir, { PATH: `${bin}:${process.env.PATH}` });
  const docker = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
  return { ...r, docker };
}

describe('CS-14 the pairing script runs no image that is not built', () => {
  test('CS-14 the negative: with its image missing it exits 3, names the image and runs nothing', () => {
    const r = list('missing');
    expect(r.code).toBe(3);
    expect(r.stderr.trim()).toBe('liquidupstart/openclaw:latest is not built here.');
    expect(r.docker).toContain('image inspect liquidupstart/openclaw:latest');
    expect(r.docker.filter((l) => l.startsWith('run'))).toEqual([]);
  });

  test('CS-14 the counterpart: an engine that fails is said as it is, not as an image not built', () => {
    const r = list('down');
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('failed to connect to the docker API');
    expect(r.stderr).not.toContain('is not built here.');
    expect(r.docker.filter((l) => l.startsWith('run'))).toEqual([]);
  });

  test('CS-14 the counterpart: with the image there it runs it, with --pull never', () => {
    const r = list('present');
    expect(r.code, r.output).toBe(0);
    expect(r.stdout).toBe('{"pending":[],"paired":[]}');
    const runs = r.docker.filter((l) => l.startsWith('run'));
    expect(runs.length).toBe(1);
    expect(runs[0].startsWith('run --pull never ')).toBe(true);
  });
});
