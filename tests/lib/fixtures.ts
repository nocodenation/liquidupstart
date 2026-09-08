import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'lu-harness-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

export function dropTree(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

export const PASSING = `import { test, expect } from 'bun:test';
test('fixture passes', () => { expect(1).toBe(1); });
`;

export const FAILING = `import { test, expect } from 'bun:test';
test('fixture fails on purpose', () => { expect(1).toBe(2); });
`;
