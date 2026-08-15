import {DomainError} from '../../../src/domain/task';
import type {Subtask, Task, TaskInput} from '../../../src/domain/task';
import type {
  KeyValueStorage,
  TaskRepository,
} from '../../../src/data/taskRepository';

type Expect<T extends true> = T;
type Exact<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;

type ExpectedSubtask = {
  id: string;
  taskId: string;
  title: string;
  status: 'pending' | 'completed';
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type ExpectedTask = {
  id: string;
  title: string;
  description: string;
  important: boolean;
  urgent: boolean;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  startAt: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  deletedAt: string | null;
  score: number | null;
  scoreAwardedAt: string | null;
  subtasks: Subtask[];
};

type ExpectedTaskInput = {
  title: string;
  description?: string;
  important: boolean;
  urgent: boolean;
  startAt?: string | null;
  dueAt?: string | null;
};

type RepositoryReadOptions = {includeDeleted?: boolean};
type ExpectedTransaction = {
  create(task: Task): Promise<Task>;
  getById(id: string, options?: RepositoryReadOptions): Promise<Task | null>;
  list(options?: RepositoryReadOptions): Promise<Task[]>;
  update(id: string, patch: Partial<Omit<Task, 'id'>>): Promise<Task>;
  softDelete(id: string, deletedAt: string): Promise<Task>;
};
type ExpectedRepository = ExpectedTransaction & {
  transaction<T>(work: (transaction: ExpectedTransaction) => Promise<T>): Promise<T>;
};
type ExpectedStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type TaskExportIsExact = Expect<Exact<Task, ExpectedTask>>;
export type SubtaskExportIsExact = Expect<Exact<Subtask, ExpectedSubtask>>;
export type TaskInputExportIsExact = Expect<Exact<TaskInput, ExpectedTaskInput>>;
export type RepositoryExportIsStrict = Expect<
  Exact<TaskRepository, ExpectedRepository>
>;
export type StorageExportIsStrict = Expect<
  Exact<KeyValueStorage, ExpectedStorage>
>;
export type DomainErrorHasStableCode = Expect<
  InstanceType<typeof DomainError> extends Error & {readonly code: string}
    ? true
    : false
>;

// This value-level reference ensures DomainError remains a named runtime export,
// while all interface checks above remain compile-time only under `tsc --noEmit`.
export const domainErrorExport: typeof DomainError = DomainError;
