---
name: publish-to-git
description: Version the files you build in git (the bundled Gitea server) and push them. Use whenever you finish creating or changing files in /data, /bun_app, /opt/python_extensions, /opt/nar_extensions, or /opt/nar_extensions_src — commit and push that area automatically once the changes are settled — and whenever the user says "version this", "commit", "save to git", "back up", or "put this in a repo".
---

Everything you build is version-controlled in the bundled **Gitea** server, one repo per
work area. **Commit and push on your own** whenever an area's changes are settled — don't
wait to be asked.

**Two URLs for the same server:**
- In this container (git remotes, API calls): `$GITEA_URL` (= `http://gitea:3000`).
- In the user's browser: `http://git.localhost:PORT` — run `echo $SYSTEM_HTTP_PORT` for
  `PORT`. Never show the user the `gitea:3000` form.

Git is **already authenticated** here (a credential helper is configured), so `git push`
to `$GITEA_URL` works without any token in the URL or commands. The account is
`$GITEA_USER`; its token is in `$GITEA_OPENCLAW_TOKEN` if you need the API.

## What to version — one repo per area, only if its switch is on

Each area is versioned **only when its switch env var is `1`**. The user enables them in
the configuration; respect that — never version an area whose switch is `0`.

| Path | Holds | Repo name | Switch (version only if `1`) |
|------|-------|-----------|------------------------------|
| `/bun_app` | the SSR React app (see **bun-app**) | `bun_app` | `$GIT_VERSION_BUN_APP` |
| `/data` | user data + files you and NiFi produce | `data` | `$GIT_VERSION_DATA` |
| `/opt/python_extensions` | Python extensions you build; NiFi loads them | `python_extensions` | `$GIT_VERSION_PYTHON_EXTENSIONS` |
| `/opt/nar_extensions` | compiled NiFi `.nar` files | `nar_extensions` | `$GIT_VERSION_NAR_EXTENSIONS` |
| `/opt/nar_extensions_src` | source for the NiFi `.nar` extensions | `nar_extensions_src` | `$GIT_VERSION_NAR_EXTENSIONS_SRC` |

Each enabled area is its own repo at `$GITEA_URL/$GITEA_USER/<repo>.git`. Version an area
only once you have actually created or changed files in it **and** its switch is `1`.

Before touching git in an area, check its switch — e.g. `[ "$GIT_VERSION_DATA" = "1" ]`.
If it is off, do not init/commit/push there; if the user asked you to version that folder,
tell them it is disabled and they can turn it on in the configuration (the matching
`GIT_VERSION_*` setting) and restart.

## Commit and push when changes settle

As soon as a change in an area reaches a consistent state — an app builds and runs, an
extension compiles, a `.nar` is produced, a data set is complete — commit and push it
yourself:

```bash
cd /opt/python_extensions          # the area you changed
git init -q                        # first time only
# write/refresh .gitignore (see below) before the first 'git add'
git add -A
git commit -qm "<what changed, imperative mood>"
git remote add origin "$GITEA_URL/$GITEA_USER/python_extensions.git"   # first time only
git push -u origin HEAD            # subsequent pushes are just: git push
```

Pushing a new repo path auto-creates it in Gitea (push-to-create is on), so there is no
separate "create repo" step. After pushing, tell the user the browser URL:
`http://git.localhost:PORT/$GITEA_USER/<repo>` (resolve `PORT` first).

## .gitignore per area — never commit secrets

Write `.gitignore` before the first `git add`. Always exclude secrets and junk, but keep
the artifacts each area exists for:

- common: `.env`, `*.token`, `*.key`, `.DS_Store`
- `/bun_app`: `node_modules/`, `dist/`
- `/opt/python_extensions`: `__pycache__/`, `*.pyc`, `.venv/`
- `/opt/nar_extensions_src`: `target/`, `build/`
- `/opt/nar_extensions`: **do not** ignore `*.nar` — the compiled `.nar` files are the
  whole point of this repo.
- `/data`: skip obvious scratch/huge temp files, but version the real outputs.

Tokens, passwords, and API keys go in `.gitignore`, never in a commit.

## Auto-snapshots are a safety net, not a substitute

A background sidecar commits and pushes any **dirty repo** in these areas every few
minutes, so work is never lost between your commits. Still make your own meaningful
commits (clear messages, one logical change each) when changes settle — the snapshots are
only a backstop. If your push races a snapshot and is rejected, run `git pull --rebase`
and push again.

## Mirror to GitHub / GitLab (optional)

If the user wants an area mirrored to an external host, set up a **Gitea push mirror**
(Gitea does the syncing and retries — don't script it yourself):

```bash
# Needs a GitHub/GitLab repo URL and a personal access token from the user.
curl -fsS -X POST "$GITEA_URL/api/v1/repos/$GITEA_USER/<repo>/push_mirrors" \
  -H "Authorization: token $GITEA_OPENCLAW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"remote_address":"<https url>","remote_username":"<user>","remote_password":"<token>","interval":"8h0m0s","sync_on_commit":true}'
```

Tell the user the external token now lives in Gitea's mirror config and can be revoked on
the provider any time.

## Rules

- One repo per area: `/bun_app`, `/data`, `/opt/python_extensions`, `/opt/nar_extensions`,
  `/opt/nar_extensions_src`.
- Version an area only when its `GIT_VERSION_*` switch is `1`; never touch git in a folder
  whose switch is `0`.
- Commit and push automatically when an enabled area's changes settle — don't wait to be asked.
- Always write `.gitignore` (with `.env` and token patterns) before the first `git add`;
  keep `.nar` files in `nar_extensions`.
- Push to `$GITEA_URL`; show the user only `http://git.localhost:PORT/...`.
- Never put `$GITEA_OPENCLAW_TOKEN` in a remote URL or a commit — the helper handles auth.
