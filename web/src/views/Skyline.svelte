<script>
  // Projects as a lit 3D skyline: one tower per project, height = cost.
  import { q } from '../lib/api.js'
  import { tok, usd } from '../lib/format.js'
  import { THREE, label, stage, still } from '../lib/stage.js'

  let { rows } = $props()

  const MAX = 36, GAP = 2.4, W = 1.4, TALL = 7, LABELS = 6
  const shown = $derived(rows.slice(0, MAX))

  let box = $state()
  let failed = $state(false)
  let world = null // the live scene: built once, then fed rows by sync()

  function build() {
    const boxGeo = new THREE.BoxGeometry(W, 1, W).translate(0, 0.5, 0)
    const edgeGeo = new THREE.EdgesGeometry(boxGeo)
    const towers = new Map() // project key -> { mesh, edges, label, cur, target, rank, born }
    let hot = null

    function tint(t) {
      const p = s.palette, on = t.key === hot, c = on ? p.s2 : p.s1
      t.mesh.material.color = c
      t.mesh.material.emissive = c
      t.mesh.material.emissiveIntensity = on ? 0.55 : p.dark ? 0.3 : 0.05
      t.edges.material.color = c.clone().multiplyScalar(p.dark ? 2.2 : 0.7)
      t.label.element.classList.toggle('hot', on)
    }
    const hover = k => { hot = k; for (const t of towers.values()) tint(t) }

    const s = stage(box, {
      pickables: () => [...towers.values()].map(t => t.mesh),
      hover,
      click: k => (location.hash = `#/p/${q(k)}`),
      paint: () => towers.forEach(tint),
      tick(now, dt) {
        for (const t of towers.values()) {
          if (still) t.cur = t.target
          else if (now > t.born) t.cur += (t.target - t.cur) * Math.min(1, dt * 3.5)
          t.mesh.scale.y = t.cur
          t.label.position.set(t.mesh.position.x, t.cur + 0.3, t.mesh.position.z)
          t.label.visible = t.rank < LABELS || t.key === hot
        }
      },
    })
    if (!s) return null

    let framed = false
    function sync(list) {
      const top = Math.max(...list.map(p => p.usage.cost), 1e-9)
      const cols = Math.ceil(Math.sqrt(list.length)) || 1, nrows = Math.ceil(list.length / cols)
      const keep = new Set(list.map(p => p.key))
      for (const [key, t] of towers) {
        if (keep.has(key)) continue
        s.scene.remove(t.mesh, t.label)
        t.mesh.material.dispose()
        t.edges.material.dispose()
        towers.delete(key)
      }
      list.forEach((p, i) => {
        let t = towers.get(p.key)
        if (!t) {
          const mesh = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ metalness: 0.35, roughness: 0.3 }))
          mesh.castShadow = mesh.receiveShadow = true
          mesh.userData.key = p.key
          const edges = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial())
          mesh.add(edges)
          t = { key: p.key, mesh, edges, label: label('', ''), cur: 0.001, born: performance.now() + i * 70 }
          s.scene.add(mesh, t.label)
          towers.set(p.key, t)
        }
        t.target = Math.max(0.08, (p.usage.cost / top) * TALL)
        t.rank = i
        t.mesh.position.set((i % cols - (cols - 1) / 2) * GAP, 0, (Math.floor(i / cols) - (nrows - 1) / 2) * GAP)
        t.label.set(p.name, usd(p.usage.cost))
        tint(t)
      })
      // frame the city once; later refreshes leave the camera where you put it
      if (!framed && list.length) {
        const span = cols * GAP
        s.camera.position.set(span + 7, span * 0.7 + 8, span + 7)
        s.controls.target.set(0, TALL * 0.4, 0)
        framed = true
      }
    }

    return { sync, hover, destroy: s.destroy }
  }

  $effect(() => {
    world = build()
    failed = !world
    return () => { world?.destroy(); world = null }
  })
  // live refreshes regrow the towers in place
  $effect(() => { world?.sync(shown) })
</script>

{#if failed}
  <div class="empty">3D needs WebGL, which this browser has turned off. List and Grid show the same numbers.</div>
{:else}
  <div class="relative h-[520px] overflow-hidden rounded-[10px]" bind:this={box}></div>
  <!-- keyboard and screen readers: the towers as links; focus lights the tower up -->
  <ul class="sr-only">
    {#each shown as p (p.key)}
      <li><a href="#/p/{q(p.key)}" onfocus={() => world?.hover(p.key)} onblur={() => world?.hover(null)}>
        {p.name}: {usd(p.usage.cost)}, {tok(p.usage.total)} tokens</a></li>
    {/each}
  </ul>
  <div class="mt-2 text-xs text-muted">
    Height is cost · drag to orbit, scroll to zoom · click a tower to open{rows.length > MAX ? ` · top ${MAX} of ${rows.length}` : ''}
  </div>
{/if}
