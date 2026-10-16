<script>
  // The session's cost split into what caused it; the parts add up to the total.
  import Swatch from '../components/Swatch.svelte'
  import { usd } from '../lib/format.js'

  let { s } = $props()

  const COLORS = { tools: 'var(--s3)', subagents: 'var(--s4)', start: 'var(--s1)', user: 'var(--s5)', reply: 'var(--s7)', compact: 'var(--other)' }
  const total = $derived(s.usage.cost || 1)
</script>

<div class="card">
  <h2>Where the cost went · {usd(s.usage.cost)}</h2>
  <div class="mt-1 mb-2.5 flex h-[18px] gap-0.5 *:first:rounded-l *:last:rounded-r" role="img" aria-label="Cost split">
    {#each s.breakdown as b (b.key)}<div title="{b.label}: {usd(b.cost)}" style="flex:{b.cost};background:{COLORS[b.key]}"></div>{/each}
  </div>
  <table><tbody>
    {#each s.breakdown as b (b.key)}
      <tr>
        <td class="w-[1%]"><Swatch color={COLORS[b.key]} /></td>
        <td>{b.label}</td>
        <td class="num"><strong>{usd(b.cost)}</strong></td>
        <td class="num w-[4em] text-ink-2">{Math.round((b.cost / total) * 100)}%</td>
      </tr>
    {/each}
  </tbody></table>
  <p class="mt-2.5 text-xs text-muted">Every request is billed for its whole context. Each part is charged for the requests it was in: once when it was added (cache write), then on every later request (cache read).</p>
</div>
