import { renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listFields, parseEnvValues, parseExample, renderEnv } from '$lib/env-file';
import {
  SYSTEM_PORT_DEFAULTS,
  dependentFields,
  dependsOn,
  fieldNote,
  inputType,
  isBuildAffecting,
  isCollapsedSection,
  isCollapsedSubheading,
  isSystemPort,
  numberShown,
  sectionDescription,
  sectionNote,
  selectOptions,
  subheadingDescription,
  visibleItems
} from '$lib/env-meta';
import {
  ENV_FILE,
  RESULT_FILE,
  installedComponents,
  isConfigured,
  readEnvFile
} from '$lib/server/project';
import {
  RENDERED_FIELD,
  afterEquals,
  decodeComponents,
  encodeComponents,
  privacyProxyOn,
  refusedSwitchNote,
  switchOf,
  switchValue
} from '$lib/component-switches';

function readState() {
  const { exampleText, envText } = readEnvFile();
  return { exampleText, sections: parseExample(exampleText), envValues: parseEnvValues(envText) };
}

function autogenValue(): string {
  return randomBytes(24).toString('base64url');
}

export const load: PageServerLoad = () => {
  const { sections, envValues } = readState();
  // From the saved .env, not from the form: a switch ticked on the page hides or shows its
  // fields after Save, so what a submit carries never changes under the operator's hand.
  const on = installedComponents(envValues);
  // A switch shows what the start reads, so an empty value or `'1'` is ticked: a box shown
  // unticked would be saved as 0 and switch the component off on an unrelated Save.
  const shownValue = (key: string, fallback: string) => {
    const component = switchOf(key);
    if (component) return on[component] ? '1' : '0';
    // The privacy proxy's switch too, as every other reader of it does (CS-FR16): shown
    // unticked, a hand-quoted '1' that the start runs was written 0 by an unrelated Save.
    if (key === 'PRIVACY_PROXY_ENABLE') return privacyProxyOn(envValues) ? '1' : '0';
    return envValues.get(key)?.value ?? fallback;
  };
  const ui = sections
    .filter((s) => s.mode !== 'hidden' && s.items.some((i) => i.kind === 'field'))
    .filter((s) => {
      const component = dependsOn(s.title, null, '');
      return component === null || on[component];
    })
    .map((s) => {
      const items = visibleItems(s.title, s.items, on).map((item) =>
        item.kind === 'field'
          ? {
              kind: 'field' as const,
              key: item.field.key,
              help: item.field.help,
              type: inputType(item.field.key, item.field.inlineComment),
              options: selectOptions(item.field.key, item.field.inlineComment),
              buildAffecting: isBuildAffecting(item.field.key),
              value: shownValue(item.field.key, item.field.defaultValue),
              note: refusedSwitchNote(envValues, item.field.key) || fieldNote(item.field.key, on)
            }
          : item
      );

      // Fold everything after a collapsing subheading into a nested group.
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
        note: sectionNote(s.title, on),
        items: grouped
      };
    });
  return { sections: numberShown(ui), configured: isConfigured(), rendered: encodeComponents(on) };
};

export const actions: Actions = {
  save: async ({ request }) => {
    const fd = await request.formData();
    const { exampleText, sections, envValues } = readState();

    // System ports are set on first setup and locked after, so the first save
    // (before any secret exists) is the only one allowed to set them.
    const configured = Boolean(envValues.get('DATABASE_PASSWORD')?.value);

    // The fields the page did not show, judged by the switches it was rendered with, which the
    // form carries; a submit does not carry those fields, and an unsubmitted checkbox would
    // otherwise be written 0 (CS-17). Without the field -- a page from before it existed --
    // the .env as it is now stands in.
    const rendered = decodeComponents(fd.get(RENDERED_FIELD)?.toString());
    const on = rendered ?? installedComponents(envValues);
    const dependent = dependentFields(sections);

    let rebuild = false;
    const final = new Map<string, { value: string; quoted: boolean }>();
    for (const { section, field } of listFields(sections)) {
      const key = field.key;
      const cur = envValues.get(key);
      const component = dependent.get(key);
      let value: string;
      // A page rendered before the switches existed carries neither them nor the field, and
      // would otherwise write all three as unticked checkboxes, 0, switching everything off.
      const unrendered = rendered === null && switchOf(key) !== null;
      if (unrendered) {
        // Kept as the start reads it: `'1'` re-rendered from its parsed value would come out
        // as `"'1'"`, which the start refuses. A refused value is written back from its parsed
        // value, which may quote it, and stays refused.
        const raw = afterEquals(envValues, key);
        const read = raw === undefined ? field.defaultValue : switchValue(raw);
        value = read === '' || read === '0' || read === '1' ? read : (cur?.value ?? field.defaultValue);
      } else if (section.mode === 'hidden' || (component !== undefined && !on[component])) {
        value = cur?.value ?? field.defaultValue;
      } else if (inputType(key) === 'checkbox') {
        value = fd.has(key) ? '1' : '0';
      } else {
        value = (fd.get(key)?.toString() ?? cur?.value ?? field.defaultValue).trim();
      }
      if (section.mode === 'autogenerate' && value === '') value = autogenValue();

      // System ports: keep the established value once configured (ignore
      // submitted changes); fall back to the default if first setup left empty.
      if (isSystemPort(key)) {
        if (configured) value = cur?.value || SYSTEM_PORT_DEFAULTS[key];
        else if (value === '') value = SYSTEM_PORT_DEFAULTS[key];
      }
      if (isBuildAffecting(key) && value !== (cur?.value ?? field.defaultValue)) rebuild = true;
      final.set(key, { value, quoted: field.quoted || (cur?.quoted ?? false) });
    }

    // .env-only keys are preserved verbatim.
    const customRaw: string[] = [];
    for (const [key, info] of envValues) if (!final.has(key)) customRaw.push(info.raw);

    const out = renderEnv(exampleText, final, customRaw);
    const tmp = ENV_FILE + '.tmp';
    writeFileSync(tmp, out);
    renameSync(tmp, ENV_FILE);

    // Read by run.sh after the container exits to repeat the instructions in
    // the terminal.
    writeFileSync(RESULT_FILE, `saved=1\nrebuild=${rebuild ? 1 : 0}\n`);

    redirect(303, `/done?rebuild=${rebuild ? 1 : 0}${configured ? '' : '&first=1'}`);
  },

  // Re-render the form with one field replaced by a fresh secret; nothing
  // written until the user saves.
  generate: async ({ request }) => {
    const fd = await request.formData();
    const target = fd.get('__generate')?.toString() ?? '';
    const values: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (k !== '__generate') values[k] = v.toString();
    if (target) values[target] = autogenValue();
    return { values };
  }
};
