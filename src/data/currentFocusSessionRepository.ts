import {
  createFocusSessionRepository,
  type CurrentFocusSessionRepository,
  type FocusSessionKeyValueStorage,
} from './focusSessionRepository';

export type {CurrentFocusSessionRepository};

export const createCurrentFocusSessionRepository =
  createFocusSessionRepository as unknown as (
    storage: FocusSessionKeyValueStorage,
    key?: string,
  ) => CurrentFocusSessionRepository;
