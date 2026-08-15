import type {FocusSession} from '../domain/focusSession';
import type {Task} from '../domain/task';

export type DelayDiagnosisTrigger =
  | 'scheduled_start_missed'
  | 'repeated_delay'
  | 'reminder_dismissed'
  | 'due_progress_risk'
  | 'user_stuck'
  | 'focus_interrupted';

export type DelayDiagnosisSignals = Readonly<{
  consecutiveDelayCount: number;
  dismissedReminderCount: number;
  progressRatio: number;
  userStuck: boolean;
}>;

export type DelayDiagnosisPolicy = Readonly<{
  minimumConsecutiveDelays: number;
  minimumReminderDismissals: number;
  dueRiskWindowMinutes: number;
  dueRiskProgressBelow: number;
  allowedReasonKeys: readonly string[];
  maxPrivateTextCodePoints: number;
}>;

export type DelayDiagnosisEligibilityInput = Readonly<{
  task: Task;
  focusSession: FocusSession | null;
  now: string;
  signals: DelayDiagnosisSignals;
  policy: DelayDiagnosisPolicy;
}>;

export type DelayDiagnosisEligibility = Readonly<{
  eligible: boolean;
  triggers: readonly DelayDiagnosisTrigger[];
}>;

export type DelaySuggestion =
  | Readonly<{kind: 'first_step'; value: string}>
  | Readonly<{kind: 'estimated_minutes'; value: number}>
  | Readonly<{kind: 'reschedule'; scheduledStartAt: string}>;

export type DelayDiagnosis = Readonly<{
  id: string;
  taskId: string;
  focusSessionId: string | null;
  trigger: DelayDiagnosisTrigger;
  reasonKey: string;
  privateText: string | null;
  suggestions: readonly DelaySuggestion[];
  createdAt: string;
}>;

export type DelayDiagnosisContext = Readonly<{
  task: Task | null;
  focusSession: FocusSession | null;
}>;

export type DelayDiagnosisContextPort = {
  load(
    taskId: string,
    focusSessionId: string | null,
  ): Promise<DelayDiagnosisContext>;
};

export type DelayDiagnosisOperationRecord = Readonly<{
  operationId: string;
  fingerprint: string;
  diagnosis: DelayDiagnosis;
}>;

export type DelayDiagnosisTransaction = {
  getOperation(
    operationId: string,
  ): Promise<DelayDiagnosisOperationRecord | null>;
  saveDiagnosis(diagnosis: DelayDiagnosis): Promise<void>;
  saveOperation(record: DelayDiagnosisOperationRecord): Promise<void>;
};

export type DelayDiagnosisRepository = {
  getOperation(
    operationId: string,
  ): Promise<DelayDiagnosisOperationRecord | null>;
  list(taskId?: string): Promise<readonly DelayDiagnosis[]>;
  transaction<T>(
    work: (transaction: DelayDiagnosisTransaction) => Promise<T>,
  ): Promise<T>;
};

export type DelayDiagnosisSubmitInput = Readonly<{
  taskId: string;
  focusSessionId: string | null;
  signals: DelayDiagnosisSignals;
  trigger: DelayDiagnosisTrigger;
  reasonKey: string;
  privateText: string | null;
  suggestions: readonly DelaySuggestion[];
}>;

export type DelayDiagnosisOperation = Readonly<{operationId: string}>;

export type DelayDiagnosisSummaryCount = Readonly<{
  key: string;
  count: number;
}>;

export type DelayDiagnosisSummary = Readonly<{
  total: number;
  byReason: readonly DelayDiagnosisSummaryCount[];
  byTrigger: readonly DelayDiagnosisSummaryCount[];
}>;

export type DelayDiagnosisService = {
  submit(
    input: DelayDiagnosisSubmitInput,
    operation: DelayDiagnosisOperation,
  ): Promise<DelayDiagnosis>;
  listForTask(taskId: string): Promise<readonly DelayDiagnosis[]>;
  summarize(taskId?: string): Promise<DelayDiagnosisSummary>;
};

class DelayDiagnosisError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'DelayDiagnosisError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type NormalizedSubmit = Readonly<{
  taskId: string;
  focusSessionId: string | null;
  signals: DelayDiagnosisSignals;
  trigger: DelayDiagnosisTrigger;
  reasonKey: string;
  privateText: string | null;
  suggestions: readonly DelaySuggestion[];
}>;

function isTerminalTask(task: Task): boolean {
  return (
    task.deletedAt !== null ||
    task.status === 'completed' ||
    task.status === 'cancelled'
  );
}

function cloneSuggestion(suggestion: DelaySuggestion): DelaySuggestion {
  if (suggestion.kind === 'reschedule') {
    return {
      kind: 'reschedule',
      scheduledStartAt: suggestion.scheduledStartAt,
    };
  }
  if (suggestion.kind === 'estimated_minutes') {
    return {kind: 'estimated_minutes', value: suggestion.value};
  }
  return {kind: 'first_step', value: suggestion.value};
}

function cloneDiagnosis(diagnosis: DelayDiagnosis): DelayDiagnosis {
  return {
    ...diagnosis,
    suggestions: diagnosis.suggestions.map(cloneSuggestion),
  };
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function normalizePrivateText(
  value: string | null,
  maximumCodePoints: number,
): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  if ([...trimmed].length > maximumCodePoints) {
    throw new DelayDiagnosisError(
      'DELAY_DIAGNOSIS_PRIVATE_TEXT_TOO_LONG',
    );
  }
  return trimmed;
}

function normalizeSubmit(
  input: DelayDiagnosisSubmitInput,
  policy: DelayDiagnosisPolicy,
): NormalizedSubmit {
  if (!policy.allowedReasonKeys.includes(input.reasonKey)) {
    throw new DelayDiagnosisError('DELAY_DIAGNOSIS_REASON_INVALID');
  }
  return {
    taskId: input.taskId,
    focusSessionId: input.focusSessionId,
    signals: {
      consecutiveDelayCount: input.signals.consecutiveDelayCount,
      dismissedReminderCount: input.signals.dismissedReminderCount,
      progressRatio: input.signals.progressRatio,
      userStuck: input.signals.userStuck,
    },
    trigger: input.trigger,
    reasonKey: input.reasonKey,
    privateText: normalizePrivateText(
      input.privateText,
      policy.maxPrivateTextCodePoints,
    ),
    suggestions: input.suggestions.map(cloneSuggestion),
  };
}

function fingerprint(command: NormalizedSubmit): string {
  return JSON.stringify({
    taskId: command.taskId,
    focusSessionId: command.focusSessionId,
    signals: {
      consecutiveDelayCount: command.signals.consecutiveDelayCount,
      dismissedReminderCount: command.signals.dismissedReminderCount,
      progressRatio: command.signals.progressRatio,
      userStuck: command.signals.userStuck,
    },
    trigger: command.trigger,
    reasonKey: command.reasonKey,
    privateText: command.privateText,
    suggestions: command.suggestions.map(cloneSuggestion),
  });
}

function canonicalMilliseconds(value: string): number {
  return Date.parse(value);
}

export function deriveDelayDiagnosisEligibility(
  input: DelayDiagnosisEligibilityInput,
): DelayDiagnosisEligibility {
  if (isTerminalTask(input.task)) {
    return {eligible: false, triggers: []};
  }

  const triggers: DelayDiagnosisTrigger[] = [];
  const now = canonicalMilliseconds(input.now);
  const scheduledStart =
    input.task.scheduledStartAt === undefined
      ? input.task.startAt
      : input.task.scheduledStartAt;
  if (
    scheduledStart !== null &&
    input.task.startedAt === null &&
    canonicalMilliseconds(scheduledStart) <= now
  ) {
    triggers.push('scheduled_start_missed');
  }
  if (
    input.signals.consecutiveDelayCount >=
    input.policy.minimumConsecutiveDelays
  ) {
    triggers.push('repeated_delay');
  }
  if (
    input.signals.dismissedReminderCount >=
    input.policy.minimumReminderDismissals
  ) {
    triggers.push('reminder_dismissed');
  }
  if (input.task.dueAt !== null) {
    const due = canonicalMilliseconds(input.task.dueAt);
    const riskWindow = input.policy.dueRiskWindowMinutes * 60_000;
    if (
      due >= now &&
      due - now <= riskWindow &&
      input.signals.progressRatio < input.policy.dueRiskProgressBelow
    ) {
      triggers.push('due_progress_risk');
    }
  }
  if (input.signals.userStuck) {
    triggers.push('user_stuck');
  }
  if (
    input.focusSession !== null &&
    input.focusSession.taskId === input.task.id &&
    input.focusSession.status === 'interrupted'
  ) {
    triggers.push('focus_interrupted');
  }
  return {eligible: triggers.length > 0, triggers};
}

function requestedTriggerNeedsClock(trigger: DelayDiagnosisTrigger): boolean {
  return (
    trigger === 'scheduled_start_missed' ||
    trigger === 'due_progress_risk'
  );
}

function requestedTriggerIsEligible(
  task: Task,
  session: FocusSession | null,
  command: NormalizedSubmit,
  policy: DelayDiagnosisPolicy,
  now: string | null,
): boolean {
  switch (command.trigger) {
    case 'scheduled_start_missed': {
      if (now === null) {
        return false;
      }
      const scheduledStart =
        task.scheduledStartAt === undefined
          ? task.startAt
          : task.scheduledStartAt;
      return (
        scheduledStart !== null &&
        task.startedAt === null &&
        canonicalMilliseconds(scheduledStart) <= canonicalMilliseconds(now)
      );
    }
    case 'repeated_delay':
      return (
        command.signals.consecutiveDelayCount >=
        policy.minimumConsecutiveDelays
      );
    case 'reminder_dismissed':
      return (
        command.signals.dismissedReminderCount >=
        policy.minimumReminderDismissals
      );
    case 'due_progress_risk': {
      if (now === null || task.dueAt === null) {
        return false;
      }
      const nowMilliseconds = canonicalMilliseconds(now);
      const dueMilliseconds = canonicalMilliseconds(task.dueAt);
      return (
        dueMilliseconds >= nowMilliseconds &&
        dueMilliseconds - nowMilliseconds <=
          policy.dueRiskWindowMinutes * 60_000 &&
        command.signals.progressRatio < policy.dueRiskProgressBelow
      );
    }
    case 'user_stuck':
      return command.signals.userStuck;
    case 'focus_interrupted':
      return (
        session !== null &&
        session.taskId === task.id &&
        session.status === 'interrupted'
      );
  }
}

function validateContextStructure(
  context: DelayDiagnosisContext,
  command: NormalizedSubmit,
): Task {
  const task = context.task;
  if (task === null) {
    throw new DelayDiagnosisError('DELAY_DIAGNOSIS_TASK_NOT_FOUND');
  }
  if (task.id !== command.taskId) {
    throw new DelayDiagnosisError('DELAY_DIAGNOSIS_TASK_ID_MISMATCH');
  }
  if (isTerminalTask(task)) {
    throw new DelayDiagnosisError('DELAY_DIAGNOSIS_TASK_TERMINAL');
  }
  if (command.focusSessionId !== null) {
    if (context.focusSession === null) {
      throw new DelayDiagnosisError('DELAY_DIAGNOSIS_SESSION_NOT_FOUND');
    }
    if (context.focusSession.id !== command.focusSessionId) {
      throw new DelayDiagnosisError('DELAY_DIAGNOSIS_SESSION_ID_MISMATCH');
    }
    if (context.focusSession.taskId !== task.id) {
      throw new DelayDiagnosisError(
        'DELAY_DIAGNOSIS_SESSION_TASK_MISMATCH',
      );
    }
  }
  return task;
}

function validateTriggerEligibility(
  task: Task,
  context: DelayDiagnosisContext,
  command: NormalizedSubmit,
  policy: DelayDiagnosisPolicy,
  validationTime: string | null,
): void {
  if (
    !requestedTriggerIsEligible(
      task,
      context.focusSession,
      command,
      policy,
      validationTime,
    )
  ) {
    throw new DelayDiagnosisError(
      'DELAY_DIAGNOSIS_TRIGGER_NOT_ELIGIBLE',
    );
  }
}

function compareDiagnoses(left: DelayDiagnosis, right: DelayDiagnosis): number {
  const timeOrder =
    canonicalMilliseconds(right.createdAt) -
    canonicalMilliseconds(left.createdAt);
  return timeOrder !== 0 ? timeOrder : compareStrings(left.id, right.id);
}

function countsFor(
  diagnoses: readonly DelayDiagnosis[],
  select: (diagnosis: DelayDiagnosis) => string,
): readonly DelayDiagnosisSummaryCount[] {
  const counts = new Map<string, number>();
  for (const diagnosis of diagnoses) {
    const key = select(diagnosis);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.keys()]
    .sort(compareStrings)
    .map(key => ({key, count: counts.get(key) ?? 0}));
}

export function createDelayDiagnosisService(
  options: Readonly<{
    context: DelayDiagnosisContextPort;
    repository: DelayDiagnosisRepository;
    now(): string;
    idGenerator(): string;
    policy: DelayDiagnosisPolicy;
  }>,
): DelayDiagnosisService {
  async function readOperation(
    operationId: string,
    commandFingerprint: string,
  ): Promise<DelayDiagnosis | null> {
    const existing = await options.repository.getOperation(operationId);
    if (existing === null) {
      return null;
    }
    if (existing.fingerprint !== commandFingerprint) {
      throw new DelayDiagnosisError('DELAY_DIAGNOSIS_OPERATION_CONFLICT');
    }
    return cloneDiagnosis(existing.diagnosis);
  }

  async function loadAndValidate(
    command: NormalizedSubmit,
  ): Promise<Readonly<{
    context: DelayDiagnosisContext;
    reservedTime: string | null;
  }>> {
    const context = await options.context.load(
      command.taskId,
      command.focusSessionId,
    );
    const task = validateContextStructure(context, command);
    const reservedTime = requestedTriggerNeedsClock(command.trigger)
      ? options.now()
      : null;
    validateTriggerEligibility(
      task,
      context,
      command,
      options.policy,
      reservedTime,
    );
    return {context, reservedTime};
  }

  return {
    async submit(input, operation) {
      const command = normalizeSubmit(input, options.policy);
      const commandFingerprint = fingerprint(command);

      const existing = await readOperation(
        operation.operationId,
        commandFingerprint,
      );
      if (existing !== null) {
        return cloneDiagnosis(existing);
      }

      const validated = await loadAndValidate(command);
      const result = await options.repository.transaction(
        async transaction => {
          const existing = await transaction.getOperation(
            operation.operationId,
          );
          if (existing !== null) {
            if (existing.fingerprint !== commandFingerprint) {
              throw new DelayDiagnosisError(
                'DELAY_DIAGNOSIS_OPERATION_CONFLICT',
              );
            }
            return cloneDiagnosis(existing.diagnosis);
          }

          const diagnosis: DelayDiagnosis = {
            id: options.idGenerator(),
            taskId: command.taskId,
            focusSessionId: command.focusSessionId,
            trigger: command.trigger,
            reasonKey: command.reasonKey,
            privateText: command.privateText,
            suggestions: command.suggestions.map(cloneSuggestion),
            createdAt: validated.reservedTime ?? options.now(),
          };
          await transaction.saveDiagnosis(diagnosis);
          await transaction.saveOperation({
            operationId: operation.operationId,
            fingerprint: commandFingerprint,
            diagnosis,
          });
          return cloneDiagnosis(diagnosis);
        },
      );
      return cloneDiagnosis(result);
    },

    async listForTask(taskId) {
      const diagnoses = await options.repository.list(taskId);
      return diagnoses.map(cloneDiagnosis).sort(compareDiagnoses);
    },

    async summarize(taskId) {
      const diagnoses = await options.repository.list(taskId);
      return {
        total: diagnoses.length,
        byReason: countsFor(diagnoses, diagnosis => diagnosis.reasonKey),
        byTrigger: countsFor(diagnoses, diagnosis => diagnosis.trigger),
      };
    },
  };
}
