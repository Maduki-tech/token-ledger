<script>
  // Project badge: its own icon when it has one, else initials on a colour fixed by its name.
  import { iconOf } from '../lib/icons.svelte.js'

  let { key, name, size, icon = undefined } = $props()

  const MONO = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s7']
  const initials = name => {
    const words = name.match(/[A-Za-z0-9]+/g) || ['?']
    const lettered = words.filter(w => /^[A-Za-z]/.test(w)) // skip dates and hashes
    return (lettered.length ? lettered : words).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  }
  const hue = name => {
    let h = 0
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    return `var(${MONO[h % MONO.length]})`
  }
  const tryIcon = $derived(iconOf[key] !== false && (icon ?? iconOf[key]) !== false)
  const c = $derived(hue(name))
  const box = $derived(`width:${size}px;height:${size}px;border-radius:${size * 0.26}px`)
</script>

{#if tryIcon}
  <span class="inline-grid flex-none place-items-center overflow-hidden bg-surface align-middle shadow-[inset_0_0_0_1px_var(--ring)]" style={box} aria-hidden="true">
    <img class="size-full object-contain p-[12%]" src="/api/icon?project={encodeURIComponent(key)}" alt="" loading="lazy" onerror={() => (iconOf[key] = false)}>
  </span>
{:else}
  <span class="inline-grid flex-none place-items-center overflow-hidden align-middle leading-none font-[650] tracking-[-0.02em] text-ink" aria-hidden="true"
    style="{box};font-size:{size * 0.4}px;background:color-mix(in srgb, {c} 22%, var(--surface));box-shadow:inset 0 0 0 1px color-mix(in srgb, {c} 45%, transparent)">{initials(name)}</span>
{/if}
