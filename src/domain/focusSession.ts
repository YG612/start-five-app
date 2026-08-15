export type FocusDurationMinutes = 2 | 5 | 15 | 25 | 45 | 50;

export type FocusSessionStatus = 'running' | 'completed' | 'interrupted';

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

export type FocusSessionInput = Readonly<{
  taskId: string;
  plannedMinutes: FocusDurationMinutes;
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
