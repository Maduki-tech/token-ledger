<script>
  import Swatch from '../components/Swatch.svelte'
  import { tok, usd } from '../lib/format.js'

  let { s } = $props()

  const parts = $derived([
    ['input', s.usage.input, 'var(--seq-in)'],
    ['output', s.usage.output, 'var(--seq-out)'],
    ['cache write', s.usage.cacheWrite, 'var(--seq-cw)'],
    ['cache read', s.usage.cacheRead, 'var(--seq-cr)'],
  ])
</script>

<div class="card">
  <h2>Tokens</h2>
  <div class="mt-1 mb-2.5 flex h-3.5 gap-0.5 *:first:rounded-l *:last:rounded-r" role="img" aria-label="Token split">
    {#each parts.filter(p => p[1]) as [n, v, c] (n)}<div title="{n}: {tok(v)}" style="flex:{v};background:{c}"></div>{/each}
  </div>
  <div class="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-ink-2">
    {#each parts as [n, v, c] (n)}<span><Swatch color={c} />{n} <strong class="tabular-nums">{tok(v)}</strong></span>{/each}
  </div>
  <table class="mt-3">
    <thead><tr><th>Model</th><th class="num">Requests</th><th class="num">Tokens</th><th class="num">Cost</th></tr></thead>
    <tbody>
      {#each s.models as m (m.model)}
        <tr><td class="font-mono text-sm">{m.model}</td><td class="num">{m.requests}</td><td class="num">{tok(m.total)}</td><td class="num"><strong>{usd(m.cost)}</strong></td></tr>
      {/each}
    </tbody>
  </table>
</div>
