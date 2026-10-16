export async function api(path) {
  const r = await fetch(path)
  const body = await r.json()
  if (!r.ok) throw new Error(body.error || r.statusText)
  return body
}

export const q = encodeURIComponent

// #/p/<project>[/s/<dir>/<sid>]
export function route() {
  const m = location.hash.match(/^#\/p\/([^/]+)(?:\/s\/([^/]+)\/([^/]+))?/)
  return m ? { project: decodeURIComponent(m[1]), dir: m[2] && decodeURIComponent(m[2]), sid: m[3] && decodeURIComponent(m[3]) } : {}
}
export const projectName = key => key.replace(/^dir:/, '').split('/').pop()
