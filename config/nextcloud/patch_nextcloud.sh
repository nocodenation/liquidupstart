#!/usr/bin/sh

# Inject SSO login handler into base.php: rename original handleLogin →
# handleLoginBase, append a new handleLogin that tries SSO then falls back.
# Resilient to upstream code changes.
if ! grep -q 'handleLoginBase' /var/www/html/lib/base.php; then
    awk '
    { sub(/public static function handleLogin\(/, "public static function handleLoginBase(") }
    /^}$/ { while ((getline line < "/tmp/sso_block.php") > 0) print line }
    { print }
    ' /var/www/html/lib/base.php > /tmp/base_patched.php \
        && cp /tmp/base_patched.php /var/www/html/lib/base.php \
        && chown 33:33 /var/www/html/lib/base.php \
        && chmod 644 /var/www/html/lib/base.php
fi

# Patch LoginController.php:
#   1. Redirect logout to SSO provider (/auth/logout/) instead of Nextcloud login form
#   2. Remove X-User-Id response header
if ! grep -q '/auth/logout/' /var/www/html/core/Controller/LoginController.php; then
    awk '
    /linkToRouteAbsolute\($/ {
        getline l2
        if (l2 ~ /core\.login\.showLoginForm/) {
            getline l3; getline l4
            while ((getline line < "/tmp/lc_logout_redirect.php") > 0) print line
            next
        }
        print; print l2; next
    }
    /if \([$]uid !== null\) [{]/ {
        getline l2
        if (l2 ~ /X-User-Id/) {
            getline l3; next
        }
        print; print l2; next
    }
    { print }
    ' /var/www/html/core/Controller/LoginController.php > /tmp/lc_patched.php \
        && cp /tmp/lc_patched.php /var/www/html/core/Controller/LoginController.php \
        && chown 33:33 /var/www/html/core/Controller/LoginController.php \
        && chmod 644 /var/www/html/core/Controller/LoginController.php
fi

# Patch Session.php:
#   Block login when username equals password (plain password logins only)
if ! grep -q 'username equals password' /var/www/html/lib/private/User/Session.php; then
    awk '
    /private function loginWithPassword\([$]uid, [$]password\)/ {
        print
        while ((getline line < "/tmp/session_security_block.php") > 0) print line
        next
    }
    { print }
    ' /var/www/html/lib/private/User/Session.php > /tmp/session_patched.php \
        && cp /tmp/session_patched.php /var/www/html/lib/private/User/Session.php \
        && chown 33:33 /var/www/html/lib/private/User/Session.php \
        && chmod 644 /var/www/html/lib/private/User/Session.php
fi

echo "All files copied"