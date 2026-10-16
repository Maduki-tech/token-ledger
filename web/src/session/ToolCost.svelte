<script>
  import Swatch from '../components/Swatch.svelte'
  import { family, tok, usd } from '../lib/format.js'

  let { s, onTool } = $props()

  const max = $derived(s.toolStats[0]?.cost || 0)
</script>

<div class="card">
  <h2>Cost by tool · all agents · {usd(s.toolCost)}</h2>
  <p class="-mt-1.5 mb-2.5 text-xs text-muted">Writing the call, reading its result, and re-reading both from cache on every later request.</p>
  <table>
    <thead><tr><th>Tool</th><th class="num">Calls</th><th class="num max-sm:hidden">Result</th><th class="num max-sm:hidden">Re-read</th><th class="num">Cost</th><th class="num max-sm:hidden">Avg</th><th class="w-[22%] min-w-20 max-sm:hidden"></th></tr></thead>
    <tbody>
      {#each s.toolStats as st (st.tool)}
        {@const color = family(st.tool)[1]}
        <tr class="row-click" tabindex="0" onclick={() => onTool(st.tool)} onkeydown={e => e.key === 'Enter' && onTool(st.tool)}>
          <td class="trunc w-[32%] max-w-0" title={st.tool}><Swatch {color} />{st.tool.replace(/^mcp__(claude_ai_)?/, '')}</td>
          <td class="num">{st.n}</td>
          <td class="num text-ink-2 max-sm:hidden">{tok(st.resultTok)}</td>
          <td class="num text-ink-2 max-sm:hidden">{tok(st.carryTok)}</td>
          <td class="num"><strong>{usd(st.cost)}</strong></td>
          <td class="num text-ink-2 max-sm:hidden">{usd(st.cost / st.n)}</td>
          <td class="w-[22%] min-w-20 max-sm:hidden"><div class="h-2.5 min-w-0.5 rounded-r" style="width:{max ? (st.cost / max) * 100 : 0}%;background:{color}"></div></td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
