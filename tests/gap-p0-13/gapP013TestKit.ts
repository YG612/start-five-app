import {act} from '@testing-library/react-native';
import type {
  StartFiveAppComposition,
  StartFiveAppDependencies,
} from '../../src/app/startFiveApp';
import {createStartFiveApp} from '../../src/app/startFiveApp';
import type {
  ReminderPermission,
  ReminderReplaceRequest,
  ReminderScheduleSnapshot,
} from '../../src/application/reminderScheduling';
import type {Task} from '../../src/domain/task';
import {
  ManualFocusRuntimeClock,
  MutableIsoClock,
  PublicMemoryBackend,
  SequenceIds,
  flushUiWork,
} from '../gap-p0-07/gapP007AppRootTestKit';
import {
  PublicTomorrowFirstNotifications,
  chooseTomorrowFirst,
  notificationId,
  renderHarness as renderP010Harness,
  seedTaskWithStep as seedP010TaskWithStep,
  type AppScreen,
} from '../gap-p0-10/gapP010TestKit';

export const OPEN_REMINDER_SETTINGS = '提醒设置';
export const REMINDER_TIME_INPUT = '提醒时间';
export const SAVE_REMINDER_TIME = '保存提醒时间';
export const DISABLE_REMINDER = '关闭提醒';
export const ENABLE_REMINDER = '开启提醒';
export const BACK_TO_WORKSPACE = '返回任务工作台';
export const DEFAULT_LOCAL_TIME = '08:00';
export const REMINDER_DENIED_NONBLOCKING = '提醒未开启，不影响明日第一项';
export const LOCAL_TRIGGER_ERROR = '提醒时间无效，请重试';
export const LOCAL_TRIGGER_NOT_FUTURE = 'LOCAL_TRIGGER_NOT_FUTURE';
export const TIME_SEAMS_PARTIAL = 'TOMORROW_FIRST_TIME_SEAMS_PARTIAL';

export type LocalTriggerInput = Readonly<{
  closureDayKey: string;
  wallClockTime: string;
  timeZone: string;
  now: string;
}>;

type P013Dependencies = StartFiveAppDependencies & Readonly<{
  tomorrowFirstNotifications: PublicTomorrowFirstNotifications;
  currentTimeZone(): string;
  resolveLocalTrigger(input: LocalTriggerInput): string;
}>;

const createP013App = createStartFiveApp as unknown as (
  dependencies: P013Dependencies,
) => StartFiveAppComposition;

function scheduledSemanticsEqual(
  left: ReminderScheduleSnapshot,
  right: ReminderScheduleSnapshot,
): boolean {
  const semantics = (value: ReminderScheduleSnapshot) => ({
    taskId: value.taskId,
    permission: value.permission,
    scheduled: value.scheduled,
    intents: value.intents.map(intent => ({...intent})),
  });
  return JSON.stringify(semantics(left)) === JSON.stringify(semantics(right));
}

export class MutableTomorrowNotifications extends PublicTomorrowFirstNotifications {
  redundantSemanticReplacementAttempted = false;
  private currentPermission: ReminderPermission;
  private nextRequestResult: ReminderPermission;

  constructor(options: Readonly<{
    permission: ReminderPermission;
    requestResult?: ReminderPermission;
  }>) {
    super(options);
    this.currentPermission = options.permission;
    this.nextRequestResult = options.requestResult ?? options.permission;
  }

  setPermission(
    permission: ReminderPermission,
    requestResult: ReminderPermission = permission,
  ): void {
    this.currentPermission = permission;
    this.nextRequestResult = requestResult;
  }

  override async getPermission(): Promise<ReminderPermission> {
    return this.currentPermission;
  }

  override async requestPermission(): Promise<ReminderPermission> {
    this.permissionRequests.push(this.currentPermission);
    this.currentPermission = this.nextRequestResult;
    return this.currentPermission;
  }

  override async replace(request: ReminderReplaceRequest): Promise<void> {
    const ruleId =
      request.next.intents[0]?.ruleId ??
      request.previous?.intents[0]?.ruleId ??
      null;
    if (ruleId !== null && request.next.scheduled) {
      const current = this.active(ruleId);
      if (current !== null && scheduledSemanticsEqual(current, request.next)) {
        this.redundantSemanticReplacementAttempted = true;
      }
    }
    await super.replace(request);
  }
}

export type ControlledReplace = Readonly<{
  reached: Promise<void>;
  release(): void;
}>;

type ReplaceGate = Readonly<{
  reached: Promise<void>;
  markReached(): void;
  released: Promise<void>;
  release(): void;
}>;

export class DeferredTomorrowNotifications extends MutableTomorrowNotifications {
  private nextGate: ReplaceGate | null = null;

  deferNextScheduledReplace(): ControlledReplace {
    if (this.nextGate !== null) {
      throw new Error('TEST_REPLACE_GATE_ALREADY_ARMED');
    }
    let markReached = (): void => undefined;
    let release = (): void => undefined;
    const reached = new Promise<void>(resolve => {
      markReached = resolve;
    });
    const released = new Promise<void>(resolve => {
      release = resolve;
    });
    this.nextGate = {reached, markReached, released, release};
    return {reached, release};
  }

  override async replace(request: ReminderReplaceRequest): Promise<void> {
    const gate = request.next.scheduled ? this.nextGate : null;
    if (gate !== null) {
      this.nextGate = null;
      gate.markReached();
      await gate.released;
    }
    await super.replace(request);
  }
}

export class CapturingLocalTriggerResolver {
  readonly calls: LocalTriggerInput[] = [];

  constructor(
    private resolve: (input: LocalTriggerInput) => string,
  ) {}

  setResolver(resolve: (input: LocalTriggerInput) => string): void {
    this.resolve = resolve;
  }

  readonly invoke = (input: LocalTriggerInput): string => {
    this.calls.push({...input});
    return this.resolve(input);
  };
}

export class MutableTimeZone {
  constructor(private value: string) {}

  readonly current = (): string => this.value;

  set(value: string): void {
    this.value = value;
  }
}

export type P013Harness = Readonly<{
  backend: PublicMemoryBackend;
  clock: MutableIsoClock;
  runtimeClock: ManualFocusRuntimeClock;
  notifications: PublicTomorrowFirstNotifications;
  resolver: CapturingLocalTriggerResolver;
  composition: StartFiveAppComposition;
}>;

export function createP013Harness(options: Readonly<{
  backend?: PublicMemoryBackend;
  at: string;
  idPrefix: string;
  notifications: PublicTomorrowFirstNotifications;
  currentTimeZone(): string;
  resolver: CapturingLocalTriggerResolver;
}>): P013Harness {
  const backend = options.backend ?? new PublicMemoryBackend();
  const clock = new MutableIsoClock(options.at);
  const runtimeClock = new ManualFocusRuntimeClock(options.at);
  const ids = new SequenceIds(options.idPrefix);
  const composition = createP013App({
    storageBackend: backend,
    now: clock.now,
    idGenerator: ids.next,
    focusRuntimeClock: runtimeClock,
    tomorrowFirstNotifications: options.notifications,
    currentTimeZone: options.currentTimeZone,
    resolveLocalTrigger: options.resolver.invoke,
  });
  return {
    backend,
    clock,
    runtimeClock,
    notifications: options.notifications,
    resolver: options.resolver,
    composition,
  };
}

export function createPartialTimeSeamApp(options: Readonly<{
  at: string;
  idPrefix: string;
  notifications: PublicTomorrowFirstNotifications;
}>): StartFiveAppComposition {
  const clock = new MutableIsoClock(options.at);
  const ids = new SequenceIds(options.idPrefix);
  return createStartFiveApp({
    storageBackend: new PublicMemoryBackend(),
    now: clock.now,
    idGenerator: ids.next,
    tomorrowFirstNotifications: options.notifications,
    currentTimeZone: () => 'Asia/Shanghai',
  } as unknown as StartFiveAppDependencies);
}

export async function renderHarness(harness: P013Harness): Promise<AppScreen> {
  return renderP010Harness(harness);
}

export async function seedTaskWithStep(
  harness: P013Harness,
  input: Readonly<{
    title: string;
    stepTitle: string;
    important: boolean;
    urgent: boolean;
    operationPrefix: string;
  }>,
): Promise<Task> {
  return seedP010TaskWithStep(harness, input);
}

export async function settleUi(): Promise<void> {
  await act(async () => {
    await flushUiWork();
  });
}

export function reminderSummary(localTime: string): string {
  return `明日提醒：约 ${localTime}`;
}

export {chooseTomorrowFirst, notificationId};
export type {AppScreen};
