// Runs the project's build/start/down scripts (scripts/linux/) on the user's
// system, streaming the combined output as a plain-text response the page
// renders live.
//
// The scripts are executed inside the project's "toolbox" helper container
// (config/win/Dockerfile.toolbox — bash + GNU userland + docker CLI), spawned
// as a sibling container against the host engine, exactly like the Windows
// .bat wrappers do. That requires run.sh to mount the docker socket and
// to mount the project at its real host path (ENV_DIR), so bind mounts that
// compose.yml and the scripts create resolve identically on the engine side.

import { appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const ENV_DIR = process.env.ENV_DIR ?? resolve(process.cwd(), '..');
const RESULT_FILE = join(ENV_DIR, '.install-result');
// Host-side socket path, for the toolbox container's own docker access.
const HOST_DOCKER_SOCK = process.env.HOST_DOCKER_SOCK ?? '/var/run/docker.sock';
const TOOLBOX = 'all-in-wonder/toolbox:latest';

const TASKS: Record<string, string> = {
  build: './scripts/linux/build.sh',
  start: './scripts/linux/start.sh',
  down: './scripts/linux/down.sh'
};

let running = false;

function run(
  args: string[],
  onOutput: (chunk: string) => void,
  onSpawn?: (child: ReturnType<typeof spawn>) => void
): Promise<number> {
  return new Promise((res) => {
    const child = spawn('docker', args, { cwd: ENV_DIR });
    onSpawn?.(child);
    child.stdout.on('data', (d) => onOutput(d.toString()));
    child.stderr.on('data', (d) => onOutput(d.toString()));
    child.on('error', (err) => {
      onOutput(`\n${err.message}\n`);
      res(1);
    });
    child.on('close', (code) => res(code ?? 1));
  });
}

export async function POST({ request }) {
  // Defense in depth on top of SvelteKit's CSRF protection: this endpoint
  // effectively executes commands on the host, so only accept calls from the
  // installer's own page.
  const origin = request.headers.get('origin');
  if (process.env.ORIGIN && origin !== process.env.ORIGIN) {
    return new Response('Forbidden', { status: 403 });
  }

  const { task } = await request.json();
  const script = TASKS[task];
  if (!script) return new Response('Unknown task', { status: 400 });
  if (running) return new Response('A task is already running', { status: 409 });
  running = true;

  let activeChild: ReturnType<typeof spawn> | null = null;
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const write = (s: string) => {
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          // client went away; keep draining the child quietly
        }
      };
      const track = (c: ReturnType<typeof spawn>) => (activeChild = c);
      try {
        const probe = await run(['image', 'inspect', TOOLBOX], () => {}, track);
        if (probe !== 0) {
          write('Helper toolbox image not found - building it (one time only)...\n\n');
          const b = await run(
            ['build', '-t', TOOLBOX, '-f', 'config/win/Dockerfile.toolbox', 'config/win'],
            write,
            track
          );
          if (b !== 0) {
            write(`\n[toolbox build failed with exit code ${b}]\n`);
            return;
          }
          write('\n');
        }

        write(`Running ${script} ...\n\n`);
        const code = await run(
          [
            'run',
            '--rm',
            '-v',
            `${HOST_DOCKER_SOCK}:/var/run/docker.sock`,
            '-v',
            `${ENV_DIR}:${ENV_DIR}`,
            '-w',
            ENV_DIR,
            TOOLBOX,
            'bash',
            script
          ],
          write,
          track
        );
        write(`\n[${task} ${code === 0 ? 'succeeded' : `failed with exit code ${code}`}]\n`);
        if (code === 0) {
          try {
            appendFileSync(RESULT_FILE, `${task}_ok=1\n`);
          } catch {
            // result file is best-effort terminal messaging only
          }
        }
      } finally {
        running = false;
        activeChild = null;
        try {
          controller.close();
        } catch {
          // already closed/cancelled
        }
      }
    },
    cancel() {
      // Tab closed mid-run: stop streaming. Note the docker CLI being killed
      // does not stop a container already running the script.
      activeChild?.kill();
      running = false;
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
