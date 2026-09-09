export function privacyTile(http: string, enabled: boolean) {
  const tile = { name: 'Privacy proxy', subtitle: 'what AI tools may see — terms, rules, documents' };
  return enabled
    ? { ...tile, url: `http://privacy.localhost:${http}/policy/ui` }
    : { ...tile, note: 'switched off — enable it in Configuration (section 7)' };
}
