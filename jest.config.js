'use strict';

module.exports = {
  preset: '@react-native/jest-preset',
  fakeTimers: {
    doNotFake: ['nextTick', 'queueMicrotask'],
  },
  testTimeout: 30_000,
  roots: ['<rootDir>/tests/locked'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  clearMocks: true,
  restoreMocks: true,
  resetMocks: false,
  testEnvironment: 'node',
  transformIgnorePatterns: [
    'node_modules/(?!.*(?:@react-native|react-native))',
  ],
};
