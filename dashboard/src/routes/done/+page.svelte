<script>
  import { goto, invalidateAll } from '$app/navigation';
  import TaskRunner from '$lib/components/TaskRunner.svelte';

  let { data } = $props();
  let started = $state(false);
  let busy = $state(false);
  let authPending = $state(false);
</script>

<main>
  <section class="card">
    <h1>Configuration saved ✓</h1>
    <p>Your values were written to <code>.env</code>. Apply them right from here:</p>

    {#if data.rebuild}
      <p class="warn">
        You changed image build settings, so the Docker images must be <strong>rebuilt</strong>
        before starting.
      </p>
    {:else if data.needBuild}
      <p class="warn">
        Looks like a first install — the service images don't exist yet, so run
        <strong>Build</strong> once before starting.
      </p>
    {/if}

    <TaskRunner
      needBuild={data.needBuild}
      numbered={data.needBuild}
      showRebuild={!data.needBuild}
      bind:busy
      bind:authPending
      onchange={(task) => {
        if (task === 'start') {
          started = true;
          if (!authPending) {
            goto('/');
            return;
          }
        }
        invalidateAll();
      }}
    />

    {#if started}
      <p class="okmsg">
        All services are up — see the dashboard for every URL and credential, or check the end of
        the log above.
      </p>
    {/if}

    <details class="docs">
      <summary>Prefer the terminal instead?</summary>
      <pre>{data.needBuild ? './scripts/linux/build.sh   (Windows: scripts\\windows\\build.bat)\n' : ''}./scripts/linux/start.sh   (Windows: scripts\windows\start.bat)</pre>
    </details>

    <div class="actions">
      <a href="/config" class="back">← Back to the configuration</a>
      <!-- Disabled mid-run: navigating away would lose the live log (the task
           itself keeps running). -->
      <a
        href={busy ? null : '/'}
        class="save finishlink"
        class:disabled={busy}
        aria-disabled={busy}
        title={busy ? 'Wait for the running task to finish' : null}
      >
        Finish
      </a>
    </div>
  </section>
</main>
