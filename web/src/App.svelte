<script>
  import { onMount, tick } from 'svelte'

  import Avatar from './components/Avatar.svelte'
  import Seg from './components/Seg.svelte'
  import { api, projectName, q, route } from './lib/api.js'
  import { WINDOWS, ago, store } from './lib/format.js'
  import { iconOf } from './lib/icons.svelte.js'
  import Projects from './views/Projects.svelte'
  import Session from './views/Session.svelte'
  import Sessions from './views/Sessions.svelte'

  const saved = Number(store.get('hours'))
  let hours = $state(WINDOWS.some(w => w[0] === saved) ? saved : 24)
  let r = $state(route())
  let view = $state(null) // what the page shows now: { kind, data, project, dir, sid }
  let error = $state('')
  let live = $state(true)
  let agoText = $state('live')
  let stamp = 0
  let pulses = $state(0)
  let seq = 0 // only the latest load lands

  async function load(top = false) {
    const { project, dir, sid } = r
    const n = ++seq
    try {
      const v = sid
        ? { kind: 'session', data: await api(`/api/session?dir=${q(dir)}&sid=${q(sid)}`) }
        : project
          ? { kind: 'sessions', data: await api(`/api/sessions?project=${q(project)}&h=${hours}`) }
          : { kind: 'projects', data: await api(`/api/projects?h=${hours}`) }
      if (n !== seq) return
      if (v.kind === 'projects') for (const p of v.data) iconOf[p.key] = p.icon
      view = { ...v, project, dir, sid }
      error = ''
    } catch (err) {
      if (n === seq) error = err.message
    }
    // live refreshes keep your place; navigation starts at the top
    if (top) { await tick(); scrollTo(0, 0) }
  }

  // live: re-fetch when any transcript was written (each tool call, each reply)
  async function poll() {
    try {
      const { stamp: s } = await api('/api/stamp')
      live = true
      if (s !== stamp) {
        const first = stamp === 0
        stamp = s
        if (!first) { await load(); pulses++ }
      }
      agoText = 'live · ' + ago(stamp)
    } catch {
      live = false
      agoText = 'server stopped'
    }
  }

  function toggleTheme() {
    const dark = getComputedStyle(document.documentElement).colorScheme === 'dark'
    document.documentElement.dataset.theme = dark ? 'light' : 'dark'
    store.set('theme', document.documentElement.dataset.theme)
  }

  onMount(() => {
    if (store.get('theme')) document.documentElement.dataset.theme = store.get('theme')
    const onHash = () => { r = route(); load(true) }
    addEventListener('hashchange', onHash)
    load()
    poll()
    const timer = setInterval(poll, 2000)
    return () => { removeEventListener('hashchange', onHash); clearInterval(timer) }
  })

  const name = $derived(r.project && projectName(r.project))
</script>

<header class="sticky top-0 z-5 border-b border-ring bg-page">
  <div class="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-4 py-3">
    <span class="font-[650] tracking-[-0.01em]">Token Ledger</span>
    <nav class="flex min-w-0 items-center gap-1.5 text-ink-2">
      <a class="hover:underline" href="#/">All projects</a>
      {#if r.project}
        › <Avatar key={r.project} {name} size={18} />
        {#if r.sid}
          <a class="hover:underline" href="#/p/{q(r.project)}">{name}</a>
          › <span class="trunc max-w-[40ch] text-ink">{(view?.sid === r.sid && view.data.title) || r.sid}</span>
        {:else}
          <span class="trunc max-w-[40ch] text-ink">{name}</span>
        {/if}
      {/if}
    </nav>
    <span class="flex-1"></span>
    <div style:visibility={r.sid ? 'hidden' : 'visible'}>
      <Seg options={WINDOWS} bind:value={hours} label="Time window" onchange={h => { store.set('hours', h); load() }} />
    </div>
    <span class="inline-flex items-center gap-1.5 text-sm text-muted" title="Refreshes whenever a transcript changes">
      {#key pulses}<span class="size-2 rounded-full {live ? 'bg-good' : 'bg-critical'}" class:pulse={pulses > 0}></span>{/key}
      <span>{agoText}</span>
    </span>
    <button class="toggle" aria-label="Toggle dark mode" onclick={toggleTheme}>◐</button>
  </div>
</header>

<main class="mx-auto grid max-w-[1280px] gap-4 p-4">
  {#if error}
    <div class="card font-semibold text-critical">{error}</div>
  {:else if !view}
    <div class="empty">Loading…</div>
  {:else if view.kind === 'projects'}
    <Projects list={view.data} {hours} />
  {:else if view.kind === 'sessions'}
    {#key view.project}<Sessions list={view.data} project={view.project} {hours} />{/key}
  {:else}
    {#key view.sid}<Session s={view.data} />{/key}
  {/if}
</main>

<style>
  .pulse { animation: pulse 0.9s ease-out; }
  @keyframes pulse {
    from { box-shadow: 0 0 0 0 color-mix(in srgb, var(--good) 60%, transparent); }
    to { box-shadow: 0 0 0 8px transparent; }
  }
  @media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
</style>
