<script>
  let { data, form } = $props();
  let revealed = $state({});
  // Live values of password fields the user has typed into (see the comment
  // at the password input).
  let edits = $state({});

  // After a "Generate" round-trip the form action returns every submitted
  // value, so user edits survive; otherwise values come from .env.
  function fieldValue(field) {
    if (form?.values) {
      return form.values[field.key] ?? (field.type === 'checkbox' ? '0' : '');
    }
    return field.value;
  }
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
          <input
            type="checkbox"
            id={item.key}
            name={item.key}
            value="1"
            checked={fieldValue(item) === '1'}
          />
        {:else if item.type === 'number'}
          <input type="number" id={item.key} name={item.key} value={fieldValue(item)} />
        {:else if item.type === 'password' || section.autogen}
          <!-- Track edits in state: the dynamic `type` shares one template
               effect with the other attributes, so a Show/Hide toggle
               re-assigns `value` — without the edits overlay that would reset
               the field to the initial server value, wiping typed input.
               Non-secret autogen fields (e.g. APP_ID) take this branch too,
               as plain text: still readonly + Generate, just never masked. -->
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
      <!-- The autogen section reopens after a Generate round-trip so the
           just-generated value stays visible. -->
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
