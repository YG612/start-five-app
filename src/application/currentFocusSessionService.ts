import {
  createFocusSessionService,
  type CurrentCreateFocusSessionServiceOptions,
  type CurrentFocusSessionService,
} from './focusSessionService';

export type {
  CurrentCreateFocusSessionServiceOptions,
  CurrentFocusSessionService,
};

export const createCurrentFocusSessionService =
  createFocusSessionService as unknown as (
    options: CurrentCreateFocusSessionServiceOptions,
  ) => CurrentFocusSessionService;
