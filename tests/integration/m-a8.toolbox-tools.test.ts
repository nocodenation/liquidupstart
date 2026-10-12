/**
 * M-A8 · Integration · The tools the git step needs are judged before the teardown
 *
 * Purpose:  The blocking finding of the 2026-09-30 review, found from a live run
 *           rather than from the diff. `scripts/linux/start.sh` runs `down.sh`
 *           123 lines before the git step, and the git step generates the agent
 *           key at line 36 — before it reads the declaration, so declaring
 *           nothing does not avoid it. This branch adds `git openssh-client` to
 *           `config/toolbox/Dockerfile` for that reason (A8-19), but nothing
 *           rebuilds a toolbox image that already exists: the dashboard builds it
 *           only when `docker image inspect` fails, and `update.sh` removed the
 *           other four locally built images and left it.
 *
 *           So on every installation that already had a toolbox, Start tore the
 *           stack down and then died with `ssh-keygen: command not found`, exit
 *           127 — and it repeated on every attempt. It is the 2026-09-07 defect
 *           one step later: that fix made a *fresh* toolbox correct, and A8-19
 *           runs against whatever image the host's tag points at, so on the
 *           machine it was written on — where the image had just been rebuilt —
 *           it could not see an old one.
 * Given:    `debian:bookworm-slim`, which is the toolbox's own base and carries
 *           neither `git` nor OpenSSH, with this checkout's `config/` mounted
 *           read-only and `.env.example` as the project `.env`. And the same
 *           image with `git` and `openssh-client` installed, as the counterpart.
 *           A declaration is passed in
 *           (`git@github.com:nocodenation/agent-skills.git|read|protected`) so
 *           the pre-flight has work to do beyond the tool check.
 * When:     `git.sh --check-declaration` runs in each, and — to show what the
 *           refusal prevents — the git step itself runs in the first.
 * Then:     The pre-flight refuses with exit 1 naming all four tools, the git
 *           step is what would have died with 127, and the image that has the
 *           tools still passes.
 * Covers:   A8-24, A8-25, A8-26, FR11, U1
 * Unhappy:  A8-24 is the refusal and A8-25 is the measurement of what it
 *           prevents. A8-26 is the counterpart — an installation with the tools
 *           must still start, and a check that refused everything would stop
 *           every stack on the fleet.
 */
import { test, expect, describe, beforeAll } from 'bun:test';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const BASE = 'debian:bookworm-slim';
const DECL = 'git@github.com:nocodenation/agent-skills.git|read|protected';

function inImage(script: string, extra: string[] = []) {
  return sh([
    'docker', 'run', '--rm',
    '-v', `${join(repoRoot, 'config')}:/probe/config:ro`,
    '-v', `${join(repoRoot, '.env.example')}:/probe/.env:ro`,
    ...extra,
    '--entrypoint', 'bash', BASE, '-c', script
  ]);
}

let bare = '';
let asToolbox = '';
let withTools = '';

beforeAll(() => {
  bare = inImage(`
    cd /probe
    export GIT_REPOSITORIES='${DECL}'
    echo "== preflight =="
    bash config/scripts/start/git.sh /probe --check-declaration 2>&1
    echo "preflightExit=$?"
    echo "== step =="
    bash config/scripts/start/git.sh /probe 2>&1 | tail -2
    echo "stepExit=\${PIPESTATUS[0]}"
  `).output;

  // The same image, but looking like the dashboard's helper: the remedy the
  // operator is given depends on where the check is running, and they cannot be
  // expected to know which it was.
  asToolbox = inImage(`
    mkdir -p /usr/local/bin
    printf '#!/bin/sh\\nexit 0\\n' > /usr/local/bin/toolbox-entry
    chmod +x /usr/local/bin/toolbox-entry
    cd /probe
    export GIT_REPOSITORIES='${DECL}'
    bash config/scripts/start/git.sh /probe --check-declaration 2>&1
    echo "preflightExit=$?"
  `).output;

  withTools = inImage(`
    apt-get update -qq >/dev/null 2>&1
    apt-get install -y -qq git openssh-client >/dev/null 2>&1
    cd /probe
    export GIT_REPOSITORIES='${DECL}'
    bash config/scripts/start/git.sh /probe --check-declaration 2>&1
    echo "preflightExit=$?"
  `).output;
}, 900_000);

const section = (out: string, name: string) => {
  const parts = out.split(/^== (\w+) ==$/m);
  const at = parts.indexOf(name);
  return at === -1 ? '' : parts[at + 1];
};

describe('A8-24 an image without the tools is refused while the stack is still up', () => {
  test('A8-24 the pre-flight exits 1 and names every tool it needs', () => {
    const s = section(bare, 'preflight');
    expect(s).toContain('preflightExit=1');
    for (const tool of ['git', 'ssh', 'ssh-keygen', 'ssh-keyscan']) expect(s).toContain(tool);
    // The sentence that matters most: it says the installation is intact.
    expect(s).toContain('Nothing was stopped.');
  });

  test('A8-24 and it says which remedy applies where it is running', () => {
    // On a host: install the tools. In the dashboard's helper image: remove the
    // image, because the operator cannot install anything into it and has never
    // heard of it.
    expect(section(bare, 'preflight')).toContain('Install git and the OpenSSH client');
    expect(asToolbox).toContain('docker image rm -f liquidupstart/toolbox:latest');
    expect(asToolbox).toContain('preflightExit=1');
  });
});

describe('A8-25 which is what the refusal prevents', () => {
  test('A8-25 the git step itself dies at ssh-keygen with 127', () => {
    // Measured rather than asserted about: this is the failure the operator met,
    // and in the real sequence down.sh has already run by the time it happens.
    const s = section(bare, 'step');
    expect(s).toContain('stepExit=127');
    expect(s).toContain('ssh-keygen');
  });
});

describe('A8-26 while an installation that has the tools still starts', () => {
  test('A8-26 the counterpart: the same image with git and OpenSSH passes', () => {
    // Without this the check could be met by refusing every start on every host.
    expect(withTools).toContain('preflightExit=0');
    expect(withTools).not.toContain('cannot run here');
  });
});
