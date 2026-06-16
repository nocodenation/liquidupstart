<script>
  import { invalidateAll } from '$app/navigation';
  import TaskRunner from '$lib/components/TaskRunner.svelte';

  let { data } = $props();

  // Both Stop and Rebuild bring the stack down before they finish (the page
  // only re-queries running state on success). Hide the now-stale service tiles
  // as soon as either starts, instead of leaving dead URLs on screen.
  let activeTask = $state('');
  let tearingDown = $derived(activeTask === 'down' || activeTask === 'rebuild');
</script>

<main>
  <header class="intro dashhead">
    <h1>All-In-Wonder Dashboard</h1>
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

      <details class="docs extras">
        <summary>Additional endpoints</summary>
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
      </details>
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
