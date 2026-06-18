import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { envValues, isConfigured, stackState } from '$lib/server/project';

// The service catalog mirrors the URL/credential listing start.sh prints.
export const load: PageServerLoad = async () => {
  if (!isConfigured()) redirect(302, '/config');

  const env = envValues();
  const get = (key: string, fallback = '') => env.get(key)?.value || fallback;
  const http = get('SYSTEM_HTTP_PORT', '8888');
  const https = get('SYSTEM_HTTPS_PORT', '8833');
  const email = get('PGADMIN_DEFAULT_EMAIL');

  const groups = [
    {
      title: 'Storage',
      tiles: [
        {
          name: 'NextCloud',
          url: `http://nextcloud.localhost:${http}`,
          // Login is automatic; the password is only asked for administrative
          // confirmation prompts inside NextCloud.
          creds: [{ label: 'password', value: email }]
        },
        { name: 'pgAdmin', url: `http://pgadmin.localhost:${http}` },
        { name: 'REST API', url: `http://postgrest.localhost:${http}` },
        { name: 'Swagger UI', url: `http://swagger.localhost:${http}` },
        {
          name: 'Gitea',
          url: `http://git.localhost:${http}`,
          creds: [
            { label: 'username', value: get('GITEA_ADMIN_USER') },
            { label: 'password', value: get('GITEA_ADMIN_PASSWORD') }
          ]
        }
      ]
    },
    {
      title: 'Applications',
      tiles: [
        {
          name: 'NiFi',
          url: `https://nifi.localhost:${https}`,
          creds: [
            { label: 'username', value: get('NIFI_USERNAME') },
            { label: 'password', value: get('NIFI_PASSWORD') }
          ]
        },
        {
          name: 'Node app',
          url: `http://app.localhost:${http}`,
          note: 'build an app using OpenClaw first'
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
        { name: 'OpenClaw', url: `http://openclaw.localhost:${http}`, note: 'recommended' },
        { name: 'OpenCode', url: `http://opencode.localhost:${http}` }
      ]
    }
  ];

  const extras = [
    // hermes disabled (not built/started)
    // { name: 'Hermes API', url: `http://api.hermes.localhost:${http}` },
    // { name: 'Hermes webhooks', url: `http://webhooks.hermes.localhost:${http}` },
    {
      name: 'NiFi ingresses',
      note: `ports 8900-8999, served on https://PORT.nifi.localhost:${https}`
    },
    { name: 'OpenClaw node bridge', url: `http://bridge.openclaw.localhost:${http}` },
    { name: 'OpenClaw MS Teams endpoint', url: `http://msteams.openclaw.localhost:${http}` }
  ];

  return { ...(await stackState()), groups, extras };
};
