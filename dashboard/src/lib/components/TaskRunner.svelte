<script>
  /**
   * Build / Start / Stop controls with a live log pane and the Claude Code
   * sign-in panel. Used by the dashboard (/) and the post-save page (/done).
   */
  let {
    needBuild = false,
    running = false,
    showStart = true,
    showStop = false,
    showRebuild = false,
    numbered = false,
    // 'Restart' on the dashboard's running view — start.sh begins with down.sh.
    startLabel = 'Start',
    busy = $bindable(false),
    // Bindable mirror of the in-flight task ('' when idle), so the parent can
    // react while a task runs — e.g. hide service tiles during a teardown.
    activeTask = $bindable(''),
    authPending = $bindable(false),
    onchange
  } = $props();

  let log = $state('');
  let runningTask = $state('');
  let elapsed = $state(0);
  let buildOk = $state(false);
  let startOk = $state(false);
  let logEl = $state(null);
  // Task name when a run fails, so we show a banner instead of leaving the
  // reason buried in the streamed log.
  let failedTask = $state('');

  // Scripts emit `::aiw-error::<message>` lines to raise a UI banner; pull
  // those out and hide the raw markers from the log pane.
  const MARKER = '::aiw-error::';
  let errors = $derived(
    log
      .split('\n')
      .filter((l) => l.startsWith(MARKER))
      .map((l) => l.slice(MARKER.length).trim())
  );
  // Hide all `::aiw-*::` control markers from the visible log — they drive UI
  // state, not user-facing output.
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
  // flow: show a URL + code; the CLI polls and completes on authorize — no
  // code is pasted back.
  let needCopilotAuth = $state(false);
  let copilotLog = $state('');
  let copilotRunning = $state(false);
  let copilotOk = $state(false);
  let copilotLogEl = $state(null);
  let copilotUrl = $derived(copilotLog.match(/https:\/\/github\.com\/login\/device/)?.[0] ?? '');
  let copilotCode = $derived(copilotLog.match(/Code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/)?.[1] ?? '');

  let needCodexAuth = $state(false);
  let codexLog = $state('');
  let codexRunning = $state(false);
  let codexOk = $state(false);
  let codexCode = $state('');
  let codexCodeSent = $state(false);
  let codexUrl = $derived(codexLog.match(/::codex-url::(\S+)/)?.[1] ?? '');
  let codexFailed = $derived(/\[auth failed/.test(codexLog));

  let needGrokAuth = $state(false);
  let grokLog = $state('');
  let grokRunning = $state(false);
  let grokOk = $state(false);
  let grokCode = $state('');
  let grokCodeSent = $state(false);
  let grokUrl = $derived(grokLog.match(/::grok-url::(\S+)/)?.[1] ?? '');
  let grokFailed = $derived(/\[auth failed/.test(grokLog));

  // Mirror in-flight state out to the parent (bind:busy), e.g. to keep the
  // Finish button disabled while a task runs.
  $effect(() => {
    busy = runningTask !== '' || authRunning || copilotRunning || codexRunning || grokRunning;
    activeTask = runningTask;
    authPending =
      (needClaudeAuth && !authOk) ||
      (needCopilotAuth && !copilotOk) ||
      (needCodexAuth && !codexOk) ||
      (needGrokAuth && !grokOk) ||
      authRunning ||
      copilotRunning ||
      codexRunning ||
      grokRunning;
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

  // Proactively offer sign-in only once the stack is running. Before that —
  // fresh dashboard open, build done but not started yet — sign-in surfaces
  // through the Start run's ACTION REQUIRED banner, not on page load.
  async function probeClaudeAuth() {
    if (authOk || !running) return;
    try {
      const res = await fetch('/claude-auth');
      if (res.ok) {
        const { needed } = await res.json();
        if (needed) needClaudeAuth = true;
      }
    } catch {
      // best-effort; in-log banner detection still applies
    }
  }

  $effect(() => {
    probeClaudeAuth();
  });

  // Same idea as probeClaudeAuth, for the native Copilot provider.
  async function probeCopilotAuth() {
    if (copilotOk || !running) return;
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

  async function probeCodexAuth() {
    if (codexOk || !running) return;
    try {
      const res = await fetch('/codex-auth');
      if (res.ok) {
        const { needed } = await res.json();
        if (needed) needCodexAuth = true;
      }
    } catch {
      // best-effort
    }
  }

  $effect(() => {
    probeCodexAuth();
  });

  async function probeGrokAuth() {
    if (grokOk || !running) return;
    try {
      const res = await fetch('/grok-auth');
      if (res.ok) {
        const { needed } = await res.json();
        if (needed) needGrokAuth = true;
      }
    } catch {
      // best-effort
    }
  }

  $effect(() => {
    probeGrokAuth();
  });

  // Device-flow sign-in: stream the login (URL + code); the CLI polls and
  // exits 0 once the user authorizes in the browser.
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
        // Detected mid-stream so the sign-in panel appears right away while the
        // rest of the start keeps running. start.sh prints this when claude-cli
        // is on but unauthenticated with no terminal attached (our case).
        if (!authOk && log.includes('ACTION REQUIRED')) needClaudeAuth = true;
        // openclaw.sh emits this marker and then BLOCKS the start until Copilot
        // sign-in completes, so the gateway boots authenticated.
        if (!copilotOk && log.includes('::aiw-copilot-auth-required::')) needCopilotAuth = true;
        if (!codexOk && log.includes('::aiw-codex-auth-required::')) needCodexAuth = true;
        if (!grokOk && log.includes('::aiw-grok-auth-required::')) needGrokAuth = true;
      }
      if (log.includes(`[${task} succeeded]`)) {
        if (task === 'build') buildOk = true;
        if (task === 'start') startOk = true;
        if (task === 'down') startOk = false;
        // Rebuild leaves images fresh but the stack stopped.
        if (task === 'rebuild') {
          buildOk = true;
          startOk = false;
        }
        onchange?.(task);
      } else if (log.includes(`[${task} failed`)) {
        failedTask = task;
      }
      // Re-probe once done: a build may have produced the OpenClaw image, a
      // start may have rendered openclaw.json.
      probeClaudeAuth();
      probeCopilotAuth();
      probeCodexAuth();
      probeGrokAuth();
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

  let authUrl = $derived(authLog.match(/https:\/\/\S+/)?.[0] ?? '');

  async function startCodexAuth() {
    if (codexRunning) return;
    codexRunning = true;
    codexLog = '';
    codexCode = '';
    codexCodeSent = false;
    try {
      const res = await fetch('/codex-auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });
      if (!res.ok || !res.body) {
        codexLog = `Could not start sign-in: ${res.status} ${await res.text()}\n`;
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        codexLog += decoder.decode(value, { stream: true });
      }
      if (codexLog.includes('[auth succeeded]')) {
        codexOk = true;
        needCodexAuth = false;
      }
    } catch (e) {
      codexLog += `\n[connection lost: ${e.message}]\n`;
    } finally {
      codexRunning = false;
    }
  }

  async function sendCodexCode() {
    if (!codexCode.trim()) return;
    const res = await fetch('/codex-auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'code', code: codexCode })
    });
    if (res.status === 204) {
      codexCodeSent = true;
      codexCode = '';
    } else {
      codexLog += `\n[could not submit URL: ${res.status} ${await res.text()}]\n`;
    }
  }

  async function startGrokAuth() {
    if (grokRunning) return;
    grokRunning = true;
    grokLog = '';
    grokCode = '';
    grokCodeSent = false;
    try {
      const res = await fetch('/grok-auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });
      if (!res.ok || !res.body) {
        grokLog = `Could not start sign-in: ${res.status} ${await res.text()}\n`;
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        grokLog += decoder.decode(value, { stream: true });
      }
      if (grokLog.includes('[auth succeeded]')) {
        grokOk = true;
        needGrokAuth = false;
      }
    } catch (e) {
      grokLog += `\n[connection lost: ${e.message}]\n`;
    } finally {
      grokRunning = false;
    }
  }

  async function sendGrokCode() {
    if (!grokCode.trim()) return;
    const res = await fetch('/grok-auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'code', code: grokCode })
    });
    if (res.status === 204) {
      grokCodeSent = true;
      grokCode = '';
    } else {
      grokLog += `\n[could not submit URL: ${res.status} ${await res.text()}]\n`;
    }
  }
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
  <!-- Heartbeat: long steps (image pulls, healthchecks) can go minutes without
       printing, and a frozen pane looks like a hang. -->
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

{#if needCodexAuth || codexRunning || codexOk}
  <section class="authbox">
    <h2>Sign in with ChatGPT</h2>
    {#if codexOk}
      <p class="okmsg">
        Your ChatGPT/Codex subscription is authenticated — the login persists in
        <code>volumes/_openclaw</code>, and the startup continues now that you're signed in.
      </p>
    {:else}
      <p>
        OpenClaw is set to use the Codex harness (<code>OPENCLAW_ENABLE_CODEX=1</code>) with a paid
        ChatGPT/Codex subscription — no OpenAI API key needed. Click below, then open the sign-in
        link and authorize. Sign-in completes here automatically once you approve.
      </p>
      <div class="runbar">
        <button type="button" class="save" disabled={codexRunning} onclick={startCodexAuth}>
          {codexRunning ? 'Waiting for sign-in…' : 'Sign in with ChatGPT'}
        </button>
        {#if codexUrl && codexRunning}
          <a href={codexUrl} target="_blank" rel="noopener noreferrer" class="back">
            Open sign-in link ↗
          </a>
        {/if}
      </div>
      {#if codexRunning && !codexUrl}
        <p class="dim">Preparing the sign-in link…</p>
      {/if}
      {#if codexRunning && codexUrl}
        <p class="dim">
          Waiting for you to authorize in the browser… If the browser shows
          “unable to connect to localhost:1455” after you approve, copy that page’s full URL and
          paste it below.
        </p>
        <div class="runbar">
          <input
            type="text"
            placeholder="Fallback: paste the localhost:1455 redirect URL here"
            bind:value={codexCode}
            onkeydown={(e) => e.key === 'Enter' && sendCodexCode()}
            autocomplete="off"
            spellcheck="false"
          />
          <button type="button" class="save" disabled={!codexCode.trim()} onclick={sendCodexCode}>
            Submit URL
          </button>
          {#if codexCodeSent}
            <span class="dim">URL sent — waiting for OpenAI to confirm…</span>
          {/if}
        </div>
      {/if}
      {#if codexFailed}
        <p class="dim">Sign-in didn’t complete. Click “Sign in with ChatGPT” to try again.</p>
      {/if}
    {/if}
  </section>
{/if}

{#if needGrokAuth || grokRunning || grokOk}
  <section class="authbox">
    <h2>Sign in with Grok</h2>
    {#if grokOk}
      <p class="okmsg">
        Your SuperGrok/X Premium subscription is authenticated — the login persists in
        <code>volumes/_openclaw</code>, and the startup continues now that you're signed in.
      </p>
    {:else}
      <p>
        OpenClaw is set to use Grok (<code>OPENCLAW_ENABLE_GROK=1</code>) with a paid SuperGrok or X
        Premium subscription — no xAI API key needed. Click below, then open the sign-in link and
        authorize. Sign-in completes here automatically once you approve.
      </p>
      <div class="runbar">
        <button type="button" class="save" disabled={grokRunning} onclick={startGrokAuth}>
          {grokRunning ? 'Waiting for sign-in…' : 'Sign in with Grok'}
        </button>
        {#if grokUrl && grokRunning}
          <a href={grokUrl} target="_blank" rel="noopener noreferrer" class="back">
            Open sign-in link ↗
          </a>
        {/if}
      </div>
      {#if grokRunning && !grokUrl}
        <p class="dim">Preparing the sign-in link…</p>
      {/if}
      {#if grokRunning && grokUrl}
        <p class="dim">
          Waiting for you to authorize in the browser… If the browser shows
          “unable to connect to 127.0.0.1:56121” after you approve, copy that page’s full URL and
          paste it below.
        </p>
        <div class="runbar">
          <input
            type="text"
            placeholder="Fallback: paste the 127.0.0.1:56121 redirect URL here"
            bind:value={grokCode}
            onkeydown={(e) => e.key === 'Enter' && sendGrokCode()}
            autocomplete="off"
            spellcheck="false"
          />
          <button type="button" class="save" disabled={!grokCode.trim()} onclick={sendGrokCode}>
            Submit URL
          </button>
          {#if grokCodeSent}
            <span class="dim">URL sent — waiting for xAI to confirm…</span>
          {/if}
        </div>
      {/if}
      {#if grokFailed}
        <p class="dim">Sign-in didn’t complete. Click “Sign in with Grok” to try again.</p>
      {/if}
    {/if}
  </section>
{/if}
