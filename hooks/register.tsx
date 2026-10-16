import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { LedgerData, LedgerView } from '../types'

const PANE = 'token-ledger'
const WINDOWS = [
  { hours: 24, label: '24h', hotkey: '1' },
  { hours: 72, label: '3d', hotkey: '2' },
  { hours: 168, label: '7d', hotkey: '3' },
  { hours: 720, label: '30d', hotkey: '4' },
]
const PAGE = 60
const WEB = 'http://127.0.0.1:4610'

const view = atom({ plugin: 'token-ledger', key: 'view' } as const, {
  screen: 'projects',
  hours: 24,
  page: 0,
} as LedgerView)
const data = atom({ plugin: 'token-ledger', key: 'data' } as const, {
  key: '',
  isLoading: false,
} as LedgerData)

// usage.py's arguments for a view; joined, the key its answer is stored under
export const argsOf = (v: LedgerView): string[] =>
  v.screen === 'projects'
    ? ['projects', String(v.hours)]
    : v.screen === 'sessions'
      ? ['sessions', v.project ?? '', String(v.hours)]
      : ['session', v.dir ?? '', v.sid ?? '']
export const keyOf = (v: LedgerView) => argsOf(v).join('\u0000')

export const fmtTokens = (n: number) =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(2)}B`
    : n >= 1e6
      ? `${(n / 1e6).toFixed(1)}M`
      : n >= 1e3
        ? `${(n / 1e3).toFixed(1)}k`
        : String(n)

export const fmtCost = (n: number) => `$${n.toFixed(2)}`

export const fmtAgo = (t: number, now: number) => {
  const s = Math.max(0, now / 1000 - t)
  return s < 3600
    ? `${Math.round(s / 60)}m ago`
    : s < 86400
      ? `${Math.round(s / 3600)}h ago`
      : `${Math.round(s / 86400)}d ago`
}

export const fmtDur = (sec: number) =>
  sec < 60
    ? `${Math.round(sec)}s`
    : sec < 3600
      ? `${Math.round(sec / 60)}m`
      : `${Math.floor(sec / 3600)}h${String(Math.round((sec % 3600) / 60)).padStart(2, '0')}`

export const bar = (part: number, whole: number, width: number) =>
  '█'.repeat(whole > 0 ? Math.round((part / whole) * width) : 0)

// One swim lane: the agent's active span across the session, its tool calls as solid cells.
export const lane = (
  start: number,
  end: number,
  calls: number[],
  t0: number,
  t1: number,
  width: number,
) => {
  const span = Math.max(1, t1 - t0)
  const cell = (t: number) =>
    Math.min(width - 1, Math.max(0, Math.floor(((t - t0) / span) * width)))
  const cells = Array.from({ length: width }, () => ' ')
  for (let i = cell(start); i <= cell(end); i++) cells[i] = '─'
  for (const t of calls) cells[cell(t)] = '█'
  return cells.join('')
}

const pad = (s: string, n: number) =>
  s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n)

async function load($: EngineInterface, v: LedgerView) {
  const key = keyOf(v)
  await update($, data, d => ({ ...d, key, isLoading: true, error: undefined }))
  const argv = [
    'python3',
    `${$.plugin.root}/scripts/usage.py`,
    ...argsOf(v),
  ]
  let next: LedgerData
  try {
    const run = await $.process.run(argv, { timeoutMs: 120_000 })
    next =
      run.exitCode === 0
        ? { key, isLoading: false, payload: JSON.parse(run.stdout) }
        : { key, isLoading: false, error: run.stderr.trim().split('\n').pop() }
  } catch (err) {
    next = { key, isLoading: false, error: String(err) }
  }
  // a later navigation owns the pane now: drop this answer
  await update($, data, d => (d.key === key ? next : d))
}

async function go($: EngineInterface, patch: Partial<LedgerView>) {
  let v = await read($, view)
  await update($, view, old => (v = { ...old, page: 0, ...patch }))
  await load($, v)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tokens',
      description: 'Token and cost overview per project and session',
      argumentHint: '[web]',
    })
    void $.ui.open({ id: PANE, title: 'Tokens' })
    void load($, await read($, view))

    return next(e)
  })

  on('command.run', { command: 'tokens' }, async ($, e) => {
    if (e.args.trim() === 'web') {
      // detached, so it outlives this session; exits by itself if one already runs
      await $.process.run([
        'sh',
        '-c',
        // setsid and xdg-open on Linux; macOS has neither: nohup and open
        'if command -v setsid >/dev/null; then setsid -f python3 "$0"; else nohup python3 "$0" & fi >/dev/null 2>&1 </dev/null;' +
          ' sleep 0.4; { xdg-open "$1" || open "$1"; } >/dev/null 2>&1 </dev/null',
        `${$.plugin.root}/scripts/server.py`,
        WEB,
      ])

      return { text: `Token ledger web view: ${WEB}` }
    }
    await $.ui.open({ id: PANE, title: 'Tokens', focus: true })
    void load($, await read($, view))

    return { text: 'Token ledger opened. Keys: 1-4 window, b back, r refresh.' }
  })

  // fresh numbers once each turn has been written to the transcript
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    void load($, await read($, view))

    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const v = await read($, view)
    const d = await read($, data)
    const cols = Math.max(40, e.props.bodyColumns ?? 80)
    const now = await $.clock.now()
    const ready = d.key === keyOf(v) && d.payload !== undefined

    const header = (
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        {v.screen !== 'projects' && (
          <Button
            hotkey="b"
            label="← back"
            onPress={() =>
              go(
                $,
                v.screen === 'session'
                  ? { screen: 'sessions', sid: undefined }
                  : { screen: 'projects', project: undefined },
              )
            }
          />
        )}
        {v.screen !== 'session' &&
          WINDOWS.map(w => (
            <Button
              key={`w${w.hours}`}
              hotkey={w.hotkey}
              label={w.label}
              variant={w.hours === v.hours ? 'primary' : 'secondary'}
              onPress={() => go($, { hours: w.hours })}
            />
          ))}
        <Button hotkey="r" label="refresh" onPress={() => load($, v)} />
        {d.isLoading && <Text dimColor>loading…</Text>}
      </Box>
    )

    if (d.error && d.key === keyOf(v)) {
      return (
        <Box flexDirection="column">
          {header}
          <Text color="error">{d.error}</Text>
        </Box>
      )
    }
    if (!ready) {
      return (
        <Box flexDirection="column">
          {header}
          <Text dimColor>Reading transcripts…</Text>
        </Box>
      )
    }

    if (v.screen === 'projects') {
      const list: any[] = d.payload
      const total = list.reduce(
        (a, p) => ({
          cost: a.cost + p.usage.cost,
          tokens: a.tokens + p.usage.total,
          sessions: a.sessions + p.sessions,
        }),
        { cost: 0, tokens: 0, sessions: 0 },
      )
      const top = list[0]?.usage.cost ?? 0
      const nameW = Math.min(28, Math.max(12, cols - 46))
      return (
        <Box flexDirection="column">
          {header}
          <Text>
            <Text bold>{fmtCost(total.cost)}</Text> ·{' '}
            {fmtTokens(total.tokens)} tokens · {list.length} projects ·{' '}
            {total.sessions} sessions
          </Text>
          <Text dimColor>
            {pad('project', nameW)} {'sess'.padStart(4)} {'tokens'.padStart(7)}{' '}
            {'cost'.padStart(8)}
          </Text>
          {list.length === 0 && <Text dimColor>No activity in this window.</Text>}
          {list.map(p => (
            <Button
              key={`p:${p.key}`}
              plain
              onPress={() =>
                go($, { screen: 'sessions', project: p.key, name: p.name })
              }
            >
              {pad(p.name, nameW)} {String(p.sessions).padStart(4)}{' '}
              {fmtTokens(p.usage.total).padStart(7)}{' '}
              {fmtCost(p.usage.cost).padStart(8)}{' '}
              <Text color="claude">{bar(p.usage.cost, top, Math.max(0, cols - nameW - 24))}</Text>
            </Button>
          ))}
        </Box>
      )
    }

    if (v.screen === 'sessions') {
      const list: any[] = d.payload
      const cost = list.reduce((a, s) => a + s.usage.cost, 0)
      const titleW = Math.max(12, cols - 38)
      return (
        <Box flexDirection="column">
          {header}
          <Text>
            <Text bold>{v.name}</Text> · {fmtCost(cost)} · {list.length}{' '}
            sessions
          </Text>
          <Text dimColor wrap="truncate">
            {v.project?.replace(/^dir:/, '')}
          </Text>
          <Text dimColor>
            {'when'.padEnd(8)} {pad('session', titleW)} {'tools'.padStart(5)}{' '}
            {'tokens'.padStart(7)} {'cost'.padStart(8)}
          </Text>
          {list.map(s => (
            <Button
              key={`s:${s.id}`}
              plain
              onPress={() => go($, { screen: 'session', dir: s.dir, sid: s.id })}
            >
              {fmtAgo(s.end, now).padEnd(8)} {pad(s.title || s.id, titleW)}{' '}
              {String(s.tools).padStart(5)}{' '}
              {fmtTokens(s.usage.total).padStart(7)}{' '}
              {fmtCost(s.usage.cost).padStart(8)}
            </Button>
          ))}
        </Box>
      )
    }

    // one session
    const s = d.payload
    const u = s.usage
    const labelW = 18
    const laneW = Math.max(10, cols - labelW - 1)
    const calls: any[] = s.calls
    const pages = Math.max(1, Math.ceil(calls.length / PAGE))
    const page = Math.min(v.page, pages - 1)
    const shown = calls.slice(page * PAGE, page * PAGE + PAGE)
    const maxCost = s.toolStats?.[0]?.cost ?? 0
    const agentName = (id: string) =>
      id === 'main'
        ? 'main'
        : (s.agents.find((a: any) => a.id === id)?.type ?? id)

    return (
      <Box flexDirection="column">
        {header}
        <Text bold wrap="truncate">
          {s.title || s.id}
        </Text>
        <Text dimColor wrap="truncate">
          {s.cwd}
          {s.branch ? ` @ ${s.branch}` : ''} · {fmtDur(s.end - s.start)} ·{' '}
          {s.id}
        </Text>
        {s.prompt && (
          <Text italic wrap="truncate">
            “{s.prompt.split('\n')[0]}”
          </Text>
        )}

        <Text> </Text>
        <Text bold>
          {fmtCost(u.cost)} · {fmtTokens(u.total)} tokens · {u.requests} requests
          · {calls.length} tool calls
          {s.errors ? ` · ${s.errors} errors` : ''}
        </Text>
        <Text dimColor>
          in {fmtTokens(u.input)} · out {fmtTokens(u.output)} · cache write{' '}
          {fmtTokens(u.cacheWrite)} · cache read {fmtTokens(u.cacheRead)}
        </Text>
        <Text> </Text>
        <Text bold>Where the cost went</Text>
        {(s.breakdown ?? []).map((b: any) => (
          <Text key={`b:${b.key}`} wrap="truncate">
            {fmtCost(b.cost).padStart(8)} {String(Math.round((b.cost / (u.cost || 1)) * 100)).padStart(3)}%{' '}
            <Text dimColor>{b.label}</Text>
          </Text>
        ))}
        <Text> </Text>
        {s.models.map((m: any) => (
          <Text key={`m:${m.model}`}>
            {pad(m.model, labelW)} {fmtTokens(m.total).padStart(7)}{' '}
            {fmtCost(m.cost).padStart(8)}
          </Text>
        ))}

        <Text> </Text>
        <Text bold>Timeline</Text>
        {s.agents.map((a: any) => (
          <Text key={`l:${a.id}`}>
            <Text color={a.id === 'main' ? 'claude' : 'suggestion'}>
              {pad(a.type, labelW)}
            </Text>{' '}
            {lane(
              a.start,
              a.end,
              calls.filter(c => c.agent === a.id).map(c => c.ts),
              s.start,
              s.end,
              laneW,
            )}
          </Text>
        ))}

        <Text> </Text>
        <Text bold>Subagents ({s.agents.length - 1})</Text>
        {s.agents.length === 1 && <Text dimColor>none</Text>}
        {s.agents
          .filter((a: any) => a.id !== 'main')
          .map((a: any) => (
            <Text key={`a:${a.id}`} wrap="truncate">
              {pad(a.type, labelW)} {pad((a.models ?? []).map((m: string) => m.replace(/^claude-/, '')).join(',') || '–', 12)}{' '}
              {fmtCost(a.usage.cost).padStart(8)}{' '}
              {fmtTokens(a.usage.total).padStart(7)} {String(a.tools).padStart(4)}{' '}
              tools · {fmtDur(a.end - a.start)} ·{' '}
              <Text dimColor>{a.description}</Text>
            </Text>
          ))}

        <Text> </Text>
        <Text bold>Skills</Text>
        <Text wrap="wrap">
          {s.skills.length
            ? s.skills.map(([k, n]: [string, number]) => `${k} ×${n}`).join('  ')
            : 'none'}
        </Text>

        <Text> </Text>
        <Text bold>
          Cost by tool · all agents · {fmtCost(s.toolCost ?? 0)}
        </Text>
        {(s.toolStats ?? []).map((st: any) => (
          <Text key={`t:${st.tool}`}>
            {pad(st.tool.replace(/^mcp__(claude_ai_)?/, ''), labelW)} {String(st.n).padStart(4)}{' '}
            {fmtCost(st.cost).padStart(8)}{' '}
            <Text color="claude">{bar(st.cost, maxCost, Math.max(0, cols - labelW - 16))}</Text>
          </Text>
        ))}

        <Text> </Text>
        <Box flexDirection="row" gap={1}>
          <Text bold>
            Tool calls {page * PAGE + 1}–{page * PAGE + shown.length} of{' '}
            {calls.length}
          </Text>
          {page > 0 && (
            <Button
              hotkey="p"
              label="prev"
              onPress={() => update($, view, o => ({ ...o, page: page - 1 }))}
            />
          )}
          {page < pages - 1 && (
            <Button
              hotkey="n"
              label="next"
              onPress={() => update($, view, o => ({ ...o, page: page + 1 }))}
            />
          )}
        </Box>
        {shown.map(c => (
          <Text key={`c:${c.id}`} wrap="truncate">
            <Text dimColor>+{fmtDur(c.ts - s.start).padStart(5)}</Text>{' '}
            <Text color={c.agent === 'main' ? 'claude' : 'suggestion'}>
              {pad(agentName(c.agent), 12)}
            </Text>{' '}
            <Text color={c.error ? 'error' : undefined} bold>
              {pad(c.tool, 10)}
            </Text>{' '}
            <Text dimColor>{c.ms ? fmtDur(c.ms / 1000).padStart(4) : '    '}</Text>{' '}
            {fmtCost(c.cost ?? 0).padStart(6)}{' '}
            {c.subagent ? `→ ${c.subagent}: ` : ''}
            {c.target}
          </Text>
        ))}
      </Box>
    )
  })
}
