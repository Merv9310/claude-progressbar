import type { Plan, Step, StepStatus } from '../types'

/** Was update_plan bekommt: eine ganze Liste oder ein Weiterschalten. */
export type PlanInput = {
  items?: { content?: unknown; status?: unknown }[]
  advance?: boolean
  done?: number[]
  start?: number
}

const toStatus = (s: unknown): StepStatus => (s === 'completed' || s === 'in_progress' ? s : 'pending')

/** Die Liste nach einem update_plan-Aufruf, mit denselben Regeln wie die App. */
export function applyPlan(prev: Plan | null, input: PlanInput): Plan | null {
  if (Array.isArray(input.items)) {
    const steps = input.items.map((i): Step => ({ content: String(i.content ?? ''), status: toStatus(i.status) }))
    return { steps, isFinished: false }
  }
  if (!prev) return prev

  const steps = prev.steps.map(s => ({ ...s }))
  // `at` zählt ab 0; ein Index außerhalb der Liste ändert nichts.
  const mark = (at: number, status: StepStatus) => {
    const step = steps[at]
    if (step) step.status = status
  }
  if (input.advance) {
    mark(steps.findIndex(s => s.status === 'in_progress'), 'completed')
    mark(steps.findIndex(s => s.status === 'pending'), 'in_progress')
  }
  for (const n of input.done ?? []) mark(n - 1, 'completed')
  if (input.start !== undefined) mark(input.start - 1, 'in_progress')
  return { ...prev, steps }
}

/** wrap_up hakt die ganze Liste ab. */
export const finishPlan = (prev: Plan | null): Plan | null =>
  prev && { steps: prev.steps.map(s => ({ ...s, status: 'completed' as const })), isFinished: true }

export const doneOf = (p: Plan): number => p.steps.filter(s => s.status === 'completed').length

/** Der Titel links: der laufende Schritt, sonst der nächste offene. */
export function titleOf(p: Plan): string {
  if (p.isFinished) return 'Erledigt'
  const step = p.steps.find(s => s.status === 'in_progress') ?? p.steps.find(s => s.status === 'pending')
  return step?.content || 'Aufgabenliste'
}
