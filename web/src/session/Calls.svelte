<script>
  import Seg from '../components/Seg.svelte'
  import Swatch from '../components/Swatch.svelte'
  import { dur, family, pretty, tok, usd } from '../lib/format.js'

  let { s, filter = $bindable(), openCall = $bindable() } = $props()

  const LIMIT = 500
  const agentName = id => id === 'main' ? 'main' : (s.agents.find(a => a.id === id)?.type || id)
  const shown = $derived.by(() => {
    const q = filter.q.toLowerCase()
    const rows = s.calls.filter(c => (!filter.agent || c.agent === filter.agent) && (!filter.tool || c.tool === filter.tool)
      && (!q || (c.target + ' ' + c.input + ' ' + c.tool).toLowerCase().includes(q)))
    return filter.byCost ? rows.sort((a, b) => b.cost - a.cost) : rows
  })
  const toggle = id => (openCall = openCall === id ? null : id)
</script>

<div class="card">
  <h2>Tool calls · {shown.length} of {s.calls.length}</h2>
  <div class="mb-2.5 flex flex-wrap items-center gap-2">
    <select id="f-agent" aria-label="Agent" bind:value={filter.agent}>
      <option value="">All agents</option>
      {#each s.agents as a (a.id)}<option value={a.id}>{a.id === 'main' ? 'main' : a.type + ' · ' + a.id.slice(0, 6)}</option>{/each}
    </select>
    <select id="f-tool" aria-label="Tool" bind:value={filter.tool}>
      <option value="">All tools</option>
      {#each s.toolCounts as [t, n] (t)}<option value={t}>{t} ({n})</option>{/each}
    </select>
    <input type="search" class="max-w-[360px] min-w-[220px] flex-1" placeholder="Search inputs…" aria-label="Search tool inputs" bind:value={filter.q}>
    <Seg options={[[false, 'By time'], [true, 'Most expensive']]} bind:value={filter.byCost} label="Order" />
  </div>

  <div class="overflow-x-auto overflow-y-hidden">
    <table>
      <thead><tr><th class="num">At</th><th>Agent</th><th>Tool</th><th>Target</th><th class="num">Took</th><th class="num">Tokens</th><th class="num">Cost</th></tr></thead>
      <tbody>
        {#each shown.slice(0, LIMIT) as c (c.id)}
          <tr class="row-click" class:sel={openCall === c.id} tabindex="0" id="call-{c.id}" onclick={() => toggle(c.id)} onkeydown={e => e.key === 'Enter' && toggle(c.id)}>
            <td class="num font-mono text-sm text-ink-2">+{dur(c.ts - s.start)}</td>
            <td class="text-ink-2">{agentName(c.agent)}</td>
            <td><Swatch color={family(c.tool)[1]} /><span class:err={c.error}>{c.tool}{c.error ? ' ✕' : ''}</span></td>
            <td class="trunc max-w-[46ch] font-mono text-sm max-sm:max-w-[42vw]">{#if c.subagent}→ <strong>{c.subagent}</strong> {/if}{c.target}</td>
            <td class="num text-ink-2">{c.ms ? dur(c.ms / 1000) : '–'}</td>
            <td class="num text-ink-2" title="written {tok(c.outTok)} · result {tok(c.resultTok)} · re-read {tok(c.carryTok)}">{tok(c.outTok + c.resultTok)}</td>
            <td class="num">{usd(c.cost)}</td>
          </tr>
          {#if openCall === c.id}
            <tr><td colspan="7">
              <div class="mb-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-ink-2">
                <span>written <strong class="tabular-nums">{tok(c.outTok)}</strong> output tokens</span>
                <span>result <strong class="tabular-nums">{tok(c.resultTok)}</strong> tokens into context</span>
                <span>re-read <strong class="tabular-nums">{tok(c.carryTok)}</strong> tokens from cache afterwards</span>
                <span>≈ <strong class="tabular-nums">{usd(c.cost)}</strong></span>
              </div>
              <pre class="max-h-80 overflow-auto rounded-lg bg-page p-2.5 font-mono text-sm [overflow-wrap:anywhere] whitespace-pre-wrap">{pretty(c.input)}</pre>
            </td></tr>
          {/if}
        {/each}
      </tbody>
    </table>
    {#if shown.length > LIMIT}<div class="empty">Showing the first {LIMIT}; narrow the filters to see the rest.</div>{/if}
  </div>
</div>

<style>
  .err { color: var(--critical); font-weight: 600; }
</style>
