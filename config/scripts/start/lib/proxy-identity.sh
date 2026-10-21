# The identity nginx vouches for, read out of the template — one place to ask.
#
# The grant in openclaw.json only works while it names **exactly** the identity
# nginx injects as `X-Forwarded-User`, so neither the start script nor this
# library may carry that string: it is read from
# `config/nginx/templates/nginx.conf`, which is the file that sets it. OC-39.
#
# **Why it is a library rather than a block inside openclaw.sh.** C4 of the
# 2026-10-01 review: `scripts/linux/start.sh` calls `down.sh` and only then
# `config/scripts/start/openclaw.sh`, so a template this could not read ended the
# start **after the stack had been emptied** — the operator was left with nothing
# running and a message about nginx. The script already has that shape for the
# subnet and the proxy address ("Nothing has been stopped; the stack is as it
# was"), and the identity now joins them: start.sh asks before the teardown,
# openclaw.sh asks again for the value, and both ask the same function.
#
# Prints the identity on stdout and returns 0, or explains on stderr and returns
# 1. Nothing is echoed on the happy path but the value itself, so a caller can
# use it as `identity="$(lu_proxy_identity "$template")"`.
lu_proxy_identity() {  # lu_proxy_identity <nginx-template>
  local template="$1" values mentions strict_lines unique

  if [[ ! -f "$template" ]]; then
    echo "Error: ${template} does not exist." >&2
    echo "  nginx is what authenticates here; without that file there is no" >&2
    echo "  identity to grant, and every proxied request would be refused." >&2
    return 1
  fi

  # The strict form, which is the one this repository's template uses and the
  # only one that can be read without guessing: the directive, the header, and a
  # double-quoted value.
  values="$(awk -F'"' '
    /^[[:space:]]*proxy_set_header[[:space:]]+X-Forwarded-User[[:space:]]+"/ { print $2 }
  ' "$template" | sort -u)"
  # Distinct non-empty values: how many identities the file names.
  unique="$(printf '%s\n' "$values" | grep -c . || true)"
  # **Lines**, not values, and the difference matters: the shipped template sets
  # the same identity on three vhosts, so comparing unique values against the
  # line count below refuses every template this repository ships. Measured in
  # the first form of this fix, which did exactly that.
  strict_lines="$(awk '
    /^[[:space:]]*proxy_set_header[[:space:]]+X-Forwarded-User[[:space:]]+"/ { n++ }
    END { print n + 0 }
  ' "$template")"

  # **Every line that sets this header at all**, however it is spelled: single
  # quotes, no quotes, a lower-case header name, a variable. C4 and C5 of the
  # 2026-10-01 review -- those are all valid nginx and the strict pattern skips
  # them, so a template mixing one quoted line with one unquoted line dropped the
  # unquoted one **silently** and granted the identity it happened to match,
  # while a template with no quoted line at all reported "no identity found" when
  # it plainly set one.
  #
  # Refusing is deliberate and the alternative was considered: teaching this to
  # read every spelling means re-implementing a slice of nginx's parser, and the
  # file is generated from `config/nginx/templates/nginx.conf` by this repository.
  # What was wrong was never the strictness -- it was being strict quietly.
  mentions="$(awk '
    { line = $0 }
    tolower(line) ~ /^[[:space:]]*proxy_set_header[[:space:]]+x-forwarded-user([[:space:]]|$)/ { n++ }
    END { print n + 0 }
  ' "$template")"

  if [[ "$mentions" -gt "$strict_lines" ]]; then
    echo "Error: ${template} sets X-Forwarded-User in a form this cannot read." >&2
    awk '
      { line = $0 }
      tolower(line) ~ /^[[:space:]]*proxy_set_header[[:space:]]+x-forwarded-user([[:space:]]|$)/ \
        && line !~ /^[[:space:]]*proxy_set_header[[:space:]]+X-Forwarded-User[[:space:]]+"/ {
          printf "  line %d: %s\n", NR, line
        }
    ' "$template" >&2
    echo "  The grant has to name exactly what nginx sends, so the identity is" >&2
    echo "  read from this file rather than repeated in the start script -- and" >&2
    echo "  only the double-quoted spelling is read:" >&2
    echo "      proxy_set_header X-Forwarded-User \"someone@example.org\";" >&2
    echo "  Nginx accepts the others. This refuses them out loud instead of" >&2
    echo "  skipping them, which is how one line could be dropped in a file that" >&2
    echo "  had two." >&2
    return 1
  fi

  if [[ "$unique" -gt 1 ]]; then
    echo "Error: ${template} sets more than one X-Forwarded-User identity:" >&2
    printf '  %s\n' $values >&2
    echo "  The gateway grants scopes to one identity. With two, whichever is" >&2
    echo "  granted leaves the other unable to approve a device pairing, and the" >&2
    echo "  refusal reads as a scope error rather than a mismatch." >&2
    return 1
  fi

  local identity
  identity="$(printf '%s\n' "$values" | head -n 1)"
  if [[ -z "$identity" ]]; then
    # `head`, not `tail`, and the two differ here: a template setting an empty
    # value beside a real one yields two lines of which `grep -c .` counts one,
    # so the more-than-one guard above does not fire. Taking the first refuses;
    # taking the last would start a stack in which some vhost vouches for
    # nobody. OC-74.
    if [[ "$strict_lines" -gt 0 ]]; then
      echo "Error: ${template} sets an empty X-Forwarded-User identity." >&2
      echo "  A vhost sending an empty header attributes nothing, so the grant" >&2
      echo "  cannot name it and requests through that vhost are refused." >&2
    else
      echo "Error: no X-Forwarded-User identity found in ${template}." >&2
      echo "  nginx is what authenticates here; without that header the gateway" >&2
      echo "  attributes nothing and every proxied request is refused." >&2
    fi
    return 1
  fi

  printf '%s\n' "$identity"
}
