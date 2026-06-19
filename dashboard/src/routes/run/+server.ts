// Runs the project's build/start/down scripts, streaming combined output as a
// plain-text response the page renders live. Scripts run inside the "toolbox"
// helper container (bash + docker CLI) spawned as a sibling against the host
// engine, like the Windows .bat wrappers. Requires mounting the docker socket
// and the project at its real host path (ENV_DIR) so bind mounts that
// compose.yml and the scripts create resolve identically on the engine side.

import { appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { appId } from '$lib/server/project';

const ENV_DIR = process.env.ENV_DIR ?? resolve(process.cwd(), '..');
const RESULT_FILE = join(ENV_DIR, '.install-result');
// Host-side socket path, for the toolbox container's own docker access.
const HOST_DOCKER_SOCK = process.env.HOST_DOCKER_SOCK ?? '/var/run/docker.sock';
const TOOLBOX = 'liquidupstart/toolbox:latest';

const TASKS: Record<string, string> = {
  build: './scripts/linux/build.sh',
  start: './scripts/linux/start.sh',
  down: './scripts/linux/down.sh',
  // Stop the stack, then rebuild every image — picks up a pulled update.
  rebuild: './scripts/linux/rebuild.sh'
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
  // executes commands on the host, so only accept calls from the installer page.
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
          // Prefer buildx (legacy builder is deprecated). `--load` puts the
          // result in the local image store so the `image inspect` probe finds
          // it next run. Fall back to the classic builder without buildx.
          const hasBuildx = (await run(['buildx', 'version'], () => {}, track)) === 0;
          const buildArgs = hasBuildx
            ? ['buildx', 'build', '--load', '-t', TOOLBOX, '-f', 'config/win/Dockerfile.toolbox', 'config/win']
            : ['build', '-t', TOOLBOX, '-f', 'config/win/Dockerfile.toolbox', 'config/win'];
          const b = await run(buildArgs, write, track);
          if (b !== 0) {
            write(`\n[toolbox build failed with exit code ${b}]\n`);
            return;
          }
          write('\n');
        }

        // Clear any lingering container from a cancelled run first so its name
        // can never block the next task.
        const containerName = `aiw-toolbox-${task}-${appId()}`;
        await run(['rm', '-f', containerName], () => {});

        write(`Running ${script} ...\n\n`);
        const code = await run(
          [
            'run',
            '--rm',
            '--name',
            containerName,
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
      // Tab closed mid-run: stop streaming. Killing the docker CLI does not
      // stop a container already running the script.
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
