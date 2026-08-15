import React from 'react';
import {render, waitFor} from '@testing-library/react-native';
import {
  InspectableAsyncKeyValueBackend,
  makePhase4Task,
  PHASE4_NOW,
  PHASE4_STORAGE_KEY,
  requirePhase4Module,
  serializePhase4Envelope,
  type StartFiveAppModule,
} from './phase4Fixtures';

function loadStartFiveAppModule(): StartFiveAppModule {
  return requirePhase4Module<StartFiveAppModule>(
    '../../src/app/startFiveApp',
    'src/app/startFiveApp.tsx#createStartFiveApp',
  );
}

function createClockAndIds(): {
  now(): string;
  idGenerator(): string;
} {
  let sequence = 0;
  return {
    now: () => PHASE4_NOW,
    idGenerator: () => {
      sequence += 1;
      return `phase4-generated-${sequence}`;
    },
  };
}

describe('P4-BOOT application composition and hydration contract', () => {
  it('hydrates a durable guest task into CoreFlowScreen through the composed root', async () => {
    const {createStartFiveApp} = loadStartFiveAppModule();
    const backend = new InspectableAsyncKeyValueBackend();
    const hydratedTask = makePhase4Task('hydrated-root', {
      title: 'Hydrated Phase 4 task',
      important: true,
      urgent: false,
    });
    backend.seed(
      PHASE4_STORAGE_KEY,
      serializePhase4Envelope([hydratedTask]),
    );
    const composition = createStartFiveApp({
      storageBackend: backend,
      ...createClockAndIds(),
    });

    expect(composition.repository).toEqual(
      expect.objectContaining({list: expect.any(Function)}),
    );
    expect(composition.service).toEqual(
      expect.objectContaining({getState: expect.any(Function)}),
    );
    expect(composition.AppRoot).toEqual(expect.any(Function));

    const screen = await render(React.createElement(composition.AppRoot));
    await waitFor(() =>
      expect(screen.getByText(/Hydrated Phase 4 task/)).toBeTruthy(),
    );

    expect(backend.getCalls).toEqual([PHASE4_STORAGE_KEY]);
    await screen.unmount();
  });

  it('uses the exact shared service and repository for every root render without duplicate hydration state', async () => {
    const {createStartFiveApp} = loadStartFiveAppModule();
    const backend = new InspectableAsyncKeyValueBackend();
    const composition = createStartFiveApp({
      storageBackend: backend,
      ...createClockAndIds(),
    });
    await composition.repository.list();
    const getState = jest.spyOn(composition.service, 'getState');

    const firstRoot = await render(React.createElement(composition.AppRoot));
    await waitFor(() => expect(getState).toHaveBeenCalledTimes(1));
    expect(backend.getCalls).toEqual([PHASE4_STORAGE_KEY]);
    await firstRoot.unmount();

    const secondRoot = await render(React.createElement(composition.AppRoot));
    await waitFor(() => expect(getState).toHaveBeenCalledTimes(2));
    expect(backend.getCalls).toEqual([PHASE4_STORAGE_KEY]);
    await secondRoot.unmount();
  });

  it('keeps service mutations, the exposed repository, the root, and a later app instance on one durable state', async () => {
    const {createStartFiveApp} = loadStartFiveAppModule();
    const backend = new InspectableAsyncKeyValueBackend();
    const firstComposition = createStartFiveApp({
      storageBackend: backend,
      ...createClockAndIds(),
    });

    const created = await firstComposition.service.createTask(
      {
        title: 'One shared durable state',
        description: 'Created through the composed service',
        important: true,
        urgent: true,
      },
      {operationId: 'phase4:create:shared-state'},
    );
    await expect(firstComposition.repository.getById(created.id)).resolves.toEqual(
      created,
    );

    const firstRoot = await render(
      React.createElement(firstComposition.AppRoot),
    );
    await waitFor(() =>
      expect(firstRoot.getByText(/One shared durable state/)).toBeTruthy(),
    );
    await firstRoot.unmount();

    const secondComposition = createStartFiveApp({
      storageBackend: backend,
      ...createClockAndIds(),
    });
    await expect(secondComposition.service.getState()).resolves.toMatchObject({
      tasks: [created],
    });
  });

  it('forwards the injected clock and ID generator into actual service mutations', async () => {
    const {createStartFiveApp} = loadStartFiveAppModule();
    const backend = new InspectableAsyncKeyValueBackend();
    const now = jest.fn(() => '2026-08-04T12:34:56.000Z');
    const idGenerator = jest.fn(() => 'injected-composition-task-id');
    const composition = createStartFiveApp({
      storageBackend: backend,
      now,
      idGenerator,
    });

    const created = await composition.service.createTask(
      {
        title: 'Injected dependency evidence',
        important: false,
        urgent: false,
      },
      {operationId: 'phase4:create:injected-dependencies'},
    );

    expect(created).toMatchObject({
      id: 'injected-composition-task-id',
      createdAt: '2026-08-04T12:34:56.000Z',
      updatedAt: '2026-08-04T12:34:56.000Z',
    });
    expect(now).toHaveBeenCalledTimes(1);
    expect(idGenerator).toHaveBeenCalledTimes(1);
    await expect(
      composition.repository.getById('injected-composition-task-id'),
    ).resolves.toEqual(created);
  });

  it('boots and hydrates locally without invoking an injected network adapter or global fetch', async () => {
    const {createStartFiveApp} = loadStartFiveAppModule();
    const backend = new InspectableAsyncKeyValueBackend();
    const network = {
      request: jest.fn(() => Promise.reject(new Error('offline by design'))),
    };
    const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    const fetchSpy = jest.fn(() =>
      Promise.reject(new Error('network forbidden')),
    );
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchSpy,
    });

    try {
      const composition = createStartFiveApp({
        storageBackend: backend,
        network,
        ...createClockAndIds(),
      });
      const screen = await render(React.createElement(composition.AppRoot));
      await waitFor(() =>
        expect(backend.getCalls).toEqual([PHASE4_STORAGE_KEY]),
      );

      expect(network.request).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      await screen.unmount();
    } finally {
      if (originalFetch === undefined) {
        Reflect.deleteProperty(globalThis, 'fetch');
      } else {
        Object.defineProperty(globalThis, 'fetch', originalFetch);
      }
    }
  });

  it('surfaces corrupt hydration as a stable service failure and never invents a task', async () => {
    const {createStartFiveApp} = loadStartFiveAppModule();
    const backend = new InspectableAsyncKeyValueBackend();
    backend.seed(PHASE4_STORAGE_KEY, '{broken startup snapshot');
    const composition = createStartFiveApp({
      storageBackend: backend,
      ...createClockAndIds(),
    });

    await expect(composition.service.getState()).rejects.toMatchObject({
      code: 'TASK_SNAPSHOT_CORRUPT',
    });

    const screen = await render(React.createElement(composition.AppRoot));
    await waitFor(() => expect(backend.getCalls).toHaveLength(2));
    expect(screen.queryByText(/Phase 4 task/)).toBeNull();
    await screen.unmount();
  });

  it('keeps the new composition and persistence modules independent from the bookkeeping project', () => {
    const {readFileSync, readdirSync, statSync} = jest.requireActual('fs') as {
      readFileSync(path: string, encoding: 'utf8'): string;
      readdirSync(path: string): string[];
      statSync(path: string): {isDirectory(): boolean; isFile(): boolean};
    };
    const collectFiles = (directory: string): string[] => {
      const files: string[] = [];
      for (const name of readdirSync(directory)) {
        const path = `${directory}/${name}`;
        const status = statSync(path);
        if (status.isDirectory()) {
          files.push(...collectFiles(path));
        } else if (status.isFile()) {
          files.push(path);
        }
      }
      return files;
    };
    const sourceFiles = collectFiles('src').sort();
    const textSourceFiles = sourceFiles.filter(path =>
      /\.(?:cjs|css|gradle|html|js|json|jsx|md|mjs|properties|ts|tsx|txt|xml|ya?ml)$/i.test(
        path,
      ),
    );
    const forbiddenBookkeepingReference =
      /qingji(?:[\s._/\\-]*ai)?|bookkeep(?:er|ing)?|记账/i;

    expect(sourceFiles.length).toBeGreaterThan(0);
    expect(sourceFiles.join('\n')).not.toMatch(forbiddenBookkeepingReference);
    expect(
      textSourceFiles
        .map(path => `${path}\n${readFileSync(path, 'utf8')}`)
        .join('\n'),
    ).not.toMatch(forbiddenBookkeepingReference);
  });
});
