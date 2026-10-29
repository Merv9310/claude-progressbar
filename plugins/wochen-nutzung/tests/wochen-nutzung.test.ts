import { describe, expect, mock, test } from 'claude-code/testing'
import type { RenderElement, SessionMeasureInput } from 'claude-code'

import { apply } from '../hooks/ledger'
import { bandSvg } from '../hooks/register'
import type { Ledger } from '../types'

const RESET = '2026-10-20T07:00:00.000Z'
const reading = (pct: number, at = 1000) => ({ pct, resetsAt: RESET, at })

describe('ledger', () => {
  test('a new week starts with what was used before tracking', () => {
    const l = apply(undefined, reading(30), { isClean: false, usd: 0 })
    expect(l).toEqual({
      resetsAt: RESET, lastPct: 30, lastAt: 1000, before: 30, local: 0, other: 0, unclear: 0, pctPerUsd: undefined,
    })
  })

  test('a clean span counts as local and learns the rate', () => {
    const start = apply(undefined, reading(30), { isClean: false, usd: 0 })
    const l = apply(start, reading(32, 2000), { isClean: true, usd: 1 })
    expect(l.local).toBe(2)
    expect(l.pctPerUsd).toBe(2)
  })

  test('a mixed span splits by the learned rate', () => {
    const start: Ledger = { ...apply(undefined, reading(30), { isClean: false, usd: 0 }), pctPerUsd: 2 }
    const l = apply(start, reading(35, 2000), { isClean: false, usd: 1 })
    expect(l.local).toBe(2)
    expect(l.other).toBe(3)
  })

  test('no spend here means it all happened elsewhere', () => {
    const start = apply(undefined, reading(30), { isClean: false, usd: 0 })
    expect(apply(start, reading(34, 2000), { isClean: false, usd: 0 }).other).toBe(4)
  })

  test('a mixed span without a learned rate stays unclear', () => {
    const start = apply(undefined, reading(30), { isClean: false, usd: 0 })
    expect(apply(start, reading(31, 2000), { isClean: false, usd: 0.4 }).unclear).toBe(1)
  })

  test('a new reset time starts the week over', () => {
    const start = apply(undefined, reading(80), { isClean: false, usd: 0 })
    const l = apply(start, { pct: 2, resetsAt: '2026-10-27T07:00:00.000Z', at: 3000 }, { isClean: false, usd: 0 })
    expect(l.before).toBe(2)
    expect(l.local).toBe(0)
  })
})

const figures = (week: number): SessionMeasureInput => ({
  context: { tokens: 74_000, window: 200_000, percent: 37 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 12, resetsAt: '2026-10-17T20:00:00.000Z' },
    { kind: 'seven_day', percentUsed: week, resetsAt: RESET },
  ],
  cost: { usd: 0 },
  changed: ['context', 'rateLimits'],
})

test('the footer gets one more mode label: week, its split, context', async ($, on) => {
  mock.clock(on, { now: 1000 })
  mock.store(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  // Stands for the engine: the footer draws its labels joined by ' & '.
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, { dimColor: true }, e.props.modes.join(' & ')) as RenderElement
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const before = await $.ui.mount({ plugin: 'wochen-nutzung', surface, component: 'SessionMode', props: { modes: ['focus'] } })
    expect(await before.find({ type: 'Text', text: 'focus' })).toBeDefined()
    expect(await before.find({ type: 'Text', text: /Woche/ })).toBeUndefined()
    await before.unmount()
  }

  await $.session.measure(figures(30))
  await $.session.measure(figures(34))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'wochen-nutzung', surface, component: 'SessionMode', props: { modes: ['focus'] } })
    expect(await ui.find({ type: 'Text', text: 'focus & Woche 34% · lokal 0% · Web 4% · Kontext 37%' })).toBeDefined()
    await ui.unmount()
  }
})

test('the band above the prompt shows session and week, and hides on ✕', async ($, on) => {
  mock.clock(on, { now: 1000 })
  mock.store(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  const band = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 } as never
  // Stands for the engine: nothing of its own above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return h(Box, {}) as RenderElement
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const empty = await $.ui.mount({ plugin: 'wochen-nutzung', surface, component: 'AbovePrompt', props: band })
    expect(await empty.find({ type: 'Text', text: /Sitzung/ })).toBeUndefined()
    await empty.unmount()
  }

  await $.session.measure(figures(30))
  await $.session.measure(figures(34))

  const text = await $.ui.mount({ plugin: 'wochen-nutzung', surface: 'terminal', component: 'AbovePrompt', props: band })
  // Die Reset-Zeiten stehen in der Fortschritts-Leiste, hier nicht noch einmal.
  expect(await text.find({ type: 'Text', text: 'Sitzung 12%' })).toBeDefined()
  expect(await text.find({ type: 'Text', text: 'Woche 34% (lokal 0% · Web 4%)' })).toBeDefined()
  expect(await text.find({ type: 'Text', text: /Reset/ })).toBeUndefined()
  await text.unmount()

  // Auf dem Desktop eine Zeichnung mit Balken statt Text.
  const desk = await $.ui.mount({ plugin: 'wochen-nutzung', surface: 'desktop', component: 'AbovePrompt', props: band })
  expect(await desk.find({ type: 'Svg' })).toBeDefined()
  await desk.unmount()

  const ui = await $.ui.mount({ plugin: 'wochen-nutzung', surface: 'terminal', component: 'AbovePrompt', props: band })
  await ui.press({ key: 'nutzung-hide' })
  expect(await ui.find({ type: 'Text', text: /Sitzung/ })).toBeUndefined()
  await ui.unmount()
})

test('the bars turn orange from 75 % and red from 90 %, and stack when narrow', () => {
  const part = (pct: number, name = 'Sitzung', detail = '') => ({ key: name, text: '', name, detail, pct })
  const ok = bandSvg([part(11)], 600).source
  expect(ok.includes('#4f8ff7')).toBe(true)
  expect(bandSvg([part(80)], 600).source.includes('#f0932b')).toBe(true)
  expect(bandSvg([part(95)], 600).source.includes('#e5484d')).toBe(true)

  const both = [part(11), part(14, 'Woche', 'lokal 12% · Web 2,3%')]
  expect(bandSvg(both, 560).height).toBe(30)
  expect(bandSvg(both, 400).height).toBe(68)
})
