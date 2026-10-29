import type { Ledger } from '../types'

export type Reading = { pct: number; resetsAt: string; at: number }

/**
 * `isClean`: the previous reading came while this session's turn was already
 * running, so everything since is Claude Code on this PC. `usd`: what this
 * session spent since the ledger last moved.
 */
export type Span = { isClean: boolean; usd: number }

const round1 = (n: number) => Math.round(n * 10) / 10

// The reset time jitters by seconds between responses; a new week is days away.
const isSameWeek = (a: string, b: string) =>
  Math.abs(Date.parse(a) - Date.parse(b)) < 3 * 3600 * 1000

export const isNewWeek = (ledger: Ledger | undefined, reading: Reading) =>
  !ledger || !isSameWeek(ledger.resetsAt, reading.resetsAt)

export function apply(ledger: Ledger | undefined, reading: Reading, span: Span): Ledger {
  if (!ledger || isNewWeek(ledger, reading)) {
    return {
      resetsAt: reading.resetsAt,
      lastPct: reading.pct,
      lastAt: reading.at,
      before: reading.pct,
      local: 0,
      other: 0,
      unclear: 0,
      pctPerUsd: ledger?.pctPerUsd,
    }
  }

  const delta = round1(reading.pct - ledger.lastPct)
  if (delta <= 0) {
    return { ...ledger, lastAt: reading.at }
  }

  const next: Ledger = { ...ledger, lastPct: reading.pct, lastAt: reading.at }

  if (span.isClean) {
    next.local = round1(next.local + delta)
    if (span.usd > 0.05) {
      const ratio = delta / span.usd
      next.pctPerUsd = ledger.pctPerUsd === undefined ? ratio : ledger.pctPerUsd * 0.7 + ratio * 0.3
    }
    return next
  }

  if (span.usd <= 0) {
    next.other = round1(next.other + delta)
  } else if (ledger.pctPerUsd !== undefined) {
    const mine = Math.min(delta, round1(ledger.pctPerUsd * span.usd))
    next.local = round1(next.local + mine)
    next.other = round1(next.other + delta - mine)
  } else {
    next.unclear = round1(next.unclear + delta)
  }

  return next
}
