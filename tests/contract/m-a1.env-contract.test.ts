/**
 * M-A1 · Contract · Every GIT_* key is declared in all the places the contract requires
 *
 * Purpose:  The project's configuration contract says a start script injects a
 *           root .env key into a service only where that service already
 *           declares it. A key added to .env.example but forgotten in one of the
 *           three service blocks fails silently — the agent simply has no
 *           identity in that one harness. This is the tripwire for that.
 *           Parsing is positional on purpose: the compose block is located by
 *           "  <service>:" at exactly two spaces, so reformatting compose.yml
 *           breaks this test, which is the intended behaviour.
 * Given:    .env.example declaring GIT_USER_NAME and GIT_USER_EMAIL.
 * When:     Each key is looked for in the compose environment block of
 *           openclaw-gateway, openclaw-cli and opencode.
 * Then:     Every key appears in every block, and the failure message names the
 *           service and key that are missing.
 * Covers:   A1-3, FR10, NFR2
 * Unhappy:  A key named GITHUB_* rather than GIT_* violates the host-agnostic
 *           rule and is asserted against separately.
 */
import { test, expect } from 'bun:test';
import { AGENT_SERVICES, serviceBlock, composeText, envExampleText } from '../lib/compose-file';

const REQUIRED_KEYS = ['GIT_USER_NAME', 'GIT_USER_EMAIL'];

test('A1-3 the keys are declared in .env.example', () => {
  const text = envExampleText();
  for (const key of REQUIRED_KEYS) {
    expect(text).toMatch(new RegExp(`^${key}=`, 'm'));
  }
});

test('A1-3 every key reaches every agent service through compose', () => {
  const text = composeText();
  const missing: string[] = [];
  for (const service of AGENT_SERVICES) {
    const block = serviceBlock(service, text);
    for (const key of REQUIRED_KEYS) {
      if (!block.includes(`${key}`)) missing.push(`${service} is missing ${key}`);
    }
  }
  expect(missing).toEqual([]);
});

test('A1-3 the workspace is mounted into every agent service', () => {
  const text = composeText();
  const missing: string[] = [];
  for (const service of AGENT_SERVICES) {
    if (!serviceBlock(service, text).includes('./volumes/repos:/repos')) {
      missing.push(`${service} is missing the ./volumes/repos:/repos mount`);
    }
  }
  expect(missing).toEqual([]);
});

test('A1-3 naming stays host-agnostic — no GITHUB_ prefixed configuration keys', () => {
  expect(envExampleText()).not.toMatch(/^GITHUB_[A-Z_]*=/m);
});
