<script>
  // items: [{ k, v, s?, err? }]; err shows the subline as a failure
  let { items } = $props()
</script>

<div class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
  {#each items as t (t.k)}
    <div class="rounded-xl border border-ring bg-surface px-3.5 py-3">
      <div class="text-xs text-muted">{t.k}</div>
      <div class="text-2xl font-semibold tracking-[-0.02em] tabular-nums">{t.v}</div>
      {#if t.s}<div class="text-xs {t.err ? 'font-semibold text-critical' : 'text-ink-2'}">{t.s}</div>{/if}
    </div>
  {/each}
</div>
