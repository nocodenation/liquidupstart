<script>
  import { invalidateAll } from '$app/navigation';

  let { git } = $props();

  // Keyed by slug throughout, not by name: two declared repositories can share a
  // repository name -- acme/skills and other/skills are both "skills" -- and then
  // "Testing…", "Copied" and the result line appear on both cards at once, or on
  // the wrong one. The server side was moved to slugs when the collision was
  // found; this is the half that was left behind. Finding 5 of the 2026-09-18
  // follow-up.
  let testing = $state('');
  // One result per repository, not one for the card. A single slot meant testing
  // the second repository wiped the first one's answer off the screen -- reported
  // by the operator on 2026-09-18, testing two in a row. Keyed by slug, like
  // everything else here, because two declared repositories can share a name.
  let results = $state({});
  let copied = $state('');
  let copyFailed = $state('');
  let timer;

  async function copy(repo) {
    clearTimeout(timer);
    copyFailed = '';
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(repo.publicKey);
      } else {
        const ta = document.createElement('textarea');
        ta.value = repo.publicKey;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (!ok) throw new Error('copy rejected');
      }
      copied = repo.slug;
      timer = setTimeout(() => (copied = ''), 1500);
    } catch {
      copyFailed = repo.slug;
      timer = setTimeout(() => (copyFailed = ''), 2500);
    }
  }

  async function test(repo) {
    if (testing) return;
    testing = repo.slug;
    results = { ...results, [repo.slug]: null };
    try {
      const res = await fetch('/git-auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // The slug, not the name: two declared repositories can share a name,
        // and then a name reaches only the first of them.
        body: JSON.stringify({ name: repo.slug })
      });
      const body = await res.json().catch(() => ({}));
      results = {
        ...results,
        [repo.slug]: {
          ok: body.ok === true,
          message: body.message ?? `The test could not be run (${res.status}).`
        }
      };
      await invalidateAll();
    } catch (e) {
      results = {
        ...results,
        [repo.slug]: { ok: false, message: `The test could not be run: ${e.message}` }
      };
    } finally {
      testing = '';
    }
  }

  function access(repo) {
    return repo.access === 'write' ? 'write' : 'read-only';
  }
</script>

<section class="card gitcard">
  <h2>Agent repositories</h2>
  <p class="gitmessage" class:warn={git.state !== 'ready'}>{git.message}</p>

  {#if git.declarationError && git.state !== 'none'}
    <p class="warn">{git.declarationError}</p>
  {/if}

  {#if git.repositories.length > 0}
    <ul class="gitlist">
      {#each git.repositories as repo}
        <li class="gitrepo" class:unreachable={repo.unreachable}>
          <div class="gitrepo-head">
            <span class="gitrepo-label">{repo.label}</span>
            <span class="gitrepo-state">{repo.unreachable ? 'unreachable' : 'cloned'}</span>
            <span class="sectdesc">{access(repo)} · {repo.policy}</span>
          </div>

          {#if repo.error}
            <p class="warn gitrepo-error">{repo.error}</p>
          {/if}

          <p class="gitrepo-instructions">{repo.instructions}</p>
          <p class="gitrepo-instructions">
            <a href={repo.deployKeyUrl} target="_blank" rel="noopener noreferrer">
              {repo.deployKeyUrl}
            </a>
          </p>

          {#if repo.publicKey}
            <div class="gitkey">
              <code class="gitkey-value">{repo.publicKey}</code>
              <button
                type="button"
                class="aux gitkey-copy"
                onclick={() => copy(repo)}
                aria-label={`Copy the deploy key for ${repo.label}`}
              >
                {copied === repo.slug ? 'Copied' : copyFailed === repo.slug ? 'Copy failed' : 'Copy'}
              </button>
            </div>
            {#if repo.fingerprint}
              <p class="dim gitkey-fingerprint">{repo.fingerprint}</p>
            {/if}
          {:else}
            <p class="warn">
              No deploy key on disk for this repository yet — start the stack once to generate it.
            </p>
          {/if}

          {#if repo.canRetry}
            <button
              type="button"
              class="save gitrepo-test"
              disabled={testing !== ''}
              onclick={() => test(repo)}
            >
              {testing === repo.slug ? 'Testing…' : 'Test this repository'}
            </button>
          {/if}

          {#if results[repo.slug]}
            <p class="gitresult" class:warn={!results[repo.slug].ok}>{results[repo.slug].message}</p>
          {/if}
        </li>
      {/each}
    </ul>
    {#if git.pending.length > 0}
      <p class="gitmessage warn">
        Declared but not yet prepared — the last start did not see
        {git.pending.length === 1 ? 'it' : 'them'}:
      </p>
      <ul class="gitlist">
        {#each git.pending as repo}
          <li class="gitrepo">
            <div class="gitrepo-head">
              <span class="gitrepo-label">{repo.label}</span>
              <span class="sectdesc">{access(repo)} · {repo.policy}</span>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if git.declared.length > 0}
    <ul class="gitlist">
      {#each git.declared as repo}
        <li class="gitrepo">
          <div class="gitrepo-head">
            <span class="gitrepo-label">{repo.label}</span>
            <span class="sectdesc">{access(repo)} · {repo.policy}</span>
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="dim">
      Declare them in section 10 of the
      <a href="/config">configuration</a>, then start the stack.
    </p>
  {/if}
</section>
