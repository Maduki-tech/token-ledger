import { expect, mock, test } from 'claude-code/testing'

import { lane } from '../hooks/register'

const usage = (cost: number, total: number) => ({
  input: 1, output: 2, cacheWrite: 3, cacheRead: total - 6, total, cost, requests: 4,
})

// What scripts/usage.py prints, per argv[2]
const ANSWERS: Record<string, unknown> = {
  projects: [{ key: '/x/shop', name: 'shop', cwd: '/x/shop', isGit: true, folders: 2, sessions: 2, last: 100, usage: usage(12.5, 3_400_000) }],
  sessions: [{ id: 'sid1', dir: '-x-shop', title: 'Fix checkout', cwd: '/x/shop', branch: 'main', start: 0, end: 100, tools: 3, models: ['claude-opus-5-5'], usage: usage(12.5, 3_400_000) }],
  session: {
    id: 'sid1', title: 'Fix checkout', prompt: 'fix it', cwd: '/x/shop', branch: 'main', start: 0, end: 100,
    usage: usage(12.5, 3_400_000), errors: 1,
    models: [{ model: 'claude-opus-5-5', ...usage(12.5, 3_400_000) }],
    agents: [
      { id: 'main', type: 'main', description: '', start: 0, end: 100, tools: 2, usage: usage(10, 3_000_000) },
      { id: 'a1', type: 'Explore', description: 'find the bug', models: ['claude-haiku-5-5'], start: 10, end: 50, tools: 1, usage: usage(2.5, 400_000) },
    ],
    toolCounts: [['Bash', 2], ['Agent', 1]],
    toolCost: 0.5,
    breakdown: [{ key: 'tools', label: 'Tool calls of the main agent', cost: 10 }, { key: 'start', label: 'Starting context', cost: 2.5 }],
    toolStats: [{ tool: 'Bash', n: 2, outTok: 10, resultTok: 900, carryTok: 1800, cost: 0.4 }, { tool: 'Agent', n: 1, outTok: 5, resultTok: 20, carryTok: 0, cost: 0.1 }],
    skills: [['tdd', 1]],
    calls: [
      { id: 't1', ts: 5, tool: 'Agent', target: 'find the bug', agent: 'main', error: false, ms: 40000, subagent: 'Explore' },
      { id: 't2', ts: 20, tool: 'Bash', target: 'grep checkout', agent: 'a1', error: true, ms: 100 },
      { id: 't3', ts: 90, tool: 'Bash', target: 'bun test', agent: 'main', error: false, ms: 3000 },
    ],
  },
}

const PANE = {
  title: 'Tokens', isFocused: true, bodyColumns: 90, placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 }, view: {},
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`walks projects → sessions → session on ${surface}`, async ($, on) => {
    mock.clock(on, { now: 200_000 })
    on('process.run', ($, e) => ({
      value: {
        exitCode: 0,
        stdout: JSON.stringify(ANSWERS[e.argv[2] ?? '']),
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }))
    const ui = await $.ui.mount({
      plugin: 'token-ledger', surface, component: 'Pane', props: PANE, requestId: 'token-ledger',
    })
    expect(await ui.find({ text: 'Reading transcripts' })).toBeDefined()

    await ui.press({ key: 'w168' })
    expect(await ui.find({ text: /\$12\.50 · 3\.4M tokens · 1 projects/ })).toBeDefined()

    await ui.press({ key: 'p:/x/shop' })
    expect(await ui.find({ key: 's:sid1' })).toBeDefined()

    await ui.press({ key: 's:sid1' })
    expect(await ui.find({ text: 'Timeline' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\$2\.50.*20%.*Starting context/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Cost by tool · all agents · \$0\.50/ })).toBeDefined()
    expect(await ui.find({ text: /tdd ×1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Explore.*haiku-5-5.*find the bug/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Bash.*grep checkout/ })).toBeDefined()

    await ui.press({ key: '← back' })
    expect(await ui.find({ key: 's:sid1' })).toBeDefined()
  })

  test(`shows the script's error on ${surface}`, async ($, on) => {
    mock.clock(on)
    on('process.run', () => ({
      value: {
        exitCode: 1, stdout: '', stderr: 'Traceback\nKeyError: boom',
        isStdoutTruncated: false, isStderrTruncated: false,
      },
    }))
    const ui = await $.ui.mount({
      plugin: 'token-ledger', surface, component: 'Pane', props: PANE, requestId: 'token-ledger',
    })
    await ui.press({ key: 'refresh' })
    expect(await ui.find({ text: 'KeyError: boom' })).toBeDefined()
  })
}

test('lane marks the active span and each call', () => {
  expect(lane(0, 50, [0, 50], 0, 100, 10)).toBe('█────█    ')
  expect(lane(90, 100, [], 0, 100, 10)).toBe('         ─')
})

test('/tokens web starts the server and opens the browser', async ($, on) => {
  mock.clock(on)
  const runs: string[][] = []
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: '[]', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  const result = await $.command.run({
    command: 'tokens', args: 'web', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 },
  })
  expect(JSON.stringify(result)).toContain('http://127.0.0.1:4610')
  expect(runs).toHaveLength(1)
  expect(runs[0]?.[3]).toMatch(/scripts\/server\.py$/)
  expect(runs[0]?.[2]).toContain('xdg-open')
})
