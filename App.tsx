import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, FlatList, PermissionsAndroid, Platform,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Geolocation from '@react-native-community/geolocation';
import { getAllWorkouts, getWorkoutsByDate, getStats, insertWorkout, deleteWorkout, Workout } from './database';

const Tab = createBottomTabNavigator();

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
}
function formatDist(m: number | null): string {
  if (m == null || m === 0) return '-';
  return m < 1000 ? `${m.toFixed(0)}米` : `${(m/1000).toFixed(2)}公里`;
}
function formatSpeed(mps: number): string {
  const kmh = mps * 3.6;
  return kmh.toFixed(1);
}

const MET = 3.8;

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

interface Point { lat: number; lon: number; ts: number; }

function haversine(p1: Point, p2: Point): number {
  const R = 6371000;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLon = ((p2.lon - p1.lon) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2
    + Math.cos((p1.lat * Math.PI)/180) * Math.cos((p2.lat * Math.PI)/180)
    * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: '位置权限',
          message: 'RunFit 需要获取您的位置来记录走路轨迹和计算距离',
          buttonNeutral: '稍后',
          buttonNegative: '取消',
          buttonPositive: '确定',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      return false;
    }
  }
  return true;
}

function RecordScreen() {
  const [duration, setDuration] = useState(0);
  const [distance, setDistance] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [calories, setCalories] = useState(0);
  const [steps, setSteps] = useState('');
  const [notes, setNotes] = useState('');
  const [recording, setRecording] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<'off' | 'on' | 'no-perm'>('off');
  const [locationCount, setLocationCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef = useRef<number | null>(null);
  const startRef = useRef<string | null>(null);
  const pointsRef = useRef<Point[]>([]);
  const lastTsRef = useRef<number>(0);
  const accumulatedDistRef = useRef(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (watchRef.current !== null) Geolocation.clearWatch(watchRef.current);
    };
  }, []);

  async function start() {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      Alert.alert('权限不足', '需要位置权限才能记录轨迹，请在设置中开启');
      return;
    }

    startRef.current = new Date().toISOString();
    pointsRef.current = [];
    lastTsRef.current = Date.now();
    accumulatedDistRef.current = 0;
    setGpsStatus('on');
    setRecording(true);
    setDuration(0);
    setDistance(0);
    setSpeed(0);
    setCalories(0);
    setLocationCount(0);

    timerRef.current = setInterval(() => {
      setDuration((d) => {
        const next = d + 1;
        if (next % 10 === 0) {
          setCalories(Math.round(MET * 70 * (next / 3600)));
        }
        return next;
      });
    }, 1000);

    watchRef.current = Geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const ts = Date.now();
        const pt: Point = { lat: latitude, lon: longitude, ts };
        const prev = pointsRef.current[pointsRef.current.length - 1];
        if (prev) {
          const d = haversine(prev, pt);
          const dt = (ts - lastTsRef.current) / 1000;
          if (dt > 0) {
            accumulatedDistRef.current += d;
            setDistance(accumulatedDistRef.current);
            setSpeed(d / dt);
          }
        }
        pointsRef.current.push(pt);
        lastTsRef.current = ts;
        setLocationCount((c) => c + 1);
      },
      (err) => console.warn('GPS error:', err),
      { accuracy: 3, distanceFilter: 5, interval: 2000, fastestInterval: 1000 },
    );
  }

  function stop() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (watchRef.current !== null) { Geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    setRecording(false);
    setGpsStatus('off');
    if (!startRef.current) return;

    const end = new Date().toISOString();
    const cals = Math.round(MET * 70 * (duration / 3600));
    const distM = Math.round(accumulatedDistRef.current);
    const stepCount = steps ? parseInt(steps, 10) : 0;
    const avgSpeed = duration > 0 ? accumulatedDistRef.current / duration : 0;

    insertWorkout({
      type: 'walking',
      duration,
      distance: distM || null,
      calories: cals || calories,
      date: startRef.current.split('T')[0],
      startTime: startRef.current,
      endTime: end,
      steps: stepCount || null,
      notes: notes || null,
    }).then(() => Alert.alert('已保存',
      `时长：${formatDuration(duration)}\n距离：${formatDist(distM)}\n平均速度：${formatSpeed(avgSpeed)} km/h\n千卡：${cals}\nGPS点数：${locationCount}`
    )).catch(() => Alert.alert('保存失败'));
    setDistance(0); setSpeed(0); setCalories(0); setSteps(''); setNotes('');
    startRef.current = null;
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.timerCard}>
        <Text style={styles.timerEmoji}>🚶</Text>
        <Text style={styles.timerValue}>{formatDuration(duration)}</Text>
        <Text style={styles.timerLabel}>走路时长</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statBoxValue}>{formatDist(distance)}</Text>
          <Text style={styles.statBoxLabel}>距离</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statBoxValue}>{formatSpeed(speed)}</Text>
          <Text style={styles.statBoxLabel}>m/s</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statBoxValue}>{calories}</Text>
          <Text style={styles.statBoxLabel}>千卡</Text>
        </View>
      </View>

      <View style={styles.gpsStatusBar}>
        <Text style={[styles.gpsDot, gpsStatus === 'on' ? styles.gpsOn : gpsStatus === 'no-perm' ? styles.gpsNo : styles.gpsOff]} />
        <Text style={styles.gpsText}>
          {gpsStatus === 'on' ? `GPS定位中... (${locationCount}点)` : gpsStatus === 'no-perm' ? '无GPS权限' : 'GPS已关闭'}
        </Text>
      </View>

      {!recording && (
        <>
          <TextInput style={styles.input} placeholder="手动补充步数（可选）" keyboardType="number-pad"
            value={steps} onChangeText={setSteps} />
          <TextInput style={styles.notesInput} placeholder="备注（可选）" multiline
            value={notes} onChangeText={setNotes} />
          <TouchableOpacity style={styles.startBtn} onPress={start}>
            <Text style={styles.startBtnText}>开始走路</Text>
          </TouchableOpacity>
        </>
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
  const [kwQuery, setKwQuery] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const data = await getAllWorkouts();
    setWorkouts(data);
  }

  async function searchByDate() {
    if (!dateQuery.trim()) { load(); return; }
    setWorkouts(await getWorkoutsByDate(dateQuery.trim()));
    setKwQuery('');
  }

  async function searchByKeyword() {
    if (!kwQuery.trim()) { load(); return; }
    const kw = kwQuery.trim().toLowerCase();
    const all = await getAllWorkouts();
    setWorkouts(all.filter((w) => w.notes?.toLowerCase().includes(kw)));
    setDateQuery('');
  }

  function handleDelete(w: Workout) {
    Alert.alert('删除', '删除这条走路记录？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => deleteWorkout(w.id).then(load) },
    ]);
  }

  const avgSpeed = (w: Workout) => w.duration > 0 ? (w.distance ?? 0) / w.duration : 0;

  const grouped: { date: string; items: Workout[] }[] = [];
  workouts.forEach((w) => {
    const last = grouped[grouped.length - 1];
    if (last && last.date === w.date) last.items.push(w);
    else grouped.push({ date: w.date, items: [w] });
  });

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput style={styles.dateInput} placeholder="日期 2026-04-16" value={dateQuery}
          onChangeText={setDateQuery} onSubmitEditing={searchByDate} returnKeyType="search" />
        <TouchableOpacity style={styles.searchBtn} onPress={searchByDate}>
          <Text style={styles.searchBtnText}>查日期</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.searchBar}>
        <TextInput style={styles.kwInput} placeholder="搜索备注" value={kwQuery}
          onChangeText={setKwQuery} onSubmitEditing={searchByKeyword} returnKeyType="search" />
        <TouchableOpacity style={styles.searchBtn} onPress={searchByKeyword}>
          <Text style={styles.searchBtnText}>搜索</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.clearBtn} onPress={load}>
          <Text style={styles.clearBtnText}>全部</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={grouped}
        keyExtractor={(g) => g.date}
        renderItem={({ item: group }) => (
          <View>
            <Text style={styles.groupHeader}>{group.date}</Text>
            {group.items.map((w) => (
              <TouchableOpacity key={w.id} style={styles.workoutCard} onLongPress={() => handleDelete(w)}>
                <View style={styles.cardTop}>
                  <Text style={styles.walkLabel}>🚶 走路</Text>
                  <Text style={styles.timeText}>{w.startTime.split('T')[1].substring(0,5)}</Text>
                </View>
                <View style={styles.cardStats}>
                  <Text style={styles.statText}>⏱ {formatDuration(w.duration)}</Text>
                  <Text style={styles.statText}>📏 {formatDist(w.distance)}</Text>
                  <Text style={styles.statText}>⚡ ${formatSpeed(avgSpeed(w))} km/h</Text>
                  <Text style={styles.statText}>🔥 {w.calories}千卡</Text>
                </View>
                {w.notes && <Text style={styles.notes}>{w.notes}</Text>}
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
  statsRow: { flexDirection: 'row', marginHorizontal: 16, gap: 12, marginBottom: 12 },
  statBox: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', elevation: 1 },
  statBoxValue: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  statBoxLabel: { fontSize: 12, color: '#999', marginTop: 2 },
  gpsStatusBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, backgroundColor: '#fff', borderRadius: 8, padding: 8 },
  gpsDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  gpsOn: { backgroundColor: '#4CAF50' },
  gpsOff: { backgroundColor: '#999' },
  gpsNo: { backgroundColor: '#f44336' },
  gpsText: { fontSize: 12, color: '#666' },
  input: { backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 15, marginHorizontal: 16, marginBottom: 10 },
  notesInput: { backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 15, marginHorizontal: 16, marginBottom: 16, minHeight: 60, textAlignVertical: 'top' },
  startBtn: { backgroundColor: '#4CAF50', marginHorizontal: 16, paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginBottom: 20 },
  startBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  recordingSection: { alignItems: 'center', marginTop: 10 },
  recordingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  recordingDot: { color: '#f44336', fontSize: 20, marginRight: 8 },
  recordingText: { color: '#f44336', fontSize: 16, fontWeight: 'bold' },
  stopBtn: { backgroundColor: '#f44336', paddingVertical: 16, paddingHorizontal: 48, borderRadius: 30 },
  stopBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  searchBar: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 12, gap: 8 },
  dateInput: { flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  kwInput: { flex: 2, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
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
  notes: { fontSize: 12, color: '#999', marginTop: 6, fontStyle: 'italic' },
  empty: { textAlign: 'center', color: '#999', paddingVertical: 40 },
});
