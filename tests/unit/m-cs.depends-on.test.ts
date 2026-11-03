/**
 * M-CS · Unit · Exactly these keys depend on a switch
 *
 * Purpose:  `dependsOn` matches section titles and subheadings by pattern, so a field added
 *           later to a dependent section or under a dependent subheading is hidden too --
 *           which may or may not be meant. Pinning the resulting key sets over the real
 *           `.env.example` makes that a visible change instead of a silent one. And the one
 *           key of section 8 that must not follow OpenClaw is checked by name.
 * Given:    `dependentFields()` and `dependsOn()` from `dashboard/src/lib/env-meta.ts`, over
 *           every section `parseExample` finds in the repository's `.env.example`.
 * When:     The fields are grouped by the component they depend on.
 * Then:     The three sets are exactly `DEPENDENT_KEYS` of `tests/lib/component-values.ts`,
 *           and every other field depends on nothing.
 * Covers:   CS-19, CS-FR12
 * Negative: `ENABLE_ANTHROPIC_CLAUDE_CODE` (decision 11), the shared `SYSTEM_DEPENDENCIES`,
 *           `GIT_REPOSITORIES` and `PRIVACY_PROXY_ENABLE` (decision 4), Hermes' overrides,
 *           and the three switches themselves depend on nothing.
 * Counterpart: the three sets are not empty and each is exactly as stated, so a
 *           `dependsOn` that answered null for everything cannot pass.
 *
 * Test data: the sets, stated in `tests/lib/component-values.ts`: Liquid --
 * `LIQUID_USERNAME`, `LIQUID_PASSWORD`, `LIQUID_KEYSTORE_PASSWORD` and the four
 * `LIQUID_*` overrides; OpenClaw -- `ENABLE_GITHUB_COPILOT`, `ENABLE_OPENAI_CODEX`,
 * `ENABLE_XAI_GROK` and the four `OPENCLAW_*` overrides; OpenCode -- the four `OPENCODE_*`
 * overrides. The overrides are `<P>_SYSTEM_DEPENDENCIES`, `<P>_SYSTEM_DEPENDENCIES_MODE`,
 * `<P>_POST_INSTALLATION_COMMANDS` and `<P>_POST_INSTALLATION_COMMANDS_MODE`.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { DEPENDENT_KEYS } from '../lib/component-values';
import { listFields, parseExample } from '../../dashboard/src/lib/env-file';
import { dependentFields, dependsOn } from '../../dashboard/src/lib/env-meta';

const sections = parseExample(readFileSync(join(repoRoot, '.env.example'), 'utf8'));
const dependent = dependentFields(sections);
const keysOf = (component: string) => [...dependent].filter(([, c]) => c === component).map(([k]) => k).sort();

describe('CS-19 exactly these keys depend on a switch', () => {
  for (const [component, keys] of Object.entries(DEPENDENT_KEYS)) {
    test(`CS-19 ${component}: exactly its stated keys`, () => {
      expect(keys.length).toBeGreaterThan(0);
      expect(keysOf(component)).toEqual([...keys].sort());
    });
  }

  test('CS-19 the negative: every other field depends on nothing', () => {
    const stated = new Set(Object.values(DEPENDENT_KEYS).flat());
    const others = listFields(sections).map((f) => f.field.key).filter((k) => !stated.has(k));
    expect(others.length).toBeGreaterThan(50);
    expect(others.filter((k) => dependent.has(k))).toEqual([]);
    for (const key of [
      'ENABLE_ANTHROPIC_CLAUDE_CODE',
      'SYSTEM_DEPENDENCIES',
      'GIT_REPOSITORIES',
      'PRIVACY_PROXY_ENABLE',
      'HERMES_SYSTEM_DEPENDENCIES',
      'ENABLE_LIQUID',
      'ENABLE_OPENCLAW',
      'ENABLE_OPENCODE'
    ]) {
      expect(others, key).toContain(key);
    }
  });

  test('CS-19 and dependsOn answers by section, then subheading, then key', () => {
    expect(dependsOn('9. Liquid AUTHENTICATION', null, 'ANY_KEY')).toBe('liquid');
    expect(dependsOn('10. IMAGE BUILD CONFIGURATION (used by build.sh)', 'OpenCode', 'ANY_KEY')).toBe('opencode');
    expect(dependsOn('8. OPENCLAW CONFIGURATION', 'Use GitHub Copilot', 'ENABLE_GITHUB_COPILOT')).toBe('openclaw');
    expect(dependsOn('8. OPENCLAW CONFIGURATION', 'Use a Claude (Anthropic) subscription', 'ENABLE_ANTHROPIC_CLAUDE_CODE')).toBeNull();
    expect(dependsOn('10. IMAGE BUILD CONFIGURATION (used by build.sh)', 'Hermes', 'HERMES_SYSTEM_DEPENDENCIES')).toBeNull();
  });
});
