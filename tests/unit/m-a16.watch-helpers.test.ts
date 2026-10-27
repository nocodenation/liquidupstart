/**
 * A16-32 · Unit · The helpers the lock cases wait with report their own faults
 *
 * Purpose:  `watchOutput` and `awaitFile` in tests/lib/gitfixture.ts are how
 *           A15-1, A16-11 and A16-27 wait for a running `git.sh`. Both reported a
 *           fault of the harness as the product going silent. One failed reader
 *           ended the whole output while the other stream was still delivering,
 *           and the swallowed error left `until()` saying the run "has ended. It
 *           said:" with nothing after the colon. Both streams shared one stateful
 *           decoder. And a `Bun.spawnSync` result passes for a running child by
 *           shape, so it got the same empty answer at once -- measured on #19's
 *           head `fe85e1b` -- and nothing type-checks tests/ to refuse it. Found by
 *           a local review on 2026-10-20 and recorded on #45.
 * Given:    Children made of hand-built streams, so each fault happens exactly
 *           when the case says; and real `Bun.spawn` and `Bun.spawnSync` children
 *           of `sh`.
 * When:     A stream fails while the other still has the awaited line to come; a
 *           stream fails and the other ends without it; a two-byte character is
 *           split across two chunks of one stream with a chunk of the other in
 *           between; and each helper is handed a finished run.
 * Then:     The line that arrives later is still found; a failure is reported as
 *           the harness's, with what was read before it, by `until()` and by
 *           `finished()`; the character arrives
 *           whole; a finished run, and a child whose stdout or stderr is not piped, are
 *           refused as a fault of the test. A real child
 *           is still read, and a real file still awaited.
 * Covers:   A16-32
 * Negative: the failed reader, the split character, the finished run and a
 *           child whose stdout or stderr is not piped.
 * Counterpart: a real child whose line arrives, and a real file awaited, so a
 *           helper that refused everything cannot pass.
 *
 * Test data: the awaited line `waiting for the lock` on stderr; the failing
 * stream's reason `Error: probe read failure`, after it delivered `partial`,
 * beside a stderr that delivers the line at 60 ms, closes at 40 ms without it,
 * delivers `more` at 20 ms and closes at 30 ms, or never closes, with a deadline
 * of one second;
 * `é` as the bytes 0xC3 and 0xA9 on stdout with `x` on stderr between them,
 * at 0, 50 and 20 ms; for the real child, `sh -c 'echo out; echo waiting for the
 * lock >&2'`; for the unpiped child, the hand-built child with its stderr, then its
 * stdout, left undefined;
 * and a file `held` holding `4242`, written by `sh -c 'printf 4242 > held; sleep 1'`.
 *
 * Deliberately not driven: the file removed between a check and a read in
 * `awaitFile`. The window was two system calls wide, and the helper now makes
 * one.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { watchOutput, awaitFile } from '../lib/gitfixture';

const LINE = 'waiting for the lock';
const enc = new TextEncoder();

// A stream that delivers `chunks` at the given times, then closes or fails.
function timed(chunks: Array<[number, Uint8Array | string]>, end: { at: number; fail?: string }): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const [at, v] of chunks) setTimeout(() => c.enqueue(typeof v === 'string' ? enc.encode(v) : v), at);
      setTimeout(() => (end.fail ? c.error(new Error(end.fail)) : c.close()), end.at);
    }
  });
}

// What Bun.spawn hands back, as far as the helpers read it.
const running = (stdout: ReadableStream<Uint8Array>, stderr: ReadableStream<Uint8Array>) => ({
  stdout,
  stderr,
  exitCode: null,
  exited: new Promise<number>(() => {})
});

const work = mkdtempSync(join(tmpdir(), 'lu-a16-32-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('A16-32 a reader that fails is the harness, not the run going quiet', () => {
  test('A16-32 a line still to come on the other stream is found', async () => {
    const out = watchOutput(
      running(timed([[0, 'partial']], { at: 10, fail: 'probe read failure' }), timed([[60, `${LINE}\n`]], { at: 80 }))
    );
    await out.until(LINE, 5);
    expect(out.text).toContain(LINE);
  });

  test('A16-32 and when it never comes, the failure is reported as the harness\'s, with what was read', async () => {
    const out = watchOutput(running(timed([[0, 'partial']], { at: 10, fail: 'probe read failure' }), timed([], { at: 40 })));
    let said = '';
    await out.until(LINE, 5).catch((e: Error) => (said = e.message));
    expect(said).toContain('could not be read (Error: probe read failure), a fault of the test');
    expect(said).toContain('partial');
  });

  test('A16-32 and finished() says so too, rather than handing back what it read as the whole', async () => {
    const out = watchOutput(running(timed([[0, 'partial']], { at: 10, fail: 'probe read failure' }), timed([[20, 'more']], { at: 30 })));
    let said = '';
    await out.finished().catch((e: Error) => (said = e.message));
    expect(said).toContain('could not be read (Error: probe read failure), a fault of the test');
    expect(said).toContain('partial');
  });

  test('A16-32 and so does until() when the other stream stays open past its deadline', async () => {
    const open = new ReadableStream<Uint8Array>({ start() {} });
    const out = watchOutput(running(timed([[0, 'partial']], { at: 10, fail: 'probe read failure' }), open));
    let said = '';
    await out.until(LINE, 1).catch((e: Error) => (said = e.message));
    expect(said).toContain('could not be read (Error: probe read failure), a fault of the test');
  });
});

describe('A16-32 each stream is decoded on its own', () => {
  test('A16-32 a character split across two chunks arrives whole, with the other stream in between', async () => {
    const out = watchOutput(
      running(timed([[0, new Uint8Array([0xc3])], [50, new Uint8Array([0xa9])]], { at: 70 }), timed([[20, 'x']], { at: 30 }))
    );
    const text = await out.finished();
    expect({ whole: text.includes('é'), replaced: text.includes('�') }).toEqual({ whole: true, replaced: false });
  });
});

describe('A16-32 a finished run is refused as a fault of the test', () => {
  const finished = () => Bun.spawnSync(['sh', '-c', `echo out; echo ${LINE} >&2`], { stdout: 'pipe', stderr: 'pipe' });

  test('A16-32 watchOutput, handed one, says so rather than that the run said nothing', () => {
    expect(() => watchOutput(finished())).toThrow('needs a child from Bun.spawn');
  });

  test('A16-32 and watchOutput refuses a child whose stdout or stderr is not piped', () => {
    // A decision in the helper, so both sides: the real child below is the one
    // it permits. Review of #47, A2.
    const piped = () => timed([], { at: 1 });
    expect(() => watchOutput({ ...running(piped(), piped()), stderr: undefined })).toThrow('needs both stdout and stderr piped');
    expect(() => watchOutput({ ...running(piped(), piped()), stdout: undefined })).toThrow('needs both stdout and stderr piped');
  });

  test('A16-32 and awaitFile too', async () => {
    let said = '';
    await awaitFile(join(work, 'never'), finished(), undefined, 1).catch((e: Error) => (said = e.message));
    expect(said).toContain('needs a child from Bun.spawn');
  });
});

describe('A16-32 the counterpart: a real child is still read', () => {
  test('A16-32 its line is found', async () => {
    const run = Bun.spawn(['sh', '-c', `echo out; echo ${LINE} >&2`], { stdout: 'pipe', stderr: 'pipe' });
    const out = watchOutput(run);
    await out.until(LINE, 10);
    expect(await out.finished()).toContain('out');
  });

  test('A16-32 and a file it writes is awaited', async () => {
    const run = Bun.spawn(['sh', '-c', 'printf 4242 > held; sleep 1'], { cwd: work, stdout: 'pipe', stderr: 'pipe' });
    expect(await awaitFile(join(work, 'held'), run, undefined, 10)).toBe('4242');
    await run.exited;
  });
});
