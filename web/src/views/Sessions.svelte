<script>
  import Avatar from '../components/Avatar.svelte'
  import Chip from '../components/Chip.svelte'
  import Seg from '../components/Seg.svelte'
  import SortTh from '../components/SortTh.svelte'
  import Tiles from '../components/Tiles.svelte'
  import { projectName, q } from '../lib/api.js'
  import { ago, sortRows, store, tok, usd, when, windowLabel } from '../lib/format.js'
  import SessionGraph from './SessionGraph.svelte'

  let { list, project, hours } = $props()

  let sort = $state({ key: 'end', dir: -1 })
  let layout = $state(store.get('sessionsLayout') === '3d' ? '3d' : 'list')

  const get = (s, k) => k === 'title' ? s.title : k === 'end' ? s.end : k === 'tools' ? s.tools : s.usage[k]
  const rows = $derived(sortRows(list, sort, get))
  const root = $derived(project.replace(/^dir:/, ''))
  const name = $derived(projectName(project))
  const sum = f => list.reduce((a, s) => a + f(s), 0)
  const go = s => (location.hash = `#/p/${q(project)}/s/${q(s.dir)}/${q(s.id)}`)
</script>

<div class="flex items-center gap-3.5">
  <Avatar key={project} {name} size={48} />
  <div>
    <h1 class="mb-1 text-lg font-bold tracking-[-0.01em]">{name}</h1>
    <div class="font-mono text-md [overflow-wrap:anywhere] text-ink-2">{root}{project.startsWith('dir:') ? '' : ' · git'}</div>
  </div>
</div>

<Tiles items={[
  { k: 'Cost · ' + windowLabel(hours), v: usd(sum(s => s.usage.cost)) },
  { k: 'Tokens', v: tok(sum(s => s.usage.total)) },
  { k: 'Sessions', v: list.length },
  { k: 'Tool calls', v: sum(s => s.tools) },
]} />

<div class="card">
  <div class="mb-3 flex items-center gap-2">
    <h2 class="mb-0">Sessions</h2>
    <span class="flex-1"></span>
    <Seg options={[['list', 'List'], ['3d', '3D']]} bind:value={layout} label="Layout" onchange={v => store.set('sessionsLayout', v)} />
  </div>
  {#if list.length && layout === '3d'}
    <SessionGraph {list} {project} {name} />
  {:else if list.length}
    <div class="overflow-x-auto overflow-y-hidden">
      <table>
        <thead><tr>
          <SortTh bind:sort key="end" label="Last active" />
          <SortTh bind:sort key="title" label="Session" />
          <th class="max-sm:hidden">Model</th>
          <SortTh bind:sort key="tools" label="Tools" class="num" />
          <SortTh bind:sort key="total" label="Tokens" class="num" />
          <SortTh bind:sort key="cost" label="Cost" class="num" />
        </tr></thead>
        <tbody>
          {#each rows as s (s.dir + s.id)}
            <tr class="row-click" tabindex="0" onclick={() => go(s)} onkeydown={e => e.key === 'Enter' && go(s)}>
              <td class="text-ink-2" title={when(s.end)}>{ago(s.end)}</td>
              <td class="trunc max-w-[46ch] max-sm:max-w-[42vw]">
                <strong>{s.title || s.id}</strong>
                {#if s.branch}<Chip>{s.branch}</Chip>{/if}
                {#if s.cwd && s.cwd !== root}<span class="text-muted max-sm:hidden" title={s.cwd}>{s.cwd.split('/').pop()}</span>{/if}
              </td>
              <td class="font-mono text-sm text-ink-2 max-sm:hidden">{(s.models[0] || '').replace('claude-', '')}</td>
              <td class="num">{s.tools}</td>
              <td class="num">{tok(s.usage.total)}</td>
              <td class="num"><strong>{usd(s.usage.cost)}</strong></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="empty">No sessions in this window.</div>
  {/if}
</div>
