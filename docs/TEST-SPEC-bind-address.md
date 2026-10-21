# Test specification — the address the stack is published on

`SYSTEM_BIND_ADDRESS` (`.env.example`, section 1) sets the host address of the proxy's two published
ports; unset or empty means `127.0.0.1`. The README promises "localhost by default" under *Sandbox by
design*. These cases hold the promise and the configuration together.

**Level: integration**, against `docker compose config` resolved from the checkout, so a default in
`${VAR:-…}` is read as compose resolves it rather than as the file appears to read. A0-10 sources
`config/scripts/start/lib/bind-address.sh` instead, because a start stops the stack.

**Test file:** `tests/integration/m-a0.bind-address.test.ts`.

**This specification was written after the test, which is the wrong order** and is `B1` of the
2026-10-16 review. The case ids A0-7 and A0-8 existed in a test title with no row anywhere, and
`TR-1` — merged on #23 after this branch was opened — turns that into a red suite on `main`.
Reproduced before it was fixed: `3 pass / 1 fail`, the failure naming
`A0-7 (tests/integration/m-a0.bind-address.test.ts)` and `A0-8`. The reviewer wrote the first draft of
this file in the review; A0-9 and A0-10 and the corrected A0-8 negative are what the fixes added.

## Overview

| # | Scenario | Kind | Expectation |
|---|---|---|---|
| A0-7 | Both proxy ports with `SYSTEM_BIND_ADDRESS=''` | Positive | Every published port has `host_ip` `127.0.0.1`, and there is at least one |
| A0-7 | Which services publish a port, same environment | **Negative** | No service other than `proxy` publishes anything |
| A0-7 | README wording | Positive | `README.md` contains ``bind to `localhost` by default`` and `SYSTEM_BIND_ADDRESS` |
| A0-8 | Both proxy ports with `SYSTEM_BIND_ADDRESS=0.0.0.0` | Positive | Every published port has `host_ip` `0.0.0.0`, and there is at least one |
| A0-8 | `.env.example` wording | Positive | Contains `SYSTEM_BIND_ADDRESS=127.0.0.1`, the words `no password`, **and `OpenClaw gateway with admin rights`** |
| A0-9 | `SYSTEM_BIND_ADDRESS=localhost` | **Negative** | Compose refuses it, in the words `invalid IP address: localhost` |
| A0-9 | `127.0.0.1`, `127.0.0.2`, `::1`, `[::1]`, `0.0.0.0` | Positive | Each is accepted — the guard refuses one value, not a class |
| A0-10 | `''`, `127.0.0.1`, `127.0.0.2`, `::1`, `[::1]` | Positive | Each is reported as *this machine only* |
| A0-10 | `0.0.0.0`, `192.168.1.5`, `10.99.0.2` | **Negative** | Each is reported as *your network* |
| A0-10 | `localhost` | **Negative** | Not reported as loopback, because a stack with that value cannot have started |
| A0-10 | The warning's wording | Positive | `start.sh` names `OpenClaw gateway with admin rights` |

## Detail

### A0-7 — by default the stack is reachable from this machine only

| | |
|---|---|
| **Premise** | Before this change both proxy ports were published with no address, i.e. on every interface, while the README said the opposite. |
| **Component** | `compose.yml` (`proxy.ports`), `README.md`. |
| **Test data** | Process environment `SYSTEM_BIND_ADDRESS=''`, which overrides any value in a local `.env` and stands for an installation whose `.env` predates the key. |
| **Steps / expected** | Resolve the configuration; every `ports[]` entry of every service reads `proxy 127.0.0.1:<port>`. Read `README.md` for the two strings in the table. |
| **Negative** | The "only `proxy` publishes" scenario: a second service publishing a port would be an exposure the first scenario does not see. |
| **Dependencies** | `docker` with the compose plugin; no running stack. |
| **What it found** | Green from the first run. The reviewer verified the same readings independently on the merged tree, including that an explicit `0.0.0.0` binds IPv4 only, so the open state is narrower than the old address-less form and never wider. |

### A0-8 — an operator who needs the network can have it

| | |
|---|---|
| **Premise** | The OpenClaw node bridge takes connections from other machines, so the default has to be changeable. |
| **Component** | `compose.yml`, `.env.example`. |
| **Test data** | Process environment `SYSTEM_BIND_ADDRESS=0.0.0.0`. The `.env.example` assertion reads three strings: the default, `no password`, and `OpenClaw gateway with admin rights`. |
| **Steps / expected** | Resolve the configuration; every published port reads `0.0.0.0:<port>`. `.env.example` declares the default and names the cost. |
| **Negative** | **Covered by A0-9 since 2026-10-16.** This cell previously said an invalid value was deliberately omitted because compose rejects it rather than this project's code. That was the defect: compose rejects it *at `up`*, after `down.sh` has emptied the stack, so "compose handles it" meant "the operator is left with nothing running". |
| **Dependencies** | As A0-7. |
| **What it found** | Green, and then `F2` of the review found the cost list incomplete: it named OpenCode and the Swagger UI and left out the gateway, whose node bridge is the reason given for opening the port. The proxy asserts the operator identity for whoever reaches it — `config/scripts/start/openclaw.sh` says so in as many words, *"the nginx here authenticates nobody, it sets a constant X-Forwarded-User, so whoever reaches the proxy is already the operator"* — and `operator.admin` is among the auto-approved scopes. The most expensive item was the missing one, and the third assertion now holds it. |

### A0-9 — the value is judged before anything is stopped

| | |
|---|---|
| **Premise** | `SYSTEM_BIND_ADDRESS` is judged by compose the same way `ipv4_address` is: at `up`, long after `down.sh` has emptied the stack, with a message that names no key of ours. `start.sh` already carries that lesson for the proxy address — *"Checked here instead, before anything is stopped"* — and this key arrived without it. `F1` of the 2026-10-16 review. |
| **Component** | `lu_bind_invalid_address` in `config/scripts/start/lib/bind-address.sh`, called from the pre-flight block of `scripts/linux/start.sh` before `down.sh`. |
| **Steps** | Source the helper; call it with each value in the process environment; read what it prints. |
| **Test data, both sides, and why these** | `localhost` is the negative, and it is not invented: it is the value an operator reaches for first, it reads as correct, and compose refuses it with `invalid IP address: localhost`. The positives are `127.0.0.1` (the documented default), **`127.0.0.2`** and **`::1`** and **`[::1]`** (accepted by compose and easy for a hand-written validator to refuse by accident), and `0.0.0.0` (the documented open form). Measured 2026-10-16, each one by hand before the helper existed. |
| **Expected** | For `localhost`, output matching `invalid IP address: localhost`. For each of the five, empty output. |
| **Why compose is the judge** | A matcher of our own would have to accept all five forms above and reject names, which is IPv6 parsing in bash — and refusing a value compose accepts is worse than the defect being fixed. |
| **Why `localhost` is refused and not rewritten** | Mapping it to `127.0.0.1` inside `start.sh` was the alternative. The dashboard renders this compose file too, so a rewrite living in one path would make the two disagree about what `.env` means. Refusing keeps `.env` the single truth. |
| **Scope line** | Only the invalid-address class stops the start. A configuration broken for another reason still fails at `up`, as before; widening that is a change to the start's error handling rather than to this key, and is not done here. |
| **What it found** | Green on first run after the fix; the defect it records was found by reading rather than by this case, which is the honest order and the reason the case exists. |

### A0-10 — and the line the operator reads names the right side

| | |
|---|---|
| **Premise** | The start prints which of the two states it is in. It tested `"127.0.0.1"` and `"localhost"` as literals, so **`::1` was reported as "Reachable from: your network"** — the opposite of the truth — and `127.0.0.2` would have been too. Neither could be measured while the decision sat inline in a script that stops the stack, which is why the wrong one stayed wrong. |
| **Component** | `lu_bind_is_loopback` in `config/scripts/start/lib/bind-address.sh`; the warning's wording in `scripts/linux/start.sh`. |
| **Steps** | Source the helper and call it with each value, reading the exit status. Read `start.sh` for the gateway wording. |
| **Test data, both sides** | Loopback: `''` (the unset default), `127.0.0.1`, `127.0.0.2`, `::1`, `[::1]`. Network: `0.0.0.0`, `192.168.1.5` (an ordinary LAN address), `10.99.0.2` (the stack's own proxy address, chosen because it is a real address from this project that is **not** loopback — a classifier keyed on "ours" rather than on the range would pass the first two and fail here). And `localhost`, which must not be called loopback: it is not a literal address, compose refuses it, so a stack carrying it cannot be up and a promise about it would be false. |
| **Expected** | Exit 0 for the five loopback forms, exit 1 for the three network forms and for `localhost`. `start.sh` contains `OpenClaw gateway with admin rights`. |
| **What it found** | The `::1` misreport, by reading, before this case existed. With the case, reverting the helper to the old two-literal test reddens three scenarios. |

## What is deliberately not here

- **A live stack on the new binding.** Every case here reads a resolved configuration or a pure
  function. Whether a browser on the host reaches `127.0.0.1:8888` through Docker Desktop on macOS,
  Windows or WSL2 is a property of those runtimes; the reviewer named it as unverified and it stays a
  documented manual check rather than an assertion that would be green here and wrong there.
- **The dashboard's start path.** The pre-flight added for A0-9 is in `scripts/linux/start.sh`. The
  dashboard renders the same compose file and would still meet compose's own error at `up`. That is
  the boundary refusing rather than rewriting was chosen to keep honest: `.env` means one thing in
  both paths.
- **The nginx identity itself.** That a LAN client sending `Host: openclaw.localhost` is served as the
  operator is `BACKLOG.md`'s `operator.admin` entry and belongs with #15, which is where the guard for
  it is being built. A0-8 asserts only that the cost is **written down** where an operator decides.

## Traceability

| Requirement | Covered by |
|---|---|
| The default binds to this machine, on every published port | A0-7 |
| Nothing but the proxy publishes a port | **A0-7** negative |
| The promise in prose and the default in configuration are asserted together | A0-7, A0-8 |
| The default can be changed, and the cost is written where it is decided | A0-8 |
| A value compose refuses stops the start before anything is stopped | **A0-9** |
| A value compose accepts is not refused by a guard of ours | A0-9 positives |
| The reported state matches the address, for every loopback form | A0-10 |
| …and for addresses that are not loopback | **A0-10** negatives |
