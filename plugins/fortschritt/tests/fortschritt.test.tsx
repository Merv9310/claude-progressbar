import { describe, expect, test } from 'claude-code/testing'
import type { RenderElement, SessionMeasureInput } from 'claude-code'

import { applyPlan, doneOf, finishPlan, titleOf } from '../hooks/plan'
import { resetLines, rowSvg } from '../hooks/register'

const items = [
  { content: 'Dateien lesen', status: 'completed' },
  { content: 'Mod schreiben', status: 'in_progress' },
  { content: 'Testen', status: 'pending' },
]

describe('plan', () => {
  test('a list of items replaces the plan', () => {
    const p = applyPlan(null, { items })
    expect(p && doneOf(p)).toBe(1)
    expect(p && titleOf(p)).toBe('Mod schreiben')
  })

  test('advance completes the running step and starts the next', () => {
    const p = applyPlan(applyPlan(null, { items }), { advance: true })
    expect(p && doneOf(p)).toBe(2)
    expect(p && titleOf(p)).toBe('Testen')
  })

  test('done and start work out of order', () => {
    const p = applyPlan(applyPlan(null, { items }), { done: [2, 3] })
    expect(p && doneOf(p)).toBe(3)
  })

  test('wrap_up finishes the whole list', () => {
    const p = finishPlan(applyPlan(null, { items }))
    expect(p?.isFinished).toBe(true)
    expect(p && titleOf(p)).toBe('Erledigt')
  })

  test('advance without a plan changes nothing', () => {
    expect(applyPlan(null, { advance: true })).toBe(null)
  })
})

test('the drawing holds title, count, agents and reset times', () => {
  const svg = rowSvg(
    { title: 'Mod schreiben', done: 1, total: 3, isFinished: false, running: 2, resets: ['5h-Reset 15:40', 'Woche-Reset Sa., 03:00'] },
    800,
  )
  expect(svg.includes('Mod schreiben')).toBe(true)
  expect(svg.includes('1/3')).toBe(true)
  expect(svg.includes('2 Agents')).toBe(true)
  expect(svg.includes('5h-Reset 15:40')).toBe(true)
  expect(svg.includes('übrig')).toBe(false)
})

test('reset lines appear only for windows that report a reset', () => {
  expect(resetLines(null)).toEqual([])
  expect(resetLines({ week: '2026-11-01T02:00:00.000Z' }).length).toBe(1)
  expect(resetLines({ week: '2026-11-01T02:00:00.000Z' })[0]?.startsWith('Woche-Reset ')).toBe(true)
})

const figures: SessionMeasureInput = {
  context: { tokens: 74_000, window: 200_000, percent: 37 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 38, resetsAt: '2026-10-29T14:40:00.000Z' },
    { kind: 'seven_day', percentUsed: 19, resetsAt: '2026-11-01T02:00:00.000Z' },
  ],
  cost: { usd: 0 },
  changed: ['rateLimits'],
}

test('the band appears with a task list and hides on ✕', async ($, on) => {
  const band = { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 120 } as never
  // Stellvertreter für die Engine.
  on('tool.call', () => ({ result: 'ok' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return h(Box, {}) as RenderElement
  })

  const empty = await $.ui.mount({ plugin: 'fortschritt', surface: 'terminal', component: 'AbovePrompt', props: band })
  expect(await empty.find({ type: 'Text', text: /Agents/ })).toBeUndefined()
  await empty.unmount()

  await $.session.measure(figures)
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items } as never)

  const ui = await $.ui.mount({ plugin: 'fortschritt', surface: 'terminal', component: 'AbovePrompt', props: band })
  expect(await ui.find({ type: 'Text', text: 'Mod schreiben' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1/3' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^5h-Reset .+ · Woche-Reset / })).toBeDefined()
  await ui.unmount()

  const desk = await $.ui.mount({ plugin: 'fortschritt', surface: 'desktop', component: 'AbovePrompt', props: band })
  expect(await desk.find({ type: 'Svg' })).toBeDefined()
  await desk.unmount()

  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'fertig' } as never)
  const done = await $.ui.mount({ plugin: 'fortschritt', surface: 'terminal', component: 'AbovePrompt', props: band })
  expect(await done.find({ type: 'Text', text: 'Erledigt' })).toBeDefined()
  await done.press({ key: 'fortschritt-hide' })
  expect(await done.find({ type: 'Text', text: 'Erledigt' })).toBeUndefined()
  await done.unmount()
})
