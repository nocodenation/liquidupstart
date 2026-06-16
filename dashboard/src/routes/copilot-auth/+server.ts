// Interactive GitHub Copilot sign-in for OpenClaw's native github-copilot
// provider (OPENCLAW_ENABLE_COPILOT=1) — the web equivalent of running
//   openclaw models auth login-github-copilot
// inside the gateway. That command needs an interactive TTY, so we exec it with
// `-t` (allocates a PTY) even though this server has no terminal. It prints a
// github.com/login/device URL + device code, then polls and completes on its own
// once the user authorizes in the browser — no code is pasted back (unlike the
// Claude flow). The login is stored in agent "main"'s auth profile store under
// volumes/_openclaw, so it persists and the gateway picks it up with no restart.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { json } from '@sveltejs/kit';
import { parseEnvValues } from '$lib/env-file';
import { appId } from '$lib/server/project';

const ENV_DIR = process.env.ENV_DIR ?? resolve(process.cwd(), '..');
const LOGIN_TIMEOUT_MS = 15 * 60_000; // GitHub device codes expire in 15 minutes
const PROBE_TIMEOUT_MS = 30_000;

const gatewayName = () => `openclaw-gateway-${appId()}`;

let child: ReturnType<typeof spawn> | null = null;

// The login renders a TUI (boxes, colours, spinner). Strip terminal control
// sequences so the streamed text is readable and the URL/code are parseable.
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

async function gatewayRunning(): Promise<boolean> {
  const { out } = await dockerCapture(
    ['ps', '-q', '--filter', `name=^${gatewayName()}$`, '--filter', 'status=running'],
    PROBE_TIMEOUT_MS
  );
  return out.trim() !== '';
}

// A github-copilot auth profile present for agent "main" means we're signed in.
async function copilotAuthed(): Promise<boolean> {
  const { out } = await dockerCapture(
    ['exec', gatewayName(), 'openclaw', 'models', 'auth', 'list'],
    PROBE_TIMEOUT_MS
  );
  return /github-copilot/i.test(out);
}

// Probe whether a Copilot sign-in is needed: the provider is enabled, no headless
// token is set, OpenClaw is set up (openclaw.json rendered), the gateway is up,
// and no github-copilot profile exists yet.
export async function GET() {
  const envFile = join(ENV_DIR, '.env');
  if (!existsSync(envFile)) return json({ needed: false });
  const env = parseEnvValues(readFileSync(envFile, 'utf8'));
  if (env.get('OPENCLAW_ENABLE_COPILOT')?.value !== '1') return json({ needed: false });
  if (env.get('COPILOT_GITHUB_TOKEN')?.value) return json({ needed: false });
  if (!existsSync(join(ENV_DIR, 'volumes', '_openclaw', 'openclaw.json'))) {
    return json({ needed: false });
  }
  if (!(await gatewayRunning())) return json({ needed: false });
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
  if (!(await gatewayRunning())) {
    return new Response('OpenClaw gateway is not running — start the stack first.', { status: 409 });
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
        ['exec', '-t', gatewayName(), 'openclaw', 'models', 'auth', 'login-github-copilot', '--yes'],
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
        if (code === 0) {
          write('\n[auth succeeded]\n');
          finish();
          return;
        }
        // A non-zero/killed exit may still have stored a valid profile — trust
        // the auth list as the source of truth, like the Claude flow does.
        write((await copilotAuthed()) ? '\n[auth succeeded]\n' : `\n[auth failed with exit code ${code}]\n`);
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
