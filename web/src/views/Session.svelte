<script>
  import { tick } from 'svelte'

  import Chip from '../components/Chip.svelte'
  import Tiles from '../components/Tiles.svelte'
  import { dur, tok, usd, when } from '../lib/format.js'
  import Calls from '../session/Calls.svelte'
  import Subagents from '../session/Subagents.svelte'
  import Timeline from '../session/Timeline.svelte'
  import TokenSplit from '../session/TokenSplit.svelte'
  import ToolCost from '../session/ToolCost.svelte'
  import WhereCost from '../session/WhereCost.svelte'

  let { s } = $props()

  let filter = $state({ agent: '', tool: '', q: '', byCost: false })
  let openCall = $state(null)

  const u = $derived(s.usage)
  const subs = $derived(s.agents.filter(a => a.id !== 'main'))

  // the other cards narrow the tool-call table, then bring it into view
  async function narrow(key, value) {
    filter[key] = value
    await tick()
    document.getElementById('f-' + key)?.scrollIntoView({ block: 'center' })
  }
  async function showCall(id) {
    openCall = openCall === id ? null : id
    filter = { agent: '', tool: '', q: '', byCost: false }
    await tick()
    document.getElementById('call-' + id)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
</script>

<div>
  <h1 class="mb-1 text-lg font-bold tracking-[-0.01em]">{s.title || s.id}</h1>
  <div class="text-md [overflow-wrap:anywhere] text-ink-2">
    <span class="font-mono text-sm">{s.cwd}</span>
    {#if s.branch}<Chip>{s.branch}</Chip>{/if}
    · {when(s.start)} · <span class="font-mono text-sm text-muted">{s.id}</span>
  </div>
  {#if s.prompt}
    <blockquote class="mt-2.5 max-h-[8em] overflow-auto border-l-3 border-axis px-3 py-2 whitespace-pre-wrap text-ink-2">{s.prompt}</blockquote>
  {/if}
</div>

<Tiles items={[
  { k: 'Cost', v: usd(u.cost), s: u.requests + ' requests' },
  { k: 'Tokens', v: tok(u.total), s: tok(u.output) + ' output' },
  { k: 'Duration', v: dur(s.end - s.start) },
  { k: 'Tool calls', v: s.calls.length, s: s.errors ? `${s.errors} failed` : 'none failed', err: !!s.errors },
  { k: 'Subagents', v: subs.length, s: subs.length ? usd(subs.reduce((a, x) => a + x.usage.cost, 0)) : '' },
  { k: 'Skills', v: s.skills.length, s: s.skills.map(k => k[0]).slice(0, 3).join(', ') },
]} />

<Timeline {s} {openCall} onCall={showCall} onAgent={id => narrow('agent', id)} />
<WhereCost {s} />

<div class="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-4">
  <TokenSplit {s} />
  <ToolCost {s} onTool={t => narrow('tool', t)} />
</div>

<div class="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-4">
  <Subagents {subs} onAgent={id => narrow('agent', id)} />
  <div class="card">
    <h2>Skills · {s.skills.length}</h2>
    {#each s.skills as [k, n] (k)}<Chip>{k} ×{n}</Chip>{:else}<div class="empty">No skills used.</div>{/each}
  </div>
</div>

<Calls {s} bind:filter bind:openCall />
