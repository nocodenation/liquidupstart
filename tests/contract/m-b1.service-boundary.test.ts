/**
 * M-B1 · Contract · nar_builder carries the mounts it needs and none it does not
 *
 * Purpose:  §3.2 of FEATURE-liquid-java-extensions.md draws a boundary: the
 *           builder is a compiler with a drop directory, not a member of the
 *           stack's credential-holding set (FR25). A mount added later out of
 *           convenience would erase that boundary quietly, and no other case
 *           would notice — B1-12 checks the result from inside the container,
 *           this one checks the declaration.
 * Given:    compose.yml and .env.example.
 * When:     The nar_builder service block is read out of compose.yml, and the
 *           credential-bearing keys are read out of .env.example rather than
 *           listed here, so a key added later cannot escape the case.
 * Then:     ./volumes/repos and ./volumes/nar_extensions are mounted, **no
 *           dependency cache is mounted at all** (FR26 as rewritten on
 *           2026-10-11, FR37), and neither ./volumes/_git-secrets nor any
 *           credential key appears.
 * Covers:   B1-1, FR25, FR26, FR37, NFR7
 * Unhappy:  The negative half is the whole point: a block that gained
 *           _git-secrets, a deploy key or a secret from .env fails by name.
 */
import { test, expect } from 'bun:test';
import { serviceBlock, composeText, envExampleText } from '../lib/compose-file';

const block = serviceBlock('nar_builder', composeText());

const CREDENTIAL_KEYS = envExampleText()
  .split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=/))
  .filter((m): m is RegExpMatchArray => m !== null)
  .map((m) => m[1])
  .filter((k) => /PASSWORD|SECRET|TOKEN|_KEY$|^API_KEY$|CREDENTIAL/.test(k));

test('B1-1 the working mounts are declared', () => {
  expect(block).toContain('./volumes/repos:/repos');
  expect(block).toContain('./volumes/nar_extensions:/deploy/nar_extensions');
});

test('B1-1 no dependency cache is shared between builds', () => {
  // **Inverted 2026-10-11, and it used to assert the opposite.** This case read
  // `expect(block).toContain('./volumes/nar_builder/m2:/m2')`, because FR26 put
  // the cache under `volumes/` like all state. That mount was B1's fourth leg:
  // build-time code could plant an artifact there that every later build
  // resolved. FR26 is rewritten, the closure lives in the builder image, and
  // each build resolves into its own repository (FR37) -- so the assertion that
  // signed this off is now the defect, and the honest form of it is the
  // absence. B7-1 holds the same property against the image and the script.
  expect(block).not.toMatch(/:\/m2(:|\s*$)/m);
});

test('B1-1 the git secrets are not mounted', () => {
  expect(block).not.toContain('_git-secrets');
});

test('B1-1 no credential-bearing .env key is passed to the builder', () => {
  expect(CREDENTIAL_KEYS.length).toBeGreaterThan(3);
  const passed = CREDENTIAL_KEYS.filter((k) => block.includes(k));
  expect(passed).toEqual([]);
});
