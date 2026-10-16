<script>
  // One lane for the main agent, one per subagent; overlapping bars ran in parallel.
  import Swatch from '../components/Swatch.svelte'
  import { FAMILIES, dur, family, short, tok, usd, when } from '../lib/format.js'
  import { GAP, maxParallel, timeMap } from '../lib/timeline.js'

  let { s, openCall, onCall, onAgent } = $props()

  let zoom = $state(false) // narrowed to the subagents' span
  let tip = $state(null) // { x, y, call?, agent } under the mouse
  let tipW = $state(0)
  let tipH = $state(0)

  const subs = $derived(s.agents.filter(a => a.id !== 'main'))
  const range = $derived.by(() => {
    if (!zoom || !subs.length) return [s.start, s.end]
    const a = Math.min(...subs.map(x => x.start)), b = Math.max(...subs.map(x => x.end))
    return [a - (b - a) * 0.05, b + (b - a) * 0.05]
  })
  const map = $derived(timeMap(s, range))
  // a label at each stretch's start, more inside wide ones
  const ticks = $derived(map.placed.flatMap((p, i) => [0, 0.25, 0.5, 0.75].filter(f => f === 0 || p.w > 30).map(f =>
    ({ left: p.left + f * p.w, text: i || f || zoom ? '+' + dur(p.x + f * (p.y - p.x) - s.start) : when(s.start) }))))
  const gaps = $derived(map.placed.slice(1).map((p, i) => ({ left: p.left - GAP, idle: p.x - map.placed[i].y })))
  // main first, then subagents in the order they started
  const agents = $derived([s.agents.find(a => a.id === 'main'), ...[...subs].sort((a, b) => a.start - b.start)].filter(Boolean))
  const peak = $derived(maxParallel(subs))
  const legend = $derived.by(() => {
    const used = new Set(s.calls.map(c => family(c.tool)[0]))
    return [...FAMILIES.map(f => [f[0], f[1]]), ['mcp', 'var(--s7)'], ['other', 'var(--other)']].filter(([n]) => used.has(n))
  })
  const who = a => a.id === 'main' ? 'main' : a.type
  const span = (from, to, min) => `left:${map.pct(from)}%;width:${Math.max(min, map.pct(to) - map.pct(from))}%`
</script>

<div class="card">
  <div class="flex flex-wrap items-baseline gap-3">
    <h2>Timeline · {agents.length - 1} subagent{agents.length === 2 ? '' : 's'}{peak > 1 ? ` · up to ${peak} in parallel` : ''}</h2>
    {#if subs.length}
      <button class="toggle" aria-pressed={zoom} onclick={() => (zoom = !zoom)}>{zoom ? 'Show whole session' : 'Zoom to subagents'}</button>
    {/if}
  </div>
  <div class="mb-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-ink-2">
    {#each legend as [n, c] (n)}<span><Swatch color={c} />{n}</span>{/each}
    {#if s.errors}<span><Swatch color="transparent" style="outline:2px solid var(--critical)" />error</span>{/if}
  </div>

  <div class="overflow-x-auto overflow-y-hidden">
    <div class="min-w-[560px]" role="presentation" onmouseleave={() => (tip = null)}
      onmousemove={e => { if (!e.target.closest(".bar, .call")) tip = null }}>
      {#each agents as a (a.id)}
        {@const spawn = a.toolUseId && s.calls.find(c => c.id === a.toolUseId)}
        <div class="row">
          <div class="trunc pr-2.5 text-sm leading-[1.3] {a.id === 'main' ? '' : 'pl-3.5'}" title={a.description}>
            {#if a.id === 'main'}<strong>main</strong>{:else}{a.type} <span class="text-muted">{a.description}</span>{/if}<br>
            <span class="text-[11.5px] text-muted">{short(a.models)} · {dur(a.end - a.start)} · {usd(a.usage.cost)} · {a.tools} tools</span>
          </div>
          <div class="track">
            {#each gaps as g, i (i)}<div class="gap" style="left:{g.left}%" title="idle {dur(g.idle)}">⋯</div>{/each}
            {#if spawn}<div class="spawn" style="left:{map.pct(spawn.ts)}%"></div>{/if}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div class="bar" role="button" tabindex="-1" style={span(a.start, a.end, 0.3)}
              onclick={() => onAgent(a.id)} onmousemove={e => (tip = { x: e.clientX, y: e.clientY, agent: a })}></div>
            {#each s.calls.filter(c => c.agent === a.id) as c (c.id)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div class="call" class:e={c.error} class:sel={openCall === c.id} role="button" tabindex="-1"
                style="{span(c.ts, c.ts + c.ms / 1000, 0.25)};background:{family(c.tool)[1]}"
                onclick={() => onCall(c.id)} onmousemove={e => (tip = { x: e.clientX, y: e.clientY, call: c, agent: a })}></div>
            {/each}
          </div>
        </div>
      {/each}
      <div class="row-axis">
        <span></span>
        <div class="ticks">{#each ticks as t, i (i)}<span style="left:{t.left}%">{t.text}</span>{/each}</div>
      </div>
    </div>
  </div>
</div>

{#if tip}
  {@const a = tip.agent}
  <div class="tip" role="tooltip" bind:offsetWidth={tipW} bind:offsetHeight={tipH}
    style="left:{Math.min(tip.x + 14, innerWidth - tipW - 8)}px;top:{tip.y + 16 + tipH > innerHeight ? tip.y - tipH - 10 : tip.y + 16}px">
    {#if tip.call}
      {@const c = tip.call}
      <strong>{c.tool}</strong>{#if c.error} <span class="font-semibold text-critical">failed</span>{/if} <span class="text-muted">· {who(a)}</span><br>
      <span class="font-mono">{c.target || ''}</span><br>
      <span class="text-muted">+{dur(c.ts - s.start)} · took {c.ms ? dur(c.ms / 1000) : '–'} · {tok(c.outTok + c.resultTok)} tokens · {usd(c.cost)}</span>
    {:else}
      <strong>{who(a)}</strong> <span class="text-muted">· {short(a.models)} · {dur(a.end - a.start)} · {usd(a.usage.cost)} · {a.tools} tools</span>
      {#if a.description}<br>{a.description}{/if}
      <br><span class="text-muted">+{dur(a.start - s.start)} → +{dur(a.end - s.start)} · click to filter its tool calls</span>
    {/if}
  </div>
{/if}

<style>
  .row, .row-axis { display: grid; grid-template-columns: 200px 1fr; }
  .row { align-items: center; min-height: 40px; border-bottom: 1px solid var(--grid); }
  .row-axis { font-size: 11px; color: var(--muted); }
  @media (max-width: 640px) { .row, .row-axis { grid-template-columns: 110px 1fr; } }
  .track { position: relative; height: 40px; border-left: 1px solid var(--axis); overflow: hidden; }
  .bar { position: absolute; top: 8px; height: 24px; border-radius: 4px; cursor: pointer; min-width: 4px;
    background: color-mix(in srgb, var(--ink) 8%, transparent); box-shadow: inset 0 0 0 1px var(--ring); }
  .bar:hover { background: color-mix(in srgb, var(--ink) 14%, transparent); }
  .call { position: absolute; top: 11px; height: 18px; min-width: 3px; border-radius: 2px;
    box-shadow: 0 0 0 1px var(--surface); cursor: pointer; z-index: 1; }
  .call.e { outline: 2px solid var(--critical); }
  .call:hover, .call.sel { box-shadow: 0 0 0 2px var(--ink); z-index: 2; }
  .spawn { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1px dashed var(--muted); }
  .gap { position: absolute; top: 0; bottom: 0; width: 3%; display: grid; place-items: center; color: var(--muted);
    font-size: 11px; background: repeating-linear-gradient(135deg, transparent 0 3px, var(--grid) 3px 4px); }
  .ticks { position: relative; height: 18px; border-top: 1px solid var(--axis); }
  .ticks span { position: absolute; top: 3px; transform: translateX(-50%); white-space: nowrap; }
  .ticks span:first-child { transform: none; }
  .ticks span:last-child:not(:first-child) { transform: translateX(-100%); }
  .tip { position: fixed; z-index: 10; pointer-events: none; background: var(--surface); color: var(--ink);
    border: 1px solid var(--ring); border-radius: 8px; padding: 8px 10px; font-size: 12.5px; max-width: 420px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.18); overflow-wrap: anywhere; }
</style>
