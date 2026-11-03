/**
 * M-SR · Component · The primary model that routing only drops comes back
 *
 * Purpose:  Under `PRIVACY_PROXY_ROUTING=only`, OpenClaw's config writer drops a primary model on
 *           a removed route and pins a privacy model in its place. On 2026-10-31 that turned
 *           `anthropic/claude-opus-5` into `privacy-anthropic/claude-opus-5`, and the next start
 *           under `opt-in` kept it, while the sign-ins `only` had set aside came back. The writer
 *           now records the dropped model in `privacy-routing-primary.json` beside
 *           `openclaw.json`, and the next start in any other mode restores it and removes the
 *           record, unconditionally, as the sign-ins come back (SR-FR1, SR-FR2).
 * Given:    The writer as `config/scripts/start/openclaw.sh` holds it (`configWriter()`), run with
 *           node in `ghcr.io/openclaw/openclaw:2026.9.1` on a state directory that each row keeps
 *           across its starts (`startWriter()` of `tests/lib/openclaw-writer.ts`), with the mode
 *           environment `openclaw.sh` sets.
 * When:     The nineteen rows of `docs/TEST-SPEC-small-repairs.md` §3.1, each from its own state.
 * Then:     A drop under `only` writes the record unless a usable one is there; a start in
 *           another mode restores a usable record before the default block runs and removes it
 *           once `openclaw.json` is written; an unusable record is removed and logged in any mode,
 *           restores nothing, and the start succeeds; a record that cannot be written or removed
 *           does not stop the start either; no temporary file is left beside the record.
 * Covers:   SR-1, SR-FR1, SR-FR2, UC1 to UC5
 * Negative: a second start under `only` and a drop while a usable record is there leave the
 *           record byte for byte; a start under `only` that drops nothing writes none; a start
 *           under `opt-in` with no record leaves a privacy model alone; four unusable records
 *           restore nothing; a directory where the record belongs stops no start.
 * Counterpart: the restore under `opt-in`, with the proxy off, after a default set under `only`,
 *           after `only` pinned nothing, and from the string form; and the record written on a
 *           drop, also over an unusable one.
 *
 * Test data: the modes, on top of `BASE_ENV`, with `OC_SCHEMA_NEW=1` and
 * `PRIVACY_PROXY_URL=http://privacy-proxy:8080` always: `opt-in` is `ENABLE_CLAUDE_CLI=1`,
 * `ENABLE_CODEX=0`, `PRIVACY_OPENAI=1`, `PRIVACY_ANTHROPIC=1`; the proxy off is the same with both
 * privacy providers `0` and `PRIVACY_ROUTING=off`; `only` is `ENABLE_CLAUDE_CLI=0` with both
 * privacy providers `1`. Starting point A is `{}` run once under `opt-in`, which pins
 * `anthropic/claude-opus-5`; "after row 1" is a fresh copy of the directory row 1 left. Row 9
 * starts from `{}` under `opt-in` with the CLI `0`, Codex `1` and both privacy providers `0`,
 * which pins `openai/gpt-5.5`, then runs `only` with both privacy providers `0`, so nothing can
 * be pinned, and ends under `opt-in` with Codex `1`, so the restored model has its route while
 * the default would still be `anthropic/claude-opus-5`. Rows 18 and 19 put an empty directory
 * where the record belongs, which no read, write or removal of a file can handle. The unusable
 * records are `{"dropped":["anthropic/claude-opus-5"]}`, `{"dropped":""}`, `null` and
 * `{"dropped":` -- one per way the check can be incomplete.
 *
 * Precondition: docker and `ghcr.io/openclaw/openclaw:2026.9.1`; without the image every case is
 * skipped and one named case says so.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IMAGE_NEW, configWriter, dropWorkRoot, newWorkRoot, startWriter, type Env } from '../lib/openclaw-writer';
import { sh } from '../lib/shell';

const HAVE_IMAGE = sh(['docker', 'image', 'inspect', IMAGE_NEW]).code === 0;
const RECORD = 'privacy-routing-primary.json';
const LONG = 120_000;

const COMMON: Env = { OC_SCHEMA_NEW: '1', PRIVACY_PROXY_URL: 'http://privacy-proxy:8080' };
const MODES: Record<'opt-in' | 'off' | 'only', Env> = {
  'opt-in': { ...COMMON, PRIVACY_ROUTING: 'opt-in', ENABLE_CLAUDE_CLI: '1', ENABLE_CODEX: '0', PRIVACY_OPENAI: '1', PRIVACY_ANTHROPIC: '1' },
  off: { ...COMMON, PRIVACY_ROUTING: 'off', ENABLE_CLAUDE_CLI: '1', ENABLE_CODEX: '0', PRIVACY_OPENAI: '0', PRIVACY_ANTHROPIC: '0' },
  only: { ...COMMON, PRIVACY_ROUTING: 'only', ENABLE_CLAUDE_CLI: '0', ENABLE_CODEX: '0', PRIVACY_OPENAI: '1', PRIVACY_ANTHROPIC: '1' }
};
const NO_PRIVACY: Env = { PRIVACY_OPENAI: '0', PRIVACY_ANTHROPIC: '0' };
const PRIVACY_PRIMARY = { agents: { defaults: { model: { primary: 'privacy-anthropic/claude-opus-5' } } } };

let root = '';
let program = '';
let pointA = '';
let row1 = { dir: '', code: -1, output: '', config: null as any };

const primaryOf = (config: any) => {
  const m = config?.agents?.defaults?.model;
  return typeof m === 'string' ? m : m?.primary;
};
const recordIn = (dir: string) => (existsSync(join(dir, RECORD)) ? readFileSync(join(dir, RECORD), 'utf8') : null);
const strays = (dir: string) => readdirSync(dir).filter((f) => f.startsWith('privacy-routing-primary') && f !== RECORD);

function state(seed: unknown, record?: string): string {
  const dir = mkdtempSync(join(root, 'state-'));
  writeFileSync(join(dir, 'openclaw.json'), JSON.stringify(seed, null, 2) + '\n');
  if (record !== undefined) writeFileSync(join(dir, RECORD), record);
  return dir;
}
function copyOf(dir: string): string {
  const to = mkdtempSync(join(root, 'copy-'));
  cpSync(dir, to, { recursive: true });
  return to;
}
function setPrimary(dir: string, primary: string): void {
  const file = join(dir, 'openclaw.json');
  const c = JSON.parse(readFileSync(file, 'utf8'));
  c.agents.defaults.model = { ...c.agents.defaults.model, primary };
  writeFileSync(file, JSON.stringify(c, null, 2) + '\n');
}
function start(dir: string, mode: keyof typeof MODES, extra: Env = {}) {
  const r = startWriter({ state: dir, program, env: { ...MODES[mode], ...extra } });
  return { dir, ...r };
}

describe.skipIf(!HAVE_IMAGE)('SR-1 the primary model after only', () => {
  if (!HAVE_IMAGE) return;
  beforeAll(() => {
    root = newWorkRoot('lu-sr1-');
    program = configWriter();
    pointA = state({});
    const a = start(pointA, 'opt-in');
    if (a.code !== 0 || primaryOf(a.config) !== 'anthropic/claude-opus-5') {
      throw new Error(`starting point A is not anthropic/claude-opus-5: ${a.output}`);
    }
    row1 = start(copyOf(pointA), 'only');
  }, LONG);
  afterAll(() => dropWorkRoot(root));

  test('SR-1 a start under only drops anthropic/claude-opus-5, pins the privacy model and records the dropped one', () => {
    expect(row1.code, row1.output).toBe(0);
    expect(primaryOf(row1.config)).toBe('privacy-anthropic/claude-opus-5');
    expect(JSON.parse(recordIn(row1.dir)!)).toEqual({ dropped: 'anthropic/claude-opus-5' });
    expect(strays(row1.dir)).toEqual([]);
  });

  test('SR-1 the next start under opt-in restores anthropic/claude-opus-5 and removes the record', () => {
    const r = start(copyOf(row1.dir), 'opt-in');
    expect(r.code, r.output).toBe(0);
    expect(primaryOf(r.config)).toBe('anthropic/claude-opus-5');
    expect(recordIn(r.dir)).toBeNull();
    expect(r.output).toContain('openclaw.json: privacy routing, restored primary model anthropic/claude-opus-5');
    expect(strays(r.dir)).toEqual([]);
  }, LONG);

  test('SR-1 and so does the next start with the proxy off', () => {
    const r = start(copyOf(row1.dir), 'off');
    expect(r.code, r.output).toBe(0);
    expect(primaryOf(r.config)).toBe('anthropic/claude-opus-5');
    expect(recordIn(r.dir)).toBeNull();
    expect(strays(r.dir)).toEqual([]);
  }, LONG);

  test('SR-1 and so it does when the default was set to privacy-openai/gpt-5.6-sol under only', () => {
    const dir = copyOf(row1.dir);
    setPrimary(dir, 'privacy-openai/gpt-5.6-sol');
    const r = start(dir, 'opt-in');
    expect(r.code, r.output).toBe(0);
    expect(primaryOf(r.config)).toBe('anthropic/claude-opus-5');
    expect(recordIn(r.dir)).toBeNull();
    expect(strays(r.dir)).toEqual([]);
  }, LONG);

  test('SR-1 the negative: a second start under only leaves the first record as it was', () => {
    const r = start(copyOf(row1.dir), 'only');
    expect(r.code, r.output).toBe(0);
    expect(primaryOf(r.config)).toBe('privacy-anthropic/claude-opus-5');
    expect(recordIn(r.dir)).toBe(recordIn(row1.dir));
    expect(strays(r.dir)).toEqual([]);
  }, LONG);

  test('SR-1 the negative: a start under only that drops openai/gpt-5.5 keeps the record already there', () => {
    const dir = copyOf(row1.dir);
    setPrimary(dir, 'openai/gpt-5.5');
    const r = start(dir, 'only');
    expect(r.code, r.output).toBe(0);
    expect(primaryOf(r.config)).toBe('privacy-anthropic/claude-opus-5');
    expect(recordIn(r.dir)).toBe(recordIn(row1.dir));
    expect(strays(r.dir)).toEqual([]);
  }, LONG);

  test('SR-1 the negative: a start under only that drops nothing, with no record, writes none', () => {
    const r = start(state(PRIVACY_PRIMARY), 'only');
    expect(r.code, r.output).toBe(0);
    expect(primaryOf(r.config)).toBe('privacy-anthropic/claude-opus-5');
    expect(recordIn(r.dir)).toBeNull();
    expect(strays(r.dir)).toEqual([]);
  }, LONG);

  test('SR-1 the negative: a start under opt-in with no record leaves the privacy model as it is', () => {
    const r = start(state(PRIVACY_PRIMARY), 'opt-in');
    expect(r.code, r.output).toBe(0);
    expect(primaryOf(r.config)).toBe('privacy-anthropic/claude-opus-5');
    expect(recordIn(r.dir)).toBeNull();
    expect(strays(r.dir)).toEqual([]);
  }, LONG);

  test('SR-1 when only had nothing to pin, opt-in restores openai/gpt-5.5 before the default block, which pins nothing', () => {
    const dir = state({});
    const b = start(dir, 'opt-in', { ENABLE_CLAUDE_CLI: '0', ENABLE_CODEX: '1', ...NO_PRIVACY });
    expect(primaryOf(b.config), b.output).toBe('openai/gpt-5.5');
    const o = start(dir, 'only', NO_PRIVACY);
    expect(o.code, o.output).toBe(0);
    expect(primaryOf(o.config)).toBeUndefined();
    expect(JSON.parse(recordIn(dir)!)).toEqual({ dropped: 'openai/gpt-5.5' });
    const r = start(dir, 'opt-in', { ENABLE_CODEX: '1' });
    expect(r.code, r.output).toBe(0);
    expect(primaryOf(r.config)).toBe('openai/gpt-5.5');
    expect(recordIn(dir)).toBeNull();
    expect(r.output).toContain('restored primary model openai/gpt-5.5');
    expect(r.output).not.toContain('pinned default primary model');
    expect(strays(dir)).toEqual([]);
  }, LONG);

  test('SR-1 a primary written as a string is dropped and recorded under only', () => {
    const r = start(state({ agents: { defaults: { model: 'anthropic/claude-opus-5' } } }), 'only');
    expect(r.code, r.output).toBe(0);
    expect(primaryOf(r.config)).toBe('privacy-anthropic/claude-opus-5');
    expect(JSON.parse(recordIn(r.dir)!)).toEqual({ dropped: 'anthropic/claude-opus-5' });
    expect(strays(r.dir)).toEqual([]);
  }, LONG);

  test('SR-1 a primary written as a string is replaced by the record under opt-in', () => {
    const dir = state(
      { agents: { defaults: { model: 'privacy-anthropic/claude-opus-5' } } },
      '{"dropped":"anthropic/claude-opus-5"}\n'
    );
    const r = start(dir, 'opt-in');
    expect(r.code, r.output).toBe(0);
    expect(primaryOf(r.config)).toBe('anthropic/claude-opus-5');
    expect(recordIn(dir)).toBeNull();
    expect(strays(dir)).toEqual([]);
  }, LONG);

  const unusable = (record: string) => {
    const r = start(state(PRIVACY_PRIMARY, record), 'opt-in');
    expect(r.code, r.output).toBe(0);
    expect(primaryOf(r.config)).toBe('privacy-anthropic/claude-opus-5');
    expect(recordIn(r.dir)).toBeNull();
    expect(r.output).toContain('openclaw.json: privacy routing, removed an unusable privacy-routing-primary.json');
    expect(strays(r.dir)).toEqual([]);
  };

  test('SR-1 the negative: a record whose dropped is a list restores nothing, is removed, and the start succeeds', () => {
    unusable('{"dropped":["anthropic/claude-opus-5"]}\n');
  }, LONG);

  test('SR-1 the negative: a record whose dropped is empty restores nothing, is removed, and the start succeeds', () => {
    unusable('{"dropped":""}\n');
  }, LONG);

  test('SR-1 the negative: a record that is null restores nothing, is removed, and the start succeeds', () => {
    unusable('null\n');
  }, LONG);

  test('SR-1 the negative: a record cut off mid-write restores nothing, is removed, and the start succeeds', () => {
    unusable('{"dropped":');
  }, LONG);

  test('SR-1 but a start under only that drops a model while an unusable record is there replaces it', () => {
    const dir = copyOf(pointA);
    writeFileSync(join(dir, RECORD), '{"dropped":');
    const r = start(dir, 'only');
    expect(r.code, r.output).toBe(0);
    expect(primaryOf(r.config)).toBe('privacy-anthropic/claude-opus-5');
    expect(JSON.parse(recordIn(dir)!)).toEqual({ dropped: 'anthropic/claude-opus-5' });
    expect(strays(dir)).toEqual([]);
  }, LONG);

  test('SR-1 the negative: under only, an unusable record goes as well when nothing is dropped', () => {
    const r = start(state(PRIVACY_PRIMARY, '{"dropped":'), 'only');
    expect(r.code, r.output).toBe(0);
    expect(primaryOf(r.config)).toBe('privacy-anthropic/claude-opus-5');
    expect(recordIn(r.dir)).toBeNull();
    expect(r.output).toContain('openclaw.json: privacy routing, removed an unusable privacy-routing-primary.json');
    expect(strays(r.dir)).toEqual([]);
  }, LONG);

  test('SR-1 the negative: a directory where the record belongs, which cannot be removed, stops no start', () => {
    const dir = state(PRIVACY_PRIMARY);
    mkdirSync(join(dir, RECORD));
    const r = start(dir, 'opt-in');
    expect(r.code, r.output).toBe(0);
    expect(primaryOf(r.config)).toBe('privacy-anthropic/claude-opus-5');
    expect(r.output).toContain('openclaw.json: privacy routing, could not remove privacy-routing-primary.json');
    expect(strays(dir)).toEqual([]);
  }, LONG);

  test('SR-1 the negative: and one that cannot be written over stops no drop either, and leaves no temporary file', () => {
    const dir = copyOf(pointA);
    mkdirSync(join(dir, RECORD));
    const r = start(dir, 'only');
    expect(r.code, r.output).toBe(0);
    expect(primaryOf(r.config)).toBe('privacy-anthropic/claude-opus-5');
    expect(r.output).toContain('openclaw.json: privacy routing, could not record primary model anthropic/claude-opus-5');
    expect(strays(dir)).toEqual([]);
  }, LONG);
});

test.skipIf(HAVE_IMAGE)(`SR-1 needs ${IMAGE_NEW}, which is not present here`, () => {
  expect(HAVE_IMAGE).toBe(false);
});
