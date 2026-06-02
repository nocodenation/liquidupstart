#!/usr/bin/env bash
#
# Injects a custom stylesheet <link> into OpenProject's rendered <head>.
#
# OpenProject's built-in theming (colors/logo) is gated behind an Enterprise
# token (apply_custom_styles? -> EnterpriseToken.allows_to?(:define_custom_style)).
# To theme the Community edition we bypass that path entirely: we append an
# external stylesheet link to the head partial, and nginx serves the CSS as a
# static file at /custom-theme/style.css.
#
# _common_head.html.erb is rendered inside <head> by BOTH base.html.erb (main
# app) and only_logo.html.erb (login / error pages), so patching it once covers
# every server-rendered page. The link is appended at the end of the partial so
# it loads after OpenProject's own stylesheets and wins the cascade.
#
# Runs on every container start (the image's /app is not volume-mounted, so the
# ERB resets each recreate). The grep guard makes re-runs a no-op.
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
