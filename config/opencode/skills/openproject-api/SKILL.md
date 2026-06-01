---
name: openproject-api
description: Read and write OpenProject resources (work packages, projects, users, time entries, queries) via its HAL+JSON REST API. Use for any "create a task", "list tickets", "update status", "find work packages", or similar request.
---

OpenProject exposes a HAL+JSON REST API (v3) at the internal URL
`http://proxy:8105/api/v3`. The user-facing web UI lives at `http://localhost:8105`
— see **Links you give to the user** below for translation.

## Authentication — ask the user for an API token

OpenProject requires a per-user API token, and **the OpenCode container does not have
one**. The first time you need to call the OpenProject API in a session, ask the user
with this exact wording:

> I need an OpenProject API token to call the OpenProject API on your behalf.
> Open the tokens page (you're already logged in):
> **http://localhost:8105/my/access_tokens**
> Under **API**, click **+ Generate** (or copy an existing one), then paste the token
> here. I will keep it only for this session.

Once provided, hold it in memory for the rest of the session — never write it to disk
and never echo it back in responses or logs. If you are running autonomously and the
user is not available to ask, stop and report that an OpenProject API token is
required; do not attempt anonymous access or invent a token.

The token is used as HTTP Basic Auth with the **literal** username `apikey` and the
token as the password. The examples below use `$OP_TOKEN` as a shell placeholder for
the value the user pasted:

```bash
curl -s -u "apikey:$OP_TOKEN" \
  -H "Accept: application/json" \
  http://proxy:8105/api/v3
```

If a request returns `401`, the token is likely wrong or revoked — ask the user for a
new one (same prompt above) before retrying.

## Discovering endpoints

The API root is HAL: it links to every collection. Start there when unsure:

```bash
curl -s -u "apikey:$OP_TOKEN" http://proxy:8105/api/v3 | jq '._links | keys'
```

Common endpoints:

| Resource | Path |
|---|---|
| Projects | `GET /api/v3/projects` |
| Work packages (global) | `GET /api/v3/work_packages` |
| Work packages in a project | `GET /api/v3/projects/{id}/work_packages` |
| Single work package | `GET /api/v3/work_packages/{id}` |
| Users | `GET /api/v3/users` |
| Current user | `GET /api/v3/users/me` |
| Statuses / Types / Priorities | `/api/v3/statuses`, `/types`, `/priorities` |
| Time entries | `GET /api/v3/time_entries` |

## Filtering, paging, sorting

`filters` is a JSON-encoded array; URL-encode it:

```bash
# Open work packages in project 3, page 1, 25/page, newest first
curl -s -u "apikey:$OP_TOKEN" \
  --get http://proxy:8105/api/v3/projects/3/work_packages \
  --data-urlencode 'filters=[{"status_id":{"operator":"o","values":[]}}]' \
  --data-urlencode 'pageSize=25' \
  --data-urlencode 'offset=1' \
  --data-urlencode 'sortBy=[["updatedAt","desc"]]'
```

## Create a work package

Related resources are referenced via HAL `_links` by their API URI:

```bash
curl -s -u "apikey:$OP_TOKEN" \
  -X POST http://proxy:8105/api/v3/projects/3/work_packages \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "New task from OpenCode",
    "description": {"format": "markdown", "raw": "Created via API."},
    "_links": {
      "type":     {"href": "/api/v3/types/1"},
      "priority": {"href": "/api/v3/priorities/8"}
    }
  }'
```

## Update a work package

Updates require the current `lockVersion` (optimistic concurrency). Fetch first, then
PATCH with the `lockVersion` you received:

```bash
curl -s -u "apikey:$OP_TOKEN" \
  -X PATCH http://proxy:8105/api/v3/work_packages/42 \
  -H "Content-Type: application/json" \
  -d '{
    "lockVersion": 7,
    "subject": "Updated subject",
    "_links": {"status": {"href": "/api/v3/statuses/3"}}
  }'
```

## Response shape

HAL+JSON: payload at the top level, related-resource URIs under `_links`, embedded
sub-resources under `_embedded`. Collections list items at `_embedded.elements` with
paging info at the top level (`total`, `count`, `pageSize`, `offset`).

```bash
curl -s -u "apikey:$OP_TOKEN" http://proxy:8105/api/v3/work_packages \
  | jq '._embedded.elements[] | {id, subject, status: ._links.status.title}'
```

## Errors

HAL document with `_type: "Error"`, `errorIdentifier`, and a human-readable `message`.
- `401` — token unset/invalid; stop and report.
- `422` — validation failure; check `_embedded.details`.
- `409` on PATCH — stale `lockVersion`; re-fetch and retry.

## Links you give to the user

`/api/v3/...` URLs return JSON for machines — **never** quote one back to the user.
Translate to the web URL on `http://localhost:8105`:

| API path (your calls) | Link for the user |
|---|---|
| `/api/v3/work_packages/<id>` | `http://localhost:8105/work_packages/<id>` |
| `/api/v3/projects/<id>` | `http://localhost:8105/projects/<id>` |
| `/api/v3/projects/<id>/work_packages` | `http://localhost:8105/projects/<id>/work_packages` |
| `/api/v3/users/<id>` | `http://localhost:8105/users/<id>` |
| `/api/v3/queries/<id>` | `http://localhost:8105/projects/<project-id>/work_packages?query_id=<id>` |

The numeric `<id>` from the HAL `_links.self.href` is the same in both spaces — swap
the host, drop `/api/v3`, use the matching web route.

## Referencing Nextcloud files inside work packages

When a description, comment, or attachment note needs to point at a file in Nextcloud,
embed the Files-app deep link to that specific file — see the **nextcloud-user-link**
skill. **Never** paste a public-share URL (`http://localhost:8106/s/<token>`) into a
work package: descriptions, history, and notification emails propagate that token
forever, and the file becomes accessible to anyone the URL ever reaches.
