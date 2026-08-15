import type {
  TaskLifecycleService,
  TaskLifecycleTaskInput,
  TaskLifecycleTaskPatch,
} from '../../src/application/coreAppService';
import {
  A2_LATER,
  A2_NOW,
  PrefixIds,
  SequenceClock,
  SequenceIds,
  StorageFault,
  createA2Harness,
  expectErrorCode,
  makeDeletedTask,
  makeTask,
  operation,
} from './a2Fixtures';

describe('GAP-P0-01A2 lifecycle create/read/list/update contract', () => {
  it('creates a normalized task with stable identity and explicit planning defaults', async () => {
    const clock = new SequenceClock([A2_NOW]);
    const ids = new SequenceIds(['created-defaults']);
    const {service} = createA2Harness({now: clock.now, idGenerator: ids.next});
    const input: TaskLifecycleTaskInput = {
      title: '  Write the first screen  ',
      important: true,
      urgent: false,
    };

    const pending = service.create(input, operation('crud:create:defaults'));
    input.title = 'caller mutation after invocation';
    const created = await pending;

    expect(created).toMatchObject({
      id: 'created-defaults',
      title: 'Write the first screen',
      description: '',
      important: true,
      urgent: false,
      status: 'pending',
      startAt: null,
      scheduledStartAt: null,
      dueAt: null,
      estimatedMinutes: null,
      firstStep: null,
      createdAt: A2_NOW,
      updatedAt: A2_NOW,
      startedAt: null,
      completedAt: null,
      deletedAt: null,
      score: null,
      scoreAwardedAt: null,
      subtasks: [],
    });
    for (const key of ['scheduledStartAt', 'estimatedMinutes', 'firstStep']) {
      expect(Object.prototype.hasOwnProperty.call(created, key)).toBe(true);
    }
    expect(clock.consumed).toBe(1);
    expect(ids.consumed).toBe(1);
  });

  it('accepts each planning field independently and all three together', async () => {
    const ids = new PrefixIds('planning');
    const {service} = createA2Harness({idGenerator: ids.next});
    const inputs: TaskLifecycleTaskInput[] = [
      {
        title: 'scheduled only',
        important: false,
        urgent: false,
        scheduledStartAt: '2026-08-06T09:30:00+08:00',
      },
      {
        title: 'estimate only',
        important: false,
        urgent: false,
        estimatedMinutes: 25,
      },
      {
        title: 'first step only',
        important: false,
        urgent: false,
        firstStep: '  Open the editor  ',
      },
      {
        title: 'all planning fields',
        important: true,
        urgent: true,
        scheduledStartAt: '2026-08-07T02:00:00.000Z',
        estimatedMinutes: 45,
        firstStep: 'Create the file',
      },
    ];

    const results = [];
    for (const [index, input] of inputs.entries()) {
      results.push(
        await service.create(input, operation(`crud:create:planning:${index}`)),
      );
    }

    expect(results[0]).toMatchObject({
      startAt: '2026-08-06T01:30:00.000Z',
      scheduledStartAt: '2026-08-06T01:30:00.000Z',
      estimatedMinutes: null,
      firstStep: null,
    });
    expect(results[1]).toMatchObject({
      scheduledStartAt: null,
      estimatedMinutes: 25,
      firstStep: null,
    });
    expect(results[2]).toMatchObject({
      scheduledStartAt: null,
      estimatedMinutes: null,
      firstStep: 'Open the editor',
    });
    expect(results[3]).toMatchObject({
      scheduledStartAt: '2026-08-07T02:00:00.000Z',
      estimatedMinutes: 45,
      firstStep: 'Create the file',
    });
    expect(results.every(result => result.subtasks.length === 0)).toBe(true);
  });

  it('treats legacy startAt as the same planned-time alias and rejects disagreement atomically', async () => {
    const {service, storage} = createA2Harness();
    const canonical = '2026-08-06T01:30:00.000Z';
    const created = await service.create(
      {
        title: 'matching aliases',
        important: true,
        urgent: false,
        startAt: '2026-08-06T09:30:00+08:00',
        scheduledStartAt: canonical,
      },
      operation('crud:create:matching-aliases'),
    );
    expect(created.startAt).toBe(canonical);
    expect(created.scheduledStartAt).toBe(canonical);
    expect(created.startedAt).toBeNull();
    const writesBeforeConflict = storage.setCommits.length;

    await expectErrorCode(
      () =>
        service.create(
          {
            title: 'conflicting aliases',
            important: true,
            urgent: false,
            startAt: '2026-08-06T01:30:00.000Z',
            scheduledStartAt: '2026-08-06T01:31:00.000Z',
          },
          operation('crud:create:conflicting-aliases'),
        ),
      'SCHEDULED_START_CONFLICT',
    );
    expect(storage.setCommits).toHaveLength(writesBeforeConflict);
  });

  it('supports arbitrary multi-task creation without a hidden cap and preserves insertion order', async () => {
    const ids = new SequenceIds(
      Array.from({length: 25}, (_, index) => `many-${String(index).padStart(2, '0')}`),
    );
    const {service} = createA2Harness({idGenerator: ids.next});

    for (let index = 0; index < 25; index += 1) {
      await service.create(
        {
          title: `Many task ${index}`,
          important: index % 2 === 0,
          urgent: index % 3 === 0,
        },
        operation(`crud:create:many:${index}`),
      );
    }

    const listed = await service.list({includeDeleted: true});
    expect(listed).toHaveLength(25);
    expect(listed.map(task => task.id)).toEqual(
      Array.from({length: 25}, (_, index) => `many-${String(index).padStart(2, '0')}`),
    );
    expect(new Set(listed.map(task => task.id)).size).toBe(25);
  });

  it('gets by ID, hides tombstones by default, and exposes them only when requested', async () => {
    const visible = makeTask('read-visible');
    const deleted = makeDeletedTask('read-deleted');
    const {service} = createA2Harness({tasks: [visible, deleted]});

    await expect(service.getById('missing')).resolves.toBeNull();
    await expect(service.getById(visible.id)).resolves.toEqual(visible);
    await expect(service.getById(deleted.id)).resolves.toBeNull();
    await expect(
      service.getById(deleted.id, {includeDeleted: true}),
    ).resolves.toEqual(deleted);
  });

  it('lists active records in durable order and applies includeDeleted exactly once', async () => {
    const first = makeTask('list-first');
    const tombstone = makeDeletedTask('list-tombstone');
    const last = makeTask('list-last');
    const {service} = createA2Harness({tasks: [first, tombstone, last]});

    await expect(service.list()).resolves.toEqual([first, last]);
    await expect(service.list({includeDeleted: false})).resolves.toEqual([
      first,
      last,
    ]);
    await expect(service.list({includeDeleted: true})).resolves.toEqual([
      first,
      tombstone,
      last,
    ]);
  });

  it('updates editable scalar and planning fields while preserving identity and creation time', async () => {
    const baseline = makeTask('update-fields', {
      startAt: '2026-08-06T09:00:00.000Z',
      dueAt: '2026-08-06T12:00:00.000Z',
    });
    const clock = new SequenceClock([A2_LATER]);
    const {service} = createA2Harness({tasks: [baseline], now: clock.now});

    const updated = await service.update(
      baseline.id,
      {
        title: '  Updated title  ',
        description: 'Updated description',
        important: true,
        urgent: true,
        scheduledStartAt: '2026-08-06T10:00:00.000Z',
        dueAt: '2026-08-06T13:00:00.000Z',
        estimatedMinutes: 30,
        firstStep: '  Run the tests  ',
      },
      operation('crud:update:fields'),
    );

    expect(updated).toMatchObject({
      id: baseline.id,
      createdAt: baseline.createdAt,
      updatedAt: A2_LATER,
      title: 'Updated title',
      description: 'Updated description',
      important: true,
      urgent: true,
      startAt: '2026-08-06T10:00:00.000Z',
      scheduledStartAt: '2026-08-06T10:00:00.000Z',
      dueAt: '2026-08-06T13:00:00.000Z',
      estimatedMinutes: 30,
      firstStep: 'Run the tests',
    });
  });

  it('preserves omitted update fields, clears explicit nulls, and leaves a missing ID read-only', async () => {
    const baseline = makeTask('update-clear', {
      startAt: '2026-08-06T10:00:00.000Z',
      dueAt: '2026-08-06T13:00:00.000Z',
    });
    const {service, storage} = createA2Harness({tasks: [baseline]});
    const legacyAliasOnly = await service.update(
      baseline.id,
      {startAt: '2026-08-06T18:30:00+08:00'},
      operation('crud:update:legacy-start-alias'),
    );
    expect(legacyAliasOnly).toMatchObject({
      startAt: '2026-08-06T10:30:00.000Z',
      scheduledStartAt: '2026-08-06T10:30:00.000Z',
      startedAt: null,
    });
    const populated = await service.update(
      baseline.id,
      {estimatedMinutes: 20, firstStep: 'Open the project'},
      operation('crud:update:populate'),
    );
    expect(populated).toMatchObject({
      startAt: '2026-08-06T10:30:00.000Z',
      scheduledStartAt: '2026-08-06T10:30:00.000Z',
      dueAt: baseline.dueAt,
      estimatedMinutes: 20,
      firstStep: 'Open the project',
    });
    const cleared = await service.update(
      baseline.id,
      {startAt: null, estimatedMinutes: null, firstStep: null},
      operation('crud:update:clear'),
    );
    expect(cleared).toMatchObject({
      startAt: null,
      scheduledStartAt: null,
      dueAt: baseline.dueAt,
      estimatedMinutes: null,
      firstStep: null,
    });
    const writesBeforeMissing = storage.setCommits.length;
    await expectErrorCode(
      () =>
        service.update(
          'missing-task',
          {title: 'must not be written'},
          operation('crud:update:missing'),
        ),
      'TASK_NOT_FOUND',
    );
    expect(storage.setCommits).toHaveLength(writesBeforeMissing);
  });

  it('rejects invalid create field values before ID, clock, or durable state is consumed', async () => {
    const cases: Array<{
      input: TaskLifecycleTaskInput;
      code: string;
    }> = [
      {
        input: {title: '   ', important: false, urgent: false},
        code: 'TITLE_REQUIRED',
      },
      {
        input: {
          title: 'blank first step',
          important: false,
          urgent: false,
          firstStep: '   ',
        },
        code: 'FIRST_STEP_REQUIRED',
      },
      {
        input: {
          title: 'bad planned time',
          important: false,
          urgent: false,
          scheduledStartAt: 'not-a-time',
        },
        code: 'INVALID_TIMESTAMP',
      },
      {
        input: {
          title: 'inverted range',
          important: false,
          urgent: false,
          scheduledStartAt: '2026-08-06T12:00:00.000Z',
          dueAt: '2026-08-06T11:59:59.999Z',
        },
        code: 'INVALID_TIME_RANGE',
      },
    ];

    for (const [index, entry] of cases.entries()) {
      const clock = new SequenceClock([A2_NOW]);
      const ids = new SequenceIds([`must-not-be-used-${index}`]);
      const {service, storage} = createA2Harness({
        now: clock.now,
        idGenerator: ids.next,
      });
      await expectErrorCode(
        () => service.create(entry.input, operation(`crud:invalid:${index}`)),
        entry.code,
      );
      expect(clock.consumed).toBe(0);
      expect(ids.consumed).toBe(0);
      expect(storage.getCalls).toEqual([]);
      expect(storage.setAttempts).toEqual([]);
    }
  });

  it('rejects invalid update normalization and alias conflict without publishing a patch', async () => {
    const baseline = makeTask('update-invalid');
    const invalidEstimates = [
      0,
      -0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ];
    const cases: Array<{patch: TaskLifecycleTaskPatch; code: string}> = [
      {patch: {title: '   '}, code: 'TITLE_REQUIRED'},
      {patch: {firstStep: '   '}, code: 'FIRST_STEP_REQUIRED'},
      ...invalidEstimates.map(estimatedMinutes => ({
        patch: {estimatedMinutes},
        code: 'INVALID_ESTIMATED_MINUTES',
      })),
      {
        patch: {scheduledStartAt: 'not-a-time'},
        code: 'INVALID_TIMESTAMP',
      },
      {
        patch: {dueAt: 'not-a-time'},
        code: 'INVALID_TIMESTAMP',
      },
      {
        patch: {
          scheduledStartAt: '2026-08-06T12:00:00.000Z',
          dueAt: '2026-08-06T11:59:59.999Z',
        },
        code: 'INVALID_TIME_RANGE',
      },
      {
        patch: {
          startAt: '2026-08-06T10:00:00.000Z',
          scheduledStartAt: '2026-08-06T10:01:00.000Z',
        },
        code: 'SCHEDULED_START_CONFLICT',
      },
    ];

    for (const [index, entry] of cases.entries()) {
      const {service, storage} = createA2Harness({tasks: [baseline]});
      const rawBefore = storage.raw();
      await expectErrorCode(
        () =>
          service.update(
            baseline.id,
            entry.patch,
            operation(`crud:update:invalid:${index}`),
          ),
        entry.code,
      );
      expect(storage.raw()).toBe(rawBefore);
      expect(storage.setAttempts).toEqual([]);
    }
  });

  it('rejects argument-only create, update, reschedule, and delay errors before dependencies are consumed', async () => {
    const baseline = makeTask('argument-prevalidation', {
      startAt: '2026-08-06T09:00:00.000Z',
      scheduledStartAt: '2026-08-06T09:00:00.000Z',
      dueAt: '2026-08-06T12:00:00.000Z',
    });
    const cases: Array<{
      label: string;
      code: string;
      invoke(service: TaskLifecycleService): Promise<unknown>;
    }> = [
      {
        label: 'create-estimated-minutes',
        code: 'INVALID_ESTIMATED_MINUTES',
        invoke: service =>
          service.create(
            {
              title: 'Invalid create estimate',
              important: false,
              urgent: false,
              estimatedMinutes: 0,
            },
            operation('prevalidation:create:estimate'),
          ),
      },
      {
        label: 'update-title',
        code: 'TITLE_REQUIRED',
        invoke: service =>
          service.update(
            baseline.id,
            {title: '   '},
            operation('prevalidation:update:title'),
          ),
      },
      {
        label: 'update-estimated-minutes',
        code: 'INVALID_ESTIMATED_MINUTES',
        invoke: service =>
          service.update(
            baseline.id,
            {estimatedMinutes: 0},
            operation('prevalidation:update:estimate'),
          ),
      },
      {
        label: 'reschedule-timestamp',
        code: 'INVALID_TIMESTAMP',
        invoke: service =>
          service.reschedule(
            baseline.id,
            {scheduledStartAt: 'not-a-time'},
            operation('prevalidation:reschedule:timestamp'),
          ),
      },
      {
        label: 'delay-minutes',
        code: 'INVALID_DELAY_MINUTES',
        invoke: service =>
          service.delay(
            baseline.id,
            {minutes: 0},
            operation('prevalidation:delay:minutes'),
          ),
      },
    ];

    for (const [index, entry] of cases.entries()) {
      const clock = new SequenceClock([A2_NOW]);
      const ids = new SequenceIds([`prevalidation-unused-id-${index}`]);
      const {repository, service, storage} = createA2Harness({
        tasks: [baseline],
        now: clock.now,
        idGenerator: ids.next,
      });
      const readFailure = new StorageFault(
        `A2_PRESET_READ_FAILURE_${entry.label}`,
      );
      storage.failNextGetWith = readFailure;
      const rawBefore = storage.raw();

      await expectErrorCode(() => entry.invoke(service), entry.code);

      expect(storage.getCalls).toEqual([]);
      expect(storage.setAttempts).toEqual([]);
      expect(storage.setCommits).toEqual([]);
      expect(clock.consumed).toBe(0);
      expect(ids.consumed).toBe(0);
      expect(storage.raw()).toBe(rawBefore);
      await expect(repository.list({includeDeleted: true})).rejects.toMatchObject({
        code: readFailure.code,
        message: readFailure.message,
      });
      expect(storage.raw()).toBe(rawBefore);
    }
  });
});
