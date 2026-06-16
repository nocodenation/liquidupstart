// Interactive GitHub Copilot sign-in for OpenClaw's native github-copilot
// provider (OPENCLAW_ENABLE_COPILOT=1).
//
// The login runs in a THROWAWAY openclaw container (not the gateway): during a
// start, config/scripts/start/openclaw.sh blocks BEFORE `docker compose up`
// waiting for this sign-in, so the gateway isn't running yet — and it must boot
// already-authenticated so it discovers the Copilot catalog (no restart). The
// throwaway mounts the same state/secrets/plugins the gateway uses, so it
// reads/writes the same per-agent auth store. `openclaw models auth
// login-github-copilot` needs a TTY, so we allocate one with `-t`; it prints a
// github.com/login/device URL + code, then polls and exits 0 once the user
// authorizes — no code is pasted back.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { json } from '@sveltejs/kit';
import { parseEnvValues } from '$lib/env-file';

const ENV_DIR = process.env.ENV_DIR ?? resolve(process.cwd(), '..');
const OPENCLAW_IMAGE = process.env.OPENCLAW_IMAGE ?? 'all-in-wonder/openclaw:latest';
const STATE_DIR = join(ENV_DIR, 'volumes', '_openclaw');
const SECRETS_DIR = join(ENV_DIR, 'volumes', '_openclaw-auth-profile-secrets');
const PLUGINS_DIR = join(ENV_DIR, 'config', 'openclaw', 'plugins');
const LOGIN_TIMEOUT_MS = 15 * 60_000; // GitHub device codes expire in 15 minutes
const PROBE_TIMEOUT_MS = 60_000;

let child: ReturnType<typeof spawn> | null = null;

// Throwaway openclaw invocation that targets the same auth store as the gateway.
// Mounts mirror the gateway (state, auth-profile secrets) plus the plugins dir
// the gateway copies in at boot — openclaw validates the full config (incl.
// plugins.load.paths) before running ANY subcommand, so that mount is required.
function openclawArgs(tty: boolean, ...args: string[]): string[] {
  return [
    'run',
    '--rm',
    ...(tty ? ['-t'] : []),
    '--user',
    '0:0',
    '--entrypoint',
    'openclaw',
    '-e',
    'HOME=/home/node',
    '-e',
    'OPENCLAW_HOME=/home/node',
    '-e',
    'OPENCLAW_STATE_DIR=/home/node/.openclaw',
    '-e',
    'OPENCLAW_CONFIG_DIR=/home/node/.openclaw',
    '-e',
    'OPENCLAW_CONFIG_PATH=/home/node/.openclaw/openclaw.json',
    '-v',
    `${STATE_DIR}:/home/node/.openclaw`,
    '-v',
    `${SECRETS_DIR}:/home/node/.config/openclaw`,
    '-v',
    `${PLUGINS_DIR}:/home/node/openclaw-plugins:ro`,
    OPENCLAW_IMAGE,
    ...args
  ];
}

const stripAnsi = (s: string) =>
  s
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/\x1b[=>]/g, '')
    .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '')
    .replace(/\r/g, '');

function dockerCapture(args: string[], timeoutMs: number): Promise<{ code: number; out: string }> {
  return new Promise((res) => {
    const c = spawn('docker', args, { cwd: ENV_DIR });
    let out = '';
    const t = setTimeout(() => c.kill(), timeoutMs);
    c.stdout.on('data', (d) => (out += d.toString()));
    c.stderr.on('data', (d) => (out += d.toString()));
    c.on('error', () => {
      clearTimeout(t);
      res({ code: 1, out });
    });
    c.on('close', (code) => {
      clearTimeout(t);
      res({ code: code ?? 1, out });
    });
  });
}

// A github-copilot auth profile present for agent "main" means we're signed in.
async function copilotAuthed(): Promise<boolean> {
  const { out } = await dockerCapture(openclawArgs(false, 'models', 'auth', 'list'), PROBE_TIMEOUT_MS);
  return /github-copilot/i.test(out);
}

// Probe whether a Copilot sign-in is needed: the provider is enabled, no headless
// token is set, OpenClaw is set up (openclaw.json rendered by openclaw.sh), and
// no github-copilot profile exists yet. No gateway-running check — the sign-in
// runs while the stack is still starting (gateway down).
export async function GET() {
  const envFile = join(ENV_DIR, '.env');
  if (!existsSync(envFile)) return json({ needed: false });
  const env = parseEnvValues(readFileSync(envFile, 'utf8'));
  if (env.get('OPENCLAW_ENABLE_COPILOT')?.value !== '1') return json({ needed: false });
  if (env.get('COPILOT_GITHUB_TOKEN')?.value) return json({ needed: false });
  if (!existsSync(join(STATE_DIR, 'openclaw.json'))) return json({ needed: false });
  return json({ needed: !(await copilotAuthed()) });
}

export async function POST({ request }) {
  const origin = request.headers.get('origin');
  if (process.env.ORIGIN && origin !== process.env.ORIGIN) {
    return new Response('Forbidden', { status: 403 });
  }

  const body = await request.json();
  if (body.action !== 'start') return new Response('Unknown action', { status: 400 });
  if (child) return new Response('A sign-in is already in progress', { status: 409 });
  if (!existsSync(join(STATE_DIR, 'openclaw.json'))) {
    return new Response('OpenClaw is not set up yet — start it once first.', { status: 409 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const write = (s: string) => {
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          // client went away
        }
      };
      const finish = () => {
        try {
          controller.close();
        } catch {
          // already closed/cancelled
        }
      };

      const c = spawn(
        'docker',
        openclawArgs(true, 'models', 'auth', 'login-github-copilot', '--yes'),
        { cwd: ENV_DIR }
      );
      child = c;
      const timeout = setTimeout(() => c.kill(), LOGIN_TIMEOUT_MS);

      c.stdout.on('data', (d) => write(stripAnsi(d.toString())));
      c.stderr.on('data', (d) => write(stripAnsi(d.toString())));
      c.on('error', (err) => write(`\n${err.message}\n`));
      c.on('close', async (code) => {
        clearTimeout(timeout);
        child = null;
        // A non-zero/killed exit may still have stored a valid profile — trust
        // the auth list as the source of truth, like the Claude flow does. No
        // restart needed: openclaw.sh waits for this before booting the gateway.
        const ok = code === 0 || (await copilotAuthed());
        write(ok ? '\n[auth succeeded]\n' : `\n[auth failed with exit code ${code}]\n`);
        finish();
      });
    },
    cancel() {
      child?.kill();
      child = null;
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
