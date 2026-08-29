import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const testsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = resolve(testsRoot, '..');
export const runnerPath = resolve(testsRoot, 'run.sh');
