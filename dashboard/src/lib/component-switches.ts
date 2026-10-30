// Which of the three large components this installation runs: ENABLE_LIQUID, ENABLE_OPENCLAW
// and ENABLE_OPENCODE in .env. The start reads the same keys through
// config/scripts/start/lib/components.sh, and CS-2 holds the two readers to one table.
// docs/FEATURE-component-switches.md §5.

export type Component = 'liquid' | 'openclaw' | 'opencode';

export const COMPONENT_KEYS: Record<Component, string> = {
  liquid: 'ENABLE_LIQUID',
  openclaw: 'ENABLE_OPENCLAW',
  opencode: 'ENABLE_OPENCODE'
};

/** What a launchpad tile of a switched-off component says in place of its link. */
export const SWITCHED_OFF_NOTE = 'switched off — enable it under Which apps to run in Configuration';

// Places that matter only to an agent stay visible with both agents off, and say so (CS-FR13).
export const AGENTS_OFF_REPOSITORIES =
  'OpenClaw and OpenCode are both switched off, so nothing will use these repositories.';
export const AGENTS_OFF_PRIVACY =
  'OpenClaw and OpenCode are both switched off; the privacy providers are offered only to them.';
export const AGENTS_OFF_LOCAL_LLM =
  'OpenClaw and OpenCode are both switched off; only the privacy proxy can use the local LLM.';
export const OPENCLAW_OFF_CLAUDE =
  'OpenClaw is switched off, so no Claude sign-in is offered. A login that already exists keeps working for the privacy proxy.';

/** The 409 of a sign-in route while OpenClaw is off (CS-FR11). */
export const OPENCLAW_OFF_REFUSAL =
  'OpenClaw is switched off — turn it on under Which apps to run in Configuration first.';

/** The Node app tile names the agent that can build the app: OpenClaw first, as before. */
export function nodeAppNote(on: Record<Component, boolean>): string {
  if (on.openclaw) return 'build an app using OpenClaw first';
  if (on.opencode) return 'build an app using OpenCode first';
  return 'no agent is switched on to build one — enable one under Which apps to run in Configuration';
}

export function bothAgentsOff(on: Record<Component, boolean>): boolean {
  return !on.openclaw && !on.opencode;
}

/**
 * A switch's value, from the text after `=` on its line: trimmed; a quote that closes on the
 * line gives what lies between, whatever follows it; otherwise the value ends at the first
 * blank followed by `#`; trimmed again. `lu_component_value` in components.sh is the same rule
 * over the same text. `parseEnvValues`' own `value` is not used, because it removes double
 * quotes only and cuts a comment at a space, not at a tab.
 */
// ASCII whitespace only, as the shell reader's class is: JavaScript's `\s` and `trim()` take
// U+00A0 too, which bash in the C locale does not, so a no-break space pasted before a comment
// read off here and was refused there (the fourth local review of 2026-10-29).
const WS = '[ \\t\\n\\v\\f\\r]';
const TRIM = new RegExp(`^${WS}+|${WS}+$`, 'g');
const COMMENT = new RegExp(`${WS}#[\\s\\S]*$`);

export function switchValue(afterEquals: string): string {
  let v = afterEquals.replace(TRIM, '');
  const quote = v[0];
  const close = quote === '"' || quote === "'" ? v.indexOf(quote, 1) : -1;
  v = close !== -1 ? v.slice(1, close) : v.replace(COMMENT, '');
  return v.replace(TRIM, '');
}

// The switch states a configuration page was rendered with, carried by the form in a hidden
// field, so that the save judges which fields the page left out by what it showed rather than
// by an .env another tab or a hand edit changed since (CS-FR12).
export const RENDERED_FIELD = '__components';

export function encodeComponents(on: Record<Component, boolean>): string {
  return (Object.keys(COMPONENT_KEYS) as Component[]).map((c) => `${c}=${on[c] ? 1 : 0}`).join(',');
}

/** The states `encodeComponents` wrote, or null for anything else. */
export function decodeComponents(text: string | null | undefined): Record<Component, boolean> | null {
  const m = /^liquid=([01]),openclaw=([01]),opencode=([01])$/.exec(text ?? '');
  return m ? { liquid: m[1] === '1', openclaw: m[2] === '1', opencode: m[3] === '1' } : null;
}

/** The component a key switches, or null. */
export function switchOf(key: string): Component | null {
  return (Object.keys(COMPONENT_KEYS) as Component[]).find((c) => COMPONENT_KEYS[c] === key) ?? null;
}

type EnvLines = Map<string, { value: string; raw?: string }>;

/** A key's text after `=` in `parseEnvValues`' map, or undefined when the key is absent. */
export function afterEquals(values: EnvLines, key: string): string | undefined {
  const info = values.get(key);
  if (!info) return undefined;
  return info.raw === undefined ? info.value : info.raw.slice(info.raw.indexOf('=') + 1);
}

/** The switches from `parseEnvValues`' map, by each key's text after `=`. */
export function componentsFrom(values: EnvLines): Record<Component, boolean> {
  return componentsOn((key) => afterEquals(values, key));
}

/**
 * PRIVACY_PROXY_ENABLE, on only for `1` as always, with the value taken by the switches' rule.
 * `lu_privacy_proxy_on` in components.sh is the same reading, so the dashboard asks for the
 * proxy's image exactly when the build builds it and the start requires it (CS-FR16).
 */
export function privacyProxyOn(values: EnvLines): boolean {
  return switchValue(afterEquals(values, 'PRIVACY_PROXY_ENABLE') ?? '') === '1';
}

/**
 * The note a switch carries on the configuration page when the start refuses its value. The
 * page shows such a switch ticked, as the dashboard reads it, and the next Save writes what the
 * box then shows; without the note that would undo the refusal unseen.
 */
export function refusedSwitchNote(values: EnvLines, key: string): string {
  if (switchOf(key) === null) return '';
  const raw = afterEquals(values, key);
  if (raw === undefined) return '';
  const value = switchValue(raw);
  if (value === '' || value === '0' || value === '1') return '';
  return `${key}=${value} in .env is not a switch value, and the start refuses it. Tick or untick it and save to set it.`;
}

// `raw` is the text after `=` of a key's last line, or undefined for an absent key.
//
// Only `0` is off. A value the start refuses reads as on: the dashboard has no refusal of its
// own, the start puts the refusal in the banner, and on is the side where nothing is hidden.
export function componentsOn(raw: (key: string) => string | undefined): Record<Component, boolean> {
  const on = (key: string) => switchValue(raw(key) ?? '') !== '0';
  return {
    liquid: on(COMPONENT_KEYS.liquid),
    openclaw: on(COMPONENT_KEYS.openclaw),
    opencode: on(COMPONENT_KEYS.opencode)
  };
}
