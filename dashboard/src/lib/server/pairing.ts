// Pending OpenClaw device pairing requests, and approving one.
//
// The Control UI refuses a browser whose device is not approved and prints three
// commands to fix it. None of them can be run in this stack: `gateway.auth.mode`
// is trusted-proxy, so a CLI reaching the gateway directly sends no identity
// header and is refused. On 2026-09-19 that left the operator with one working
// remedy -- delete the browser's site data -- which no user performs by
// themselves. §9 of docs/FEATURE-openclaw-2026-9-1.md, R2.
//
// The work is done by config/scripts/openclaw-pairing.sh, not here: it is the
// same reuse the git retry makes of git.sh, and for the same reason. The shell
// is where the docker invocation belongs, this is where HTTP belongs.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ENV_DIR } from './project';

// A request id, exactly. This is the only value that reaches a command line, and
// the script checks it a second time because this is not the only caller it
// could ever have.
export const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type PendingRequest = {
  requestId: string;
  deviceId: string;
  clientId: string;
  role: string;
  scopes: string[];
  remoteAddress: string;
  isRepair: boolean;
  requestedAt: number | null;
};

// What this card is for: a browser whose device was withdrawn, asking for the
// Control UI back. Anything else on the stack network can put a request in the
// same queue -- `openclaw node run --host openclaw.localhost` from a container
// leaves a `role: node`, `clientId: node-host` one -- and approving that both
// lets in the wrong thing and leaves the operator locked out, because their own
// request is still pending. Finding 2 of the 2026-09-29 review.
//
// The rule lives here rather than in openclaw-pairing.sh because this is where
// the list is parsed; the script stays a transport with an id guard, and it has
// no jq in any case.
const CONTROL_UI = 'openclaw-control-ui';
const OPERATOR = 'operator';

export function isRecoverable(r: PendingRequest): boolean {
  return r.clientId === CONTROL_UI && r.role === OPERATOR;
}

const SCRIPT = () => join(ENV_DIR, 'config', 'scripts', 'openclaw-pairing.sh');

// Long enough for a container start plus the CLI's own 20s timeout, short enough
// that a wedged docker does not hold a request open for ever.
const BUDGET_MS = 60_000;

function run(args: string[]): Promise<{ output: string; code: number | null }> {
  return new Promise((done) => {
    const child = spawn('bash', [SCRIPT(), ENV_DIR, ...args], {
      cwd: ENV_DIR,
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' }
    });
    let output = '';
    const timer = setTimeout(() => child.kill(), BUDGET_MS);
    child.stdout.on('data', (d) => (output += d.toString()));
    child.stderr.on('data', (d) => (output += d.toString()));
    child.on('error', (err) => {
      clearTimeout(timer);
      done({ output: `${output}${err.message}`, code: -1 });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ output, code });
    });
  });
}

export async function pendingRequests(): Promise<{
  ok: boolean;
  pending: PendingRequest[];
  message: string;
}> {
  const { output, code } = await run(['list']);
  if (code !== 0) {
    // The gateway being down is the ordinary case here, not an exception: this
    // card is read while something is wrong. Say what the CLI said and show no
    // list rather than an empty one, which would read as "nothing pending".
    return { ok: false, pending: [], message: cliMessage(output) || 'The gateway did not answer.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return { ok: false, pending: [], message: 'The gateway answered something that is not JSON.' };
  }
  const raw = (parsed as { pending?: unknown })?.pending;
  const pending = Array.isArray(raw) ? raw.map(toRequest).filter((r): r is PendingRequest => !!r) : [];
  return { ok: true, pending, message: '' };
}

function toRequest(v: unknown): PendingRequest | null {
  const r = v as Record<string, unknown>;
  const requestId = typeof r?.requestId === 'string' ? r.requestId : '';
  if (!REQUEST_ID.test(requestId)) return null;
  // role, scopes and remoteAddress were dropped here, so neither the rule below
  // nor the operator could tell one request from another.
  return {
    requestId,
    deviceId: typeof r.deviceId === 'string' ? r.deviceId : '',
    clientId: typeof r.clientId === 'string' ? r.clientId : 'unknown client',
    role: typeof r.role === 'string' ? r.role : '',
    scopes: Array.isArray(r.scopes) ? r.scopes.filter((x): x is string => typeof x === 'string') : [],
    remoteAddress: typeof r.remoteAddress === 'string' ? r.remoteAddress : '',
    isRepair: r.isRepair === true,
    requestedAt: typeof r.ts === 'number' ? r.ts : null
  };
}

// Which request a press of Approve means. `latest` was pending[0] -- the newest
// request of any device -- so a request that arrived 55ms after the operator
// opened the card took their click.
export type Choice =
  | { kind: 'request'; requestId: string }
  | { kind: 'refuse'; message: string; status: number };

export function chooseRequest(
  pending: PendingRequest[],
  asked: { requestId?: string; deviceId?: string }
): Choice {
  const eligible = pending.filter(isRecoverable);
  const newestFirst = [...eligible].sort((a, b) => (b.requestedAt ?? 0) - (a.requestedAt ?? 0));

  if (asked.requestId && asked.requestId !== 'latest') {
    // An explicit id still has to be one of these, or the card would be a way
    // to approve the node host by pasting its id.
    const found = eligible.find((r) => r.requestId === asked.requestId);
    if (!found) {
      return {
        kind: 'refuse',
        status: 409,
        message:
          'That request is not a Control UI browser waiting for operator access, or it is no longer pending.'
      };
    }
    return { kind: 'request', requestId: found.requestId };
  }

  const forDevice = asked.deviceId
    ? newestFirst.filter((r) => r.deviceId === asked.deviceId)
    : newestFirst;

  if (forDevice.length === 0) {
    const others = pending.length - eligible.length;
    return {
      kind: 'refuse',
      status: 409,
      message: others > 0
        ? `Nothing is waiting that this can approve. ${others} other request${others === 1 ? ' is' : 's are'} pending, from something that is not a Control UI browser; approve those with the OpenClaw CLI if you meant to.`
        : 'Nothing is waiting for approval.'
    };
  }

  // Several *devices*, not several requests: one browser mints a new id on every
  // retry, and approving its newest is exactly right. Two browsers is a question
  // only the operator can answer.
  const devices = new Set(forDevice.map((r) => r.deviceId));
  if (!asked.deviceId && devices.size > 1) {
    return {
      kind: 'refuse',
      status: 409,
      message: `${devices.size} different browsers are waiting. Choose the one you mean.`
    };
  }
  return { kind: 'request', requestId: forDevice[0].requestId };
}

export async function approve(
  requestId: string
): Promise<{ ok: boolean; message: string; status: number }> {
  if (!REQUEST_ID.test(requestId)) {
    return { ok: false, message: 'That is not a pairing request id.', status: 400 };
  }
  const { output, code } = await run(['approve', requestId]);
  if (code === 0) {
    return { ok: true, message: cliMessage(output) || `Approved ${requestId}.`, status: 200 };
  }
  // The CLI's own words, not ours. A request id goes stale within seconds
  // because a refused browser mints a new one on every retry, so "no longer
  // pending" is a normal answer and has to arrive as one rather than as silence.
  return {
    ok: false,
    message: cliMessage(output) || `The approval failed (exit ${code}).`,
    status: 502
  };
}

// The line that says why, not the line that happens to be last.
//
// It was `.slice(-1)`, and the CLI ends a refusal with its own usage footer:
// five lines of which the last is `[openclaw] Help: openclaw --help`, so
// `Reason: missing scope: operator.pairing` never reached the operator. Finding
// 3 of the 2026-09-29 review. A one-line answer -- a stale request id, which is
// the ordinary case here -- is the first line and the last, so it still passes
// through.
export function cliMessage(s: string): string {
  const lines = s
    .split('\n')
    .map((l) => l.trim().replace(/^\[openclaw\]\s*/, ''))
    .filter(Boolean)
    .filter((l) => !/^(Usage|Help):/.test(l));
  const reason = lines.find((l) => /^Reason:/.test(l));
  const first = lines[0] ?? '';
  if (reason && reason !== first) return `${first} — ${reason}`;
  return reason ?? first;
}
