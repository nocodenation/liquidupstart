/**
 * A8-38 · Unit · numberShown numbers the sections it is given, whatever the file numbered
 *
 * Purpose:  The configuration view numbers what it shows (#51), through
 *           `numberShown` in dashboard/src/lib/env-meta.ts. Until review round 1
 *           of #52 it was held only through the view's `load`; the reviewer
 *           asked for a case of its own. The local review of the answer found
 *           that it took any leading digits and a dot for a section number, so a
 *           title beginning `2026.9` lost its `2026.`.
 * Given:    Section titles as the parser of .env.example gives them, with the
 *           file's numbers and the gap a hidden section leaves.
 * When:     `numberShown` is applied to them.
 * Then:     The titles are numbered 1 to n in order, each name kept, every other
 *           field kept, and the sections handed in unchanged.
 * Covers:   A8-38, FR10, U1
 * Negative: the file's numbers, and the gap after a hidden section, do not reach
 *           the result.
 * Counterpart: a title with no number gets one, and a title that begins with
 *           digits and a dot but no space keeps them as part of its name.
 *
 * Test data: `1. NETWORKING` with `fields: ['SYSTEM_HTTP_PORT']`, `3. SECRETS`,
 * `5. LLM PROVIDER API KEYS (shared)`, `Liquid AUTHENTICATION` with no number,
 * and `2026.9 MIGRATION`, a name chosen to begin like a number without being
 * one; .env.example writes no such title today.
 */
import { test, expect } from 'bun:test';
import { numberShown } from '../../dashboard/src/lib/env-meta';

const shown = () => [
  { title: '1. NETWORKING', fields: ['SYSTEM_HTTP_PORT'] },
  { title: '3. SECRETS' },
  { title: '5. LLM PROVIDER API KEYS (shared)' }
];

test('A8-38 the negative: numberShown leaves no gap and none of the file\'s numbers', () => {
  const given = shown();
  expect(numberShown(given)).toEqual([
    { title: '1. NETWORKING', fields: ['SYSTEM_HTTP_PORT'] },
    { title: '2. SECRETS' },
    { title: '3. LLM PROVIDER API KEYS (shared)' }
  ]);
  expect(given).toEqual(shown());
});

test('A8-38 the counterpart: a title with no number gets one, and digits that are its name stay', () => {
  expect(numberShown([...shown(), { title: 'Liquid AUTHENTICATION' }, { title: '2026.9 MIGRATION' }]).map((s) => s.title)).toEqual([
    '1. NETWORKING',
    '2. SECRETS',
    '3. LLM PROVIDER API KEYS (shared)',
    '4. Liquid AUTHENTICATION',
    '5. 2026.9 MIGRATION'
  ]);
});
