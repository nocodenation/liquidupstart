<script>
  let { value = '', label = 'value' } = $props();

  let revealed = $state(false);
  let copied = $state(false);
  let copyFailed = $state(false);
  let timer;

  async function copy() {
    clearTimeout(timer);
    copyFailed = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (!ok) throw new Error('copy rejected');
      }
      copied = true;
      timer = setTimeout(() => (copied = false), 1500);
    } catch {
      copyFailed = true;
      timer = setTimeout(() => (copyFailed = false), 2500);
    }
  }
</script>

<span class="secret">
  <code class="secretvalue" class:masked={!revealed}>
    {revealed ? value : '••••••••••'}
  </code>
  <button
    type="button"
    class="iconbtn"
    onclick={() => (revealed = !revealed)}
    aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
    title={revealed ? 'Hide' : 'Show'}
    aria-pressed={revealed}
  >
    {#if revealed}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M3 3l18 18M10.6 10.7a2 2 0 002.8 2.8M9.4 5.2A9.5 9.5 0 0112 5c5 0 9 4.5 9 7 0 .9-.7 2.2-1.9 3.4M6.5 6.6C4.2 8.1 3 10.2 3 12c0 2.5 4 7 9 7 1.4 0 2.7-.3 3.8-.9"
        />
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 12s3.6-7 9-7 9 7 9 7-3.6 7-9 7-9-7-9-7z" />
        <circle cx="12" cy="12" r="2.6" />
      </svg>
    {/if}
  </button>
  <button
    type="button"
    class="iconbtn"
    onclick={copy}
    aria-label={`Copy ${label}`}
    title={copyFailed ? 'Copy failed' : copied ? 'Copied' : 'Copy'}
  >
    {#if copied}
      <svg viewBox="0 0 24 24" aria-hidden="true" class="ok">
        <path d="M4 12.5l5 5L20 6.5" />
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V5a2 2 0 012-2h8" />
      </svg>
    {/if}
  </button>
  {#if copyFailed}<span class="copyfail">copy failed</span>{/if}
</span>
