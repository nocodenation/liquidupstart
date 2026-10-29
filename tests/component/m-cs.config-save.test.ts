/**
 * M-CS · Component · The save keeps what the page did not show
 *
 * Purpose:  The save writes an unsubmitted checkbox as `0`
 *           (`dashboard/src/routes/config/+page.server.ts`), and a browser submits only the
 *           fields it was shown. So hiding a checkbox without a rule for the save would turn
 *           it off at the next save: an operator who switched OpenClaw off for a week would
 *           come back to find Copilot, Codex and Grok all switched off too. The rule judges
 *           by the `.env` the page was rendered from, not by the switch the form carries,
 *           so switching a component on and off in the same save changes no hidden field.
 *           And a switch is not build-affecting (decision 10).
 * Given:    `actions.save`, through `saveConfig(submittedForm(…))` of
 *           `tests/lib/dashboardfixture.ts`, which submits what the rendered view shows,
 *           checkboxes only when ticked, exactly as a browser does; the written `.env`
 *           read back line by line.
 * When:     One save per row below.
 * Then:     (a) the hidden sign-ins stay `1` and the hidden Liquid password stays as it was;
 *           (b) so do they when OpenClaw is ticked in the same save; (c) a shown checkbox
 *           left unticked is written `0`; (d) switching OpenClaw off in the same save takes
 *           what the form carried; (e) changing a switch redirects with `rebuild=0`; (f) a page
 *           rendered with OpenClaw off keeps its hidden sign-ins even when another tab switched
 *           OpenClaw on before this one saved, because the form carries the switches it was
 *           drawn with; (g) a form without that field falls back to the `.env` as it is now;
 *           (h) an empty switch, shown ticked, is saved as `1`; (i) a page rendered before the
 *           switches existed, which carries neither them nor the field, keeps all three as they
 *           are instead of writing three unticked checkboxes, `0` (the second local review of
 *           2026-10-29); (j) such a form that does carry a switch is not believed about it;
 *           (k) it leaves a refused value refused; (l) it keeps a switch as the start reads it,
 *           so `'1'` is written `1` and `0` with a tab before its comment `0`, not re-quoted
 *           into a value the start refuses (the third and fourth reviews of that day).
 * Covers:   CS-17, CS-FR12, CS-FR8
 * Negative: (a) and (b), where a missing rule writes `ENABLE_GITHUB_COPILOT=0`; (e); (f), the
 *           race the local review of 2026-10-29 found; and (h).
 * Counterpart: (c) and (d), so a save that kept every value whatever the form said cannot
 *           pass; and (g), which shows (f) depends on the field and not on luck.
 *
 * Test data: every `.env` starts from `envFrom()`, every flag `1`, then: (a) and (b)
 * `ENABLE_OPENCLAW=0`, `ENABLE_GITHUB_COPILOT=1`, `ENABLE_XAI_GROK=1`, `ENABLE_LIQUID=0`,
 * `LIQUID_PASSWORD="kept-while-liquid-is-off"` -- chosen to differ from `.env.example`'s
 * `liquidpassword`, so a reset to the default shows; (a)'s form as rendered, (b)'s with
 * `ENABLE_OPENCLAW` ticked. (c) `ENABLE_OPENCLAW=1`, `ENABLE_GITHUB_COPILOT=1`, form with
 * Copilot unticked. (d) the same `.env`, form with `ENABLE_OPENCLAW` and Copilot both
 * unticked: the form carries Copilot `0` and the file holds `1`, so the two rules give
 * different answers. (e) all on, form with `ENABLE_OPENCODE` unticked. (f) and (g) render the
 * page from (a)'s `.env`, then write `ENABLE_OPENCLAW=1` to the file before saving that form,
 * with the hidden `__components` field (f) and without it (g). (h) `ENABLE_LIQUID=` (empty).
 * (i) `ENABLE_OPENCODE=0`, form without `__components` and without the three switches. (j) the
 * same `.env`, form without `__components` and with `ENABLE_OPENCODE` ticked; expected
 * `ENABLE_OPENCODE=0`. (k) `ENABLE_LIQUID=O`, form as (i); expected `ENABLE_LIQUID=O`. (l) all on,
 * then `ENABLE_OPENCODE='1'` and `ENABLE_LIQUID=0`, a tab and `# off` appended as lines, form as
 * (i); expected `ENABLE_LIQUID=0`, `ENABLE_OPENCODE=1`.
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { borrowSharedProject, projectDir, saveConfig, submittedForm } from '../lib/dashboardfixture';
import { writeFileSync } from 'node:fs';
import { envFrom, fixtureValue, rawLines, resetProject, writeEnv } from '../lib/gitproject';

// The shared project and ENV_DIR go back as they were found, for the files after this one.
borrowSharedProject();

const PASSWORD = 'kept-while-liquid-is-off';

function installed(values: Record<string, string>) {
  process.env.ENV_DIR = projectDir;
  resetProject(projectDir);
  writeEnv(projectDir, envFrom((key) => values[key] ?? fixtureValue(key)));
}

const saved = () => rawLines(readFileSync(join(projectDir, '.env'), 'utf8'));
const OFF_FOR_A_WEEK = {
  ENABLE_OPENCLAW: '0',
  ENABLE_GITHUB_COPILOT: '1',
  ENABLE_XAI_GROK: '1',
  ENABLE_LIQUID: '0',
  LIQUID_PASSWORD: PASSWORD
};

beforeEach(() => {
  process.env.ENV_DIR = projectDir;
});

describe('CS-17 the save keeps what it did not show', () => {
  test('CS-17 the negative (a): with OpenClaw and Liquid off, their hidden fields keep their values', async () => {
    installed(OFF_FOR_A_WEEK);
    await saveConfig(submittedForm());
    const lines = saved();
    expect(lines.get('ENABLE_GITHUB_COPILOT')).toBe('ENABLE_GITHUB_COPILOT=1');
    expect(lines.get('ENABLE_XAI_GROK')).toBe('ENABLE_XAI_GROK=1');
    expect(lines.get('LIQUID_PASSWORD')).toBe(`LIQUID_PASSWORD="${PASSWORD}"`);
  });

  test('CS-17 the negative (b): switching OpenClaw on in the same save keeps them too', async () => {
    installed(OFF_FOR_A_WEEK);
    await saveConfig(submittedForm({ ENABLE_OPENCLAW: '1' }));
    const lines = saved();
    expect(lines.get('ENABLE_OPENCLAW')).toBe('ENABLE_OPENCLAW=1');
    expect(lines.get('ENABLE_GITHUB_COPILOT')).toBe('ENABLE_GITHUB_COPILOT=1');
    expect(lines.get('ENABLE_XAI_GROK')).toBe('ENABLE_XAI_GROK=1');
  });

  test('CS-17 the counterpart (c): with OpenClaw on, a shown checkbox left unticked is written 0', async () => {
    installed({ ENABLE_OPENCLAW: '1', ENABLE_GITHUB_COPILOT: '1' });
    await saveConfig(submittedForm({ ENABLE_GITHUB_COPILOT: '0' }));
    expect(saved().get('ENABLE_GITHUB_COPILOT')).toBe('ENABLE_GITHUB_COPILOT=0');
  });

  test('CS-17 the counterpart (d): switching OpenClaw off in the same save takes what the form carried', async () => {
    installed({ ENABLE_OPENCLAW: '1', ENABLE_GITHUB_COPILOT: '1' });
    await saveConfig(submittedForm({ ENABLE_OPENCLAW: '0', ENABLE_GITHUB_COPILOT: '0' }));
    const lines = saved();
    expect(lines.get('ENABLE_OPENCLAW')).toBe('ENABLE_OPENCLAW=0');
    expect(lines.get('ENABLE_GITHUB_COPILOT')).toBe('ENABLE_GITHUB_COPILOT=0');
  });

  test('CS-17 the negative (f): another tab switching OpenClaw on does not wipe this page\'s hidden fields', async () => {
    installed(OFF_FOR_A_WEEK);
    const form = submittedForm();
    expect(form.get('__components')).toBe('liquid=0,openclaw=0,opencode=1');
    const file = join(projectDir, '.env');
    writeFileSync(file, readFileSync(file, 'utf8').replace(/^ENABLE_OPENCLAW=0$/m, 'ENABLE_OPENCLAW=1'));
    await saveConfig(form);
    expect(saved().get('ENABLE_GITHUB_COPILOT')).toBe('ENABLE_GITHUB_COPILOT=1');
    expect(saved().get('ENABLE_XAI_GROK')).toBe('ENABLE_XAI_GROK=1');
  });

  test('CS-17 the counterpart (g): without the field, the .env as it is now decides', async () => {
    installed(OFF_FOR_A_WEEK);
    const form = submittedForm();
    form.delete('__components');
    const file = join(projectDir, '.env');
    writeFileSync(file, readFileSync(file, 'utf8').replace(/^ENABLE_OPENCLAW=0$/m, 'ENABLE_OPENCLAW=1'));
    await saveConfig(form);
    expect(saved().get('ENABLE_GITHUB_COPILOT')).toBe('ENABLE_GITHUB_COPILOT=0');
  });

  test('CS-17 the negative (h): an empty switch, shown ticked, is saved as 1', async () => {
    installed({ ENABLE_LIQUID: '' });
    expect(saved().get('ENABLE_LIQUID')).toBe('ENABLE_LIQUID=');
    await saveConfig(submittedForm());
    expect(saved().get('ENABLE_LIQUID')).toBe('ENABLE_LIQUID=1');
  });

  test('CS-17 the negative (i): a page from before the switches keeps them, whatever it carries', async () => {
    installed({ ENABLE_OPENCODE: '0' });
    const form = submittedForm();
    for (const key of ['__components', 'ENABLE_LIQUID', 'ENABLE_OPENCLAW', 'ENABLE_OPENCODE']) form.delete(key);
    await saveConfig(form);
    const lines = saved();
    expect([lines.get('ENABLE_LIQUID'), lines.get('ENABLE_OPENCLAW'), lines.get('ENABLE_OPENCODE')]).toEqual([
      'ENABLE_LIQUID=1',
      'ENABLE_OPENCLAW=1',
      'ENABLE_OPENCODE=0'
    ]);
  });

  test('CS-17 and ignores a switch such a form does carry, since it cannot say what it showed', async () => {
    installed({ ENABLE_OPENCODE: '0' });
    const form = submittedForm({ ENABLE_OPENCODE: '1' });
    form.delete('__components');
    expect(form.get('ENABLE_OPENCODE')).toBe('on');
    await saveConfig(form);
    expect(saved().get('ENABLE_OPENCODE')).toBe('ENABLE_OPENCODE=0');
  });

  test('CS-17 and leaves a value the start refuses refused, rather than switching it on', async () => {
    installed({ ENABLE_LIQUID: 'O' });
    const form = submittedForm();
    for (const key of ['__components', 'ENABLE_LIQUID', 'ENABLE_OPENCLAW', 'ENABLE_OPENCODE']) form.delete(key);
    await saveConfig(form);
    expect(saved().get('ENABLE_LIQUID')).toBe('ENABLE_LIQUID=O');
  });

  test('CS-17 and keeps them as the start reads them, not re-quoted into a refusal', async () => {
    // The third local review of 2026-10-29: `'1'` came back as `"'1'"`, which the start refuses.
    installed({});
    const file = join(projectDir, '.env');
    writeFileSync(file, `${readFileSync(file, 'utf8')}\nENABLE_OPENCODE='1'\nENABLE_LIQUID=0\t# off\n`);
    const form = submittedForm();
    for (const key of ['__components', 'ENABLE_LIQUID', 'ENABLE_OPENCLAW', 'ENABLE_OPENCODE']) form.delete(key);
    await saveConfig(form);
    const lines = saved();
    expect([lines.get('ENABLE_LIQUID'), lines.get('ENABLE_OPENCODE')]).toEqual(['ENABLE_LIQUID=0', 'ENABLE_OPENCODE=1']);
  });

  test('CS-17 the negative (e): changing a switch redirects with rebuild=0', async () => {
    installed({});
    const redirect = await saveConfig(submittedForm({ ENABLE_OPENCODE: '0' }));
    expect(redirect.location).toBe('/done?rebuild=0');
    expect(saved().get('ENABLE_OPENCODE')).toBe('ENABLE_OPENCODE=0');
  });
});
