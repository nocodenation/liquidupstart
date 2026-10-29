import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
  envValues,
  installedComponents,
  isConfigured,
  readAppPassword,
  stackState
} from '$lib/server/project';
import { privacyTile } from '$lib/server/privacy-tile';
import { gitCard } from '$lib/server/git';
import {
  AGENTS_OFF_REPOSITORIES,
  SWITCHED_OFF_NOTE,
  bothAgentsOff,
  nodeAppNote,
  type Component
} from '$lib/component-switches';

// The service catalog mirrors the URL/credential listing start.sh prints.
export const load: PageServerLoad = async () => {
  if (!isConfigured()) redirect(302, '/config');

  const env = envValues();
  const get = (key: string, fallback = '') => env.get(key)?.value || fallback;
  const http = get('SYSTEM_HTTP_PORT', '8888');
  const https = get('SYSTEM_HTTPS_PORT', '8833');
  const email = get('PGADMIN_DEFAULT_EMAIL');
  const components = installedComponents(env);

  // A switched-off component's tile keeps its name and says why it has no link: a link to it
  // would answer 502, and its credentials open nothing (CS-FR9).
  const owned = <T extends { name: string; subtitle?: string }>(component: Component, entry: T) =>
    components[component]
      ? entry
      : {
          name: entry.name,
          ...(entry.subtitle ? { subtitle: entry.subtitle } : {}),
          note: SWITCHED_OFF_NOTE
        };

  const groups = [
    {
      title: 'Storage',
      tiles: [
        {
          name: 'NextCloud',
          kind: 'nextcloud',
          url: `http://nextcloud.localhost:${http}`,
          securityUrl: `http://nextcloud.localhost:${http}/settings/user/security`,
          appPassword: readAppPassword(),
          // Login is automatic; the password is only asked for administrative
          // confirmation prompts inside NextCloud.
          creds: [{ label: 'password', value: email }]
        },
        { name: 'pgAdmin', url: `http://pgadmin.localhost:${http}` },
        { name: 'REST API', url: `http://postgrest.localhost:${http}` },
        { name: 'Swagger UI', url: `http://swagger.localhost:${http}` }
      ]
    },
    {
      title: 'Applications',
      tiles: [
        owned('liquid', {
          name: 'Liquid.MX',
          subtitle: 'powered by NiFi',
          url: `https://liquid.localhost:${https}`,
          creds: [
            { label: 'username', value: get('LIQUID_USERNAME') },
            { label: 'password', value: get('LIQUID_PASSWORD') }
          ]
        }),
        {
          name: 'Node app',
          url: `http://app.localhost:${http}`,
          note: nodeAppNote(components)
        },
        { name: 'OpenProject', url: `http://openproject.localhost:${http}` }
      ]
    },
    {
      title: 'AI Harnesses',
      tiles: [
        // hermes disabled (not built/started)
        // {
        //   name: 'Hermes',
        //   url: `http://hermes.localhost:${http}`,
        //   creds: [{ label: 'API/Webhooks token', value: get('HERMES_API_KEY') }]
        // },
        owned('openclaw', { name: 'OpenClaw', url: `http://openclaw.localhost:${http}`, note: 'recommended' }),
        owned('opencode', { name: 'OpenCode', url: `http://opencode.localhost:${http}` }),
        privacyTile(http, get('PRIVACY_PROXY_ENABLE') === '1', bothAgentsOff(components))
      ]
    }
  ];

  const extras = [
    // hermes disabled (not built/started)
    // { name: 'Hermes API', url: `http://api.hermes.localhost:${http}` },
    // { name: 'Hermes webhooks', url: `http://webhooks.hermes.localhost:${http}` },
    owned('liquid', {
      name: 'Liquid ingresses',
      note: `ports 8900-8999, served on https://PORT.liquid.localhost:${https}`
    }),
    owned('openclaw', { name: 'OpenClaw node bridge', url: `http://bridge.openclaw.localhost:${http}` }),
    owned('openclaw', {
      name: 'OpenClaw MS Teams endpoint',
      url: `http://msteams.openclaw.localhost:${http}`
    })
  ];

  const git = {
    ...gitCard(),
    ...(bothAgentsOff(components) ? { notice: AGENTS_OFF_REPOSITORIES } : {})
  };

  return { ...(await stackState(env)), groups, extras, git, components };
};
