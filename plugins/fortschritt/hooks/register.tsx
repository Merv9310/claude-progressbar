import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Plan, Resets } from '../types'
import { applyPlan, doneOf, finishPlan, titleOf } from './plan'
import type { PlanInput } from './plan'

const plan = atom({ plugin: 'fortschritt', key: 'plan' } as const, null)
const agents = atom({ plugin: 'fortschritt', key: 'agents' } as const, [])
const resets = atom({ plugin: 'fortschritt', key: 'resets' } as const, null)
const isHidden = atom({ plugin: 'fortschritt', key: 'isHidden' } as const, false)

const PLAN_TOOL = 'mcp__ccd_turn__update_plan'
const WRAP_TOOL = 'mcp__ccd_turn__wrap_up'

// ---------------------------------------------------------------------------
// Reset-Zeiten des 5-Stunden-Fensters und der Woche. Wie viel verbraucht ist,
// zeigen die Balken des Mods „wochen-nutzung“ darüber.

const resetsOf = (limits: SessionRateLimit[]): Resets => ({
  fiveHour: limits.find(l => l.kind === 'five_hour')?.resetsAt,
  week: limits.find(l => l.kind === 'seven_day')?.resetsAt,
})

async function setResets($: EngineInterface, r: Resets) {
  const prev = await read($, resets)
  if (prev?.fiveHour === r.fiveHour && prev?.week === r.week) return
  await update($, resets, () => r)
}

async function refreshResets($: EngineInterface) {
  await setResets($, resetsOf((await $.session.usage()).rateLimits))
}

/** „15:40“ */
function clockTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso.slice(11, 16)
  }
}

/** „Sa., 03:00“ */
function weekTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso.slice(0, 16).replace('T', ' ')
  }
}

/** Die beiden Zeilen unten rechts; leer, solange keine Messung da ist. */
export const resetLines = (r: Resets | null): string[] =>
  [r?.fiveHour && `5h-Reset ${clockTime(r.fiveHour)}`, r?.week && `Woche-Reset ${weekTime(r.week)}`].filter(
    (s): s is string => Boolean(s),
  )

// ---------------------------------------------------------------------------
// Die Zeile als ein SVG: Titel, gepunkteter Balken, Prozent, Agents, Kontingent.
// Die Desktop-App bricht nebeneinanderliegende Elemente um, darum ist alles bis
// auf das ✕ eine Zeichnung (Optik angelehnt an savvy-progress).

const ACCENT = '#8f8cf4'
const DONE = '#5fbf8f'
const H = 24
const BAR_H = 14
const CELL = 3
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

// Feste Pseudozufallswerte, damit die Punkte beim Neuzeichnen nicht springen.
const noise = (x: number, y: number): number => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

// Grobe Breite von Systemschrift in em, reicht für den Platz des Titels.
const charEm = (ch: string): number => (/[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-ZÄÖÜmw@%]/.test(ch) ? 0.72 : 0.56)
const textWidth = (s: string, size: number): number => [...s].reduce((w, ch) => w + charEm(ch) * size, 0)

const fitText = (s: string, size: number, maxW: number): string => {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch + '…', size) > maxW) break
    out += ch
  }
  return out + '…'
}

export type View = {
  title: string
  done: number
  total: number
  isFinished: boolean
  running: number
  resets: string[]
}

const RESET_W = 118
const AGENT_W = 84
const PCT_W = 38

export function rowSvg(v: View, W: number): string {
  const color = v.isFinished ? DONE : ACCENT
  const ratio = v.total ? v.done / v.total : 0
  const title = fitText(v.title, 13, Math.max(60, W * 0.32))
  const BAR_X = Math.round(16 + textWidth(title, 13) + 12)
  const BAR_W = Math.max(60, W - BAR_X - PCT_W - AGENT_W - RESET_W - 16)
  const y0 = (H - BAR_H) / 2
  const fillW = Math.round(BAR_W * ratio)

  // Gepunktete Füllung: vorne locker, zum Kopf hin dicht.
  const dots: string[] = []
  const cols = Math.floor(fillW / CELL)
  const rows = Math.floor(BAR_H / CELL)
  for (let c = 0; c < cols; c++) {
    const density = 0.35 + 0.6 * Math.pow(c / Math.max(1, cols), 1.2)
    for (let r = 0; r < rows; r++) {
      if (noise(c, r) < density) {
        dots.push(`<rect class="t${Math.floor(noise(r, c) * 4)}" x="${c * CELL + 1}" y="${r * CELL + 1}" width="2" height="2"/>`)
      }
    }
  }
  const ticks: string[] = []
  for (let i = 1; i < v.total; i++) {
    const x = Math.round((BAR_W * i) / v.total)
    if (x > fillW + 4) ticks.push(`<rect x="${x}" y="${BAR_H / 2 - 3}" width="1.5" height="6" rx="0.75"/>`)
  }

  const pill = v.total ? `${v.done}/${v.total}` : ''
  const pillW = Math.round(16 + pill.length * 6.4)
  const pillX = Math.max(0, Math.min(BAR_W - pillW, fillW - pillW))
  const pillSvg = pill
    ? `<rect x="${pillX}" width="${pillW}" height="${BAR_H}" rx="${BAR_H / 2}" fill="${color}"/>` +
      `<text x="${pillX + pillW / 2}" y="${BAR_H / 2 + 3.8}" text-anchor="middle" font-family="${FONT}" font-size="10.5" font-weight="600" fill="#ffffff">${pill}</text>`
    : ''
  const percent = v.total ? `${Math.round(ratio * 100)}%` : ''

  // Agents: ein kleiner Pixel-Roboter, der wippt, solange einer läuft.
  const AX = BAR_X + BAR_W + PCT_W + 10
  const isBusy = v.running > 0
  const bot = `<g class="${isBusy ? 'bob' : ''}" transform="translate(${AX},${H / 2 - 6})">
<rect x="4.5" y="0" width="1.5" height="2.5" fill="${isBusy ? color : '#9a9a9a'}"/>
<rect x="0" y="2.5" width="11" height="9" rx="2.5" fill="${isBusy ? color : 'none'}" stroke="${isBusy ? 'none' : '#9a9a9a'}" stroke-width="1.2"/>
${isBusy ? '<rect x="2.5" y="5.5" width="2" height="2" fill="#fff"/><rect x="6.5" y="5.5" width="2" height="2" fill="#fff"/>' : ''}
</g>`
  const agentText = isBusy ? `${v.running} ${v.running === 1 ? 'Agent' : 'Agents'}` : 'keine Agents'

  // Reset-Zeiten: klein, zweizeilig, rechts außen; eine einzelne mittig.
  const ys = v.resets.length === 1 ? [H / 2 + 3.5] : [10, 21]
  const resetSvg = v.resets
    .map(
      (line, i) =>
        `<text class="m" x="${W - 2}" y="${ys[i]}" text-anchor="end" font-family="${FONT}" font-size="9.5" font-variant-numeric="tabular-nums">${xml(line)}</text>`,
    )
    .join('')

  const speed = v.isFinished ? [3.2, 3.8, 4.4, 3.5] : [2.2, 2.8, 1.9, 3.3]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
.t{fill:#1f1f1f}.m{fill:#8a8a8a}.k{fill:#e4e4e2}.tk{fill:#b4b4b0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.m{fill:#9a9a9a}.k{fill:#2c2c2c}.tk{fill:#5a5a5a}}
.t0,.t1,.t2,.t3{animation:tw ${speed[0]}s ease-in-out infinite}
.t1{animation-duration:${speed[1]}s;animation-delay:-.7s}.t2{animation-duration:${speed[2]}s;animation-delay:-1.3s}.t3{animation-duration:${speed[3]}s;animation-delay:-.4s}
@keyframes tw{0%,100%{opacity:1}50%{opacity:${v.isFinished ? 0.8 : 0.3}}}
.bob{animation:bob 1.1s ease-in-out infinite}
@keyframes bob{0%,100%{transform:translate(${AX}px,${H / 2 - 6}px)}50%{transform:translate(${AX}px,${H / 2 - 7.5}px)}}
@media (prefers-reduced-motion: reduce){.t0,.t1,.t2,.t3,.bob{animation:none}}
</style>
<defs><clipPath id="fc"><rect x="0" y="0" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/></clipPath></defs>
<circle cx="5" cy="${H / 2}" r="4" fill="${color}"/>
<text class="t" x="16" y="${H / 2 + 4.5}" font-family="${FONT}" font-size="13" font-weight="500">${xml(title)}</text>
<g transform="translate(${BAR_X},${y0})">
<rect class="k" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/>
<g clip-path="url(#fc)"><g fill="${color}">${dots.join('')}</g><g class="tk">${ticks.join('')}</g></g>
${pillSvg}
</g>
<text class="m" x="${BAR_X + BAR_W + PCT_W - 4}" y="${H / 2 + 4.5}" text-anchor="end" font-family="${FONT}" font-size="12.5" font-variant-numeric="tabular-nums">${percent}</text>
${bot}
<text class="${isBusy ? 't' : 'm'}" x="${AX + 16}" y="${H / 2 + 4}" font-family="${FONT}" font-size="11.5">${agentText}</text>
${resetSvg}
</svg>`
}

const barText = (v: View, width: number): string => {
  const filled = Math.round(width * (v.total ? v.done / v.total : 0))
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

// Ohne Aufgabenliste steht die Leiste trotzdem da: leerer Balken, Agents, Reset-Zeiten.
const viewOf = (p: Plan | null, running: number, r: Resets | null): View => ({
  title: p ? titleOf(p) : running > 0 ? 'Agents arbeiten' : 'Keine Aufgabenliste',
  done: p ? doneOf(p) : 0,
  total: p ? p.steps.length : 0,
  isFinished: p?.isFinished ?? false,
  running,
  resets: resetLines(r),
})

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await refreshResets($).catch(() => {})
    return started
  })

  // Eine fertige Liste bleibt stehen, bis die nächste Nachricht kommt.
  // Ein Fehler der Leiste darf nie eine Nachricht, ein Tool oder einen Agent aufhalten:
  // die eigene Buchführung läuft darum immer mit .catch.
  on('prompt.submit', async ($, e, next) => {
    await (async () => {
      if ((await read($, plan))?.isFinished) await update($, plan, () => null)
    })().catch(() => {})
    return next(e)
  })

  // Die Aufgabenliste der App: nur die der Hauptsitzung, nicht die von Subagents.
  on('tool.call', { tool: PLAN_TOOL }, async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      const input = e as unknown as PlanInput
      await (async () => {
        await update($, plan, p => applyPlan(p, input))
        if (Array.isArray(input.items)) await update($, isHidden, () => false)
      })().catch(() => {})
    }
    return result
  })

  on('tool.call', { tool: WRAP_TOOL }, async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) await update($, plan, finishPlan).catch(() => {})
    return result
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny === undefined && started.agentId) {
      const id = started.agentId
      await (async () => {
        await update($, agents, list => [...list.filter(a => a.id !== id), { id, label: e.description }])
        await update($, isHidden, () => false)
      })().catch(() => {})
    }
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id) await update($, agents, list => list.filter(a => a.id !== id))
    return next(e)
  })

  // Nach jeder Modellantwort die Reset-Zeiten neu lesen.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    void refreshResets($).catch(() => {})
    return result
  })

  on('session.measure', async ($, e, next) => {
    await setResets($, resetsOf(e.rateLimits)).catch(() => {})
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const p = await read($, plan)
    const list = await read($, agents)
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    // Die Bänder anderer Mods darunter; Claude Codes eigener Platzhalter ({ type: 'engine' })
    // wird nie verschachtelt: die Desktop-App verwirft ein Band, das ihn enthält.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null

    const v = viewOf(p, list.length, await read($, resets))
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const dismiss = <Button key="fortschritt-hide" label="✕" plain role="dismiss" onPress={() => update($, isHidden, () => true)} />

    // Die Elementtabelle des Terminals hat ein Svg, das nichts zeichnet: darum auch die Oberfläche prüfen.
    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      const width = Math.max(320, Math.min(1600, (e.props.bodyColumns || 100) * 8 - 48))
      const alt = `${v.title}: ${v.done} von ${v.total}, ${v.running} Agents aktiv`
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Svg source={rowSvg(v, width)} alt={alt} width={width} height={H} />
            {dismiss}
          </Box>
          {below}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2}>
          <Text color={v.isFinished ? DONE : ACCENT}>●</Text>
          <Text wrap="truncate-end">{v.title}</Text>
          {v.total > 0 && <Text color={v.isFinished ? DONE : ACCENT}>{barText(v, 20)}</Text>}
          {v.total > 0 && <Text bold>{`${v.done}/${v.total}`}</Text>}
          <Text dimColor={v.running === 0}>{v.running > 0 ? `${v.running} Agents` : 'keine Agents'}</Text>
          {v.resets.length > 0 && <Text dimColor>{v.resets.join(' · ')}</Text>}
          {dismiss}
        </Box>
        {below}
      </Box>
    )
  })
}
