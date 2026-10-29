export type StepStatus = 'pending' | 'in_progress' | 'completed'

/** Ein Schritt der Aufgabenliste, wie Claude sie über update_plan führt. */
export type Step = { content: string; status: StepStatus }

/** Die aktuelle Aufgabenliste; `isFinished` setzt der Abschluss (wrap_up). */
export type Plan = { steps: Step[]; isFinished: boolean }

/** Ein laufender Subagent. */
export type Run = { id: string; label: string }

/** Wann das 5-Stunden-Fenster und die Woche zurückgesetzt werden (ISO 8601). */
export type Resets = { fiveHour?: string; week?: string }

declare module 'claude-code' {
  interface PluginState {
    fortschritt: {
      plan: Plan | null
      agents: Run[]
      resets: Resets | null
      /** Leiste mit ✕ ausgeblendet, bis eine neue Liste oder ein neuer Agent kommt. */
      isHidden: boolean
    }
  }
}
