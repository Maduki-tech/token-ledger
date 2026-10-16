// The three.js stage both 3D views share: renderer, camera, lights, bloom, sparks, theme, picking, the frame loop.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'

export { THREE }
export const still = matchMedia('(prefers-reduced-motion: reduce)').matches

const css = name => new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim())

// A label that floats over a point: name on top, value under it.
export function label(name, value) {
  const el = document.createElement('div')
  el.className = 'sky-label'
  const obj = new CSS2DObject(el)
  obj.center.set(0.5, 1)
  obj.set = (n, v) => el.replaceChildren(Object.assign(document.createElement('strong'), { textContent: n }),
    document.createElement('br'), Object.assign(document.createElement('span'), { textContent: v }))
  obj.set(name, value)
  return obj
}

/**
 * Mounts a scene in `box`; null when WebGL is off. Callbacks:
 * pickables() meshes with userData.key, hover(key|null), click(key), paint(palette) on theme change, tick(now, dt) per frame.
 */
export function stage(box, { floor = true, pickables, hover, click, paint, tick }) {
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true })
  } catch {
    return null
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  const canvas = renderer.domElement
  canvas.style.cursor = 'grab'
  box.append(canvas)

  const labels = new CSS2DRenderer()
  labels.domElement.className = 'pointer-events-none absolute inset-0'
  box.append(labels.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300)
  const controls = new OrbitControls(camera, canvas)
  Object.assign(controls, { enableDamping: true, enablePan: false, autoRotate: !still, autoRotateSpeed: 0.7,
    minDistance: 4, maxDistance: 80, maxPolarAngle: floor ? Math.PI / 2.15 : Math.PI })
  controls.addEventListener('start', () => (controls.autoRotate = false))

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.1))
  const sun = new THREE.DirectionalLight(0xffffff, 2.4)
  sun.position.set(10, 20, 8)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, far: 80 })
  sun.shadow.radius = 4
  scene.add(sun)
  // a coloured light circling the scene, for moving highlights
  const orbit = new THREE.PointLight(0xffffff, 60, 30)
  scene.add(orbit)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.1 }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  const grid = new THREE.GridHelper(120, 100)
  grid.material.transparent = true
  grid.position.y = 0.01
  if (floor) scene.add(ground, grid)

  // sparks drifting up through the scene
  const N = 500, sparkPos = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) sparkPos.set([(Math.random() - 0.5) * 40, Math.random() * 16, (Math.random() - 0.5) * 40], i * 3)
  const sparkGeo = new THREE.BufferGeometry()
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3))
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.07, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false }))
  scene.add(sparks)

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.2, 0.6, 0.3)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  const palette = {}
  function repaint() {
    const dark = getComputedStyle(document.documentElement).colorScheme === 'dark'
    for (const k of ['s1', 's2', 's3', 's4', 's7', 'page', 'grid', 'ink']) palette[k] = css('--' + k)
    palette.dark = dark
    scene.background = palette.page
    scene.fog = new THREE.Fog(palette.page, 30, 90)
    ground.material.color = palette.page
    grid.material.color = palette.grid
    grid.material.opacity = dark ? 0.6 : 0.9
    orbit.color = palette.s1
    sparks.material.color = palette.s1
    sparks.visible = dark
    // on a light page everything is above the bloom threshold: it would wash the scene out
    bloom.enabled = dark
    paint?.(palette)
  }

  // hover and click by ray; a drag is not a click
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2()
  let downAt = null, hot = null
  const pick = e => {
    const r = canvas.getBoundingClientRect()
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ptr, camera)
    return ray.intersectObjects(pickables(), false)[0]?.object.userData.key ?? null
  }
  const setHot = k => { if (k !== hot) { hot = k; hover?.(k) } }
  const onMove = e => {
    const k = pick(e)
    setHot(k)
    canvas.style.cursor = k ? 'pointer' : 'grab'
  }
  const onLeave = () => setHot(null)
  const onDown = e => (downAt = [e.clientX, e.clientY])
  const onUp = e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return
    const k = pick(e)
    if (k) click?.(k)
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerup', onUp)

  const size = () => {
    const { clientWidth: w, clientHeight: h } = box
    if (!w || !h) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    composer.setSize(w, h)
    labels.setSize(w, h)
  }
  const ro = new ResizeObserver(size)
  ro.observe(box)
  size()

  // the theme toggle and the system theme both repaint
  const mo = new MutationObserver(repaint)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const mq = matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', repaint)
  repaint()

  let raf, last = performance.now()
  const frame = now => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    tick?.(now, dt)
    if (!still) {
      const a = now / 4000
      orbit.position.set(Math.cos(a) * 12, 6, Math.sin(a) * 12)
      const p = sparkGeo.attributes.position
      for (let i = 0; i < N; i++) p.array[i * 3 + 1] = (p.array[i * 3 + 1] + dt * (0.3 + (i % 7) * 0.08)) % 16
      p.needsUpdate = true
    }
    controls.update()
    composer.render()
    labels.render(scene, camera)
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  return {
    scene,
    camera,
    controls,
    palette,
    destroy() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      mo.disconnect()
      mq.removeEventListener('change', repaint)
      controls.dispose()
      // every geometry and material the views added lives in the scene; a shared one disposes twice, harmlessly
      for (const o of [...scene.children, ground, grid]) o.traverse(x => { x.geometry?.dispose(); x.material?.dispose() })
      composer.dispose()
      renderer.dispose()
      box.replaceChildren()
    },
  }
}
