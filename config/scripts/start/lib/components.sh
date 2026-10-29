# shellcheck shell=bash
# Which of the three large components this installation runs. Sourced, never run.
#
# What it is for
#   ENABLE_LIQUID, ENABLE_OPENCLAW and ENABLE_OPENCODE in .env decide whether Liquid (with the
#   NAR builder), OpenClaw and OpenCode are built and started. scripts/linux/build.sh and
#   scripts/linux/start.sh ask here; dashboard/src/lib/component-switches.ts answers the same
#   question for the dashboard, and CS-2 holds the two readers to one table.
#
# Functions
#   lu_component_state FILE KEY    on | off, or an error for a value that is neither
#   lu_components_check FILE       0 when all three are readable, 1 after an error for each one that is not
#   lu_component_on FILE KEY       0 when on, 1 when off; only after lu_components_check
#   lu_component_profiles FILE     the compose profiles of what is on, comma-separated
#
# Requires bash 3.2 or later; no Docker call. docs/FEATURE-component-switches.md §5.

# The value of KEY's last line in FILE, as compose reads a key given twice. env_value takes the
# first, so it is not used here. The text after `=` is trimmed; a quote that closes on the line
# gives what lies between, whatever follows it; otherwise the value ends at the first blank
# followed by `#`. Then it is trimmed again. `switchValue` in component-switches.ts is the same
# rule over the same text, which is what lets CS-2 ask the two readers to agree.
# Blanks are the six ASCII ones, named rather than taken from [[:space:]], whose members depend
# on the locale: under en_US.UTF-8 a no-break space can be one, under C it is not.
lu_component_value() {
  local value ws=$' \t\n\v\f\r'
  value="$(grep -E "^${2}=" "$1" 2>/dev/null | tail -n1 | cut -d'=' -f2- || true)"
  value="${value#"${value%%[!$ws]*}"}"
  case "$value" in
    \"*\"*) value="${value#\"}"; value="${value%%\"*}" ;;
    \'*\'*) value="${value#\'}"; value="${value%%\'*}" ;;
    *) value="${value%%[$ws]#*}" ;;
  esac
  value="${value#"${value%%[!$ws]*}"}"
  value="${value%"${value##*[!$ws]}"}"
  printf '%s' "$value"
}

# Absent and empty read as on, so an .env written before the switches existed runs everything.
# Anything but 1 or 0 is refused rather than guessed at: `O` for `0` would otherwise run a
# component the operator switched off, and `off` would cost a 30-minute build.
lu_component_state() {
  local value
  value="$(lu_component_value "$1" "$2")"
  case "$value" in
    ""|1) echo on ;;
    0) echo off ;;
    *)
      echo "Error: ${2}=${value} in .env is not a switch value; use 1 (on) or 0 (off)." >&2
      echo "::aiw-error::${2} must be 1 or 0, not '${value}'. Fix it under Which apps to run in Configuration and try again." >&2
      return 1
      ;;
  esac
}

lu_components_check() {
  local key status=0
  for key in ENABLE_LIQUID ENABLE_OPENCLAW ENABLE_OPENCODE; do
    lu_component_state "$1" "$key" >/dev/null || status=1
  done
  return "$status"
}

lu_component_on() {
  [[ "$(lu_component_state "$1" "$2" 2>/dev/null)" == on ]]
}

lu_component_profiles() {
  local profiles=""
  if lu_component_on "$1" ENABLE_LIQUID; then profiles="liquid"; fi
  if lu_component_on "$1" ENABLE_OPENCLAW; then profiles="${profiles:+${profiles},}openclaw"; fi
  if lu_component_on "$1" ENABLE_OPENCODE; then profiles="${profiles:+${profiles},}opencode"; fi
  printf '%s' "$profiles"
}
