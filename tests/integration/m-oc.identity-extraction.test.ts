/**
 * M-OC · Integration · The identity reader, executed
 *
 * Purpose:  Three findings of the 2026-10-01 review meet in one function.
 *           **B5**: *"OC-40 — with both `exit 1`s in the identity check replaced
 *           by `true` and the last identity taken instead of the first, the file
 *           stays 6 / 6. No test runs the awk extraction."* **C4**: single quotes,
 *           a lower-case header and `$remote_user` are valid nginx and were all
 *           refused as *"no identity found"* — **after `down.sh` had emptied the
 *           stack**, because `start.sh` calls the teardown at line 150 and the
 *           OpenClaw step at 280. **C5**: a template mixing a quoted and an
 *           unquoted line dropped the unquoted one **silently**.
 * Given:    `config/scripts/start/lib/proxy-identity.sh` sourced in a bash
 *           process, and a fabricated `nginx.conf` per scenario
 * When:     `lu_proxy_identity` is called on it
 * Then:     the identity is printed on stdout and the exit is 0, or nothing is
 *           printed on stdout, the exit is 1 and stderr says which spelling it is
 *           refusing and why
 * Covers:   OC-74, OC-40, C4, C5, §9 R3
 * Unhappy:  Six of the nine refuse. The three that extract are what keep them
 *           from being met by a function that refuses everything — which is what
 *           the reviewer's control proved the text-only cases could not tell
 *           apart. The ninth runs against the template this repository ships, so
 *           the fabricated eight are not the only evidence.
 *
 * Why a library: the identity may not be repeated in the start script (OC-39), it
 *           is needed by `openclaw.sh` *after* the teardown, and the verdict is
 *           needed by `start.sh` *before* it. One function, two callers, asked
 *           twice rather than carried across a teardown.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const LIB = join(repoRoot, 'config', 'scripts', 'start', 'lib', 'proxy-identity.sh');

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** Runs `lu_proxy_identity` on a template and reports what it decided. */
function ask(templateBody: string | { shipped: true }) {
  const dir = mkdtempSync(join(tmpdir(), 'm-oc-identity-'));
  dirs.push(dir);
  let template: string;
  if (typeof templateBody === 'string') {
    template = join(dir, 'nginx.conf');
    writeFileSync(template, templateBody);
  } else {
    template = join(repoRoot, 'config', 'nginx', 'templates', 'nginx.conf');
  }
  const runner = join(dir, 'ask.sh');
  writeFileSync(
    runner,
    `#!/usr/bin/env bash\nset -uo pipefail\n. ${JSON.stringify(LIB)}\nlu_proxy_identity "$1"\n`,
    { mode: 0o755 }
  );
  const r = sh(['bash', runner, template], dir);
  return { code: r.code, identity: r.stdout.trim(), stderr: r.stderr };
}

// A directive as nginx reads it, with the prose the real template has above it:
// a regex that matched the sentence rather than the directive would be caught.
const directive = (value: string, host = 'openclaw') =>
  `    # The identity nginx vouches for on ${host}; see X-Forwarded-User below.\n` +
  `    proxy_set_header X-Forwarded-User "${value}";\n`;

const IDENTITY = 'proxy@liquidupstart.local';

describe('OC-74 the identity is read out of the template, or the start stops', () => {
  test('OC-74 one identity is extracted', () => {
    const r = ask(directive(IDENTITY));
    expect(r.code).toBe(0);
    expect(r.identity).toBe(IDENTITY);
  });

  test('OC-74 and the same identity on several hosts is still that one identity', () => {
    // The real template's shape -- one per OpenClaw vhost. It is also the case
    // the first form of this fix broke: it compared **unique values** against the
    // count of lines, so three identical lines read as a refusal and every real
    // start would have stopped. Measured before this scenario existed.
    const r = ask(
      directive(IDENTITY, 'openclaw') +
        directive(IDENTITY, 'openclaw-gateway') +
        directive(IDENTITY, 'openclaw-cli')
    );
    expect(r.code).toBe(0);
    expect(r.identity).toBe(IDENTITY);
  });

  test('OC-74 two different identities stop the start, and both are named', () => {
    const r = ask(directive(IDENTITY) + directive('other@liquidupstart.local', 'gateway'));
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('sets more than one X-Forwarded-User identity');
    // Named, because the operator has to know which two to reconcile.
    expect(r.stderr).toContain(IDENTITY);
    expect(r.stderr).toContain('other@liquidupstart.local');
  });

  test('OC-74 a template with no identity stops the start', () => {
    // Deliberately not an empty file: a template that talks about the header in
    // prose but never sets it is the case the anchored regex exists for, and a
    // regex matching the comment would make this one green by accident.
    const r = ask('server {\n  # X-Forwarded-User is what authenticates here.\n  listen 80;\n}\n');
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('no X-Forwarded-User identity found');
  });

  test('OC-74 an empty identity beside a real one stops the start, rather than picking the real one', () => {
    // **The scenario the reviewer's second control was pointing at**, and it took
    // measuring to find. B5 reported that taking the *last* identity instead of
    // the first leaves the file green. On every ordinary path it does, and that
    // is not a gap: `sort -u` leaves one line, and two distinct identities exit
    // before the choice is made, so `head` and `tail` cannot be told apart.
    //
    // They differ in exactly one shape. `X-Forwarded-User ""` next to a real
    // identity gives two lines of which `grep -c .` counts **one** -- an empty
    // line is not a match -- so the more-than-one guard does not fire. `head`
    // takes the empty value and the start stops; `tail` takes the real one and
    // starts a stack in which some vhost vouches for nobody.
    const r = ask(directive('', 'openclaw-cli') + directive(IDENTITY));
    expect(r.code).not.toBe(0);
    expect(r.identity).toBe('');
    // And the refusal says which of the two it is. It used to say "no identity
    // found" about a template that plainly set one.
    expect(r.stderr).toContain('sets an empty X-Forwarded-User identity');
  });
});

describe('OC-74 a spelling nginx accepts and this does not is refused out loud', () => {
  // C4 and C5. Each of these is valid nginx. The strict pattern skips them, and
  // skipping is what was wrong -- not the strictness: reading every spelling
  // means re-implementing a slice of nginx's parser, for a file this repository
  // generates. So they are refused, and the refusal names the line.
  const cases: Array<[string, string]> = [
    ["single quotes", "    proxy_set_header X-Forwarded-User 'proxy@liquidupstart.local';\n"],
    ['a lower-case header name', '    proxy_set_header x-forwarded-user "proxy@liquidupstart.local";\n'],
    ['an unquoted variable', '    proxy_set_header X-Forwarded-User $remote_user;\n'],
    ['an unquoted literal', '    proxy_set_header X-Forwarded-User proxy@liquidupstart.local;\n']
  ];

  for (const [label, body] of cases) {
    test(`OC-74 ${label} is refused, and the line is quoted back`, () => {
      const r = ask(body);
      expect(r.code).not.toBe(0);
      expect(r.stderr).toContain('in a form this cannot read');
      expect(r.stderr).toContain('line 1:');
      // The spelling it does read, so the message is a repair and not a verdict.
      expect(r.stderr).toContain('proxy_set_header X-Forwarded-User "someone@example.org";');
      // What must NOT be said: this template sets the header, so the old message
      // was a false statement about the file in front of the operator.
      expect(r.stderr).not.toContain('no X-Forwarded-User identity found');
    });
  }

  test('OC-74 C5: a quoted line beside an unquoted one refuses instead of dropping one', () => {
    // The silent half. Before this, the quoted line won and the unquoted one was
    // not mentioned -- so a template that set two things granted one of them and
    // said nothing about the other.
    const r = ask(directive(IDENTITY) + '    proxy_set_header X-Forwarded-User $remote_user;\n');
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('in a form this cannot read');
    expect(r.stderr).toContain('$remote_user');
    // Not approved under the identity it could read.
    expect(r.identity).toBe('');
  });

  test('OC-74 and the template this repository ships yields exactly one', () => {
    // The point of all of the above: the function is run against the real file,
    // so the eight fabricated templates are not the only thing it is known to
    // work on.
    const r = ask({ shipped: true });
    expect(r.code).toBe(0);
    expect(r.identity).toContain('@');
  });
});

describe('OC-74 and the verdict is asked before the teardown, not after it', () => {
  test('OC-74 start.sh checks the identity before it calls down.sh', () => {
    // C4's other half, and the one with the operator-visible consequence: the
    // check lived only in `openclaw.sh`, which runs after `down.sh`, so a
    // template it could not read ended the start with nothing running. The two
    // positions are computed from the file rather than quoted as line numbers,
    // which would go stale on the next edit.
    const start = readFileSync(join(repoRoot, 'scripts', 'linux', 'start.sh'), 'utf8');
    const check = start.indexOf('lu_proxy_identity');
    const teardown = start.indexOf('/scripts/linux/down.sh"');
    expect(check).toBeGreaterThan(-1);
    expect(teardown).toBeGreaterThan(-1);
    expect(check).toBeLessThan(teardown);
    // And it says so, the way the subnet and address checks above it do.
    expect(start.slice(check, teardown)).toContain('Nothing has been stopped');
  });

  test('OC-74 and both callers ask the same function rather than carrying a copy', () => {
    // OC-39's rule: the identity appears in one place. Two copies of the awk
    // would be two places for it to drift, which is the defect this whole pair
    // of cases exists around.
    const start = readFileSync(join(repoRoot, 'scripts', 'linux', 'start.sh'), 'utf8');
    const oc = readFileSync(
      join(repoRoot, 'config', 'scripts', 'start', 'openclaw.sh'),
      'utf8'
    );
    for (const [name, text] of [['start.sh', start], ['openclaw.sh', oc]] as const) {
      expect(text, name).toContain('lib/proxy-identity.sh');
      expect(text, name).toContain('lu_proxy_identity');
      // Neither carries the extraction itself any more.
      expect(text, name).not.toContain('proxy_set_header[[:space:]]+X-Forwarded-User');
    }
  });
});
