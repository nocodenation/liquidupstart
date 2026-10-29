/**
 * M-CS · Contract · compose.yml puts exactly the switchable services behind profiles
 *
 * Purpose:  Which services a profile governs is configuration, and it can be read without
 *           docker. A profile on one service too many leaves it out of every start; one too
 *           few starts a component that is switched off. And the proxy depends on three of
 *           them: without `required: false` compose refuses the whole project as soon as
 *           one is profiled out. CS-8 confirms what compose makes of it.
 * Given:    `compose.yml`, its `services:` block read service by service through
 *           `tests/lib/compose-file.ts`'s `serviceBlock()`.
 * When:     Each service's `profiles:` and the proxy's `depends_on` are read.
 * Then:     `liquid` and `nar_builder` carry `liquid`, `openclaw-gateway` `openclaw`,
 *           `opencode` `opencode`; `openclaw-cli` keeps `cli` and `full`, `privacy-proxy`
 *           `privacy-proxy`; no other service has a profile. The proxy's entries for
 *           `opencode`, `nar_builder` and `openclaw-gateway` are `required: false` and keep
 *           today's conditions. And the proxy has `dns: ["127.0.0.1"]`: nginx resolves per
 *           request now, and without it docker passes a name it does not know -- a service
 *           that is switched off -- to the host's DNS, so a LAN device of that name would
 *           receive the operator's requests (the local review of 2026-10-29; CS-10 runs it).
 * Covers:   CS-7, CS-FR5
 * Negative: no service outside the six carries a profile -- among them `proxy`,
 *           `bun_runner`, `postgres` and `nextcloud`, which must run in every
 *           configuration.
 * Counterpart: the six do, each with its own profile, so a reader that found no profile
 *           anywhere cannot pass.
 *
 * Test data: the profiled services and their profiles, exactly: `liquid` and `nar_builder`
 * → `liquid`; `openclaw-gateway` → `openclaw`; `opencode` → `opencode`; `openclaw-cli` →
 * `cli`, `full`; `privacy-proxy` → `privacy-proxy`. The proxy's entries: `opencode`
 * `service_started`, `nar_builder` `service_started`, `openclaw-gateway` `service_healthy`,
 * each with `required: false`; and `bun_runner` `service_started` without it.
 */
import { test, expect, describe } from 'bun:test';
import { composeText, serviceBlock } from '../lib/compose-file';

const compose = composeText();
// Up to the next top-level key; a comment at column 0 inside a service is not one.
const servicesSection = compose.split(/^services:\s*$/m)[1]?.split(/^[a-z][\w-]*:/m)[0] ?? '';
const services = [...servicesSection.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)].map((m) => m[1]);

function profiles(service: string): string[] {
  const block = serviceBlock(service, compose);
  const inline = block.match(/^ {4}profiles:\s*\[([^\]]*)\]/m);
  if (inline) return inline[1].split(',').map((p) => p.trim().replace(/^"|"$/g, '')).filter(Boolean);
  const list = block.match(/^ {4}profiles:\s*\n((?: {6}- .*\n?)+)/m);
  return list ? [...list[1].matchAll(/- "?([^"\n]+)"?/g)].map((m) => m[1].trim()) : [];
}

function dependency(name: string): string {
  const block = serviceBlock('proxy', compose);
  const deps = block.split(/^ {4}depends_on:\s*$/m)[1]?.split(/^ {4}\S/m)[0] ?? '';
  return deps.split(new RegExp(`^ {6}${name}:\\s*$`, 'm'))[1]?.split(/^ {6}\S/m)[0] ?? '';
}

const EXPECTED: Record<string, string[]> = {
  liquid: ['liquid'],
  nar_builder: ['liquid'],
  'openclaw-gateway': ['openclaw'],
  opencode: ['opencode'],
  'openclaw-cli': ['cli', 'full'],
  'privacy-proxy': ['privacy-proxy']
};

describe('CS-7 compose.yml declares the profiles', () => {
  test('CS-7 the six profiled services carry exactly their profiles', () => {
    expect(services.length).toBeGreaterThan(15);
    for (const [service, expected] of Object.entries(EXPECTED)) {
      expect(`${service}: ${profiles(service).join(',')}`).toBe(`${service}: ${expected.join(',')}`);
    }
  });

  test('CS-7 the negative: no other service gains a profile', () => {
    const profiled = services.filter((s) => profiles(s).length > 0).sort();
    expect(profiled).toEqual(Object.keys(EXPECTED).sort());
    for (const always of ['proxy', 'bun_runner', 'postgres', 'nextcloud']) {
      expect(services).toContain(always);
      expect(profiles(always)).toEqual([]);
    }
  });

  test('CS-7 the proxy\'s three switchable dependencies are optional and keep their conditions', () => {
    const conditions: [string, string][] = [
      ['opencode', 'service_started'],
      ['nar_builder', 'service_started'],
      ['openclaw-gateway', 'service_healthy']
    ];
    for (const [name, condition] of conditions) {
      const entry = dependency(name);
      expect(entry, name).toMatch(new RegExp(`^ {8}condition: ${condition}$`, 'm'));
      expect(entry, name).toMatch(/^ {8}required: false$/m);
    }
  });

  test('CS-7 and the proxy forwards no name docker does not know', () => {
    expect(serviceBlock('proxy', compose)).toMatch(/^ {4}dns: \["127\.0\.0\.1"\]$/m);
  });

  test('CS-7 the counterpart: an always-on dependency stays required', () => {
    const entry = dependency('bun_runner');
    expect(entry).toMatch(/^ {8}condition: service_started$/m);
    expect(entry).not.toContain('required');
  });
});
