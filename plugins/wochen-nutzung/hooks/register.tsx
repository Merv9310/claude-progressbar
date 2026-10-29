import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit, SessionUsage } from 'claude-code'

import type { Ledger, Snapshot, Window } from '../types'
import { apply, isNewWeek } from './ledger'

const snapshot = atom({ plugin: 'wochen-nutzung', key: 'snapshot' } as const, null)
const isBandHidden = atom({ plugin: 'wochen-nutzung', key: 'isBandHidden' } as const, false)

type Figures = Pick<SessionUsage, 'rateLimits' | 'context' | 'cost'>

const toWindow = (limits: SessionRateLimit[], kind: string): Window | undefined => {
  const one = limits.find(l => l.kind === kind)
  return one && { pct: one.percentUsed, resetsAt: one.resetsAt }
}

const pct = (n: number) => (n >= 10 || Number.isInteger(n) ? `${Math.round(n)}%` : `${n.toFixed(1).replace('.', ',')}%`)

const tokens = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)

/** The short label beside the footer's mode labels. */
function label(s: Snapshot): string | undefined {
  const parts: string[] = []
  if (s.week) parts.push(`Woche ${pct(s.week.pct)}`)
  if (s.week && s.ledger) parts.push(`lokal ${pct(s.ledger.local)}`, `Web ${pct(s.ledger.other)}`)
  if (s.context?.percent !== undefined) parts.push(`Kontext ${pct(s.context.percent)}`)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

function when(iso?: string) {
  if (!iso) return ''
  const date = new Date(iso)
  try {
    return date.toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso.slice(0, 16).replace('T', ' ')
  }
}

/** „Reset 15:40“ */
function resetClock(iso?: string) {
  if (!iso) return ''
  try {
    return `Reset ${new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
  } catch {
    return `Reset ${iso.slice(11, 16)}`
  }
}

/** „Reset Sa., 03:00“ */
function resetWeekday(iso?: string) {
  if (!iso) return ''
  try {
    return `Reset ${new Date(iso).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`
  } catch {
    return `Reset ${iso.slice(0, 16).replace('T', ' ')}`
  }
}

/** Amber from 75 %, red from 90 %. */
const levelColor = (p: number) => (p >= 90 ? 'error' : p >= 75 ? 'warning' : undefined)

type BandPart = { key: string; text: string; color?: 'error' | 'warning'; name: string; detail: string; pct: number }

/** The band's parts, left to right: the session (5-hour) window, then the week. */
function bandParts(s: Snapshot) {
  const parts: BandPart[] = []
  // Jede Grenze mit ihrer Reset-Zeit; die Aufteilung lokal / Web zeigt die
  // Fortschritts-Leiste (Mod „fortschritt“) rechts außen.
  if (s.fiveHour) {
    const reset = resetClock(s.fiveHour.resetsAt)
    parts.push({
      key: 'session',
      text: `Sitzung ${pct(s.fiveHour.pct)}${reset ? ` · ${reset}` : ''}`,
      color: levelColor(s.fiveHour.pct),
      name: 'Sitzung',
      detail: reset,
      pct: s.fiveHour.pct,
    })
  }
  if (s.week) {
    const reset = resetWeekday(s.week.resetsAt)
    parts.push({
      key: 'week',
      text: `Woche ${pct(s.week.pct)}${reset ? ` · ${reset}` : ''}`,
      color: levelColor(s.week.pct),
      name: 'Woche',
      detail: reset,
      pct: s.week.pct,
    })
  }
  return parts
}

// ---------------------------------------------------------------------------
// Desktop: jede Grenze wie in der Nutzungsanzeige der App, Name, Details und
// Prozent in einer Zeile, darunter ein dünner Balken. Blau, ab 75 % orange,
// ab 90 % rot. Passen beide nicht mit Luft nebeneinander, stehen sie untereinander.

const BLUE = '#4f8ff7'
const ORANGE = '#f0932b'
const RED = '#e5484d'
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
const ROW_H = 30
const GAP = 48

const levelFill = (p: number) => (p >= 90 ? RED : p >= 75 ? ORANGE : BLUE)

const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

// Grobe Breite von Systemschrift in em, reicht zum Einteilen.
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

// Platz, den eine Grenze ohne Kürzen braucht: Name, Abstand, Details, Abstand, Prozent.
const needWidth = (p: BandPart) => textWidth(p.name, 12.5) + 18 + textWidth(p.detail, 11.5) + 24 + textWidth(pct(p.pct), 12.5)

// `detailX`: wo die Details beginnen; untereinander stehen sie so bündig in einer Spalte.
function limitSvg(p: BandPart, x: number, y: number, w: number, detailX: number): string {
  const fill = levelFill(p.pct)
  const isHigh = p.pct >= 75
  const percent = pct(p.pct)
  const pctW = textWidth(percent, 12.5)
  const detail = fitText(p.detail, 11.5, Math.max(0, w - detailX - pctW - 24))
  const barW = Math.round((w * Math.min(100, Math.max(0, p.pct))) / 100)
  // white-space:pre hält breite Abstände in den Details.
  return `<g transform="translate(${x},${y})">
<text class="t" x="0" y="12" font-family="${FONT}" font-size="12.5" font-weight="600">${xml(p.name)}</text>
<text class="m" x="${detailX}" y="12" font-family="${FONT}" font-size="11.5" style="white-space:pre">${xml(detail)}</text>
<text ${isHigh ? `fill="${fill}"` : 'class="t"'} x="${w}" y="12" text-anchor="end" font-family="${FONT}" font-size="12.5" font-weight="600" font-variant-numeric="tabular-nums">${percent}</text>
<rect class="k" x="0" y="19" width="${w}" height="5" rx="2.5"/>
<rect x="0" y="19" width="${Math.max(barW, p.pct > 0 ? 3 : 0)}" height="5" rx="2.5" fill="${fill}"/>
</g>`
}

/** Die ganze Zeile als SVG, `W` Pixel breit; gibt die Höhe mit zurück. */
export function bandSvg(parts: BandPart[], W: number): { source: string; height: number } {
  const half = (W - GAP * (parts.length - 1)) / parts.length
  const isSideBySide = parts.every(p => needWidth(p) <= half)
  const column = Math.round(Math.max(...parts.map(p => textWidth(p.name, 12.5))) + 18)
  const blocks = parts.map((p, i) =>
    isSideBySide
      ? limitSvg(p, Math.round(i * (half + GAP)), 0, Math.floor(half), Math.round(textWidth(p.name, 12.5) + 18))
      : limitSvg(p, 0, i * (ROW_H + 8), W, column),
  )
  const height = isSideBySide ? ROW_H : parts.length * ROW_H + (parts.length - 1) * 8
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">
<style>
.t{fill:#1f1f1f}.m{fill:#7a7a7a}.k{fill:#e4e4e2}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.m{fill:#9a9a9a}.k{fill:#3a3a3a}}
</style>
${blocks.join('\n')}
</svg>`
  return { source, height }
}

/** What /nutzung answers. */
function details(s: Snapshot): string[] {
  const lines: string[] = []
  if (s.week) {
    lines.push(`Wochenlimit: ${pct(s.week.pct)} genutzt${s.week.resetsAt ? ` · Reset ${when(s.week.resetsAt)}` : ''}`)
    const l = s.ledger
    if (l) {
      lines.push(`  Claude Code auf diesem PC: ${pct(l.local)}`)
      lines.push(`  Woanders (claude.ai Web, Desktop-Chat, Handy): ${pct(l.other)}`)
      if (l.unclear > 0) lines.push(`  Nicht zuordenbar: ${pct(l.unclear)}`)
      if (l.before > 0) lines.push(`  Schon genutzt vor Messbeginn: ${pct(l.before)}`)
    }
  } else {
    lines.push('Wochenlimit: noch keine Messung (kommt mit der nächsten Antwort)')
  }
  if (s.fiveHour) {
    lines.push(`5-Stunden-Fenster: ${pct(s.fiveHour.pct)}${s.fiveHour.resetsAt ? ` · Reset ${when(s.fiveHour.resetsAt)}` : ''}`)
  }
  if (s.context) {
    const { percent, tokens: used, window } = s.context
    lines.push(
      percent === undefined
        ? `Kontext dieser Session: noch leer (Fenster ${tokens(window)} Tokens)`
        : `Kontext dieser Session: ${pct(percent)} (${tokens(used ?? 0)} von ${tokens(window)} Tokens)`,
    )
  }
  if (s.usd !== undefined) lines.push(`Diese Session ≈ $${s.usd.toFixed(2)} API-Gegenwert`)
  return lines
}

/** This session's own clock of turns and spend; a reload starts it over. */
type Me = {
  turnStartedAt: number
  turnEndedAt: number
  isTurnRunning: boolean
  usdMark: number
  queue: Promise<void>
}

async function refresh($: EngineInterface, me: Me, u: Figures) {
  const now = await $.clock.now()
  const week = toWindow(u.rateLimits, 'seven_day')
  const usd = u.cost?.usd
  let ledger = (await $.store.get('ledger')) as Ledger | undefined

  if (week?.resetsAt) {
    const reading = { pct: week.pct, resetsAt: week.resetsAt, at: now }
    const isClean =
      ledger !== undefined &&
      me.turnStartedAt > 0 &&
      ledger.lastAt >= me.turnStartedAt &&
      (me.isTurnRunning || now - me.turnEndedAt < 60_000)
    const moved = isNewWeek(ledger, reading) || reading.pct > (ledger?.lastPct ?? 0)
    ledger = apply(ledger, reading, { isClean, usd: (usd ?? 0) - me.usdMark })
    if (moved) me.usdMark = usd ?? 0
    await $.store.set('ledger', ledger)
  }

  const s: Snapshot = {
    week,
    fiveHour: toWindow(u.rateLimits, 'five_hour'),
    ledger: week ? ledger : undefined,
    context: { percent: u.context.percent, tokens: u.context.tokens, window: u.context.window },
    usd,
  }
  await update($, snapshot, () => s)
}

// One refresh at a time: the ledger is read, changed and written back.
function enqueue($: EngineInterface, me: Me, u: Figures) {
  me.queue = me.queue.then(() => refresh($, me, u)).catch(() => {})
  return me.queue
}

async function refreshNow($: EngineInterface, me: Me) {
  await enqueue($, me, await $.session.usage())
}

export const register: Register = on => {
  const me: Me = { turnStartedAt: 0, turnEndedAt: 0, isTurnRunning: false, usdMark: 0, queue: Promise.resolve() }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'nutzung',
      description:
        'Wochenkontingent mit Aufteilung lokal / Web, 5h-Fenster und Kontext (band: Band ein/aus · reset: Aufteilung neu beginnen)',
    })
    me.usdMark = (await $.session.usage()).cost?.usd ?? 0
    await refreshNow($, me)
    return started
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      me.turnStartedAt = await $.clock.now()
      me.isTurnRunning = true
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      me.turnEndedAt = await $.clock.now()
      me.isTurnRunning = false
    }
    return next(e)
  })

  // A reading after every model response, so a turn's own usage is told
  // apart from what happened elsewhere while this PC was idle.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    void refreshNow($, me).catch(() => {})
    return result
  })

  on('session.measure', async ($, e, next) => {
    await enqueue($, me, e)
    return next(e)
  })

  on('command.run', { command: 'nutzung' }, async ($, e) => {
    if (e.args.trim() === 'band') {
      const isHidden = await update($, isBandHidden, h => !h)
      return { text: isHidden ? 'Band ausgeblendet.' : 'Band eingeblendet.' }
    }
    if (e.args.trim() === 'reset') {
      await $.store.delete('ledger')
      await refreshNow($, me)
      return { text: 'Aufteilung zurückgesetzt: gezählt wird ab jetzt neu.' }
    }
    await refreshNow($, me)
    const s = await read($, snapshot)
    return { text: s ? details(s).join('\n') : 'Noch keine Nutzungsdaten.' }
  })

  // Diagnosis: which components each surface raises, kept in the store.
  const seen = new Set<string>()
  on('ui.render', async ($, e, next) => {
    const id = `${e.surface}:${e.component}`
    if (!seen.has(id)) {
      seen.add(id)
      const at = await $.clock.now()
      void $.store.set('seen', [...seen, `at ${at}`]).catch(() => {})
    }
    return next(e)
  })

  // The band above the prompt: session and week limits, other mods' bands beneath.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snapshot)
    const parts = s ? bandParts(s) : []
    if (parts.length === 0 || e.props.hasSurvey || (await read($, isBandHidden))) {
      return next(e)
    }
    // Claude Code's own placeholder ({ type: 'engine' }) is never nested: the desktop drops a band that nests it.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const hide = <Button key="nutzung-hide" label="✕" plain role="dismiss" onPress={() => update($, isBandHidden, () => true)} />

    // Die Elementtabelle des Terminals hat ein Svg, das nichts zeichnet: darum auch die Oberfläche prüfen.
    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      const width = Math.max(300, Math.min(1600, (e.props.bodyColumns || 100) * 8 - 48))
      const { source, height } = bandSvg(parts, width)
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Svg source={source} alt={parts.map(p => p.text).join(', ')} width={width} height={height} />
            {hide}
          </Box>
          {below}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" alignItems="center" gap={2}>
          {parts.map(p => (
            <Text key={p.key} color={p.color} dimColor={p.color === undefined} wrap="truncate-end">
              {p.text}
            </Text>
          ))}
          {hide}
        </Box>
        {below}
      </Box>
    )
  })

  // The footer's dim mode labels, right of the prompt: one more label there.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const s = await read($, snapshot)
    const text = s && label(s)
    void $.store.set('lastSessionMode', { surface: e.surface, modes: e.props.modes, text: text ?? null }).catch(() => {})
    if (!text) {
      return next(e)
    }
    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, text] } })
  })
}
