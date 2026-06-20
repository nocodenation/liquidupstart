import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { json } from '@sveltejs/kit';
import { parseEnvValues } from '$lib/env-file';
import { appId } from '$lib/server/project';

const ENV_DIR = process.env.ENV_DIR ?? resolve(process.cwd(), '..');
const OPENCLAW_IMAGE = process.env.OPENCLAW_IMAGE ?? `liquidupstart/openclaw:${appId()}`;
const STATE_DIR = join(ENV_DIR, 'volumes', '_openclaw');
const SECRETS_DIR = join(ENV_DIR, 'volumes', '_openclaw-auth-profile-secrets');
const PLUGINS_DIR = join(ENV_DIR, 'config', 'openclaw', 'plugins');
const LOGIN_TIMEOUT_MS = 15 * 60_000;
const PROBE_TIMEOUT_MS = 60_000;
const LOGIN_CONTAINER = `openclaw-codex-login-${appId()}`;

let child: ReturnType<typeof spawn> | null = null;

function openclawArgs(...args: string[]): string[] {
  return [
    'run',
    '--rm',
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

const sh = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

function loginPtyCommand(): string {
  const args = [
    'run',
    '--rm',
    '--name',
    LOGIN_CONTAINER,
    '-i',
    '-t',
    '-p',
    '127.0.0.1:1455:1456',
    '--user',
    '0:0',
    '--entrypoint',
    'sh',
    '-e',
    'HOME=/home/node',
    '-e',
    'COLUMNS=1000',
    '-e',
    'OPENCLAW_HOME=/home/node',
    '-e',
    'OPENCLAW_OAUTH_CALLBACK_HOST=127.0.0.1',
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
    '-c',
    'socat TCP-LISTEN:1456,fork,reuseaddr TCP:127.0.0.1:1455 & exec openclaw models auth login --provider openai'
  ];
  return ['docker', ...args].map(sh).join(' ');
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

function removeLoginContainer(): Promise<{ code: number; out: string }> {
  return dockerCapture(['rm', '-f', LOGIN_CONTAINER], PROBE_TIMEOUT_MS);
}

async function codexAuthed(): Promise<boolean> {
  const { out } = await dockerCapture(
    openclawArgs('models', 'auth', 'list', '--provider', 'openai'),
    PROBE_TIMEOUT_MS
  );
  return /oauth/i.test(out);
}

export async function GET() {
  const envFile = join(ENV_DIR, '.env');
  if (!existsSync(envFile)) return json({ needed: false });
  const env = parseEnvValues(readFileSync(envFile, 'utf8'));
  if (env.get('OPENCLAW_ENABLE_CODEX')?.value !== '1') return json({ needed: false });
  if (!existsSync(join(STATE_DIR, 'openclaw.json'))) return json({ needed: false });
  return json({ needed: !(await codexAuthed()) });
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
  if (!existsSync(join(STATE_DIR, 'openclaw.json'))) {
    return new Response('OpenClaw is not set up yet — start it once first.', { status: 409 });
  }

  await removeLoginContainer();

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

      const c = spawn('script', ['-q', '-e', '-c', loginPtyCommand(), '/dev/null'], {
        cwd: ENV_DIR
      });
      child = c;

      let settled = false;
      let raw = '';
      let urlSent = false;
      let checking = false;

      const settle = (ok: boolean, code?: number) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearInterval(poll);
        write(ok ? '\n[auth succeeded]\n' : `\n[auth failed with exit code ${code}]\n`);
        finish();
        try {
          c.kill('SIGTERM');
        } catch {
          // already gone
        }
        removeLoginContainer();
        child = null;
      };

      const timeout = setTimeout(() => settle(false, -1), LOGIN_TIMEOUT_MS);

      const poll = setInterval(async () => {
        if (settled || checking) return;
        checking = true;
        try {
          if (await codexAuthed()) settle(true);
        } finally {
          checking = false;
        }
      }, 3000);

      const onData = (d: Buffer) => {
        raw += d.toString();
        if (!urlSent) {
          const m = stripAnsi(raw).match(/https:\/\/auth\.openai\.com\/\S+/);
          if (m) {
            urlSent = true;
            write(`::codex-url::${m[0]}\n`);
          }
        }
      };

      c.stdout.on('data', onData);
      c.stderr.on('data', onData);
      c.on('error', (err) => write(`\n${err.message}\n`));
      c.on('close', async (code) => {
        if (settled) return;
        settle(code === 0 || (await codexAuthed()), code ?? 1);
      });
    },
    cancel() {
      child?.kill();
      child = null;
      removeLoginContainer();
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
