<?php

/**
 * Custom theme for the All-in-Wonder Nextcloud instance.
 *
 * This file is loaded when config.php contains 'theme' => 'aiw'.
 * It overrides branding strings and base colors. CSS lives in
 * core/css/server.css (loaded additively on top of the defaults).
 *
 * See themes/example/defaults.php in the Nextcloud source for the full
 * list of overridable methods.
 */
class OC_Theme {
	public function getBaseUrl(): string {
		return 'https://nextcloud.localhost:8888';
	}

	public function getDocBaseUrl(): string {
		return 'https://docs.nextcloud.com';
	}

	public function getTitle(): string {
		return 'All-in-Wonder';
	}

	public function getName(): string {
		return 'All-in-Wonder';
	}

	public function getHTMLName(): string {
		return 'All-in-Wonder';
	}

	public function getEntity(): string {
		return 'All-in-Wonder';
	}

	public function getSlogan(): string {
		return 'Your all-in-one workspace';
	}

	public function getShortFooter(): string {
		$entity = $this->getEntity();
		$footer = '© ' . date('Y');
		if ($entity !== '') {
			$footer .= ' <a href="' . $this->getBaseUrl() . '" target="_blank">' . $entity . '</a><br/>';
		}
		$footer .= $this->getSlogan();
		return $footer;
	}

	public function getLongFooter(): string {
		return $this->getShortFooter();
	}

	public function buildDocLinkToKey($key): string {
		return $this->getDocBaseUrl() . '/server/latest/go.php?to=' . $key;
	}

// 	/** Mail header / primary brand color. */
// 	public function getColorPrimary(): string {
// 		return '#0082c9';
// 	}
//
// 	/** Login background color. */
// 	public function getColorBackground(): string {
// 		return '#30b6ff';
// 	}
//
// 	/** Overrides for core SCSS variables. */
// 	public function getScssVariables(): array {
// 		return [
// 			'color-primary' => '#0082c9',
// 		];
// 	}
}
