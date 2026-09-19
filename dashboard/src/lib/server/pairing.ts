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
  isRepair: boolean;
  requestedAt: number | null;
};

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
    return { ok: false, pending: [], message: firstLine(output) || 'The gateway did not answer.' };
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
  return {
    requestId,
    deviceId: typeof r.deviceId === 'string' ? r.deviceId : '',
    clientId: typeof r.clientId === 'string' ? r.clientId : 'unknown client',
    isRepair: r.isRepair === true,
    requestedAt: typeof r.ts === 'number' ? r.ts : null
  };
}

export async function approve(
  requestId: string
): Promise<{ ok: boolean; message: string; status: number }> {
  if (!REQUEST_ID.test(requestId)) {
    return { ok: false, message: 'That is not a pairing request id.', status: 400 };
  }
  const { output, code } = await run(['approve', requestId]);
  if (code === 0) {
    return { ok: true, message: firstLine(output) || `Approved ${requestId}.`, status: 200 };
  }
  // The CLI's own words, not ours. A request id goes stale within seconds
  // because a refused browser mints a new one on every retry, so "no longer
  // pending" is a normal answer and has to arrive as one rather than as silence.
  return {
    ok: false,
    message: firstLine(output) || `The approval failed (exit ${code}).`,
    status: 502
  };
}

function firstLine(s: string): string {
  return s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-1)[0] ?? '';
}
