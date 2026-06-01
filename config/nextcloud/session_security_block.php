// Security policy: Disallow login when username equals password
		// Applies only to plain password logins (not tokens)
		if (is_string($uid) && is_string($password) && $uid !== '' && $uid === $password) {
			return false;
		}