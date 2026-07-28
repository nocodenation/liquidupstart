<script>
  import '../app.css';
  let { children, data } = $props();
</script>

{@render children()}

{#if data?.version}
  <footer class="version">Liquid Upstart <code>{data.version}</code></footer>
{/if}
