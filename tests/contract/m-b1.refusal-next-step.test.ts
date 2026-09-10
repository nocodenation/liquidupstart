/**
 * M-B1 · Contract · Every refusal nar-build or the builder can emit names a next step
 *
 * Purpose:  A6-11's property, applied to a second tool. The reasoning was never
 *           git-specific: a refusal arriving at the moment of need does not have
 *           to be found first, which M-A3b to M-A3e took four milestones to
 *           learn. Asserting it once per tool is what stops it decaying into a
 *           habit of whoever wrote the newest message. The refusals are
 *           enumerated by reading both sources, not from a list kept here, so a
 *           message added later cannot escape the case.
 * Given:    config/agents/bin/nar-build.sh, config/nar_builder/build.sh and
 *           config/nar_builder/BuildServer.java — the command, the build itself
 *           and the endpoint in front of it — read as text. All three can refuse,
 *           so all three are read.
 * When:     Every block that begins with a `refused:` line is collected, up to
 *           the line that ends it.
 * Then:     Each names a command to run, a file to fix, or an action to take,
 *           and none of them ends at the refusal. Both files contribute blocks,
 *           so a file that stopped emitting refusals fails rather than passing
 *           vacuously.
 * Covers:   B1-11, FR20's property, FR22
 * Unhappy:  The negative half is the shape of the assertion: a refusal whose
 *           block says only what is forbidden fails, and the failure names the
 *           refusal line it came from.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { narCommand, builderScript, builderServer } from '../lib/narfixture';

type Refusal = { file: string; line: string; block: string };

const SOURCES = [narCommand, builderScript, builderServer];

const NEXT_STEP = [
  /nar-build/,
  /git-repo-info/,
  /docker compose (start|restart|up)\b/,
  /scripts\/linux\/start\.sh/,
  /(fix|correct|add|create|put|declare)\b/i,
  /ask the operator|the operator's call|report (it|what|the)/i
];

function refusals(file: string): Refusal[] {
  const lines = readFileSync(file, 'utf8').split('\n');
  const found: Refusal[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/refused:/.test(lines[i])) continue;
    const block: string[] = [lines[i]];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*(exit|fi|;;|\}|REFUSED)/.test(lines[j])) break;
      if (/refused:/.test(lines[j])) break;
      block.push(lines[j]);
    }
    found.push({ file: file.split('/').slice(-2).join('/'), line: lines[i].trim(), block: block.join('\n') });
  }
  return found;
}

const all = SOURCES.flatMap(refusals);

test('B1-11 both sources are read and each contributes refusals', () => {
  for (const file of SOURCES) {
    const short = file.split('/').slice(-2).join('/');
    expect(all.filter((r) => r.file === short).length).toBeGreaterThan(0);
  }
  expect(all.length).toBeGreaterThanOrEqual(6);
});

test('B1-11 every refusal names a command, a file to fix or an action', () => {
  const dead = all
    .filter((r) => !NEXT_STEP.some((p) => p.test(r.block)))
    .map((r) => `${r.file}: ${r.line}`);
  expect(dead).toEqual([]);
});

test('B1-11 no refusal is a single line that ends at the refusal', () => {
  const terse = all
    .filter((r) => r.block.trim().split('\n').length < 2)
    .map((r) => `${r.file}: ${r.line}`);
  expect(terse).toEqual([]);
});
