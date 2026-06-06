---
name: nifi-api
description: Build, run, and monitor Apache NiFi data flows via the NiFi REST API. Use for any "create a flow", "start/stop a processor", "ingest data", "schedule a pipeline", "monitor queue", or similar request.
---

**Port resolution:** run `echo $SYSTEM_HTTPS_PORT` → use the result as `HTTPS_PORT`; run `echo $SYSTEM_HTTP_PORT` → use as `PORT`. Never guess or default these values.

NiFi's REST API is reached from inside the containers through the nginx **proxy**:
connect to `https://proxy:${SYSTEM_HTTPS_PORT}` and set
`-H "Host: nifi.localhost:${SYSTEM_HTTPS_PORT}"` (the `X.localhost` name does not resolve
in-container — see the main instructions' **URL rule**). It uses a **self-signed
certificate** — always pass `-k` (or `--insecure`) in every curl call to skip TLS
verification. Every API curl below already uses this form.

## Authentication — token from environment

NiFi uses bearer tokens. Credentials are already available as environment variables — **never ask the user for them**. Generate a token at the start of any session that needs the API:

```bash
NIFI_TOKEN=$(curl -sk \
  -X POST https://proxy:${SYSTEM_HTTPS_PORT}/nifi-api/access/token \
  -H "Host: nifi.localhost:${SYSTEM_HTTPS_PORT}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "username=${NIFI_USERNAME}" \
  --data-urlencode "password=${NIFI_PASSWORD}" \
)
```

Use it as a Bearer token on every subsequent call:

```bash
curl -sk -H "Authorization: Bearer $NIFI_TOKEN" \
  -H "Host: nifi.localhost:${SYSTEM_HTTPS_PORT}" \
  https://proxy:${SYSTEM_HTTPS_PORT}/nifi-api/flow/status
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

When a NiFi processor needs to call another service (PostgREST, Nextcloud, OpenProject, etc.), it must go through the nginx **proxy** the same way the API calls above do — the `X.localhost` names don't resolve reliably in-container (see the main instructions' **URL rule**). Point the processor's URL at `http://proxy:PORT` (or `https://proxy:HTTPS_PORT`) and add a dynamic property named `Host` set to `<service>.localhost:PORT` so nginx routes it (in `InvokeHTTP`, dynamic properties are sent as request headers).

Example: an `InvokeHTTP` processor posting to PostgREST sets **Remote URL** = `http://proxy:8888/{table}` and a dynamic property **Host** = `postgrest.localhost:8888` — no `Authorization` header is needed, the proxy injects the bearer token and PostgREST accepts the request.

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
