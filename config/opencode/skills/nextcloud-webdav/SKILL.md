---
name: nextcloud-webdav
description: Discover, read, write, list, and delete user files in Nextcloud — the source of truth for all user data — over WebDAV. Use whenever you need to find out what files exist ("what books / PDFs / documents / images are in the system", "list my files", "what data do I have"), or save / read / delete a specific file.
---

User files live in **Nextcloud**, reached from this container at `http://proxy:8106`.
Nextcloud is the **source of truth** for any user-owned content; if the user asks
about *what files exist*, the answer comes from a PROPFIND here, **not** from a
filesystem listing inside this container.

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
  "http://proxy:8106/remote.php/dav/files/$PGADMIN_DEFAULT_EMAIL/" \
  | xmllint --xpath "//*[local-name()='href']/text()" -
```

Or scope it to a likely subfolder with `Depth: 1` (e.g. `Documents/`, `Books/`).
Filter the output by extension or path as needed (`grep -i '\.pdf$'`,
`grep -i books/`, etc.). **Never** substitute `find /data` for this step — `/data`
will not contain user uploads.

## Endpoint and authentication

The WebDAV username is injected as `$PGADMIN_DEFAULT_EMAIL` (e.g.
`user@nocodenation.org`). The WebDAV **password** is *not* injected — you must ask the
user for an app password. The first time you need to call Nextcloud in a session, ask
with this exact wording:

> I need a Nextcloud app password to read/write your files over WebDAV.
> Open your Security settings (you're already logged in):
> **http://localhost:8106/settings/user/security**
> Scroll to **Devices & sessions**, enter a name (e.g. "OpenCode"), click **Create new
> app password**, and paste the generated token here. I will keep it only for this
> session.

Once provided, hold it in memory for the rest of the session — never write it to disk
and never echo it back in responses or logs. If you are running autonomously and the
user is not available to ask, stop and report that a Nextcloud app password is
required; do not attempt anonymous access.

The examples below use `$NC_APP_PASSWORD` as a shell placeholder for the value the
user pasted.

The per-user WebDAV root:

```
http://proxy:8106/remote.php/dav/files/$PGADMIN_DEFAULT_EMAIL/
```

Pass `-u "$PGADMIN_DEFAULT_EMAIL:$NC_APP_PASSWORD"` on every request.

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
  "http://proxy:8106/remote.php/dav/files/$PGADMIN_DEFAULT_EMAIL/"
```

Returns XML. Pipe through
`xmllint --xpath "//*[local-name()='href']/text()" -` to extract just paths.

## Download a file

```bash
curl -s -u "$PGADMIN_DEFAULT_EMAIL:$NC_APP_PASSWORD" \
  -o /tmp/report.pdf \
  "http://proxy:8106/remote.php/dav/files/$PGADMIN_DEFAULT_EMAIL/Documents/report.pdf"
```

## Upload a file

`PUT` overwrites if the target exists; parent directories must exist first (`MKCOL`).

```bash
curl -s -u "$PGADMIN_DEFAULT_EMAIL:$NC_APP_PASSWORD" \
  -X PUT \
  --data-binary @/tmp/output.json \
  -H "Content-Type: application/json" \
  "http://proxy:8106/remote.php/dav/files/$PGADMIN_DEFAULT_EMAIL/OpenCode/output.json"
```

### Capture the file ID at upload time

If you will later show the user a link to this file, capture the `OC-FileId` response
header **now** so you don't have to PROPFIND for it later (see the
**nextcloud-user-link** skill for why this matters):

```bash
curl -s -D - -u "$PGADMIN_DEFAULT_EMAIL:$NC_APP_PASSWORD" \
  -X PUT --data-binary @/tmp/report.pdf \
  "http://proxy:8106/remote.php/dav/files/$PGADMIN_DEFAULT_EMAIL/Documents/report.pdf" \
  | awk 'BEGIN{IGNORECASE=1} /^OC-FileId:/ {print $2}' | tr -d '\r' | sed 's/[^0-9].*//'
```

The header value looks like `12345ocxxxxxxxxxx`; the leading digits are the numeric
file ID.

## Create a directory

```bash
curl -s -u "$PGADMIN_DEFAULT_EMAIL:$NC_APP_PASSWORD" \
  -X MKCOL \
  "http://proxy:8106/remote.php/dav/files/$PGADMIN_DEFAULT_EMAIL/OpenCode"
```

## Delete a file or directory

```bash
curl -s -u "$PGADMIN_DEFAULT_EMAIL:$NC_APP_PASSWORD" \
  -X DELETE \
  "http://proxy:8106/remote.php/dav/files/$PGADMIN_DEFAULT_EMAIL/OpenCode/old.json"
```

## Look up a file's ID after the fact

When the file already exists and the upload response is gone:

```bash
curl -s -u "$PGADMIN_DEFAULT_EMAIL:$NC_APP_PASSWORD" \
  -X PROPFIND -H "Depth: 0" \
  --data '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>' \
  "http://proxy:8106/remote.php/dav/files/$PGADMIN_DEFAULT_EMAIL/Documents/report.pdf" \
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

- `401 Unauthorized` — the app password the user pasted is wrong, expired, or revoked
  (or `$PGADMIN_DEFAULT_EMAIL` is unset). Re-ask the user for a fresh app password
  using the prompt in **Endpoint and authentication** instead of retrying. Plain-
  password Basic auth (`username == password`) is blocked server-side — only an
  app-password token authenticates.
- `404 Not Found` — path doesn't exist; PROPFIND the parent first.
- `405 Method Not Allowed` on `MKCOL` — directory already exists; safe to proceed.
- `409 Conflict` on `PUT` — parent directory missing; `MKCOL` it first.
- `423 Locked` — another client holds a WebDAV lock; retry shortly.

## Rules

- Internal calls always use `http://proxy:8106`. Never share a `/remote.php/dav/...`
  URL with the user — that's a machine endpoint. For user-facing links, use the
  **nextcloud-user-link** skill.
- Capture `OC-FileId` at upload time when you know you'll need to link to the file.
