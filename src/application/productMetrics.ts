export type ProductEventName =
  | 'home_ready'
  | 'task_sheet_open'
  | 'task_create_open'
  | 'task_create_saved'
  | 'task_move_committed'
  | 'task_move_undone'
  | 'focus_started'
  | 'focus_resumed'
  | 'task_completed'
  | 'task_completion_undone'
  | 'reward_shown'
  | 'stuck_flow_open'
  | 'repair_applied'
  | 'low_energy_changed'
  | 'rescue_plan_created'
  | 'notification_action'
  | 'home_primary_shown'
  | 'home_primary_activated'
  | 'quick_capture_started'
  | 'quick_capture_saved'
  | 'triage_started'
  | 'triage_completed'
  | 'search_opened'
  | 'search_result_action'
  | 'backlog_review_action'
  | 'work_plan_created'
  | 'planned_session_started'
  | 'focus_schedule_saved'
  | 'focus_schedule_action'
  | 'focus_interruption'
  | 'backup_previewed'
  | 'backup_restore_finished';

export interface ProductMetricEvent {
  name: ProductEventName;
  occurredAt: string;
  sessionId: string;
  source?: string;
  durationMs?: number;
  success?: boolean;
  errorCode?: string;
  taskRef?: string;
}

export interface ProductMetricPort {
  record(event: ProductMetricEvent): void | Promise<void>;
}

function safeMetricEvent(event: ProductMetricEvent): ProductMetricEvent {
  return {
    name: event.name,
    occurredAt: event.occurredAt,
    sessionId: event.sessionId,
    ...(event.source === undefined ? {} : {source: event.source}),
    ...(event.durationMs === undefined ? {} : {durationMs: event.durationMs}),
    ...(event.success === undefined ? {} : {success: event.success}),
    ...(event.errorCode === undefined ? {} : {errorCode: event.errorCode}),
    ...(event.taskRef === undefined ? {} : {taskRef: event.taskRef}),
  };
}

export type ProductMetricClock = Readonly<{
  now(): string;
  monotonicNow(): number;
}>;

export class NoopProductMetricPort implements ProductMetricPort {
  record(_event: ProductMetricEvent): void {}
}

export const MAX_IN_MEMORY_PRODUCT_METRICS = 500;

export class InMemoryProductMetricPort implements ProductMetricPort {
  readonly events: ProductMetricEvent[] = [];

  record(event: ProductMetricEvent): void {
    if (this.events.length === MAX_IN_MEMORY_PRODUCT_METRICS) {
      this.events.shift();
    }
    this.events.push(safeMetricEvent(event));
  }

  snapshot(): readonly ProductMetricEvent[] {
    return this.events.map(event => ({...event}));
  }
}

export const SYSTEM_PRODUCT_METRIC_CLOCK: ProductMetricClock = {
  now: () => new Date().toISOString(),
  monotonicNow: () => Date.now(),
};

export function recordProductMetric(
  port: ProductMetricPort,
  event: ProductMetricEvent,
): void {
  try {
    const result = port.record(safeMetricEvent(event));
    if (result instanceof Promise) {
      void result.catch(() => undefined);
    }
  } catch {
    // Metrics are deliberately best-effort and never block user actions.
  }
}
