// SPDX-License-Identifier: AGPL-3.0-or-later
// Liquid Upstart modification to Nextcloud, injected into core/Controller/LoginController.php
// by patch_nextcloud.sh. When applied this forms a modified work of Nextcloud (AGPL-3.0).
// Corresponding source: https://github.com/nocodenation/liquidupstart
$response = new RedirectResponse($this->urlGenerator->getAbsoluteURL('/auth/logout/'));