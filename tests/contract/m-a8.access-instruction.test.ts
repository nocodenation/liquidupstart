/**
 * M-A8 · Contract · The instruction printed matches the declared access
 *
 * Purpose:  The declaration knows whether a repository is read or write, so the
 *           card can say it, and U2 makes a point of it: "with write access
 *           where the declaration says write, which the stack knows and
 *           therefore says." An operator who ticks "Allow write access" while
 *           registering a deploy key for a read-only repository has granted
 *           more than anything asked for, and nothing in the stack will ever
 *           complain. The generic sentence the git-auth route prints today —
 *           "Grant write access only if the agents need to push" — leaves that
 *           decision with the operator when the stack already knows the answer.
 * Given:    The two-repository fixture: liquid-flows declared write|protected
 *           and agent-skills declared read|direct.
 * When:     The launchpad's page data is read.
 * Then:     The write repository's instruction asks for write access and names
 *           the repository; the read repository's says read-only and never asks
 *           for write; and neither is the generic sentence.
 * Covers:   A8-10, FR3, NFR5, §3.1
 * Unhappy:  The read-only half is the unhappy side: an instruction that asks
 *           for write access there is the silent over-grant this case exists to
 *           refuse.
 */
import { test, expect, beforeAll } from 'bun:test';
import { launchpadData, projectDir } from '../lib/dashboardfixture';
import { FLOWS, SKILLS, pairProject } from '../lib/gitproject';

const GENERIC = 'Grant write access only if the agents need to push';

let instructions: Record<string, string>;

beforeAll(async () => {
  process.env.ENV_DIR = projectDir;
  pairProject(projectDir);
  const data = await launchpadData();
  instructions = Object.fromEntries(
    data.git.repositories.map((r: any) => [r.name, r.instructions])
  );
});

test('A8-10 the write repository asks for write access, by name', () => {
  expect(instructions[FLOWS.name]).toContain('write access');
  expect(instructions[FLOWS.name]).toContain(FLOWS.path);
  expect(instructions[FLOWS.name]).not.toContain(GENERIC);
});

test('A8-10 the read repository says read-only and never asks for write', () => {
  expect(instructions[SKILLS.name]).toContain('read-only');
  expect(instructions[SKILLS.name]).toContain(SKILLS.path);
  expect(instructions[SKILLS.name]).not.toContain('write access');
  expect(instructions[SKILLS.name]).not.toContain(GENERIC);
});

test('A8-10 the two instructions differ', () => {
  expect(instructions[FLOWS.name]).not.toBe(instructions[SKILLS.name]);
});
