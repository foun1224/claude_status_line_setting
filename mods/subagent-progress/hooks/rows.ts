// Pure bookkeeping for the subagent rows: no `$`, so tests can call it directly.
import type { AgentInfo } from 'claude-code'

import type { SubagentRow, SubagentState } from '../types'

export type Rows = Record<string, SubagentRow>

/** Finished rows stay on screen this long, then leave. */
export const LINGER_MS = 10_000
/** A row the engine no longer lists and that has been silent this long is dropped. */
export const STALE_MS = 5 * 60_000

const FROM_ENGINE: Record<AgentInfo['status'], SubagentState> = {
  pending: 'running',
  running: 'running',
  waiting: 'waiting',
  idle: 'idle',
  completed: 'done',
  failed: 'failed',
  killed: 'killed',
}

export const isEnded = (s: SubagentState): boolean =>
  s === 'done' || s === 'failed' || s === 'killed'

export function startRow(
  id: string,
  now: number,
  info: { type?: string; description?: string; parentId?: string },
): SubagentRow {
  return {
    id,
    type: info.type || 'agent',
    description: info.description || '',
    parentId: info.parentId,
    state: 'running',
    startedAt: now,
    lastActivityAt: now,
    tools: 0,
  }
}

export function recordTool(rows: Rows, agentId: string, label: string, now: number): Rows {
  const row = rows[agentId] ?? startRow(agentId, now, {})
  return {
    ...rows,
    [agentId]: {
      ...row,
      state: 'running',
      endedAt: undefined,
      lastActivityAt: now,
      tools: row.tools + 1,
      lastTool: label,
    },
  }
}

export function finishRow(rows: Rows, agentId: string, state: SubagentState, now: number): Rows {
  const row = rows[agentId]
  if (row === undefined) return rows
  return { ...rows, [agentId]: { ...row, state, endedAt: now, lastActivityAt: now } }
}

/**
 * Folds the engine's agent list into the rows and drops rows that have had
 * their time. Returns `rows` itself when nothing changed, so the caller can
 * skip the write (and the redraw).
 */
export function reconcile(rows: Rows, listed: readonly AgentInfo[] | undefined, now: number): Rows {
  let changed = false
  const next: Rows = { ...rows }

  for (const agent of listed ?? []) {
    const state = FROM_ENGINE[agent.status] ?? 'running'
    const row = next[agent.id]
    if (row === undefined) {
      // Never saw it start (spawned before this module loaded): pick it up
      // while it is alive, but don't resurrect one that already finished.
      if (isEnded(state)) continue
      next[agent.id] = {
        ...startRow(agent.id, now, {
          type: agent.type,
          description: agent.description,
          parentId: agent.parentId,
        }),
        state,
      }
      changed = true
      continue
    }
    // The list can lag a turn.complete by a moment: don't flip a finished
    // row back to running/waiting from it (a new tool call does that).
    if (isEnded(row.state) && (state === 'running' || state === 'waiting')) continue
    if (row.state !== state) {
      next[agent.id] = { ...row, state, endedAt: isEnded(state) ? (row.endedAt ?? now) : undefined }
      changed = true
    }
  }

  const listedIds = listed && new Set(listed.map(a => a.id))
  for (const row of Object.values(next)) {
    const isExpired = row.endedAt !== undefined && now - row.endedAt > LINGER_MS
    const isStale =
      listedIds !== undefined &&
      !listedIds.has(row.id) &&
      !isEnded(row.state) &&
      now - row.lastActivityAt > STALE_MS
    if (isExpired || isStale) {
      delete next[row.id]
      changed = true
    }
  }

  return changed ? next : rows
}

/** Rows in display order: by start time, each subagent's own subagents under it. */
export function ordered(rows: Rows): { row: SubagentRow; depth: number }[] {
  const all = Object.values(rows)
  const children = new Map<string | undefined, SubagentRow[]>()
  for (const row of all) {
    const parent = row.parentId !== undefined && rows[row.parentId] ? row.parentId : undefined
    children.set(parent, [...(children.get(parent) ?? []), row])
  }
  const out: { row: SubagentRow; depth: number }[] = []
  const walk = (parent: string | undefined, depth: number) => {
    const kids = (children.get(parent) ?? []).sort((a, b) => a.startedAt - b.startedAt)
    for (const row of kids) {
      out.push({ row, depth })
      if (depth < 8) walk(row.id, depth + 1)
    }
  }
  walk(undefined, 0)
  return out
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

// Never show credentials from a command line (sshpass -p, PASS=..., token: ...).
const SECRET =
  /(sshpass\s+-p\s*|\b[\w-]*(?:pass(?:word)?|passwd|token|secret|api[_-]?key)[\w-]*\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi

export const redact = (text: string): string => text.replace(SECRET, '$1***')

const basename = (path: string): string => path.split('/').filter(Boolean).pop() ?? path

/** A one-line summary of a tool call: "Read rows.ts", "$ git status", "Grep TODO". */
export function describeTool(tool: string, input: Record<string, unknown>): string {
  const str = (key: string): string => {
    const value = input[key]
    return typeof value === 'string' ? value : ''
  }
  switch (tool) {
    case 'Bash':
      return redact(`$ ${(str('command').split('\n')[0] ?? '').trim()}`)
    case 'Read':
    case 'Edit':
    case 'Write':
      return `${tool} ${basename(str('file_path'))}`
    case 'NotebookEdit':
      return `${tool} ${basename(str('notebook_path'))}`
    case 'Grep':
    case 'Glob':
      return `${tool} ${str('pattern')}`
    case 'WebSearch':
      return `Search ${str('query')}`
    case 'WebFetch': {
      try {
        return `Fetch ${new URL(str('url')).host}`
      } catch {
        return 'Fetch'
      }
    }
    case 'Agent':
      return `Agent ${str('description')}`
    default: {
      const mcp = /^mcp__(.+?)__(.+)$/.exec(tool)
      return mcp ? `${mcp[1]}·${mcp[2]}` : tool
    }
  }
}
