/**
 * Wie viel vom Wochenkontingent woher kam, über alle Sessions dieses PCs
 * hinweg geführt (liegt in `$.store` unter `ledger`).
 */
export type Ledger = {
  /** Reset-Zeitpunkt des Wochenfensters (ISO), kennzeichnet die Woche. */
  resetsAt: string
  /** Letzter gesehener Stand in %. */
  lastPct: number
  /** Wann dieser Stand gesehen wurde (ms). */
  lastAt: number
  /** Bereits genutzt, als die Messung in dieser Woche begann. */
  before: number
  /** Claude Code auf diesem PC. */
  local: number
  /** Woanders: claude.ai im Browser, Chat der Desktop-App, Handy. */
  other: number
  /** Gemischte Zeitspanne, noch ohne gelernte Umrechnung. */
  unclear: number
  /** Gelernt: Wochen-% pro US-Dollar API-Gegenwert. */
  pctPerUsd?: number
}

export type Window = { pct: number; resetsAt?: string }

/** Was die Fußzeile und /nutzung zeigen. */
export type Snapshot = {
  week?: Window
  fiveHour?: Window
  ledger?: Ledger
  context?: { percent?: number; tokens?: number; window: number }
  usd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'wochen-nutzung': {
      snapshot: Snapshot | null
      /** Band über dem Prompt ausgeblendet (✕ oder /nutzung band). */
      isBandHidden: boolean
    }
  }
}
