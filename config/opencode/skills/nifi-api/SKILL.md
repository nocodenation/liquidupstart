---
name: nifi-api
description: Build, run, and monitor Apache NiFi data flows via the NiFi REST API. Use for any "create a flow", "start/stop a processor", "ingest data", "schedule a pipeline", "monitor queue", or similar request.
---

NiFi is available at `https://nifi.localhost:8833`. It uses a **self-signed certificate** — always pass `-k` (or `--insecure`) in every curl call to skip TLS verification.

## Authentication — token from environment

NiFi uses bearer tokens. Credentials are already available as environment variables — **never ask the user for them**. Generate a token at the start of any session that needs the API:

```bash
NIFI_TOKEN=$(curl -sk \
  -X POST https://nifi.localhost:8833/nifi-api/access/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "username=${NIFI_USERNAME}" \
  --data-urlencode "password=${NIFI_PASSWORD}" \
)
```

Use it as a Bearer token on every subsequent call:

```bash
curl -sk -H "Authorization: Bearer $NIFI_TOKEN" \
  https://nifi.localhost:8833/nifi-api/flow/status
```

Tokens expire after 12 hours. If you get a `401`, regenerate with the same command above.

## API discovery — always start here

The full OpenAPI specification is available at: `https://nifi.apache.org/nifi-docs/swagger.yaml`

Use this spec to discover all available endpoints, their parameters, and request/response schemas. Do not rely on memory for endpoint details — fetch the spec and use it.

## Ingress ports (8900–8999)

NiFi can listen for incoming HTTP/TCP data on ports in the range **8900–8999**. These ports are published from the NiFi container and are directly reachable from the user's browser and from other containers on the Docker network.

When you configure a processor to listen on one of these ports (e.g. `ListenHTTP` on port `8900`), the ingress URL for the user is:

- `https://nifi.localhost:8900/<configured-path>`

Give the user that direct-port URL when an ingress is ready.

## Connecting NiFi to other services

When a NiFi processor needs to call another service (PostgREST, Nextcloud, OpenProject, etc.), use the same `X.localhost:8888` URLs from the services table in the main instructions — these resolve from inside NiFi containers just as they do from the browser.

Example: an `InvokeHTTP` processor posting to PostgREST uses `http://postgrest.localhost:8888/{table}` with `Authorization: Bearer <POSTGREST_API_KEY>`.

## Error handling

- `401` — token expired or invalid; regenerate with `POST /access/token`.
- `409 Conflict` — stale revision version; re-fetch the resource and retry with its current `revision.version`.
- `400` — validation error; check the `message` field in the response body.
- If a processor shows a red badge in the UI, check `/flow/bulletin-board` for the message.

## Links you give the user

- **NiFi canvas**: `https://nifi.localhost:8833/nifi`
- **Specific process group**: `https://nifi.localhost:8833/nifi/?processGroupId={groupId}`

Never give the user `/nifi-api/` URLs — those return JSON for machines.
