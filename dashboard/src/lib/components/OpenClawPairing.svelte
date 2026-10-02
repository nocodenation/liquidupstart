<script>
  // A browser the Control UI has refused, and the one control that lets it back
  // in. R2 of §9 in docs/FEATURE-openclaw-2026-9-1.md.
  //
  // The card is silent while nothing is waiting and nothing failed: it is only
  // ever right to show it when there is something to do. A card that says "no
  // pending requests" on every load teaches the operator to stop reading this
  // part of the page.
  let pending = $state([]);
  let others = $state([]);
  let problem = $state('');
  let loaded = $state(false);
  let working = $state('');
  let result = $state(null);
  let timer;

  // What this card can approve: a Control UI browser asking for operator access.
  // The same rule the server applies, so the button is not offered for something
  // the server will refuse.
  const recoverable = (r) => r.clientId === 'openclaw-control-ui' && r.role === 'operator';

  // One row per device, newest request first: a refused browser mints a new id on
  // every retry, and four rows for one browser is not four browsers.
  function byDevice(list) {
    const seen = new Map();
    for (const r of [...list].sort((a, b) => (b.requestedAt ?? 0) - (a.requestedAt ?? 0))) {
      if (!seen.has(r.deviceId)) seen.set(r.deviceId, { ...r, retries: 1 });
      else seen.get(r.deviceId).retries += 1;
    }
    return [...seen.values()];
  }

  async function load() {
    try {
      const res = await fetch('/openclaw-pairing');
      const body = await res.json();
      const all = Array.isArray(body?.pending) ? body.pending : [];
      // A failure is not an empty list. The server returns ok:false with the
      // CLI's own words precisely so this can say them; ignoring them left the
      // operator locked out with a silent page, which is the dead end this card
      // exists to remove. Finding 4 of the 2026-09-29 review.
      problem = body?.ok === false ? (body.message ?? 'The gateway did not answer.') : '';
      pending = byDevice(all.filter(recoverable));
      others = byDevice(all.filter((r) => !recoverable(r)));
    } catch (e) {
      pending = [];
      others = [];
      problem = `The dashboard could not ask OpenClaw: ${e.message}`;
    } finally {
      loaded = true;
    }
  }

  async function approve(deviceId) {
    if (working) return;
    working = deviceId;
    clearTimeout(timer);
    try {
      // The device, never a request id read out of this page: a refused browser
      // mints a new id on every retry, so what was rendered is stale. The server
      // reads that device's current request at the moment this is pressed.
      const res = await fetch('/openclaw-pairing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId })
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
      working = '';
      // Held rather than flashed: a confirmation that leaves with the thing it
      // confirms was never read — the operator's finding of 2026-09-18, in the
      // deploy-key panel.
      timer = setTimeout(() => (result = null), 8000);
    }
  }

  // Read again while the page is open. The operator starts the stack here, is
  // refused in OpenClaw, and comes back to this tab: with one read at mount there
  // was no card until they reloaded by hand, which is the same dead end one step
  // along. Finding 5 of the 2026-09-29 review.
  const POLL_MS = 15000;

  $effect(() => {
    load();
    const again = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') load();
    };
    const poll = setInterval(again, POLL_MS);
    // focus as well as visibilitychange: switching tabs fires the second, and
    // returning from another window only the first.
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', again);
    return () => {
      clearInterval(poll);
      clearTimeout(timer);
      window.removeEventListener('focus', again);
      document.removeEventListener('visibilitychange', again);
    };
  });
</script>

<!-- Held open while a result is showing, even once nothing is pending any more.
     Approving empties the list, so a confirmation living inside the card leaves
     with the card and is never read. That is the operator's finding of
     2026-09-18 about the skip panel, met again here the first time this card was
     used for real, on 2026-09-19. -->
{#if loaded && (pending.length > 0 || others.length > 0 || problem || result)}
  <section class="card">
    <h2>A browser is waiting to be let in</h2>

    {#if problem}
      <p class="gitmessage warn">
        OpenClaw could not be asked what is waiting: {problem}
      </p>
    {/if}

    {#if pending.length > 0}
      <p class="gitmessage warn">
        {pending.length === 1 ? 'One browser has' : `${pending.length} browsers have`} asked for
        access to OpenClaw and {pending.length === 1 ? 'is' : 'are'} waiting for you. Until you
        approve, {pending.length === 1 ? 'it shows' : 'they show'} “Role upgrade pending” and cannot
        connect.
      </p>

      <ul class="gitlist">
        {#each pending as req (req.deviceId)}
          <li class="gitrepo">
            <div class="gitrepo-head">
              <span class="gitrepo-label">{req.clientId}</span>
              <span class="gitrepo-state">{req.isRepair ? 'returning' : 'new'}</span>
              <span class="sectdesc">{req.deviceId.slice(0, 12)}</span>
            </div>
            <!-- Role, address and scopes, because "which browser is this" is the
                 question the operator is actually being asked, and a client id
                 plus twelve characters of device id does not answer it. -->
            <p class="sectdesc">
              role {req.role || 'unstated'}{req.remoteAddress ? ` · from ${req.remoteAddress}` : ''}{req.retries >
              1
                ? ` · asked ${req.retries} times`
                : ''}
            </p>
            {#if req.scopes?.length}
              <p class="sectdesc">asking for {req.scopes.join(', ')}</p>
            {/if}
            <button
              type="button"
              class="save"
              disabled={!!working}
              onclick={() => approve(req.deviceId)}
            >
              {working === req.deviceId ? 'Approving…' : 'Approve this browser'}
            </button>
          </li>
        {/each}
      </ul>

      <p class="gitrepo-instructions">
        A returning browser is one this stack knew before and whose access was withdrawn. Approving
        gives that browser back what it had; nothing else on the machine changes.
      </p>
    {/if}

    {#if others.length > 0}
      <!-- Named and not approvable here. Anything on the stack's network can put
           a request in this queue -- `openclaw node run` from a container leaves a
           role: node one -- and an Approve button that took whatever asked last
           would let it in while the operator's own browser stayed locked out. -->
      <p class="gitrepo-instructions">
        {others.length === 1 ? 'One other request is' : `${others.length} other requests are`}
        pending that this card does not approve, because {others.length === 1 ? 'it is' : 'they are'}
        not a Control UI browser asking for operator access: {others
          .map((r) => `${r.clientId} (role ${r.role || 'unstated'})`)
          .join(', ')}. Approve {others.length === 1 ? 'it' : 'them'} with the OpenClaw CLI if you
        meant to.
      </p>
    {/if}

    {#if result}
      <p class="gitresult" class:warn={!result.ok}>{result.message}</p>
      {#if result.ok && pending.length === 0}
        <p class="gitrepo-instructions">Reload that browser and it is in.</p>
      {/if}
    {/if}
  </section>
{/if}
