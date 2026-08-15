import {
  BASE_TIME,
  completedSession,
  expectRejectCode,
  makeSession,
  ManualIsoClock,
  SequenceIdGenerator,
  TransactionalMemoryFocusRepository,
} from './focusSessionTestKit';

describe('GAP-P0-02B test-kit controls', () => {
  it('keeps the manual clock and ID generator deterministic and timer-free', () => {
    const clock = new ManualIsoClock();
    const ids = new SequenceIdGenerator(['focus-a', 'focus-b']);

    expect(clock.now()).toBe(BASE_TIME);
    clock.set('2026-08-05T08:02:00.000Z');
    expect(clock.now()).toBe('2026-08-05T08:02:00.000Z');
    expect(ids.next()).toBe('focus-a');
    expect(ids.next()).toBe('focus-b');
    expect({clockCalls: clock.calls, idCalls: ids.calls}).toEqual({
      clockCalls: 2,
      idCalls: 2,
    });
  });

  it('proves the memory repository serializes transactions and rolls back a failed callback', async () => {
    const initial = completedSession();
    const repository = new TransactionalMemoryFocusRepository([initial]);
    const replacement = makeSession({id: 'focus-running'});

    await expectRejectCode(
      repository.transaction(async transaction => {
        await transaction.save(replacement);
        throw Object.assign(new Error('sentinel'), {code: 'CALLBACK_SENTINEL'});
      }),
      'CALLBACK_SENTINEL',
    );
    expect(repository.snapshot()).toEqual([initial]);

    await repository.transaction(async transaction => {
      await transaction.save(replacement);
    });
    expect(repository.snapshot()).toEqual([initial, replacement]);
    expect(repository.counters.commits).toBe(1);
  });

  it('proves injected save failure leaves the committed helper snapshot unchanged and retryable', async () => {
    const initial = completedSession();
    const repository = new TransactionalMemoryFocusRepository([initial]);
    const replacement = makeSession({id: 'focus-running'});
    repository.failNextSave();

    await expectRejectCode(
      repository.transaction(async transaction => {
        await transaction.save(replacement);
      }),
      'TEST_REPOSITORY_SAVE_FAILED',
    );
    expect(repository.snapshot()).toEqual([initial]);

    await repository.transaction(async transaction => {
      await transaction.save(replacement);
    });
    expect(repository.snapshot()).toEqual([initial, replacement]);
  });
});
