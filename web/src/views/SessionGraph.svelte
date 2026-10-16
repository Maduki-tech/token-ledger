<script>
  // A project's sessions as a 3D node graph: project → git branch → session, node size = cost.
  import { q } from '../lib/api.js'
  import { ago, tok, usd } from '../lib/format.js'
  import { THREE, label, stage, still } from '../lib/stage.js'

  let { list, project, name } = $props()

  const MAX = 80, LABELS = 5, BRANCH_LABELS = 3, CENTER = new THREE.Vector3(0, 7, 0)
  const shown = $derived([...list].sort((a, b) => b.usage.cost - a.usage.cost).slice(0, MAX))
  const href = s => `#/p/${q(project)}/s/${q(s.dir)}/${q(s.id)}`

  let box = $state()
  let failed = $state(false)
  let world = null

  function build() {
    const sphere = new THREE.SphereGeometry(1, 32, 16), octa = new THREE.OctahedronGeometry(1), ico = new THREE.IcosahedronGeometry(1, 1)
    const nodes = new Map() // key -> { key, kind, mesh, label, pos, vel, r, cur, born, rank, recent, parent }
    let hot = null

    // edges and the pulses that run along them, hub → branch → session
    const MAXE = MAX + 40
    const edgeGeo = new THREE.BufferGeometry()
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXE * 6), 3))
    const edges = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55 }))
    const pulseGeo = new THREE.BufferGeometry()
    pulseGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXE * 2 * 3), 3))
    const pulses = new THREE.Points(pulseGeo, new THREE.PointsMaterial({ size: 0.22, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false }))
    const phase = Float32Array.from({ length: MAXE * 2 }, () => Math.random())

    const COLOR = { hub: 's7', branch: 's3', session: 's1' }
    function tint(n) {
      const p = s.palette, on = n.key === hot, c = on ? p.s2 : p[COLOR[n.kind]]
      n.mesh.material.color = c
      n.mesh.material.emissive = c
      // recent sessions glow brighter
      n.mesh.material.emissiveIntensity = on ? 0.8 : !p.dark ? 0.08 : n.kind === 'session' ? 0.15 + 0.5 * n.recent : 0.45
      n.label.element.classList.toggle('hot', on)
    }
    const hover = k => { hot = k; for (const n of nodes.values()) tint(n) }

    function node(key, kind) {
      let n = nodes.get(key)
      if (n) return n
      const geo = kind === 'hub' ? ico : kind === 'branch' ? octa : sphere
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ metalness: 0.4, roughness: 0.25, flatShading: kind !== 'session' }))
      mesh.castShadow = true
      mesh.userData.key = kind === 'session' ? key : null
      if (kind === 'hub') mesh.add(new THREE.LineSegments(new THREE.WireframeGeometry(ico), new THREE.LineBasicMaterial({ transparent: true, opacity: 0.35 })))
      // new nodes start near the centre and fly out
      const pos = CENTER.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(kind === 'hub' ? 0 : 1.5))
      n = { key, kind, mesh, label: label('', ''), pos, vel: new THREE.Vector3(), r: 0.5, cur: 0.001,
        born: performance.now() + nodes.size * 40, rank: 0, recent: 0, parent: null }
      s.scene.add(mesh, n.label)
      nodes.set(key, n)
      return n
    }

    // one step of a small force layout: nodes push apart, edges pull to length, all drift to the centre
    const d = new THREE.Vector3()
    let heat = 1 // cools to 0 so the graph comes to rest and nodes are easy to click; new nodes reheat it
    function settle(dt) {
      const all = [...nodes.values()]
      for (let i = 0; i < all.length; i++) {
        const a = all[i]
        for (let j = i + 1; j < all.length; j++) {
          const b = all[j]
          d.subVectors(a.pos, b.pos)
          const dist2 = Math.max(d.lengthSq(), 0.04)
          d.normalize().multiplyScalar((6 * (a.r + b.r + 0.6)) / dist2 * dt)
          a.vel.add(d)
          b.vel.sub(d)
        }
        if (a.parent) {
          const p = a.parent
          d.subVectors(p.pos, a.pos)
          const len = d.length() || 1e-3
          d.multiplyScalar(((len - (a.r + p.r + 2.2)) / len) * 4 * dt)
          a.vel.add(d)
          p.vel.sub(d.multiplyScalar(0.3))
        }
        a.vel.add(d.subVectors(CENTER, a.pos).multiplyScalar(0.25 * dt))
      }
      for (const n of all) {
        if (n.kind === 'hub') { n.pos.copy(CENTER); n.vel.set(0, 0, 0); continue }
        n.vel.multiplyScalar(0.9)
        n.pos.addScaledVector(n.vel, dt * 6 * heat)
        n.pos.y = Math.max(n.pos.y, n.r + 0.2) // stay above the floor
      }
    }

    const s = stage(box, {
      pickables: () => [...nodes.values()].filter(n => n.kind === 'session').map(n => n.mesh),
      hover,
      click: k => { const n = nodes.get(k); if (n?.session) location.hash = href(n.session) },
      paint: p => {
        nodes.forEach(tint)
        edges.material.color = p.s1.clone().multiplyScalar(p.dark ? 1.4 : 0.8)
        pulses.material.color = p.s4.clone().multiplyScalar(p.dark ? 3 : 1)
      },
      tick(now, dt) {
        if (!still && heat > 0.002) { settle(dt); heat *= 0.985 }
        let e = 0
        const ep = edgeGeo.attributes.position.array, pp = pulseGeo.attributes.position.array
        for (const n of nodes.values()) {
          n.cur = still ? 1 : now > n.born ? n.cur + (1 - n.cur) * Math.min(1, dt * 4) : n.cur
          n.mesh.position.copy(n.pos)
          n.mesh.scale.setScalar(n.r * n.cur)
          if (n.kind !== 'session') n.mesh.rotation.y += dt * (n.kind === 'hub' ? 0.4 : 0.8)
          n.label.position.set(n.pos.x, n.pos.y + n.r * n.cur + 0.15, n.pos.z)
          n.label.visible = n.kind === 'hub' || n.key === hot || n.rank < (n.kind === 'branch' ? BRANCH_LABELS : LABELS)
          if (!n.parent || e >= MAXE) continue
          const a = n.parent.pos, b = n.pos
          ep.set([a.x, a.y, a.z, b.x, b.y, b.z], e * 6)
          // money flows outward: two pulses per edge, hub to leaf
          for (let k = 0; k < 2; k++) {
            const i = e * 2 + k
            if (!still) phase[i] = (phase[i] + dt * 0.35) % 1
            pp.set([a.x + (b.x - a.x) * phase[i], a.y + (b.y - a.y) * phase[i], a.z + (b.z - a.z) * phase[i]], i * 3)
          }
          e++
        }
        edgeGeo.setDrawRange(0, e * 2)
        pulseGeo.setDrawRange(0, e * 2)
        edgeGeo.attributes.position.needsUpdate = pulseGeo.attributes.position.needsUpdate = true
      },
    })
    if (!s) return null
    s.scene.add(edges, pulses)
    s.camera.position.set(22, 17, 22)
    s.controls.target.copy(CENTER)

    function sync(ss, projectName) {
      const before = new Set(nodes.keys())
      const top = Math.max(...ss.map(x => x.usage.cost), 1e-9)
      const total = ss.reduce((a, x) => a + x.usage.cost, 0)
      // a branch earns its own node once two sessions share it; a lone session hangs off the project
      const by = Map.groupBy(ss, x => x.branch || '')
      const branches = new Map([...by].filter(([b, xs]) => b && xs.length > 1)
        .map(([b, xs]) => [b, xs.reduce((a, x) => a + x.usage.cost, 0)]).sort((a, b) => b[1] - a[1]))
      const ends = ss.map(x => x.end).sort((a, b) => b - a)

      const hub = node('hub', 'hub')
      hub.r = 1.4
      hub.label.set(projectName, usd(total))
      const keep = new Set(['hub'])
      ;[...branches].forEach(([b, cost], i) => {
        const n = node('b:' + b, 'branch')
        n.rank = i
        n.r = 0.45 + 0.5 * Math.sqrt(cost / Math.max(total, 1e-9))
        n.parent = hub
        n.label.set(b, usd(cost))
        keep.add(n.key)
      })
      ss.forEach((x, i) => {
        const n = node(`s:${x.dir}/${x.id}`, 'session')
        n.session = x
        n.r = 0.22 + 0.9 * Math.sqrt(x.usage.cost / top) // area tracks cost
        n.parent = branches.has(x.branch) ? nodes.get('b:' + x.branch) : hub
        n.rank = i
        n.recent = 1 - ends.indexOf(x.end) / Math.max(1, ends.length - 1)
        n.label.set(x.title || x.id, `${usd(x.usage.cost)} · ${ago(x.end)}`)
        keep.add(n.key)
      })
      if (before.size !== keep.size || [...keep].some(k => !before.has(k))) heat = Math.max(heat, 0.6)
      for (const [k, n] of nodes) {
        if (keep.has(k)) continue
        s.scene.remove(n.mesh, n.label)
        n.mesh.material.dispose()
        nodes.delete(k)
      }
      for (const n of nodes.values()) tint(n)
      // reduced motion: lay the graph out once, then hold it still
      if (still) for (let i = 0; i < 400; i++) settle(0.03)
    }

    return { sync, hover, destroy: s.destroy }
  }

  $effect(() => {
    world = build()
    failed = !world
    return () => { world?.destroy(); world = null }
  })
  $effect(() => { world?.sync(shown, name) })
</script>

{#if failed}
  <div class="empty">3D needs WebGL, which this browser has turned off. The list shows the same numbers.</div>
{:else}
  <div class="relative h-[560px] overflow-hidden rounded-[10px]" bind:this={box}></div>
  <!-- keyboard and screen readers: the sessions as links; focus lights the node up -->
  <ul class="sr-only">
    {#each shown as x (x.dir + x.id)}
      <li><a href={href(x)} onfocus={() => world?.hover(`s:${x.dir}/${x.id}`)} onblur={() => world?.hover(null)}>
        {x.title || x.id}: {usd(x.usage.cost)}, {tok(x.usage.total)} tokens, {ago(x.end)}</a></li>
    {/each}
  </ul>
  <div class="mt-2 text-xs text-muted">
    Project → branch → session · size is cost, glow is recency · drag to orbit, scroll to zoom · click a session to open{list.length > MAX ? ` · top ${MAX} of ${list.length} by cost` : ''}
  </div>
{/if}
