import { join } from 'node:path';
import { newProject } from './gitproject';
import { ROUTES, Redirect, redirectFrom } from './svelte';

export const projectDir = newProject('lu-a8-project-');
process.env.ENV_DIR = projectDir;

export const launchpad = await import(join(ROUTES, '+page.server.ts'));
export const configView = await import(join(ROUTES, 'config', '+page.server.ts'));
export const gitAuth = await import(join(ROUTES, 'git-auth', '+server.ts'));

export type ViewField = {
  kind: 'field';
  key: string;
  help: string[];
  type: string;
  value: string;
};

export type ViewSection = {
  title: string;
  description: string;
  autogen: boolean;
  collapsed: boolean;
  items: any[];
};

export function configSections(): ViewSection[] {
  return (configView.load() as { sections: ViewSection[] }).sections;
}

export function fieldsOf(section: ViewSection): ViewField[] {
  const found: ViewField[] = [];
  const walk = (items: any[]) => {
    for (const item of items) {
      if (item.kind === 'field') found.push(item);
      else if (item.kind === 'group') walk(item.items);
    }
  };
  walk(section.items);
  return found;
}

export function sectionTitled(fragment: string): ViewSection {
  const section = configSections().find((s) => s.title.includes(fragment));
  if (!section) throw new Error(`no configuration section matching "${fragment}"`);
  return section;
}

export function submittedForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (const section of configSections()) {
    for (const field of fieldsOf(section)) {
      const value = overrides[field.key] ?? field.value;
      if (field.type === 'checkbox') {
        if (value === '1') fd.set(field.key, 'on');
      } else {
        fd.set(field.key, value);
      }
    }
  }
  return fd;
}

export async function saveConfig(fd: FormData): Promise<Redirect> {
  try {
    await configView.actions.save({
      request: new Request('http://localhost/config?/save', { method: 'POST', body: fd })
    });
  } catch (err) {
    const redirect = redirectFrom(err);
    if (redirect) return redirect;
    throw err;
  }
  throw new Error('save did not redirect');
}

export async function launchpadData(): Promise<any> {
  return await launchpad.load({} as any);
}

export async function retry(name: unknown): Promise<{ status: number; body: any }> {
  const res = await gitAuth.POST({
    request: new Request('http://localhost/git-auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name })
    })
  } as any);
  return { status: res.status, body: await res.json() };
}
