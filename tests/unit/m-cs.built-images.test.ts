/**
 * M-CS · Unit · builtImages() names the images of what is on
 *
 * Purpose:  `stackState().needBuild` is true when any image `builtImages()` names is
 *           missing. Leaving a switched-off component's image in the list asks for a build
 *           for ever -- #50's own example. Leaving out one that is on lets a start fail on
 *           a missing image, which compose then tries to pull. So the list follows the
 *           switches, and a build is asked for exactly when one is needed (decision 10).
 *           This replaces the two cases that read the list as text, A8-27's second half and
 *           B5-3's first, which now call the function too.
 * Given:    `builtImages()` from `dashboard/src/lib/server/project.ts`, imported after
 *           `tests/lib/dashboardfixture.ts`, which owns the directory `project.ts` captures
 *           on its first load.
 * When:     It is called with each combination below.
 * Then:     All on names the five; each component off leaves out exactly its images; all
 *           off leaves `bun-runner` alone, which has no switch.
 * Covers:   CS-12, CS-FR8
 * Negative: Liquid off leaves out both `liquid` and `nar-builder`, the builder being
 *           Liquid's; OpenClaw off leaves out `openclaw`; OpenCode off `opencode`.
 * Counterpart: all on names all five, in today's order, so a function that returned too
 *           little cannot pass.
 *
 * Test data: all on → `liquidupstart/{opencode,bun-runner,liquid,openclaw,nar-builder}:latest`,
 * in that order. Liquid off → without `liquid` and `nar-builder`. OpenClaw off → without
 * `openclaw`. OpenCode off → without `opencode`. All off → `liquidupstart/bun-runner:latest`;
 * with the privacy proxy on as well, followed by `liquidupstart/privacy-proxy:latest`, which
 * `start.sh` requires since the second local review of 2026-10-29 and the dashboard has to ask
 * for, or it offers a Start the start refuses.
 */
import { test, expect, describe } from 'bun:test';
import '../lib/dashboardfixture';
import { builtImages } from '../../dashboard/src/lib/server/project';

const image = (name: string) => `liquidupstart/${name}:latest`;
const on = (off: string[] = []) => ({
  liquid: !off.includes('liquid'),
  openclaw: !off.includes('openclaw'),
  opencode: !off.includes('opencode')
});

describe('CS-12 builtImages() names the images of what is on', () => {
  test('CS-12 all on: the five, in today\'s order', () => {
    expect(builtImages(on())).toEqual(['opencode', 'bun-runner', 'liquid', 'openclaw', 'nar-builder'].map(image));
  });

  test('CS-12 the negative: Liquid off leaves out liquid and its builder', () => {
    expect(builtImages(on(['liquid']))).toEqual(['opencode', 'bun-runner', 'openclaw'].map(image));
  });

  test('CS-12 the negative: OpenClaw off leaves out openclaw', () => {
    expect(builtImages(on(['openclaw']))).toEqual(['opencode', 'bun-runner', 'liquid', 'nar-builder'].map(image));
  });

  test('CS-12 the negative: OpenCode off leaves out opencode', () => {
    expect(builtImages(on(['opencode']))).toEqual(['bun-runner', 'liquid', 'openclaw', 'nar-builder'].map(image));
  });

  test('CS-12 the negative: all off leaves bun-runner alone', () => {
    expect(builtImages(on(['liquid', 'openclaw', 'opencode']))).toEqual([image('bun-runner')]);
  });

  test('CS-12 and the privacy proxy\'s image joins while it is on, as start.sh requires', () => {
    expect(builtImages(on(['liquid', 'openclaw', 'opencode']), true)).toEqual([image('bun-runner'), image('privacy-proxy')]);
    expect(builtImages(on(), false)).not.toContain(image('privacy-proxy'));
  });
});
