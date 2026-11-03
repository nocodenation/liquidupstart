/**
 * M-B7 · Integration · One user per build slot
 *
 * Purpose:  #31, the related item. The server runs two builds at once and both
 *           ran as uid 1500, against work directories `work_dir_for_build` made
 *           755 and builder-owned -- so a running build could write into the
 *           other's `$work/m2`, the repository FR37 had just made private. The
 *           operator chose one user per slot on 2026-10-29, over one slot with a
 *           process kill, which would have halved what the builder does at once.
 * Given:    The shipped build server as PID 1 in the builder image built from
 *           this tree, with a stub `build.sh` that makes its work directory with
 *           the shipped `work_dir_for_build`, prints the user it was handed and
 *           sleeps 6 s as that user.
 * When:     Two builds are started together and, while both sleep, root reads
 *           each work directory's owner and mode and each user tries to list the
 *           other's.
 * Then:     One build ran as `builder` and the other as `builder2`; each work
 *           directory is mode 700 and its own user's; every cross listing is
 *           refused.
 * Covers:   B7-8, FR35, FR42
 * Unhappy:  The refused listings are the negative. The two different users are
 *           its counterpart: with one user for both, a 700 directory would keep
 *           nobody out. A third concurrent build being refused rather than
 *           queued is B5-14's and is not repeated.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { startBuilderServer, STUB_PREAMBLE, type BuilderServer } from '../lib/builderserver';

let server: BuilderServer;
let out = '';

beforeAll(() => {
  server = startBuilderServer({ stub: `${STUB_PREAMBLE}\nas_user 'sleep 6'` });
  out = server.exec(`
    curl -s -H 'X-Liquid-Agent: 1' -X POST --data-binary /repos/b7-8-a http://127.0.0.1:8779/build > /tmp/a.out &
    curl -s -H 'X-Liquid-Agent: 1' -X POST --data-binary /repos/b7-8-b http://127.0.0.1:8779/build > /tmp/b.out &
    sleep 3
    for d in /tmp/tmp.*; do
      printf 'DIR %s %s\\n' "$(stat -c '%U %a' "$d")" "$d"
      owner=$(stat -c '%U' "$d")
      for u in builder builder2; do
        [ "$u" = "$owner" ] && continue
        printf 'CROSS %s->%s %s\\n' "$u" "$owner" "$(su $u -s /bin/sh -c "ls '$d' >/dev/null 2>&1" && echo listed || echo refused)"
      done
    done
    wait
    cat /tmp/a.out /tmp/b.out
  `).stdout;
}, 900_000);

afterAll(() => server?.stop());

describe('B7-8 each slot runs as its own user', () => {
  test('B7-8 two concurrent builds run as two different users', () => {
    expect(out).toContain('BUILD-USER=builder\n');
    expect(out).toContain('BUILD-USER=builder2\n');
    const owners = [...out.matchAll(/^DIR (\S+) /gm)].map((m) => m[1]);
    expect(new Set(owners)).toEqual(new Set(['builder', 'builder2']));
  });

  test('B7-8 neither of two concurrent builds can reach the other\'s work directory', () => {
    const dirs = [...out.matchAll(/^DIR (\S+) (\d+) /gm)].map((m) => ({ owner: m[1], mode: m[2] }));
    expect(dirs.length).toBe(2);
    expect(dirs.map((d) => d.mode)).toEqual(['700', '700']);
    // Every user other than a directory's owner is refused it. Which users own
    // them is the case above; this one holds the mode, so it still reads true
    // when two slots share a user, and goes red when the mode opens.
    const cross = [...out.matchAll(/^CROSS \S+ (\S+)$/gm)].map((m) => m[1]);
    expect(cross).toEqual(['refused', 'refused']);
  });
});
