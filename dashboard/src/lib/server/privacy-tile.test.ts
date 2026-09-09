import { describe, expect, test } from 'bun:test';
import { privacyTile } from './privacy-tile';

describe('privacy tile', () => {
  test('links to the settings page when the proxy is on', () => {
    const tile = privacyTile('8888', true);
    expect(tile.url).toBe('http://privacy.localhost:8888/policy/ui');
    expect(tile).not.toHaveProperty('note');
  });

  test('points at Configuration without a link when it is off', () => {
    const tile = privacyTile('8888', false);
    expect(tile).not.toHaveProperty('url');
    expect(tile.note).toContain('Configuration');
  });

  test('never carries a credential row', () => {
    expect(privacyTile('8888', true)).not.toHaveProperty('creds');
  });
});
