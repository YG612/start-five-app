export type FirstActivationState = 'creating' | 'created' | 'completed' | 'skipped';

export type FirstActivationRecord = Readonly<{
  version: 1;
  state: FirstActivationState;
  title: string | null;
  taskId: string | null;
  createOperationId: string | null;
  startOperationId: string | null;
}>;

export function firstActivationCreating(
  title: string,
  createOperationId: string,
  startOperationId: string,
): FirstActivationRecord {
  const normalized = title.trim();
  if (normalized === '') {
    throw new Error('FIRST_ACTIVATION_TITLE_REQUIRED');
  }
  return {
    version: 1,
    state: 'creating',
    title: normalized,
    taskId: null,
    createOperationId,
    startOperationId,
  };
}

export const FIRST_ACTIVATION_SKIPPED: FirstActivationRecord = {
  version: 1,
  state: 'skipped',
  title: null,
  taskId: null,
  createOperationId: null,
  startOperationId: null,
};
