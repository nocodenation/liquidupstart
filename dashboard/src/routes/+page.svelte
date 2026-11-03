<script>
  import { invalidateAll } from '$app/navigation';
  import TaskRunner from '$lib/components/TaskRunner.svelte';
  import NextcloudAppPassword from '$lib/components/NextcloudAppPassword.svelte';
  import GitRepositories from '$lib/components/GitRepositories.svelte';
  import OpenClawPairing from '$lib/components/OpenClawPairing.svelte';
  import SecretValue from '$lib/components/SecretValue.svelte';

  const SECRET_LABEL = /password|token|key|secret/i;

  let { data } = $props();

  // Stop and Rebuild both bring the stack down, but running state is only
  // re-queried on success — hide the stale service tiles the moment either
  // starts rather than leaving dead URLs on screen.
  let activeTask = $state('');
  let tearingDown = $derived(activeTask === 'down' || activeTask === 'rebuild');
</script>

<main>
  <header class="intro dashhead">
    <h1>Liquid Upstart Dashboard</h1>
    <a href="/config" class="aux configlink">⚙ Configuration</a>
  </header>

  {#if data.running}
    {#if !tearingDown}
      {#each data.groups as group}
        <h2 class="grouptitle">{group.title}</h2>
        <div class="tiles">
          {#each group.tiles as tile}
            <div class="tile">
              <div class="tilename">
                {tile.name}
                {#if tile.note}<span class="sectdesc">{tile.note}</span>{/if}
              </div>
              {#if tile.subtitle}<div class="tilesubtitle">{tile.subtitle}</div>{/if}
              {#if tile.warning}<p class="warn">{tile.warning}</p>{/if}
              {#if tile.url}
                <a href={tile.url} target="_blank" rel="noopener noreferrer" class="tileurl">
                  {tile.url}
                </a>
              {/if}
              {#if tile.creds}
                <dl class="tilecreds">
                  {#each tile.creds as cred}
                    <dt>{cred.label}</dt>
                    <dd>
                      {#if SECRET_LABEL.test(cred.label)}
                        <SecretValue value={cred.value} label={cred.label} />
                      {:else}
                        <code>{cred.value}</code>
                      {/if}
                    </dd>
                  {/each}
                </dl>
              {/if}
              {#if tile.kind === 'nextcloud'}
                <NextcloudAppPassword
                  password={tile.appPassword}
                  securityUrl={tile.securityUrl}
                />
              {/if}
            </div>
          {/each}
        </div>
      {/each}

      <div class="docs extras">
        <p class="extras-heading">Additional endpoints</p>
        <ul>
          {#each data.extras as extra}
            <li>
              {extra.name}:
              {#if extra.url}
                <a href={extra.url} target="_blank" rel="noopener noreferrer">{extra.url}</a>
              {/if}
              {#if extra.note}<span class="dim">{extra.note}</span>{/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <section class="card">
      <TaskRunner
        running
        startLabel="Restart"
        showStop
        showRebuild
        bind:activeTask
        onchange={() => invalidateAll()}
      />
    </section>
  {:else}
    <section class="card">
      <h2>The stack is not running</h2>
      {#if data.needBuild}
        <p class="warn">
          The service images don't exist yet — run <strong>Build</strong> once before starting.
        </p>
      {:else}
        <p>Start all services to get the dashboard of URLs and credentials.</p>
      {/if}
      <TaskRunner
        needBuild={data.needBuild}
        showRebuild={!data.needBuild}
        onchange={() => invalidateAll()}
      />
    </section>
  {/if}

  <!-- Above the repositories, because it is only ever drawn when something is
       stuck, and what is stuck is the operator getting into OpenClaw at all. -->
  <!-- `running` and `activeTask` are handed over because the card must not poll
       while the stack is down or while a task holds the page: A3 of the
       2026-10-01 review. This element sits outside the `{#if data.running}`
       block above on purpose -- the card is also the way back when OpenClaw
       itself refuses a browser -- so the condition travels as a prop rather than
       as a position in the markup. -->
  <!-- Not mounted with OpenClaw switched off: every poll would run an image that is not
       there. CS-FR10. -->
  {#if data.components.openclaw}
    <OpenClawPairing running={data.running} busy={activeTask !== ''} />
  {/if}

  <!-- Draws itself only where the git integration is in use. A8-37, A8-39. -->
  <GitRepositories git={data.git} />

  <footer class="dashfoot">
    <form method="POST" action="/shutdown">
      <button type="submit" class="aux">Quit this app</button>
    </form>
  </footer>
</main>
