<script>
  import { onMount } from 'svelte';
  import { SYSTEM_PORT_DEFAULTS } from '$lib/env-meta';

  let { data, form } = $props();
  let revealed = $state({});
  // Overlay for typed values (see comment at the password input). Port fields
  // use it too, so an autofilled free port replaces what's shown and submitted.
  let edits = $state({});

  // Host-published ports we availability-check. Other *_PORT keys are internal
  // container ports, not bound on the host, so we leave them be.
  const PORT_KEYS = Object.keys(SYSTEM_PORT_DEFAULTS);
  // Locked once configured: services were set up against these ports, so
  // changing them would break the stack.
  const portsLocked = data.configured;
  // key -> { state: 'checking'|'ok'|'changed'|'error', message }
  let portStatus = $state({});

  // After a "Generate" round-trip the form action returns every submitted
  // value, so user edits survive; otherwise values come from .env.
  function fieldValue(field) {
    if (form?.values) {
      return form.values[field.key] ?? (field.type === 'checkbox' ? '0' : '');
    }
    return field.value;
  }

  // Initial .env values for the port fields; walk the section tree since
  // fields can be nested inside collapsed groups.
  const initialPorts = $derived.by(() => {
    const out = {};
    const visit = (items) => {
      for (const it of items ?? []) {
        if (it.kind === 'group') visit(it.items);
        else if (it.kind === 'field' && PORT_KEYS.includes(it.key)) out[it.key] = it.value;
      }
    };
    for (const s of data.sections) visit(s.items);
    return out;
  });

  const currentPort = (key) => Number(edits[key] ?? initialPorts[key]);
  const otherPortKey = (key) => PORT_KEYS.find((k) => k !== key);

  // Probe the host for `key`'s port; if taken, autofill the next free one.
  // `exclude` keeps the two ports from landing on the same value.
  async function checkPort(key, exclude = []) {
    const port = currentPort(key);
    if (!Number.isInteger(port) || port < 1) {
      portStatus[key] = null;
      return;
    }
    portStatus[key] = { state: 'checking' };
    try {
      const qs = new URLSearchParams({ port: String(port) });
      const ex = exclude.filter((n) => Number.isInteger(n) && n > 0);
      if (ex.length) qs.set('exclude', ex.join(','));
      const res = await fetch(`/port-check?${qs}`);
      const result = await res.json();
      if (result.error) {
        portStatus[key] = { state: 'error', message: `Couldn't check port ${port}: ${result.error}` };
      } else if (result.free) {
        portStatus[key] = { state: 'ok', message: `Port ${port} is available.` };
      } else if (result.suggestion) {
        edits[key] = String(result.suggestion);
        portStatus[key] = {
          state: 'changed',
          message: `Port ${port} is in use — switched to ${result.suggestion}.`
        };
      } else {
        portStatus[key] = {
          state: 'error',
          message: `Port ${port} is in use and no free port was found nearby.`
        };
      }
    } catch {
      portStatus[key] = { state: 'error', message: `Couldn't check port ${port}.` };
    }
  }

  // First setup only: seed empty port fields with defaults, then check
  // availability (autofilling the next free port if taken). HTTPS excludes
  // HTTP's settled value so they can't collide. Locked = nothing to do.
  onMount(async () => {
    if (portsLocked) return;
    for (const key of PORT_KEYS) {
      if (key in initialPorts && !String(initialPorts[key] ?? '').trim()) {
        edits[key] = String(SYSTEM_PORT_DEFAULTS[key]);
      }
    }
    if (PORT_KEYS[0] in initialPorts) await checkPort(PORT_KEYS[0]);
    if (PORT_KEYS[1] in initialPorts) await checkPort(PORT_KEYS[1], [currentPort(PORT_KEYS[0])]);
  });
</script>

{#snippet itemView(item, section)}
  {#if item.kind === 'group'}
    <details class="subgroup">
      <summary>
        <h3>{item.title}</h3>
        {#if item.description}<span class="sectdesc">{item.description}</span>{/if}
      </summary>
      {#each item.items as sub}
        {@render itemView(sub, section)}
      {/each}
    </details>
  {:else if item.kind === 'subheading'}
    <h3>{item.text}</h3>
  {:else if item.kind === 'paragraph'}
    {#if item.lines.length > 5}
      <details class="docs">
        <summary>{item.lines[0]}</summary>
        <pre>{item.lines.join('\n')}</pre>
      </details>
    {:else}
      <pre class="docs">{item.lines.join('\n')}</pre>
    {/if}
  {:else if item.kind === 'field'}
    <div class="field">
      <label for={item.key}>
        <code>{item.key}</code>
        {#if item.buildAffecting}
          <span class="badge">rebuild on change</span>
        {/if}
      </label>
      {#if item.help.length > 5}
        <details class="help">
          <summary>{item.help[0]}</summary>
          <pre>{item.help.join('\n')}</pre>
        </details>
      {:else if item.help.length > 0}
        <pre class="help">{item.help.join('\n')}</pre>
      {/if}

      <div class="control">
        {#if item.type === 'select-mode'}
          <select id={item.key} name={item.key}>
            {#each ['add', 'override'] as opt}
              <option value={opt} selected={fieldValue(item) === opt}>{opt}</option>
            {/each}
          </select>
        {:else if item.type === 'checkbox'}
          <label class="switch">
            <input
              type="checkbox"
              id={item.key}
              name={item.key}
              value="1"
              checked={fieldValue(item) === '1'}
            />
            <span class="slider"></span>
            <span class="switch-state"></span>
          </label>
        {:else if item.type === 'number' && PORT_KEYS.includes(item.key)}
          {#if portsLocked}
            <!-- readonly so it still submits the fixed value; the server pins
                 it regardless. -->
            <input type="number" id={item.key} name={item.key} value={fieldValue(item)} readonly />
          {:else}
            <!-- Value flows through `edits` so a probed free port can replace
                 it; the button re-checks after manual edits. -->
            <input
              type="number"
              id={item.key}
              name={item.key}
              value={edits[item.key] ?? fieldValue(item)}
              oninput={(e) => {
                edits[item.key] = e.currentTarget.value;
                portStatus[item.key] = null;
              }}
            />
            <button
              type="button"
              class="aux"
              onclick={() => checkPort(item.key, [currentPort(otherPortKey(item.key))])}
              disabled={portStatus[item.key]?.state === 'checking'}
            >
              {portStatus[item.key]?.state === 'checking' ? 'Checking…' : 'Check'}
            </button>
          {/if}
        {:else if item.type === 'number'}
          <input type="number" id={item.key} name={item.key} value={fieldValue(item)} />
        {:else if item.type === 'password' || section.autogen}
          <!-- Track edits in state: the dynamic `type` shares one template
               effect with `value`, so a Show/Hide toggle re-assigns `value` —
               without the overlay that would wipe typed input back to the
               server value. Non-secret autogen fields take this branch as
               plain text: readonly + Generate, just never masked. -->
          <input
            type={item.type === 'password' ? (revealed[item.key] ? 'text' : 'password') : 'text'}
            id={item.key}
            name={item.key}
            value={edits[item.key] ?? fieldValue(item)}
            oninput={(e) => (edits[item.key] = e.currentTarget.value)}
            readonly={section.autogen}
            autocomplete="off"
            spellcheck="false"
            placeholder={section.autogen ? '(empty = generated on save)' : ''}
          />
          {#if item.type === 'password'}
            <button
              type="button"
              class="aux"
              onclick={() => (revealed[item.key] = !revealed[item.key])}
            >
              {revealed[item.key] ? 'Hide' : 'Show'}
            </button>
          {/if}
          {#if section.autogen}
            <button
              type="submit"
              class="aux"
              name="__generate"
              value={item.key}
              formaction="?/generate"
              disabled={fieldValue(item) !== ''}
            >
              Generate
            </button>
          {/if}
        {:else}
          <input
            type="text"
            id={item.key}
            name={item.key}
            value={fieldValue(item)}
            spellcheck="false"
          />
        {/if}
      </div>
      {#if PORT_KEYS.includes(item.key)}
        {#if portsLocked}
          <p class="porthint locked">
            Fixed at initial setup — Nextcloud and other services were configured against
            this port, so it can't be changed now.
          </p>
        {:else if portStatus[item.key]}
          <p class="porthint {portStatus[item.key].state}">
            {portStatus[item.key].state === 'checking'
              ? `Checking port ${currentPort(item.key)}…`
              : portStatus[item.key].message}
          </p>
        {/if}
      {/if}
    </div>
  {/if}
{/snippet}

<main>
  <header class="intro">
    <div class="dashhead">
      <h1>All-In-Wonder configuration</h1>
      {#if data.configured}
        <a href="/" class="aux configlink">← Dashboard</a>
      {/if}
    </div>
    <p>
      This form edits the <code>.env</code> file in the project root. Nothing is written until you
      click <strong>Save</strong> at the bottom.
    </p>
  </header>

  <form method="POST" action="?/save">
    {#each data.sections as section}
      <!-- Reopens after a Generate round-trip so the new value stays visible. -->
      <details
        class="card collapsible"
        open={section.autogen ? !!form?.values : !section.collapsed}
      >
        <summary>
          <h2>{section.title}</h2>
          {#if section.description}<span class="sectdesc">{section.description}</span>{/if}
        </summary>
        {#if section.autogen}
          <p class="autogen-note">
            These secrets are not editable by hand. Use <strong>Generate</strong> to fill one in, or
            simply leave them empty — every empty field gets a securely generated random value when
            you save. Existing values are never overwritten.
          </p>
        {/if}
        {#each section.items as item}
          {@render itemView(item, section)}
        {/each}
      </details>
    {/each}

    <div class="savebar">
      <span>Writes all values to <code>.env</code></span>
      <button type="submit" class="save">Save</button>
    </div>
  </form>
</main>
