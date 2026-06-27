// SPDX-License-Identifier: AGPL-3.0-or-later
		// Liquid Upstart modification to Nextcloud, injected into lib/private/User/Session.php
		// by patch_nextcloud.sh. When applied this forms a modified work of Nextcloud
		// (AGPL-3.0). Corresponding source: https://github.com/nocodenation/liquidupstart
		// Security policy: Disallow login when username equals password
		// Applies only to plain password logins (not tokens)
		if (is_string($uid) && is_string($password) && $uid !== '' && $uid === $password) {
			return false;
		}