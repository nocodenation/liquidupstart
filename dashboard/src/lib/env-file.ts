// Parse and re-render the project's .env / .env.example.
//
// .env.example is the schema source of truth: `# ===` banner blocks delimit
// sections, comment runs become section docs or per-field help, and the
// values are the defaults. .env only contributes current values. Saving
// re-renders the .env.example text with the user's values substituted, so
// comments, ordering and quoting are preserved; keys that exist only in .env
// are appended verbatim at the end.

import { sectionModeFromTitle, type SectionMode } from './env-meta';

export interface FieldSpec {
  key: string;
  /** contiguous comment lines directly above the key */
  help: string[];
  defaultValue: string;
  quoted: boolean;
}

export type SectionItem =
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'subheading'; text: string }
  | { kind: 'field'; field: FieldSpec };

export interface Section {
  title: string;
  displayTitle: string;
  mode: SectionMode;
  items: SectionItem[];
}

export interface ValueInfo {
  value: string;
  quoted: boolean;
  /** the original line, verbatim */
  raw: string;
}

const KEY_RE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;
const BANNER_RE = /^#\s*={3,}\s*$/;
const DASH_LINE_RE = /^#\s*-{3,}\s*$/;
const DASH_HEADING_RE = /^#\s*-{2,}\s*(.*?\S)\s*-{2,}\s*$/;

function splitValue(rawAfterEq: string): { value: string; quoted: boolean; inlineComment: string } {
  const trimmed = rawAfterEq.trim();
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1);
    if (end !== -1) {
      const rest = trimmed.slice(end + 1).trim();
      return {
        value: trimmed.slice(1, end),
        quoted: true,
        inlineComment: rest.startsWith('#') ? rest : ''
      };
    }
  }
  const hashIdx = trimmed.indexOf(' #');
  if (hashIdx !== -1) {
    return {
      value: trimmed.slice(0, hashIdx).trim(),
      quoted: false,
      inlineComment: trimmed.slice(hashIdx + 1).trim()
    };
  }
  return { value: trimmed, quoted: false, inlineComment: '' };
}

export function parseExample(text: string): Section[] {
  const sections: Section[] = [];
  let cur: Section = { title: '', displayTitle: '', mode: 'normal', items: [] };
  let pending: string[] = [];

  const flushParagraph = () => {
    if (pending.length > 0) {
      cur.items.push({ kind: 'paragraph', lines: pending });
      pending = [];
    }
  };
  const pushSection = () => {
    if (cur.title !== '' || cur.items.length > 0) sections.push(cur);
  };

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (BANNER_RE.test(line)) {
      // A section header is a banner line, one or more comment lines, and a
      // closing banner line. A banner not in that shape (e.g. the decorative
      // line closing the file intro) is just a separator.
      let j = i + 1;
      const titleLines: string[] = [];
      while (j < lines.length && lines[j].startsWith('#') && !BANNER_RE.test(lines[j])) {
        titleLines.push(lines[j].replace(/^#\s?/, ''));
        j++;
      }
      if (titleLines.length > 0 && j < lines.length && BANNER_RE.test(lines[j])) {
        flushParagraph();
        pushSection();
        const title = titleLines.join(' ').trim();
        const { mode, displayTitle } = sectionModeFromTitle(title);
        cur = { title, displayTitle, mode, items: [] };
        i = j;
      } else {
        flushParagraph();
      }
      continue;
    }

    if (DASH_LINE_RE.test(line)) {
      // An all-dash comment underlines the single pending comment line as a
      // heading; otherwise it just separates paragraphs.
      if (pending.length === 1) {
        cur.items.push({ kind: 'subheading', text: pending[0].trim() });
        pending = [];
      } else {
        flushParagraph();
      }
      continue;
    }

    const dashHeading = line.match(DASH_HEADING_RE);
    if (dashHeading && !/^-+$/.test(dashHeading[1])) {
      flushParagraph();
      cur.items.push({ kind: 'subheading', text: dashHeading[1] });
      continue;
    }

    if (line.startsWith('#')) {
      pending.push(line.replace(/^#\s?/, ''));
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      continue;
    }

    const kv = line.match(KEY_RE);
    if (kv) {
      const { value, quoted } = splitValue(kv[2]);
      cur.items.push({
        kind: 'field',
        field: { key: kv[1], help: pending, defaultValue: value, quoted }
      });
      pending = [];
      continue;
    }

    // Anything else (unexpected) is treated as a paragraph separator.
    flushParagraph();
  }

  flushParagraph();
  pushSection();
  return sections;
}

export function listFields(sections: Section[]): { section: Section; field: FieldSpec }[] {
  const out: { section: Section; field: FieldSpec }[] = [];
  for (const section of sections)
    for (const item of section.items)
      if (item.kind === 'field') out.push({ section, field: item.field });
  return out;
}

/** Last occurrence wins, like docker compose env parsing. */
export function parseEnvValues(text: string): Map<string, ValueInfo> {
  const values = new Map<string, ValueInfo>();
  for (const line of text.split('\n')) {
    const kv = line.match(KEY_RE);
    if (!kv) continue;
    const { value, quoted } = splitValue(kv[2]);
    values.set(kv[1], { value, quoted, raw: line });
  }
  return values;
}

export function formatValue(value: string, quoted: boolean): string {
  if (!quoted && !/[\s#'"]/.test(value)) return value;
  return '"' + value.replaceAll('"', '\\"') + '"';
}

export function renderEnv(
  exampleText: string,
  values: Map<string, { value: string; quoted: boolean }>,
  customRawLines: string[]
): string {
  const lines = exampleText.split('\n').map((line) => {
    const kv = line.match(KEY_RE);
    if (!kv) return line;
    const v = values.get(kv[1]);
    if (v === undefined) return line;
    const { inlineComment } = splitValue(kv[2]);
    return `${kv[1]}=${formatValue(v.value, v.quoted)}${inlineComment ? ' ' + inlineComment : ''}`;
  });

  let out = lines.join('\n');
  if (customRawLines.length > 0) {
    if (!out.endsWith('\n')) out += '\n';
    out +=
      '\n# =============================================================================\n' +
      '# CUSTOM KEYS (not present in .env.example, preserved by the dashboard)\n' +
      '# =============================================================================\n' +
      customRawLines.join('\n') +
      '\n';
  }
  return out;
}
