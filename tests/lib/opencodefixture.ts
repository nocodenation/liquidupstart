import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { repoRoot } from './paths';
import { sh } from './shell';

// OpenCode's entrypoint, run on the host for M-RO. It writes its configuration to
// /root/.config/opencode and its model lists to /tmp, so each run takes a fresh copy with
// both pointed into a sandbox; a mutation of the real file therefore reaches every run.
// It runs under `env -i`, so a provider key in the shell that starts the suite cannot
// decide a case.

// The entrypoint swallows a failing jq, so a sandbox PATH without one would read as "no model
// discovered" in every case rather than as a missing tool.
const JQ = sh(['sh', '-c', 'command -v jq']).stdout.trim();
if (!JQ) throw new Error('M-RO needs jq on PATH: the entrypoint parses every model list with it');

export const ENTRYPOINT = join(repoRoot, 'config/opencode/entrypoint.sh');
export const BASELINE = join(repoRoot, 'tests/fixtures/ed7fd46/opencode-entrypoint.sh');

export const LOCAL =
  '{"data":[{"id":"particle-ai/particle-1"},{"id":"text-embedding-3-small"},{"id":"google/gemma-4-31b-it"}]}';
export const OPENAI =
  '{"data":[{"id":"gpt-5.6-luna","created":1781000000},{"id":"gpt-3.5-turbo-0125","created":1706140800},' +
  '{"id":"gpt-6.1-terra","created":1790000000},{"id":"gpt-5-mini","created":1754500000}]}';
export const OPENAI_WITH_DROPPED =
  '{"data":[{"id":"gpt-5.6-luna","created":1781000000},{"id":"gpt-3.5-turbo-0125","created":1706140800},' +
  '{"id":"gpt-6.1-terra","created":1790000000},{"id":"gpt-6.2-2026-10-30","created":1793000000},' +
  '{"id":"gpt-image-2","created":1795000000},{"id":"gpt-5-mini","created":1754500000}]}';
export const OPENAI_UNDATED =
  '{"data":[{"id":"gpt-5.6-luna"},{"id":"gpt-3.5-turbo-0125"},{"id":"gpt-6.1-terra"},{"id":"gpt-5-mini"}]}';
export const ANTHROPIC =
  '{"data":[{"id":"claude-sonnet-5","created_at":"2026-09-01T00:00:00Z"},{"id":"claude-opus-5","created_at":"2026-08-01T00:00:00Z"}]}';
export const ANTHROPIC_REFUSED = '{"detail":"no ANTHROPIC_API_KEY"}';

export type Answer = { status: string; body?: string };
export type Answers = { local: Answer; openai: Answer; anthropic: Answer };

export const ok = (body: string): Answer => ({ status: '200', body });
export const UNREACHABLE: Answer = { status: '000' };
export const REFUSED: Answer = { status: '401', body: ANTHROPIC_REFUSED };

export const ALL_ON: Answers = { local: ok(LOCAL), openai: ok(OPENAI), anthropic: ok(ANTHROPIC) };

export const BASE_ENV = {
  LOCAL_LLM_API_BASE: 'http://local_llm:8080',
  PRIVACY_PROXY_URL: 'http://privacy-proxy:8080'
};

// A `curl` that answers by URL from <answers>/<name>.code and .json, writing the body to
// the file after `-o` and printing the status as `-w '%{http_code}'` makes curl do. With no
// .code file it behaves like an unreachable host: prints 000 and exits 7.
export const STUB_CURL = `#!/bin/sh
out=""; url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) shift; out="$1" ;;
    -w|-H) shift ;;
    -*) ;;
    *) url="$1" ;;
  esac
  shift
done
case "$url" in
  */openai/v1/models) n=openai ;;
  */anthropic/v1/models) n=anthropic ;;
  */v1/models) n=local ;;
  *) n=none ;;
esac
if [ ! -f "$RO_ANSWERS/$n.code" ]; then printf '000'; exit 7; fi
[ -n "$out" ] && [ -f "$RO_ANSWERS/$n.json" ] && cp "$RO_ANSWERS/$n.json" "$out"
cat "$RO_ANSWERS/$n.code"
`;

export function writeAnswers(dir: string, answers: Answers): void {
  mkdirSync(dir, { recursive: true });
  for (const [name, a] of Object.entries(answers)) {
    if (a.status === '000') continue;
    writeFileSync(join(dir, `${name}.code`), a.status);
    if (a.body !== undefined) writeFileSync(join(dir, `${name}.json`), a.body);
  }
}

export type Run = {
  code: number;
  stdout: string;
  stderr: string;
  raw: string | null;
  config: any;
  startLine: string;
};

export function runEntrypoint(
  answers: Answers,
  env: Record<string, string>,
  script: string = ENTRYPOINT
): Run {
  const box = mkdtempSync(join(tmpdir(), 'lu-ro-'));
  try {
    const bin = join(box, 'bin');
    mkdirSync(bin);
    mkdirSync(join(box, 'tmp'));
    writeFileSync(join(bin, 'curl'), STUB_CURL);
    writeFileSync(join(bin, 'sleep'), '#!/bin/sh\nexit 0\n');
    writeFileSync(join(bin, 'opencode'), '#!/bin/sh\necho "opencode $*"\n');
    for (const f of ['curl', 'sleep', 'opencode']) chmodSync(join(bin, f), 0o755);
    writeAnswers(join(box, 'answers'), answers);

    const text = readFileSync(script, 'utf8');
    if (!text.includes('/root/.config/opencode') || !text.includes('/tmp/')) {
      throw new Error(`${script} no longer writes to /root/.config/opencode and /tmp/: the sandbox copy would write outside it`);
    }
    const copy = join(box, 'entrypoint.sh');
    writeFileSync(
      copy,
      text.replaceAll('/root/.config/opencode', join(box, 'config/opencode')).replaceAll('/tmp/', join(box, 'tmp') + '/')
    );

    const vars = { PATH: `${bin}:${dirname(JQ)}:/usr/bin:/bin`, HOME: box, RO_ANSWERS: join(box, 'answers'), ...env };
    const r = sh(['env', '-i', ...Object.entries(vars).map(([k, v]) => `${k}=${v}`), 'sh', copy], box);
    const file = join(box, 'config/opencode/opencode.json');
    const raw = existsSync(file) ? readFileSync(file, 'utf8') : null;
    return {
      code: r.code,
      stdout: r.stdout,
      stderr: r.stderr,
      raw,
      config: raw === null ? null : JSON.parse(raw),
      startLine: r.stdout.split('\n').find((l) => l.startsWith('Starting opencode web')) ?? ''
    };
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
}
