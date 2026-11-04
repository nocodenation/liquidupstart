/**
 * M-RO · Integration · OpenCode itself offers what the entrypoint allows under routing only
 *
 * Purpose:  RO-1 to RO-3 prove what `opencode.json` says. Whether OpenCode accepts
 *           `enabled_providers`, offers what it names and nothing else, and finds the default
 *           among what it offers is OpenCode's behaviour, and only OpenCode can show it. The
 *           choice of an allowlist rests on that: measured by hand on 2026-11-01 on 1.19.5,
 *           `enabled_providers` offered exactly the providers it named, while
 *           `disabled_providers: ["opencode"]` still offered `openai`.
 * Given:    `liquidupstart/opencode:latest`, running the working tree's
 *           `config/opencode/entrypoint.sh`, mounted read-only, with the stub `curl` of
 *           `tests/lib/opencodefixture.ts` first on `PATH` for the entrypoint alone, and
 *           `config/agents/instructions.md` where compose mounts it.
 * When:     One container per mode starts, the case waits for OpenCode's own
 *           `GET /config/providers` to answer, asked with the image's `/usr/bin/curl`, and
 *           reads the provider ids and the written `model`.
 * Then:     Under `only` the ids are exactly `llamacpp`, `privacy-openai` and `privacy`, and
 *           the default `privacy/private-claude` is one of the models OpenCode offers. Under
 *           `opt-in` the same OpenCode offers `opencode` (Zen) and `openai`.
 *           And SR-6's row in the image: the `only` container's log carries the missing-key
 *           line for the Anthropic list, written by the image's own `sh` (dash) and `jq`.
 * Covers:   RO-5, RO-FR1, RO-FR3, SR-6, SR-FR8
 * Negative: under `only`, neither `opencode` nor `openai` is offered, although
 *           `OPENAI_API_KEY` reached the container.
 * Counterpart: under `opt-in` both are, so the check is able to see them at all.
 *
 * Test data: RO-1's answers with the Anthropic list refused by the proxy for want of a key
 * (401) and `ENABLE_ANTHROPIC_CLAUDE_CODE=1`, `OPENAI_API_KEY=sk-ro-stray`, and
 * `PRIVACY_ROUTING=only` in one container and unset in the other. Precondition: Docker and the
 * image; without them the cases are skipped, and the reason is printed. The containers carry the
 * suite's fixture labels, so a run cut off midway leaves nothing the sweep cannot find.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';
import { containerName, fixtureLabels } from '../lib/dashboardserver';
import { BASE_ENV, KEY_MISSING, LOCAL, OPENAI, STUB_CURL, ok, writeAnswers } from '../lib/opencodefixture';

const IMAGE = 'liquidupstart/opencode:latest';
const READY = sh(['docker', 'image', 'inspect', IMAGE]).code === 0;
if (!READY) console.warn(`RO-5 and SR-6's image row skipped: ${IMAGE} is not there (./config/scripts/build/opencode.sh builds it)`);

type Seen = { ids: string[]; models: Record<string, string[]>; model: string | undefined };

const box = mkdtempSync(join(tmpdir(), 'lu-ro5-'));
const started: string[] = [];

function start(mode: 'only' | 'opt-in'): string {
  const name = containerName(`lu-ro5-${mode}`);
  const env = {
    ...BASE_ENV,
    ENABLE_ANTHROPIC_CLAUDE_CODE: '1',
    OPENAI_API_KEY: 'sk-ro-stray',
    RO_ANSWERS: '/ro-answers',
    ...(mode === 'only' ? { PRIVACY_ROUTING: 'only' } : {})
  };
  const r = sh([
    'docker', 'run', '-d', '--name', name, ...fixtureLabels(),
    '-v', `${join(box, 'bin')}:/ro-stub:ro`,
    '-v', `${join(box, 'answers')}:/ro-answers:ro`,
    '-v', `${join(repoRoot, 'config/opencode/entrypoint.sh')}:/ro/entrypoint.sh:ro`,
    '-v', `${join(repoRoot, 'config/agents/instructions.md')}:/opencode/instructions.md:ro`,
    ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
    '--entrypoint', 'sh', IMAGE, '-c', 'PATH="/ro-stub:$PATH" exec sh /ro/entrypoint.sh'
  ]);
  if (r.code !== 0) throw new Error(`could not start ${name}: ${r.output}`);
  started.push(name);
  return name;
}

async function seen(name: string): Promise<Seen> {
  const deadline = Date.now() + 90_000;
  let last = '';
  while (Date.now() < deadline) {
    // -m: while OpenCode starts it can accept a connection and not answer it, and this call blocks.
    const r = sh(['docker', 'exec', name, '/usr/bin/curl', '-s', '-f', '-m', '5', 'http://127.0.0.1:4096/config/providers']);
    if (r.code === 0) {
      const body = JSON.parse(r.stdout) as { providers: { id: string; models: Record<string, unknown> }[] };
      const cfg = JSON.parse(sh(['docker', 'exec', name, 'cat', '/root/.config/opencode/opencode.json']).stdout);
      return {
        ids: body.providers.map((p) => p.id),
        models: Object.fromEntries(body.providers.map((p) => [p.id, Object.keys(p.models)])),
        model: cfg.model
      };
    }
    last = r.output;
    await Bun.sleep(1000);
  }
  throw new Error(`${name}: /config/providers did not answer within 90 s (${last.trim()}); logs:\n${sh(['docker', 'logs', name]).output}`);
}

let only: Seen;
let optIn: Seen;
let onlyName = '';

beforeAll(async () => {
  if (!READY) return;
  mkdirSync(join(box, 'bin'));
  writeFileSync(join(box, 'bin', 'curl'), STUB_CURL);
  chmodSync(join(box, 'bin', 'curl'), 0o755);
  writeAnswers(join(box, 'answers'), { local: ok(LOCAL), openai: ok(OPENAI), anthropic: KEY_MISSING });
  const a = start('only');
  onlyName = a;
  const b = start('opt-in');
  [only, optIn] = await Promise.all([seen(a), seen(b)]);
}, 200_000);

afterAll(() => {
  for (const name of started) sh(['docker', 'rm', '-f', name]);
  rmSync(box, { recursive: true, force: true });
});

describe.skipIf(!READY)('RO-5 OpenCode 1.19.5 reads the file as meant', () => {
  test('RO-5 under only, exactly llamacpp, privacy-openai and privacy, with privacy/private-claude among them', () => {
    expect([...only.ids].sort()).toEqual(['llamacpp', 'privacy', 'privacy-openai']);
    expect(only.model).toBe('privacy/private-claude');
    expect(only.models['privacy']).toContain('private-claude');
  });

  test('RO-5 the negative: under only, neither opencode nor openai, though OPENAI_API_KEY reached the container', () => {
    expect(only.ids).not.toContain('opencode');
    expect(only.ids).not.toContain('openai');
  });

  test('RO-5 the counterpart: under opt-in, the same OpenCode offers opencode and openai', () => {
    expect(optIn.ids).toContain('opencode');
    expect(optIn.ids).toContain('openai');
  });
});

describe.skipIf(!READY)('SR-6 the 401 warning in the image', () => {
  test('SR-6 in the image, the missing-key line reaches the container log', () => {
    expect(sh(['docker', 'logs', onlyName]).output).toContain(
      `WARNING: ${BASE_ENV.PRIVACY_PROXY_URL}/anthropic/v1/models -> HTTP 401: the privacy proxy holds no key for that provider (.env section 5) — provider skipped.`
    );
  });
});
