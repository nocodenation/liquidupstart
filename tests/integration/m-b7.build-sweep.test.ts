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
 *           measured. A sweep waiting on it would lose the slot for good. A
 *           process whose main thread has exited while another runs shows `Z`
 *           too, and is not one: so "live" here means a task of the user's uid
 *           in any state but `Z`, never a process, read from /proc as bytes,
 *           since a task names itself and a name need not be UTF-8, and its
 *           `status` split on `\n` alone, since a name may carry `\x85`.
 * Given:    The shipped build server as PID 1 in the builder image built from
 *           this tree (`startBuilderServer`), with a stub `build.sh` that acts
 *           as the slot's user; and, for the swept list, the image started
 *           through its own entrypoint, so `/m2` is there as in compose.
 * When:     A build starts a daemon and writes into every swept directory;
 *           another runs while the first sleeps; a user leaves a file and a
 *           process before the server starts; a slot holds a mount point that
 *           root cannot remove; a build leaves a zombie; a build leaves a
 *           process whose main thread has exited and whose other thread keeps
 *           writing `.mavenrc` into the slot's work directories; a build leaves
 *           a chain that forks a successor and exits; a build leaves a process
 *           named `\xff\xfe\xfd` writing `.mavenrc` the same way; a build
 *           leaves a process named `\x85Uid: ` and the other slot's uid while
 *           that slot builds; `builder`'s passwd uid reads `00` while root runs
 *           a `sleep`; and each user's writable paths are computed, on `/`
 *           and inside every other mount.
 * Then:     The daemon and the files are gone and nobody else's files are; the
 *           running build is untouched; what was left before the start is gone
 *           before the first build; the unsweepable slot is refused with 500,
 *           naming `--force-recreate` as the remedy, and the build never ran;
 *           the zombie does not block its slot; the thread, the chain and the
 *           unreadably named process are ended and the slot's next build finds
 *           no `.mavenrc`; the forged `Uid:` line does not fail the other
 *           slot, whose build is 200; the `00` uid is refused with 500 and
 *           root's `sleep` lives; and nothing writable lies outside the swept
 *           list but `/m2`, which `builder` is seen to write, so the
 *           tolerance is used.
 * Covers:   B7-9, FR37, FR42
 * Unhappy:  Every negative has its counterpart here: the sweep removes the
 *           slot user's files and keeps root's and the other user's, and it
 *           leaves a running build alone -- a sweep that deleted everything
 *           would pass every negative. The non-UTF-8 name's counterpart is the
 *           first daemon, ordinarily named; the forged line's is the running
 *           build, where the other slot's build runs beside an ordinarily
 *           named process of the first slot's user and is 200; the `00` uid's
 *           is every other scenario, where the uids are 1500 and 1501 and the
 *           sweep runs.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import { builderImage, builderLabels } from '../lib/builderimage';
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
 * The user's live tasks: a /proc/<pid>/task/<tid> whose real uid is the user's
 * and whose state is not Z. Tasks, because a process whose main thread has
 * exited shows Z while its other threads run; one gone mid-read is not live.
 * Bytes, so a task name that is not UTF-8 cannot make the count itself fail;
 * split on `\n` alone, since `splitlines()` breaks on `\x85` as Java's `^` did.
 * One process for the scan: the fork chain below leaves a zombie per member
 * under a PID 1 that never reaps them.
 */
const LIVE = (user: string) => `
  live() {
    python3 -c '
import glob, sys
n = 0
for t in glob.glob("/proc/[0-9]*/task/[0-9]*"):
    try:
        status = open(t + "/status", "rb").read().decode("latin-1")
        stat = open(t + "/stat", "rb").read().decode("latin-1")
    except OSError:
        continue
    uid = [l.split("\\t")[1] for l in status.split("\\n") if l.startswith("Uid:\\t")]
    if uid == [sys.argv[1]] and stat[stat.rindex(")") + 2] != "Z":
        n += 1
print(n)' "$(id -u ${user})"
  }
`;

/**
 * Waits up to 15 s for the slot user to have no live task and none of the
 * planted paths, then reports what is there. The sweep after a build runs once
 * the response is sent, so reading at once would race it.
 */
const settle = (user: string) => `
  ${LIVE(user)}
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
    // Recreated, not restarted: a restart keeps /tmp, which is what is stuck.
    expect(out).toContain('--force-recreate');
    expect(out).toContain('RAN=no');
  });

  // Skipped wherever the mount is accepted, which is when the case above ran.
  test.skipIf(s !== null)('B7-9 on a daemon refusing the tmpfs mount, the missing unsweepable-slot case is reported', () => {
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
  // Through the image's own entrypoint, so what entrypoint.sh creates and hands
  // over -- `/m2` among it -- is there as it is in compose.
  const run = sh(['docker', 'run', '-d', ...builderLabels(), builderImage()]);
  const id = run.stdout.trim();
  const up = run.code === 0
    ? sh(['docker', 'exec', id, 'sh', '-c',
        'for i in $(seq 1 240); do curl -fsS http://127.0.0.1:8770/health >/dev/null 2>&1 && exit 0; sleep 0.25; done; exit 1'])
    : run;
  // Inside every mount but `/` and the kernel's, not only at its top. Typed by
  // `test`, which asks stat: docker binds `/dev/null` and its kind over regular
  // files, and find's `-type` and `%y` both take readdir's word -- measured.
  const r = up.code === 0
    ? sh(['docker', 'exec', id, 'sh', '-c',
        `kept() { while read -r p; do if [ ! -L "$p" ] && { [ -f "$p" ] || [ -d "$p" ]; }; then echo "$1 $p"; fi; done; }
         for u in builder builder2; do
           su $u -s /bin/sh -c 'find / -xdev -path /proc -prune -o -writable -print 2>/dev/null' | kept $u
           awk '{print $2}' /proc/self/mounts | sort -u | while read -r m; do
             case "$m" in /|/proc|/proc/*|/sys|/sys/*) continue ;; esac
             su $u -s /bin/sh -c "find '$m' -xdev -writable -print 2>/dev/null" | kept $u
           done
         done`])
    : up;
  if (run.code === 0) sh(['docker', 'rm', '-f', id]);
  const lines = r.stdout.split('\n').filter(Boolean);
  const found = lines.map((l) => l.split(' ').slice(1).join(' '));
  const outside = [...new Set(found)].filter(
    (p) => !swept.some((d) => p === d || p.startsWith(`${d}/`))
  );

  test('B7-9 nothing either build user can write lies outside the swept directories', () => {
    expect(r.code === 0 ? '' : r.output).toBe('');
    expect(swept.length).toBeGreaterThan(0);
    // `/m2` is tolerated by name: entrypoint.sh keeps it while B6-36 and B6-38
    // drive its handling, and no build reads it (FR42). Seen, so the tolerance is
    // shown to be used and a container that skipped the entrypoint fails here.
    expect(lines).toContain('builder /m2');
    expect(outside.filter((p) => p !== '/m2')).toEqual([]);
  });
});

describe('B7-9 a process whose main thread has exited', () => {
  // The leader calls pthread_exit, so /proc/<pid>/stat says Z, while its thread
  // writes into every work directory of the slot user it can reach -- the
  // slot's next build's included, unless the sweep ended it.
  const s = start({
    pre: `cat > /opt/b7-9-plant.py <<'PY'
import ctypes, glob, threading, time
def plant():
    while True:
        for home in glob.glob('/tmp/tmp.*/home'):
            try:
                with open(home + '/.mavenrc', 'w') as f:
                    f.write('echo B7-9-PLANTED')
            except OSError:
                pass
        time.sleep(0.05)
threading.Thread(target=plant).start()
ctypes.CDLL(None).pthread_exit(None)
PY
chmod 644 /opt/b7-9-plant.py`,
    stub: `${STUB_PREAMBLE}
case "$2" in
  *b7-9-t1) as_user 'nohup python3 /opt/b7-9-plant.py >/dev/null 2>&1 &' ;;
  *b7-9-t3) sleep 1
    if [ -e "$W/home/.mavenrc" ]; then echo "MAVENRC=$(cat "$W/home/.mavenrc")"; else echo MAVENRC=absent; fi ;;
esac`
  });
  const first = s.build('/repos/b7-9-t1');
  const user = first.stdout.match(/^BUILD-USER=(\S+)$/m)?.[1] ?? '';
  const live = s.exec(`
    ${LIVE(user)}
    for i in $(seq 1 60); do [ "$(live)" = 0 ] && break; sleep 0.25; done
    printf 'LIVE=%s\\n' "$(live)"
  `).stdout;
  const second = s.build('/repos/b7-9-t2');
  const third = s.build('/repos/b7-9-t3');

  test('B7-9 a process whose main thread has exited while another runs is ended, and plants nothing in the slot\'s next build', () => {
    expect(user).toMatch(/^builder2?$/);
    expect(live).toContain('LIVE=0');
    expect(first.stdout).toContain('HTTP=200');
    expect(second.stdout).toContain('HTTP=200');
    // The third is on the first's slot, or it reads a directory the thread could
    // never have reached.
    expect(third.stdout).toContain(`BUILD-USER=${user}\n`);
    expect(third.stdout).toContain('HTTP=200');
    expect(third.stdout).toContain('MAVENRC=absent');
  });
});

describe('B7-9 a process that keeps forking a successor', () => {
  // At any instant one member is running and its parent has gone, so a sweep
  // that lists and then signals is always one behind.
  const s = start({
    stub: `${STUB_PREAMBLE}
case "$2" in
  *b7-9-f1) as_user "nohup python3 -c 'import os
while True:
  if os.fork(): os._exit(0)' >/dev/null 2>&1 &"
    sleep 1 ;;
esac`
  });
  const first = s.build('/repos/b7-9-f1');
  const user = first.stdout.match(/^BUILD-USER=(\S+)$/m)?.[1] ?? '';
  const live = s.exec(`
    ${LIVE(user)}
    for i in $(seq 1 60); do [ "$(live)" = 0 ] && break; sleep 0.25; done
    printf 'LIVE=%s\\n' "$(live)"
  `).stdout;
  const second = s.build('/repos/b7-9-f2');
  const third = s.build('/repos/b7-9-f3');

  test('B7-9 a process that keeps forking a successor and exiting is ended', () => {
    expect(user).toMatch(/^builder2?$/);
    expect(live).toContain('LIVE=0');
    expect(first.stdout).toContain('HTTP=200');
    expect(second.stdout).toContain('HTTP=200');
    expect(third.stdout).toContain(`BUILD-USER=${user}\n`);
    expect(third.stdout).toContain('HTTP=200');
  });
});

describe('B7-9 a process whose name is not UTF-8', () => {
  // The review's name, which no UTF-8 decoder accepts: a strict read of its
  // /proc files threw, the throw was taken for a task that had gone, and the
  // kill went only to what the scan found. The stub waits for the name to be
  // set, so the sweep after the build cannot meet it still called python3.
  const s = start({
    pre: `cat > /opt/b7-9-name.py <<'PY'
import ctypes, glob, time
ctypes.CDLL(None).prctl(15, b'\\xff\\xfe\\xfd', 0, 0, 0)
print('named', flush=True)
while True:
    for home in glob.glob('/tmp/tmp.*/home'):
        try:
            with open(home + '/.mavenrc', 'w') as f:
                f.write('echo B7-9-PLANTED-NAME')
        except OSError:
            pass
    time.sleep(0.05)
PY
chmod 644 /opt/b7-9-name.py`,
    stub: `${STUB_PREAMBLE}
case "$2" in
  *b7-9-n1) as_user "nohup python3 /opt/b7-9-name.py > $W/tmp/named 2>&1 &"
    for i in $(seq 1 100); do [ -s "$W/tmp/named" ] && break; sleep 0.05; done
    echo "NAMED=$(cat "$W/tmp/named")" ;;
  *b7-9-n3) sleep 1
    if [ -e "$W/home/.mavenrc" ]; then echo "MAVENRC=$(cat "$W/home/.mavenrc")"; else echo MAVENRC=absent; fi ;;
esac`
  });
  const first = s.build('/repos/b7-9-n1');
  const user = first.stdout.match(/^BUILD-USER=(\S+)$/m)?.[1] ?? '';
  const live = s.exec(`
    ${LIVE(user)}
    for i in $(seq 1 60); do [ "$(live)" = 0 ] && break; sleep 0.25; done
    printf 'LIVE=%s\\n' "$(live)"
  `).stdout;
  const second = s.build('/repos/b7-9-n2');
  const third = s.build('/repos/b7-9-n3');

  test('B7-9 a process whose name is not UTF-8 is ended, and plants nothing in the slot\'s next build', () => {
    expect(user).toMatch(/^builder2?$/);
    // The name was set before the build ended, or the case is about python3.
    expect(first.stdout).toContain('NAMED=named');
    expect(live).toContain('LIVE=0');
    expect(first.stdout).toContain('HTTP=200');
    expect(second.stdout).toContain('HTTP=200');
    expect(third.stdout).toContain(`BUILD-USER=${user}\n`);
    expect(third.stdout).toContain('HTTP=200');
    expect(third.stdout).toContain('MAVENRC=absent');
  });
});

describe('B7-9 a process whose name carries a line of `status` of its own', () => {
  // The review's name: `\x85`, which ISO-8859-1 makes U+0085 and Java's
  // multi-line `^` a line break, then a `Uid:` line claiming the other slot's
  // uid. That slot's sweep could not end it and refused B with 500. A writes
  // its marker under /run, which no sweep touches, so B starts once A is named.
  const s = start({
    pre: `cat > /opt/b7-9-line.py <<'PY'
import ctypes, sys, time
ctypes.CDLL(None).prctl(15, b'\\x85Uid: ' + sys.argv[1].encode(), 0, 0, 0)
print('named', flush=True)
time.sleep(600)
PY
chmod 644 /opt/b7-9-line.py`,
    stub: `${STUB_PREAMBLE}
case "$2" in
  *b7-9-l1) other=$([ "$BUILD_USER" = builder ] && echo builder2 || echo builder)
    as_user "nohup python3 /opt/b7-9-line.py $(id -u $other) > $W/tmp/named 2>&1 &"
    for i in $(seq 1 100); do [ -s "$W/tmp/named" ] && break; sleep 0.05; done
    echo "NAMED=$(cat "$W/tmp/named")"
    touch /run/b7-9.line-named
    sleep 6 ;;
esac`
  });
  const out = s.exec(`
    curl -s -w '\\nHTTP=%{http_code}\\n' -H 'X-Liquid-Agent: 1' -X POST --data-binary /repos/b7-9-l1 http://127.0.0.1:8779/build > /run/b7-9.a.out &
    for i in $(seq 1 100); do [ -e /run/b7-9.line-named ] && break; sleep 0.05; done
    curl -s -w '\\nHTTP=%{http_code}\\n' -H 'X-Liquid-Agent: 1' -X POST --data-binary /repos/b7-9-l2 http://127.0.0.1:8779/build > /run/b7-9.b.out
    wait
    cat /run/b7-9.a.out; echo '--- B ---'; cat /run/b7-9.b.out
  `).stdout;
  const [a, b = ''] = out.split('--- B ---');
  const userA = a.match(/^BUILD-USER=(\S+)$/m)?.[1] ?? '';

  test('B7-9 a process whose name carries a line of `status` of its own does not make the other slot\'s sweep fail', () => {
    expect(userA).toMatch(/^builder2?$/);
    // Named before B started, or the case is about python3.
    expect(a).toContain('NAMED=named');
    expect(a).toContain('HTTP=200');
    expect(b).not.toContain('could not clear');
    expect(b).toContain('HTTP=200');
    expect(b).toContain(`BUILD-USER=${userA === 'builder' ? 'builder2' : 'builder'}\n`);
  });
});

describe('B7-9 a slot user whose passwd uid reads 00', () => {
  // `00` is root to the kernel and was not "0" to the string compare; `kill -1`
  // as root would end everything in the container but the server. The sleep
  // lives outside every swept directory, so only a kill can end it. A server
  // that sends it at start kills the probe of /health too, so a failed start is
  // read rather than thrown: thrown, the case would not run at all.
  let s: BuilderServer | null = null;
  let failed = '';
  try {
    s = start({
      stub: `${STUB_PREAMBLE}\ntouch /tmp/b7-9.mvn-ran`,
      pre: `sed -i 's/^builder:x:1500:/builder:x:00:/' /etc/passwd
grep '^builder:' /etc/passwd > /run/b7-9.passwd
nohup sleep 600 >/dev/null 2>&1 &
echo $! > /run/b7-9.root-sleep.pid`
    });
  } catch (e) {
    failed = String(e);
  }
  const built = s ? s.build('/repos/b7-9-root') : { stdout: '' };
  const after = !s ? '' : s.exec(`
    printf 'PASSWD=%s\\n' "$(cat /run/b7-9.passwd)"
    pid=$(cat /run/b7-9.root-sleep.pid)
    state=$(sed -n 's/.*) \\(.\\).*/\\1/p' /proc/$pid/stat 2>/dev/null)
    printf 'SLEEP=%s\\n' "$([ -n "$state" ] && [ "$state" != Z ] && echo alive || echo ended)"
  `).stdout;

  test('B7-9 a slot user whose passwd uid reads 00 is refused, and no kill -1 is sent as root', () => {
    expect(failed).toBe('');
    // The rewrite took, or the case is about the ordinary uid.
    expect(after).toContain('PASSWD=builder:x:00:');
    expect(built.stdout).toContain('HTTP=500');
    expect(built.stdout).toMatch(/left behind as builder /);
    expect(after).toContain('SLEEP=alive');
  });
});
