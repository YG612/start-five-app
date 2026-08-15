import {createCoreAppService} from '../../../src/application/coreAppService';
import {createTaskRepository} from '../../../src/data/taskRepository';
import {MemoryKeyValueStorage} from '../fixtures/memoryStorage';

const CREATED_AT = '2026-01-02T03:04:05.000Z';
const STARTED_AT = '2026-01-02T03:05:00.000Z';
const COMPLETED_AT = '2026-01-02T03:10:00.000Z';

function createHarness() {
  const storage = new MemoryKeyValueStorage();
  const repository = createTaskRepository(storage);
  let currentTime = CREATED_AT;
  const idGenerator = jest
    .fn(() => 'unexpected-id')
    .mockReturnValueOnce('task-1')
    .mockReturnValueOnce('step-1');
  const network = {request: jest.fn(() => Promise.reject(new Error('offline')))};
  const dependencies = {
    repository,
    now: () => currentTime,
    idGenerator,
    network,
  };

  return {
    storage,
    repository,
    idGenerator,
    network,
    dependencies,
    setTime(value: string) {
      currentTime = value;
    },
  };
}

describe('SF-009 local-only core application service', () => {
  it('completes create -> first step -> recommend -> start -> finish -> score offline', async () => {
    const harness = createHarness();
    const service = createCoreAppService(harness.dependencies);

    const task = await service.createTask(
      {title: '写周报', important: true, urgent: true},
      {operationId: 'create-task-once'},
    );
    const withStep = await service.addFirstStep(
      task.id,
      {title: '打开文档'},
      {operationId: 'add-step-once'},
    );
    const recommended = await service.chooseRecommended();

    expect(withStep.subtasks[0]).toMatchObject({
      id: 'step-1',
      taskId: 'task-1',
      title: '打开文档',
    });
    expect(recommended).toMatchObject({id: 'task-1'});

    harness.setTime(STARTED_AT);
    const started = await service.startRecommended({operationId: 'start-once'});
    expect(started).toMatchObject({id: 'task-1', status: 'in_progress'});

    harness.setTime(COMPLETED_AT);
    const stepDone = await service.finishStep(
      'task-1',
      'step-1',
      {operationId: 'finish-step-once'},
    );
    expect(stepDone.subtasks[0]).toMatchObject({
      status: 'completed',
      completedAt: COMPLETED_AT,
    });

    const completion = await service.finishTask('task-1', {
      operationId: 'finish-task-once',
    });
    const state = await service.getState();

    expect(completion).toMatchObject({points: 35});
    expect(completion.task).toMatchObject({
      status: 'completed',
      score: 35,
      scoreAwardedAt: COMPLETED_AT,
    });
    expect(state.totalScore).toBe(35);
    expect(state.tasks).toHaveLength(1);
    expect(await service.chooseRecommended()).toBeNull();
    expect(harness.network.request).not.toHaveBeenCalled();
  });

  it('needs neither an account nor a network adapter', async () => {
    const storage = new MemoryKeyValueStorage();
    const repository = createTaskRepository(storage);
    const service = createCoreAppService({
      repository,
      now: () => CREATED_AT,
      idGenerator: () => 'task-no-account',
    });

    await expect(
      service.createTask(
        {title: '离线任务', important: false, urgent: false},
        {operationId: 'offline-create'},
      ),
    ).resolves.toMatchObject({id: 'task-no-account'});
    await expect(service.getState()).resolves.toMatchObject({
      totalScore: 0,
      tasks: [expect.objectContaining({title: '离线任务'})],
    });
  });
});

describe('SF-009 duplicate-operation protection', () => {
  it('deduplicates concurrent create submissions and survives service recreation', async () => {
    const harness = createHarness();
    const firstService = createCoreAppService(harness.dependencies);
    const input = {title: '只创建一次', important: false, urgent: true};
    const operation = {operationId: 'same-create-operation'};

    const [first, duplicate] = await Promise.all([
      firstService.createTask(input, operation),
      firstService.createTask(input, operation),
    ]);
    const recreatedService = createCoreAppService(harness.dependencies);
    const afterRecreation = await recreatedService.createTask(input, operation);

    expect(first.id).toBe('task-1');
    expect(duplicate).toEqual(first);
    expect(afterRecreation).toEqual(first);
    expect(await harness.repository.list()).toHaveLength(1);
    expect(harness.idGenerator).toHaveBeenCalledTimes(1);
    expect(harness.network.request).not.toHaveBeenCalled();
  });

  it('deduplicates repeated finish actions and never scores twice', async () => {
    const harness = createHarness();
    const service = createCoreAppService(harness.dependencies);
    await service.createTask(
      {title: '完成一次', important: true, urgent: false},
      {operationId: 'create'},
    );
    await service.addFirstStep(
      'task-1',
      {title: '第一小步'},
      {operationId: 'add-step'},
    );
    await service.startRecommended({operationId: 'start'});
    harness.setTime(COMPLETED_AT);

    const [stepA, stepB] = await Promise.all([
      service.finishStep('task-1', 'step-1', {operationId: 'finish-step'}),
      service.finishStep('task-1', 'step-1', {operationId: 'finish-step'}),
    ]);
    const [finishA, finishB] = await Promise.all([
      service.finishTask('task-1', {operationId: 'finish-task'}),
      service.finishTask('task-1', {operationId: 'finish-task'}),
    ]);

    expect(stepB).toEqual(stepA);
    expect(finishA).toEqual(finishB);
    expect(finishA.points).toBe(45);
    expect((await service.getState()).totalScore).toBe(45);
    expect((await harness.repository.list())[0]).toMatchObject({score: 45});
  });

  it('keeps every mutation operationId idempotent across service recreation', async () => {
    const harness = createHarness();
    const recreateService = () => createCoreAppService(harness.dependencies);

    await recreateService().createTask(
      {title: 'Cross-service operation', important: true, urgent: false},
      {operationId: 'cross-create'},
    );

    const added = await recreateService().addFirstStep(
      'task-1',
      {title: 'Only one child'},
      {operationId: 'cross-add'},
    );
    const writesAfterAdd = harness.storage.setCalls.length;
    const repeatedAdd = await recreateService().addFirstStep(
      'task-1',
      {title: 'Only one child'},
      {operationId: 'cross-add'},
    );
    expect(repeatedAdd).toEqual(added);
    expect(repeatedAdd.subtasks).toHaveLength(1);
    expect(harness.idGenerator).toHaveBeenCalledTimes(2);
    expect(harness.storage.setCalls).toHaveLength(writesAfterAdd);

    harness.setTime(STARTED_AT);
    const started = await recreateService().startRecommended({
      operationId: 'cross-start',
    });
    const writesAfterStart = harness.storage.setCalls.length;
    const repeatedStart = await recreateService().startRecommended({
      operationId: 'cross-start',
    });
    expect(repeatedStart).toEqual(started);
    expect(repeatedStart).toMatchObject({status: 'in_progress'});
    expect(harness.storage.setCalls).toHaveLength(writesAfterStart);

    harness.setTime(COMPLETED_AT);
    const stepDone = await recreateService().finishStep(
      'task-1',
      'step-1',
      {operationId: 'cross-finish-step'},
    );
    const writesAfterStep = harness.storage.setCalls.length;
    const repeatedStep = await recreateService().finishStep(
      'task-1',
      'step-1',
      {operationId: 'cross-finish-step'},
    );
    expect(repeatedStep).toEqual(stepDone);
    expect(repeatedStep.subtasks[0]).toMatchObject({status: 'completed'});
    expect(harness.storage.setCalls).toHaveLength(writesAfterStep);

    const finished = await recreateService().finishTask('task-1', {
      operationId: 'cross-finish-task',
    });
    const writesAfterFinish = harness.storage.setCalls.length;
    const repeatedFinish = await recreateService().finishTask('task-1', {
      operationId: 'cross-finish-task',
    });
    expect(repeatedFinish).toEqual(finished);
    expect(repeatedFinish.points).toBe(45);
    expect(harness.storage.setCalls).toHaveLength(writesAfterFinish);

    const rebuiltState = await recreateService().getState();
    expect(rebuiltState.totalScore).toBe(45);
    expect(rebuiltState.tasks[0]).toMatchObject({
      status: 'completed',
      score: 45,
      scoreAwardedAt: COMPLETED_AT,
    });

    const secondOperation = await recreateService().finishTask('task-1', {
      operationId: 'different-finish-operation',
    });
    expect(secondOperation.points).toBe(0);
    expect((await recreateService().getState()).totalScore).toBe(45);
    expect(harness.network.request).not.toHaveBeenCalled();
  });
});
