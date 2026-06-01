public static function handleLogin(OCP\IRequest $request): bool {
		if (!$request->getHeader('X-Nextcloud-Federation')) {
			// Custom header-based SSO: auto-provision and auto-login
			$userSession = Server::get(\OC\User\Session::class);
			try {
				$email = trim((string)$request->getHeader('X-Authentication-Email'));
				if ($email === '' && isset($_SERVER['HTTP_X_AUTHENTICATION_EMAIL'])) {
					$email = trim((string)$_SERVER['HTTP_X_AUTHENTICATION_EMAIL']);
				}
				$name = trim((string)$request->getHeader('X-Authentication-Name'));
				if ($name === '' && isset($_SERVER['HTTP_X_AUTHENTICATION_NAME'])) {
					$name = trim((string)$_SERVER['HTTP_X_AUTHENTICATION_NAME']);
				}
				if ($email !== '') {
					$uid = $email;
					/** @var \OCP\IUserManager $userManager */
					$userManager = Server::get(\OCP\IUserManager::class);
					$user = $userManager->get($uid);
					if ($user === null) {
						// Fallback: try to find an existing account by email
						$byEmail = $userManager->getByEmail($email);
						if (is_array($byEmail) && count($byEmail) === 1) {
							$user = $byEmail[0];
							$uid = $user->getUID();
						}
					}
					if ($user === null) {
						// Determine if this will be the first user in the instance
						$firstUser = false;
						try {
							$counts = $userManager->countUsers();
							$totalUsers = 0;
							if (is_array($counts)) {
								foreach ($counts as $cnt) {
									$totalUsers += (int)$cnt;
								}
							}
							$firstUser = ($totalUsers === 0);
						} catch (\Throwable $eCount) {
						}
						// Create user with email as UID
						$user = $userManager->createUser($uid, $uid);
						if ($user) {
							if ($name !== '') {
								try { $user->setDisplayName($name); } catch (\Throwable $eSetName) {}
							}
							try { $user->setEMailAddress($email); } catch (\Throwable $_) {}
							// If this is the first user in the system, grant admin rights
							if ($firstUser) {
								try {
									/** @var \OCP\IGroupManager $groupManager */
									$groupManager = Server::get(\OCP\IGroupManager::class);
									$adminGroup = $groupManager->get('admin');
									if ($adminGroup === null) {
										$adminGroup = $groupManager->createGroup('admin');
									}
									if ($adminGroup !== null) {
										$adminGroup->addUser($user);
									}
								} catch (\Throwable $eAdmin) {}
							}
						}
					}
					if ($user !== null) {
						// Update display name if header provided and differs
						if ($name !== '') {
							try {
								$currentDisplay = (string)$user->getDisplayName();
								if ($currentDisplay !== $name) {
									$user->setDisplayName($name);
								}
							} catch (\Throwable $eSetNameExisting) {}
						}
						// Complete login without password and create a session token
						$userSession->completeLogin($user, ['loginName' => $uid, 'password' => ''], true);
						$userSession->createSessionToken($request, $user->getUID(), $uid, null);
						return true;
					}
				}
			} catch (\Throwable $e) {
				// Do not break other auth mechanisms
			}
		}
		return self::handleLoginBase($request);
	}