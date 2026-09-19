<script>
  // A browser the Control UI has refused, and the one control that lets it back
  // in. R2 of §9 in docs/FEATURE-openclaw-2026-9-1.md.
  //
  // The card is silent while nothing is waiting: it is only ever right to show
  // it when something is. A card that says "no pending requests" on every load
  // teaches the operator to stop reading this part of the page.
  let pending = $state([]);
  let loaded = $state(false);
  let working = $state(false);
  let result = $state(null);
  let timer;

  async function load() {
    try {
      const res = await fetch('/openclaw-pairing');
      const body = await res.json();
      pending = Array.isArray(body?.pending) ? body.pending : [];
    } catch {
      pending = [];
    } finally {
      loaded = true;
    }
  }

  async function approve() {
    if (working) return;
    working = true;
    clearTimeout(timer);
    try {
      // "latest", never an id read out of this page: a refused browser mints a
      // new request id on every retry, so what was rendered is stale. The server
      // reads the current one at the moment this is pressed.
      const res = await fetch('/openclaw-pairing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: 'latest' })
      });
      const body = await res.json().catch(() => ({}));
      result = {
        ok: body.ok === true,
        message: body.message ?? `The approval could not be run (${res.status}).`
      };
      await load();
    } catch (e) {
      result = { ok: false, message: `The approval could not be run: ${e.message}` };
    } finally {
      working = false;
      // Held rather than flashed: a confirmation that leaves with the thing it
      // confirms was never read — the operator's finding of 2026-09-18, in the
      // deploy-key panel.
      timer = setTimeout(() => (result = null), 8000);
    }
  }

  $effect(() => {
    load();
  });
</script>

{#if loaded && pending.length > 0}
  <section class="card">
    <h2>A browser is waiting to be let in</h2>
    <p class="gitmessage warn">
      {pending.length === 1 ? 'One browser has' : `${pending.length} browsers have`} asked for access
      to OpenClaw and {pending.length === 1 ? 'is' : 'are'} waiting for you. Until you approve,
      {pending.length === 1 ? 'it shows' : 'they show'} “Role upgrade pending” and cannot connect.
    </p>

    <ul class="gitlist">
      {#each pending as req}
        <li class="gitrepo">
          <div class="gitrepo-head">
            <span class="gitrepo-label">{req.clientId}</span>
            <span class="gitrepo-state">{req.isRepair ? 'returning' : 'new'}</span>
            <span class="sectdesc">{req.deviceId.slice(0, 12)}</span>
          </div>
        </li>
      {/each}
    </ul>

    <p class="gitrepo-instructions">
      A returning browser is one this stack knew before and whose access was withdrawn. Approving
      gives it back what it had; nothing else on the machine changes.
    </p>

    <button type="button" class="save" disabled={working} onclick={approve}>
      {working ? 'Approving…' : 'Approve'}
    </button>

    {#if result}
      <p class="gitresult" class:warn={!result.ok}>{result.message}</p>
    {/if}
  </section>
{/if}
