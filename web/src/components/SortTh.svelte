<script>
  import { toggleSort } from '../lib/format.js'

  let { key, label, sort = $bindable(), class: cls = '' } = $props()
  const on = $derived(sort.key === key)
</script>

<th class="cursor-pointer hover:text-ink {cls}" aria-sort={on ? (sort.dir < 0 ? 'descending' : 'ascending') : 'none'}
  onclick={() => (sort = toggleSort(sort, key))}>{label}{on ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}</th>
