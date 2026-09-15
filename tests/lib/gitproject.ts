import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repoRoot } from './paths';

export const EXAMPLE_TEXT = readFileSync(join(repoRoot, '.env.example'), 'utf8');

export const SYSTEM_PORTS: Record<string, string> = {
  SYSTEM_HTTP_PORT: '8888',
  SYSTEM_HTTPS_PORT: '8833'
};

export function fixtureValue(key: string): string {
  if (key in SYSTEM_PORTS) return SYSTEM_PORTS[key];
  if (/^ENABLE_/.test(key)) return '1';
  return `fixture-${key}`;
}

export function envFrom(
  value: (key: string) => string = fixtureValue,
  extraLines: string[] = []
): string {
  const rendered = EXAMPLE_TEXT.split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|\S*)(\s+#.*)?$/);
      if (!m) return line;
      const [, key, exampleRhs, comment] = m;
      const v = value(key);
      const quote = exampleRhs.startsWith('"') || /[\s#'"]/.test(v);
      return `${key}=${quote ? `"${v}"` : v}${comment ? ` ${comment.trim()}` : ''}`;
    })
    .join('\n');
  return extraLines.length > 0 ? `${rendered}\n${extraLines.join('\n')}\n` : rendered;
}

export function rawLines(text: string): Map<string, string> {
  const lines = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (m) lines.set(m[1], line);
  }
  return lines;
}

export function newProject(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  resetProject(dir);
  return dir;
}

export function resetProject(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'volumes'), { recursive: true });
  writeFileSync(join(dir, '.env.example'), EXAMPLE_TEXT);
  for (const part of ['scripts/start', 'agents/hooks']) {
    cpSync(join(repoRoot, 'config', part), join(dir, 'config', part), { recursive: true });
  }
}

export function secretsDir(dir: string): string {
  return join(dir, 'volumes', '_git-secrets');
}

export function manifestPath(dir: string): string {
  return join(secretsDir(dir), 'repositories.json');
}

export function writeEnv(dir: string, text: string): void {
  writeFileSync(join(dir, '.env'), text);
}

export type KeyPair = {
  slug: string;
  publicKey: string;
  privateKey: string;
  publicKeyFile: string;
  privateKeyFile: string;
  fingerprint: string;
};

export function generateKeyPair(dir: string, slug: string): KeyPair {
  const keyDir = join(secretsDir(dir), 'repos', slug);
  mkdirSync(keyDir, { recursive: true });
  const privateKeyFile = join(keyDir, 'id_ed25519');
  rmSync(privateKeyFile, { force: true });
  rmSync(`${privateKeyFile}.pub`, { force: true });
  execFileSync('ssh-keygen', [
    '-t', 'ed25519', '-N', '', '-C', `liquidupstart-${slug}`, '-f', privateKeyFile
  ], { stdio: 'ignore' });
  return {
    slug,
    publicKey: readFileSync(`${privateKeyFile}.pub`, 'utf8').trim(),
    privateKey: readFileSync(privateKeyFile, 'utf8'),
    publicKeyFile: `volumes/_git-secrets/repos/${slug}/id_ed25519.pub`,
    privateKeyFile,
    fingerprint: fingerprintOf(`${privateKeyFile}.pub`)
  };
}

export function fingerprintOf(publicKeyFile: string): string {
  return execFileSync('ssh-keygen', ['-l', '-f', publicKeyFile], { encoding: 'utf8' }).trim();
}

export function sha256Of(publicKeyFile: string): string {
  const token = fingerprintOf(publicKeyFile)
    .split(/\s+/)
    .find((part) => part.startsWith('SHA256:'));
  if (!token) throw new Error(`no SHA256 fingerprint for ${publicKeyFile}`);
  return token;
}

export type Declared = {
  name: string;
  url: string;
  host: string;
  path: string;
  access: 'read' | 'write';
  policy: 'protected' | 'direct';
  slug: string;
  cloned: boolean;
  error: string | null;
};

export function manifestEntry(repo: Declared): Record<string, unknown> {
  return {
    name: repo.name,
    url: repo.url,
    host: repo.host,
    path: repo.path,
    access: repo.access,
    policy: repo.policy,
    slug: repo.slug,
    keyDir: `volumes/_git-secrets/repos/${repo.slug}`,
    publicKeyFile: `volumes/_git-secrets/repos/${repo.slug}/id_ed25519.pub`,
    clonePath: `volumes/repos/${repo.name}`,
    containerKey: `/git-secrets/repos/${repo.slug}/id_ed25519`,
    containerClone: `/repos/${repo.name}`,
    cloned: repo.cloned,
    error: repo.error
  };
}

export function writeManifest(
  dir: string,
  repositories: Record<string, unknown>[],
  generated = '2026-09-07T09:00:00Z'
): void {
  mkdirSync(secretsDir(dir), { recursive: true });
  writeFileSync(manifestPath(dir), `${JSON.stringify({ generated, repositories }, null, 2)}\n`);
}

export function readManifestFile(dir: string): {
  generated: string;
  repositories: Record<string, any>[];
} {
  return JSON.parse(readFileSync(manifestPath(dir), 'utf8'));
}

export function entryText(dir: string, name: string): string {
  const text = readFileSync(manifestPath(dir), 'utf8');
  const blocks = text.split(/\n(?=    \{)/).filter((b) => b.includes('"name"'));
  const block = blocks.find((b) => new RegExp(`"name": "${name}"`).test(b));
  if (!block) throw new Error(`no manifest block for ${name} in:\n${text}`);
  return block.slice(0, block.lastIndexOf('    }') + 5);
}

export const FLOWS: Declared = {
  name: 'liquid-flows',
  url: 'git@github.com:nocodenation/liquid-flows.git',
  host: 'github.com',
  path: 'nocodenation/liquid-flows',
  access: 'write',
  policy: 'protected',
  slug: 'github.com_nocodenation_liquid-flows',
  cloned: true,
  error: null
};

export const SKILLS: Declared = {
  name: 'agent-skills',
  url: 'git@github.com:nocodenation/agent-skills.git',
  host: 'github.com',
  path: 'nocodenation/agent-skills',
  access: 'read',
  policy: 'direct',
  cloned: false,
  slug: 'github.com_nocodenation_agent-skills',
  error: 'git@github.com: Permission denied (publickey). fatal: Could not read from remote repository.'
};

export const PAIR_DECLARATION =
  `${FLOWS.url}|${FLOWS.access}|${FLOWS.policy},${SKILLS.url}|${SKILLS.access}|${SKILLS.policy}`;

export function declaredEnv(dir: string, declaration: string): void {
  writeEnv(dir, envFrom((key) => (key === 'GIT_REPOSITORIES' ? declaration : fixtureValue(key))));
}

export function pairProject(dir: string): { flows: KeyPair; skills: KeyPair } {
  resetProject(dir);
  declaredEnv(dir, PAIR_DECLARATION);
  const flows = generateKeyPair(dir, FLOWS.slug);
  const skills = generateKeyPair(dir, SKILLS.slug);
  writeManifest(dir, [manifestEntry(FLOWS), manifestEntry(SKILLS)]);
  return { flows, skills };
}
