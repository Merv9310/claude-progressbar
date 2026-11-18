import { describe, expect, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

import { applyPlan, doneOf, finishPlan, titleOf } from '../hooks/plan'
import { contextLabel, rowSvg } from '../hooks/register'

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

test('the drawing holds title, count, agents and the context ring at the far right', () => {
  const svg = rowSvg({ title: 'Mod schreiben', done: 1, total: 3, isFinished: false, running: 2, context: 34 }, 800)
  expect(svg.includes('Mod schreiben')).toBe(true)
  expect(svg.includes('1/3')).toBe(true)
  expect(svg.includes('2 Agents')).toBe(true)
  expect(svg.includes('34%')).toBe(true)
  expect(svg.includes('stroke-dasharray')).toBe(true)
  // Lokal / Web steht jetzt im Band von „wochen-nutzung“, nicht mehr hier.
  expect(svg.includes('Lokal')).toBe(false)
})

test('the ring stays empty without a measured context and turns red from 90 %', () => {
  expect(contextLabel(undefined)).toBe('0%')
  expect(contextLabel(4.25)).toBe('4,3%')
  const empty = rowSvg({ title: 'x', done: 0, total: 0, isFinished: false, running: 0 }, 600)
  expect(empty.includes('stroke-dasharray')).toBe(false)
  const full = rowSvg({ title: 'x', done: 0, total: 0, isFinished: false, running: 0, context: 95 }, 600)
  expect(full.includes('#e5484d')).toBe(true)
})

test('the band appears with a task list and hides on ✕', async ($, on) => {
  const band = { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 120 } as never
  // Stellvertreter für die Engine.
  on('tool.call', () => ({ result: 'ok' }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return h(Box, {}) as RenderElement
  })

  // Ohne Aufgabenliste und ohne Agents bleibt die Leiste stehen.
  for (const surface of ['terminal', 'desktop'] as const) {
    const empty = await $.ui.mount({ plugin: 'fortschritt', surface, component: 'AbovePrompt', props: band })
    if (surface === 'terminal') {
      expect(await empty.find({ type: 'Text', text: 'Keine Aufgabenliste' })).toBeDefined()
      expect(await empty.find({ type: 'Text', text: 'keine Agents' })).toBeDefined()
    } else {
      expect(await empty.find({ type: 'Svg' })).toBeDefined()
    }
    await empty.unmount()
  }

  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items } as never)

  const ui = await $.ui.mount({ plugin: 'fortschritt', surface: 'terminal', component: 'AbovePrompt', props: band })
  expect(await ui.find({ type: 'Text', text: 'Mod schreiben' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1/3' })).toBeDefined()
  // Der Kontext steht immer rechts außen, Lokal / Web nicht mehr in dieser Leiste.
  expect(await ui.find({ type: 'Text', text: /Kontext/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Lokal/ })).toBeUndefined()
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
