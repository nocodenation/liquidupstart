<script>
  /**
   * Build / Start / Stop controls with a live log pane and the Claude Code
   * sign-in panel. Used by the dashboard (/) and the post-save page (/done).
   *
   * Props:
   *   needBuild — Build is required before Start (missing images or
   *               build-affecting .env change)
   *   showStop  — offer a Stop button (dashboard, when the stack runs)
   *   numbered  — prefix Build/Start labels with "1."/"2." (done page)
   *   busy      — bindable; true while a task or sign-in is in flight
   *   onchange  — called after a task finishes successfully, so the parent
   *               can refresh its state (e.g. re-query running containers)
   */
  let {
    needBuild = false,
    showStart = true,
    showStop = false,
    numbered = false,
    // 'Restart' on the dashboard's running view — start.sh begins with
    // down.sh, so the start task is a restart when the stack is up.
    startLabel = 'Start',
    busy = $bindable(false),
    onchange
  } = $props();

  let log = $state('');
  let runningTask = $state('');
  let elapsed = $state(0);
  let buildOk = $state(false);
  let startOk = $state(false);
  let logEl = $state(null);

  const TASK_LABELS = { build: 'Build', start: 'Start', down: 'Stop' };

  function formatElapsed(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
    return `${h > 0 ? h + ':' : ''}${mm}:${String(sec).padStart(2, '0')}`;
  }

  // Claude Code sign-in (OpenClaw claude-cli backend)
  let needClaudeAuth = $state(false);
  let authLog = $state('');
  let authRunning = $state(false);
  let authOk = $state(false);
  let authCode = $state('');
  let codeSent = $state(false);
  let authLogEl = $state(null);

  // Mirror the in-flight state out to the parent (bind:busy), e.g. to keep
  // navigation like the Finish button disabled while a task runs.
  $effect(() => {
    busy = runningTask !== '' || authRunning;
  });

  $effect(() => {
    log;
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
  });
  $effect(() => {
    authLog;
    if (authLogEl) authLogEl.scrollTop = authLogEl.scrollHeight;
  });

  // Proactive check, like the terminal start.sh: claude-cli backend on, no
  // token, OpenClaw configured, `auth status` failing → offer the sign-in
  // without waiting for a Start run to print the ACTION REQUIRED banner.
  // Skipped while a required Build is still pending: sign-in belongs after
  // the stack is set up, and the mid-stream banner detection during Start
  // surfaces it at exactly the right moment on a first install.
  async function probeClaudeAuth() {
    if (authOk || (needBuild && !buildOk)) return;
    try {
      const res = await fetch('/claude-auth');
      if (res.ok) {
        const { needed } = await res.json();
        if (needed) needClaudeAuth = true;
      }
    } catch {
      // probe is best-effort; the in-log banner detection still applies
    }
  }

  $effect(() => {
    probeClaudeAuth();
  });

  async function runTask(task) {
    if (runningTask) return;
    runningTask = task;
    log = '';
    elapsed = 0;
    const t0 = Date.now();
    const ticker = setInterval(() => (elapsed = Math.floor((Date.now() - t0) / 1000)), 1000);
    try {
      const res = await fetch('/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task })
      });
      if (!res.ok || !res.body) {
        log = `Could not start ${task}: ${res.status} ${await res.text()}\n`;
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        log += decoder.decode(value, { stream: true });
        // start.sh prints this banner when the claude-cli backend is on but
        // not yet authenticated and no terminal was attached (our case).
        // Detected mid-stream so the sign-in panel appears right away, while
        // the rest of the start keeps running.
        if (!authOk && log.includes('ACTION REQUIRED')) needClaudeAuth = true;
      }
      if (log.includes(`[${task} succeeded]`)) {
        if (task === 'build') buildOk = true;
        if (task === 'start') startOk = true;
        if (task === 'down') startOk = false;
        onchange?.(task);
      }
      // Re-probe once the task is done: a build may have just produced the
      // OpenClaw image, a start may have just rendered openclaw.json.
      probeClaudeAuth();
    } catch (e) {
      log += `\n[connection lost: ${e.message}]\n`;
    } finally {
      clearInterval(ticker);
      runningTask = '';
    }
  }

  async function startClaudeAuth() {
    if (authRunning) return;
    authRunning = true;
    authLog = '';
    authCode = '';
    codeSent = false;
    try {
      const res = await fetch('/claude-auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });
      if (!res.ok || !res.body) {
        authLog = `Could not start sign-in: ${res.status} ${await res.text()}\n`;
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        authLog += decoder.decode(value, { stream: true });
      }
      if (authLog.includes('[auth succeeded]')) {
        authOk = true;
        needClaudeAuth = false;
      }
    } catch (e) {
      authLog += `\n[connection lost: ${e.message}]\n`;
    } finally {
      authRunning = false;
    }
  }

  async function sendAuthCode() {
    if (!authCode.trim()) return;
    const res = await fetch('/claude-auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'code', code: authCode })
    });
    if (res.status === 204) {
      codeSent = true;
      authCode = '';
    } else {
      authLog += `\n[could not submit code: ${res.status} ${await res.text()}]\n`;
    }
  }

  // The sign-in URL claude prints, surfaced as a clickable link.
  let authUrl = $derived(authLog.match(/https:\/\/\S+/)?.[0] ?? '');
</script>

<div class="runbar">
  {#if needBuild}
    <button
      type="button"
      class="save"
      disabled={runningTask !== ''}
      onclick={() => runTask('build')}
    >
      {#if runningTask === 'build'}Building…{:else if buildOk}Build again{:else}{numbered ? '1. ' : ''}Build{/if}
    </button>
  {/if}
  {#if showStart}
    <button
      type="button"
      class="save"
      disabled={runningTask !== '' || (needBuild && !buildOk)}
      onclick={() => runTask('start')}
    >
      {#if runningTask === 'start'}
        {startLabel === 'Restart' ? 'Restarting…' : 'Starting…'}
      {:else if startOk || startLabel === 'Restart'}
        Restart
      {:else}
        {needBuild && numbered ? '2. ' : ''}Start
      {/if}
    </button>
  {/if}
  {#if showStop}
    <button
      type="button"
      class="save stop"
      disabled={runningTask !== ''}
      onclick={() => runTask('down')}
    >
      {runningTask === 'down' ? 'Stopping…' : 'Stop'}
    </button>
  {/if}
</div>

{#if log}
  <pre class="runlog" bind:this={logEl}>{log}</pre>
{/if}

{#if runningTask}
  <!-- Heartbeat under the log: long steps (image pulls, healthchecks) can go
       minutes without printing a line, and a frozen pane looks like a hang. -->
  <div class="liveline">
    <span class="livespinner"></span>
    {TASK_LABELS[runningTask] ?? runningTask} in progress… {formatElapsed(elapsed)}
    <span class="dim">— this can take a while, the log updates live</span>
  </div>
{/if}

{#if needClaudeAuth || authRunning || authOk}
  <section class="authbox">
    <h2>Claude Code sign-in</h2>
    {#if authOk}
      <p class="okmsg">
        Claude Code is authenticated — the login persists in
        <code>volumes/_openclaw-claude</code>, and OpenClaw picks it up automatically.
      </p>
    {:else}
      <p>
        OpenClaw is set to use the Claude Code CLI (<code>OPENCLAW_ENABLE_CLAUDE_CLI=1</code>),
        which needs a one-time sign-in. Click below, open the sign-in link, authorize, then paste
        the code back here.
      </p>
      <div class="runbar">
        <button type="button" class="save" disabled={authRunning} onclick={startClaudeAuth}>
          {authRunning ? 'Waiting for sign-in…' : 'Sign in to Claude'}
        </button>
        {#if authUrl && authRunning}
          <a href={authUrl} target="_blank" rel="noopener noreferrer" class="back">
            Open sign-in link ↗
          </a>
        {/if}
      </div>
      {#if authLog}
        <pre class="runlog" bind:this={authLogEl}>{authLog}</pre>
      {/if}
      {#if authRunning}
        <div class="runbar">
          <input
            type="text"
            placeholder="Paste the authorization code here"
            bind:value={authCode}
            onkeydown={(e) => e.key === 'Enter' && sendAuthCode()}
            autocomplete="off"
            spellcheck="false"
          />
          <button type="button" class="save" disabled={!authCode.trim()} onclick={sendAuthCode}>
            Submit code
          </button>
          {#if codeSent}
            <span class="dim">code sent — waiting for claude to confirm…</span>
          {/if}
        </div>
      {/if}
    {/if}
  </section>
{/if}
