import type {AsyncKeyValueBackend} from './persistentTaskStorage';
import {
  DEFAULT_LOW_ENERGY_MODE,
  type LowEnergyModePreference,
} from '../domain/lowEnergyMode';
import type {InsightDismissal} from '../domain/growthInsights';
import type {PreferredFocusMinutes} from '../domain/focusDurationRecommendation';
import type {FocusProtectionLevel} from '../domain/focusSchedule';

export type QuadrantHomeViewMode = 'map' | 'list';
export type QuadrantHomeTheme = 'system' | 'light' | 'dark';
export type AutomaticUrgencyPreference = 'follow_due' | 'keep_position';
export type ReminderIntensityPreference = 'gentle' | 'standard' | 'custom';
export type ScreenReaderPreference = 'auto' | 'list' | 'keep_user';
export type PreferredStartWindow = Readonly<{
  startLocalTime: string;
  endLocalTime: string;
}>;

export type QuadrantHomeSettings = Readonly<{
  viewMode: QuadrantHomeViewMode;
  theme: QuadrantHomeTheme;
  reduceMotion: boolean;
  tipsSeen: boolean;
  lowEnergyMode: LowEnergyModePreference;
  insightDismissal: InsightDismissal | null;
  insightDismissals?: readonly InsightDismissal[];
  viewModeManuallySelected: boolean;
  screenReaderListApplied: boolean;
  preferredFocusMinutes: PreferredFocusMinutes;
  focusDurationSuggestionDismissedAt: string | null;
  preferredWeekdays: readonly number[];
  preferredStartWindow: PreferredStartWindow | null;
  defaultProtectionLevel: FocusProtectionLevel;
  keepScreenAwake: boolean;
  automaticUrgency: AutomaticUrgencyPreference;
  quickAddDefaultQuadrant: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  quickAddDefaultMinutes: 5 | 15 | 25 | 50;
  defaultRepeatRule: 'none' | 'daily' | 'weekly';
  reminderIntensity: ReminderIntensityPreference;
  dailyProactiveReminderLimit: 0 | 1 | 2 | 3;
  hapticFeedback: boolean;
  focusEndSound: boolean;
  screenReaderPreference: ScreenReaderPreference;
  lastBackupAt: string | null;
}>;

export type QuadrantHomePreferences = Readonly<{
  readViewMode(): Promise<QuadrantHomeViewMode>;
  writeViewMode(viewMode: QuadrantHomeViewMode): Promise<void>;
  readSettings(): Promise<QuadrantHomeSettings>;
  writeSettings(patch: Partial<QuadrantHomeSettings>): Promise<void>;
}>;

export const QUADRANT_HOME_PREFERENCES_KEY =
  'start-five.quadrant-home-preferences.v1';

const DEFAULT_SETTINGS: QuadrantHomeSettings = {
  viewMode: 'map',
  theme: 'system',
  reduceMotion: false,
  tipsSeen: false,
  lowEnergyMode: DEFAULT_LOW_ENERGY_MODE,
  insightDismissal: null,
  insightDismissals: [],
  viewModeManuallySelected: false,
  screenReaderListApplied: false,
  preferredFocusMinutes: 5,
  focusDurationSuggestionDismissedAt: null,
  preferredWeekdays: [1, 2, 3, 4, 5],
  preferredStartWindow: null,
  defaultProtectionLevel: 'REMINDER_ONLY',
  keepScreenAwake: false,
  automaticUrgency: 'follow_due',
  quickAddDefaultQuadrant: 'Q2',
  quickAddDefaultMinutes: 5,
  defaultRepeatRule: 'none',
  reminderIntensity: 'standard',
  dailyProactiveReminderLimit: 2,
  hapticFeedback: true,
  focusEndSound: false,
  screenReaderPreference: 'auto',
  lastBackupAt: null,
};

function parsePreferredFocusMinutes(value: unknown): PreferredFocusMinutes {
  if (value === 45) return 50;
  return value === 2 || value === 15 || value === 25 || value === 50 ? value : 5;
}

function parseWeekdays(value: unknown): readonly number[] {
  if (!Array.isArray(value)) return DEFAULT_SETTINGS.preferredWeekdays;
  const weekdays = [...new Set(value.filter(
    (item): item is number => Number.isInteger(item) && item >= 0 && item <= 6,
  ))].sort();
  return weekdays.length === 0 ? DEFAULT_SETTINGS.preferredWeekdays : weekdays;
}

function parseLocalTime(value: unknown): string | null {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
    ? value
    : null;
}

function parseStartWindow(value: unknown): PreferredStartWindow | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const startLocalTime = parseLocalTime(candidate.startLocalTime);
  const endLocalTime = parseLocalTime(candidate.endLocalTime);
  return startLocalTime === null || endLocalTime === null || startLocalTime >= endLocalTime
    ? null
    : {startLocalTime, endLocalTime};
}

function parseNullableTimestamp(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}

function parseInsightDismissal(value: unknown): InsightDismissal | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    candidate.id.trim() === '' ||
    typeof candidate.dismissedAt !== 'string' ||
    !Number.isFinite(Date.parse(candidate.dismissedAt))
  ) return null;
  return {
    id: candidate.id.trim(),
    dismissedAt: new Date(candidate.dismissedAt).toISOString(),
  };
}

function parseInsightDismissals(value: unknown): readonly InsightDismissal[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(parseInsightDismissal)
    .filter((item): item is InsightDismissal => item !== null)
    .filter((item, index, all) =>
      all.findIndex(candidate => candidate.id === item.id) === index,
    )
    .slice(-32);
}

function parseLowEnergyMode(value: unknown): LowEnergyModePreference {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return DEFAULT_LOW_ENERGY_MODE;
  }
  const candidate = value as Record<string, unknown>;
  const expiresAt = candidate.expiresAt;
  return {
    enabled: candidate.enabled === true,
    expiresAt:
      typeof expiresAt === 'string' && Number.isFinite(Date.parse(expiresAt))
        ? new Date(expiresAt).toISOString()
        : null,
    defaultFocusMinutes: candidate.defaultFocusMinutes === 5 ? 5 : 2,
  };
}

function parse(raw: string | null): QuadrantHomeSettings {
  if (raw === null) {
    return DEFAULT_SETTINGS;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    ((value as {version?: unknown}).version !== 1 &&
      (value as {version?: unknown}).version !== 2 &&
      (value as {version?: unknown}).version !== 3 &&
      (value as {version?: unknown}).version !== 4 &&
      (value as {version?: unknown}).version !== 5 &&
      (value as {version?: unknown}).version !== 6 &&
      (value as {version?: unknown}).version !== 7)
  ) {
    return DEFAULT_SETTINGS;
  }
  const candidate = value as Record<string, unknown>;
  return {
    viewMode: candidate.viewMode === 'list' ? 'list' : 'map',
    theme:
      candidate.theme === 'dark' || candidate.theme === 'light'
        ? candidate.theme
        : 'system',
    reduceMotion: candidate.reduceMotion === true,
    tipsSeen: candidate.tipsSeen === true,
    lowEnergyMode: parseLowEnergyMode(candidate.lowEnergyMode),
    insightDismissal: parseInsightDismissal(candidate.insightDismissal),
    insightDismissals: parseInsightDismissals(candidate.insightDismissals),
    viewModeManuallySelected: candidate.viewModeManuallySelected === true,
    screenReaderListApplied: candidate.screenReaderListApplied === true,
    preferredFocusMinutes: parsePreferredFocusMinutes(candidate.preferredFocusMinutes),
    focusDurationSuggestionDismissedAt: parseNullableTimestamp(
      candidate.focusDurationSuggestionDismissedAt,
    ),
    preferredWeekdays: parseWeekdays(candidate.preferredWeekdays),
    preferredStartWindow: parseStartWindow(candidate.preferredStartWindow),
    defaultProtectionLevel: candidate.defaultProtectionLevel === 'REDUCE_DISTRACTIONS'
      ? 'REDUCE_DISTRACTIONS'
      : 'REMINDER_ONLY',
    keepScreenAwake: candidate.keepScreenAwake === true,
    automaticUrgency: candidate.automaticUrgency === 'keep_position'
      ? 'keep_position'
      : 'follow_due',
    quickAddDefaultQuadrant:
      candidate.quickAddDefaultQuadrant === 'Q1' || candidate.quickAddDefaultQuadrant === 'Q3' ||
      candidate.quickAddDefaultQuadrant === 'Q4'
        ? candidate.quickAddDefaultQuadrant
        : 'Q2',
    quickAddDefaultMinutes:
      candidate.quickAddDefaultMinutes === 15 || candidate.quickAddDefaultMinutes === 25 ||
      candidate.quickAddDefaultMinutes === 50
        ? candidate.quickAddDefaultMinutes
        : 5,
    defaultRepeatRule: candidate.defaultRepeatRule === 'daily' || candidate.defaultRepeatRule === 'weekly'
      ? candidate.defaultRepeatRule
      : 'none',
    reminderIntensity: candidate.reminderIntensity === 'gentle' || candidate.reminderIntensity === 'custom'
      ? candidate.reminderIntensity
      : 'standard',
    dailyProactiveReminderLimit:
      candidate.dailyProactiveReminderLimit === 0 || candidate.dailyProactiveReminderLimit === 1 ||
      candidate.dailyProactiveReminderLimit === 3
        ? candidate.dailyProactiveReminderLimit
        : 2,
    hapticFeedback: candidate.hapticFeedback !== false,
    focusEndSound: candidate.focusEndSound === true,
    screenReaderPreference: candidate.screenReaderPreference === 'list' ||
      candidate.screenReaderPreference === 'keep_user'
        ? candidate.screenReaderPreference
        : 'auto',
    lastBackupAt: parseNullableTimestamp(candidate.lastBackupAt),
  };
}

export function defaultQuadrantHomeSettings(): QuadrantHomeSettings {
  return {
    ...DEFAULT_SETTINGS,
    preferredWeekdays: [...DEFAULT_SETTINGS.preferredWeekdays],
    insightDismissals: [],
  };
}

export function validateQuadrantHomePreferencesBackup(raw: string | null): number {
  if (raw === null) return 0;
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('QUADRANT_HOME_PREFERENCES_INVALID');
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (value as {version?: unknown}).version !== 7
  ) {
    throw new Error('QUADRANT_HOME_PREFERENCES_INVALID');
  }
  const parsed = parse(raw);
  if (
    parsed.lowEnergyMode.enabled &&
    parsed.lowEnergyMode.expiresAt === null
  ) {
    throw new Error('QUADRANT_HOME_PREFERENCES_INVALID');
  }
  const candidate = value as Record<string, unknown>;
  if (
    !Object.prototype.hasOwnProperty.call(candidate, 'insightDismissal') ||
    (candidate.insightDismissal !== null && parsed.insightDismissal === null) ||
    !Array.isArray(candidate.insightDismissals) ||
    parsed.insightDismissals?.length !== candidate.insightDismissals.length
  ) {
    throw new Error('QUADRANT_HOME_PREFERENCES_INVALID');
  }
  return 1;
}

export function createQuadrantHomePreferences(
  backend: AsyncKeyValueBackend,
): QuadrantHomePreferences {
  let tail = Promise.resolve();
  async function readSettings(): Promise<QuadrantHomeSettings> {
    await tail;
    return parse(await backend.getItem(QUADRANT_HOME_PREFERENCES_KEY));
  }
  function writeSettings(
    patch: Partial<QuadrantHomeSettings>,
  ): Promise<void> {
    const pending = tail.then(async () => {
      const current = parse(await backend.getItem(QUADRANT_HOME_PREFERENCES_KEY));
      await backend.setItem(
        QUADRANT_HOME_PREFERENCES_KEY,
        JSON.stringify({version: 7, ...current, ...patch}),
      );
    });
    tail = pending.then(() => undefined, () => undefined);
    return pending;
  }
  return {
    async readViewMode() {
      return (await readSettings()).viewMode;
    },
    writeViewMode(viewMode) {
      return writeSettings({viewMode});
    },
    readSettings,
    writeSettings,
  };
}
