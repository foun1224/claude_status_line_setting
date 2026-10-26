import { describe, expect, mock, test } from 'claude-code/testing'

import { describeTool, LINGER_MS, ordered, reconcile, recordTool, redact, startRow, type Rows } from '../hooks/rows'

const SURFACES = ['terminal', 'desktop'] as const
const BAND = {
  plugin: 'subagent-progress',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 20, bodyColumns: 140, scroll: { offset: 0, bodyRows: 19 }, view: {} },
} as const

const SPAWN = {
  tool_use_id: 'toolu_01',
  prompt: 'Find every subagent event in the types',
  description: 'find subagent events',
  subagentType: 'Explore',
  provider: { plugin: 'engine', tier: 'core' as const },
  parentModel: 'claude-opus-5-5',
  background: false,
  fork: false,
}

describe('rows', () => {
  test('redacts credentials from command lines', async () => {
    expect(redact('sshpass -p hunter2 ssh root@10.2.67.5')).toBe('sshpass -p *** ssh root@10.2.67.5')
    expect(redact('SSH_PASS_50="s3cr3t" ./deploy.sh')).toBe('SSH_PASS_50=*** ./deploy.sh')
    expect(describeTool('Bash', { command: 'curl -H token: abc123 x' })).toBe('$ curl -H token: *** x')
  })

  test('summarises tool calls', async () => {
    expect(describeTool('Read', { file_path: '/a/b/rows.ts' })).toBe('Read rows.ts')
    expect(describeTool('Bash', { command: 'git status\ngit diff' })).toBe('$ git status')
    expect(describeTool('mcp__pencil__get_screenshot', {})).toBe('pencil·get_screenshot')
  })

  test('nests subagents under their parent', async () => {
    let rows: Rows = { p: startRow('p', 1, { type: 'Plan' }) }
    rows = { ...rows, c: startRow('c', 2, { type: 'Explore', parentId: 'p' }), q: startRow('q', 3, {}) }
    expect(ordered(rows).map(({ row, depth }) => `${row.id}:${depth}`)).toEqual(['p:0', 'c:1', 'q:0'])
  })

  test('finished rows linger, then leave; a lagging list does not revive them', async () => {
    let rows = recordTool({}, 'a', 'Read x', 0)
    rows = { a: { ...rows.a!, state: 'done', endedAt: 100 } }
    const lagging = [{ id: 'a', description: '', type: 'Explore', status: 'running' as const }]
    expect(reconcile(rows, lagging, 200)).toBe(rows)
    expect(reconcile(rows, lagging, 100 + LINGER_MS + 1)).toEqual({})
  })
})

describe('band', () => {
  test('draws nothing while no subagent ran', async ($, on) => {
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box key="engine" />
    })
    for (const surface of SURFACES) {
      const band = await $.ui.mount({ ...BAND, surface })
      expect(await band.find({ text: 'subagents' })).toBeUndefined()
    }
  })

  test('shows a running subagent with its current action, then marks it done', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    on('agent.spawn', () => ({ model: 'claude-haiku-4-5-20251001', agentId: 'a1' }))
    on('tool.call', () => ({ result: 'ok' }) as never)
    on('turn.complete', (_$, e) => ({ text: e.answer }) as never)

    await $.agent.spawn(SPAWN)
    await $.tool.call({ tool: 'Read', file_path: '/repo/hooks/rows.ts', agentId: 'a1' } as never)
    await $.tool.call({ tool: 'Bash', command: 'sshpass -p hunter2 ssh pve-1 uptime', agentId: 'a1' } as never)
    await clock.advance(42_000)

    for (const surface of SURFACES) {
      const band = await $.ui.mount({ ...BAND, surface })
      expect(await band.find({ text: 'Explore' })).toBeDefined()
      expect(await band.find({ text: 'find subagent events' })).toBeDefined()
      expect(await band.find({ text: '2 tools' })).toBeDefined()
      expect(await band.find({ text: '$ sshpass -p *** ssh pve-1 uptime' })).toBeDefined()
      expect(await band.find({ text: 'hunter2' })).toBeUndefined()
    }

    await $.turn.complete({
      answer: 'found them',
      durationMs: 42_000,
      isAborted: false,
      turnId: 't1',
      agentId: 'a1',
      reason: 'answer',
    } as never)

    for (const surface of SURFACES) {
      const band = await $.ui.mount({ ...BAND, surface })
      expect(await band.find({ text: '✓' })).toBeDefined()
      expect(await band.find({ text: '1 done' })).toBeDefined()
    }
  })

  test('tool calls of the main loop are not counted', async ($, on) => {
    on('tool.call', () => ({ result: 'ok' }) as never)
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box key="engine" />
    })
    await $.tool.call({ tool: 'Read', file_path: '/repo/x.ts' } as never)
    const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await band.find({ text: 'subagents' })).toBeUndefined()
  })
})
