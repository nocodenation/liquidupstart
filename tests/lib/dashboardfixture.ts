import { afterAll } from 'bun:test';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  // The hidden field the page renders with the switches it was drawn with (#50, CS-17), which
  // a browser submits with the rest.
  const rendered = (configView.load() as { rendered?: string }).rendered;
  if (rendered !== undefined) fd.set('__components', rendered);
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

/**
 * Puts the shared project's `.env` and `ENV_DIR` back as the calling file found them, once its
 * cases are done -- those two and nothing else: a file that calls `resetProject` has emptied the
 * rest of the directory, as every user of this project does. `bun test` runs every file in one
 * process, and what a file leaves behind is what the next one reads: the pairing route reads
 * `ENV_DIR` at each request, so a file that ended with this project's `.env` switching OpenClaw
 * off turned OC-72's listing into the switched-off answer, measured 2026-10-29 when #50's
 * component cases were first run with it. Call it at a file's top level.
 */
export function borrowSharedProject(): void {
  const env = join(projectDir, '.env');
  const previous = { dir: process.env.ENV_DIR, env: existsSync(env) ? readFileSync(env, 'utf8') : null };
  afterAll(() => {
    if (previous.env === null) rmSync(env, { force: true });
    else writeFileSync(env, previous.env);
    if (previous.dir === undefined) delete process.env.ENV_DIR;
    else process.env.ENV_DIR = previous.dir;
  });
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
