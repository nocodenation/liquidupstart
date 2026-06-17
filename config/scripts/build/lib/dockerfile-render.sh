#!/usr/bin/env bash
# Shared helper for rendering a template Dockerfile by injecting the
# SYSTEM_DEPENDENCIES and POST_INSTALLATION_COMMANDS values from the
# environment (loaded from .env by the calling build script).
#
# This mirrors the behaviour of config/scripts/build/nifi.sh so that the
# opencode, openclaw and hermes images consume the exact same two .env
# variables in the same way.
#
# Template conventions:
#   - The token __SYSTEM_DEPENDENCIES__ on the apt install line is replaced
#     with the space-separated package list from SYSTEM_DEPENDENCIES (or
#     removed entirely when SYSTEM_DEPENDENCIES is empty).
#   - The marker line "# POST_INSTALL_COMMANDS" gets one "RUN <cmd>" line
#     injected after it for each comma-separated command in
#     POST_INSTALLATION_COMMANDS.
#
# Usage: render_dockerfile <template_path> <output_path>

# Print a bold-yellow WARNING to stderr. Colorized only when stderr is a
# terminal, so piped/redirected build logs don't capture raw escape codes.
print_warning() {
    local c_warn="" c_reset=""
    if [ -t 2 ]; then
        c_warn=$'\033[1;33m'
        c_reset=$'\033[0m'
    fi
    echo "${c_warn}WARNING: $*${c_reset}" >&2
}

# Combine a generic value with a per-image value according to a mode.
#   $1 = generic value (e.g. SYSTEM_DEPENDENCIES)
#   $2 = per-image value (e.g. NIFI_SYSTEM_DEPENDENCIES)
#   $3 = mode: "add" (or empty/unset, the default) appends the per-image value
#        to the generic one; "override" uses only the per-image value (ignoring
#        the generic one, which means an empty per-image value installs/runs
#        nothing). Any other (unrecognized) value falls back to "add" behavior,
#        but emits a warning so typos like "addd" aren't silently ignored.
#   $4 = optional label for the mode variable, used in the warning message.
# Echoes the resulting comma-separated value.
resolve_setting() {
    local generic="$1"
    local specific="$2"
    local label="${4:-_MODE}"
    local mode
    mode="$(printf '%s' "$3" | tr '[:upper:]' '[:lower:]' | xargs)"

    # Unrecognized (non-empty, non-override, non-add) modes warn, then fall
    # through to the default "add" behavior below.
    case "$mode" in
        override|add|"") ;;
        *)
            print_warning "unrecognized ${label} value '$(printf '%s' "$3" | xargs)'; expected 'add' or 'override'. Falling back to 'add'."
            ;;
    esac

    if [ "$mode" = "override" ]; then
        # Only the per-image value; generic ignored (empty => nothing).
        printf '%s' "$specific"
    elif [ -n "$generic" ] && [ -n "$specific" ]; then
        printf '%s, %s' "$generic" "$specific"
    else
        # Whichever side is non-empty (or empty when both are).
        printf '%s%s' "$generic" "$specific"
    fi
}

# Resolve the effective SYSTEM_DEPENDENCIES and POST_INSTALLATION_COMMANDS for a
# given image by applying its per-image overrides on top of the generic values,
# then assign them back to those two globals (consumed by render_dockerfile).
#   $1 = image env prefix: NIFI, OPENCODE, OPENCLAW or HERMES
resolve_image_settings() {
    local prefix="$1"
    local var

    var="${prefix}_SYSTEM_DEPENDENCIES";              local spec_deps="${!var:-}"
    var="${prefix}_SYSTEM_DEPENDENCIES_MODE";          local deps_mode="${!var:-}"
    var="${prefix}_POST_INSTALLATION_COMMANDS";        local spec_cmds="${!var:-}"
    var="${prefix}_POST_INSTALLATION_COMMANDS_MODE";   local cmds_mode="${!var:-}"

    SYSTEM_DEPENDENCIES="$(resolve_setting "${SYSTEM_DEPENDENCIES:-}" "$spec_deps" "$deps_mode" "${prefix}_SYSTEM_DEPENDENCIES_MODE")"
    POST_INSTALLATION_COMMANDS="$(resolve_setting "${POST_INSTALLATION_COMMANDS:-}" "$spec_cmds" "$cmds_mode" "${prefix}_POST_INSTALLATION_COMMANDS_MODE")"
}

render_dockerfile() {
    local template="$1"
    local output="$2"

    local sys_deps="${SYSTEM_DEPENDENCIES:-}"
    local post_cmds="${POST_INSTALLATION_COMMANDS:-}"

    # Build the space-separated, trimmed package list from SYSTEM_DEPENDENCIES.
    local packages_str=""
    if [ -n "$sys_deps" ]; then
        IFS=',' read -r -a __deps <<< "$sys_deps"
        local __trimmed=()
        local d trimmed
        for d in "${__deps[@]}"; do
            trimmed=$(echo "$d" | xargs)
            [ -n "$trimmed" ] && __trimmed+=("$trimmed")
            # apt package names are case-sensitive and lowercase by convention;
            # warn (but keep the value verbatim) so an upcoming "Unable to locate
            # package" build failure is self-explanatory.
            case "$trimmed" in
                *[A-Z]*)
                    print_warning "SYSTEM_DEPENDENCIES contains an uppercase package name '${trimmed}'; apt package names are lowercase and this will likely fail to install."
                    ;;
            esac
        done
        packages_str="${__trimmed[*]}"
    fi

    mkdir -p "$(dirname "$output")"
    cat "$template" > "$output"

    # Determine sed in-place flag for GNU vs BSD (macOS).
    local sed_inplace
    if sed --version >/dev/null 2>&1; then
        sed_inplace=(-i)
    else
        sed_inplace=(-i '')
    fi

    # Replace the __SYSTEM_DEPENDENCIES__ token with the package list (or
    # nothing when no extra packages are requested).
    local escaped_packages
    escaped_packages=$(printf '%s' "$packages_str" | sed 's/[\/&]/\\&/g')
    sed "${sed_inplace[@]}" -e "s/__SYSTEM_DEPENDENCIES__/${escaped_packages}/g" "$output"

    # Inject post-installation commands as RUN lines under the marker.
    if [ -n "$post_cmds" ]; then
        IFS=',' read -r -a __cmds <<< "$post_cmds"
        local post_block=""
        local c trimmed
        for c in "${__cmds[@]}"; do
            trimmed=$(echo "$c" | xargs)
            [ -n "$trimmed" ] && post_block+="RUN $trimmed\n"
        done

        awk -v block="$post_block" '
          {
            print $0
            if ($0 ~ /# POST_INSTALL_COMMANDS/) {
              n = split(block, lines, "\\n");
              for (i = 1; i <= n; i++) if (length(lines[i]) > 0) print lines[i];
            }
          }
        ' "$output" > "${output}.__new" && mv "${output}.__new" "$output"
    fi
}
