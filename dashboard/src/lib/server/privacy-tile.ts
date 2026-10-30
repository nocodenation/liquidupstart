import { AGENTS_OFF_PRIVACY } from '../component-switches';

export function privacyTile(http: string, enabled: boolean, agentsOff = false) {
  const tile = {
    name: 'Privacy proxy',
    subtitle: 'what AI tools may see — terms, rules, documents',
    ...(agentsOff ? { warning: AGENTS_OFF_PRIVACY } : {})
  };
  return enabled
    ? { ...tile, url: `http://privacy.localhost:${http}/policy/ui` }
    : { ...tile, note: 'switched off — enable it under Privacy proxy in Configuration' };
}
