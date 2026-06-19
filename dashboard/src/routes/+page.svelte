<script>
  import { invalidateAll } from '$app/navigation';
  import TaskRunner from '$lib/components/TaskRunner.svelte';

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
              <a href={tile.url} target="_blank" rel="noopener noreferrer" class="tileurl">
                {tile.url}
              </a>
              {#if tile.creds}
                <dl class="tilecreds">
                  {#each tile.creds as cred}
                    <dt>{cred.label}</dt>
                    <dd><code>{cred.value}</code></dd>
                  {/each}
                </dl>
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

  <footer class="dashfoot">
    <form method="POST" action="/shutdown">
      <button type="submit" class="aux">Quit this app</button>
    </form>
  </footer>
</main>
