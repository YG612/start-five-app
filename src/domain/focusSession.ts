export type FocusDurationMinutes = 2 | 5 | 15 | 25 | 50;
export type CurrentFocusDurationMinutes = FocusDurationMinutes | 45;

export type FocusSessionStatus = 'running' | 'completed' | 'interrupted';

export type FocusContextSnapshot = Readonly<{
  taskId: string;
  quadrantAtStart: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  importanceScoreAtStart?: number;
  effectiveUrgencyAtStart?: number;
  dueAtAtStart?: string;
  firstStepIdAtStart?: string;
  focusScheduleId?: string;
}>;

export type FocusSession = Readonly<{
  id: string;
  taskId: string;
  plannedMinutes: FocusDurationMinutes;
  status: FocusSessionStatus;
  startedAt: string;
  plannedEndAt: string;
  endedAt: string | null;
  actualSeconds: number | null;
  interruptionReason: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type CurrentFocusSession = Readonly<
  FocusSession & {
    /** Missing on legacy v1 records; current sessions persist start context. */
    snapshot?: FocusContextSnapshot | null;
  }
>;

export type FocusSessionInput = Readonly<{
  taskId: string;
  plannedMinutes: FocusDurationMinutes;
}>;

export type CurrentFocusSessionInput = Readonly<{
  taskId: string;
  plannedMinutes: CurrentFocusDurationMinutes;
  focusScheduleId?: string;
}>;

export type FocusSessionPatch = Readonly<
  Partial<
    Pick<
      FocusSession,
      | 'status'
      | 'endedAt'
      | 'actualSeconds'
      | 'interruptionReason'
      | 'updatedAt'
    >
  >
>;

export type FocusSessionQueryResult = Readonly<{
  taskId: string;
  sessions: readonly FocusSession[];
  activeSession: FocusSession | null;
}>;

export type CurrentFocusSessionQueryResult = Readonly<{
  taskId: string;
  sessions: readonly CurrentFocusSession[];
  activeSession: CurrentFocusSession | null;
}>;
