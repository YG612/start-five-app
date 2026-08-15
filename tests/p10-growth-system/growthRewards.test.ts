import {
  totalGrowthScore,
  type TaskWithGrowth,
} from '../../src/domain/growth';
import {
  createLifecycleTask,
  createWorkspaceHarness,
  WorkspaceBackend,
  WorkspaceClock,
  WorkspaceIds,
} from '../gap-p0-06r1/gapP006TestKit';

const NOW = '2026-08-14T08:00:00.000Z';
const input = {
  title: '准备成长测试',
  description: '',
  important: true,
  urgent: false,
  dueAt: null,
  estimatedMinutes: 15,
  firstStep: '写三条结论',
};

describe('P10-02 first action rewards', () => {
  it('awards first start once across distinct operations and a byte restart', async () => {
    const backend = new WorkspaceBackend();
    const first = createWorkspaceHarness(
      backend,
      new WorkspaceClock(NOW),
      new WorkspaceIds(['reward-start-task']),
    );
    await createLifecycleTask(first, input, 'p10:start:create');
    const started = await first.composition.service.startRecommended({operationId: 'p10:start:1'});
    expect((started as TaskWithGrowth).growthRewards).toEqual([
      expect.objectContaining({businessKey: `task-first-start:${started.id}`, points: 3}),
    ]);
    expect(totalGrowthScore((await first.composition.service.getState()).tasks)).toBe(3);

    const restarted = createWorkspaceHarness(
      backend.byteRestart(),
      new WorkspaceClock('2026-08-14T08:02:00.000Z'),
      new WorkspaceIds(['unused']),
    );
    const repeated = await restarted.composition.service.startRecommended({operationId: 'p10:start:2'});
    expect((repeated as TaskWithGrowth).growthRewards).toHaveLength(1);
    expect(totalGrowthScore((await restarted.composition.service.getState()).tasks)).toBe(3);
  });

  it('awards first-step completion once without completing the task', async () => {
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['reward-step-task']),
    );
    const task = await createLifecycleTask(harness, input, 'p10:step:create');
    const first = await harness.composition.service.completeFirstStep!(
      task.id,
      {nextStep: '整理成一页'},
      {operationId: 'p10:step:1'},
    );
    const repeated = await harness.composition.service.completeFirstStep!(
      task.id,
      {nextStep: '这次输入不能覆盖'},
      {operationId: 'p10:step:2'},
    );
    expect(first.points).toBe(5);
    expect(repeated.points).toBe(0);
    expect(repeated.task).toMatchObject({
      status: 'pending',
      completedAt: null,
      firstStep: '整理成一页',
      firstStepCompletion: {completedStep: '写三条结论'},
    });
    expect(totalGrowthScore((await harness.composition.service.getState()).tasks)).toBe(5);
  });

  it('undoes the first-step record and reward, then permits one new award', async () => {
    const harness = createWorkspaceHarness(
      new WorkspaceBackend(),
      new WorkspaceClock(NOW),
      new WorkspaceIds(['reward-undo-task']),
    );
    const task = await createLifecycleTask(harness, input, 'p10:undo:create');
    await harness.composition.service.completeFirstStep!(task.id, {}, {operationId: 'p10:undo:complete'});
    const undone = await harness.composition.service.undoFirstStep!(task.id, {operationId: 'p10:undo'});
    expect(undone).toMatchObject({firstStep: '写三条结论', firstStepCompletion: null, growthRewards: []});
    expect(totalGrowthScore((await harness.composition.service.getState()).tasks)).toBe(0);
    const replay = await harness.composition.service.completeFirstStep!(task.id, {}, {operationId: 'p10:undo:complete-again'});
    expect(replay.points).toBe(5);
  });

  it('preserves reward business keys through backup restore without补发', async () => {
    const sourceBackend = new WorkspaceBackend();
    const source = createWorkspaceHarness(
      sourceBackend,
      new WorkspaceClock(NOW),
      new WorkspaceIds(['reward-backup-task']),
    );
    const task = await createLifecycleTask(source, input, 'p10:backup:create');
    await source.composition.service.completeFirstStep!(task.id, {}, {operationId: 'p10:backup:step'});
    const artifact = await source.composition.localBackup.exportBackup();

    const targetBackend = new WorkspaceBackend();
    const target = createWorkspaceHarness(
      targetBackend,
      new WorkspaceClock(NOW),
      new WorkspaceIds(['unused']),
    );
    await target.composition.localBackup.restoreBackup(artifact.bytes);
    const taskRecords = (backend: WorkspaceBackend): readonly (readonly [string, string])[] =>
      (JSON.parse(backend.stableByteSnapshot()) as readonly (readonly [string, string])[])
        .filter(([key]) => key.startsWith('start-five.tasks.v1'));
    expect(taskRecords(targetBackend)).toEqual(taskRecords(sourceBackend));
    const keys = (backend: WorkspaceBackend): readonly string[] =>
      (JSON.parse(backend.stableByteSnapshot()) as readonly (readonly [string, string])[])
        .map(([key]) => key);
    expect(keys(targetBackend)).not.toContain('start-five.tasks.v1.__journal');
    const restored = createWorkspaceHarness(
      targetBackend.byteRestart(),
      new WorkspaceClock('2026-08-14T08:10:00.000Z'),
      new WorkspaceIds(['unused-2']),
    );
    const repeated = await restored.composition.service.completeFirstStep!(
      task.id,
      {},
      {operationId: 'p10:backup:repeat'},
    );
    expect(repeated.points).toBe(0);
    expect(totalGrowthScore((await restored.composition.service.getState()).tasks)).toBe(5);
  });
});
