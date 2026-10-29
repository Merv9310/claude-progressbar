import { describe, expect, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

import { applyPlan, doneOf, finishPlan, titleOf } from '../hooks/plan'
import { rowSvg, splitLines } from '../hooks/register'

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

test('the drawing holds title, count, agents and the local / web split', () => {
  const svg = rowSvg(
    { title: 'Mod schreiben', done: 1, total: 3, isFinished: false, running: 2, split: ['Lokal 5%', 'Web 2,3%'] },
    800,
  )
  expect(svg.includes('Mod schreiben')).toBe(true)
  expect(svg.includes('1/3')).toBe(true)
  expect(svg.includes('2 Agents')).toBe(true)
  expect(svg.includes('Lokal 5%')).toBe(true)
  expect(svg.includes('Web 2,3%')).toBe(true)
  expect(svg.includes('Reset')).toBe(false)
})

test('the split lines appear only once wochen-nutzung has a split', () => {
  expect(splitLines(null)).toEqual([])
  expect(splitLines({ local: 12.4, other: 2.25 })).toEqual(['Lokal 12%', 'Web 2,3%'])
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
  // Ohne den Mod „wochen-nutzung“ gibt es keine Aufteilung: die Stelle bleibt leer.
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
