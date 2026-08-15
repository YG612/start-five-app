import type {TaskLifecycleService} from './coreAppService';
import type {FocusSessionService} from './focusSessionService';
import type {Task} from '../domain/task';
import {
  FIRST_ACTIVATION_SKIPPED,
  firstActivationCreating,
  type FirstActivationRecord,
} from '../domain/firstActivation';
import type {FirstActivationRepository} from '../data/firstActivationRepository';

export type FirstActivationService = Readonly<{
  read(): Promise<FirstActivationRecord | null>;
  skip(): Promise<void>;
  activate(title: string): Promise<void>;
}>;

export function createFirstActivationService(options: Readonly<{
  repository: FirstActivationRepository;
  tasks: TaskLifecycleService;
  focus: FocusSessionService;
  startSelectedTask(taskId: string, operationId: string): Promise<Task>;
  idGenerator(): string;
}>): FirstActivationService {
  let inFlight: Promise<void> | null = null;

  async function converge(record: FirstActivationRecord): Promise<void> {
    let current = record;
    if (current.state === 'creating') {
      const created = await options.tasks.create(
        {
          title: current.title ?? '',
          description: '',
          important: false,
          urgent: false,
          scheduledStartAt: null,
          dueAt: null,
          estimatedMinutes: 5,
          firstStep: null,
        },
        {operationId: current.createOperationId ?? ''},
      );
      current = {...current, state: 'created', taskId: created.id};
      await options.repository.write(current);
    }
    if (current.state === 'created' && current.taskId !== null) {
      await options.startSelectedTask(current.taskId, current.startOperationId ?? '');
      const session = await options.focus.start({taskId: current.taskId, plannedMinutes: 5});
      const exact = await options.tasks.getById(current.taskId);
      const active = await options.focus.getActive();
      if (
        exact?.status !== 'in_progress' ||
        session.taskId !== current.taskId ||
        active?.taskId !== current.taskId
      ) {
        throw new Error('FIRST_ACTIVATION_NOT_CONVERGED');
      }
      await options.repository.write({...current, state: 'completed'});
    }
  }

  return {
    read: options.repository.read,
    async skip() {
      const current = await options.repository.read();
      if (current?.state === 'completed' || current?.state === 'skipped') {
        return;
      }
      await options.repository.write(FIRST_ACTIVATION_SKIPPED);
    },
    activate(title) {
      if (inFlight !== null) {
        return inFlight;
      }
      const pending = (async () => {
        const existing = await options.repository.read();
        if (existing?.state === 'completed' || existing?.state === 'skipped') {
          return;
        }
        const record = existing ?? firstActivationCreating(
          title,
          `first-activation:create:${options.idGenerator()}`,
          `first-activation:start:${options.idGenerator()}`,
        );
        if (existing === null) {
          await options.repository.write(record);
        }
        await converge(record);
      })();
      const settled = pending.finally(() => {
        if (inFlight === settled) {
          inFlight = null;
        }
      });
      inFlight = settled;
      return settled;
    },
  };
}
