export const tok = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n)
export const usd = n => '$' + n.toFixed(n > 0 && n < 0.1 ? 3 : 2)
export const dur = s => s < 1 ? Math.round(s * 1000) + 'ms' : s < 60 ? s.toFixed(s < 10 ? 1 : 0) + 's' : s < 3600 ? Math.round(s / 60) + 'm' : Math.floor(s / 3600) + 'h ' + Math.round((s % 3600) / 60) + 'm'
export const ago = t => { const s = Date.now() / 1000 - t; return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + 'm ago' : s < 86400 ? Math.round(s / 3600) + 'h ago' : Math.round(s / 86400) + 'd ago' }
export const when = t => new Date(t * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
export const short = models => (models || []).map(m => m.replace(/^claude-/, '')).join(', ') || '–'
export const pretty = s => { try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s } }

export const WINDOWS = [[24, '24h'], [72, '3d'], [168, '7d'], [720, '30d']]
export const windowLabel = h => WINDOWS.find(w => w[0] === h)[1]

// Tool families in fixed categorical order; everything else folds into "other".
export const FAMILIES = [
  ['read', 'var(--s1)', ['Read', 'Grep', 'Glob', 'LS', 'NotebookRead']],
  ['write', 'var(--s2)', ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']],
  ['shell', 'var(--s3)', ['Bash', 'BashOutput', 'KillShell', 'Monitor']],
  ['agent', 'var(--s4)', ['Agent', 'Task', 'SendMessage']],
  ['skill', 'var(--s5)', ['Skill', 'ToolSearch']],
  ['web', 'var(--s7)', ['WebFetch', 'WebSearch']],
]
export const family = tool => {
  if (tool.startsWith('mcp__')) return ['mcp', 'var(--s7)']
  const f = FAMILIES.find(([, , tools]) => tools.includes(tool))
  return f ? [f[0], f[1]] : ['other', 'var(--other)']
}

export const sortRows = (rows, sort, get) => [...rows].sort((a, b) => {
  const x = get(a, sort.key), y = get(b, sort.key)
  return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sort.dir
})
// clicking the sorted column flips it; a new column starts descending
export const toggleSort = (sort, key) => ({ key, dir: sort.key === key ? -sort.dir : -1 })

export const store = {
  get: k => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch {} },
}
