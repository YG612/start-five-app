import React from 'react';
import {render} from '@testing-library/react-native';
import {
  projectPath,
  readJson,
  requireFile,
} from './fixtures/nativeProject';

type AppIdentity = {
  name?: unknown;
  displayName?: unknown;
};

type AppModule = {
  default?: unknown;
};

type CompositionDependencies = {
  storageBackend?: unknown;
  now?: unknown;
  idGenerator?: unknown;
  network?: unknown;
};

function isRenderableComponent(value: unknown): value is React.ElementType {
  return (
    typeof value === 'function' ||
    (typeof value === 'object' && value !== null && '$$typeof' in value)
  );
}

describe('NS-001 JavaScript registration and durable composition root', () => {
  it('uses one valid product identity in app.json', () => {
    const appJson = readJson<AppIdentity>('app.json');
    expect(appJson).toEqual({name: 'StartFive', displayName: '先做5分钟'});
    expect(appJson.name).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
  });

  it('executes index.js and registers app.json.name with a factory returning the default App', () => {
    requireFile('index.js');
    const appJson = readJson<AppIdentity>('app.json');
    const registerComponent = jest.fn();
    function RegisteredApp(): React.JSX.Element {
      return React.createElement('RegisteredApp');
    }

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({AppRegistry: {registerComponent}}));
      jest.doMock(
        projectPath('App.tsx'),
        () => ({__esModule: true, default: RegisteredApp}),
        {virtual: true},
      );
      jest.requireActual(projectPath('index.js'));
    });

    expect(registerComponent).toHaveBeenCalledTimes(1);
    expect(registerComponent).toHaveBeenCalledWith(
      appJson.name,
      expect.any(Function),
    );
    const registration = registerComponent.mock.calls[0];
    const factory = registration?.[1];
    expect(typeof factory).toBe('function');
    if (typeof factory !== 'function') {
      throw new Error('index.js registration must provide an App factory.');
    }
    expect(factory()).toBe(RegisteredApp);
  });

  it('reuses createStartFiveApp once and injects the explicit React Native durable backend seam', async () => {
    requireFile('App.tsx');
    const backend = {
      getItem: jest.fn(() => Promise.resolve(null)),
      setItem: jest.fn(() => Promise.resolve()),
      removeItem: jest.fn(() => Promise.resolve()),
    };
    const observedDependencies: CompositionDependencies[] = [];
    const AppRoot = jest.fn((): null => null);
    const createStartFiveApp = jest.fn(
      (dependencies: CompositionDependencies) => {
        observedDependencies.push(dependencies);
        return {
          repository: {list: jest.fn()},
          service: {getState: jest.fn()},
          AppRoot,
        };
      },
    );
    let appModule: AppModule | undefined;

    jest.isolateModules(() => {
      jest.doMock(projectPath('src/app/startFiveApp.tsx'), () => ({
        createStartFiveApp,
      }));
      jest.doMock(
        '@react-native-async-storage/async-storage',
        () => ({__esModule: true, default: backend}),
        {virtual: true},
      );
      appModule = jest.requireActual<AppModule>(projectPath('App.tsx'));
    });

    const App = appModule?.default;
    expect(isRenderableComponent(App)).toBe(true);
    if (!isRenderableComponent(App)) {
      throw new Error('App.tsx must default-export a renderable React root.');
    }

    const screen = await render(React.createElement(App));
    expect(AppRoot).toHaveBeenCalledTimes(1);
    expect(screen.toJSON()).toBeNull();
    await screen.rerender(React.createElement(App));
    expect(AppRoot).toHaveBeenCalledTimes(2);

    expect(createStartFiveApp).toHaveBeenCalledTimes(1);
    expect(observedDependencies).toHaveLength(1);
    expect(observedDependencies[0]).toEqual(
      expect.objectContaining({
        storageBackend: backend,
        now: expect.any(Function),
        idGenerator: expect.any(Function),
      }),
    );
    expect(observedDependencies[0]?.network).toBeUndefined();
    await screen.unmount();
  });
});
