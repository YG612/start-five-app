import type {Task} from './task';

export type LowEnergyModePreference = Readonly<{
  enabled: boolean;
  expiresAt: string | null;
  defaultFocusMinutes: 2 | 5;
}>;

export const DEFAULT_LOW_ENERGY_MODE: LowEnergyModePreference = {
  enabled: false,
  expiresAt: null,
  defaultFocusMinutes: 2,
};

function offsetMinutes(input: string): number | null {
  if (input.endsWith('Z')) return 0;
  const match = input.match(/([+-])(\d{2}):(\d{2})$/);
  if (match === null) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) return null;
  const total = hours * 60 + minutes;
  return match[1] === '-' ? -total : total;
}

export function nextLocalMidnight(nowInput: string): string {
  const nowMs = Date.parse(nowInput);
  if (!Number.isFinite(nowMs)) throw new Error('INVALID_LOW_ENERGY_TIME');
  const offset = offsetMinutes(nowInput);
  if (offset === null) {
    const local = new Date(nowMs);
    local.setDate(local.getDate() + 1);
    local.setHours(0, 0, 0, 0);
    return local.toISOString();
  }
  const wall = new Date(nowMs + offset * 60_000);
  const nextWallMidnight = Date.UTC(
    wall.getUTCFullYear(),
    wall.getUTCMonth(),
    wall.getUTCDate() + 1,
  );
  return new Date(nextWallMidnight - offset * 60_000).toISOString();
}

export function enableLowEnergyMode(
  nowInput: string,
  defaultFocusMinutes: 2 | 5,
): LowEnergyModePreference {
  return {
    enabled: true,
    expiresAt: nextLocalMidnight(nowInput),
    defaultFocusMinutes,
  };
}

export function activeLowEnergyMode(
  preference: LowEnergyModePreference,
  nowInput: string,
): LowEnergyModePreference {
  if (
    !preference.enabled ||
    preference.expiresAt === null ||
    !Number.isFinite(Date.parse(preference.expiresAt)) ||
    Date.parse(nowInput) >= Date.parse(preference.expiresAt)
  ) {
    return DEFAULT_LOW_ENERGY_MODE;
  }
  return preference;
}

export function lowEnergyTaskCandidates(tasks: readonly Task[]): readonly Task[] {
  const active = tasks.filter(task =>
    task.deletedAt === null &&
    (task.status === 'pending' || task.status === 'in_progress'),
  );
  const gentle = active.filter(task =>
    task.firstStep != null &&
    task.firstStep.trim() !== '' &&
    task.estimatedMinutes != null &&
    task.estimatedMinutes <= 15,
  );
  return gentle.length === 0 ? active : gentle;
}
