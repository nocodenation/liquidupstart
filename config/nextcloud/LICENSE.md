# Licensing of `config/nextcloud/`

This repository as a whole is licensed under the Apache License 2.0 (see the
top-level `LICENSE`). The following files in this directory are an **exception**:
they are licensed under **AGPL-3.0-or-later**, because they modify Nextcloud
(itself AGPL-3.0) and, once applied, form a modified work of Nextcloud:

- `patch_nextcloud.sh`
- `sso_block.php`
- `lc_logout_redirect.php`
- `session_security_block.php`

`patch_nextcloud.sh` runs as a container entrypoint hook and splices the three
PHP snippets into Nextcloud's own source files at runtime
(`lib/base.php`, `core/Controller/LoginController.php`,
`lib/private/User/Session.php`). The patched files are a derivative work of
Nextcloud and are therefore governed by the GNU Affero General Public License,
version 3 or (at your option) any later version.

**Network use (AGPL §13).** If you run a Nextcloud instance patched by these
files and let users interact with it over a network, you must offer those users
the Corresponding Source of the modified version. The Corresponding Source is
Nextcloud's published source (<https://github.com/nextcloud/server>) together
with the modifications in this directory. The modifications live at:

  https://github.com/nocodenation/liquidupstart

The rest of this directory — the theme under `theme/`, and the installation
helpers (`install_nextcloud.sh`, `pre_install.sh`, `post_install.sh`,
`templates/set_trusted_proxies.sh`, `no_skeleton.config.php`) — does not embed
Nextcloud code; it configures Nextcloud through its supported `occ` CLI and
theming mechanism, and remains under the repository's Apache-2.0 license.

A full copy of the AGPL-3.0 is available at
<https://www.gnu.org/licenses/agpl-3.0.txt>.
