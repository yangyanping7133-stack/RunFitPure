import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, FlatList, PermissionsAndroid, Platform,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Geolocation from '@react-native-community/geolocation';
import { accelerometer, SensorTypes, setUpdateIntervalForType } from 'react-native-sensors';
import { getAllWorkouts, getWorkoutsByDate, getStats, insertWorkout, deleteWorkout, Workout } from './database';
import { GPSIMUFusion } from './kalman';

const Tab = createBottomTabNavigator();

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
}

function formatDist(m: number): string {
  if (m < 1000) return `${m.toFixed(0)}m`;
  return `${(m/1000).toFixed(2)}km`;
}

function formatSpeedKmh(mps: number): string {
  return (mps * 3.6).toFixed(2);
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2
    + Math.cos((lat1 * Math.PI)/180) * Math.cos((lat2 * Math.PI)/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

class StepDetector {
  private accelBuffer: number[] = [];
  private lastStepTs = 0;
  private baseLevel = 9.8;
  private sampleCount = 0;

  addSample(magnitude: number, ts: number): number {
    this.accelBuffer.push(magnitude);
    if (this.accelBuffer.length > 30) this.accelBuffer.shift();

    this.sampleCount++;
    if (this.sampleCount % 50 === 0) {
      this.baseLevel = this.accelBuffer.reduce((a, b) => a + b, 0) / this.accelBuffer.length;
    }

    const deviation = Math.abs(magnitude - this.baseLevel);
    if (deviation > 1.2 && (ts - this.lastStepTs) > 300) {
      this.lastStepTs = ts;
      return 1;
    }
    return 0;
  }

  reset() {
    this.accelBuffer = [];
    this.lastStepTs = 0;
    this.baseLevel = 9.8;
    this.sampleCount = 0;
  }
}

async function requestLocation(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        { title: '位置权限', message: 'RunFit 需要位置来记录走路轨迹', buttonPositive: '确定' },
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch { return false; }
  }
  return true;
}

function HomeScreen() {
  const [stats, setStats] = useState({ totalDuration: 0, totalDistance: 0, totalCalories: 0, totalSteps: 0, workoutCount: 0 });
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => { getStats(today).then(setStats); }, []);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.welcome}>今天走了多少步？</Text>
        <Text style={styles.date}>{today}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>今日数据</Text>
        <View style={styles.statsGrid}>
          {[
            { label: '运动次数', value: stats.workoutCount },
            { label: '总时长', value: formatDuration(stats.totalDuration) },
            { label: '总距离', value: formatDist(stats.totalDistance) },
            { label: '消耗千卡', value: stats.totalCalories },
          ].map(({ label, value }) => (
            <View key={label} style={styles.statItem}>
              <Text style={styles.statValue}>{value}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function RecordScreen() {
  const [duration, setDuration] = useState(0);
  const [gpsDist, setGpsDist] = useState(0);
  const [stepDist, setStepDist] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [steps, setSteps] = useState(0);
  const [calories, setCalories] = useState(0);
  const [recording, setRecording] = useState(false);
  const [gpsQuality, setGpsQuality] = useState<'off'|'good'|'bad'>('off');
  const [gpsPointCount, setGpsPointCount] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef = useRef<number | null>(null);
  const accelSubRef = useRef<{ unsubscribe: () => void } | null>(null);
  const startRef = useRef<string>('');
  const pointsRef = useRef<{ lat: number; lon: number; ts: number }[]>([]);
  const lastGpsTsRef = useRef<number>(0);
  const stepDetectorRef = useRef<StepDetector>(new StepDetector());
  const kfRef = useRef<GPSIMUFusion>(new GPSIMUFusion());
  const accumulatedDistRef = useRef(0);
  const stepDistRef = useRef(0);
  const stepsRef = useRef(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (watchRef.current !== null) Geolocation.clearWatch(watchRef.current);
      if (accelSubRef.current) accelSubRef.current.unsubscribe();
    };
  }, []);

  async function start() {
    const ok = await requestLocation();
    if (!ok) { Alert.alert('权限不足', '需要位置权限'); return; }

    startRef.current = new Date().toISOString();
    pointsRef.current = [];
    lastGpsTsRef.current = Date.now();
    accumulatedDistRef.current = 0;
    stepDistRef.current = 0;
    stepsRef.current = 0;
    stepDetectorRef.current.reset();
    kfRef.current.reset();

    setRecording(true);
    setDuration(0); setGpsDist(0); setStepDist(0);
    setSpeed(0); setSteps(0); setCalories(0);
    setGpsPointCount(0); setGpsQuality('good');

    // Timer
    timerRef.current = setInterval(() => {
      setDuration(d => {
        const next = d + 1;
        if (next % 10 === 0) setCalories(Math.round(3.8 * 70 * (next / 3600)));
        return next;
      });
    }, 1000);

    // Accelerometer for step detection
    setUpdateIntervalForType(SensorTypes.accelerometer, 50);
    accelSubRef.current = accelerometer.subscribe({
      next: ({ x, y, z, timestamp }: any) => {
        const ts = Date.now();
        const magnitude = Math.sqrt(x*x + y*y + z*z);
        const newSteps = stepDetectorRef.current.addSample(magnitude, ts);
        if (newSteps > 0) {
          stepsRef.current += newSteps;
          stepDistRef.current += 0.75; // 0.75m per step
          setSteps(stepsRef.current);
          setStepDist(stepDistRef.current);
        }
      },
      error: (err: any) => console.warn('Accel error:', err),
    });

    // GPS watch
    watchRef.current = Geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, speed: gpsSpeed, altitude, accuracy } = pos.coords;
        const ts = Date.now();

        kfRef.current.updateGPS(latitude, longitude, Math.max(gpsSpeed ?? 0, 0), altitude ?? 0, accuracy ?? 10);

        const quality = accuracy > 20 ? 'bad' : 'good';
        setGpsQuality(quality);

        const prev = pointsRef.current[pointsRef.current.length - 1];
        if (prev) {
          const d = haversine(prev.lat, prev.lon, latitude, longitude);
          const dt = (ts - lastGpsTsRef.current) / 1000;
          if (dt > 0 && d > 0.5 && d < 100) {
            accumulatedDistRef.current += d;
            setGpsDist(accumulatedDistRef.current);
            setSpeed(d / dt);
          }
        }
        pointsRef.current.push({ lat: latitude, lon: longitude, ts });
        lastGpsTsRef.current = ts;
        setGpsPointCount(c => c + 1);
      },
      (err: any) => { console.warn('GPS error:', err); setGpsQuality('bad'); },
      { distanceFilter: 1 },
    );
  }

  function stop() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (watchRef.current !== null) { Geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    if (accelSubRef.current) { accelSubRef.current.unsubscribe(); accelSubRef.current = null; }
    setRecording(false); setGpsQuality('off');

    if (!startRef.current) return;
    const end = new Date().toISOString();
    const date = startRef.current.split('T')[0];
    const cals = Math.round(3.8 * 70 * (duration / 3600));

    // Prefer GPS distance if quality good, else use step-based
    const dist = (gpsQuality === 'good' && gpsPointCount > 5) ? accumulatedDistRef.current : stepDistRef.current;
    const avgSpeed = duration > 0 ? dist / duration : 0;

    insertWorkout({
      type: 'walking',
      duration,
      distance: Math.round(dist),
      calories: cals,
      date,
      startTime: startRef.current,
      endTime: end,
      steps: stepsRef.current || null,
      notes: null,
    }).then(() => Alert.alert('已保存',
      `时长：${formatDuration(duration)}\n` +
      `GPS距离：${formatDist(accumulatedDistRef.current)}\n` +
      `步数距离：${formatDist(stepDistRef.current)}\n` +
      `计步：${stepsRef.current}步\n` +
      `最终距离：${formatDist(dist)}\n` +
      `平均速度：${formatSpeedKmh(avgSpeed)} km/h\n` +
      `GPS质量：${gpsQuality === 'good' ? '良好' : '较差（参考步数）'}`
    )).catch(() => Alert.alert('保存失败'));

    setGpsDist(0); setStepDist(0); setSpeed(0); setSteps(0); setCalories(0); setGpsPointCount(0);
    startRef.current = '';
  }

  const gpsDotStyle = gpsQuality === 'good' ? styles.gpsOn : gpsQuality === 'bad' ? styles.gpsBad : styles.gpsOff;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.timerCard}>
        <Text style={styles.timerEmoji}>🚶</Text>
        <Text style={styles.timerValue}>{formatDuration(duration)}</Text>
        <Text style={styles.timerLabel}>走路时长</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}><Text style={styles.statBoxValue}>{formatDist(gpsDist)}</Text><Text style={styles.statBoxLabel}>GPS距离</Text></View>
        <View style={styles.statBox}><Text style={styles.statBoxValue}>{formatDist(stepDist)}</Text><Text style={styles.statBoxLabel}>步数距离</Text></View>
        <View style={styles.statBox}><Text style={styles.statBoxValue}>{formatSpeedKmh(speed)}</Text><Text style={styles.statBoxLabel}>km/h</Text></View>
        <View style={styles.statBox}><Text style={styles.statBoxValue}>{steps}</Text><Text style={styles.statBoxLabel}>步数</Text></View>
      </View>

      <View style={styles.gpsStatusBar}>
        <View style={[styles.gpsDot, gpsDotStyle]} />
        <Text style={styles.gpsText}>
          {gpsQuality === 'good' ? `GPS良好 · ${gpsPointCount}个轨迹点` :
           gpsQuality === 'bad' ? 'GPS信号弱（使用步数估算）' : 'GPS关闭'}
        </Text>
      </View>

      {!recording && (
        <TouchableOpacity style={styles.startBtn} onPress={start}>
          <Text style={styles.startBtnText}>开始走路</Text>
        </TouchableOpacity>
      )}
      {recording && (
        <View style={styles.recordingSection}>
          <View style={styles.recordingRow}>
            <Text style={styles.recordingDot}>●</Text>
            <Text style={styles.recordingText}>记录中...</Text>
          </View>
          <TouchableOpacity style={styles.stopBtn} onPress={stop}>
            <Text style={styles.stopBtnText}>结束</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function HistoryScreen() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [dateQuery, setDateQuery] = useState('');

  useEffect(() => { load(); }, []);
  async function load() { setWorkouts(await getAllWorkouts()); }

  async function byDate() {
    if (!dateQuery.trim()) { load(); return; }
    setWorkouts(await getWorkoutsByDate(dateQuery.trim()));
  }

  function handleDelete(w: Workout) {
    Alert.alert('删除', '删除这条记录？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => deleteWorkout(w.id).then(load) },
    ]);
  }

  const avgSpeed = (w: Workout) => w.duration > 0 ? (w.distance ?? 0) / w.duration * 3.6 : 0;

  const grouped: { date: string; items: Workout[] }[] = [];
  workouts.forEach(w => {
    const last = grouped[grouped.length - 1];
    if (last && last.date === w.date) last.items.push(w);
    else grouped.push({ date: w.date, items: [w] });
  });

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <View style={styles.dateInput} />
        <TouchableOpacity style={styles.searchBtn} onPress={byDate}><Text style={styles.searchBtnText}>查日期</Text></TouchableOpacity>
        <TouchableOpacity style={styles.clearBtn} onPress={load}><Text style={styles.clearBtnText}>全部</Text></TouchableOpacity>
      </View>
      <FlatList
        data={grouped}
        keyExtractor={g => g.date}
        renderItem={({ item: group }) => (
          <View>
            <Text style={styles.groupHeader}>{group.date}</Text>
            {group.items.map(w => (
              <TouchableOpacity key={w.id} style={styles.workoutCard} onLongPress={() => handleDelete(w)}>
                <View style={styles.cardTop}>
                  <Text style={styles.walkLabel}>🚶 走路</Text>
                  <Text style={styles.timeText}>{w.startTime.split('T')[1].substring(0,5)}</Text>
                </View>
                <View style={styles.cardStats}>
                  <Text style={styles.statText}>⏱ {formatDuration(w.duration)}</Text>
                  <Text style={styles.statText}>📏 {formatDist(w.distance ?? 0)}</Text>
                  <Text style={styles.statText}>⚡ {avgSpeed(w).toFixed(1)} km/h</Text>
                  <Text style={styles.statText}>🔥 {w.calories}千卡</Text>
                  {w.steps != null && <Text style={styles.statText}>👟 {w.steps}步</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>暂无记录</Text>}
      />
    </View>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{
        tabBarActiveTintColor: '#4CAF50',
        tabBarInactiveTintColor: '#999',
        headerStyle: { backgroundColor: '#4CAF50' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}>
        <Tab.Screen name="首页" component={HomeScreen} options={{ title: 'RunFit' }} />
        <Tab.Screen name="记录" component={RecordScreen} options={{ title: '走路记录' }} />
        <Tab.Screen name="历史" component={HistoryScreen} options={{ title: '运动历史' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#4CAF50', padding: 24 },
  welcome: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  date: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 },
  card: { backgroundColor: '#fff', margin: 16, borderRadius: 12, padding: 16, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statItem: { width: '50%', paddingVertical: 8 },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#4CAF50' },
  statLabel: { fontSize: 12, color: '#999', marginTop: 2 },
  timerCard: { backgroundColor: '#fff', margin: 16, borderRadius: 16, padding: 32, alignItems: 'center', elevation: 2 },
  timerEmoji: { fontSize: 56, marginBottom: 8 },
  timerValue: { fontSize: 48, fontWeight: 'bold', color: '#4CAF50', fontVariant: ['tabular-nums'] },
  timerLabel: { fontSize: 14, color: '#999', marginTop: 4 },
  statsRow: { flexDirection: 'row', marginHorizontal: 16, gap: 8, marginBottom: 12 },
  statBox: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center', elevation: 1 },
  statBoxValue: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  statBoxLabel: { fontSize: 11, color: '#999', marginTop: 2 },
  gpsStatusBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 16, backgroundColor: '#fff', borderRadius: 8, padding: 10 },
  gpsDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  gpsOn: { backgroundColor: '#4CAF50' },
  gpsBad: { backgroundColor: '#FF9800' },
  gpsOff: { backgroundColor: '#999' },
  gpsText: { fontSize: 12, color: '#666' },
  startBtn: { backgroundColor: '#4CAF50', marginHorizontal: 16, paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginBottom: 20 },
  startBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  recordingSection: { alignItems: 'center', marginTop: 10 },
  recordingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  recordingDot: { color: '#f44336', fontSize: 20, marginRight: 8 },
  recordingText: { color: '#f44336', fontSize: 16, fontWeight: 'bold' },
  stopBtn: { backgroundColor: '#f44336', paddingVertical: 16, paddingHorizontal: 48, borderRadius: 30 },
  stopBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  searchBar: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 12, gap: 8 },
  dateInput: { flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  searchBtn: { backgroundColor: '#4CAF50', paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center' },
  searchBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  clearBtn: { backgroundColor: '#999', paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center' },
  clearBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  groupHeader: { paddingVertical: 8, paddingHorizontal: 16, fontSize: 14, fontWeight: 'bold', color: '#666', backgroundColor: '#f5f5f5' },
  workoutCard: { backgroundColor: '#fff', marginHorizontal: 12, marginVertical: 4, borderRadius: 12, padding: 14, elevation: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  walkLabel: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  timeText: { fontSize: 13, color: '#999' },
  cardStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statText: { fontSize: 14, color: '#4CAF50', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#999', paddingVertical: 40 },
});
