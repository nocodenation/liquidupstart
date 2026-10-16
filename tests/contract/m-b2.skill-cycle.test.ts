/**
 * M-B2 · Contract · §6.4 of the liquid skill is one path from source to processor
 *
 * Purpose:  FR28. §6.4 tells an agent how to deploy a NAR and opens with
 *           "1. Build the NAR(s)" — a step that had nowhere to happen until
 *           M-B1 built the builder, and that the section still does not name.
 *           A document that stops short of its own first step sends the reader
 *           looking, which is the discovery problem M-A3b to M-A3e spent four
 *           milestones on and answered with a command on the PATH.
 * Given:    config/agents/skills/liquid/SKILL.md, frontmatter stripped, and the
 *           ### section whose heading names the nar_extensions volume — §6.4.
 * When:     That one section is read as text.
 * Then:     It names nar-build as the build step, the drop directory
 *           volumes/nar_extensions as where the artifact goes, and the restart
 *           that makes it live — in that order, so it reads as one path rather
 *           than two halves that assume each other. It also names where the
 *           source has to be (a clone under /repos, which is what nar-build
 *           will accept) and how to confirm the processor arrived.
 * Covers:   B2-7, FR28, U9, U10
 * Unhappy:  Dropping any one of the three steps, or putting the build after the
 *           drop directory, fails by name. B2-8 asserts the restart step's own
 *           content; this case only asserts that the path is whole.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const text = readFileSync(join(repoRoot, 'config/agents/skills/liquid/SKILL.md'), 'utf8');
const body = text.slice(text.indexOf('\n---\n', 3) + 5);
const sections = body.split(/\n(?=### )/);
const section = sections.find((s) => /^### 6\.4/.test(s)) ?? '';

const REQUIRED = [
  { term: 'nar-build, the command that builds the NAR', pattern: /\bnar-build\b/ },
  { term: 'the drop directory volumes/nar_extensions', pattern: /volumes\/nar_extensions/ },
  { term: 'the restart that loads it', pattern: /docker compose restart liquid/ },
  { term: 'where the source has to live', pattern: /\/repos\b/ },
  { term: 'how to confirm the processor arrived', pattern: /confirm|verify|check/i }
];

test('B2-7 §6.4 is present and describes a procedure', () => {
  expect(section.length).toBeGreaterThan(400);
});

test('B2-7 it names the build, the drop directory and the restart', () => {
  const missing = REQUIRED.filter((r) => !r.pattern.test(section)).map((r) => r.term);
  expect(missing).toEqual([]);
});

test('B2-7 the three steps appear in the order they are taken', () => {
  const procedure = section.slice(section.search(/^1\. /m));
  const build = procedure.indexOf('nar-build');
  const drop = procedure.indexOf('volumes/nar_extensions');
  const restart = procedure.indexOf('docker compose restart liquid');
  expect(build).toBeLessThan(drop);
  expect(drop).toBeLessThan(restart);
});

test('B2-7 the build step is no longer an unnamed "build the NAR"', () => {
  const first = section.match(/^\s*1\.\s+(.*)$/m)?.[1] ?? '';
  expect(first).toMatch(/nar-build/);
});
