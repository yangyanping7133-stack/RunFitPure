import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, FlatList, PermissionsAndroid, Platform, TextInput,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Geolocation from '@react-native-community/geolocation';
import { accelerometer, SensorTypes, setUpdateIntervalForType } from 'react-native-sensors';
import { getAllWorkouts, getWorkoutsByDate, getStats, insertWorkout, deleteWorkout, Workout } from './database';
import { GPSIMUFusion } from './kalman';
import { getSettings, saveSettings } from './settings';

const Tab = createBottomTabNavigator();

type WorkoutType = 'walking' | 'cycling';

const MET_MAP = { walking: 3.8, cycling: 7.5 };
const STEP_LENGTH = { walking: 0.75, cycling: 0 };

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
  private buffer: number[] = [];
  private lastTs = 0;
  private base = 9.8;
  private count = 0;

  add(magnitude: number, ts: number): number {
    this.buffer.push(magnitude);
    if (this.buffer.length > 30) this.buffer.shift();
    this.count++;
    if (this.count % 50 === 0) this.base = this.buffer.reduce((a,b) => a+b, 0) / this.buffer.length;
    if (Math.abs(magnitude - this.base) > 1.2 && (ts - this.lastTs) > 300) {
      this.lastTs = ts;
      return 1;
    }
    return 0;
  }

  reset() { this.buffer = []; this.lastTs = 0; this.base = 9.8; this.count = 0; }
}

async function requestLocation(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const r = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        { title: '位置权限', message: 'RunFit 需要位置来记录轨迹', buttonPositive: '确定' },
      );
      return r === PermissionsAndroid.RESULTS.GRANTED;
    } catch { return false; }
  }
  return true;
}

// ─── Home ─────────────────────────────────────────────────────────────────
function HomeScreen() {
  const [stats, setStats] = useState({ totalDuration:0, totalDistance:0, totalCalories:0, totalSteps:0, workoutCount:0 });
  const today = new Date().toISOString().split('T')[0];
  useEffect(() => { getStats(today).then(setStats); }, []);
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.welcome}>今天运动了吗？</Text>
        <Text style={styles.date}>{today}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>今日数据</Text>
        <View style={styles.statsGrid}>
          {[
            { label:'运动次数', value: stats.workoutCount },
            { label:'总时长', value: formatDuration(stats.totalDuration) },
            { label:'总距离', value: formatDist(stats.totalDistance) },
            { label:'消耗千卡', value: stats.totalCalories },
          ].map(({label, value}) => (
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

// ─── Record ────────────────────────────────────────────────────────────────
function RecordScreen() {
  const [workoutType, setWorkoutType] = useState<WorkoutType>('walking');
  const [duration, setDuration] = useState(0);
  const [gpsDist, setGpsDist] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [calories, setCalories] = useState(0);
  const [recording, setRecording] = useState(false);
  const [gpsQuality, setGpsQuality] = useState<'off'|'good'|'bad'>('off');
  const [gpsPointCount, setGpsPointCount] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef = useRef<number | null>(null);
  const accelSubRef = useRef<{ unsubscribe: () => void } | null>(null);
  const startRef = useRef<string>('');
  const pointsRef = useRef<{ lat:number; lon:number; ts:number }[]>([]);
  const lastGpsTsRef = useRef<number>(0);
  const stepDetectorRef = useRef(new StepDetector());
  const kfRef = useRef(new GPSIMUFusion());
  const accDistRef = useRef(0);
  const stepsRef = useRef(0);
  const weightRef = useRef(70);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (watchRef.current !== null) Geolocation.clearWatch(watchRef.current);
      if (accelSubRef.current) accelSubRef.current.unsubscribe();
    };
  }, []);

  async function start() {
    const ok = await requestLocation();
    if (!ok) { Alert.alert('权限不足','需要位置权限'); return; }

    const weight = (await getSettings()).weight;
    weightRef.current = weight;

    const now = new Date().toISOString();
    startRef.current = now;
    pointsRef.current = [];
    lastGpsTsRef.current = Date.now();
    accDistRef.current = 0;
    stepsRef.current = 0;
    stepDetectorRef.current.reset();
    kfRef.current.reset();

    setRecording(true);
    setDuration(0); setGpsDist(0); setSpeed(0); setCalories(0);
    setGpsPointCount(0); setGpsQuality('good');

    const met = MET_MAP[workoutType];

    timerRef.current = setInterval(() => {
      setDuration(d => {
        const n = d + 1;
        if (n % 10 === 0) setCalories(Math.round(met * weightRef.current * (n / 3600)));
        return n;
      });
    }, 1000);

    if (workoutType === 'walking') {
      setUpdateIntervalForType(SensorTypes.accelerometer, 50);
      accelSubRef.current = accelerometer.subscribe({
        next: ({ x, y, z }: any) => {
          const ts = Date.now();
          const mag = Math.sqrt(x*x + y*y + z*z);
          const s = stepDetectorRef.current.add(mag, ts);
          if (s > 0) {
            stepsRef.current += s;
            accDistRef.current += STEP_LENGTH.walking;
            setGpsDist(accDistRef.current);
          }
        },
        error: (err: any) => console.warn('Accel err:', err),
      });
    }

    watchRef.current = Geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, speed: gpsSpeed, altitude, accuracy } = pos.coords;
        const ts = Date.now();
        kfRef.current.updateGPS(latitude, longitude, Math.max(gpsSpeed ?? 0, 0), altitude ?? 0, accuracy ?? 10);
        setGpsQuality(accuracy > 20 ? 'bad' : 'good');
        const prev = pointsRef.current[pointsRef.current.length - 1];
        if (prev) {
          const d = haversine(prev.lat, prev.lon, latitude, longitude);
          const dt = (ts - lastGpsTsRef.current) / 1000;
          if (dt > 0 && d > 0.3 && d < 200) {
            accDistRef.current += d;
            setGpsDist(accDistRef.current);
            setSpeed(d / dt);
          }
        }
        pointsRef.current.push({ lat: latitude, lon: longitude, ts });
        lastGpsTsRef.current = ts;
        setGpsPointCount(c => c + 1);
      },
      (err: any) => { console.warn('GPS err:', err); setGpsQuality('bad'); },
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
    const met = MET_MAP[workoutType];
    const cals = Math.round(met * weightRef.current * (duration / 3600));
    const dist = (gpsQuality === 'good' && gpsPointCount > 3) ? accDistRef.current : 0;
    const avgSpeed = duration > 0 ? dist / duration : 0;

    insertWorkout({
      type: workoutType,
      duration,
      distance: Math.round(dist),
      calories: cals,
      date,
      startTime: startRef.current,
      endTime: end,
      steps: stepsRef.current || null,
      notes: null,
    }).then(() => Alert.alert('已保存',
      `${workoutType === 'cycling' ? '🚴 骑行' : '🚶 走路'}\n` +
      `时长：${formatDuration(duration)}\n` +
      `距离：${formatDist(dist)}\n` +
      `平均速度：${formatSpeedKmh(avgSpeed)} km/h\n` +
      `消耗：${cals}千卡\n` +
      `GPS点数：${gpsPointCount}`
    )).catch(() => Alert.alert('保存失败'));

    setGpsDist(0); setSpeed(0); setCalories(0); setGpsPointCount(0);
    startRef.current = '';
  }

  const emoji = workoutType === 'cycling' ? '🚴' : '🚶';
  const typeLabel = workoutType === 'cycling' ? '骑行' : '走路';
  const gpsDotStyle = gpsQuality === 'good' ? styles.gpsOn : gpsQuality === 'bad' ? styles.gpsBad : styles.gpsOff;

  return (
    <ScrollView style={styles.container}>
      {!recording && (
        <View style={styles.typeSelector}>
          {(['walking','cycling'] as WorkoutType[]).map(t => (
            <TouchableOpacity key={t} style={[styles.typeBtn, workoutType===t && (t==='walking' ? styles.typeBtnWalk : styles.typeBtnCycle)]}
              onPress={() => setWorkoutType(t)}>
              <Text style={[styles.typeBtnText, workoutType===t && styles.typeBtnTextActive]}>
                {t==='cycling' ? '🚴 骑行' : '🚶 走路'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.timerCard}>
        <Text style={styles.timerEmoji}>{emoji}</Text>
        <Text style={styles.timerValue}>{formatDuration(duration)}</Text>
        <Text style={styles.timerLabel}>{typeLabel}时长</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}><Text style={styles.statBoxValue}>{formatDist(gpsDist)}</Text><Text style={styles.statBoxLabel}>距离</Text></View>
        <View style={styles.statBox}><Text style={styles.statBoxValue}>{formatSpeedKmh(speed)}</Text><Text style={styles.statBoxLabel}>km/h</Text></View>
        <View style={styles.statBox}><Text style={styles.statBoxValue}>{calories}</Text><Text style={styles.statBoxLabel}>千卡</Text></View>
      </View>

      <View style={styles.gpsStatusBar}>
        <View style={[styles.gpsDot, gpsDotStyle]} />
        <Text style={styles.gpsText}>
          {gpsQuality==='good' ? `GPS良好 · ${gpsPointCount}个点` :
           gpsQuality==='bad' ? 'GPS信号弱' : 'GPS关闭'}
        </Text>
      </View>

      {!recording && (
        <TouchableOpacity style={styles.startBtn} onPress={start}>
          <Text style={styles.startBtnText}>开始{typeLabel}</Text>
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

// ─── History ───────────────────────────────────────────────────────────────
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
    Alert.alert('删除','删除这条记录？',[
      { text:'取消', style:'cancel' },
      { text:'删除', style:'destructive', onPress:() => deleteWorkout(w.id).then(load) },
    ]);
  }

  const avgSpeed = (w: Workout) => w.duration > 0 ? (w.distance ?? 0) / w.duration * 3.6 : 0;
  const typeEmoji = (t: string) => t === 'cycling' ? '🚴' : '🚶';
  const typeLabel = (t: string) => t === 'cycling' ? '骑行' : '走路';

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
        renderItem={({ item: g }) => (
          <View>
            <Text style={styles.groupHeader}>{g.date}</Text>
            {g.items.map(w => (
              <TouchableOpacity key={w.id} style={styles.workoutCard} onLongPress={() => handleDelete(w)}>
                <View style={styles.cardTop}>
                  <Text style={styles.typeLabel}>{typeEmoji(w.type)} {typeLabel(w.type)}</Text>
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

// ─── Profile / Settings ────────────────────────────────────────────────────
function ProfileScreen() {
  const [weight, setWeight] = useState('70');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then(s => setWeight(String(s.weight)));
  }, []);

  async function handleSave() {
    const w = parseFloat(weight);
    if (isNaN(w) || w < 20 || w > 300) {
      Alert.alert('体重输入无效','请输入20-300之间的体重值');
      return;
    }
    await saveSettings({ weight: w });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    Alert.alert('保存成功', `体重已设置为 ${w} kg\n下次运动将使用此体重计算卡路里`);
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>🏃</Text>
        </View>
        <Text style={styles.profileName}>RunFit 用户</Text>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.settingsTitle}>运动设置</Text>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>体重 (kg)</Text>
          <TextInput
            style={styles.settingInput}
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            placeholder="输入体重"
          />
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>保存设置</Text>
        </TouchableOpacity>

        {saved && <Text style={styles.savedHint}>✓ 已保存</Text>}
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>算法说明</Text>
        <Text style={styles.infoText}>卡路里 = MET × 体重(kg) × 时间(小时)</Text>
        <Text style={styles.infoText}>走路 MET = 3.8 | 骑行 MET = 7.5</Text>
        <Text style={styles.infoText}>体重影响卡路里计算精度</Text>
      </View>

      <View style={styles.aboutCard}>
        <Text style={styles.aboutTitle}>关于 RunFit</Text>
        <Text style={styles.aboutText}>版本 1.5.0</Text>
        <Text style={styles.aboutText}>纯 React Native 开发，无 Expo 依赖</Text>
        <Text style={styles.aboutText}>GPS + IMU 传感器融合</Text>
      </View>
    </ScrollView>
  );
}

// ─── App ───────────────────────────────────────────────────────────────
export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{
        tabBarActiveTintColor:'#4CAF50',
        tabBarInactiveTintColor:'#999',
        headerStyle:{ backgroundColor:'#4CAF50' },
        headerTintColor:'#fff',
        headerTitleStyle:{ fontWeight:'bold' },
      }}>
        <Tab.Screen name="首页" component={HomeScreen} options={{ title:'RunFit' }} />
        <Tab.Screen name="记录" component={RecordScreen} options={{ title:'开始运动' }} />
        <Tab.Screen name="历史" component={HistoryScreen} options={{ title:'运动历史' }} />
        <Tab.Screen name="设置" component={ProfileScreen} options={{ title:'个人设置' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#f5f5f5' },
  header: { backgroundColor:'#4CAF50', padding:24 },
  welcome: { color:'#fff', fontSize:22, fontWeight:'bold' },
  date: { color:'rgba(255,255,255,0.8)', fontSize:13, marginTop:4 },
  card: { backgroundColor:'#fff', margin:16, borderRadius:12, padding:16, elevation:2 },
  cardTitle: { fontSize:16, fontWeight:'bold', marginBottom:12 },
  statsGrid: { flexDirection:'row', flexWrap:'wrap' },
  statItem: { width:'50%', paddingVertical:8 },
  statValue: { fontSize:20, fontWeight:'bold', color:'#4CAF50' },
  statLabel: { fontSize:12, color:'#999', marginTop:2 },
  typeSelector: { flexDirection:'row', padding:16, gap:12 },
  typeBtn: { flex:1, paddingVertical:14, borderRadius:12, backgroundColor:'#e0e0e0', alignItems:'center' },
  typeBtnWalk: { backgroundColor:'#4CAF50' },
  typeBtnCycle: { backgroundColor:'#2196F3' },
  typeBtnText: { fontSize:16, fontWeight:'600', color:'#666' },
  typeBtnTextActive: { color:'#fff' },
  timerCard: { backgroundColor:'#fff', margin:16, borderRadius:16, padding:32, alignItems:'center', elevation:2 },
  timerEmoji: { fontSize:56, marginBottom:8 },
  timerValue: { fontSize:48, fontWeight:'bold', color:'#4CAF50', fontVariant:['tabular-nums'] },
  timerLabel: { fontSize:14, color:'#999', marginTop:4 },
  statsRow: { flexDirection:'row', marginHorizontal:16, gap:8, marginBottom:12 },
  statBox: { flex:1, backgroundColor:'#fff', borderRadius:12, padding:12, alignItems:'center', elevation:1 },
  statBoxValue: { fontSize:18, fontWeight:'bold', color:'#333' },
  statBoxLabel: { fontSize:11, color:'#999', marginTop:2 },
  gpsStatusBar: { flexDirection:'row', alignItems:'center', marginHorizontal:16, marginBottom:16, backgroundColor:'#fff', borderRadius:8, padding:10 },
  gpsDot: { width:8, height:8, borderRadius:4, marginRight:8 },
  gpsOn: { backgroundColor:'#4CAF50' },
  gpsBad: { backgroundColor:'#FF9800' },
  gpsOff: { backgroundColor:'#999' },
  gpsText: { fontSize:12, color:'#666' },
  startBtn: { backgroundColor:'#4CAF50', marginHorizontal:16, paddingVertical:16, borderRadius:30, alignItems:'center', marginBottom:20 },
  startBtnText: { color:'#fff', fontSize:18, fontWeight:'bold' },
  recordingSection: { alignItems:'center', marginTop:10 },
  recordingRow: { flexDirection:'row', alignItems:'center', marginBottom:20 },
  recordingDot: { color:'#f44336', fontSize:20, marginRight:8 },
  recordingText: { color:'#f44336', fontSize:16, fontWeight:'bold' },
  stopBtn: { backgroundColor:'#f44336', paddingVertical:16, paddingHorizontal:48, borderRadius:30 },
  stopBtnText: { color:'#fff', fontSize:18, fontWeight:'bold' },
  searchBar: { flexDirection:'row', paddingHorizontal:12, paddingTop:12, gap:8 },
  dateInput: { flex:1, backgroundColor:'#fff', borderRadius:10, paddingHorizontal:14, paddingVertical:10 },
  searchBtn: { backgroundColor:'#4CAF50', paddingHorizontal:14, borderRadius:10, justifyContent:'center' },
  searchBtnText: { color:'#fff', fontWeight:'bold', fontSize:14 },
  clearBtn: { backgroundColor:'#999', paddingHorizontal:14, borderRadius:10, justifyContent:'center' },
  clearBtnText: { color:'#fff', fontWeight:'bold', fontSize:14 },
  groupHeader: { paddingVertical:8, paddingHorizontal:16, fontSize:14, fontWeight:'bold', color:'#666', backgroundColor:'#f5f5f5' },
  workoutCard: { backgroundColor:'#fff', marginHorizontal:12, marginVertical:4, borderRadius:12, padding:14, elevation:1 },
  cardTop: { flexDirection:'row', justifyContent:'space-between', marginBottom:8 },
  typeLabel: { fontSize:16, fontWeight:'bold', color:'#333' },
  timeText: { fontSize:13, color:'#999' },
  cardStats: { flexDirection:'row', flexWrap:'wrap', gap:12 },
  statText: { fontSize:14, color:'#4CAF50', fontWeight:'600' },
  empty: { textAlign:'center', color:'#999', paddingVertical:40 },
  // Profile
  profileHeader: { backgroundColor:'#4CAF50', paddingVertical:32, paddingHorizontal:20, alignItems:'center' },
  avatar: { width:72, height:72, borderRadius:36, backgroundColor:'#fff', justifyContent:'center', alignItems:'center', marginBottom:12 },
  avatarText: { fontSize:36 },
  profileName: { color:'#fff', fontSize:20, fontWeight:'bold' },
  settingsCard: { backgroundColor:'#fff', margin:16, borderRadius:12, padding:16, elevation:2 },
  settingsTitle: { fontSize:16, fontWeight:'bold', marginBottom:16 },
  settingRow: { flexDirection:'row', alignItems:'center', marginBottom:16 },
  settingLabel: { fontSize:15, color:'#333', width:80 },
  settingInput: { flex:1, backgroundColor:'#f5f5f5', borderRadius:8, paddingHorizontal:14, paddingVertical:10, fontSize:15, textAlign:'center' },
  saveBtn: { backgroundColor:'#4CAF50', paddingVertical:14, borderRadius:24, alignItems:'center' },
  saveBtnText: { color:'#fff', fontSize:16, fontWeight:'bold' },
  savedHint: { textAlign:'center', color:'#4CAF50', fontSize:13, marginTop:8 },
  infoCard: { backgroundColor:'#fff', margin:16, marginTop:0, borderRadius:12, padding:16, elevation:2 },
  infoTitle: { fontSize:14, fontWeight:'bold', marginBottom:8 },
  infoText: { fontSize:13, color:'#666', lineHeight:22 },
  aboutCard: { backgroundColor:'#fff', margin:16, marginTop:0, borderRadius:12, padding:16, elevation:2 },
  aboutTitle: { fontSize:14, fontWeight:'bold', marginBottom:8 },
  aboutText: { fontSize:13, color:'#666', lineHeight:22 },
});
