/**
 * M-B7 · Integration · The sweep: nothing a build leaves is there for the next
 *
 * Purpose:  #31. A read-only home and a per-build one close the two files Maven
 *           reads by name; they do not close what build-time code leaves
 *           elsewhere. A `nohup` survives `mvn`'s exit and is still running as
 *           that user when the slot's next build starts, and the user can write
 *           `/tmp`, `/var/tmp`, `/run/lock`, `/dev/shm` and `/dev/mqueue`, which
 *           last as long as the container. So the server sweeps a slot before it
 *           hands it out and after its build ends: the user's processes ended,
 *           the user's files removed from those directories (FR42).
 *
 *           The server is PID 1 and reaps nothing it did not start, so a process
 *           the sweep orphans stays a zombie -- and Java reports a zombie alive,
 *           measured. A sweep waiting on it would lose the slot for good.
 * Given:    The shipped build server as PID 1 in the builder image built from
 *           this tree (`startBuilderServer`), with a stub `build.sh` that acts
 *           as the slot's user; and, for the last case, the image alone.
 * When:     A build starts a daemon and writes into every swept directory;
 *           another runs while the first sleeps; a user leaves a file and a
 *           process before the server starts; a slot holds a mount point that
 *           root cannot remove; a build leaves a zombie; and each user's
 *           writable paths are computed.
 * Then:     The daemon and the files are gone and nobody else's files are; the
 *           running build is untouched; what was left before the start is gone
 *           before the first build; the unsweepable slot is refused with 500 and
 *           the build never ran; the zombie does not block its slot; and nothing
 *           writable lies outside the swept list but `/m2`.
 * Covers:   B7-9, FR37, FR42
 * Unhappy:  Every negative has its counterpart here: the sweep removes the
 *           slot user's files and keeps root's and the other user's, and it
 *           leaves a running build alone -- a sweep that deleted everything
 *           would pass every negative.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import { builderImage } from '../lib/builderimage';
import { startBuilderServer, STUB_PREAMBLE, type BuilderServer } from '../lib/builderserver';

const started: BuilderServer[] = [];
const start = (opts: Parameters<typeof startBuilderServer>[0]) => {
  const s = startBuilderServer(opts);
  started.push(s);
  return s;
};
afterAll(() => started.forEach((s) => s.stop()));

const PLANTED = [
  '/tmp/b7-9.planted',
  '/var/tmp/b7-9.planted',
  '/run/lock/b7-9.planted',
  '/dev/shm/b7-9.planted',
  '/tmp/b7-9.dir'
];

/**
 * Waits up to 15 s for the slot user to have no live process and none of the
 * planted paths, then reports what is there. The sweep after a build runs once
 * the response is sent, so reading at once would race it.
 */
const settle = (user: string) => `
  live() { ps -u ${user} -o stat= 2>/dev/null | grep -vc '^Z'; }
  left() { for p in ${PLANTED.join(' ')}; do [ -e "$p" ] && echo "$p"; done; }
  for i in $(seq 1 60); do [ "$(live)" = 0 ] && [ -z "$(left)" ] && break; sleep 0.25; done
  printf 'LIVE=%s\\n' "$(live)"
  printf 'LEFT=[%s]\\n' "$(left | tr '\\n' ' ')"
`;

describe('B7-9 a build leaves nothing running or written behind it', () => {
  let out = '';
  let user = '';
  const s = start({
    stub: `${STUB_PREAMBLE}
as_user 'nohup sleep 600 >/dev/null 2>&1 &
  touch ${PLANTED.slice(0, 4).join(' ')}
  mkdir /tmp/b7-9.dir && touch /tmp/b7-9.dir/inner'`
  });
  s.exec(`
    touch /tmp/b7-9.root-keep
    for u in builder builder2; do touch /tmp/b7-9.keep-$u && chown $u /tmp/b7-9.keep-$u; done
  `);
  const built = s.build('/repos/b7-9-a');
  user = built.stdout.match(/^BUILD-USER=(\S+)$/m)?.[1] ?? '';
  const other = user === 'builder' ? 'builder2' : 'builder';
  out = built.stdout + s.exec(`
    ${settle(user)}
    for f in /tmp/b7-9.root-keep /tmp/b7-9.keep-${other} /tmp/b7-9.keep-${user}; do
      printf 'KEEP %s=%s\\n' "$f" "$([ -e "$f" ] && echo present || echo gone)"
    done
  `).stdout;

  test('B7-9 nothing a build started is still running after it', () => {
    expect(out).toContain('HTTP=200');
    expect(user).toMatch(/^builder2?$/);
    expect(out).toContain('LIVE=0');
  });

  test('B7-9 nothing a build wrote outside its work directory survives it', () => {
    expect(out).toContain('LEFT=[]');
  });

  test('B7-9 the sweep removes the slot user\'s files and nobody else\'s', () => {
    const other = user === 'builder' ? 'builder2' : 'builder';
    expect(out).toContain('KEEP /tmp/b7-9.root-keep=present');
    expect(out).toContain(`KEEP /tmp/b7-9.keep-${other}=present`);
    // The slot user's own file goes too, planted by root or not.
    expect(out).toContain(`KEEP /tmp/b7-9.keep-${user}=gone`);
  });
});

describe('B7-9 a running build is untouched by the other slot\'s sweep', () => {
  const s = start({
    stub: `${STUB_PREAMBLE}
case "$2" in
  *slow*) as_user 'touch /tmp/b7-9.a-keep; sleep 6
    [ -e /tmp/b7-9.a-keep ] && echo A-KEEP=present || echo A-KEEP=gone' ;;
  *) as_user 'touch /tmp/b7-9.b-file' ;;
esac`
  });
  const out = s.exec(`
    curl -s -w '\\nHTTP=%{http_code}\\n' -H 'X-Liquid-Agent: 1' -X POST --data-binary /repos/slow http://127.0.0.1:8779/build > /tmp/a.out &
    sleep 1.5
    curl -s -w '\\nHTTP=%{http_code}\\n' -H 'X-Liquid-Agent: 1' -X POST --data-binary /repos/fast http://127.0.0.1:8779/build
    wait
    cat /tmp/a.out
  `).stdout;

  test('B7-9 a running build is untouched by the other slot\'s sweep', () => {
    expect(out.match(/HTTP=200/g)?.length).toBe(2);
    expect(out).toContain('A-KEEP=present');
  });
});

describe('B7-9 what was left before a restart', () => {
  const s = start({
    stub: `${STUB_PREAMBLE}`,
    pre: `su builder -s /bin/sh -c 'touch /tmp/b7-9.stale; nohup sleep 600 >/dev/null 2>&1 &'
          su builder -s /bin/sh -c 'test -e /tmp/b7-9.stale' && echo planted > /tmp/b7-9.pre`
  });
  const out = s.exec(`
    printf 'PRE=%s\\n' "$(cat /tmp/b7-9.pre 2>/dev/null)"
    printf 'STALE=%s\\n' "$([ -e /tmp/b7-9.stale ] && echo present || echo gone)"
    printf 'LIVE=%s\\n' "$(ps -u builder -o stat= 2>/dev/null | grep -vc '^Z')"
  `).stdout;

  test('B7-9 what was left before a restart is gone before the first build', () => {
    // Read, so the case cannot pass because the plant never happened.
    expect(out).toContain('PRE=planted');
    expect(out).toContain('STALE=gone');
    expect(out).toContain('LIVE=0');
  });
});

describe('B7-9 a slot that cannot be swept', () => {
  // Mount points owned by the slot users: root cannot remove a mount point, so
  // the sweep is left with a file it cannot clear, on either slot.
  let s: BuilderServer | null = null;
  let refused = '';
  try {
    s = start({
      stub: `${STUB_PREAMBLE}\ntouch /tmp/b7-9.mvn-ran`,
      dockerArgs: ['--tmpfs', '/tmp/b7-9.pinned:uid=1500', '--tmpfs', '/tmp/b7-9.pinned2:uid=1501']
    });
  } catch (e) {
    refused = String(e);
  }
  const out = s
    ? s.build('/repos/b7-9-pinned').stdout +
      s.exec(`printf 'RAN=%s\\n' "$([ -e /tmp/b7-9.mvn-ran ] && echo yes || echo no)"`).stdout
    : '';

  test.skipIf(s === null)('B7-9 a slot that cannot be swept is not used', () => {
    expect(out).toContain('HTTP=500');
    expect(out).toContain('could not clear');
    expect(out).toMatch(/left behind as builder2? /);
    expect(out).toContain('RAN=no');
  });

  test.skipIf(s !== null)('B7-9 this daemon refused the tmpfs mount, so the unsweepable slot is not tested', () => {
    // Reads the refusal, so a run in this state says which scenario is missing.
    expect(refused).not.toBe('');
  });
});

describe('B7-9 a zombie a build leaves', () => {
  // The inner `sleep 0` exits under a parent that execs and never waits; when the
  // sweep kills that parent, the zombie passes to PID 1 -- the server -- which
  // never reaps it.
  const s = start({
    stub: `${STUB_PREAMBLE}\nas_user "sh -c 'sleep 0 & exec sleep 600' >/dev/null 2>&1 &"`
  });
  // Two builds, one per slot, then a third on the first slot again.
  const first = s.build('/repos/b7-9-z1');
  s.build('/repos/b7-9-z2');
  const zombies = s.exec(`sleep 2; ps -u builder -o stat= | grep -c '^Z'`).stdout.trim();
  const third = s.build('/repos/b7-9-z3');

  test('B7-9 a zombie a build leaves does not block its slot', () => {
    expect(first.stdout).toContain('BUILD-USER=builder\n');
    // The zombie is really there, or the case is about nothing.
    expect(Number(zombies)).toBeGreaterThan(0);
    expect(third.stdout).toContain('BUILD-USER=builder\n');
    expect(third.stdout).toContain('HTTP=200');
  });
});

describe('B7-9 the swept list is what the image permits', () => {
  // Read out of the server, so the case compares the code with the image rather
  // than with a list of its own.
  const server = readFileSync(join(repoRoot, 'config/nar_builder/BuildServer.java'), 'utf8');
  const swept = [...(server.match(/SWEPT\s*=\s*List\.of\(([^)]*)\)/)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map(
    (m) => m[1]
  );
  const r = sh([
    'docker', 'run', '--rm', '--entrypoint', 'sh', builderImage(), '-c',
    `for u in builder builder2; do
       su $u -s /bin/sh -c 'find / -xdev -path /proc -prune -o -writable \\( -type d -o -type f \\) -print 2>/dev/null' | sed "s|^|$u |"
       awk '{print $2}' /proc/mounts | while read -r m; do
         [ -d "$m" ] && su $u -s /bin/sh -c "test -w '$m'" && echo "$u $m"
       done
     done`
  ]);
  const found = r.stdout
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split(' ').slice(1).join(' '));
  const outside = [...new Set(found)].filter(
    (p) => !swept.some((d) => p === d || p.startsWith(`${d}/`))
  );

  test('B7-9 nothing either build user can write lies outside the swept directories', () => {
    expect(swept.length).toBeGreaterThan(0);
    expect(found.length).toBeGreaterThan(0);
    // `/m2` is tolerated by name: entrypoint.sh keeps it for #10, nothing on this
    // branch reads it, and on #10 it is the cache that must persist (FR42).
    expect(outside.filter((p) => p !== '/m2')).toEqual([]);
  });
});
