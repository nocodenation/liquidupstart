/**
 * M-A8 · Integration · The dashboard image still builds
 *
 * Purpose:  run.sh runs docker build on dashboard/ at every launch, and that
 *           image's build runs `bun run test && bun run build`. So the
 *           launcher's first act depends on the interface compiling — and if it
 *           does not, run.sh stops at "Building the dashboard image..." and the
 *           operator has no interface left to repair it from. Nothing else in
 *           this repository ever compiles the UI: `bun run build` and
 *           svelte-check appear nowhere in tests/, scripts/ or config/scripts/,
 *           build.sh does not build the dashboard at all, so not even a cold
 *           start does it, and the dashboard's own tests import library modules
 *           rather than components. A Svelte file that does not compile is
 *           therefore green everywhere until an operator launches. The exposure
 *           was theoretical until M-A8, which is the first milestone to change
 *           +page.svelte and +page.server.ts.
 * Given:    The dashboard/ build context as it stands in the working tree, and
 *           the throwaway tag liquidupstart/dashboard:m-a8-compiles.
 * When:     docker build runs on it — the command run.sh itself runs, not
 *           `bun run build`, which exits 127 with "vite: command not found" in
 *           a checkout because there is no dashboard/node_modules.
 * Then:     It exits 0 and the image exists; the tag is removed afterwards so
 *           the case leaves nothing behind.
 * Covers:   A8-18, FR3, FR10
 * Unhappy:  A build failure is the unhappy path and needs no separate case: any
 *           non-zero exit fails this one, with docker's output as the evidence.
 */
import { test, expect, afterAll } from 'bun:test';
import { buildDashboardImage, imageExists, removeImage } from '../lib/dashboardserver';

const TAG = 'liquidupstart/dashboard:m-a8-compiles';

afterAll(() => removeImage(TAG));

test('A8-18 docker build on dashboard/ succeeds', () => {
  const built = buildDashboardImage(TAG);

  expect(built.output).not.toContain('vite: command not found');
  expect(built.code, `docker build failed:\n${built.output}`).toBe(0);
  expect(imageExists(TAG)).toBe(true);
});
