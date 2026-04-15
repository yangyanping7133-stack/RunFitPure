import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Workout {
  id: number;
  type: 'running' | 'walking' | 'cycling' | 'strength' | 'other';
  duration: number;
  distance: number | null;
  calories: number;
  date: string;
  startTime: string;
  endTime: string;
  steps: number | null;
  notes: string | null;
}

const STORAGE_KEY = 'runfit_workouts';

async function loadAll(): Promise<Workout[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function persist(workouts: Workout[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
}

export async function insertWorkout(w: Omit<Workout, 'id'>): Promise<number> {
  const all = await loadAll();
  const newId = all.length > 0 ? Math.max(...all.map((x) => x.id)) + 1 : 1;
  all.unshift({ ...w, id: newId });
  await persist(all);
  return newId;
}

export async function getAllWorkouts(): Promise<Workout[]> {
  return loadAll();
}

export async function getWorkoutsByDate(date: string): Promise<Workout[]> {
  return (await loadAll()).filter((w) => w.date === date);
}

export async function searchWorkouts(keyword: string): Promise<Workout[]> {
  const kw = keyword.toLowerCase();
  return (await loadAll()).filter(
    (w) => w.notes?.toLowerCase().includes(kw) || w.type.includes(kw),
  );
}

export async function getStats(date: string) {
  const list = await getWorkoutsByDate(date);
  return {
    totalDuration: list.reduce((s, w) => s + w.duration, 0),
    totalDistance: list.reduce((s, w) => s + (w.distance ?? 0), 0),
    totalCalories: list.reduce((s, w) => s + w.calories, 0),
    totalSteps: list.reduce((s, w) => s + (w.steps ?? 0), 0),
    workoutCount: list.length,
  };
}

export async function deleteWorkout(id: number): Promise<void> {
  await persist((await loadAll()).filter((w) => w.id !== id));
}
