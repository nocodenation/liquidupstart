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
import { componentsAt, envDir } from './project';
import { OPENCLAW_OFF_REFUSAL } from '../component-switches';

// Here rather than imported by the route, which reaches this module alone: OC-72 maps only
// `$lib/server/pairing`. With OpenClaw switched off there is no image to run the script in.
export function openclawOn(): boolean {
  return componentsAt(envDir()).openclaw;
}
export { OPENCLAW_OFF_REFUSAL };

// The script's answer when the OpenClaw image is not built: exit 3 and this line, having run
// nothing. Both are asked for, so an exit 3 of the CLI's own still reaches the card as an error.
const NOT_BUILT = 3;
const NOT_BUILT_LINE = 'is not built here.';
export const OPENCLAW_NOT_BUILT = 'OpenClaw is switched on, but its image is not built yet — run Build first.';

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

const SCRIPT = () => join(envDir(), 'config', 'scripts', 'openclaw-pairing.sh');

// Long enough for a container start plus the CLI's own 20s timeout, short enough
// that a wedged docker does not hold a request open for ever.
//
// Overridable so the timeout path can be driven by a case in seconds rather than
// in minutes.
//
// **Deliberately not in `.env.example`, and that is the opposite of M3 on #10.**
// There, `NAR_BUILDER_TEST_HOOKS` had to be declared because `compose.yml`
// injects it into the builder, so an operator could set it and it would take
// effect. This one cannot: `run.sh:147-149` hands the dashboard container three
// explicit `-e` values and **not** the env file, so a key in the contract would be
// a setting that does nothing. Checked rather than assumed. It is a process-level
// hook for cases that load this module directly, and it is named here instead.
// Read per call, for the same reason `envDir()` is: captured at module load it
// belonged to whichever test file imported this one first, and under
// `tests/run.sh` that is the unit level -- so `OC-66` ran against 60 seconds
// while its own header said 2000ms, and waited out the full minute to say so.
const budgetMs = () => Number(process.env.OPENCLAW_PAIRING_BUDGET_MS) || 60_000;

/**
 * The script, bounded — and the bound reaches the container, which it did not.
 *
 * **A2 of the 2026-10-01 review, and worse than first reported.**
 * `setTimeout(() => child.kill(), …)` signalled `bash` alone. The `docker run`
 * bash had started was reparented and kept the stdio pipes, and `'close'` waits
 * for the pipes rather than for the child — so the promise resolved only when
 * *docker* finished. Reproduced by the reviewer with a 3-second budget and a stub
 * `docker run … sleep 20`: bash died at 3 s, the container was still running at
 * 5 s, and `run()` resolved at about 22 s. **So the budget did not bound the HTTP
 * request at all**, and a wedged docker held it open indefinitely — the case the
 * budget's own comment says it exists for.
 *
 * Three things together, because any one of them alone leaves it open:
 *
 *   - `detached: true` puts the child in its own process **group**, so one signal
 *     can reach bash *and* what bash started.
 *   - the container is **named** and removed on timeout. Killing the group stops
 *     the local `docker` CLI; it does not stop a container the daemon is already
 *     running, and `--rm` only fires when that CLI exits normally.
 *   - the promise is settled **at the budget**, not on `'close'`. Waiting for the
 *     pipes is what turned a 3-second budget into 22 seconds, and an orphan that
 *     never exits would have held it for ever.
 */
/**
 * **The two streams are kept apart.** C2 of the 2026-10-01 review: both were
 * appended to one string, and that string was handed to `JSON.parse`. One warning
 * on stderr beside valid JSON on stdout and exit 0 therefore answered *"The
 * gateway answered something that is not JSON."* -- with the answer sitting in
 * `stdout` the whole time. The reviewer saw no real trigger in about sixty runs,
 * and that is the measure of the odds, not of the consequence: the card would say
 * the gateway is broken because something wrote a deprecation notice.
 *
 * It is not hypothetical from here on. Captured 2026-10-14 against the running
 * stack, `devices list --json` with a missing grant writes the JSON to **stdout**
 * and five `[openclaw] …` lines to **stderr** in the same call. So the shapes this
 * module reads arrive on different streams by design, and joining them lost the
 * one that parses.
 */
function run(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((done) => {
    // Named so the timeout can reach it. Unique per call, because two polls can
    // overlap -- which A3 is about, and until A3 is built they do.
    const container = `openclaw-pairing-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
    // Once per call, so the timer and the sentence it writes cannot disagree.
    const budget = budgetMs();
    const child = spawn('bash', [SCRIPT(), envDir(), ...args], {
      cwd: envDir(),
      detached: true,
      env: {
        ...process.env,
        LC_ALL: 'C',
        LANG: 'C',
        OPENCLAW_PAIRING_CONTAINER: container
      }
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (r: { stdout: string; stderr: string; code: number | null }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done(r);
    };

    const timer = setTimeout(() => {
      // The group, not the child: `-pid` is the group id, which `detached` made
      // equal to the child's pid. Guarded because the group may already be gone.
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
      // And the container, which no signal here can reach. Detached and
      // unreferenced on purpose: this is cleanup, and the request must not wait
      // for it.
      try {
        const sweep = spawn('docker', ['rm', '-f', container], {
          detached: true,
          stdio: 'ignore'
        });
        sweep.unref();
      } catch {
        /* docker not reachable; nothing more to do here */
      }
      finish({
        stdout,
        stderr:
          `${stderr}\nThe request was given ${Math.round(budget / 1000)} seconds and did not finish. ` +
          `It was stopped and its container removed; nothing was approved.`,
        code: -2
      });
    }, budget);

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    // This project's own words go to stderr, where the CLI's human lines are:
    // stdout is the answer, and nothing but the answer may be parsed as one.
    child.on('error', (err) => finish({ stdout, stderr: `${stderr}${err.message}`, code: -1 }));
    child.on('close', (code) => finish({ stdout, stderr, code }));
  });
}

/**
 * A Control UI browser that was refused and is no longer asking.
 *
 * **A4 of the 2026-10-01 review: the card was gone five minutes after the
 * refusal.** A refused Control UI makes one attempt and stops, and the gateway
 * drops a pending request after five minutes. Measured by the reviewer: token
 * revoked, the tab left open for 450 s and polled every 30 s — after the drop
 * there was no card and no hint, while OpenClaw still showed *"Role upgrade
 * pending"*. An operator who reaches the dashboard later than five minutes saw
 * nothing at all, which is the dead end §9 exists to remove, one step along.
 *
 * The same listing already carries it: `paired[].tokens[].revokedAtMs`. So the
 * card can say *"this browser was refused and is not asking any more"* and name
 * the one thing that brings the request back.
 */
export type RevokedDevice = {
  deviceId: string;
  clientId: string;
  revokedAtMs: number | null;
};

export async function pendingRequests(): Promise<{
  ok: boolean;
  disabled?: true;
  pending: PendingRequest[];
  revoked: RevokedDevice[];
  message: string;
}> {
  const { stdout, stderr, code } = await run(['list']);
  // OpenClaw switched on and saved before a build: nothing to pair against, answered as
  // switched off is, so the card stays silent rather than repeating an error each poll (CS-FR10).
  if (code === NOT_BUILT && stderr.includes(NOT_BUILT_LINE)) {
    return { ok: true, disabled: true, pending: [], revoked: [], message: '' };
  }
  if (code !== 0) {
    // The gateway being down is the ordinary case here, not an exception: this
    // card is read while something is wrong. Say what the CLI said and show no
    // list rather than an empty one, which would read as "nothing pending".
    return {
      ok: false,
      pending: [],
      revoked: [],
      // The answer first, then the human lines: a `--json` failure puts its
      // message in `stdout` (A1) while the `[openclaw] …` prose goes to `stderr`,
      // and either can be the only one there.
      message: cliMessage(stdout) || cliMessage(stderr) || 'The gateway did not answer.'
    };
  }
  let parsed: unknown;
  try {
    // `stdout` alone. C2: with `stderr` joined on, one warning made a valid
    // answer unparseable.
    parsed = JSON.parse(stdout);
  } catch {
    return {
      ok: false,
      pending: [],
      revoked: [],
      message: 'The gateway answered something that is not JSON.'
    };
  }
  const raw = (parsed as { pending?: unknown })?.pending;
  const pending = Array.isArray(raw) ? raw.map(toRequest).filter((r): r is PendingRequest => !!r) : [];
  const pairedRaw = (parsed as { paired?: unknown })?.paired;
  const revoked = Array.isArray(pairedRaw) ? pairedRaw.map(toRevoked).filter((r): r is RevokedDevice => !!r) : [];
  return { ok: true, pending, revoked, message: '' };
}

/**
 * A paired device, if it is a Control UI browser whose token has been revoked.
 *
 * Only the Control UI, because that is the browser §9's way back is about, and
 * only when a token carries `revokedAtMs` — a device with live tokens is working
 * and is not something to draw a card about. The newest revocation wins when a
 * device has several tokens, so the card can say when it happened.
 */
function toRevoked(v: unknown): RevokedDevice | null {
  const d = v as Record<string, unknown>;
  const deviceId = typeof d?.deviceId === 'string' ? d.deviceId : '';
  const clientId = typeof d?.clientId === 'string' ? d.clientId : '';
  if (!deviceId || clientId !== 'openclaw-control-ui') return null;
  const tokens = Array.isArray(d.tokens) ? d.tokens : [];
  const revokedAt = tokens
    .map((t) => (t as Record<string, unknown>)?.revokedAtMs)
    .filter((x): x is number => typeof x === 'number' && x > 0);
  if (!revokedAt.length) return null;
  return { deviceId, clientId, revokedAtMs: Math.max(...revokedAt) };
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
    // **`remoteIp`, which is the field the gateway emits.** This read
    // `remoteAddress` and therefore always produced `''`, so the card said
    // "role operator" with no "· from …" -- and the address is the only thing on
    // that card the requester does not declare about itself (B2). The reviewer
    // checked the pinned 2026.9.1 image: the pending request is built with
    // `remoteIp`, and `remoteAddress` occurs nowhere in the pairing or devices
    // CLI code. B1 of the 2026-10-01 review.
    //
    // Only `remoteIp` is read. Accepting the old name as well would keep a
    // fixture alive that no gateway produces, which is exactly how this hid:
    // `OC-54` passed throughout because its fixture used `remoteAddress`.
    remoteAddress: typeof r.remoteIp === 'string' ? r.remoteIp : '',
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
    // C1 of the 2026-10-01 review. The device asked for is gone, but another
    // browser **is** waiting -- and the operator was told "Nothing is waiting for
    // approval." while the card beside that sentence listed one. It happens on
    // the ordinary path: a refused browser stops asking, the gateway drops its
    // request after about five minutes, and a card left open still carries the
    // button. `others` counts only the requests this cannot approve, so it was 0
    // here and the message fell through to the emptiest one of the three.
    if (eligible.length > 0) {
      return {
        kind: 'refuse',
        status: 409,
        message:
          `That browser is no longer waiting — it stopped asking, and the gateway drops a request it has not heard from. ` +
          `${eligible.length} other request${eligible.length === 1 ? ' is' : 's are'} waiting; the card lists ${eligible.length === 1 ? 'it' : 'them'}, so press the one you mean.`
      };
    }
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
  const { stdout, stderr, code } = await run(['approve', requestId]);
  // The image removed between the listing and the press: the same 409 as for the listing.
  if (code === NOT_BUILT && stderr.includes(NOT_BUILT_LINE)) {
    return { ok: false, message: OPENCLAW_NOT_BUILT, status: 409 };
  }
  if (code === 0) {
    return {
      ok: true,
      message: cliMessage(stdout) || cliMessage(stderr) || `Approved ${requestId}.`,
      status: 200
    };
  }
  // The CLI's own words, not ours. A request id goes stale within seconds
  // because a refused browser mints a new one on every retry, so "no longer
  // pending" is a normal answer and has to arrive as one rather than as silence.
  return {
    ok: false,
    message: cliMessage(stdout) || cliMessage(stderr) || `The approval failed (exit ${code}).`,
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

/**
 * The message out of a JSON answer, or `''` when it is not JSON.
 *
 * Shapes seen from `openclaw devices … --json`, both captured by the reviewer:
 *
 *   { "ok": false, "error": { "type": "gateway_transport_error", "message": "…" } }
 *   { "ok": false, "error": { "type": "forbidden", "message": "…", "reason": "…" } }
 *
 * `reason` is the half that was lost before: *missing scope: operator.pairing* is
 * what tells an operator the grant is absent rather than the gateway being down,
 * and it is the sentence A5 turns into a next step. So it is appended rather than
 * chosen between, the same shape the line logic uses for `Reason:`.
 *
 * Anything that is not an object, or carries no message anywhere, returns `''` so
 * the caller falls through to the text path. A parse failure is not an error here:
 * plain text is a legitimate answer.
 */
function jsonMessage(s: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch {
    return '';
  }
  if (!parsed || typeof parsed !== 'object') return '';
  const o = parsed as Record<string, unknown>;
  const err = (o.error ?? null) as Record<string, unknown> | null;
  const pick = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  const message = pick(err?.message) || pick(o.message);
  const reason = pick(err?.reason) || pick(o.reason);
  if (message && reason && reason !== message) return `${message} — ${reason}`;
  return message || reason;
}

export function cliMessage(s: string): string {
  // **JSON first, because the CLI answers in it.** `devices list --json` and
  // `devices approve --json` report a failure as *pretty-printed* JSON on stdout
  // with a non-zero exit, so the first non-empty line is `{` — and that is what
  // the operator was shown: "OpenClaw could not be asked what is waiting: {",
  // with Approve answering 502 carrying the same character. A1 of the 2026-10-01
  // review, reproduced here against both shapes the reviewer captured.
  //
  // The line logic below is kept rather than replaced: the CLI also answers in
  // plain text (a usage footer, a one-line refusal), and that path is finding 3
  // of the 2026-09-29 review, which this must not undo.
  const fromJson = jsonMessage(s);
  if (fromJson) return fromJson;
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
