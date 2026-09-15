<script>
  import { invalidateAll } from '$app/navigation';

  let { git } = $props();

  let testing = $state('');
  let result = $state(null);
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
      copied = repo.name;
      timer = setTimeout(() => (copied = ''), 1500);
    } catch {
      copyFailed = repo.name;
      timer = setTimeout(() => (copyFailed = ''), 2500);
    }
  }

  async function test(repo) {
    if (testing) return;
    testing = repo.name;
    result = null;
    try {
      const res = await fetch('/git-auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: repo.name })
      });
      const body = await res.json().catch(() => ({}));
      result = {
        name: repo.name,
        ok: body.ok === true,
        message: body.message ?? `The test could not be run (${res.status}).`
      };
      await invalidateAll();
    } catch (e) {
      result = { name: repo.name, ok: false, message: `The test could not be run: ${e.message}` };
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

          {#if repo.publicKey}
            <div class="gitkey">
              <code class="gitkey-value">{repo.publicKey}</code>
              <button
                type="button"
                class="aux gitkey-copy"
                onclick={() => copy(repo)}
                aria-label={`Copy the deploy key for ${repo.label}`}
              >
                {copied === repo.name ? 'Copied' : copyFailed === repo.name ? 'Copy failed' : 'Copy'}
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
              {testing === repo.name ? 'Testing…' : 'Test this repository'}
            </button>
          {/if}

          {#if result && result.name === repo.name}
            <p class="gitresult" class:warn={!result.ok}>{result.message}</p>
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
