#!/usr/bin/sh

# Write skeletondirectory config before occ maintenance:install runs,
# so neither the admin user nor any future user gets default skeleton files.
cp /tmp/no_skeleton.config.php /var/www/html/config/no_skeleton.config.php \
    && chown 33:33 /var/www/html/config/no_skeleton.config.php \
    && chmod 644 /var/www/html/config/no_skeleton.config.php

echo "Pre-install: skeletondirectory set to empty"
