export type SubagentState = 'running' | 'waiting' | 'idle' | 'done' | 'failed' | 'killed'

export type SubagentRow = {
  id: string
  /** Agent type: general-purpose, Explore, ... */
  type: string
  /** The Agent call's short description of the task */
  description: string
  parentId?: string
  state: SubagentState
  startedAt: number
  endedAt?: number
  lastActivityAt: number
  /** Tool calls made inside this subagent's loop */
  tools: number
  /** What it is doing now, e.g. "Read register.tsx", "$ git status" */
  lastTool?: string
}

declare module 'claude-code' {
  interface PluginState {
    'subagent-progress': {
      agents: Record<string, SubagentRow>
      now: number
    }
  }
}
