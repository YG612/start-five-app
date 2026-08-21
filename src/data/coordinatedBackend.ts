import type {AsyncKeyValueBackend} from './persistentTaskStorage';

export type CoordinatedBackend = AsyncKeyValueBackend & Readonly<{
  raw: AsyncKeyValueBackend;
  exclusive<T>(work: () => Promise<T>): Promise<T>;
  readonly startFiveAtomic?: unknown;
}>;

const coordinatedBackends = new WeakMap<object, CoordinatedBackend>();

export function createCoordinatedBackend(
  raw: AsyncKeyValueBackend,
): CoordinatedBackend {
  const existing = coordinatedBackends.get(raw);
  if (existing !== undefined) {
    return existing;
  }

  let tail = Promise.resolve();

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work);
    tail = result.then(() => undefined, () => undefined);
    return result;
  }

  const rawWithAtomic = raw as AsyncKeyValueBackend & Readonly<{
    startFiveAtomic?: unknown;
  }>;
  const atomic = rawWithAtomic.startFiveAtomic;
  const coordinatedAtomic =
    typeof atomic === 'object' &&
    atomic !== null &&
    'compareExchangeItem' in atomic &&
    typeof atomic.compareExchangeItem === 'function'
      ? {
          ...(atomic as object),
          compareExchangeItem(
            key: string,
            expectedValue: string | null,
            desiredValue: string | null,
          ): Promise<boolean> {
            return enqueue(() =>
              (atomic.compareExchangeItem as (
                itemKey: string,
                expected: string | null,
                desired: string | null,
              ) => Promise<boolean>)(key, expectedValue, desiredValue),
            );
          },
        }
      : undefined;

  const coordinated: CoordinatedBackend = {
    raw,
    getItem: key => enqueue(() => raw.getItem(key)),
    setItem: (key, value) => enqueue(() => raw.setItem(key, value)),
    removeItem: key => enqueue(() => raw.removeItem(key)),
    exclusive: enqueue,
    ...(coordinatedAtomic === undefined
      ? {}
      : {startFiveAtomic: coordinatedAtomic}),
  };
  coordinatedBackends.set(raw, coordinated);
  return coordinated;
}
