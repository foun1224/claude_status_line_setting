// subagent-progress: a band above the prompt with one row per subagent of
// this session (nested ones indented under their parent):
//
//   subagents  2 running · 1 done
//   ⠹ Explore          find subagent events      12 tools  Read claude-code.d.ts   42s
//     └ ⠸ general-purpose  write tests            3 tools  $ claude plugin test   8s
//   ✓ Plan             design the band           31 tools                      2m10s
//
// Rows come from `agent.spawn` (start), `tool.call` inside the subagent's loop
// (count + current action) and `turn.complete` (end), reconciled every tick
// against `$.agent.list()`. Finished rows linger 10 s, then leave.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { SubagentState } from '../types'
import {
  describeTool,
  finishRow,
  formatElapsed,
  isEnded,
  ordered,
  reconcile,
  recordTool,
  startRow,
  type Rows,
} from './rows'

const agents = atom({ plugin: 'subagent-progress', key: 'agents' } as const, {} as Rows)
const clockNow = atom({ plugin: 'subagent-progress', key: 'now' } as const, 0)

const TICK_MS = 500
const IDLE_POLL_EVERY = 4 // with no rows, ask the engine's list every 4th tick
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

const ICON: Record<Exclude<SubagentState, 'running'>, string> = {
  waiting: '◷',
  idle: '◌',
  done: '✓',
  failed: '✗',
  killed: '■',
}
// "銀河のポラロイド", the same palette as the status line (terminal background #132442)
const GOLD = '#d9a21c' // starburst gold: running
const BEIGE = '#f3e2cc' // lunar beige: agent type and task
const FOG = '#7f9ab0' // foggy blue: secondary text, finished rows
const LINE = '#4a6d98' // tree lines and separators, as the status line's │
const AMBER = '#ff9e3d' // waiting, as the status line's amber
const RED = '#eb5f4b' // failed, as the status line's red

const COLOR: Record<SubagentState, string> = {
  running: GOLD,
  waiting: AMBER,
  idle: FOG,
  done: BEIGE,
  failed: RED,
  killed: FOG,
}

export const register: Register = on => {
  let tickCount = 0
  let isTicking = false

  on('session.start', async ($, e, next) => {
    $.clock.every(TICK_MS, async () => {
      if (isTicking) return
      isTicking = true
      try {
        const rows = await read($, agents)
        const hasRows = Object.keys(rows).length > 0
        tickCount += 1
        if (!hasRows && tickCount % IDLE_POLL_EVERY !== 0) return

        const now = await $.clock.now()
        const listed = await $.agent.list().catch(() => undefined)
        if (reconcile(rows, listed, now) !== rows) {
          await update($, agents, current => reconcile(current, listed, now))
        }
        // Only tick the drawing while there is something on it.
        if (hasRows) await update($, clockNow, () => now)
      } finally {
        isTicking = false
      }
    })
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    const agentId = started.agentId
    if (agentId !== undefined) {
      const now = await $.clock.now()
      await update($, agents, rows => ({
        ...rows,
        [agentId]: startRow(agentId, now, {
          type: e.subagentType,
          description: e.description,
          parentId: e.parentAgentId,
        }),
      }))
      await update($, clockNow, () => now)
    }
    return started
  }).catch(($, e, next) => next(e))

  // Bookkeeping only, never a guard: if it fails the tool still runs.
  on('tool.call', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId !== undefined) {
      const now = await $.clock.now()
      const label = describeTool(String(e.tool), e as unknown as Record<string, unknown>)
      await update($, agents, rows => recordTool(rows, agentId, label, now))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId !== undefined) {
      const state: SubagentState =
        e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'killed' : 'failed'
      const now = await $.clock.now()
      await update($, agents, rows => finishRow(rows, agentId, state, now))
      await update($, clockNow, () => now)
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await update($, agents, () => ({}))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const rows = await read($, agents)
    const list = ordered(rows)
    if (list.length === 0) return next(e)

    const now = await read($, clockNow)
    const { Box, Text } = $.ui.resolve(e)

    const cols = e.props.bodyColumns
    const showAction = cols >= 80
    const typeWidth = Math.min(18, Math.max(...list.map(({ row, depth }) => row.type.length + depth * 2)) + 1)
    const descWidth = Math.max(12, Math.min(40, Math.floor((cols - typeWidth - 26) * (showAction ? 0.45 : 1))))
    const frame = SPINNER[Math.floor(now / TICK_MS) % SPINNER.length]

    const count = (pick: (s: SubagentState) => boolean) => list.filter(({ row }) => pick(row.state)).length
    const running = count(s => s === 'running' || s === 'waiting')
    const done = count(s => s === 'done')
    const failed = count(s => s === 'failed' || s === 'killed')
    const idle = count(s => s === 'idle')
    const summary = [
      running > 0 && { key: 'running', text: `${running} running`, color: COLOR.running },
      idle > 0 && { key: 'idle', text: `${idle} idle`, color: COLOR.idle },
      done > 0 && { key: 'done', text: `${done} done`, color: COLOR.done },
      failed > 0 && { key: 'failed', text: `${failed} failed`, color: COLOR.failed },
    ].filter(part => part !== false)

    return (
      <Box flexDirection="column">
        <Box key="header" flexDirection="row">
          <Text bold color={FOG}>
            subagents{'  '}
          </Text>
          {summary.map((part, i) => (
            <Text key={part.key}>
              <Text color={LINE}>{i > 0 ? ' · ' : ''}</Text>
              <Text color={part.color}>{part.text}</Text>
            </Text>
          ))}
        </Box>
        {list.map(({ row, depth }) => {
          const isOver = isEnded(row.state)
          const icon = row.state === 'running' ? frame : ICON[row.state]
          const indent = depth > 0 ? `${'  '.repeat(depth - 1)}└ ` : ''
          const took = formatElapsed((row.endedAt ?? Math.max(now, row.lastActivityAt)) - row.startedAt)
          return (
            <Box key={row.id} flexDirection="row" gap={1}>
              <Box width={indent.length + 1} flexShrink={0}>
                <Text color={LINE}>{indent}</Text>
                <Text color={COLOR[row.state]}>{icon}</Text>
              </Box>
              <Box width={typeWidth - depth * 2} flexShrink={0}>
                <Text bold={!isOver} color={isOver ? FOG : BEIGE} wrap="truncate-end">
                  {row.type}
                </Text>
              </Box>
              <Box width={descWidth} flexShrink={0}>
                <Text color={isOver ? FOG : BEIGE} wrap="truncate-end">
                  {row.description || '—'}
                </Text>
              </Box>
              <Box width={9} flexShrink={0} justifyContent="flex-end">
                <Text color={FOG}>{`${row.tools} tool${row.tools === 1 ? '' : 's'}`}</Text>
              </Box>
              {showAction && (
                <Box flexGrow={1} flexShrink={1}>
                  <Text color={FOG} wrap="truncate-end">
                    {isOver ? '' : (row.lastTool ?? 'starting…')}
                  </Text>
                </Box>
              )}
              <Box width={7} flexShrink={0} justifyContent="flex-end">
                <Text color={row.state === 'done' || row.state === 'killed' ? FOG : COLOR[row.state]}>{took}</Text>
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  })
}
