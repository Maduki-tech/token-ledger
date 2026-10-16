// Active stretches keep their real proportions; idle gaps over IDLE collapse to a fixed sliver,
// so a session resumed days later still shows its work.
const IDLE = 300
export const GAP = 3 // % width per collapsed gap

export function timeMap(s, [from, to] = [s.start, s.end]) {
  const ts = s.calls.flatMap(c => [c.ts, c.ts + c.ms / 1000]).concat(s.agents.flatMap(a => [a.start, a.end]), [from, to]).filter(t => t && t >= from && t <= to).sort((a, b) => a - b)
  const segs = [[ts[0], ts[0]]]
  for (const t of ts) { const last = segs[segs.length - 1]; if (t - last[1] > IDLE) segs.push([t, t]); else last[1] = t }
  const active = segs.reduce((a, [x, y]) => a + Math.max(y - x, 1), 0)
  const room = 100 - GAP * (segs.length - 1)
  let at = 0
  const placed = segs.map(([x, y]) => { const w = (Math.max(y - x, 1) / active) * room; const p = { x, y, left: at, w }; at += w + GAP; return p })
  const pct = t => {
    for (let i = 0; i < placed.length; i++) {
      const p = placed[i]
      if (t <= p.y || i === placed.length - 1) return t < p.x ? (i ? p.left - GAP / 2 : -100) : p.left + Math.min(1, (t - p.x) / Math.max(p.y - p.x, 1)) * p.w
    }
  }
  return { pct, placed }
}

// Most subagents running at the same moment: sweep over start/end events.
export function maxParallel(agents) {
  const ev = agents.flatMap(a => [[a.start, 1], [a.end, -1]]).sort((x, y) => x[0] - y[0] || x[1] - y[1])
  let now = 0, peak = 0
  for (const [, d] of ev) peak = Math.max(peak, (now += d))
  return peak
}
