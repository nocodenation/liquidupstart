---
name: publish-to-git
description: Version a project you built (in /bun_app or the workspace) in the bundled Gitea git server and push it. Use whenever the user asks to "version this", "commit", "save to git", "put this in a repo", "track changes", or "back up the code".
---

Files you build are version-controlled in the bundled **Gitea** server. Every project
should live in its own git repo so the user has history and can roll back.

**Two URLs for the same server:**
- In this container (git remotes, API calls): `$GITEA_URL` (= `http://gitea:3000`).
- In the user's browser: `http://git.localhost:PORT` — run `echo $SYSTEM_HTTP_PORT`
  for `PORT`. Never show the user the `gitea:3000` form.

Git is **already authenticated** here: a credential helper is configured, so `git push`
to `$GITEA_URL` works without putting any token in the remote URL or the commands. The
account is `$GITEA_USER`; its token is in `$GITEA_OPENCLAW_TOKEN` if you need the API.

## Put a project under version control

Pushing a new repo path auto-creates it in Gitea (push-to-create is enabled), so there
is no separate "create repo" step. From the project directory (e.g. `/bun_app` or a
folder under the workspace):

```bash
cd /bun_app                      # or the project folder
git init -q                      # skip if already a repo
# Keep secrets and junk out of history — see the .gitignore below.
git add -A
git commit -qm "Initial version"
git remote add origin "$GITEA_URL/$GITEA_USER/<repo-name>.git"   # skip if 'origin' exists
git push -u origin HEAD
```

`<repo-name>` is your choice (e.g. the app name). After pushing, tell the user the
browser URL: `http://git.localhost:PORT/$GITEA_USER/<repo-name>` (resolve `PORT` first).

## .gitignore — never commit secrets or junk

Write this before the first `git add` (extend per project):

```
.env
*.token
*.key
node_modules/
dist/
.DS_Store
```

Tokens, passwords, and API keys go in `.gitignore`, never in a commit. If the app embeds
a credential in source (see the **bun-app** skill), keep that file out of the repo or
strip the value before committing.

## Auto-snapshots already run

A background sidecar commits and pushes any **dirty repo** under the workspace and
`/bun_app` every few minutes, so uncommitted work is not lost. That is a safety net, not
a substitute for real commits: make your own meaningful commits at milestones (clear
messages, one logical change each). If your commit and a snapshot race and a push is
rejected, just `git pull --rebase` and push again.

## Mirror to GitHub / GitLab (optional)

If the user wants the repo mirrored to an external host, set up a **Gitea push mirror**
(Gitea handles the syncing and retries — don't script it yourself):

```bash
# Needs a GitHub/GitLab repo URL and a personal access token from the user.
curl -fsS -X POST "$GITEA_URL/api/v1/repos/$GITEA_USER/<repo-name>/push_mirrors" \
  -H "Authorization: token $GITEA_OPENCLAW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"remote_address":"<https url>","remote_username":"<user>","remote_password":"<token>","interval":"8h0m0s","sync_on_commit":true}'
```

Tell the user the external token now lives in Gitea's mirror config and can be revoked
on the provider any time.

## Rules

- One repo per project; each lives in its own folder under `/bun_app` or the workspace.
- Always write `.gitignore` (with `.env` and token patterns) before the first `git add`.
- Push to `$GITEA_URL`; show the user only `http://git.localhost:PORT/...`.
- Never embed `$GITEA_OPENCLAW_TOKEN` in a remote URL or a commit — the helper handles auth.
