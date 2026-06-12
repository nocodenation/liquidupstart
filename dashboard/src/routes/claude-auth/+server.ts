// Interactive Claude Code sign-in for the OpenClaw claude-cli backend — the
// web equivalent of start.sh's login_with_masked_paste:
//
//   POST {action:'start'} — spawns `openclaw-claude auth login --claudeai` in
//     a throwaway container (same invocation as config/scripts/start/
//     openclaw.sh's claude_cli helper) with the credential volume mounted,
//     and streams its output. claude prints the sign-in URL and then waits
//     on stdin for the authorization code — no TTY needed.
//   POST {action:'code', code} — writes the pasted code to that stdin.
//
// Login persists in volumes/_openclaw-claude; the gateway picks it up on the
// next claude invocation, so nothing needs restarting.

import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { json } from '@sveltejs/kit';
import { parseEnvValues } from '$lib/env-file';

const ENV_DIR = process.env.ENV_DIR ?? resolve(process.cwd(), '..');
const CLAUDE_DIR = join(ENV_DIR, 'volumes', '_openclaw-claude');
const OPENCLAW_IMAGE = process.env.OPENCLAW_IMAGE ?? 'all-in-wonder/openclaw:latest';
const LOGIN_TIMEOUT_MS = 15 * 60_000;
const PROBE_TIMEOUT_MS = 30_000;

let child: ReturnType<typeof spawn> | null = null;

function claudeArgs(interactive: boolean, ...args: string[]): string[] {
  return [
    'run',
    '--rm',
    ...(interactive ? ['-i'] : []),
    '--user',
    '0:0',
    '-e',
    'HOME=/home/node',
    '-v',
    `${CLAUDE_DIR}:/home/node/.claude`,
    '--entrypoint',
    '/usr/local/bin/openclaw-claude',
    OPENCLAW_IMAGE,
    ...args
  ];
}

// Same as openclaw.sh: pre-create the credential dir so the engine doesn't
// create the bind-mount source root-owned under rootless docker.
function ensureClaudeDir() {
  try {
    mkdirSync(CLAUDE_DIR, { recursive: true });
    chmodSync(CLAUDE_DIR, 0o777);
  } catch {
    // best effort; the docker run will surface a real problem
  }
}

function dockerExitCode(args: string[], timeoutMs: number): Promise<number> {
  return new Promise((res) => {
    const c = spawn('docker', args, { cwd: ENV_DIR, stdio: 'ignore' });
    const t = setTimeout(() => c.kill(), timeoutMs);
    c.on('error', () => {
      clearTimeout(t);
      res(1);
    });
    c.on('close', (code) => {
      clearTimeout(t);
      res(code ?? 1);
    });
  });
}

// Probe whether a Claude sign-in is needed — the same checks start.sh runs
// before deciding to prompt: claude-cli backend on, no long-lived token, and
// `auth status` failing. Gated on OpenClaw actually being set up: the image
// built AND openclaw.json rendered (start.sh's openclaw.sh does that), so the
// sign-in is only offered once claude-cli is properly configured — not ahead
// of a pending Build/Start. During a first Start the panel appears via the
// page's mid-stream ACTION REQUIRED detection instead.
export async function GET() {
  const envFile = join(ENV_DIR, '.env');
  if (!existsSync(envFile)) return json({ needed: false });
  const env = parseEnvValues(readFileSync(envFile, 'utf8'));
  if (env.get('OPENCLAW_ENABLE_CLAUDE_CLI')?.value !== '1') return json({ needed: false });
  if (env.get('CLAUDE_CODE_OAUTH_TOKEN')?.value) return json({ needed: false });
  if (!existsSync(join(ENV_DIR, 'volumes', '_openclaw', 'openclaw.json'))) {
    return json({ needed: false });
  }
  if ((await dockerExitCode(['image', 'inspect', OPENCLAW_IMAGE], PROBE_TIMEOUT_MS)) !== 0) {
    return json({ needed: false });
  }
  ensureClaudeDir();
  const status = await dockerExitCode(claudeArgs(false, 'auth', 'status'), PROBE_TIMEOUT_MS);
  return json({ needed: status !== 0 });
}

export async function POST({ request }) {
  const origin = request.headers.get('origin');
  if (process.env.ORIGIN && origin !== process.env.ORIGIN) {
    return new Response('Forbidden', { status: 403 });
  }

  const body = await request.json();

  if (body.action === 'code') {
    if (!child || !child.stdin?.writable) {
      return new Response('No sign-in in progress', { status: 409 });
    }
    child.stdin.write(String(body.code ?? '').trim() + '\n');
    return new Response(null, { status: 204 });
  }

  if (body.action !== 'start') return new Response('Unknown action', { status: 400 });
  if (child) return new Response('A sign-in is already in progress', { status: 409 });

  ensureClaudeDir();

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

      const c = spawn('docker', claudeArgs(true, 'auth', 'login', '--claudeai'), { cwd: ENV_DIR });
      child = c;
      const timeout = setTimeout(() => c.kill(), LOGIN_TIMEOUT_MS);

      c.stdout.on('data', (d) => write(d.toString()));
      c.stderr.on('data', (d) => write(d.toString()));
      c.on('error', (err) => write(`\n${err.message}\n`));
      c.on('close', (code) => {
        clearTimeout(timeout);
        child = null;
        if (code === 0) {
          write('\n[auth succeeded]\n');
          finish();
          return;
        }
        // Mirror start.sh: a non-zero login exit may still have stored valid
        // credentials — trust `auth status` as the source of truth.
        const probe = spawn('docker', claudeArgs(false, 'auth', 'status'), { cwd: ENV_DIR });
        probe.on('close', (s) => {
          write(s === 0 ? '\n[auth succeeded]\n' : `\n[auth failed with exit code ${code}]\n`);
          finish();
        });
        probe.on('error', () => {
          write(`\n[auth failed with exit code ${code}]\n`);
          finish();
        });
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
