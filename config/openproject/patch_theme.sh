#!/usr/bin/env bash
#
# Injects a custom stylesheet <link> into OpenProject's rendered <head>.
#
# Built-in theming is gated behind an Enterprise token, so for the Community
# edition we bypass it: append a stylesheet link to the head partial (nginx
# serves the CSS at /custom-theme/style.css).
#
# _common_head.html.erb is rendered by both base.html.erb and only_logo.html.erb,
# so patching it once covers every page. Appended last so it wins the cascade.
#
# Runs every start (/app isn't volume-mounted, so the ERB resets each recreate);
# the grep guard makes re-runs a no-op.
set -eu

HEAD_PARTIAL="/app/app/views/layouts/_common_head.html.erb"
MARKER="/custom-theme/style.css"
LINK_TAG='<link rel="stylesheet" href="/custom-theme/style.css?v=1" media="all">'

if [ ! -f "$HEAD_PARTIAL" ]; then
    echo "patch_theme: head partial not found at $HEAD_PARTIAL — skipping"
    exit 0
fi

if grep -qF "$MARKER" "$HEAD_PARTIAL"; then
    echo "patch_theme: custom theme link already present — skipping"
    exit 0
fi

printf '\n%s\n' "$LINK_TAG" >> "$HEAD_PARTIAL"
echo "patch_theme: injected custom theme link into $HEAD_PARTIAL"
