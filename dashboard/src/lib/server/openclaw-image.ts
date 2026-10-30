// The OpenClaw image the four sign-in routes run, and whether they may run it.
//
// It is built here and is on no registry this stack trusts: Docker Hub's `liquidupstart`
// namespace belongs to nobody, so a `docker run` that found no image would pull whatever anyone
// had put there and run it on the stack network. Every run says `--pull never` (CS-FR15), and a
// route asks here before it offers a sign-in: OpenClaw switched on, and its image present
// (CS-FR11). The four routes carried a copy of the switch gate each before; this is the one.
import { spawn } from 'node:child_process';
import { componentsAt, installedComponents } from './project';
import { OPENCLAW_OFF_REFUSAL } from '../component-switches';

const PROBE_TIMEOUT_MS = 30_000;

// Read per call, as envDir() is, so a process that sets it after this module loaded is heard.
export function openclawImage(): string {
  return process.env.OPENCLAW_IMAGE ?? 'liquidupstart/openclaw:latest';
}

function imagePresent(): Promise<boolean> {
  return new Promise((res) => {
    const c = spawn('docker', ['image', 'inspect', openclawImage()], { stdio: 'ignore' });
    const t = setTimeout(() => c.kill(), PROBE_TIMEOUT_MS);
    c.on('error', () => {
      clearTimeout(t);
      res(false);
    });
    c.on('close', (code) => {
      clearTimeout(t);
      res(code === 0);
    });
  });
}

// GET's question. The switch first, so nothing runs while OpenClaw is off.
export async function openclawRunnable(values: Map<string, { value: string; raw?: string }>): Promise<boolean> {
  return installedComponents(values).openclaw && (await imagePresent());
}

// POST's refusal while OpenClaw is off, read from the .env of `dir` as it is now; null when on.
export function refusedWhileOff(dir: string): Response | null {
  return componentsAt(dir).openclaw ? null : new Response(OPENCLAW_OFF_REFUSAL, { status: 409 });
}
