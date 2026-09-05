/**
 * M-A6 · Contract · Every refusal either file can emit names a next step
 *
 * Purpose:  M-A3b through M-A3e spent four milestones learning that a document
 *           has to be found before it helps, and that a refusal arriving at the
 *           moment of need is the one message an agent is certain to read. FR20
 *           makes that a property of every refusal rather than a habit of
 *           whoever wrote the latest one. The refusals are enumerated out of the
 *           two source files rather than from a list kept here, so a refusal
 *           added later cannot escape the case by not being on a list.
 * Given:    config/agents/hooks/pre-push and config/agents/bin/git-publish.sh,
 *           read as text.
 * When:     Every block that begins with a `refused:` line is collected, up to
 *           the `exit` that ends it.
 * Then:     Each block names a command to run, a branch form to use, or an
 *           action to take, and none of them ends at the refusal. Both files
 *           contribute blocks, so a file that stopped emitting refusals fails
 *           rather than passing vacuously.
 * Covers:   A6-11, FR20
 * Unhappy:  The negative half is the shape of the assertion: a refusal whose
 *           block says only what is forbidden fails, and the failure names the
 *           refusal line it came from.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

type Refusal = { file: string; line: string; block: string };

const SOURCES = ['config/agents/hooks/pre-push', 'config/agents/bin/git-publish.sh'];

const NEXT_STEP = [
  /git-publish/,
  /git-repo-info/,
  /git (switch|rebase|fetch|rm|push|checkout|log|diff)\b/,
  /ask the operator|the operator's call|report (it|what|the)/i
];

function refusals(file: string): Refusal[] {
  const lines = readFileSync(join(repoRoot, file), 'utf8').split('\n');
  const found: Refusal[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/refused:/.test(lines[i])) continue;
    const block: string[] = [lines[i]];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*(exit|fi|;;|\})/.test(lines[j])) break;
      if (/refused:/.test(lines[j])) break;
      block.push(lines[j]);
    }
    found.push({ file, line: lines[i].trim(), block: block.join('\n') });
  }
  return found;
}

const all = SOURCES.flatMap(refusals);

test('A6-11 both sources are read and each contributes refusals', () => {
  for (const file of SOURCES) {
    expect(all.filter((r) => r.file === file).length).toBeGreaterThan(0);
  }
  expect(all.length).toBeGreaterThanOrEqual(10);
});

test('A6-11 every refusal names a command, a branch form or an action', () => {
  const dead = all
    .filter((r) => !NEXT_STEP.some((p) => p.test(r.block)))
    .map((r) => `${r.file}: ${r.line}`);
  expect(dead).toEqual([]);
});

test('A6-11 no refusal is a single line that ends at the refusal', () => {
  const terse = all
    .filter((r) => r.block.trim().split('\n').length < 2)
    .map((r) => `${r.file}: ${r.line}`);
  expect(terse).toEqual([]);
});
