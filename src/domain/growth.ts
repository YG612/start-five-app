import type {Task} from './task';
import {effectiveQuadrantForTask} from './taskPriority';

export const TASK_GROWTH_SCHEMA_VERSION = 1 as const;
export const FIRST_START_REWARD_POINTS = 3 as const;
export const FIRST_STEP_REWARD_POINTS = 5 as const;

export type GrowthStage = Readonly<{
  id: 'seed' | 'sprout' | 'two_leaves' | 'seedling' | 'branch' | 'bloom';
  minScore: number;
  title: string;
  description: string;
}>;

export const GROWTH_STAGES: readonly GrowthStage[] = [
  {id: 'seed', minScore: 0, title: '种子', description: '一次开始，也会留下变化。'},
  {id: 'sprout', minScore: 3, title: '发芽', description: '已经跨过了最难的开始。'},
  {id: 'two_leaves', minScore: 10, title: '两片叶', description: '小步正在积累成稳定行动。'},
  {id: 'seedling', minScore: 30, title: '小苗', description: '持续推进让方向逐渐清晰。'},
  {id: 'branch', minScore: 100, title: '枝条', description: '重要行动正在形成节奏。'},
  {id: 'bloom', minScore: 300, title: '开花', description: '许多真实小步已经汇成成果。'},
] as const;

export type GrowthRewardKind = 'task_first_start' | 'task_first_step';

export type GrowthRewardRecord = Readonly<{
  businessKey: string;
  kind: GrowthRewardKind;
  points: 3 | 5;
  awardedAt: string;
}>;

export type FirstStepCompletionRecord = Readonly<{
  businessKey: string;
  completedStep: string;
  completedAt: string;
}>;

export type TaskGrowthFields = Readonly<{
  growthSchemaVersion?: typeof TASK_GROWTH_SCHEMA_VERSION;
  growthRewards?: readonly GrowthRewardRecord[];
  firstStepCompletion?: FirstStepCompletionRecord | null;
}>;

export type TaskWithGrowth = Task & TaskGrowthFields;

export type GrowthAwardResult = Readonly<{
  task: TaskWithGrowth;
  points: number;
  businessKey: string;
}>;

export type GrowthProgress = Readonly<{
  stage: GrowthStage;
  nextStage: GrowthStage | null;
  score: number;
  pointsToNext: number;
  progressRatio: number;
}>;

export type RecentGrowthReward = Readonly<{
  businessKey: string;
  taskId: string;
  taskTitle: string;
  kind: GrowthRewardKind | 'task_completion';
  points: number;
  awardedAt: string;
}>;

const GROWTH_KEYS = [
  'growthSchemaVersion',
  'growthRewards',
  'firstStepCompletion',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function nonBlank(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function canonicalTimestamp(value: unknown): string | null {
  const text = nonBlank(value);
  if (text === null) return null;
  const milliseconds = Date.parse(text);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

export function firstStartBusinessKey(taskId: string): string {
  return `task-first-start:${taskId}`;
}

export function firstStepBusinessKey(taskId: string): string {
  return `task-first-step:${taskId}`;
}

export function normalizeGrowthRewardRecord(
  value: unknown,
  expectedTaskId?: string,
): GrowthRewardRecord | null {
  if (!isRecord(value)) return null;
  const businessKey = nonBlank(value.businessKey);
  const awardedAt = canonicalTimestamp(value.awardedAt);
  const kind = value.kind;
  const validKind = kind === 'task_first_start' || kind === 'task_first_step';
  const expectedKey = expectedTaskId === undefined || !validKind
    ? null
    : kind === 'task_first_start'
      ? firstStartBusinessKey(expectedTaskId)
      : firstStepBusinessKey(expectedTaskId);
  const validPoints =
    (kind === 'task_first_start' && value.points === FIRST_START_REWARD_POINTS) ||
    (kind === 'task_first_step' && value.points === FIRST_STEP_REWARD_POINTS);
  if (
    businessKey === null ||
    awardedAt === null ||
    !validKind ||
    !validPoints ||
    (expectedKey !== null && businessKey !== expectedKey)
  ) return null;
  return {
    businessKey,
    kind,
    points: value.points as 3 | 5,
    awardedAt,
  };
}

export function normalizeFirstStepCompletion(
  value: unknown,
  expectedTaskId?: string,
): FirstStepCompletionRecord | null {
  if (!isRecord(value)) return null;
  const businessKey = nonBlank(value.businessKey);
  const completedStep = nonBlank(value.completedStep);
  const completedAt = canonicalTimestamp(value.completedAt);
  if (
    businessKey === null ||
    completedStep === null ||
    completedAt === null ||
    (expectedTaskId !== undefined && businessKey !== firstStepBusinessKey(expectedTaskId))
  ) return null;
  return {businessKey, completedStep, completedAt};
}

export function hasTaskGrowthFields(value: object): boolean {
  return GROWTH_KEYS.some(key => hasOwn(value, key));
}

export function normalizeTaskGrowthRecord<T>(value: T): T {
  if (!isRecord(value) || !hasTaskGrowthFields(value)) return value;
  const id = nonBlank(value.id) ?? undefined;
  const rewards = Array.isArray(value.growthRewards)
    ? value.growthRewards
        .map(reward => normalizeGrowthRewardRecord(reward, id))
        .filter((reward): reward is GrowthRewardRecord => reward !== null)
        .filter((reward, index, all) =>
          all.findIndex(candidate => candidate.businessKey === reward.businessKey) === index,
        )
    : [];
  const completion = value.firstStepCompletion === null || value.firstStepCompletion === undefined
    ? null
    : normalizeFirstStepCompletion(value.firstStepCompletion, id);
  return {
    ...value,
    growthSchemaVersion: TASK_GROWTH_SCHEMA_VERSION,
    growthRewards: rewards,
    firstStepCompletion: completion,
  } as T;
}

export function normalizeTaskGrowthSnapshot<T>(value: T): T {
  return Array.isArray(value) ? value.map(normalizeTaskGrowthRecord) as T : value;
}

export function isValidTaskGrowthFields(value: Record<string, unknown>): boolean {
  if (!hasTaskGrowthFields(value)) return true;
  if (
    value.growthSchemaVersion !== TASK_GROWTH_SCHEMA_VERSION ||
    !Array.isArray(value.growthRewards)
  ) return false;
  const taskId = nonBlank(value.id) ?? undefined;
  const normalizedRewards = value.growthRewards.map(reward =>
    normalizeGrowthRewardRecord(reward, taskId),
  );
  if (
    normalizedRewards.some(reward => reward === null) ||
    new Set(normalizedRewards.map(reward => reward?.businessKey)).size !== normalizedRewards.length
  ) return false;
  if (
    value.firstStepCompletion !== null &&
    normalizeFirstStepCompletion(value.firstStepCompletion, taskId) === null
  ) return false;
  const completion = value.firstStepCompletion === null
    ? null
    : normalizeFirstStepCompletion(value.firstStepCompletion, taskId);
  return completion === null || normalizedRewards.some(
    reward => reward?.businessKey === completion.businessKey,
  );
}

export function growthRewardsForTask(task: Task): readonly GrowthRewardRecord[] {
  const rewards = (task as TaskWithGrowth).growthRewards;
  return Array.isArray(rewards)
    ? rewards
        .map(reward => normalizeGrowthRewardRecord(reward, task.id))
        .filter((reward): reward is GrowthRewardRecord => reward !== null)
    : [];
}

export function actionRewardScore(task: Task): number {
  return growthRewardsForTask(task).reduce((total, reward) => total + reward.points, 0);
}

export function totalGrowthScore(tasks: readonly Task[]): number {
  return tasks.reduce(
    (total, task) => total + (task.score ?? 0) + actionRewardScore(task),
    0,
  );
}

export function growthProgressForScore(scoreInput: number): GrowthProgress {
  const score = Number.isFinite(scoreInput) ? Math.max(0, Math.floor(scoreInput)) : 0;
  let stage = GROWTH_STAGES[0]!;
  for (const candidate of GROWTH_STAGES) {
    if (candidate.minScore > score) break;
    stage = candidate;
  }
  const index = GROWTH_STAGES.findIndex(candidate => candidate.id === stage.id);
  const nextStage = GROWTH_STAGES[index + 1] ?? null;
  if (nextStage === null) {
    return {stage, nextStage, score, pointsToNext: 0, progressRatio: 1};
  }
  const span = nextStage.minScore - stage.minScore;
  return {
    stage,
    nextStage,
    score,
    pointsToNext: Math.max(0, nextStage.minScore - score),
    progressRatio: span <= 0 ? 1 : Math.max(0, Math.min(1, (score - stage.minScore) / span)),
  };
}

export function awardFirstStartReward(task: Task, nowInput: string): GrowthAwardResult {
  const businessKey = firstStartBusinessKey(task.id);
  const rewards = growthRewardsForTask(task);
  if (rewards.some(reward => reward.businessKey === businessKey)) {
    return {task: task as TaskWithGrowth, points: 0, businessKey};
  }
  const awardedAt = canonicalTimestamp(nowInput);
  if (awardedAt === null) throw new Error('INVALID_GROWTH_TIMESTAMP');
  const reward: GrowthRewardRecord = {
    businessKey,
    kind: 'task_first_start',
    points: FIRST_START_REWARD_POINTS,
    awardedAt,
  };
  return {
    task: {
      ...task,
      growthSchemaVersion: TASK_GROWTH_SCHEMA_VERSION,
      growthRewards: [...rewards, reward],
      firstStepCompletion: (task as TaskWithGrowth).firstStepCompletion ?? null,
      updatedAt: awardedAt,
    },
    points: reward.points,
    businessKey,
  };
}

export function completeFirstStepWithReward(
  task: Task,
  nextStepInput: string | null | undefined,
  nowInput: string,
): GrowthAwardResult {
  const businessKey = firstStepBusinessKey(task.id);
  const rewards = growthRewardsForTask(task);
  if (rewards.some(reward => reward.businessKey === businessKey)) {
    return {task: task as TaskWithGrowth, points: 0, businessKey};
  }
  if (
    task.deletedAt !== null ||
    task.status === 'completed' ||
    task.status === 'cancelled'
  ) throw new Error('TERMINAL_TASK');
  const completedStep = nonBlank(task.firstStep);
  if (completedStep === null) throw new Error('FIRST_STEP_REQUIRED');
  const completedAt = canonicalTimestamp(nowInput);
  if (completedAt === null) throw new Error('INVALID_GROWTH_TIMESTAMP');
  const nextStep = nonBlank(nextStepInput);
  const reward: GrowthRewardRecord = {
    businessKey,
    kind: 'task_first_step',
    points: FIRST_STEP_REWARD_POINTS,
    awardedAt: completedAt,
  };
  return {
    task: {
      ...task,
      firstStep: nextStep,
      growthSchemaVersion: TASK_GROWTH_SCHEMA_VERSION,
      growthRewards: [...rewards, reward],
      firstStepCompletion: {businessKey, completedStep, completedAt},
      updatedAt: completedAt,
    },
    points: reward.points,
    businessKey,
  };
}

export function undoFirstStepCompletion(task: Task, nowInput: string): TaskWithGrowth {
  const completion = normalizeFirstStepCompletion(
    (task as TaskWithGrowth).firstStepCompletion,
    task.id,
  );
  if (completion === null) return task as TaskWithGrowth;
  const updatedAt = canonicalTimestamp(nowInput);
  if (updatedAt === null) throw new Error('INVALID_GROWTH_TIMESTAMP');
  return {
    ...task,
    firstStep: completion.completedStep,
    growthSchemaVersion: TASK_GROWTH_SCHEMA_VERSION,
    growthRewards: growthRewardsForTask(task).filter(
      reward => reward.businessKey !== completion.businessKey,
    ),
    firstStepCompletion: null,
    updatedAt,
  };
}

export function recentGrowthRewards(
  tasks: readonly Task[],
  limit = 5,
): readonly RecentGrowthReward[] {
  const rewards: RecentGrowthReward[] = [];
  for (const task of tasks) {
    for (const reward of growthRewardsForTask(task)) {
      rewards.push({
        businessKey: reward.businessKey,
        taskId: task.id,
        taskTitle: task.title,
        kind: reward.kind,
        points: reward.points,
        awardedAt: reward.awardedAt,
      });
    }
    if (task.score !== null && task.scoreAwardedAt !== null) {
      rewards.push({
        businessKey: `task-completion:${task.id}`,
        taskId: task.id,
        taskTitle: task.title,
        kind: 'task_completion',
        points: task.score,
        awardedAt: task.scoreAwardedAt,
      });
    }
  }
  return rewards
    .sort((left, right) =>
      right.awardedAt.localeCompare(left.awardedAt) ||
      left.businessKey.localeCompare(right.businessKey),
    )
    .slice(0, Math.max(0, limit));
}

export function growthZoneContribution(tasks: readonly Task[], nowInput: string): number {
  return tasks.reduce((total, task) => {
    const observedAt = task.scoreAwardedAt ??
      growthRewardsForTask(task)[0]?.awardedAt ??
      nowInput;
    return effectiveQuadrantForTask(task, observedAt) === 'Q2'
      ? total + (task.score ?? 0) + actionRewardScore(task)
      : total;
  }, 0);
}
