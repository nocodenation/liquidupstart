/**
 * M-CS · Component · Places that need an agent say so when there is none
 *
 * Purpose:  Decision 4 of #50: what only matters to an agent is not hidden when both agents
 *           are off, because it is still the operator's to configure; it says that nothing
 *           will use it. A note that also appears with an agent on is noise (A8-26's rule),
 *           so each note is held to its condition both ways. Two notes need less than both
 *           agents off: the Claude field says what OpenClaw off means for it, and the Node
 *           app tile names the agent that can build the app.
 * Given:    `load` of the launchpad and of the configuration page, through
 *           `tests/lib/dashboardfixture.ts`, with a stub `docker` on `PATH` for the
 *           launchpad's `stackState()`; and `GitRepositories.svelte` mounted over the
 *           launchpad's `git` data, as A8-39 mounts it over `gitCard()`.
 * When:     Three `.env`s, each read through both loads and the mounted card.
 * Then:     (a) Both agents off: the repositories card, *GIT INTEGRATION*, the privacy tile,
 *           *PRIVACY PROXY* and *SELF-HOSTED LOCAL LLM* carry their notes, and the Node app
 *           tile says no agent is switched on. (b) OpenClaw off, OpenCode on: none of those
 *           notes; the Claude note on `ENABLE_ANTHROPIC_CLAUDE_CODE`; the Node app tile names
 *           OpenCode. (c) Both on: no note, and the Node app tile reads as today.
 * Covers:   CS-18, CS-FR13
 * Negative: (b) and (c) carry no both-agents-off note, and (c) no Claude note.
 * Counterpart: (a) carries all five and (b) the Claude note, so a load that wrote no note
 *           at all cannot pass.
 * Precondition: DASHBOARD_DEPS for the mounted card only; without the dashboard's
 *           dependencies that case is skipped and says so under SP-2, while the loads still
 *           run.
 *
 * Test data: the declaration is `PAIR_DECLARATION` from `tests/lib/gitproject.ts`, so the
 * card is drawn. (a) `ENABLE_OPENCLAW=0`, `ENABLE_OPENCODE=0`. (b) `ENABLE_OPENCLAW=0`,
 * `ENABLE_OPENCODE=1`. (c) both `1`. Every other flag is `1`, `PRIVACY_PROXY_ENABLE`
 * included. The texts, from CS-FR13: `OpenClaw and OpenCode are both switched off, so
 * nothing will use these repositories.`; `…; the privacy providers are offered only to
 * them.`; `…; only the privacy proxy can use the local LLM.`; `OpenClaw is switched off, so
 * no Claude sign-in is offered. …`. The Node app notes: `build an app using OpenClaw
 * first`, `build an app using OpenCode first`, and one beginning `no agent is switched on`.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { borrowSharedProject, configSections, fieldsOf, launchpadData, projectDir } from '../lib/dashboardfixture';
import { PAIR_DECLARATION, envFrom, fixtureValue, resetProject, writeEnv } from '../lib/gitproject';
import { DASHBOARD_DEPS } from '../lib/preconditions';
import { mountComponent } from '../lib/mount';
import { repoRoot } from '../lib/paths';

// The shared project and ENV_DIR go back as they were found, for the files after this one.
borrowSharedProject();

const REPOSITORIES = 'OpenClaw and OpenCode are both switched off, so nothing will use these repositories.';
const PRIVACY = 'OpenClaw and OpenCode are both switched off; the privacy providers are offered only to them.';
const LOCAL_LLM = 'OpenClaw and OpenCode are both switched off; only the privacy proxy can use the local LLM.';
const CLAUDE = 'OpenClaw is switched off, so no Claude sign-in is offered.';
const CARD = join(repoRoot, 'dashboard/src/lib/components/GitRepositories.svelte');

const bin = mkdtempSync(join(tmpdir(), 'lu-cs18-'));
writeFileSync(join(bin, 'docker'), '#!/bin/sh\nexit 0\n');
chmodSync(join(bin, 'docker'), 0o755);
afterAll(() => rmSync(bin, { recursive: true, force: true }));

async function seen(openclaw: '0' | '1', opencode: '0' | '1') {
  process.env.ENV_DIR = projectDir;
  resetProject(projectDir);
  const values: Record<string, string> = { ENABLE_OPENCLAW: openclaw, ENABLE_OPENCODE: opencode, GIT_REPOSITORIES: PAIR_DECLARATION };
  writeEnv(projectDir, envFrom((key) => values[key] ?? fixtureValue(key)));
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`;
  let launchpad: any;
  try {
    launchpad = await launchpadData();
  } finally {
    process.env.PATH = path;
  }
  const tiles = launchpad.groups.flatMap((g: any) => g.tiles);
  const sections = configSections();
  const section = (fragment: string) => sections.find((s) => s.title.includes(fragment)) as any;
  const claude = sections.flatMap((s) => fieldsOf(s) as any[]).find((f) => f.key === 'ENABLE_ANTHROPIC_CLAUDE_CODE');
  return {
    git: launchpad.git,
    privacyTile: tiles.find((t: any) => t.name === 'Privacy proxy'),
    nodeApp: tiles.find((t: any) => t.name === 'Node app'),
    notes: {
      git: section('GIT INTEGRATION').note,
      privacy: section('PRIVACY PROXY').note,
      localLlm: section('SELF-HOSTED LOCAL LLM').note
    },
    claude: claude?.note ?? ''
  };
}

describe('CS-18 places that need an agent say when there is none', () => {
  test('CS-18 with both agents off, the card and four other places carry their notes', async () => {
    const s = await seen('0', '0');
    expect(s.git.notice).toBe(REPOSITORIES);
    expect(s.notes).toEqual({ git: REPOSITORIES, privacy: PRIVACY, localLlm: LOCAL_LLM });
    expect(s.privacyTile.warning).toBe(PRIVACY);
    expect(s.nodeApp.note).toStartWith('no agent is switched on');
  });

  test('CS-18 the negative: with OpenClaw off only, no both-off note; the Claude note; the Node app names OpenCode', async () => {
    const s = await seen('0', '1');
    expect(s.git).not.toHaveProperty('notice');
    expect(s.notes).toEqual({ git: '', privacy: '', localLlm: '' });
    expect(s.privacyTile).not.toHaveProperty('warning');
    expect(s.claude).toStartWith(CLAUDE);
    expect(s.nodeApp.note).toBe('build an app using OpenCode first');
  });

  test('CS-18 the negative: with both on, no note, and the Node app tile reads as today', async () => {
    const s = await seen('1', '1');
    expect(s.git).not.toHaveProperty('notice');
    expect(s.notes).toEqual({ git: '', privacy: '', localLlm: '' });
    expect(s.privacyTile).not.toHaveProperty('warning');
    expect(s.claude).toBe('');
    expect(s.nodeApp.note).toBe('build an app using OpenClaw first');
  });

  describe.skipIf(!DASHBOARD_DEPS)('CS-18 the repositories card, mounted', () => {
    // A skipped describe still has its body evaluated; see A16-18.
    if (!DASHBOARD_DEPS) return;

    test('CS-18 the card draws the note with both agents off, and not with one on', async () => {
      const draw = async (openclaw: '0' | '1', opencode: '0' | '1') => {
        const { git } = await seen(openclaw, opencode);
        const m = await mountComponent(CARD, { git });
        const text = m.text();
        m.unmount();
        return text;
      };
      const off = await draw('0', '0');
      expect(off).toContain('Agent repositories');
      expect(off).toContain(REPOSITORIES);
      const on = await draw('0', '1');
      expect(on).toContain('Agent repositories');
      expect(on).not.toContain(REPOSITORIES);
    });
  });
});

// The describe above registers nothing without the dependencies; this says so. SP-2.
test.skipIf(DASHBOARD_DEPS)(
  'SP-2 the cases in this file need the dashboard dependencies, which are absent here',
  () => {
    expect(existsSync(join(repoRoot, 'dashboard', 'node_modules'))).toBe(false);
  }
);
