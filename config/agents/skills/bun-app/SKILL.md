---
name: bun-app
description: Create or update the SSR React user-facing application in /bun_app, run by the Bun Runner container. Use whenever the user asks to "build a UI", "make a node app", "add a page", "update the app", or similar.
---

**Port resolution:** run `echo $SYSTEM_HTTP_PORT` → use the result as `PORT`. Never guess or use a default.

The Bun Runner container watches `/bun_app` and runs whatever lives there as an SSR React
application. The same `/bun_app` volume is mounted into this container, so file edits
land directly. The runner serves the app at `http://app.localhost:PORT` (PORT = resolved `$SYSTEM_HTTP_PORT`).

## Build and edit workflow

- Put all application code into `/bun_app` — pages, components, server entrypoint, etc.
- **Bump `version` in `/bun_app/package.json` on every edit** so the runner reliably
  picks up the change.
- When creating or modifying `package.json`, write it to `/tmp/package.json` first.
  Only after every other create/edit in `/bun_app` is done, copy `/tmp/package.json` to
  `/bun_app/package.json` — `package.json` must be the **last** file touched in `/bun_app`,
  because the runner restarts on package-manifest changes.

## The Bun Runner owns install and run — do not duplicate it

The Bun Runner container is **already running**. When you edit `/bun_app`, it:

1. **Installs dependencies** from `/bun_app/package.json` on its own. Do not run
   `bun install` / `npm install` / `yarn install` / `pnpm install` from this
   container. There is no install step for you to do.
2. **Starts and serves the app** on its internal port 3000, which is published as
   `app.localhost:PORT` on the host. Do not start a server process yourself — no
   `bun run`, `bun start`, `node server.js`, `npm run dev`, background `&` jobs,
   `nohup`, `pm2`, `tmux`, etc. There is no start step for you to do either.
3. **Restarts** when `package.json`'s `version` changes (which is why every edit must
   bump it — see *Build and edit workflow*).

Things this means in practice:

- **Port 3000 being "in use" by `bun_runner` is correct.** It's not a conflict to
  resolve; it's the running app. Do **not** "free up" the port, kill the bun_runner
  process, or pick a different port to run a parallel server on. A parallel server is
  unmanaged, unreachable from the published mapping, and invisible to the user.
- The app's URL is **always** `http://app.localhost:PORT` (PORT = resolved `$SYSTEM_HTTP_PORT`) — see *Telling the user
  where the app is*. Never invent a new URL; if you do, you are running a second
  process the runner does not know about and the user will be confused.
- If the runner doesn't pick up your change, the fix is not to run the app yourself.
  Bump `version` in `/bun_app/package.json` and check `/logs/bun_runner` (see *Where to
  look when something breaks*).
- If install or startup is failing, the symptoms are in `/logs/bun_runner` — read
  those, fix the cause in `/bun_app/`, don't side-step the runner.

## Where to look when something breaks

If install, build, or runtime fails, check `/logs/bun_runner` — dependency install,
build output, and runtime logs are all there.

## Credentials the app needs to call OpenProject or Nextcloud

The Bun Runner container does **not** carry credentials for OpenProject or Nextcloud,
and the user cannot reconfigure its environment (no editing env vars, no compose
changes). When the app you generate needs to call either service, ask the user for
the relevant credential using the prompt defined in the matching skill — then **embed
the value directly in the app's source code** under `/bun_app/`. Do not write it to an
env var, a runtime config file the user has to set, or any place outside `/bun_app/`.

- For OpenProject API calls — use the prompt in the **openproject-api** skill
  (*Authentication — ask the user for an API token*) to get the token, then embed it
  as a constant in the file that builds the `Authorization: Basic` header (literal
  username `apikey`, token as password).
- For Nextcloud WebDAV calls — use the prompt in the **nextcloud-webdav** skill
  (*Endpoint and authentication*) to get the app password. Embed both the username
  (the current value of `$PGADMIN_DEFAULT_EMAIL` from this container — look it up
  with `echo $PGADMIN_DEFAULT_EMAIL` and write the literal string into the app
  source) and the app password the user pasted.

When you do this, tell the user that the credential they pasted now lives inside the
app's source code, and that they can revoke it any time from the same page they
generated it on. Run `echo $SYSTEM_HTTP_PORT` to get PORT, then give them:
OpenProject **Access tokens** at `http://openproject.localhost:PORT/my/access_tokens`,
or Nextcloud **Devices & sessions** at `http://nextcloud.localhost:PORT/settings/user/security`.

## Data the app reads or writes

User-uploaded files live in **Nextcloud** (see the **nextcloud-webdav** skill). The
`/data` folder is also mounted into both this container and the Bun Runner — its
purpose is to hand files from this side to the app side without round-tripping
through Nextcloud. Treat `/data` as a scratch/staging area; user data still belongs
in Nextcloud.

### Step 0 — find the files in Nextcloud, not in `/data`

Before anything else, when the user references existing content ("the books I have",
"my PDFs", "all the documents", "available images"), **list those files from
Nextcloud** with a PROPFIND (see the **nextcloud-webdav** skill — *Discovering what
files the user has*). `/data` is empty by default and is **not** a place to look for
user content — running `find /data` or `ls /data` to discover what exists is a bug.

Only after you have the actual list of files from Nextcloud do you ask the user the
copy-vs-direct question below.

### When an app needs user files — ask which mode

Once you know which files the app will use, **ask the user** which mode to use:

> Should the app load these files (A) by copying them into the app's data folder
> (`/data`), or (B) directly from Nextcloud?
>
> - **A** keeps the app self-contained but the files won't update if you change them
>   in Nextcloud — I'd need to re-copy.
> - **B** always sees the latest Nextcloud content, but I'll need to ask you for a
>   Nextcloud app password and embed it in the app's source code (for files the app
>   fetches on the server) and/or create public-share download URLs (for files the
>   browser loads directly).

Then act on the choice:

**(A) Copy into `/data`** — for each referenced file:
1. Download it from Nextcloud via WebDAV into `/data/<filename>` from this container
   (see the **nextcloud-webdav** skill).
2. Write app code that reads `/data/<filename>` from the local filesystem. Inside the
   Bun Runner container the same bytes are visible at the same `/data/<filename>`
   path.

**(B) Use directly from Nextcloud** — pass the app **direct file URLs that bypass the
Nextcloud UI**:
- For server-side fetches from the Bun app: fetch
  `http://proxy:PORT/remote.php/dav/files/<user>/<path>` with a
  `Host: nextcloud.localhost:PORT` header (the `X.localhost` name doesn't resolve in the
  Bun Runner container — see *URLs in app code*) and HTTP Basic auth, embedding the
  credentials directly in the app source (see *Credentials the app needs* above —
  `$PGADMIN_DEFAULT_EMAIL` as the username, the user-pasted app password as the
  password). The Bun app then `fetch()`es the raw file.
- For browser-side embedding (images, downloads, video sources, etc.): generate a
  public-share download URL via the OCS shares API (see the **nextcloud-user-link**
  skill — *When public shares are allowed*) and use the
  `http://nextcloud.localhost:PORT/s/<token>/download` form. **Tell the user before
  you do this** — each share is accessible to anyone who has the URL.

**Never** embed `http://nextcloud.localhost:PORT/apps/files/files/<fileid>?…&openfile=true&…`
URLs in app code. Those open the Nextcloud Files-app UI, not the raw file — they
belong in chat replies to the user, not in app sources.

## URLs in app code

Two contexts, two forms (see the main instructions' **URL rule**):

- **Client-side / browser code** — use the `X.localhost:PORT` URLs. They resolve in the
  user's browser via the host port mapping.
- **Server-side code** (runs in the Bun Runner container) — the `X.localhost` names do
  **not** resolve in-container. Fetch the nginx `proxy` instead and pass a `Host:` header
  naming the service. nginx routes on that header and injects auth (PostgREST bearer
  token, Nextcloud / OpenProject SSO headers), so no `Authorization` header is needed for
  PostgREST.

Resolve PORT by running `echo $SYSTEM_HTTP_PORT` and substitute the printed value when
writing literal URL strings into app source code.

### Pattern: URL constants

```ts
// src/lib/urls.ts
// Run `echo $SYSTEM_HTTP_PORT` and replace PORT below with the printed value.

// --- Browser / client-side: public X.localhost:PORT URLs ---
export const OPENPROJECT_PUBLIC = "http://openproject.localhost:PORT";
export const NEXTCLOUD_PUBLIC   = "http://nextcloud.localhost:PORT";

// --- Server-side (Bun Runner container): go through the proxy ---
// Connect to `proxy` and set the Host header (a bare hostname:port — no scheme).
// nginx routes on Host and injects auth, so PostgREST needs no Authorization header.
export const PROXY = "http://proxy:PORT";   // :8888 by default
export const HOST = {
  postgrest:   "postgrest.localhost:PORT",
  nextcloud:   "nextcloud.localhost:PORT",
  openproject: "openproject.localhost:PORT",
};
```

Usage (server-side — everything goes through the proxy):

```ts
import { PROXY, HOST } from "@/lib/urls";

// PostgREST — proxy injects the bearer token, so no auth header
const rows = await fetch(`${PROXY}/my_table`, {
  headers: { Host: HOST.postgrest },
}).then(r => r.json());

// OpenProject API
const wps = await fetch(`${PROXY}/api/v3/work_packages`, {
  headers: {
    Host: HOST.openproject,
    Authorization: `Basic ${btoa(`apikey:${OP_TOKEN}`)}`,
    Accept: "application/json",
  },
}).then(r => r.json());

// Nextcloud WebDAV
const file = await fetch(
  `${PROXY}/remote.php/dav/files/${username}/Documents/report.pdf`,
  { headers: { Host: HOST.nextcloud, Authorization: `Basic ${btoa(`${user}:${pass}`)}` } }
);
```

Browser code instead uses the `*_PUBLIC` constants — e.g. an `<img src>` pointing at a
Nextcloud public-share download URL on `http://nextcloud.localhost:PORT`.

### Files served by the app from Nextcloud — recap

- Server-side `fetch()` of a Nextcloud file → `http://proxy:PORT/remote.php/dav/...`
  with `Host: nextcloud.localhost:PORT` and `Authorization: Basic ...`.
- Anything the **browser** loads (`<img>`, download link, inline PDF) → public-share
  download URL (`http://nextcloud.localhost:PORT/s/<token>/download`).
- Never the Files-app viewer URL (`/apps/files/files/...?openfile=true`) — it opens
  the Nextcloud UI, not the raw file.

## Telling the user where the app is

Resolve PORT first (`echo $SYSTEM_HTTP_PORT`), then:

The app is reachable in the user's browser at exactly one URL: **`http://app.localhost:PORT`**.
That host port is already mapped by `docker compose` (`proxy:PORT → bun_runner:3000`
via nginx virtual host `app.localhost`); it works as-is, every time. Do not hedge
("may need to be configured", "if the proxy is set up", "external port may need…") —
the mapping is part of this environment.

When you finish building or updating the app, the user-facing summary should look
like (PORT = resolved `$SYSTEM_HTTP_PORT`):

> Done. The bookshelf is live at **http://app.localhost:PORT** — click any book to
> open it in the PDF reader. Pages also reachable directly:
> `http://app.localhost:PORT/book/<name>`.

That's the whole "where is it" section. Don't add a second list of "internal URLs",
"container URLs", or "the app is also available at bun_runner:3000". The user has no
way to reach those, and they will assume something is broken when they see them.

### Anti-pattern — do NOT do this

> Access:
> - Internal URL: http://bun_runner:3000
> - Bookshelf: http://bun_runner:3000/
>
> The external port app.localhost:PORT may need to be configured in the Docker proxy.

Every line above is wrong: the internal hostname is unreachable from the browser, and
the URL does **not** need any further configuration. The correct version substitutes
`http://app.localhost:PORT` for every `http://bun_runner:3000` and removes the hedging
sentence entirely.

## Commit your work (when versioning is on)

`/bun_app` is **not** covered by the background auto-snapshot — committing it is your job.
When `GIT_VERSION_BUN_APP=1` (check with `echo $GIT_VERSION_BUN_APP`), finish every build
or update by committing **and pushing** `/bun_app` yourself with a meaningful message. Do
this after the final `package.json` bump, using the commit/push flow from the
**publish-to-git** skill (`git init`/`.gitignore`/`remote add` on first run), e.g.
`git commit -m "Add bookshelf grid and PDF reader"`. One commit per build or update. If
`GIT_VERSION_BUN_APP` is not `1`, do not init/commit/push `/bun_app` at all.

## Rules

- SSR React only — don't introduce a different framework.
- If `GIT_VERSION_BUN_APP=1`, end by committing **and pushing** `/bun_app` with a
  meaningful message (see publish-to-git) — one commit per build. `/bun_app` has no
  auto-snapshot, so an uncommitted build is unversioned.
- One bump per edit on `version` in `/bun_app/package.json`.
- Last write into `/bun_app` is always `/bun_app/package.json` (copy from `/tmp/package.json`).
- Before writing an app that uses user files, list those files from Nextcloud
  (PROPFIND) — never `find /data` or `ls /data` — then ask the user whether to copy
  them into `/data` or have the app fetch from Nextcloud directly (see *Data the app
  reads or writes*).
- Never embed Nextcloud Files-app viewer URLs (`/apps/files/files/...?openfile=true`)
  in app sources — those are for chat replies, not for app code.
- Browser code uses `X.localhost:PORT` URLs (PORT = resolved `$SYSTEM_HTTP_PORT`);
  server-side code goes through the proxy (`http://proxy:PORT` + a
  `Host: <service>.localhost:PORT` header, no scheme in the value), which also injects the
  PostgREST bearer token. See *URLs in app code*.
- User-facing summaries cite **only** `http://app.localhost:PORT` — never mention
  `bun_runner:3000` "for completeness" and never hedge that the URL "may need to be
  configured". See *Telling the user where the app is*.
- Never run install or start commands yourself (`bun install`, `bun run`, `node …`,
  `pm2`, background jobs). The Bun Runner does both. See *The Bun Runner owns install
  and run*.
