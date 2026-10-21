#!/usr/bin/env bash
# The two decisions SYSTEM_BIND_ADDRESS needs, in a file a test can source.
#
# Sourced by scripts/linux/start.sh. They sat inline there and neither could be
# measured without running a start, which stops the stack -- so the one that was
# wrong stayed wrong until a reviewer read it: `::1` was reported as "your
# network", and 127.0.0.2 would have been too. F1 of the 2026-10-16 review.
#
# The same shape as config/scripts/start/lib/proxy-identity.sh: a decision the
# start makes, lifted out so a case can put values through it.

# Does the host address reach this machine only?
#
# Every loopback form compose accepts, which is more than the one .env.example
# names: the whole 127/8 range, and IPv6 loopback with or without brackets.
# `localhost` is deliberately **not** loopback here. It is not a literal address,
# compose refuses it outright, and anything that still reaches this function
# carrying it has a configuration that cannot have started -- so answering "this
# machine only" about it would be the false promise this guard exists to stop.
lu_bind_is_loopback() {  # lu_bind_is_loopback <address>
  local a="${1:-}"
  [[ -z "$a" ]] && return 0   # unset or empty is the 127.0.0.1 default
  case "$a" in
    127.*|::1|'[::1]') return 0 ;;
    *) return 1 ;;
  esac
}

# Compose's own verdict on the address, printed when it refuses it.
#
# Compose is the judge rather than a matcher of our own: it accepts 127.0.0.2,
# `::1` and `[::1]` as well as the obvious two, and a validator here that refused
# one of those would be worse than the defect it fixes. Measured 2026-10-16 --
# `localhost` refused with `invalid IP address: localhost`; 127.0.0.1, 127.0.0.2,
# ::1, [::1] and 0.0.0.0 all accepted.
#
# Only this class of error is reported. A configuration broken for some other
# reason still fails at `up`, as it does today; widening that is a change to the
# start's error handling rather than to this key.
lu_bind_invalid_address() {  # lu_bind_invalid_address [project-dir]
  local dir="${1:-.}"
  ( cd "$dir" && docker compose config -q 2>&1 ) | grep -iE "invalid IP address" | head -n1
}
