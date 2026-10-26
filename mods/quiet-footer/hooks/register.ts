// quiet-footer: drop the permission-mode notice ("(shift+tab to cycle)") from
// the hint line under the prompt. The engine hands the hint as "(shift+tab to
// cycle)" with the red mode label drawn as a pill beside it, and a rewritten
// hint keeps that pill, so the hook draws the line itself. The red label is
// drawn outside the hook's reach and stays. The mode and shift+tab are untouched.
import type { Register } from 'claude-code'

const MODE_NOTICE = /(\S*\s*bypass permissions on\s*)?\(shift\+tab to cycle\)(\s*·)?\s*/i

export function stripModeNotice(hint: string): string {
  return hint.replace(MODE_NOTICE, '').trim()
}

export const register: Register = on => {
  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    const hint = stripModeNotice(e.props.hint)
    if (hint === e.props.hint) return next(e)
    const { Text } = $.ui.resolve(e)
    return h(Text, { dimColor: true }, hint || ' ')
  })
}
