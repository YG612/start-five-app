import type {AsyncKeyValueBackend} from './persistentTaskStorage';
import {
  DEFAULT_LOW_ENERGY_MODE,
  type LowEnergyModePreference,
} from '../domain/lowEnergyMode';
import type {InsightDismissal} from '../domain/growthInsights';
import type {PreferredFocusMinutes} from '../domain/focusDurationRecommendation';

export type QuadrantHomeViewMode = 'map' | 'list';
export type QuadrantHomeTheme = 'system' | 'light' | 'dark';

export type QuadrantHomeSettings = Readonly<{
  viewMode: QuadrantHomeViewMode;
  theme: QuadrantHomeTheme;
  reduceMotion: boolean;
  tipsSeen: boolean;
  lowEnergyMode: LowEnergyModePreference;
  insightDismissal: InsightDismissal | null;
  viewModeManuallySelected: boolean;
  screenReaderListApplied: boolean;
  preferredFocusMinutes: PreferredFocusMinutes;
  focusDurationSuggestionDismissedAt: string | null;
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
  viewModeManuallySelected: false,
  screenReaderListApplied: false,
  preferredFocusMinutes: 5,
  focusDurationSuggestionDismissedAt: null,
};

function parsePreferredFocusMinutes(value: unknown): PreferredFocusMinutes {
  return value === 15 || value === 25 || value === 45 ? value : 5;
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
      (value as {version?: unknown}).version !== 5)
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
    viewModeManuallySelected: candidate.viewModeManuallySelected === true,
    screenReaderListApplied: candidate.screenReaderListApplied === true,
    preferredFocusMinutes: parsePreferredFocusMinutes(candidate.preferredFocusMinutes),
    focusDurationSuggestionDismissedAt: parseNullableTimestamp(
      candidate.focusDurationSuggestionDismissedAt,
    ),
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
    (value as {version?: unknown}).version !== 5
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
    (candidate.insightDismissal !== null && parsed.insightDismissal === null)
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
        JSON.stringify({version: 5, ...current, ...patch}),
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
