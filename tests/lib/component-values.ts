/**
 * The one table of switch lines that both readers are held to: CS-1 runs the shell reader
 * over it, CS-2 runs both readers over it and compares. Keeping one list means the two
 * readers cannot be tested against different values (docs/TEST-SPEC-component-switches.md).
 *
 * Each row is the whole `.env` of a case, written byte for byte, and the answer
 * `lu_component_state <file> ENABLE_LIQUID` must give. Shaped values, and why:
 *
 * - `ENABLE_OPENCLAW=1` alone is the absent key: an `.env` from before the switches.
 * - `'0'` is single-quoted on purpose. The dashboard's `splitValue` removes double quotes
 *   only, so a reader left to it reads this as on while the shell reads off.
 * - `0` followed by `\r\n` is a file saved on Windows.
 * - `O` is the capital letter, chosen because it looks like zero.
 * - `0` then `1` is a key given twice; compose and `parseEnvValues` take the last.
 * - The six rows after it were found by the local review of 2026-10-29, where the readers
 *   still disagreed: a tab before the comment, blanks inside the quotes, a comment straight
 *   after the closing quote, single quotes inside double ones, and a quote that never closes.
 *   `named` is the value a refusal names, which is the value after the quotes come off.
 * - The last two came from the second review the same day: a lone `\r` that ends the file, and
 *   `\r\r\n`, a CRLF file converted twice. The dashboard's line pattern skipped both.
 * - And the last from the fourth: U+00A0 before the comment, a no-break space pasted from a web
 *   page. It is no blank to either reader, so the value is refused; JavaScript's `\s` took it
 *   for one and read off, while bash in the C locale refused.
 */
export type Expected = 'on' | 'off' | 'refused';

export type Row = { name: string; env: string; expected: Expected; named?: string };

export const ROWS: Row[] = [
  { name: '1', env: 'ENABLE_LIQUID=1\n', expected: 'on' },
  { name: 'absent', env: 'ENABLE_OPENCLAW=1\n', expected: 'on' },
  { name: 'empty', env: 'ENABLE_LIQUID=\n', expected: 'on' },
  { name: 'double-quoted 1', env: 'ENABLE_LIQUID="1"\n', expected: 'on' },
  { name: '1 with a comment', env: 'ENABLE_LIQUID=1 # on\n', expected: 'on' },
  { name: '0', env: 'ENABLE_LIQUID=0\n', expected: 'off' },
  { name: "single-quoted 0", env: "ENABLE_LIQUID='0'\n", expected: 'off' },
  { name: '0 with a comment', env: 'ENABLE_LIQUID=0 # off\n', expected: 'off' },
  { name: '0 with a carriage return', env: 'ENABLE_LIQUID=0\r\n', expected: 'off' },
  { name: 'yes', env: 'ENABLE_LIQUID=yes\n', expected: 'refused' },
  { name: 'capital O', env: 'ENABLE_LIQUID=O\n', expected: 'refused' },
  { name: '2', env: 'ENABLE_LIQUID=2\n', expected: 'refused' },
  { name: 'off', env: 'ENABLE_LIQUID=off\n', expected: 'refused' },
  { name: 'true', env: 'ENABLE_LIQUID=true\n', expected: 'refused' },
  { name: 'twice, 0 then 1', env: 'ENABLE_LIQUID=0\nENABLE_LIQUID=1\n', expected: 'on' },
  { name: '0 with a tab before the comment', env: 'ENABLE_LIQUID=0\t# off\n', expected: 'off' },
  { name: 'blank before 0 inside the quotes', env: 'ENABLE_LIQUID=" 0"\n', expected: 'off' },
  { name: 'blank after 0 inside the quotes', env: 'ENABLE_LIQUID="0 "\n', expected: 'off' },
  { name: 'a comment straight after the closing quote', env: 'ENABLE_LIQUID="0"#x\n', expected: 'off' },
  { name: 'single quotes inside double', env: `ENABLE_LIQUID="'0'"\n`, expected: 'refused', named: "'0'" },
  { name: 'a quote that never closes', env: 'ENABLE_LIQUID="0\n', expected: 'refused', named: '"0' },
  { name: '0 and a lone carriage return, no newline', env: 'ENABLE_LIQUID=0\r', expected: 'off' },
  { name: '0 with two carriage returns', env: 'ENABLE_LIQUID=0\r\r\n', expected: 'off' },
  { name: 'a no-break space before the comment', env: 'ENABLE_LIQUID=0\u00a0# off\n', expected: 'refused', named: '0\u00a0# off' }
];

/**
 * `PRIVACY_PROXY_ENABLE`'s lines, for `lu_privacy_proxy_on` (CS-1) and for both readers at once
 * (CS-2). The value comes off its line by the switches' rule, and only `1` is on (decision 16).
 * `'1'` is the review's case on #56: the start read it as on and the dashboard as off. The two
 * doubled lines are the other disagreement, in which the start read the first line and the
 * dashboard the last. `yes`, `true` and `on` are there because `1` is the only value that ever
 * meant on for this key, and a reader that took them would start a proxy nobody switched on.
 */
export type PrivacyRow = { name: string; env: string; on: boolean };

export const PRIVACY_VALUES: PrivacyRow[] = [
  { name: '1', env: 'PRIVACY_PROXY_ENABLE=1\n', on: true },
  { name: "single-quoted 1", env: "PRIVACY_PROXY_ENABLE='1'\n", on: true },
  { name: 'double-quoted 1', env: 'PRIVACY_PROXY_ENABLE="1"\n', on: true },
  { name: '1 with a comment', env: 'PRIVACY_PROXY_ENABLE=1 # on\n', on: true },
  { name: 'twice, 0 then 1', env: 'PRIVACY_PROXY_ENABLE=0\nPRIVACY_PROXY_ENABLE=1\n', on: true },
  { name: 'absent', env: 'ENABLE_OPENCLAW=1\n', on: false },
  { name: 'empty', env: 'PRIVACY_PROXY_ENABLE=\n', on: false },
  { name: '0', env: 'PRIVACY_PROXY_ENABLE=0\n', on: false },
  { name: 'double-quoted 0', env: 'PRIVACY_PROXY_ENABLE="0"\n', on: false },
  { name: 'yes', env: 'PRIVACY_PROXY_ENABLE=yes\n', on: false },
  { name: 'true', env: 'PRIVACY_PROXY_ENABLE=true\n', on: false },
  { name: 'on', env: 'PRIVACY_PROXY_ENABLE=on\n', on: false },
  { name: 'twice, 1 then 0', env: 'PRIVACY_PROXY_ENABLE=1\nPRIVACY_PROXY_ENABLE=0\n', on: false }
];

/**
 * The keys the configuration page hides while their switch is off, exactly (CS-19). The
 * Liquid set is its authentication section and its per-image overrides; OpenClaw's is the
 * three sign-ins only it reads and its overrides, not `ENABLE_ANTHROPIC_CLAUDE_CODE`, which
 * OpenCode and the privacy-proxy build read too (decision 11); OpenCode's is its overrides.
 */
const overrides = (prefix: string) => [
  `${prefix}_SYSTEM_DEPENDENCIES`,
  `${prefix}_SYSTEM_DEPENDENCIES_MODE`,
  `${prefix}_POST_INSTALLATION_COMMANDS`,
  `${prefix}_POST_INSTALLATION_COMMANDS_MODE`
];
export const DEPENDENT_KEYS: Record<'liquid' | 'openclaw' | 'opencode', string[]> = {
  liquid: ['LIQUID_USERNAME', 'LIQUID_PASSWORD', 'LIQUID_KEYSTORE_PASSWORD', ...overrides('LIQUID')],
  openclaw: ['ENABLE_GITHUB_COPILOT', 'ENABLE_OPENAI_CODEX', 'ENABLE_XAI_GROK', ...overrides('OPENCLAW')],
  opencode: overrides('OPENCODE')
};

/** The switch of each component, as `.env` names it. */
export const SWITCH_KEYS = { liquid: 'ENABLE_LIQUID', openclaw: 'ENABLE_OPENCLAW', opencode: 'ENABLE_OPENCODE' } as const;

/** The value the shell reader is expected to name in its refusal, for a refused row. */
export function refusedValue(row: Row): string {
  return row.named ?? row.env.trim().split('=')[1];
}
