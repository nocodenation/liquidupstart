---
name: nextcloud-user-link
description: Construct the correct user-facing link to a file or folder in Nextcloud. Use whenever you need to show the user where a file is, embed a Nextcloud reference in a chat reply or a work package, or decide whether to create a share.
---

**Port resolution:** run `echo $SYSTEM_HTTP_PORT` and use the result as `PORT` in every URL below. Never guess or use a default.

This skill exists because pointing the user at a Nextcloud file is a place LLMs
repeatedly get wrong: they paste WebDAV URLs (machine-only), link the parent folder
(forces the user to hunt for the file), or create public shares (leak the file to
anyone with the URL). Follow the rules below exactly.

## The default — link to the file, in the Files app, no shares

The user is already logged into Nextcloud as themselves and has full access to every
file you wrote on their behalf. The right link opens **that specific file** in their
existing session. Canonical shape (PORT = resolved `$SYSTEM_HTTP_PORT`):

```
http://nextcloud.localhost:PORT/apps/files/files/<fileid>?dir=/<readable-parent>&openfile=true&editing=false
```

- `<fileid>` — numeric Nextcloud file ID. Get it via the **nextcloud-webdav** skill
  (the `OC-FileId` upload response header, or a PROPFIND for `<oc:fileid/>`).
- `<dir>` — parent folder exactly as it appears in the Files app, with a leading `/`.
  **Do not URL-encode path segments**; Nextcloud expects a readable path. Only encode
  `#`, `&`, `?` if they appear in folder/file names.
- `openfile=true` — auto-open the viewer for `<fileid>` once the folder loads.
- `editing=false` — open in the read-only viewer, not the editor. Only set
  `editing=true` when the user explicitly asked to edit.

| Goal | Link for the user |
|---|---|
| **Default**: "give me a link to the file" | `http://nextcloud.localhost:PORT/apps/files/files/<fileid>?dir=/<parent>&openfile=true&editing=false` |
| User asked for the folder, not the file | `http://nextcloud.localhost:PORT/apps/files/files?dir=/<readable-path>` |
| Open the Files app at the root | `http://nextcloud.localhost:PORT/apps/files/files?dir=/` |

## What a correct reply looks like

Resolve PORT first (`echo $SYSTEM_HTTP_PORT`), then reply:

> Saved to `Documents/report.pdf` — open it here:
> `http://nextcloud.localhost:PORT/apps/files/files/12345?dir=/Documents&openfile=true&editing=false`

(`12345` is the actual file ID you captured at upload or fetched via PROPFIND.)

A reply that points the user at the parent folder (`...?dir=/Documents`) without
`openfile=true&editing=false` is a regression — the user then has to scan the folder
for the file you just told them about. Always include `<fileid>`, `openfile=true`,
and `editing=false` when you have a specific file in mind.

## What never to send the user

- WebDAV URLs (any `/remote.php/dav/...` form) — machine endpoints; render as raw
  XML or trigger a download dialog.
- Public-share URLs (`http://nextcloud.localhost:PORT/s/<token>`) — unless the user
  **explicitly** asked for one (see next section).

This applies equally to chat replies, OpenProject work-package descriptions and
comments, generated UI, log lines a user will read, and any other surface visible to
the user. **Once a public-share token lands in a work package or notification email,
it can never be un-leaked.**

## When public shares *are* allowed

Only call the OCS shares endpoint when the user has **explicitly** asked for a public
/ shareable / "anyone with the link can view" URL. Confirm back first:

> This will make the file viewable by anyone who has the link — proceed?

After confirmation:

```bash
curl -s -u "$PGADMIN_DEFAULT_EMAIL:$NC_APP_PASSWORD" \
  -X POST "http://proxy:${SYSTEM_HTTP_PORT}/ocs/v2.php/apps/files_sharing/api/v1/shares" \
  -H "Host: nextcloud.localhost:${SYSTEM_HTTP_PORT}" \
  -H "OCS-APIRequest: true" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "path=<path-relative-to-user-root>&shareType=3&permissions=1"
```

The response includes a `<url>` field with `http://nextcloud.localhost:PORT/s/<token>` —
resolve PORT first (`echo $SYSTEM_HTTP_PORT`), then give that URL to the user.

If asked for a share that is **not** public (e.g. "share with another user"), use
`shareType=0` with `shareWith=<username>` — that keeps access scoped.

## Fallback

Only if both `OC-FileId` capture and PROPFIND fail, fall back to a folder-only link
(`?dir=/<parent>` with no `openfile`) — and **name the file in the surrounding
sentence** so the user knows what to look for.
