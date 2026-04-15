import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'runfit_settings';

export interface UserSettings {
  weight: number; // kg, default 70
}

const DEFAULT_SETTINGS: UserSettings = {
  weight: 70,
};

export async function getSettings(): Promise<UserSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Partial<UserSettings>): Promise<void> {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
}

export async function getWeight(): Promise<number> {
  const s = await getSettings();
  return s.weight;
}
