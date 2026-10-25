/**
 * M-A0 · Contract · What the README promises, the configuration has to do
 *
 * Purpose:  This pairing exists because it failed once, expensively. `README.md`
 *           said *"All services bind to `localhost`"* from 2026-07-17 while
 *           `compose.yml` published the proxy on every interface, and the two
 *           said different things for two and a half months with nothing
 *           noticing — not three reviews, not a 560-case suite. `A0-7` and `A0-8`
 *           hold that one promise to its configuration.
 *
 *           On 2026-10-17 the README gained a section on building Java extensions
 *           for Liquid, and on the same reading it was found making a claim that
 *           had quietly become false: *"Four images are built locally"*, listing
 *           four and omitting `nar-builder`. `scripts/linux/build.sh` builds
 *           **five**. `CLAUDE.md` had already been corrected to five; the README
 *           had not, which is the two-copies defect in its usual shape.
 *
 *           So the new section is held to the same rule as the old promise: what
 *           the document tells a reader they can do, the stack has to be
 *           configured to do.
 * Given:    `README.md`, `compose.yml`, `scripts/linux/build.sh`,
 *           `config/liquid/narcheck.py`, both scripts that judge the inbox —
 *           `config/liquid/entrypoint.sh` at start, `config/liquid/nar-watch.sh`
 *           while running — and the `liquid` image's Dockerfile template, read
 *           as text; and, for the
 *           negatives, the real `opencode` service block with its `nar-build`
 *           mount commented out, and the image line `main` carried before
 *           2026-10-17
 * When:     Each promise in the section is matched against the configuration
 *           that would have to carry it
 * Then:     The builder is a declared service; `nar-build` is mounted read-only,
 *           on a line that is not a comment, into every agent service; the
 *           refusal directory and the load directory the section names are the
 *           ones both scripts use; its removal procedure is the inbox copy and a
 *           restart, because every start empties the load directory, and it says
 *           that a replacement filed under `refused/` is unloaded by that restart; the two limits it quotes are the
 *           two the checker enforces, in a file the `liquid` image carries its
 *           own copy of; and the count and the list of locally built images both
 *           match what the build script builds
 * Covers:   A0-11
 * Negative: A mount that exists only as a comment, and the four-image line `main`
 *           carried, both refused by the same predicates the positives use. The
 *           case that was red when this file was written is the positive one:
 *           the count and the list.
 *
 * Not asserted: that a build works. That is `B1-5` and the M-B milestones, which
 *           drive the real builder. This file asks only whether the document and
 *           the configuration agree — which is the thing that went wrong before.
 */

import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { composeText, serviceBlock, mountsLive, AGENT_SERVICES } from '../lib/compose-file';
import { NAR_MOUNT } from '../lib/narfixture';

const read = (p: string) => readFileSync(join(repoRoot, p), 'utf8');
const readme = read('README.md');
const compose = composeText();
const buildScript = read('scripts/linux/build.sh');
const narcheck = read('config/liquid/narcheck.py');
const narWatch = read('config/liquid/nar-watch.sh');
const entrypoint = read('config/liquid/entrypoint.sh');
const liquidDockerfile = read('config/liquid/templates/Dockerfile');

const MOUNT = `./config/agents/bin/nar-build.sh:${NAR_MOUNT}:ro`;

const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

// The sentence that names the locally built images: its count, and its list.
function imagesClaim(text: string): { count: number; listed: string[] } {
  const m = text.match(/(\w+) images are built locally — `liquidupstart\/\{([a-z,-]+)\}`/);
  if (!m) return { count: -1, listed: [] };
  return { count: WORDS.indexOf(m[1]), listed: m[2].split(',').sort() };
}

const built = [...buildScript.matchAll(/^"\$\{PROJECT_DIR\}\/config\/scripts\/build\/([a-z-]+)\.sh"/gm)]
  .map((m) => m[1])
  .sort();

// The one predicate both the positive and the negative are judged by.
const agreesWithBuild = (c: { count: number; listed: string[] }) =>
  c.count === built.length && JSON.stringify(c.listed) === JSON.stringify(built);

// `main`'s line until this branch, verbatim — the real defect, not an invented one.
// The top-level named volumes compose declares, read from the `volumes:` block.
const namedVolumes = (text: string): string[] => {
  const block = text.split(/^volumes:\s*$/m)[1]?.split(/^\S/m)[0] ?? '';
  return [...block.matchAll(/^  ([A-Za-z0-9_.-]+):/gm)].map((m) => m[1]);
};
const projectName = compose.match(/^name:\s*(\S+)/m)?.[1];

const FOUR_IMAGE_LINE = 'Four images are built locally — `liquidupstart/{opencode,bun-runner,liquid,openclaw}` —';

describe('A0-11 the README section on Java extensions is backed by the configuration', () => {
  test('A0-11 it tells the reader the stack builds NARs, and the builder is a declared service', () => {
    expect(readme).toContain('## Java extensions for Liquid');
    expect(compose).toMatch(/^ {2}nar_builder:$/m);
  });

  test('A0-11 it tells them to run `nar-build` in an agent container, and every agent service mounts it read-only', () => {
    expect(readme).toContain('# in an agent container (OpenClaw or OpenCode)');
    const missing = AGENT_SERVICES.filter((s) => !mountsLive(serviceBlock(s, compose), MOUNT));
    expect(missing, 'agent services without an uncommented nar-build mount').toEqual([]);
  });

  test('A0-11 the negative: a mount that is only a comment does not count', () => {
    const block = serviceBlock('opencode', compose);
    expect(block).toContain(MOUNT);
    const commented = block.replace(`- ${MOUNT}`, `# - ${MOUNT}`);
    expect(commented).not.toBe(block);
    expect(mountsLive(commented, MOUNT)).toBe(false);
  });

  test('A0-11 the refusal directory it names is where both judging scripts put refusals', () => {
    // ./volumes/nar_extensions is the inbox, mounted at nar_inbox in liquid. The
    // entrypoint judges it at start and nar-watch while running, each with its
    // own copy of the paths.
    expect(readme).toContain('`./volumes/nar_extensions/refused/`');
    expect(mountsLive(serviceBlock('liquid', compose), './volumes/nar_extensions:/opt/nifi/nifi-current/nar_inbox')).toBe(true);
    expect(narWatch).toContain('NIFI_HOME="${NIFI_HOME:-/opt/nifi/nifi-current}"');
    expect(narWatch).toContain('INBOX_DIR="${NIFI_HOME}/nar_inbox"');
    expect(narWatch).toContain('REFUSED_DIR="${INBOX_DIR}/refused"');
    expect(entrypoint).toContain('NIFI_HOME="${NIFI_HOME:-${NIFI_BASE_DIR}/nifi-current}"');
    expect(entrypoint).toContain('NIFI_BASE_DIR="${NIFI_BASE_DIR:-/opt/nifi}"');
    expect(entrypoint).toContain('DROP_DIR="${NIFI_HOME}/nar_inbox"');
    expect(entrypoint).toContain('REFUSED_DIR="${DROP_DIR}/refused"');
  });

  test('A0-11 its removal procedure is the inbox copy and a restart, because every start empties the load directory', () => {
    // Since 2026-10-22 the entrypoint empties the load directory before it
    // copies back what the inbox holds and passes, so the second rm inside the
    // container that the procedure used to carry is gone with it.
    expect(readme).toContain('rm ./volumes/nar_extensions/<bundle>.nar');
    expect(readme).toContain('docker compose restart liquid');
    expect(readme).not.toContain('docker compose exec liquid rm -f /opt/nifi/nifi-current/nar_extensions/<bundle>.nar');
    expect(entrypoint).toContain('find "$LOAD_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +');
    expect(narWatch).toContain('LOAD_DIR="${NIFI_HOME}/nar_extensions"');
    expect(entrypoint).toContain('LOAD_DIR="${NIFI_HOME}/nar_extensions"');
    expect(entrypoint).toContain('for NAR in "$DROP_DIR"/*.nar; do');
    expect(entrypoint).toContain('cp -v "$NAR" "${LOAD_DIR}/"');
  });

  test('A0-11 and it says that a refused replacement unloads the running version at the next restart', () => {
    // Since every start rebuilds the load path from the inbox, a replacement the
    // watcher refused leaves nothing to copy back. Review of #48, item 1.
    const prose = readme.replace(/\s+/g, ' ');
    expect(prose).toContain('A replacement that ends up in `./volumes/nar_extensions/refused/` is not a replacement.');
    expect(prose).toContain('the next restart unloads the version that is running. Look in `refused/` before restarting.');
    expect(prose).toContain('a bundle the new `lib/` refuses is unloaded at that start.');
    expect(prose).toContain('a bundle that is not yet a whole archive when Liquid starts is left for the watcher');
    expect(entrypoint).toContain('REFUSED_DIR="${DROP_DIR}/refused"');
    expect(entrypoint).toContain('find "$LOAD_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +');
  });

  test('A0-11 the two limits it quotes are the two the checker enforces', () => {
    // Quoted figures in prose are the kind that drift. These are the ones in the
    // file, and if either constant moves the README has to move with it.
    expect(readme).toMatch(/\*\*256 MiB\*\*/);
    expect(readme).toMatch(/\*\*512 MiB\*\*/);
    expect(narcheck).toMatch(/^MAX_BUNDLED_JAR_BYTES = 256 << 20$/m);
    expect(narcheck).toMatch(/^MAX_CLASS_BYTES = 512 << 20$/m);
  });

  test('A0-11 and the file holding them is mounted into the builder but copied into the liquid image', () => {
    // Which is why the README says raising a limit means rebuilding that image
    // and recreating the container: a rebuild alone leaves the old copy running.
    expect(readme).toContain('the `liquid` image carries its own');
    expect(readme).toContain('`./config/scripts/build/liquid.sh`, then `docker compose up -d liquid`');
    expect(buildScript).toContain('"${PROJECT_DIR}/config/scripts/build/liquid.sh"');
    expect(mountsLive(serviceBlock('nar_builder', compose), './config/liquid/narcheck.py:/opt/builder/narcheck.py:ro')).toBe(true);
    expect(liquidDockerfile).toMatch(/^COPY .*\.\/narcheck\.py /m);
    expect(serviceBlock('liquid', compose)).not.toContain('narcheck.py');
  });

  test('A0-11 the count and the list of locally built images are what the build script builds', () => {
    // Red when this was written: the README said four and listed four, omitting
    // nar-builder, while build.sh builds five.
    expect(built.length, 'no build steps found').toBeGreaterThan(0);
    const claim = imagesClaim(readme);
    expect(claim.count, 'the sentence naming the locally built images').toBe(built.length);
    expect(claim.listed).toEqual(built);
    expect(agreesWithBuild(claim)).toBe(true);
  });

  test('A0-11 and the named volume it names is the only one compose declares, and Liquid\'s', () => {
    expect(namedVolumes(compose)).toEqual(['liquid_api']);
    expect(readme).toContain(`\`${projectName}_liquid_api\``);
    expect(mountsLive(serviceBlock('liquid', compose), 'liquid_api:')).toBe(true);
  });

  test('A0-11 the negative: a compose file with a second named volume is refused by the same predicate', () => {
    const extra = compose.replace(/^volumes:\s*$/m, (v) => `${v}\n  extra_state:`);
    expect(extra).not.toBe(compose);
    expect(namedVolumes(extra)).not.toEqual(['liquid_api']);
  });

  test('A0-11 the negative: the four-image line main carried is refused by the same predicate', () => {
    const claim = imagesClaim(FOUR_IMAGE_LINE);
    expect(agreesWithBuild(claim)).toBe(false);
    expect(claim.count).toBe(4);
    expect(built.filter((b) => !claim.listed.includes(b))).toEqual(['nar-builder']);
  });
});
