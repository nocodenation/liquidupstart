# Feature: the reset removes `volumes/` from a container before it asks for a password

Governs how `cleanup.sh` removes `volumes/` — step 4 of the full reset — and the library that step
moves into, `scripts/linux/lib/remove-volumes.sh`. Specified 2026-11-03 on #32. It is the first
document that governs any part of `cleanup.sh`: until now the script was described in
`docs/SPECIFICATION.md` §9 in one sentence, exercised by `docs/PROCEDURE-cold-start.md` alone, and
read by two contract cases that scan every shell script (CS-22 for `--pull never`, A11-11 for
`--remove-orphans`). Nothing held what it does to `volumes/`. The tests are in
`docs/TEST-SPEC-reset.md`.

## 1. Purpose

`CLAUDE.md` promises that *"a reset is just deleting `volumes/`"*, and on the platform this stack
targets that is not what happens. Under rootless Docker the host user is container root, and every
other container uid N lands on the host as `100000 + N − 1`: Postgres's files are `100998`'s,
Nextcloud's `100032`'s, and the Maven cache #10 handed to `builder` is `101499`'s. The host user can
delete none of them. `cleanup.sh` has known this since it was written — the comment above its
`rm -rf` says so — and its answer was `sudo`, which asks for a password **four minutes into a reset
that need not ask at all** (recorded in `BACKLOG.md` from the A7-5 cold start of 2026-09-04, and
still there). An operator without `sudo` got `ERROR: cannot remove volumes/ and sudo is unavailable.`
and a reset that stopped half-way, with the images still present.

The password is unnecessary because the files were made by a container, and a container can unmake
them. The uid that owns them is, inside any container the same daemon starts, that container's root
over them; `docker run` with the project directory mounted and `rm -rf` as the command removes the
tree with no privilege the operator does not already hold — they can start containers, or there
would be nothing to reset. Measured on 2026-11-03 on this host, and the measurement is in
`docs/TEST-SPEC-reset.md` under CU-7.

#32 is where this was decided: the issue is about the stale `volumes/nar_builder/m2` notice, which
told an operator to delete a directory they cannot delete (FR43 of
`docs/FEATURE-liquid-java-extensions.md`), and it names `cleanup.sh`'s missing leg as the second
half of the same contradiction. The notice is fixed per directory; this is the general case, so the
reset keeps its promise whatever a container has written.

## 2. Decisions

- **Four legs, in order, each tried only when the one before it did not remove the directory:**
  plain `rm -rf`; `rm -rf` from a container; `sudo rm -rf`; an error with exit status 1. The
  container leg sits before `sudo` because it needs nothing the operator has not already given, and
  after plain `rm` because where plain `rm` works nothing should change.

  *Where the leg is reached — corrected 2026-11-03, review of #32.* This said the leg is never
  reached on Docker Desktop or on rootful Docker, and half of that is wrong. On Docker Desktop
  (macOS, Windows) a bind mount passes through the VM's file sharing, which presents every file as
  the host user's, so plain `rm` succeeds and the reset is as it was. On **rootful Docker on Linux** a
  container's uid is the host's same uid — Postgres's files are `999`'s, Nextcloud's `33`'s, the
  Maven cache #10 handed to `builder` `1500`'s — and the operator, who is none of them, is refused
  exactly as under rootless Docker. There the leg **is** reached, and the container's root is the
  host's real root, so it removes the tree with no password where the old step asked for `sudo`'s.
  That is not a privilege the operator lacked: membership of the `docker` group is root-equivalent —
  anyone who can run `docker run -v /:/host` is root on the host — so the leg spends a privilege they
  already hold rather than asking for a second one. Only an operator who runs the reset as root
  themselves takes the plain-`rm` path on such a host.

- **The step moves into a function, `lu_remove_volumes <project-dir>`, in
  `scripts/linux/lib/remove-volumes.sh`, sourced by `cleanup.sh`.** `cleanup.sh` derives its project
  directory from its own location and runs `docker compose down`, a container sweep and an image sweep
  around the step; a case for the step alone would have to stub all of that, and the guard against a
  wrong directory (below) could not be reached at all, since the script's own derivation never
  produces one. A function with the directory as its argument can be run against a fixture with
  nothing but a stub `docker` and a stub `sudo` on `PATH`, and handed `/` on purpose. The precedent is
  `config/scripts/start/lib/*.sh`, where every start-time decision that has unit cases lives.

- **The container mounts the project directory, not `volumes/`, and removes `/v/volumes`.** A
  mount point cannot be removed from inside the container — `rm -rf /v` on a bind mount fails with
  *Device or resource busy* — so mounting `volumes/` itself would leave the directory and need a
  second step for the dotfiles (`_git-secrets`, `_openclaw-claude`) a `/v/*` glob misses. One level
  up, `/v/volumes` is an ordinary directory and goes whole. Measured: CU-7.

- **The image is the first present of a short, fixed list, probed with `docker image inspect`, and is
  never pulled.** `nginx:latest` first: it is the proxy's image (`compose.yml`, `proxy`), always on,
  so it is on every installation that has ever started. `liquidupstart/bun-runner:latest` second: the
  one image `build.sh` builds on every configuration (CS-23 — with every switch off the set is
  `bun-runner` alone), so it is on an installation that built and never started. The list is not
  longer because a third candidate would have to be an image this stack does not already depend on,
  and the operator's own images are not the reset's to run. `--pull never`, straight after `run`,
  because this repository never pulls to run (CS-FR15, decision 14; CS-22 reads every `docker run`
  in `scripts/` for the flag, this one included), and because a reset that reaches the network to
  delete a directory is a surprise.

- **The result is verified, never inferred from an exit status.** After each leg the function asks
  whether `<project-dir>/volumes` still exists, and that answer decides whether the next leg runs and
  what the exit status is. `rm -rf` exits non-zero after removing most of a tree; a container `rm`
  that found the mount wrong exits 0 having removed nothing of ours; `sudo` can be configured to run
  `rm` and deny it. A leg's exit status is printed where it helps; the directory being gone is the
  only success.

- **The function refuses a directory it should not be given, before any leg runs.** An empty
  argument, a relative path, a directory that does not exist, or one that **resolves** to `/` is
  refused with exit 1 and nothing is removed, plainly or otherwise. `cleanup.sh`'s derivation cannot
  produce any of them — the guard is there because the function is now callable with an argument, and
  `sudo rm -rf` on `/volumes` or on `volumes` relative to wherever the caller stands is the kind of
  mistake a guard costs nothing against.

  *Resolved, not compared — 2026-11-03, review of #32.* The first version dropped trailing slashes
  and compared the string to `/`, which `/.`, `//.`, `/tmp/..` and a symbolic link to `/` all pass,
  and each would have had every leg run `rm -rf /volumes` — `/./volumes` is `/volumes` to the kernel,
  and the `sudo` leg would have followed the plain one. The argument is now resolved to its physical
  directory with `cd -P -- "<arg>" && pwd -P` in a subshell before the comparison, and the legs act on
  the resolved path, so what is removed is what was checked. `cd -P` was chosen over a lexical
  normalisation because the symlink case is the one lexical rules cannot see, over `realpath` because
  `realpath -m` is GNU-only and the scripts are also run on macOS hosts, and it brings one new refusal
  with it: a directory `cd` cannot enter does not resolve, and a function that cannot resolve its
  argument must not act on it. Two things the resolution needs stated: bash's `pwd -P` answers `//`
  for `//.` and for `//`, so trailing slashes are dropped from the **resolved** path before the
  comparison; and on a host where the temporary directory is itself a symbolic link (macOS, `/tmp` →
  `/private/tmp`) the path the legs act on is not the one the caller typed, which the tests allow for.

- **Each leg announces itself in one line on stdout, and the leg that succeeded names itself.** An
  operator reading the output of a reset should be able to tell which of four things removed their
  data. Errors go to stderr, as before.

- **What the fallback does not change.** `sudo` stays: a host whose daemon is down, whose `docker`
  is not on `PATH`, or that has neither image, still needs root, and a reset is still allowed to ask
  for it. `--keep-images` is unaffected — the image sweep is step 5, after this step, so the images
  are there during it on every ordinary run (§5 for the one case they are not). `scripts/uninstall.sh`
  calls `cleanup.sh` first and, when it reports an error, warns and goes on to remove the whole
  project directory with a `sudo` fallback of its own; that path is unchanged and not governed here.

## 3. Requirements

- **CU-FR1 — The reset removes `volumes/` without asking for a password where a container can do
  it.** `lu_remove_volumes <project-dir>` tries, in order, `rm -rf <project-dir>/volumes`; then
  `docker run --pull never --rm --entrypoint rm -v "<project-dir>:/v" <image> -rf /v/volumes` with
  the first present image of `nginx:latest`, `liquidupstart/bun-runner:latest`; then
  `sudo rm -rf <project-dir>/volumes`. It stops at the first leg after which `<project-dir>/volumes`
  no longer exists and returns 0. A `volumes/` that was never there is success without a retry, as
  it is today.

- **CU-FR2 — The container leg runs only from an image that is already local, and never pulls.**
  Each candidate is probed with `docker image inspect <image>` and used only when the probe exits 0;
  the run carries `--pull never` straight after `run`. When `docker` is not on `PATH`, the daemon
  does not answer, or no candidate is present, the leg is skipped with one line naming the images
  tried and the next leg runs. No `docker pull`, in any form, is issued by the function.

- **CU-FR3 — Success is the directory being gone, and nothing else.** After each leg the function
  tests `[ -e "<project-dir>/volumes" ]`. A leg whose command exited 0 while the directory remains
  counts as failed and the next leg runs; the `sudo` leg exiting 0 with the directory remaining is
  the error of CU-FR4, not success.

- **CU-FR4 — When every leg has failed, the function says so on stderr and returns 1, and
  `cleanup.sh` exits 1.** With no `sudo` on `PATH`: `ERROR: cannot remove volumes/ and sudo is
  unavailable.`, the message `cleanup.sh` prints today. With `sudo` present and the directory still
  there afterwards: `ERROR: volumes/ is still present after sudo rm -rf.` The images are not swept
  and `.env` is not removed, as today — `cleanup.sh` runs under `set -e` and the function's status
  stops it.

- **CU-FR5 — A directory the function must not act on is refused before any removal.** *Widened
  2026-11-03, review of #32; until then the guard compared the slash-trimmed string to `/` alone.* The
  argument is resolved to its physical directory — `cd -P -- "<arg>" && pwd -P` in a subshell, so `.`
  and `..` components, repeated slashes and symbolic links are followed, with trailing slashes dropped
  from the result — and refused when it is empty, when it does not begin with `/`, or when the resolved
  directory is `/`: `ERROR: refusing to remove volumes/ under '<arg>': not an absolute path below /.`
  on stderr, with the argument as given. An argument `cd` cannot enter — a directory that does not
  exist, or one the caller may not enter — is refused with `ERROR: refusing to remove volumes/ under
  '<arg>': not an existing directory.` In every refusal the return is 1 and no `rm`, `docker` or `sudo`
  is run. Every other absolute path is accepted — with a space, a trailing slash, a `.` or `..`
  component, or through a symbolic link to a real directory — and the legs act on the **resolved**
  directory: `rm -rf <resolved>/volumes`, `-v "<resolved>:/v"`, `sudo rm -rf <resolved>/volumes`.

- **CU-FR6 — Each leg is announced on stdout, and the leg that removed the directory names itself.**
  The lines are, in the order they can appear: `Removing volumes/...`; `Plain removal failed (files
  owned by another UID); retrying from a container...`; `Removing volumes/ from a container
  (<image>)...`; `volumes/ removed from a container.`; `No local image to run the removal from
  (tried nginx:latest, liquidupstart/bun-runner:latest); retrying with sudo...`; `Container removal
  failed (<image>); retrying with sudo...`; `volumes/ removed with sudo.` A plain removal that
  succeeds prints the first line only.

## 4. Interface

`scripts/linux/lib/remove-volumes.sh` defines one function and runs nothing when sourced.

```
lu_remove_volumes <project-dir>
```

| | |
|---|---|
| Argument | The project directory, absolute. `cleanup.sh` passes `"${PROJECT_DIR}"`. Resolved with `cd -P -- "<arg>" && pwd -P` before anything else (CU-FR5, 2026-11-03); `<project-dir>` below is that resolved path. |
| Removes | `<project-dir>/volumes`, by the first leg of CU-FR1 that removes it. |
| Reads from the environment | `PATH`, for `rm`, `docker` and `sudo`. Nothing else: no `.env` key, no variable of its own. |
| Runs | `rm`; `docker image inspect`, `docker run`; `sudo rm`. Never `docker pull`, never `docker compose`. |
| Returns | 0 when `<project-dir>/volumes` does not exist afterwards; 1 when it does, or when the argument is refused (CU-FR5). |
| Prints | CU-FR6's lines on stdout; CU-FR4's and CU-FR5's on stderr. |

`cleanup.sh` sources the file by its path under `${PROJECT_DIR}` and replaces its step-4 block with
one call. Its documented exit status — *1 … when `volumes/` cannot be deleted and sudo is
unavailable* — widens to *when `volumes/` cannot be deleted*, the same number for one more reason.

The exact `docker run` the leg issues, as one argument vector: `run`, `--pull`, `never`, `--rm`,
`--entrypoint`, `rm`, `-v`, `<project-dir>:/v`, `<image>`, `-rf`, `/v/volumes`. The source of the
`-v` is one element, so a space in the path is carried whole; a `:` in the path is not — Docker
splits the option on it — and the leg then fails and falls through to `sudo`, which CU-FR3 makes
safe. `--mount type=bind,src=…` would carry a colon and is not used, since the path with a colon is
not one this project has met and the fall-through already answers it.

## 5. What this does not cover

- **A host whose images were swept while `volumes/` stayed.** Step 5 cannot run when step 4 fails,
  so a plain `cleanup.sh` never produces this; `docker image prune -a` by hand, or a `--keep-images`
  run followed by a prune, can. The leg then finds no candidate, says which it tried, and the
  reset asks for a password as it did before #32.

- **`scripts/uninstall.sh`'s own removal of the project directory**, which has a `sudo` fallback and
  no container leg. After a successful `cleanup.sh` it meets only host-owned files. After a failed
  one it warns and reaches `sudo` for the whole tree, as before.

- **SELinux hosts**, where a bind mount may need `:z` for the container to write; the leg fails
  and falls through. Not a platform this stack has been run on.

- **`volumes/nar_builder/m2` by itself.** The issue proposed a leg for that one directory. The
  general leg removes it with everything else, and the per-directory answer — a notice with the
  command, for an operator who wants the leftover gone without a reset — is FR43.
