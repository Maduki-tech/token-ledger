<script>
  import Avatar from '../components/Avatar.svelte'
  import Chip from '../components/Chip.svelte'
  import Seg from '../components/Seg.svelte'
  import SortTh from '../components/SortTh.svelte'
  import Tiles from '../components/Tiles.svelte'
  import Skyline from './Skyline.svelte'
  import { q } from '../lib/api.js'
  import { ago, sortRows, store, tok, usd, windowLabel } from '../lib/format.js'

  let { list, hours } = $props()

  let sort = $state({ key: 'cost', dir: -1 })
  let layout = $state(['grid', '3d'].includes(store.get('layout')) ? store.get('layout') : 'list')

  const get = (p, k) => k === 'name' ? p.name : k === 'sessions' ? p.sessions : k === 'last' ? p.last : p.usage[k]
  const rows = $derived(sortRows(list, sort, get))
  const label = $derived(windowLabel(hours))
  const total = $derived(list.reduce((a, p) => ({ cost: a.cost + p.usage.cost, tok: a.tok + p.usage.total, s: a.s + p.sessions, out: a.out + p.usage.output }), { cost: 0, tok: 0, s: 0, out: 0 }))
  const go = p => (location.hash = `#/p/${q(p.key)}`)
  const GRID_SORTS = [['cost', 'Cost'], ['total', 'Tokens'], ['last', 'Last active'], ['sessions', 'Sessions'], ['name', 'Name']]
</script>

{#snippet gitChip(p, title)}
  {#if p.isGit}<Chip {title}>git{p.folders > 1 ? ` · ${p.folders} worktrees` : ''}</Chip>{/if}
{/snippet}

<Tiles items={[
  { k: 'Cost · ' + label, v: usd(total.cost), s: 'at API list prices' },
  { k: 'Tokens', v: tok(total.tok), s: tok(total.out) + ' output' },
  { k: 'Sessions', v: total.s, s: list.length + ' projects' },
  { k: 'Avg per session', v: total.s ? usd(total.cost / total.s) : '–' },
]} />

<div class="card">
  <div class="mb-3 flex flex-wrap items-center gap-2">
    <h2 class="mb-0">Projects</h2>
    <span class="flex-1"></span>
    {#if layout !== 'list'}
      <select aria-label="Sort projects" value={sort.key} onchange={e => (sort = { key: e.currentTarget.value, dir: e.currentTarget.value === 'name' ? 1 : -1 })}>
        {#each GRID_SORTS as [k, l] (k)}<option value={k}>Sort: {l}</option>{/each}
      </select>
    {/if}
    <Seg options={[['list', 'List'], ['grid', 'Grid'], ['3d', '3D']]} bind:value={layout} label="Layout" onchange={v => store.set('layout', v)} />
  </div>

  {#if !list.length}
    <div class="empty">No activity in the last {label}.</div>
  {:else if layout === '3d'}
    <Skyline {rows} />
  {:else if layout === 'grid'}
    <div class="grid grid-cols-1 gap-3 min-[521px]:grid-cols-2 min-[1001px]:grid-cols-4">
      {#each rows as p (p.key)}
        <a class="block min-w-0 rounded-[10px] border border-ring px-3.5 py-3 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-s1"
          href="#/p/{q(p.key)}" title={p.cwd}>
          <Avatar key={p.key} name={p.name} size={36} icon={p.icon} />
          <div class="trunc mt-2.5"><strong>{p.name}</strong> {@render gitChip(p)}</div>
          <div class="trunc mt-0.5 text-xs text-muted">{p.cwd}</div>
          <div class="mt-2.5 mb-1.5 text-xl font-semibold tracking-[-0.02em] tabular-nums">{usd(p.usage.cost)}</div>
          <div class="grid grid-cols-2 gap-x-2.5 gap-y-0.5 text-sm tabular-nums">
            <span><span class="text-muted">tokens</span> {tok(p.usage.total)}</span><span><span class="text-muted">output</span> {tok(p.usage.output)}</span>
            <span><span class="text-muted">sessions</span> {p.sessions}</span><span><span class="text-muted">active</span> {ago(p.last)}</span>
          </div>
        </a>
      {/each}
    </div>
  {:else}
    <div class="overflow-x-auto overflow-y-hidden">
      <table>
        <thead><tr>
          <SortTh bind:sort key="name" label="Project" />
          <SortTh bind:sort key="sessions" label="Sessions" class="num" />
          <SortTh bind:sort key="last" label="Last active" class="num max-sm:hidden" />
          <SortTh bind:sort key="input" label="Input" class="num max-sm:hidden" />
          <SortTh bind:sort key="output" label="Output" class="num" />
          <SortTh bind:sort key="cacheRead" label="Cache read" class="num max-sm:hidden" />
          <SortTh bind:sort key="total" label="Tokens" class="num" />
          <SortTh bind:sort key="cost" label="Cost" class="num" />
        </tr></thead>
        <tbody>
          {#each rows as p (p.key)}
            <tr class="row-click" tabindex="0" onclick={() => go(p)} onkeydown={e => e.key === 'Enter' && go(p)}>
              <td class="trunc max-w-[46ch] max-sm:max-w-[42vw]" title={p.cwd}>
                <span class="mr-1"><Avatar key={p.key} name={p.name} size={22} icon={p.icon} /></span>
                <strong>{p.name}</strong> {@render gitChip(p, 'git repository')} <span class="text-muted max-sm:hidden">{p.cwd}</span>
              </td>
              <td class="num">{p.sessions}</td>
              <td class="num text-ink-2 max-sm:hidden">{ago(p.last)}</td>
              <td class="num max-sm:hidden">{tok(p.usage.input + p.usage.cacheWrite)}</td>
              <td class="num">{tok(p.usage.output)}</td>
              <td class="num max-sm:hidden">{tok(p.usage.cacheRead)}</td>
              <td class="num">{tok(p.usage.total)}</td>
              <td class="num"><strong>{usd(p.usage.cost)}</strong></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
