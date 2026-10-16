<script>
  import { dur, short, usd } from '../lib/format.js'

  let { subs, onAgent } = $props()
</script>

<div class="card">
  <h2>Subagents · {subs.length}</h2>
  {#if subs.length}
    <div class="overflow-x-auto overflow-y-hidden">
      <table>
        <thead><tr><th>Type</th><th>Task</th><th>Model</th><th class="num">Tools</th><th class="num">Took</th><th class="num">Cost</th></tr></thead>
        <tbody>
          {#each subs as a (a.id)}
            <tr class="row-click" tabindex="0" onclick={() => onAgent(a.id)} onkeydown={e => e.key === 'Enter' && onAgent(a.id)}>
              <td><strong>{a.type}</strong></td>
              <td class="trunc max-w-[46ch] text-ink-2 max-sm:max-w-[42vw]" title={a.description}>{a.description}</td>
              <td class="font-mono text-sm text-ink-2">{short(a.models)}</td>
              <td class="num">{a.tools}</td>
              <td class="num text-ink-2">{dur(a.end - a.start)}</td>
              <td class="num"><strong>{usd(a.usage.cost)}</strong></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="empty">No subagents in this session.</div>
  {/if}
</div>
