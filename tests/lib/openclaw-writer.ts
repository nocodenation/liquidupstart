/**
 * The OpenClaw config writer, as the start script actually holds it.
 *
 * Two suites drive this program — `m-oc.config-shape` and `m-m1.memory-config` —
 * and until 2026-09-23 each carried its own copy of the extraction and the
 * runner, about sixty lines, differing in loop shape. They had already drifted:
 * the `m-oc` copy carries a repair for blocks that close with `' || true)"`,
 * which swallowed two sibling blocks and produced a program that was half
 * shell; the `m-m1` copy never got it. Two suites testing slightly different
 * programs is the failure this file exists to end. F6 of the 2026-09-22 review.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sh } from './shell';
import { repoRoot } from './paths';

export type Env = Record<string, string>;

export const IMAGE_NEW = 'ghcr.io/openclaw/openclaw:2026.9.1';
export const IMAGE_OLD = 'ghcr.io/openclaw/openclaw:2026.7.1';

/**
 * Extracted by content, never copied: a test carrying its own copy of the thing
 * under test stops testing it the moment the two drift.
 *
 * A block opens on a line that is only `-e '` and closes on the next line whose
 * first non-space character is the closing quote. The two sibling blocks close
 * with `' || true)"`, so the terminator cannot be matched as a bare quote.
 */
export function configWriter(): string {
  const lines = readFileSync(join(repoRoot, 'config/scripts/start/openclaw.sh'), 'utf8').split('\n');
  const isOpen = (l: string) => /^\s*-e '\s*$/.test(l);
  const isClose = (l: string) => /^\s*'/.test(l);
  for (let start = 0; start < lines.length; start++) {
    if (!isOpen(lines[start])) continue;
    let end = -1;
    for (let i = start + 1; i < lines.length; i++) {
      if (isClose(lines[i])) { end = i; break; }
    }
    if (end === -1) continue;
    const body = lines.slice(start + 1, end).join('\n');
    if (body.includes('/state/openclaw.json')) return body;
  }
  throw new Error('config writer not found in config/scripts/start/openclaw.sh');
}

/** Everything the writer reads that neither suite is making a point about. */
export const BASE_ENV: Env = {
  OC_SCHEMA_NEW: '0',
  OPENCLAW_VERSION: 'test',
  ENABLE_CLAUDE_CLI: '0',
  ENABLE_COPILOT: '0',
  ENABLE_CODEX: '0',
  ENABLE_GROK: '0',
  ENABLE_LOCAL: '0',
  // The writer writes it into gateway.trustedProxies with no fallback -- an
  // empty value is "a bug to fail on rather than to paper over" per its own
  // comment, and it comes back as a null the validator rejects. Dropping it
  // from this map is what made the first run of the F5 validation red, with a
  // message about proxies in a case about memory.
  LU_NETWORK_SUBNET: '10.99.0.0/24',
  PLUGIN_PATHS: '',
  MODEL_WILDCARDS: '',
  OPENROUTER_MODELS_JSON: '[]',
  LOCAL_LLM_MODELS_JSON: '[]'
};

export function newWorkRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function dropWorkRoot(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

/**
 * Runs the writer over `seed` and returns what it left behind.
 *
 * `seed` is what the config file already holds. It defaults to `{}`, but a case
 * about an existing installation has to pass one: every case here started from
 * `{}` until 2026-09-23, so only the default path was ever walked, which is how
 * two findings about what the writer does to an existing config survived.
 */
export function writeConfig(o: {
  workRoot: string;
  program: string;
  env: Env;
  seed?: unknown;
  image?: string;
}): any {
  const dir = mkdtempSync(join(o.workRoot, 'state-'));
  writeFileSync(join(dir, 'openclaw.json'), JSON.stringify(o.seed ?? {}, null, 2) + '\n');
  writeFileSync(join(dir, 'writer.js'), o.program);
  const envArgs: string[] = [];
  for (const [k, v] of Object.entries({ ...BASE_ENV, ...o.env })) envArgs.push('-e', `${k}=${v}`);
  const r = sh([
    'docker', 'run', '--rm', '--user', '0:0',
    '-v', `${dir}:/state`, ...envArgs,
    '--entrypoint', 'node', o.image ?? IMAGE_NEW, '/state/writer.js'
  ]);
  if (r.code !== 0) throw new Error(`config writer failed: ${r.output}`);
  return JSON.parse(readFileSync(join(dir, 'openclaw.json'), 'utf8'));
}

/**
 * Validate a config document with a given version's own validator.
 *
 * This is the half that says whether the stack would boot: an unknown key is a
 * failed start rather than a warning, and a suite that only reads the JSON back
 * passes green over a config the gateway refuses.
 */
export function validate(o: { workRoot: string; config: unknown; image: string }): {
  code: number;
  output: string;
} {
  const home = mkdtempSync(join(o.workRoot, 'home-'));
  mkdirSync(join(home, '.openclaw'), { recursive: true });
  writeFileSync(join(home, '.openclaw/openclaw.json'), JSON.stringify(o.config, null, 2));
  return sh([
    'docker', 'run', '--rm', '--user', '0:0',
    '-v', `${home}:/home/node`, '-e', 'HOME=/home/node', '-e', 'OPENCLAW_HOME=/home/node',
    '--entrypoint', 'openclaw', o.image, 'config', 'validate'
  ]);
}

/**
 * `openclaw doctor --fix` over a seeded config, and the config it leaves behind.
 *
 * This is the stack's own upgrade path, not a hypothetical: `openclaw.sh`'s
 * `openclaw_migrate_state` runs exactly this **before** the config writer
 * whenever the state was written by an older version. One of its rules is
 * *"agents.list moved to keyed agents.entries"*, so a roster an operator wrote
 * on 2026.7.1 arrives at the writer in the keyed shape — which is why a guard
 * that walked `agents.list` only could be bypassed by doing nothing unusual at
 * all. C1 of the 2026-10-13 re-review.
 */
export function doctorFix(o: { workRoot: string; config: unknown; image: string }): {
  code: number;
  output: string;
  config: any;
} {
  const home = mkdtempSync(join(o.workRoot, 'doctor-'));
  mkdirSync(join(home, '.openclaw'), { recursive: true });
  const at = join(home, '.openclaw/openclaw.json');
  writeFileSync(at, JSON.stringify(o.config, null, 2));
  const r = sh([
    'docker', 'run', '--rm', '--user', '0:0',
    '-v', `${home}:/home/node`, '-e', 'HOME=/home/node', '-e', 'OPENCLAW_HOME=/home/node',
    '--entrypoint', 'openclaw', o.image, 'doctor', '--fix'
  ]);
  return { code: r.code, output: r.output, config: JSON.parse(readFileSync(at, 'utf8')) };
}

/**
 * The two gates the active-memory plugin actually consults before a reply,
 * evaluated by the image's own code rather than by reading ours.
 *
 * `index.ts` opens on `isEnabledForAgent(config, agentId) || (config.enabled &&
 * shouldRememberAcrossConversations(liveConfig, agentId))`. Asserting
 * `entries["active-memory"].enabled === true` says nothing about either: on
 * 2026-09-28 that assertion was green while both gates were shut and the plugin
 * did nothing at all.
 */
export function activeMemoryGates(o: {
  workRoot: string;
  config: unknown;
  agentId?: string;
  image?: string;
}): { pluginEnabled: boolean; namesAgent: boolean; remembers: boolean; active: boolean } {
  const dir = mkdtempSync(join(o.workRoot, 'gates-'));
  writeFileSync(join(dir, 'config.json'), JSON.stringify(o.config));
  const agent = o.agentId ?? 'main';
  writeFileSync(
    join(dir, 'gates.mjs'),
    `import { readFileSync } from "node:fs";
const cfg = JSON.parse(readFileSync("/probe/config.json", "utf8"));
const m = await import("/app/dist/extensions/active-memory/session-policy.js");
const k = await import("/app/dist/extensions/active-memory/config.js");
const entry = cfg?.plugins?.entries?.["active-memory"] ?? {};
const pluginEnabled = m.isActiveMemoryPluginEnabled(cfg);
// The image's own predicate, not a copy of it. This was
// \`Boolean(entry.enabled) && agents.includes(agent)\`, and the runtime checks
// \`normalizePluginConfig(entry.config).enabled\` -- the INNER flag. Two shapes
// where the copy said active and the runtime said otherwise, both run by the
// reviewer: an operator who has typed \`/active-memory off --global\`, which
// writes \`config.enabled: false\` and the writer preserves; and
// \`plugins.deny: ["active-memory"]\`. N2 of the 2026-10-13 re-review.
// It takes the plugin config, not the whole openclaw config: its body is
// \`if (!config.enabled) return false; if (!agentId) return false; return
// config.agents.includes(agentId)\`, read out of the image. Handing it \`cfg\`
// returns false for every agent, which looks exactly like blocker 1 being open
// and is not -- measured while writing this, and it nearly became a report.
const inner = k.normalizePluginConfig(entry?.config ?? {});
const namesAgent = m.isEnabledForAgent(inner, ${JSON.stringify(agent)});
const remembers = m.shouldRememberAcrossConversations(cfg, ${JSON.stringify(agent)});
// \`index.ts\` opens on isEnabledForAgent(config, agent) || (config.enabled &&
// shouldRemember(...)), where \`config\` is the NORMALISED plugin config -- and
// the whole plugin is off unless isActiveMemoryPluginEnabled holds, which the
// old definition of \`active\` ignored.
console.log(JSON.stringify({
  pluginEnabled, namesAgent, remembers,
  active: pluginEnabled && (namesAgent || (Boolean(inner?.enabled) && remembers))
}));
`
  );
  const r = sh([
    'docker', 'run', '--rm', '--user', '0:0',
    '-v', `${dir}:/probe`,
    '--entrypoint', 'node', o.image ?? IMAGE_NEW, '/probe/gates.mjs'
  ]);
  if (r.code !== 0) throw new Error(`gate probe failed: ${r.output}`);
  return JSON.parse(r.stdout.trim().split('\n').pop()!);
}
