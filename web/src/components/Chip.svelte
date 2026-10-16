<script>
  let { title = undefined, children } = $props()
</script>

<span {title} class="mr-1 mb-1 inline-block rounded-full border border-ring px-2 py-px text-xs whitespace-nowrap text-ink-2">{@render children()}</span>
