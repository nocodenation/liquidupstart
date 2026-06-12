import { renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listFields, parseEnvValues, parseExample, renderEnv } from '$lib/env-file';
import {
  inputType,
  isBuildAffecting,
  isCollapsedSection,
  isCollapsedSubheading,
  sectionDescription,
  subheadingDescription
} from '$lib/env-meta';
import { ENV_FILE, RESULT_FILE, isConfigured, readEnvFile } from '$lib/server/project';

function readState() {
  const { exampleText, envText } = readEnvFile();
  return { exampleText, sections: parseExample(exampleText), envValues: parseEnvValues(envText) };
}

function randomSecret(): string {
  return randomBytes(24).toString('base64url');
}

export const load: PageServerLoad = () => {
  const { sections, envValues } = readState();
  const ui = sections
    .filter((s) => s.mode !== 'hidden' && s.items.some((i) => i.kind === 'field'))
    .map((s) => {
      const items = s.items.map((item) =>
        item.kind === 'field'
          ? {
              kind: 'field' as const,
              key: item.field.key,
              help: item.field.help,
              type: inputType(item.field.key),
              buildAffecting: isBuildAffecting(item.field.key),
              value: envValues.get(item.field.key)?.value ?? item.field.defaultValue
            }
          : item
      );

      // Fold everything after a collapsing subheading (e.g. PER-IMAGE
      // OVERRIDES) into a nested collapsed group.
      type UiItem = (typeof items)[number];
      type Group = { kind: 'group'; title: string; description: string; items: UiItem[] };
      const grouped: (UiItem | Group)[] = [];
      let group: Group | null = null;
      for (const item of items) {
        if (item.kind === 'subheading' && isCollapsedSubheading(item.text)) {
          group = { kind: 'group', title: item.text, description: '', items: [] };
          grouped.push(group);
          continue;
        }
        (group ? group.items : grouped).push(item);
      }

      const firstPara = (list: { kind: string }[]) => {
        const p = list.find((i) => i.kind === 'paragraph') as
          | { kind: 'paragraph'; lines: string[] }
          | undefined;
        return p ? p.lines.join(' ') : '';
      };
      for (const g of grouped) {
        if (g.kind === 'group') g.description = subheadingDescription(g.title, firstPara(g.items));
      }

      return {
        title: s.displayTitle,
        description: sectionDescription(s.title, firstPara(s.items)),
        autogen: s.mode === 'autogenerate',
        collapsed: s.mode === 'autogenerate' || isCollapsedSection(s.title),
        items: grouped
      };
    });
  return { sections: ui, configured: isConfigured() };
};

export const actions: Actions = {
  save: async ({ request }) => {
    const fd = await request.formData();
    const { exampleText, sections, envValues } = readState();

    let rebuild = false;
    const final = new Map<string, { value: string; quoted: boolean }>();
    for (const { section, field } of listFields(sections)) {
      const key = field.key;
      const cur = envValues.get(key);
      let value: string;
      if (section.mode === 'hidden') {
        value = cur?.value ?? field.defaultValue;
      } else if (inputType(key) === 'checkbox') {
        value = fd.has(key) ? '1' : '0';
      } else {
        value = (fd.get(key)?.toString() ?? cur?.value ?? field.defaultValue).trim();
      }
      if (section.mode === 'autogenerate' && value === '') value = randomSecret();
      if (isBuildAffecting(key) && value !== (cur?.value ?? field.defaultValue)) rebuild = true;
      final.set(key, { value, quoted: field.quoted || (cur?.quoted ?? false) });
    }

    // Keys present only in .env are preserved verbatim.
    const customRaw: string[] = [];
    for (const [key, info] of envValues) if (!final.has(key)) customRaw.push(info.raw);

    const out = renderEnv(exampleText, final, customRaw);
    const tmp = ENV_FILE + '.tmp';
    writeFileSync(tmp, out);
    renameSync(tmp, ENV_FILE);

    // Read by run.sh after the container exits, to repeat the
    // instructions in the terminal.
    writeFileSync(RESULT_FILE, `saved=1\nrebuild=${rebuild ? 1 : 0}\n`);

    redirect(303, `/done?rebuild=${rebuild ? 1 : 0}`);
  },

  // Re-render the form with one field replaced by a fresh secret; nothing is
  // written until the user saves.
  generate: async ({ request }) => {
    const fd = await request.formData();
    const target = fd.get('__generate')?.toString() ?? '';
    const values: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (k !== '__generate') values[k] = v.toString();
    if (target) values[target] = randomSecret();
    return { values };
  }
};
