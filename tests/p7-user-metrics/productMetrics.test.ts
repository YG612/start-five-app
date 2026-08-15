import {
  InMemoryProductMetricPort,
  MAX_IN_MEMORY_PRODUCT_METRICS,
  NoopProductMetricPort,
  recordProductMetric,
  type ProductMetricEvent,
  type ProductMetricPort,
} from '../../src/application/productMetrics';

const EVENT: ProductMetricEvent = {
  name: 'task_sheet_open',
  occurredAt: '2026-08-14T08:00:00.000Z',
  sessionId: 'session-p7',
  source: 'quadrant',
  durationMs: 12,
  success: true,
  taskRef: 'task-ref-1',
};

describe('P7 product metric port', () => {
  it('keeps the production noop silent', () => {
    expect(() => recordProductMetric(new NoopProductMetricPort(), EVENT)).not.toThrow();
  });

  it('keeps event order stable and drops unknown user-content fields', () => {
    const port = new InMemoryProductMetricPort();
    port.record({...EVENT, name: 'task_sheet_open', title: 'private title'} as ProductMetricEvent);
    port.record({...EVENT, name: 'focus_started', notes: 'private notes'} as ProductMetricEvent);

    expect(port.snapshot().map(event => event.name)).toEqual([
      'task_sheet_open',
      'focus_started',
    ]);
    expect(port.snapshot()).toEqual([
      {...EVENT, name: 'task_sheet_open'},
      {...EVENT, name: 'focus_started'},
    ]);
    expect(JSON.stringify(port.snapshot())).not.toContain('private');
  });

  it('does not let synchronous or asynchronous metric failures block the caller', async () => {
    const syncFailure: ProductMetricPort = {
      record: () => {
        throw new Error('METRIC_SYNC_FAILURE');
      },
    };
    const asyncFailure: ProductMetricPort = {
      record: () => Promise.reject(new Error('METRIC_ASYNC_FAILURE')),
    };

    expect(() => recordProductMetric(syncFailure, EVENT)).not.toThrow();
    expect(() => recordProductMetric(asyncFailure, EVENT)).not.toThrow();
    await Promise.resolve();
  });

  it('keeps only the latest 500 anonymous diagnostic events', () => {
    const port = new InMemoryProductMetricPort();
    for (let index = 0; index < MAX_IN_MEMORY_PRODUCT_METRICS + 2; index += 1) {
      port.record({
        ...EVENT,
        name: 'home_primary_shown',
        source: String(index),
        title: `private-${index}`,
      } as ProductMetricEvent);
    }
    const snapshot = port.snapshot();
    expect(snapshot).toHaveLength(MAX_IN_MEMORY_PRODUCT_METRICS);
    expect(snapshot[0]?.source).toBe('2');
    expect(snapshot.at(-1)?.source).toBe('501');
    expect(JSON.stringify(snapshot)).not.toContain('private-');
  });
});
