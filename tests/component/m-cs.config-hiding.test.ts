/**
 * M-CS · Component · The configuration page shows the switches first, and what has a reader
 *
 * Purpose:  Fields whose only reader is switched off invite edits that change nothing, so
 *           the page hides them while the switch is off in the saved `.env` -- and CS-17
 *           holds the other half, that the save keeps them. The switches themselves are the
 *           first decision an operator makes, so they are the first section the page shows.
 * Given:    `load` of `dashboard/src/routes/config/+page.server.ts`, through
 *           `configSections()` and `fieldsOf()` of `tests/lib/dashboardfixture.ts`, over the
 *           fixture project's `.env`.
 * When:     The view is read with all three switches on, then with each one at `0`.
 * Then:     The first section is `1. WHICH APPS TO RUN`, holding the three switches as
 *           checkboxes valued `1`; an empty switch and one written `'1'` are shown ticked too,
 *           since both read on -- shown unticked, they were saved as `0` by an unrelated Save
 *           (the local review of 2026-10-29). A value the start refuses, `O`, is shown ticked
 *           too, as the dashboard reads it, and carries a note naming it, since the next Save
 *           writes what the box shows (the second review of that day). With a switch off, none of its dependent keys is a field
 *           and every other field is; its per-image subheading goes with its fields, and so
 *           does a sign-in's subheading in section 8; with OpenClaw off
 *           `ENABLE_ANTHROPIC_CLAUDE_CODE` is still shown, and Liquid's whole section goes.
 *           With all on, every field of every shown section of `.env.example` is shown. The
 *           section's description says that a change takes effect at the next Start, since the
 *           launchpad already follows the saved `.env` (the review on #56). The privacy proxy's
 *           switch is shown by the reading every other reader uses (CS-FR16): `'1'` ticked and
 *           `yes` unticked. Shown unticked, the `'1'` the start ran was written `0` by the next
 *           Save (the local review of 2026-10-30).
 * Covers:   CS-16, CS-FR1, CS-FR12, CS-FR16
 * Negative: each switch off: its keys and its subheadings are absent from the view.
 * Counterpart: all on shows every field the file declares outside its hidden sections, so a
 *           filter that dropped too much cannot pass; and with one switch off the other
 *           components' fields stay.
 *
 * Test data: the dependent keys are CS-19's, stated in `tests/lib/component-values.ts`. The
 * subheadings looked for: `Liquid`, `OpenClaw`, `OpenCode` (the per-image overrides), and
 * `Use GitHub Copilot`, `Use a ChatGPT subscription`, `Use a Grok (xAI) subscription`
 * (section 8). The section that goes with Liquid: `Liquid AUTHENTICATION`. The `.env` is
 * `envFrom()` -- every flag `1` -- with the one switch at `0`; for the ticked rows,
 * `ENABLE_LIQUID=` and `ENABLE_OPENCODE='1'`, written as those bytes; and for the refused rows
 * `ENABLE_LIQUID=O`, appended to all on, whose note must read `ENABLE_LIQUID=O in .env is not a
 * switch value, and the start refuses it. Tick or untick it and save to set it.`, while no other
 * field -- every one holds a `fixture-` value that is no switch value either -- carries a note.
 * The privacy lines are `PRIVACY_PROXY_ENABLE='1'` and `PRIVACY_PROXY_ENABLE=yes`, each appended
 * to all on, so the last line decides. The description's last sentence: `A change takes effect at the next Start; the launchpad
 * shows it from the Save on.`
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { borrowSharedProject, configSections, fieldsOf, projectDir } from '../lib/dashboardfixture';
import { envFrom, fixtureValue, resetProject, writeEnv } from '../lib/gitproject';
import { DEPENDENT_KEYS, SWITCH_KEYS } from '../lib/component-values';
import { repoRoot } from '../lib/paths';
import { listFields, parseExample } from '../../dashboard/src/lib/env-file';

// The shared project and ENV_DIR go back as they were found, for the files after this one.
borrowSharedProject();

type Component = keyof typeof DEPENDENT_KEYS;

function view(off: Component | null, extra = '') {
  process.env.ENV_DIR = projectDir;
  resetProject(projectDir);
  writeEnv(projectDir, envFrom((key) => (off && key === SWITCH_KEYS[off] ? '0' : fixtureValue(key))) + extra);
  const sections = configSections();
  const subheadings: string[] = [];
  const walk = (items: any[]) => {
    for (const item of items) {
      if (item.kind === 'subheading') subheadings.push(item.text);
      if (item.kind === 'group') walk(item.items);
    }
  };
  sections.forEach((s) => walk(s.items));
  return {
    sections,
    keys: sections.flatMap((s) => fieldsOf(s).map((f) => f.key)),
    titles: sections.map((s) => s.title),
    subheadings
  };
}

const shownInFile = listFields(parseExample(readFileSync(join(repoRoot, '.env.example'), 'utf8')))
  .filter(({ section }) => section.mode !== 'hidden')
  .map(({ field }) => field.key);

const SUBHEADINGS: Record<Component, string[]> = {
  liquid: ['Liquid'],
  openclaw: ['OpenClaw', 'Use GitHub Copilot', 'Use a ChatGPT subscription', 'Use a Grok (xAI) subscription'],
  opencode: ['OpenCode']
};

beforeEach(() => {
  process.env.ENV_DIR = projectDir;
});

describe('CS-16 the configuration page shows what has a reader', () => {
  test('CS-16 and the section says that a change takes effect at the next Start', () => {
    const first = view(null).sections[0] as any;
    expect(first.description.endsWith('A change takes effect at the next Start; the launchpad shows it from the Save on.')).toBe(true);
  });

  test('CS-16 it opens with 1. WHICH APPS TO RUN and its three checkboxes', () => {
    const first = view(null).sections[0];
    expect(first.title).toBe('1. WHICH APPS TO RUN');
    expect(fieldsOf(first).map((f) => [f.key, f.type, f.value])).toEqual([
      ['ENABLE_LIQUID', 'checkbox', '1'],
      ['ENABLE_OPENCLAW', 'checkbox', '1'],
      ['ENABLE_OPENCODE', 'checkbox', '1']
    ]);
  });

  test('CS-16 and an empty switch, or one written \'1\', is shown ticked', () => {
    const first = view(null, "\nENABLE_LIQUID=\nENABLE_OPENCODE='1'\n").sections[0];
    expect(fieldsOf(first).map((f) => [f.key, f.value])).toEqual([
      ['ENABLE_LIQUID', '1'],
      ['ENABLE_OPENCLAW', '1'],
      ['ENABLE_OPENCODE', '1']
    ]);
  });

  test("CS-16 and the privacy proxy's switch written '1' is shown ticked, as every reader of it reads it", () => {
    const field = (extra: string) =>
      view(null, extra).sections.flatMap((s) => fieldsOf(s)).find((f) => f.key === 'PRIVACY_PROXY_ENABLE') as any;
    expect(field("\nPRIVACY_PROXY_ENABLE='1'\n").value).toBe('1');
    expect(field('\nPRIVACY_PROXY_ENABLE=yes\n').value).toBe('0');
  });

  test('CS-16 the negative: a value the start refuses is shown ticked, with a note saying so', () => {
    const first = view(null, '\nENABLE_LIQUID=O\n').sections[0];
    const liquid = fieldsOf(first).find((f) => f.key === 'ENABLE_LIQUID') as any;
    expect(liquid.value).toBe('1');
    expect(liquid.note).toBe('ENABLE_LIQUID=O in .env is not a switch value, and the start refuses it. Tick or untick it and save to set it.');
    const openclaw = fieldsOf(first).find((f) => f.key === 'ENABLE_OPENCLAW') as any;
    expect(openclaw.note).toBe('');
  });

  test('CS-16 the negative: no field but a switch carries that note, and none shows a value', () => {
    // The third local review of 2026-10-29: the note was written for every field whose value is
    // not 0 or 1 -- the fixture's every one -- and printed a password field's value in the clear.
    const fields = view(null, '\nENABLE_LIQUID=O\n').sections.flatMap((s) => fieldsOf(s) as any[]);
    expect(fields.length).toBeGreaterThan(50);
    expect(fields.filter((f) => f.note).map((f) => f.key)).toEqual(['ENABLE_LIQUID']);
    expect(fields.some((f) => String(f.note).includes('fixture-'))).toBe(false);
  });

  test('CS-16 the counterpart: with all on, every field the file shows is shown', () => {
    const all = view(null);
    expect(all.keys.sort()).toEqual([...shownInFile].sort());
    for (const subs of Object.values(SUBHEADINGS)) for (const s of subs) expect(all.subheadings).toContain(s);
  });

  for (const component of Object.keys(DEPENDENT_KEYS) as Component[]) {
    test(`CS-16 the negative: ${SWITCH_KEYS[component]}=0 hides its fields and subheadings, and only those`, () => {
      const seen = view(component);
      const hidden = DEPENDENT_KEYS[component];
      expect(seen.keys.filter((k) => hidden.includes(k))).toEqual([]);
      expect(seen.keys.sort()).toEqual(shownInFile.filter((k) => !hidden.includes(k)).sort());
      for (const s of SUBHEADINGS[component]) expect(seen.subheadings).not.toContain(s);
    });
  }

  test('CS-16 and with OpenClaw off, ENABLE_ANTHROPIC_CLAUDE_CODE is still shown', () => {
    expect(view('openclaw').keys).toContain('ENABLE_ANTHROPIC_CLAUDE_CODE');
  });

  test('CS-16 and with Liquid off, its authentication section goes, and the numbers close up', () => {
    const titles = view('liquid').titles;
    expect(titles.some((t) => t.includes('Liquid AUTHENTICATION'))).toBe(false);
    expect(titles.map((t) => Number(t.split('.')[0]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
