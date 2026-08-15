import {
  CALLER_CONTROLLED_PROXY_GET,
  errorIdentity,
  makePendingTask,
  throwingOrdinaryGetProxy,
} from './phase4Review4Fixtures';

describe('P4-HARDENING-4 stateful transparent Proxy fixture', () => {
  it('allows prototype/key/descriptor introspection before an ordinary status get throws the caller-controlled error', () => {
    const target = makePendingTask('proxy-fixture-proof');
    const {proxy, audit} = throwingOrdinaryGetProxy(target, 'status');

    expect(Object.getPrototypeOf(proxy)).toBe(Object.prototype);
    const keys = Reflect.ownKeys(proxy);
    expect(keys).toEqual(Reflect.ownKeys(target));
    for (const key of keys) {
      expect(Object.getOwnPropertyDescriptor(proxy, key)).toEqual(
        Object.getOwnPropertyDescriptor(target, key),
      );
    }
    expect(audit.hasThrowingGet('status')).toBe(false);

    let thrown: unknown;
    try {
      Reflect.get(proxy, 'status');
    } catch (error: unknown) {
      thrown = error;
    }

    expect(errorIdentity(thrown)).toEqual({
      code: undefined,
      message: CALLER_CONTROLLED_PROXY_GET,
    });
    expect(audit.hasIntrospection()).toBe(true);
    expect(audit.hasThrowingGet('status')).toBe(true);
    expect(audit.firstIntrospectionIndex()).toBeLessThan(
      audit.firstThrowingGetIndex('status'),
    );
  });
});
