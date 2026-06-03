---
name: bun-app
description: Create or update the SSR React user-facing application in /app, run by the Bun Runner container. Use whenever the user asks to "build a UI", "make a node app", "add a page", "update the app", or similar.
---

The Bun Runner container watches `/app` and runs whatever lives there as an SSR React
application. The same `/app` volume is mounted into this container, so file edits
land directly. The runner serves the app at `http://app.localhost:8888` (external) /
`http://bun_runner:3000` (internal).

## Build and edit workflow

- Put all application code into `/app` — pages, components, server entrypoint, etc.
- **Bump `version` in `/app/package.json` on every edit** so the runner reliably
  picks up the change.
- When creating or modifying `package.json`, write it to `/tmp/package.json` first.
  Only after every other create/edit in `/app` is done, copy `/tmp/package.json` to
  `/app/package.json` — `package.json` must be the **last** file touched in `/app`,
  because the runner restarts on package-manifest changes.

## The Bun Runner owns install and run — do not duplicate it

The Bun Runner container is **already running**. When you edit `/app`, it:

1. **Installs dependencies** from `/app/package.json` on its own. Do not run
   `bun install` / `npm install` / `yarn install` / `pnpm install` from this
   container. There is no install step for you to do.
2. **Starts and serves the app** on its internal port 3000, which is published as
   `app.localhost:8888` on the host. Do not start a server process yourself — no
   `bun run`, `bun start`, `node server.js`, `npm run dev`, background `&` jobs,
   `nohup`, `pm2`, `tmux`, etc. There is no start step for you to do either.
3. **Restarts** when `package.json`'s `version` changes (which is why every edit must
   bump it — see *Build and edit workflow*).

Things this means in practice:

- **Port 3000 being "in use" by `bun_runner` is correct.** It's not a conflict to
  resolve; it's the running app. Do **not** "free up" the port, kill the bun_runner
  process, or pick a different port to run a parallel server on. A parallel server is
  unmanaged, unreachable from the published mapping, and invisible to the user.
- The app's URL is **always** `http://app.localhost:8888` — see *Telling the user
  where the app is*. Never invent a new URL; if you do, you are running a second
  process the runner does not know about and the user will be confused.
- If the runner doesn't pick up your change, the fix is not to run the app yourself.
  Bump `version` in `/app/package.json` and check `/logs/bun_runner` (see *Where to
  look when something breaks*).
- If install or startup is failing, the symptoms are in `/logs/bun_runner` — read
  those, fix the cause in `/app/`, don't side-step the runner.

## Where to look when something breaks

If install, build, or runtime fails, check `/logs/bun_runner` — dependency install,
build output, and runtime logs are all there.

## Credentials the app needs to call OpenProject or Nextcloud

The Bun Runner container does **not** carry credentials for OpenProject or Nextcloud,
and the user cannot reconfigure its environment (no editing env vars, no compose
changes). When the app you generate needs to call either service, ask the user for
the relevant credential using the prompt defined in the matching skill — then **embed
the value directly in the app's source code** under `/app/`. Do not write it to an
env var, a runtime config file the user has to set, or any place outside `/app/`.

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
generated it on (OpenProject **Access tokens** at
`http://openproject.localhost:8888/my/access_tokens`, or Nextcloud **Devices & sessions**
at `http://nextcloud.localhost:8888/settings/user/security`).

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
- For server-side fetches from the Bun app: use the internal URL
  `http://proxy:8888/remote.php/dav/files/<user>/<path>` with HTTP Basic auth and
  `Host: nextcloud.localhost:8888`, embedding the credentials directly in the app
  source (see *Credentials the app needs* above — `$PGADMIN_DEFAULT_EMAIL` as the
  username, the user-pasted app password as the password). The Bun app then
  `fetch()`es the raw file.
- For browser-side embedding (images, downloads, video sources, etc.): generate a
  public-share download URL via the OCS shares API (see the **nextcloud-user-link**
  skill — *When public shares are allowed*) and use the
  `http://nextcloud.localhost:8888/s/<token>/download` form. **Tell the user before
  you do this** — each share is accessible to anyone who has the URL.

**Never** embed `http://nextcloud.localhost:8888/apps/files/files/<fileid>?…&openfile=true&…`
URLs in app code. Those open the Nextcloud Files-app UI, not the raw file — they
belong in chat replies to the user, not in app sources.

## Internal vs external URLs in app code

The bun app straddles two execution contexts and they need different URLs. **Pick the
URL based on who actually performs the request, not on which file the code lives in.**

| Request runs in… | URL to use | Reason |
|---|---|---|
| **Server side** — SSR `loader`/`getServerSideProps`, API route handlers, anything inside the Bun process before HTML is sent to the browser | **Internal** (see constants below) | The Bun Runner container is on the Docker network and can resolve those hostnames; faster, no round-trip via the host. |
| **Client side** — `useEffect`/`fetch` in client components, `<img src>`, `<a href>`, `<video src>`, anything that ends up in HTML/JS the browser fetches or follows | **External** (`http://postgrest.localhost:8888`, `http://openproject.localhost:8888`, `http://nextcloud.localhost:8888`) | The user's browser cannot resolve Docker-internal hostnames. |

A request that uses the wrong URL fails for exactly one of two reasons: an internal
URL leaking into the browser (`net::ERR_NAME_NOT_RESOLVED`) or an external
`X.localhost:8888` URL used from server code that unnecessarily round-trips via the
host.

### Pattern: URL constants + host helper

PostgREST is reached directly. OpenProject and Nextcloud go through the nginx proxy
on port 8888 with a `Host` header identifying the virtual host — wrap this in a
helper so call sites stay clean:

```ts
// src/lib/urls.ts

// Internal bases — used only from server-side code (loaders, API routes, server components).
export const POSTGREST   = "http://postgrest_app:3000";
export const PROXY       = "http://proxy:8888";

// Adds the right Host header for proxy-routed services.
export function proxyHeaders(
  service: "openproject" | "nextcloud",
  extra: Record<string, string> = {}
): Record<string, string> {
  const hosts = {
    openproject: "openproject.localhost:8888",
    nextcloud:   "nextcloud.localhost:8888",
  };
  return { Host: hosts[service], ...extra };
}

// Public bases — used only for URLs the browser will load (href/src/client fetch).
export const PUBLIC_BASES = {
  postgrest:   "http://postgrest.localhost:8888",
  openproject: "http://openproject.localhost:8888",
  nextcloud:   "http://nextcloud.localhost:8888",
};
```

Server-side usage:

```ts
import { PROXY, POSTGREST, proxyHeaders } from "@/lib/urls";

// PostgREST — direct, no Host header needed
const rows = await fetch(`${POSTGREST}/my_table`).then(r => r.json());

// OpenProject API — via proxy with Host header
const wps = await fetch(`${PROXY}/api/v3/work_packages`, {
  headers: proxyHeaders("openproject", {
    Authorization: `Basic ${btoa(`apikey:${OP_TOKEN}`)}`,
    Accept: "application/json",
  }),
}).then(r => r.json());

// Nextcloud WebDAV — via proxy with Host header
const file = await fetch(
  `${PROXY}/remote.php/dav/files/${username}/Documents/report.pdf`,
  { headers: proxyHeaders("nextcloud", { Authorization: `Basic ${btoa(`${user}:${pass}`)}` }) }
);
```

### Common mistakes to avoid

- Putting `http://proxy:8888/...` into a `<a href>` or `<img src>` — the browser
  can't reach it. Use `http://openproject.localhost:8888/...` or
  `http://nextcloud.localhost:8888/...`.
- Calling `fetch("http://proxy:8888/...")` without a `Host` header — nginx won't know
  which virtual host to route to and will return 404 or the wrong service.
- Calling `fetch("http://openproject.localhost:8888/...")` from server code — works
  only if the host resolves inside the container; prefer the internal `proxy:8888`
  path so the call stays on the Docker network.
- Passing an internal URL from the server into a JSON payload that the client then
  uses to construct a `fetch` or `src` — if the browser issues the final request, the
  URL must be external.

### Files served by the app from Nextcloud — recap

- Server-side `fetch()` of a Nextcloud file → `http://proxy:8888/remote.php/dav/...`
  with `proxyHeaders("nextcloud", { Authorization: ... })`.
- Anything the **browser** loads (`<img>`, download link, inline PDF) → external
  public-share download URL (`http://nextcloud.localhost:8888/s/<token>/download`).
- Never the Files-app viewer URL (`/apps/files/files/...?openfile=true`) — it opens
  the Nextcloud UI, not the raw file.

## Telling the user where the app is

The app is reachable in the user's browser at exactly one URL: **`http://app.localhost:8888`**.
That host port is already mapped by `docker compose` (`proxy:8888 → bun_runner:3000`
via nginx virtual host `app.localhost`); it works as-is, every time. Do not hedge
("may need to be configured", "if the proxy is set up", "external port may need…") —
the mapping is part of this environment.

When you finish building or updating the app, the user-facing summary should look
like:

> Done. The bookshelf is live at **http://app.localhost:8888** — click any book to
> open it in the PDF reader. Pages also reachable directly:
> `http://app.localhost:8888/book/<name>`.

That's the whole "where is it" section. Don't add a second list of "internal URLs",
"container URLs", or "the app is also available at bun_runner:3000". The user has no
way to reach those, and they will assume something is broken when they see them.

### Anti-pattern — do NOT do this

> Access:
> - Internal URL: http://bun_runner:3000
> - Bookshelf: http://bun_runner:3000/
>
> The external port app.localhost:8888 may need to be configured in the Docker proxy.

Every line above is wrong: the internal hostname is unreachable from the browser, and
the URL does **not** need any further configuration. The correct version substitutes
`http://app.localhost:8888` for every `http://bun_runner:3000` and removes the hedging
sentence entirely.

## Rules

- SSR React only — don't introduce a different framework.
- One bump per edit on `version` in `/app/package.json`.
- Last write into `/app` is always `/app/package.json` (copy from `/tmp/package.json`).
- Before writing an app that uses user files, list those files from Nextcloud
  (PROPFIND) — never `find /data` or `ls /data` — then ask the user whether to copy
  them into `/data` or have the app fetch from Nextcloud directly (see *Data the app
  reads or writes*).
- Never embed Nextcloud Files-app viewer URLs (`/apps/files/files/...?openfile=true`)
  in app sources — those are for chat replies, not for app code.
- Server-side requests use internal hostnames (`postgrest_app:3000` for PostgREST;
  `proxy:8888` with `proxyHeaders()` for OpenProject and Nextcloud). Anything the
  browser will load (`href`, `src`, client `fetch`) uses external (`X.localhost:8888`).
  See *Internal vs external URLs in app code*.
- User-facing summaries cite **only** `http://app.localhost:8888` — never mention
  `bun_runner:3000` "for completeness" and never hedge that the URL "may need to be
  configured". See *Telling the user where the app is*.
- Never run install or start commands yourself (`bun install`, `bun run`, `node …`,
  `pm2`, background jobs). The Bun Runner does both. See *The Bun Runner owns install
  and run*.
