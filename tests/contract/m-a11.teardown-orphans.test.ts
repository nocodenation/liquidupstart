/**
 * M-A11 · Contract · Teardown stops what is running, not what this branch declares
 *
 * Purpose:  `down.sh` printed *"Stopping existing containers…"* and then ran
 *           `docker compose down`, which acts on the services the **current**
 *           `compose.yml` declares. A container from another branch's stack is not
 *           in that list, so it survived the teardown and kept running beside a
 *           stack that has no such service. Met on 2026-09-08 switching from
 *           `feature/liquid-java-extensions`: `nar_builder` outlived the teardown
 *           and had to be removed by hand, and compose warned about it on every
 *           call afterwards.
 *
 *           The repair is `--remove-orphans`, and the reason it sat open was that
 *           the same repair arriving separately in several places is how one file
 *           becomes two that differ. `scripts/install/update.sh` already passed the
 *           flag, so they had. Hence the second half: every teardown call in the
 *           repository is found, not listed, and held to the flag.
 * Given:    The real `scripts/linux/down.sh`, run from a copy in a temporary
 *           project with a **stub `docker` first on PATH** that records its
 *           arguments and exits 0 — the idiom `B6-3` uses for `mvn` — and
 *           `DOCKER_HOST` at a socket that does not exist, so a call that reached
 *           the real binary would fail rather than act. And every `*.sh` under the
 *           checkout outside `.git`, `node_modules` and `volumes/`.
 * When:     The script is run once; each shell file is read for compose `down`
 *           calls — `docker compose`, any global options, then `down`, at the start
 *           of a command, after a keyword or behind a wrapper such as
 *           `with_timeout` — and only the command itself is read, not a message
 *           after `||` or a trailing comment. An option value quoted with a
 *           space in it, `-f "my file.yml"`, is out of scope: none is used here
 * Then:     down.sh makes exactly one docker call, `compose down
 *           --remove-orphans`; the scan finds `cleanup.sh`, `update.sh` and
 *           `down.sh`; and every call it finds carries the flag
 * Covers:   A11-11
 * Negative: The scan's own fixture lines: a bare teardown, one whose only
 *           `--remove-orphans` is in the warning after `||`, one with it in a
 *           trailing comment, one with global options before `down`, and ones
 *           behind `if !`, `with_timeout 120`, `exec` and `timeout -k 5 60` —
 *           each found and each refused. The counterpart: a comment and the
 *           `run.sh` usage text are not counted as calls, and a teardown with the
 *           flag after global options, or behind `with_timeout`, is accepted.
 *
 * Why not a behavioural case against real compose: it would act on the
 *           installation running on this machine, which is what the stack tier is
 *           for and what `tests/run.sh` keeps opt-in. The stub answers the same
 *           question — what does the script ask docker to do — without that.
 */

import { test, expect, describe, beforeAll } from 'bun:test';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, rmSync, readFileSync, readdirSync, existsSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const DOWN = join(repoRoot, 'scripts/linux/down.sh');

type Teardown = { line: number; command: string; removesOrphans: boolean };

// `docker compose` (or `docker-compose`), global options with or without a value,
// then `down`, where a command begins -- after a keyword such as `if !`, or behind
// `exec`, `sudo`, `command`, `timeout` or `with_timeout`. The command ends at the
// first `|`, `&`, `;`, `#` or `)`, so a flag that is only named in what follows
// does not count.
const CALL = /(?:^\s*|(?:&&|\|\||;|\bthen|\bdo|\belse|\$\()\s*)(?:(?:if|elif|while|until|!|exec|sudo|command|(?:with_)?timeout(?:\s+-\S+(?:\s+\d\S*)?)*\s+\S+)\s+)*(docker(?:-compose|\s+compose)(?:\s+-{1,2}[\w-]+(?:[ =][^\s|&;#]+)?)*\s+down\b[^|&;#)]*)/g;

export function teardownCalls(text: string): Teardown[] {
  const found: Teardown[] = [];
  text.split('\n').forEach((raw, i) => {
    if (/^\s*#/.test(raw)) return;
    for (const m of raw.matchAll(CALL)) {
      const command = m[1].trim();
      found.push({ line: i + 1, command, removesOrphans: /(^|\s)--remove-orphans(\s|$)/.test(command) });
    }
  });
  return found;
}

function shellFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (['.git', 'node_modules', 'volumes'].includes(name)) continue;
    const full = join(dir, name);
    if (lstatSync(full).isDirectory()) out.push(...shellFiles(full));
    else if (name.endsWith('.sh')) out.push(full);
  }
  return out;
}

let invocation = '';

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'lu-a11-11-'));
  try {
    // The script resolves its project directory from its own location, so it
    // runs from a copy, beside a compose file the stub never reads.
    const scripts = join(dir, 'scripts', 'linux');
    mkdirSync(scripts, { recursive: true });
    const copy = join(scripts, 'down.sh');
    writeFileSync(copy, readFileSync(DOWN, 'utf8'));
    chmodSync(copy, 0o755);
    writeFileSync(join(dir, 'compose.yml'), 'services: {}\n');

    const bin = join(dir, 'bin');
    mkdirSync(bin, { recursive: true });
    const log = join(dir, 'argv.txt');
    writeFileSync(join(bin, 'docker'), `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(log)}\nexit 0\n`);
    chmodSync(join(bin, 'docker'), 0o755);

    const r = sh([copy], dir, {
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      DOCKER_HOST: 'unix:///nonexistent-lu-a11-11.sock'
    });
    expect(r.code, r.output).toBe(0);
    invocation = existsSync(log) ? readFileSync(log, 'utf8').trim() : '';
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('A11-11 teardown removes what the current file does not declare', () => {
  test('A11-11 down.sh asks compose to remove orphans', () => {
    expect(invocation).toBe('compose down --remove-orphans');
  });

  test('A11-11 and the script is still the only thing it was: one docker call', () => {
    // A teardown that grew a second call would be a different change, and this
    // case would otherwise pass it silently.
    expect(invocation.split('\n').filter(Boolean).length).toBe(1);
  });
});

describe('A11-11 and every teardown in the repository carries the flag', () => {
  const calls = shellFiles(repoRoot).flatMap((f) =>
    teardownCalls(readFileSync(f, 'utf8')).map((c) => ({ ...c, file: relative(repoRoot, f) }))
  );

  test('A11-11 the premise: the scan finds the three teardown paths', () => {
    // Found, not listed: the first version named two and missed cleanup.sh.
    const files = new Set(calls.map((c) => c.file));
    for (const f of ['cleanup.sh', 'scripts/install/update.sh', 'scripts/linux/down.sh']) {
      expect(files.has(f), `${f} not found by the scan`).toBe(true);
    }
  });

  test('A11-11 none of them leaves orphans behind', () => {
    const bare = calls.filter((c) => !c.removesOrphans).map((c) => `${c.file}:${c.line} ${c.command}`);
    expect(bare.join('\n')).toBe('');
  });

  test('A11-11 the negative: a teardown without the flag is found and refused, wherever the flag is named instead', () => {
    expect(
      [
        'docker compose down',
        '  docker compose down || warn "docker compose down --remove-orphans failed"',
        'docker compose down # TODO --remove-orphans',
        'docker compose -p lu-x --ansi never down',
        'if ! docker compose down; then warn x; fi',
        'with_timeout 120 docker compose down',
        'exec docker compose down',
        'timeout -k 5 60 docker compose down'
      ].map((l) => teardownCalls(l).map((c) => c.removesOrphans))
    ).toEqual([[false], [false], [false], [false], [false], [false], [false], [false]]);
  });

  test('A11-11 the counterpart: what is not a teardown is not counted, and the flag after options is accepted', () => {
    expect({
      comment: teardownCalls('# docker compose down').length,
      usage: teardownCalls('  -s, --stop      Stop the stack (docker compose down), exactly like the Stop').length,
      withOptions: teardownCalls('docker compose -p lu-x down --volumes --remove-orphans').map((c) => c.removesOrphans),
      afterThen: teardownCalls('if up; then docker compose down --remove-orphans; fi').map((c) => c.removesOrphans),
      wrapped: teardownCalls('with_timeout 120 docker compose down --remove-orphans').map((c) => c.removesOrphans)
    }).toEqual({ comment: 0, usage: 0, withOptions: [true], afterThen: [true], wrapped: [true] });
  });
});
