# Test specification — the reset removes `volumes/` from a container before it asks for a password

Covers `scripts/linux/lib/remove-volumes.sh` and the step of `cleanup.sh` that calls it, specified in
`docs/FEATURE-reset.md`. Written 2026-11-03 on #32, before the code.

## 1. What is being tested, and at which level

The function decides, four times over, whether to run something destructive and as whom: `rm` as the
operator, `rm` as root inside a container with the project directory mounted, `rm` as root on the
host. Each decision has a side on which data goes and a side on which it stays, so this is decision
logic in `CLAUDE.md`'s sense and **full branch coverage is required**: the guard's three refusals and
its acceptance, plain `rm` succeeding and failing, `docker` present and absent, each candidate image
present and absent, the container run exiting 0 and not, the directory gone and remaining after it,
`sudo` present and absent, and the directory gone and remaining after `sudo`. Every one of those has a
row below, and the branches none reaches are listed in §4 so the claim can be checked.

**Unit, without Docker, is the level for all of it but one.** The function is shell; what it does is
run three commands and read a directory. A fixture directory, a stub `docker` and a stub `sudo` first
on `PATH` show every branch, and `tests/run.sh` runs them in the default tier — a fallback that is only
tested when someone remembers `--system` is a fallback nobody has seen work. The stubs stand in for
*what the commands do*, not for whether a container can really remove a `101499`-owned tree; that is
the one thing a stub cannot show, and **CU-7** is the documented manual check that shows it, on real
rootless Docker, with today's measurement recorded.

**How plain `rm` is made to fail without root.** A directory `volumes/locked` with mode `0500`
holding a file `keep`: `rm -rf volumes` by an ordinary user is refused on `locked/keep`, since
unlinking needs write on the directory, and the fixture's own teardown puts the mode back. As root
nothing is refused, so the cases that need the failing `rm` skip under uid 0 and say so in the skip —
one scenario reads the uid and asserts the skip's reason, so a run as root reports what it did not
measure rather than passing over it.

**How the stubs stand in for root.** The stub `docker`, told to succeed, takes the source of the `-v`
it was handed, makes it writable and removes `<source>/volumes` itself. The stub `sudo`, told to
succeed, does the same to the path after `rm -rf`. That is not a simulation of Docker; it is what
makes the function's *reading of the result* observable: a leg that was handed the wrong path removes
the wrong thing, the fixture is still there, and the check the function runs afterwards has to notice.

**Why the directory is a fixture and not `volumes/` of this checkout.** The function is destructive
by design. Every case hands it a `mkdtemp` directory and nothing else, and the contract case reads
`cleanup.sh` as text rather than running it.

## 2. Traceability

| Requirement | Covered by |
|---|---|
| CU-FR1 Four legs in order, the first that removes the directory wins | CU-1, CU-2, CU-3, CU-7 |
| CU-FR2 The container leg runs from a local image only, and never pulls | CU-2 (2), CU-2 (3), CU-3 (1), CU-3 (2), CU-3 (3); CS-22 reads the site for the flag as well |
| CU-FR3 Success is the directory being gone | CU-3 (4), CU-3 (5), CU-4 (3) |
| CU-FR4 When every leg has failed, stderr says so and the status is 1 | CU-4, CU-6 (2) |
| CU-FR5 A directory the function must not act on is refused first | CU-5 |
| CU-FR6 Each leg is announced, and the one that succeeded names itself | CU-1, CU-2, CU-3 |
| The step lives in one place and `cleanup.sh` calls it | CU-6 |

## 3. Overview

| # | Sign | Level | Scenario | Note |
|---|---|---|---|---|
| **CU-1** | positive | Unit | A tree the operator can delete is removed by plain `rm`: gone, exit 0, stdout is `Removing volumes/...` alone, neither `docker` nor `sudo` was called | Docker Desktop's and rootful Docker's ordinary path — the fallback is never reached |
| **CU-1** | positive | Unit | No `volumes/` at all: exit 0, the same one line, nothing called | A reset of a checkout that never ran is not an error, as today |
| **CU-2** | positive | Unit | Plain `rm` refused, `nginx:latest` present: the container leg removes it, exit 0, `sudo` never called, and the run's argument vector is `run --pull never --rm --entrypoint rm -v <dir>:/v nginx:latest -rf /v/volumes` with the path, space and all, as one element | The leg #32 adds, and the argv is held whole so the mount is the project directory and the target `/v/volumes` |
| **CU-2** | positive | Unit | `nginx:latest` absent, `liquidupstart/bun-runner:latest` present: both probed in that order, the run names `bun-runner` | The second candidate, for an installation that built and never started |
| **CU-2** | **negative** | Unit | Across every call the stub recorded there is no `pull` subcommand, and `--pull never` are the two elements after `run` | CU-FR2's *never* — the same predicate CS-22 applies to the text, applied to what ran |
| **CU-3** | positive | Unit | Neither image present: no run, one line naming both images tried, then `sudo rm -rf <dir>/volumes`, which removes it; exit 0, `volumes/ removed with sudo.` | The host whose images are gone — §5 of the feature |
| **CU-3** | positive | Unit | No `docker` on `PATH`: the same line, straight to `sudo`, no `docker.log` | A host without Docker is still reset |
| **CU-3** | positive | Unit | `docker` present and the daemon down — every call fails with *Cannot connect to the Docker daemon*: the same line, `sudo`, removed | `uninstall.sh` skips `cleanup.sh` in this state; a direct run meets it |
| **CU-3** | **negative** | Unit | The container run exits 0 and removes nothing: `Container removal failed (nginx:latest); retrying with sudo...`, `sudo` called, removed | CU-FR3 — the exit status is not believed |
| **CU-3** | **negative** | Unit | The container run exits 125 with *No such image*: the same message, `sudo`, removed | What `--pull never` says when an image went away between the probe and the run |
| **CU-4** | **negative** | Unit | Neither image, no `sudo` on `PATH`: stderr `ERROR: cannot remove volumes/ and sudo is unavailable.`, exit 1, `volumes/locked/keep` still reads `probe` | The message `cleanup.sh` prints today, reached by the same route one leg later |
| **CU-4** | **negative** | Unit | `sudo` exits 1: stderr `ERROR: volumes/ is still present after sudo rm -rf.`, exit 1, tree present | A refused password, or a `sudoers` that denies `rm` |
| **CU-4** | **negative** | Unit | `sudo` exits 0 and removes nothing: the same error, exit 1 | CU-FR3 on the last leg — the status `cleanup.sh` used to trust |
| **CU-5** | **negative** | Unit | An empty argument is refused: stderr `ERROR: refusing to remove volumes/ under '': not an absolute path below /.`, exit 1, no `rm`, `docker` or `sudo` call, and the fixture's `volumes/plain/keep` beside the working directory still reads `probe` | For these three the `rm` on `PATH` is a logging stub too: the property is that nothing runs |
| **CU-5** | **negative** | Unit | `volumes-of-nobody`, a relative path, is refused the same way | Relative to wherever the caller stands is exactly what the guard is against |
| **CU-5** | **negative** | Unit | `/` and `///` are refused the same way | The one absolute path that is not below `/` |
| **CU-5** | positive | Unit | `<dir>/`, absolute with a trailing slash and a space in it, is accepted and the tree removed | The counterpart; CU-1 and CU-2 are the other acceptances |
| **CU-6** | positive | Contract | `cleanup.sh`, comments stripped, sources `scripts/linux/lib/remove-volumes.sh` under `${PROJECT_DIR}` and calls `lu_remove_volumes "${PROJECT_DIR}"` | The step is where this document says it is |
| **CU-6** | **negative** | Contract | …and holds no `rm -rf "${PROJECT_DIR}/volumes"` and no `sudo` of its own any more | One place, not two |
| **CU-6** | positive | Contract | The library sourced under `set -euo pipefail` defines the function, prints nothing and exits 0 | A library that runs something when sourced is a step nobody asked for |
| **CU-7** | positive + **negative** | Manual, rootless Docker | The real leg on a real `101499`-owned tree: plain `rm` refused, the container removes all of `volumes/`, no password asked; with the leg disabled the same tree reaches `sudo` | Measured 2026-11-03 — the block carries the figures |

## 4. Detail

### CU-1 — plain `rm`, and the path most hosts take

| | |
|---|---|
| **Premise** | On Docker Desktop bind mounts ignore ownership, and on rootful Docker a container's uid 999 is the host's uid 999, which the operator usually cannot delete either — but on both the fallback must not change what works. The first leg is the old step, and these rows hold that it is still first and still enough. |
| **Component** | `lu_remove_volumes` from `scripts/linux/lib/remove-volumes.sh`, sourced into `bash` and called once. |
| **Steps** | Build the fixture; run `bash -c '. "$0" && lu_remove_volumes "$1"' <lib> <dir>` with `PATH` set to the fixture's `bin` alone and the working directory the checkout root; read exit status, stdout, the directory and the stub logs. |
| **Test data** | **The fixture, `resetFixture()` in the test file:** `mkdtempSync` under the system temp directory with the prefix `lu cu-` — a space on purpose, so every path that reaches a command carries one. `bin/rm` a symlink to the real `rm` found with `command -v rm` when the fixture is built; `bin/docker` and `bin/sudo` the stubs of §1, each appending every argument on its own line and then a line `--` to `docker.log` or `sudo.log` beside the fixture, so a call is readable element by element and a space in a path cannot hide a split. **Scenario 1:** `volumes/plain/keep` holding the line `probe`, ordinary modes. **Scenario 2:** no `volumes/`. **Why `probe`:** a word no service writes, so a `keep` that survives a run is the fixture's and not something else's. |
| **Expected** | (1) exit 0; `volumes/` does not exist; stdout is exactly `Removing volumes/...` followed by a newline; `docker.log` and `sudo.log` do not exist. (2) the same with the directory never there. |
| **Shown able to fail** | The call turned into a no-op (`:` for `rm -rf`) must redden (1) — the directory stays and the leg falls through to the stub `docker`, whose log then exists. |
| **Implemented by** | `tests/unit/m-cu.remove-volumes.test.ts`. |
| **Covers** | CU-1, CU-FR1, CU-FR6. |

### CU-2 — the container leg, which is what #32 adds

| | |
|---|---|
| **Premise** | Under rootless Docker the host user cannot delete what a container wrote, and until #32 the only answer was a password four minutes into the reset. The same uid is root's equal inside any container the daemon starts, so a container with the project directory mounted removes the tree with no privilege the operator lacks. Three things about the run have to be right and each is a different defect when wrong: the mount is the **project** directory (a mount point cannot be removed from inside), the image is **local** (never pulled), and the path reaches Docker as **one argument**. |
| **Component** | As CU-1. |
| **Steps** | As CU-1, on the locked tree; read `docker.log` as a list of calls, each a list of elements. |
| **Test data, both sides** | **The locked tree:** `volumes/locked/keep` holding `probe`, then `chmod 0500 volumes/locked`, so plain `rm -rf` is refused on `keep`; the fixture's teardown sets `0700` first. Skipped with a voice under uid 0. **The stub `docker`'s knobs, through the environment of the run:** `LU_STUB_IMAGES`, a space-separated list of the images `image inspect` answers 0 for — `nginx:latest` in (1) and (3), `liquidupstart/bun-runner:latest` in (2); `LU_STUB_RUN=remove`, under which a `run` takes the element after `-v`, strips `:/v`, and removes `<source>/volumes` after making it writable. **What must be in the log for (1):** two calls — `image inspect nginx:latest`, then the eleven elements `run`, `--pull`, `never`, `--rm`, `--entrypoint`, `rm`, `-v`, `<dir>:/v`, `nginx:latest`, `-rf`, `/v/volumes`, where `<dir>` is the path `mkdtempSync` returned, space and all, and the whole `<dir>:/v` is one element. **For (2):** `image inspect nginx:latest`, `image inspect liquidupstart/bun-runner:latest`, then the run with `liquidupstart/bun-runner:latest` as its ninth element. **What must not be in it, (3):** any call whose first element is `pull`, or whose first is `image` and second `pull`; and in every `run` call the second and third elements are `--pull` and `never` — the predicate CS-22 applies to the text, applied to the argv. |
| **Expected** | (1) exit 0; `volumes/` gone; `sudo.log` does not exist; stdout holds `Plain removal failed (files owned by another UID); retrying from a container...`, `Removing volumes/ from a container (nginx:latest)...` and `volumes/ removed from a container.`, in that order; the log as stated. (2) as (1) with the second candidate, the log showing both probes in order. (3) over (1)'s and (2)'s logs, the two absences and the one position. |
| **Shown able to fail** | Registered in `tests/mutations.json` — #59 adds entries to the same file, so the registration is a merge to watch. The container leg's `if` turned into `if false` must redden (1): `sudo.log` exists. `--pull never` dropped from the run must redden (3), and CS-22 with it. The candidate list cut to `nginx:latest` must redden (2): the log holds one probe and `sudo.log` exists. `-v "$dir/volumes:/v"` with `-rf /v` — the mount point — must redden (1) on the argv, and under the real leg would leave the directory (CU-7). |
| **Implemented by** | `tests/unit/m-cu.remove-volumes.test.ts`. |
| **Covers** | CU-2, CU-FR1, CU-FR2, CU-FR6. |

### CU-3 — falling through to `sudo`, for each of the ways the leg cannot help

| | |
|---|---|
| **Premise** | The leg needs `docker` on `PATH`, a daemon that answers, an image that is local, and a run that actually removed the directory. Each can be missing, and each has to end in the same place — `sudo`, as before #32 — with a line that says why. The two negative rows are CU-FR3: a leg's exit status is a claim, and the directory is the fact. |
| **Component** | As CU-1. |
| **Steps** | As CU-2, varying the stubs. |
| **Test data, both sides** | The locked tree throughout, and `LU_STUB_SUDO=remove`, under which `sudo rm -rf <path>` makes `<path>` writable and removes it. **(1)** `LU_STUB_IMAGES` empty. **(2)** `bin/docker` deleted from the fixture before the run. **(3)** `LU_STUB_DAEMON=down`: every `docker` call prints `Cannot connect to the Docker daemon at unix:///nonexistent-lu-cu.sock` on stderr and exits 1 — the socket name chosen so no host can have it. **(4)** `LU_STUB_IMAGES=nginx:latest`, `LU_STUB_RUN=keep`: the run exits 0 and touches nothing. **(5)** `LU_STUB_RUN=fail`: the run prints `docker: Error response from daemon: No such image: nginx:latest` on stderr and exits 125, which is what `--pull never` says for an absent image. **What must be in `sudo.log` in every row:** one call, `rm`, `-rf`, `<dir>/volumes`. |
| **Expected** | (1)–(3): stdout holds `No local image to run the removal from (tried nginx:latest, liquidupstart/bun-runner:latest); retrying with sudo...` and `volumes/ removed with sudo.`; no `run` in `docker.log` (in (2) no `docker.log` at all); `sudo.log` as stated; exit 0; `volumes/` gone. (4) and (5): stdout holds `Container removal failed (nginx:latest); retrying with sudo...`; `docker.log` holds the run; `sudo.log` as stated; exit 0; gone. |
| **Shown able to fail** | The check after the run replaced by trusting its exit status must redden (4): the function reports a container removal and exits 0 while `volumes/locked/keep` is still there, and `sudo.log` does not exist. The probe removed, so the run is attempted with the first candidate regardless, must redden (1) and (3) on their message and their log. |
| **Implemented by** | `tests/unit/m-cu.remove-volumes.test.ts`. |
| **Covers** | CU-3, CU-FR1, CU-FR2, CU-FR3, CU-FR6. |

### CU-4 — when every leg has failed

| | |
|---|---|
| **Premise** | The reset is allowed to fail; it is not allowed to say it succeeded, and it is not allowed to go on to sweep the images and remove `.env` with the data still on disk. `cleanup.sh` runs under `set -e`, so the function's status is what stops it, and the status has to be 1 whenever the directory is there afterwards — including after a `sudo` that exited 0. |
| **Component** | As CU-1. |
| **Steps** | As CU-2, varying the stubs; read stderr apart from stdout. |
| **Test data** | The locked tree and `LU_STUB_IMAGES` empty, so the error is reached through the route an image-less host takes. **(1)** `bin/sudo` deleted before the run. **(2)** `LU_STUB_SUDO=fail`: `sudo` prints `sudo: a password is required` on stderr and exits 1. **(3)** `LU_STUB_SUDO=keep`: exit 0, nothing touched. |
| **Expected** | (1) stderr holds `ERROR: cannot remove volumes/ and sudo is unavailable.`; exit 1; `volumes/locked/keep` reads `probe`; `sudo.log` does not exist. (2) and (3) stderr holds `ERROR: volumes/ is still present after sudo rm -rf.`; exit 1; the file reads `probe`; `sudo.log` holds the one call. In none of the three does stdout hold a line beginning `volumes/ removed`. |
| **Shown able to fail** | The check after `sudo` removed must redden (3): exit 0 and `volumes/ removed with sudo.` with the tree in place. `exit 1` turned into `exit 0` on the no-`sudo` branch must redden (1). |
| **Implemented by** | `tests/unit/m-cu.remove-volumes.test.ts`. |
| **Covers** | CU-4, CU-FR3, CU-FR4. |

### CU-5 — the guard, which exists because the function takes an argument

| | |
|---|---|
| **Premise** | `cleanup.sh` derives its directory from its own location and cannot hand the function an empty string, a relative path or `/`. The function can be called by anything that sources the file, and `sudo rm -rf` of `volumes` relative to the caller's working directory, or of `/volumes`, is a mistake that costs nothing to refuse and a great deal to make. The refusal has to come before **any** leg, which is why these rows stub `rm` as well. |
| **Component** | As CU-1, with `bin/rm` replaced by a stub. |
| **Steps** | Build the fixture with `volumes/plain/keep` holding `probe` and `bin/rm` a stub that appends its arguments to `rm.log` and exits 1; run with the **fixture root as the working directory**, so a relative `volumes` would name the fixture's own tree; read stderr, the exit status, the three logs and the file. |
| **Test data, both sides** | **Refused:** `""`; `volumes-of-nobody` — a name no checkout has, so an accepted relative path would be visible as an attempt on something that does not exist rather than quietly removing something that does; `/`; `///`. **Accepted, (4):** `<dir>/` — the fixture root with a trailing slash, carrying its space, with `bin/rm` the real one again and the plain tree in place. |
| **Expected** | (1)–(3): stderr holds `ERROR: refusing to remove volumes/ under '<arg>': not an absolute path below /.` with the argument as given; exit 1; `rm.log`, `docker.log` and `sudo.log` do not exist; `volumes/plain/keep` reads `probe`. (4): exit 0, `volumes/` gone, stdout `Removing volumes/...` alone. |
| **Shown able to fail** | The guard removed must redden (1) and (2) — `rm.log` exists, holding `-rf` and `/volumes` or `volumes-of-nobody/volumes` — and (3). The trailing-slash normalisation removed leaves (4) green, deliberately: `<dir>//volumes` is the same directory to the kernel, and the normalisation exists for the `/` comparison, which (3)'s `///` holds. |
| **Implemented by** | `tests/unit/m-cu.remove-volumes.test.ts`. |
| **Covers** | CU-5, CU-FR5. |

### CU-6 — `cleanup.sh` calls it, and nothing else does the step

| | |
|---|---|
| **Premise** | A function nobody calls protects nobody. The unit cases run the library; this case holds that the script the operator runs reaches it, and that the step is not also still there inline — two copies of a destructive step drift, and the one without the leg is the one that runs. |
| **Component** | `cleanup.sh` and `scripts/linux/lib/remove-volumes.sh`, read as text with comment lines stripped; and the library sourced into `bash -c 'set -euo pipefail; . "$0"; declare -F lu_remove_volumes'`. |
| **Steps** | Read both files; strip comment lines; assert on the text. Source the library and read exit status and both streams. |
| **Test data, both sides** | **Must be in `cleanup.sh`'s code:** `. "${PROJECT_DIR}/scripts/linux/lib/remove-volumes.sh"` (or `source`), and `lu_remove_volumes "${PROJECT_DIR}"`. **Must not be:** `rm -rf "${PROJECT_DIR}/volumes"`, and the word `sudo`. **Sourcing:** exit 0, stdout and stderr empty, `declare -F` naming the function. The `--pull never` of the library's one `docker run` is CS-22's: it walks `scripts/**/*.sh` and would name `scripts/linux/lib/remove-volumes.sh` without the flag, so the site is held there rather than twice. |
| **Expected** | As stated: two presences, two absences, one clean sourcing. |
| **Shown able to fail** | The old inline block put back in place of the call must redden (1) and (2). A `lu_remove_volumes "$PWD"` at the library's foot must redden (3): sourcing then runs it against the checkout — which is why that scenario sources the library from a `mkdtemp` working directory holding no `volumes/`, so a defective library finds nothing to remove. |
| **Implemented by** | `tests/contract/m-cu.cleanup-wiring.test.ts`. |
| **Covers** | CU-6, CU-FR4. |

### CU-7 — the real leg on real rootless Docker · **manual**

| | |
|---|---|
| **Premise** | Everything above runs against a stub that removes a directory when told to. Whether a container started by the same daemon can really remove a tree the host user cannot is a property of the platform, and only the platform can answer it. This is the check that answers it, written so the operator can repeat it on their own host, and its result from the day it was first run. |
| **Component** | `cleanup.sh` as shipped, on a host running rootless Docker, against a scratch copy of the project — never the working checkout. |
| **Steps** | 1. Copy the checkout to a scratch directory with a space in its path. 2. Make a tree the host user cannot delete, the way #10 did: `mkdir -p volumes/nar_builder/m2/org/x && docker run --rm --pull never -v "$PWD/volumes/nar_builder/m2:/m2" --entrypoint chown liquidupstart/nar-builder:latest -R -h builder /m2`. 3. `rm -rf volumes` and record the refusal. 4. `./cleanup.sh --keep-images` and record stdout, stderr, the exit status, and `ls volumes` afterwards. 5. **Negative control:** rebuild the tree, disable the container leg (`if false` on its branch in a copy of the library) and run again: the refusal must reach `sudo` and ask, or fail without it. Restore the library. |
| **Test data** | A tree whose directories are `101499:1000` mode `755` after step 2 — `stat -c '%u:%g %a' volumes/nar_builder/m2` to confirm. |
| **Expected** | Step 3: `rm: cannot remove 'volumes/nar_builder/m2/org/x': Permission denied`. Step 4: no password prompt; stdout holds `Plain removal failed (files owned by another UID); retrying from a container...`, `Removing volumes/ from a container (nginx:latest)...` and `volumes/ removed from a container.`; exit 0; `ls volumes` answers *No such file or directory*. Step 5: `retrying with sudo` on stdout and either a password prompt or `ERROR: cannot remove volumes/ and sudo is unavailable.` with exit 1. |
| **What it found, 2026-11-03** | Measured on this host — rootless Docker, `iztiev:100000:65536`, `SecurityOptions rootless`, local images with `--pull never` — before the code existed, as the measurement the design rests on. A `volumes/` tree with a `101499`-owned subtree refused plain `rm -rf` with `Permission denied`. `docker run --rm --pull never --entrypoint rm -v "<abs project>:/v" nginx:latest -rf /v/volumes` → exit 0, all of `volumes/` gone, dotfiles included; `nginx:latest` was present as the proxy's image. The same shape with the builder image and `-v "<abs>/volumes/nar_builder:/v" … -rf /v/m2` → exit 0, `m2` gone, `volumes/nar_builder/` left behind empty and owned by host uid 1000 — the mount point, which is why the leg mounts the project directory and not `volumes/`. With `--pull never` and an image not present, Docker answered `No such image` and ran nothing. *The run of steps 1–5 against the shipped `cleanup.sh` is to be recorded here.* |
| **Not covered by this check** | Docker Desktop and rootful Docker, where plain `rm` succeeds and the leg is not reached; CU-1 is their row. |
| **Covers** | CU-7, CU-FR1. |

**Branches no case reaches, deliberately.** A `volumes` that exists and is not a directory — a file or a
symlink at that name — is removed by plain `rm -rf` like anything else and never reaches a leg that
cares; no row shapes it. A path with a `:` in it makes Docker split the `-v` and the leg fall through
to `sudo` by CU-3's route; the shape is not one this project has met and the fall-through is already
held, so it has no row of its own. Both are stated here so the full-coverage claim in §1 can be read
against them.
