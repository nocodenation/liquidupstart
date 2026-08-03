<script>
  import { invalidateAll } from '$app/navigation';
  import SecretValue from './SecretValue.svelte';

  let { password = null, securityUrl = '' } = $props();

  let editing = $state(false);
  let value = $state('');
  let saving = $state(false);
  let error = $state('');

  function startEditing() {
    value = '';
    error = '';
    editing = true;
  }

  async function save() {
    if (!value.trim() || saving) return;
    saving = true;
    error = '';
    try {
      const res = await fetch('/app-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: value })
      });
      if (res.status === 204) {
        editing = false;
        value = '';
        await invalidateAll();
        return;
      }
      const body = await res.text();
      let detail = body;
      try {
        detail = JSON.parse(body).error ?? body;
      } catch {
        detail = body;
      }
      error = `Could not save: ${res.status} ${detail}`.trim();
    } catch (e) {
      error = `Could not save: ${e.message}`;
    } finally {
      saving = false;
    }
  }
</script>

<div class="apppw">
  <div class="apppw-label">App password</div>

  {#if password && !editing}
    <SecretValue value={password} label="app password" />
  {/if}

  {#if editing}
    <div class="apppw-edit">
      <input
        type="text"
        placeholder="Paste the generated app password"
        bind:value
        onkeydown={(e) => e.key === 'Enter' && save()}
        autocomplete="off"
        spellcheck="false"
      />
      <button type="button" class="save apppw-save" disabled={!value.trim() || saving} onclick={save}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
    <p class="apppw-hint">
      Create it in Nextcloud under <strong>Devices &amp; sessions</strong> →
      <strong>Create new app password</strong>, then paste it here.
      <a href={securityUrl} target="_blank" rel="noopener noreferrer">Open the settings page ↗</a>
    </p>
    {#if error}
      <p class="apppw-error" role="alert">{error}</p>
    {/if}
  {:else}
    <a
      href={securityUrl}
      target="_blank"
      rel="noopener noreferrer"
      class="apppw-btn"
      onclick={startEditing}
    >
      {password ? 'Change app password' : 'Add app password'}
    </a>
  {/if}
</div>
