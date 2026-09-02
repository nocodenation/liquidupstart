---
name: git
description: Work with git repositories in the shared workspace at /repos — clone or fetch a repository, look inside one and see what it contains, and put work under version control by creating repositories, staging, committing, branching, inspecting history, and handing a push to the operator. TRIGGER when the user asks "which files are in the X repository", "what does X contain", "clone X", "fetch the latest X", or to version, commit, branch, or track changes to code, documents or generated artefacts, or when work you produced should be kept rather than overwritten. Run `git-repo-info <repository>` to find out whether a repository is declared here, where its clone is and what may be done with it.
---

# Git in this environment

All repositories live under `/repos`. That directory is a bind mount: everything you
write there appears on the operator's own disk under `volumes/repos/` and can be
browsed, opened in an editor, and backed up like any other folder.

Work inside `/repos` and nowhere else. Nothing stops you writing elsewhere — the
container has no confinement — but a repository outside `/repos` is invisible to the
operator, is not on the mount, and disappears with the container.

```bash
cd /repos
git init my-project
```

## Identity is already configured

Do **not** set `user.name`, `user.email`, or run `git config --global`. The container
already carries the identity through `GIT_AUTHOR_*` and `GIT_COMMITTER_*`, so commits
are attributed correctly the moment you make them. Setting it yourself overrides the
operator's configuration and makes your commits inconsistent with everyone else's.

Confirm what you are committing as, if you need to:

```bash
git log -1 --format='%an <%ae>'
```

## What you may do without asking

Everything local: `init`, `clone`, `fetch`, `pull`, `add`, `commit`, `branch`,
`checkout`, `merge`, `rebase`, `stash`, `log`, `diff`, `status`, `show`.

Commit early and often. A commit is cheap and reversible; losing an hour of work is
not.

## Reaching a remote repository

The stack is told which repositories it may reach and holds one deploy key for
each of them. Every repository it was told about is already cloned under
`/repos`; nothing else can be reached from here.

**Do not work out for yourself what is reachable — ask:**

```bash
git-repo-info agent-skills
```

The command takes a bare name, an SSH address (`git@github.com:owner/repo.git`)
or a web address (`https://github.com/owner/repo`), and all three give the same
answer. It tells you whether the repository is declared here, where its clone
is, what access and branch policy it carries, and whether the clone succeeded.
It exits non-zero when the repository is not declared.

When it reports a repository as declared, work in the clone it names. The remote
and the key are already configured there, so `fetch`, `pull` and `push` need no
address and no credentials from you.

When it reports a repository as not declared, the stack holds no key for it.
Report that and ask the operator to declare it; you cannot do it yourself.

### `could not read Username`

If git answers

```
fatal: could not read Username for 'https://github.com': No such device or address
```

that message means **the repository is not declared in this stack**. It was
never given a key for it, so git fell back to asking for a password, and there
is no terminal to ask. Run `git-repo-info <repository>`, report what it says,
and draw no conclusion about the repository from the message itself.

## When you cannot reach a repository

Say so. Name the repository, say what you tried, and stop there.

**Never describe a repository you could not read by using some other source.**
Not a web page about it, not a package or skills catalogue that lists it, not a
mirror, not search results, not your own recollection. Those sources are stale,
partial, or about something else that shares a name, and an answer built from
them looks exactly like an answer built from the repository.

If the operator explicitly asks you to look elsewhere, say plainly in your answer
where the information came from and that it does not come from the repository
itself.

## What you must ask the operator for

**Pushing.** Never push unasked — not to any branch, not even one you created. Do the
work, commit it, and then tell the operator what is ready and ask whether to push.
They may want to read the diff first, or push from their own machine.

If you have been asked to push and no remote is configured, say so rather than
inventing one.

## What you must never do

- **`git push --force`**, or any variant (`-f`, `--force-with-lease`). Force pushing
  rewrites history that other people may already have pulled, and work that only
  existed on the remote is then gone. If a push is rejected, report it — do not
  force it through.
- **Push to `main`**, or to any branch the operator has called protected. Work goes on
  a feature branch and reaches `main` through review.
- **Delete a remote branch** (`git push --delete`, `git push :branch`).
- **Commit secrets.** `.env` files, private keys, tokens, passwords and certificates
  never belong in a repository, not even in a branch you intend to discard — git
  history keeps them. Check what you are staging: `git diff --cached --stat` before
  every commit, and `git status` before `git add -A`.

## Commit messages

Say what changed and why, in the imperative, on one short subject line. Add a body
when the reason is not obvious from the diff. The project language is English.

```
add retry handling to the ingest processor

The upstream endpoint returns 503 under load. Without a retry the whole
batch was discarded on the first failure.
```

## If something goes wrong

Report it. A rejected push, a merge conflict you cannot resolve cleanly, a detached
HEAD, a repository in a state you do not recognise — say what you see and what you
were doing. Do not attempt a destructive recovery (`reset --hard`, `clean -fdx`,
force push) to make an error go away; that is how uncommitted work is lost.
