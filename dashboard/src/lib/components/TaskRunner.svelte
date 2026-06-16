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
    // Rebuild = stop the stack + rebuild all images (to pick up a pulled update).
    showRebuild = false,
    numbered = false,
    // 'Restart' on the dashboard's running view — start.sh begins with
    // down.sh, so the start task is a restart when the stack is up.
    startLabel = 'Start',
    busy = $bindable(false),
    // Bindable mirror of the in-flight task ('' when idle). Lets the parent
    // react while a task runs — e.g. hide service tiles during a teardown.
    activeTask = $bindable(''),
    onchange
  } = $props();

  let log = $state('');
  let runningTask = $state('');
  let elapsed = $state(0);
  let buildOk = $state(false);
  let startOk = $state(false);
  let logEl = $state(null);
  // Set to the task name when a run fails, so we show a prominent error banner
  // rather than leaving the reason buried in the streamed log.
  let failedTask = $state('');

  // Scripts emit `::aiw-error::<message>` lines to raise a UI banner. Pull those
  // out for the banner and hide the raw marker lines from the log pane.
  const MARKER = '::aiw-error::';
  let errors = $derived(
    log
      .split('\n')
      .filter((l) => l.startsWith(MARKER))
      .map((l) => l.slice(MARKER.length).trim())
  );
  // Hide all `::aiw-*::` control markers (error banners, copilot-auth signal)
  // from the visible log — they drive UI state, not user-facing output.
  let displayLog = $derived(
    log
      .split('\n')
      .filter((l) => !l.startsWith('::aiw-'))
      .join('\n')
  );

  const TASK_LABELS = { build: 'Build', start: 'Start', down: 'Stop', rebuild: 'Rebuild' };

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

  // GitHub Copilot sign-in (OpenClaw native github-copilot provider). Device
  // flow: show a URL + code, the CLI polls and completes when the user
  // authorizes — no code is pasted back.
  let needCopilotAuth = $state(false);
  let copilotLog = $state('');
  let copilotRunning = $state(false);
  let copilotOk = $state(false);
  let copilotLogEl = $state(null);
  let copilotUrl = $derived(copilotLog.match(/https:\/\/github\.com\/login\/device/)?.[0] ?? '');
  let copilotCode = $derived(copilotLog.match(/Code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/)?.[1] ?? '');

  // Mirror the in-flight state out to the parent (bind:busy), e.g. to keep
  // navigation like the Finish button disabled while a task runs.
  $effect(() => {
    busy = runningTask !== '' || authRunning || copilotRunning;
    activeTask = runningTask;
  });

  $effect(() => {
    log;
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
  });
  $effect(() => {
    authLog;
    if (authLogEl) authLogEl.scrollTop = authLogEl.scrollHeight;
  });
  $effect(() => {
    copilotLog;
    if (copilotLogEl) copilotLogEl.scrollTop = copilotLogEl.scrollHeight;
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

  // Same idea as probeClaudeAuth, for the native Copilot provider: copilot on,
  // no headless token, OpenClaw set up, gateway up, no github-copilot profile.
  async function probeCopilotAuth() {
    if (copilotOk || (needBuild && !buildOk)) return;
    try {
      const res = await fetch('/copilot-auth');
      if (res.ok) {
        const { needed } = await res.json();
        if (needed) needCopilotAuth = true;
      }
    } catch {
      // best-effort
    }
  }

  $effect(() => {
    probeCopilotAuth();
  });

  // Device-flow sign-in: stream the login, show the URL + code; the CLI polls
  // and exits 0 once the user authorizes in the browser.
  async function startCopilotAuth() {
    if (copilotRunning) return;
    copilotRunning = true;
    copilotLog = '';
    try {
      const res = await fetch('/copilot-auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });
      if (!res.ok || !res.body) {
        copilotLog = `Could not start sign-in: ${res.status} ${await res.text()}\n`;
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        copilotLog += decoder.decode(value, { stream: true });
      }
      if (copilotLog.includes('[auth succeeded]')) {
        copilotOk = true;
        needCopilotAuth = false;
      }
    } catch (e) {
      copilotLog += `\n[connection lost: ${e.message}]\n`;
    } finally {
      copilotRunning = false;
    }
  }

  async function runTask(task) {
    if (runningTask) return;
    runningTask = task;
    log = '';
    failedTask = '';
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
        // openclaw.sh emits this marker and then BLOCKS the start until the
        // Copilot sign-in completes, so the gateway boots authenticated.
        if (!copilotOk && log.includes('::aiw-copilot-auth-required::')) needCopilotAuth = true;
      }
      if (log.includes(`[${task} succeeded]`)) {
        if (task === 'build') buildOk = true;
        if (task === 'start') startOk = true;
        if (task === 'down') startOk = false;
        // Rebuild leaves images fresh but the stack stopped — like build, then down.
        if (task === 'rebuild') {
          buildOk = true;
          startOk = false;
        }
        onchange?.(task);
      } else if (log.includes(`[${task} failed`)) {
        failedTask = task;
      }
      // Re-probe once the task is done: a build may have just produced the
      // OpenClaw image, a start may have just rendered openclaw.json.
      probeClaudeAuth();
      probeCopilotAuth();
    } catch (e) {
      log += `\n[connection lost: ${e.message}]\n`;
      failedTask = task;
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
  {#if showRebuild}
    <button
      type="button"
      class="save rebuild"
      disabled={runningTask !== ''}
      onclick={() => runTask('rebuild')}
      title="Stop the stack and rebuild all images — use after pulling a new version"
    >
      {runningTask === 'rebuild' ? 'Rebuilding…' : 'Rebuild'}
    </button>
  {/if}
</div>

{#if failedTask && runningTask === ''}
  <div class="errbox" role="alert">
    <strong>{TASK_LABELS[failedTask] ?? failedTask} failed</strong>
    {#if errors.length}
      <ul>
        {#each errors as e}
          <li>{e}</li>
        {/each}
      </ul>
    {:else}
      <p>Something went wrong — see the log below for details.</p>
    {/if}
  </div>
{/if}

{#if displayLog}
  <pre class="runlog" bind:this={logEl}>{displayLog}</pre>
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

{#if needCopilotAuth || copilotRunning || copilotOk}
  <section class="authbox">
    <h2>GitHub Copilot sign-in</h2>
    {#if copilotOk}
      <p class="okmsg">
        GitHub Copilot is authenticated — the login persists in
        <code>volumes/_openclaw</code>, and the startup continues now that you're signed in.
      </p>
    {:else}
      <p>
        OpenClaw is set to use GitHub Copilot (<code>OPENCLAW_ENABLE_COPILOT=1</code>), which needs
        a one-time device sign-in. Click below, open the link, and enter the code shown — the page
        finishes on its own once you authorize. Requires an active GitHub Copilot plan.
      </p>
      <div class="runbar">
        <button type="button" class="save" disabled={copilotRunning} onclick={startCopilotAuth}>
          {copilotRunning ? 'Waiting for authorization…' : 'Sign in to GitHub Copilot'}
        </button>
        {#if copilotUrl && copilotRunning}
          <a href={copilotUrl} target="_blank" rel="noopener noreferrer" class="back">
            Open {copilotUrl} ↗
          </a>
        {/if}
      </div>
      {#if copilotCode && copilotRunning}
        <p>
          Enter this code at the link: <code class="devicecode">{copilotCode}</code>
        </p>
      {/if}
      {#if copilotLog}
        <pre class="runlog" bind:this={copilotLogEl}>{copilotLog}</pre>
      {/if}
    {/if}
  </section>
{/if}
