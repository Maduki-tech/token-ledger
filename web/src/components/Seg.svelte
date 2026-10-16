<script>
  // segmented buttons: one of options ([value, label]) is pressed
  let { options, value = $bindable(), label, onchange = undefined } = $props()
</script>

<div class="inline-flex overflow-hidden rounded-lg border border-ring" role="group" aria-label={label}>
  {#each options as [v, l] (v)}
    <button
      class="cursor-pointer px-[11px] py-[5px] not-first:border-l not-first:border-ring {v === value ? 'bg-ink text-page' : 'text-ink-2'}"
      aria-pressed={v === value}
      onclick={() => { value = v; onchange?.(v) }}>{l}</button>
  {/each}
</div>
