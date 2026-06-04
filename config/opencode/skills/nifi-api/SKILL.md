---
name: nifi-api
description: Build, run, and monitor Apache NiFi data flows via the NiFi REST API. Use for any "create a flow", "start/stop a processor", "ingest data", "schedule a pipeline", "monitor queue", or similar request.
---

**Port resolution:** run `echo $SYSTEM_HTTPS_PORT` → use the result as `HTTPS_PORT`; run `echo $SYSTEM_HTTP_PORT` → use as `PORT`. Never guess or default these values.

NiFi is available at `https://nifi.localhost:HTTPS_PORT`. It uses a **self-signed certificate** — always pass `-k` (or `--insecure`) in every curl call to skip TLS verification.

## Authentication — token from environment

NiFi uses bearer tokens. Credentials are already available as environment variables — **never ask the user for them**. Generate a token at the start of any session that needs the API:

```bash
NIFI_TOKEN=$(curl -sk \
  -X POST https://nifi.localhost:${SYSTEM_HTTPS_PORT}/nifi-api/access/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "username=${NIFI_USERNAME}" \
  --data-urlencode "password=${NIFI_PASSWORD}" \
)
```

Use it as a Bearer token on every subsequent call:

```bash
curl -sk -H "Authorization: Bearer $NIFI_TOKEN" \
  https://nifi.localhost:${SYSTEM_HTTPS_PORT}/nifi-api/flow/status
```

Tokens expire after 12 hours. If you get a `401`, regenerate with the same command above.

## API discovery — always start here

The full OpenAPI specification is available at: `https://nifi.apache.org/nifi-docs/swagger.yaml`

Use this spec to discover all available endpoints, their parameters, and request/response schemas. Do not rely on memory for endpoint details — fetch the spec and use it.

## Ingress ports (8900–8999)

NiFi can listen for incoming HTTP/TCP data on ports in the range **8900–8999**. Each ingress port is routed through nginx as a subdomain of `nifi.localhost` — the port number becomes the subdomain, and the external HTTPS port is `HTTPS_PORT` (resolved from `$SYSTEM_HTTPS_PORT`).

When you configure a processor to listen on one of these ports (e.g. `ListenHTTP` on port `8900`), resolve `HTTPS_PORT` first (`echo $SYSTEM_HTTPS_PORT`), then give the user the ingress URL:

- `https://8900.nifi.localhost:HTTPS_PORT/<configured-path>`

## SSL Context Service

Whenever a processor or flow requires an SSL context service (e.g. `HandleHttpRequest`, `InvokeHTTP` over HTTPS, `ListenHTTP` with TLS), first check whether a `StandardRestrictedSSLContextService` controller service already exists (list controller services via the API). If one exists, reuse it — do not create a duplicate. If none exists, create one with these exact property values — read `$NIFI_KEYSTORE_PASSWORD` from the environment first:

```bash
echo $NIFI_KEYSTORE_PASSWORD
```

| Property | Value |
|---|---|
| Keystore Filename | `/certs/nifi.keystore.p12` |
| Keystore Password | value of `$NIFI_KEYSTORE_PASSWORD` |
| Key Password | value of `$NIFI_KEYSTORE_PASSWORD` |
| Keystore Type | `PKCS12` |
| Truststore Filename | `/certs/nifi.truststore.p12` |
| Truststore Password | value of `$NIFI_KEYSTORE_PASSWORD` |
| Truststore Type | `PKCS12` |
| TLS Protocol | `TLS` |

Enable the controller service after creating it. Never ask the user for the keystore password — it is already injected as `$NIFI_KEYSTORE_PASSWORD`.

## Connecting NiFi to other services

When a NiFi processor needs to call another service (PostgREST, Nextcloud, OpenProject, etc.), use the same `X.localhost:PORT` URLs from the services table in the main instructions — these resolve from inside NiFi containers just as they do from the browser.

Example: an `InvokeHTTP` processor posting to PostgREST uses `http://postgrest.localhost:PORT/{table}` with `Authorization: Bearer <POSTGREST_API_KEY>`. Resolve `PORT` from `$SYSTEM_HTTP_PORT` before configuring the processor URL.

## Error handling

- `401` — token expired or invalid; regenerate with `POST /access/token`.
- `409 Conflict` — stale revision version; re-fetch the resource and retry with its current `revision.version`.
- `400` — validation error; check the `message` field in the response body.
- If a processor shows a red badge in the UI, check `/flow/bulletin-board` for the message.

## Links you give the user

Resolve `HTTPS_PORT` with `echo $SYSTEM_HTTPS_PORT` first, then give:

- **NiFi canvas**: `https://nifi.localhost:HTTPS_PORT/nifi`
- **Specific process group**: `https://nifi.localhost:HTTPS_PORT/nifi/?processGroupId={groupId}`

Never give the user `/nifi-api/` URLs — those return JSON for machines.
