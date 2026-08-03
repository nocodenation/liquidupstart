---
name: nextcloud-webdav
description: Discover, read, write, list, and delete user files in Nextcloud — the source of truth for all user data — over WebDAV. Use whenever you need to find out what files exist ("what books / PDFs / documents / images are in the system", "list my files", "what data do I have"), or save / read / delete a specific file.
---

**Port resolution:** run `echo $SYSTEM_HTTP_PORT` → use the result as `PORT`. Never guess or use a default.

User files live in **Nextcloud**, the **source of truth** for any user-owned content;
if the user asks about *what files exist*, the answer comes from a PROPFIND here, **not**
from a filesystem listing inside this container.

Reach Nextcloud from inside the containers through the nginx **proxy**: connect to
`http://proxy:${SYSTEM_HTTP_PORT}` and set `-H "Host: nextcloud.localhost:${SYSTEM_HTTP_PORT}"`
(the `X.localhost` name does not resolve in-container — see the main instructions'
**URL rule**). Append the WebDAV path to that proxy URL, e.g.
`/remote.php/dav/files/$PGADMIN_DEFAULT_EMAIL/...`. Every curl below already uses this form.

A `/data` folder is also mounted, but it is a one-way scratch/staging space shared
with the Bun Runner container — **not** where user data lives. `find /data` and
`ls /data` are not valid ways to discover user content; `/data` is empty by default
and is only populated when you explicitly copy a named file into it for use by an app
in `/app` (see the **bun-app** skill).

## Discovering what files the user has

The first thing to do whenever the user references existing content ("the books",
"my PDFs", "what documents are there", "all the images") is list Nextcloud from the
WebDAV root with `Depth: infinity`:

```bash
curl -s -u "$PGADMIN_DEFAULT_EMAIL:$NC_APP_PASSWORD" \
  -X PROPFIND \
  -H "Depth: infinity" \
  -H "Host: nextcloud.localhost:${SYSTEM_HTTP_PORT}" \
  "http://proxy:${SYSTEM_HTTP_PORT}/remote.php/dav/files/$PGADMIN_DEFAULT_EMAIL/" \
  | xmllint --xpath "//*[local-name()='href']/text()" -
```

Or scope it to a likely subfolder with `Depth: 1` (e.g. `Documents/`, `Books/`).
Filter the output by extension or path as needed (`grep -i '\.pdf$'`,
`grep -i books/`, etc.). **Never** substitute `find /data` for this step — `/data`
will not contain user uploads.

## Endpoint and authentication

The WebDAV username is injected as `$PGADMIN_DEFAULT_EMAIL` (e.g.
`user@nocodenation.org`). The WebDAV **password** is the app password the user stored
from the dashboard; it is mounted read-only at `/secrets/.app_password`. Load it once
per session, before the first Nextcloud call:

```bash
NC_APP_PASSWORD="$(cat /secrets/.app_password 2>/dev/null)"
```

Never echo it back in responses or logs, and never write to `/secrets` — the mount is
read-only and the dashboard owns that file.

If the value comes back empty (no password stored yet), ask the user with this wording,
substituting PORT with the value of `echo $SYSTEM_HTTP_PORT`:

> I need a Nextcloud app password to read/write your files over WebDAV.
> Open the Liquid Upstart dashboard, find the **NextCloud** tile and click
> **Add app password** — it opens
> **http://nextcloud.localhost:PORT/settings/user/security**, where you scroll to
> **Devices & sessions**, enter a name (e.g. "OpenCode") and click **Create new app
> password**. Paste the generated token back into the dashboard tile and save. It is
> stored once and every future session picks it up automatically.

If you are running autonomously and the user is not available to ask, stop and report
that a Nextcloud app password is required; do not attempt anonymous access.

The examples below use `$NC_APP_PASSWORD` as a shell placeholder for that value.

The per-user WebDAV path, appended to the proxy URL (PORT = resolved `$SYSTEM_HTTP_PORT`):

```
http://proxy:PORT/remote.php/dav/files/$PGADMIN_DEFAULT_EMAIL/   (Host: nextcloud.localhost:PORT)
```

Pass `-u "$PGADMIN_DEFAULT_EMAIL:$NC_APP_PASSWORD"` and `-H "Host: nextcloud.localhost:PORT"`
on every request.

**Why an app password and not the plain login password:** Nextcloud is patched (see
`config/nextcloud/session_security_block.php`) to reject Basic-auth logins where
`username == password`. The patch only applies to plain passwords, not tokens — so
the WebDAV password must be a Nextcloud **app password**, which is exactly what the
**Devices & sessions** page generates.

## List a directory (PROPFIND)

```bash
curl -s -u "$PGADMIN_DEFAULT_EMAIL:$NC_APP_PASSWORD" \
  -X PROPFIND \
  -H "Depth: 1" \
  -H "Host: nextcloud.localhost:${SYSTEM_HTTP_PORT}" \
  "http://proxy:${SYSTEM_HTTP_PORT}/remote.php/dav/files/$PGADMIN_DEFAULT_EMAIL/"
```

Returns XML. Pipe through
`xmllint --xpath "//*[local-name()='href']/text()" -` to extract just paths.

## Download a file

```bash
curl -s -u "$PGADMIN_DEFAULT_EMAIL:$NC_APP_PASSWORD" \
  -o /tmp/report.pdf \
  -H "Host: nextcloud.localhost:${SYSTEM_HTTP_PORT}" \
  "http://proxy:${SYSTEM_HTTP_PORT}/remote.php/dav/files/$PGADMIN_DEFAULT_EMAIL/Documents/report.pdf"
```

## Upload a file

`PUT` overwrites if the target exists; parent directories must exist first (`MKCOL`).

```bash
curl -s -u "$PGADMIN_DEFAULT_EMAIL:$NC_APP_PASSWORD" \
  -X PUT \
  --data-binary @/tmp/output.json \
  -H "Content-Type: application/json" \
  -H "Host: nextcloud.localhost:${SYSTEM_HTTP_PORT}" \
  "http://proxy:${SYSTEM_HTTP_PORT}/remote.php/dav/files/$PGADMIN_DEFAULT_EMAIL/OpenCode/output.json"
```

### Capture the file ID at upload time

If you will later show the user a link to this file, capture the `OC-FileId` response
header **now** so you don't have to PROPFIND for it later (see the
**nextcloud-user-link** skill for why this matters):

```bash
curl -s -D - -u "$PGADMIN_DEFAULT_EMAIL:$NC_APP_PASSWORD" \
  -X PUT --data-binary @/tmp/report.pdf \
  -H "Host: nextcloud.localhost:${SYSTEM_HTTP_PORT}" \
  "http://proxy:${SYSTEM_HTTP_PORT}/remote.php/dav/files/$PGADMIN_DEFAULT_EMAIL/Documents/report.pdf" \
  | awk 'BEGIN{IGNORECASE=1} /^OC-FileId:/ {print $2}' | tr -d '\r' | sed 's/[^0-9].*//'
```

The header value looks like `12345ocxxxxxxxxxx`; the leading digits are the numeric
file ID.

## Create a directory

```bash
curl -s -u "$PGADMIN_DEFAULT_EMAIL:$NC_APP_PASSWORD" \
  -X MKCOL \
  -H "Host: nextcloud.localhost:${SYSTEM_HTTP_PORT}" \
  "http://proxy:${SYSTEM_HTTP_PORT}/remote.php/dav/files/$PGADMIN_DEFAULT_EMAIL/OpenCode"
```

## Delete a file or directory

```bash
curl -s -u "$PGADMIN_DEFAULT_EMAIL:$NC_APP_PASSWORD" \
  -X DELETE \
  -H "Host: nextcloud.localhost:${SYSTEM_HTTP_PORT}" \
  "http://proxy:${SYSTEM_HTTP_PORT}/remote.php/dav/files/$PGADMIN_DEFAULT_EMAIL/OpenCode/old.json"
```

## Look up a file's ID after the fact

When the file already exists and the upload response is gone:

```bash
curl -s -u "$PGADMIN_DEFAULT_EMAIL:$NC_APP_PASSWORD" \
  -X PROPFIND -H "Depth: 0" \
  -H "Host: nextcloud.localhost:${SYSTEM_HTTP_PORT}" \
  --data '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>' \
  "http://proxy:${SYSTEM_HTTP_PORT}/remote.php/dav/files/$PGADMIN_DEFAULT_EMAIL/Documents/report.pdf" \
  | xmllint --xpath "//*[local-name()='fileid']/text()" -
```

## Sharing files with the Bun Runner

The Bun Runner container does **not** carry Nextcloud credentials of its own. When an
app in `/app` needs user files, the **bun-app** skill drives the decision: either you
(in this container) download files from Nextcloud over WebDAV into `/data/<name>` so
the app reads them via the local filesystem, or the app fetches them directly using
URLs you pass to it. The `/data` mount is shared with the Bun Runner — the path
`/data/<name>` resolves to the same bytes in both containers. See the **bun-app**
skill (*Data the app reads or writes*) for the full flow.

## Errors

- `401 Unauthorized` — the stored app password is wrong, expired, or revoked (or
  `$PGADMIN_DEFAULT_EMAIL` is unset). Don't retry, and don't ask the user to paste a
  replacement into the chat: it has to be replaced at the source, via **Change app
  password** on the dashboard's NextCloud tile. Ask them to do that, then re-read
  `/secrets/.app_password`. Plain-password Basic auth (`username == password`) is
  blocked server-side — only an app-password token authenticates.
- `404 Not Found` — path doesn't exist; PROPFIND the parent first.
- `405 Method Not Allowed` on `MKCOL` — directory already exists; safe to proceed.
- `409 Conflict` on `PUT` — parent directory missing; `MKCOL` it first.
- `423 Locked` — another client holds a WebDAV lock; retry shortly.

## Rules

- Never share a `/remote.php/dav/...` URL with the user — that's a machine endpoint.
  For user-facing links, use the **nextcloud-user-link** skill.
- Capture `OC-FileId` at upload time when you know you'll need to link to the file.
