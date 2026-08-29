import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './paths';

export const AGENT_SERVICES = ['openclaw-gateway', 'openclaw-cli', 'opencode'];

export function composeText(): string {
  return readFileSync(join(repoRoot, 'compose.yml'), 'utf8');
}

export function serviceBlock(service: string, text: string = composeText()): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l === `  ${service}:`);
  if (start === -1) throw new Error(`service block not found at two-space indent: ${service}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}\S/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

export function envExampleText(): string {
  return readFileSync(join(repoRoot, '.env.example'), 'utf8');
}

export function composeDefault(service: string, key: string): string {
  const block = serviceBlock(service);
  const m = block.match(new RegExp(`^\\s*${key}:\\s*\\$\\{${key}:-([^}]*)\\}`, 'm'));
  if (!m) throw new Error(`no defaulted ${key} in the ${service} block`);
  return m[1].trim();
}
