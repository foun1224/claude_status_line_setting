import { describe, expect, test } from 'claude-code/testing'

import { stripModeNotice } from '../hooks/register'

describe('stripModeNotice', () => {
  test('drops the shift+tab notice and keeps the rest', async () => {
    expect(stripModeNotice('⏵⏵ bypass permissions on (shift+tab to cycle) · ← for agents')).toBe('← for agents')
    expect(stripModeNotice('(shift+tab to cycle)')).toBe('')
    expect(stripModeNotice('1 shell')).toBe('1 shell')
    expect(stripModeNotice('? for shortcuts')).toBe('? for shortcuts')
  })
})

describe('hint line', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`the line is drawn without the notice (${surface})`, async ($, on) => {
      on('ui.render', { component: 'PromptHint' }, ($, e) => {
        const { Text } = $.ui.resolve(e)
        return h(Text, {}, e.props.hint || ' ')
      })
      const line = await $.ui.mount({
        plugin: 'quiet-footer',
        surface,
        component: 'PromptHint',
        props: { isDraft: false, isWorking: false, hint: '(shift+tab to cycle) · ← for agents' },
      })
      expect(await line.drawn()).toMatchObject({ type: 'Text', props: { dimColor: true }, children: ['← for agents'] })
    })
  }
})
