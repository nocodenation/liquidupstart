// Checks whether a host port is free and, if not, finds the next free one.
// The dashboard runs in a container and can't bind host ports directly, so it
// asks the Docker engine to publish them (like run.sh does for its own port).
// The bind happens on the real host, so a "port already allocated" error means
// the port is taken by anything on the host, not just our stack.

import { json } from '@sveltejs/kit';
import { spawn } from 'node:child_process';
import { appId } from '$lib/server/project';

// Throwaway probe container: the dashboard image is always present and has
// `true`, which exits at once so the published port is released immediately.
const PROBE_IMAGE = 'all-in-wonder/dashboard:latest';
// How far above the requested port to look before giving up.
const SEARCH_SPAN = 200;

function docker(args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((res) => {
    const child = spawn('docker', args);
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (out += d.toString()));
    child.on('error', (e) => res({ code: 1, out: e.message }));
    child.on('close', (code) => res({ code: code ?? 1, out }));
  });
}

// true = free, false = taken; throws if the probe itself fails (e.g. no engine)
// so the caller reports "couldn't check" rather than mislabel the port.
async function isFree(port: number): Promise<boolean> {
  const { code, out } = await docker([
    'run',
    '--rm',
    '-p',
    `127.0.0.1:${port}:1`,
    PROBE_IMAGE,
    'true'
  ]);
  if (code === 0) return true;
  if (/already allocated|address already in use|bind for|failed to bind/i.test(out)) return false;
  throw new Error(out.trim() || `port probe failed (exit ${code})`);
}

// Host ports published by THIS project's own containers (named
// `<service>-<APP_ID>`). A port held only by our own stack isn't a real
// conflict (e.g. checking 8888 while the proxy is up), so treat it as available
// rather than switching away from it.
async function ourPublishedPorts(): Promise<Set<number>> {
  const ports = new Set<number>();
  const { code, out } = await docker(['ps', '--filter', `name=-${appId()}`, '--format', '{{.Ports}}']);
  if (code !== 0) return ports;
  for (const m of out.matchAll(/:(\d+)->/g)) ports.add(Number(m[1]));
  return ports;
}

export async function GET({ url }) {
  const requested = Number(url.searchParams.get('port'));
  // Ports to treat as taken regardless of probe (e.g. the other port field's
  // value, so HTTP and HTTPS never collide).
  const exclude = new Set(
    (url.searchParams.get('exclude') ?? '')
      .split(',')
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)
  );

  if (!Number.isInteger(requested) || requested < 1 || requested > 65535) {
    return json({ error: 'invalid port' }, { status: 400 });
  }

  try {
    const ours = await ourPublishedPorts();
    const limit = Math.min(65535, requested + SEARCH_SPAN);
    let suggestion: number | null = null;
    for (let p = requested; p <= limit; p++) {
      if (exclude.has(p)) continue;
      if (ours.has(p) || (await isFree(p))) {
        suggestion = p;
        break;
      }
    }
    // free = the requested port is itself usable; otherwise suggestion is the
    // next usable port, or null if none.
    return json({ requested, suggestion, free: suggestion === requested });
  } catch (e) {
    return json({ requested, error: e instanceof Error ? e.message : String(e) });
  }
}
