import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, FlatList, PermissionsAndroid, Platform, TextInput } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Geolocation from '@react-native-community/geolocation';
import { accelerometer, SensorTypes, setUpdateIntervalForType } from 'react-native-sensors';
import { getAllWorkouts, getWorkoutsByDate, getStats, insertWorkout, deleteWorkout, Workout } from './database';
import { GPSIMUFusion } from './kalman';
import { getSettings, saveSettings } from './settings';
import OSMap from './components/OSMap';

const Tab = createBottomTabNavigator();
type WorkoutType = 'walking' | 'cycling' | 'treadmill';
const D_SPEED = 4.0, D_INCLINE = 8;

function calcMETWalking() { return 3.8; }
function calcMETCycling() { return 7.5; }
function calcMETTreadmill(speed: number, incline: number) {
  return (0.1 * speed + 1.8 * speed * (incline / 100) + 3.5) / 3.5;
}
function fmtDuration(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
}
function fmtDist(m: number) {
  if (m < 1000) return `${m.toFixed(0)}m`;
  return `${(m / 1000).toFixed(2)}km`;
}
function fmtSpeed(mps: number) { return (mps * 3.6).toFixed(1); }
function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000, dLat = ((lat2-lat1)*Math.PI)/180, dLon = ((lon2-lon1)*Math.PI)/180;
  const a = Math.sin(dLat/2)**2 + Math.cos((lat1*Math.PI)/180)*Math.cos((lat2*Math.PI)/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
class StepDetector {
  private buf: number[] = []; private lastTs = 0; private base = 9.8; private cnt = 0;
  add(mag: number, ts: number) {
    this.buf.push(mag);
    if (this.buf.length > 30) this.buf.shift();
    this.cnt++;
    if (this.cnt % 50 === 0) this.base = this.buf.reduce((a,b) => a+b, 0) / this.buf.length;
    if (Math.abs(mag - this.base) > 1.2 && (ts - this.lastTs) > 300) { this.lastTs = ts; return 1; }
    return 0;
  }
  reset() { this.buf = []; this.lastTs = 0; this.base = 9.8; this.cnt = 0; }
}
async function reqLocation() {
  if (Platform.OS === 'android') {
    try {
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        { title: '位置权限', message: 'RunFit 需要位置来记录轨迹', buttonPositive: '确定' });
      return r === PermissionsAndroid.RESULTS.GRANTED;
    } catch { return false; }
  }
  return true;
}

// ─── 首页 ───────────────────────────────────────────────────────────────
function HomeScreen() {
  const [stats, setStats] = useState({ totalDuration:0, totalDistance:0, totalCalories:0, totalSteps:0, workoutCount:0 });
  const today = new Date().toISOString().split('T')[0];
  useEffect(() => { getStats(today).then(setStats); }, []);
  return (
    <ScrollView style={C.container} contentContainerStyle={C.content}>
      <View style={C.homeHeader}>
        <Text style={C.homeGreeting}>今日运动</Text>
        <Text style={C.homeDate}>{today}</Text>
      </View>
      <View style={C.heroCard}>
        <View style={C.heroRow}>
          <View style={C.heroStat}>
            <Text style={C.heroValue}>{fmtDist(stats.totalDistance)}</Text>
            <Text style={C.heroLabel}>总距离</Text>
          </View>
          <View style={C.heroDivider} />
          <View style={C.heroStat}>
            <Text style={C.heroValue}>{fmtDuration(stats.totalDuration)}</Text>
            <Text style={C.heroLabel}>总时长</Text>
          </View>
        </View>
        <View style={C.heroRow}>
          <View style={C.heroStat}>
            <Text style={C.heroValue}>{stats.totalCalories}</Text>
            <Text style={C.heroLabel}>千卡</Text>
          </View>
          <View style={C.heroDivider} />
          <View style={C.heroStat}>
            <Text style={C.heroValue}>{stats.workoutCount}</Text>
            <Text style={C.heroLabel}>运动次数</Text>
          </View>
        </View>
      </View>
      <View style={C.tipCard}>
        <Text style={C.tipTitle}>💡 开始运动</Text>
        <Text style={C.tipText}>点击底部「记录」开始今天的运动吧！走路、骑行、跑步机都支持。</Text>
      </View>
    </ScrollView>
  );
}

// ─── 记录页 ──────────────────────────────────────────────────────────────
function RecordScreen() {
  const [type, setType] = useState<WorkoutType>('walking');
  const [dur, setDur] = useState(0);
  const [dist, setDist] = useState(0);
  const [spd, setSpd] = useState(0);
  const [cals, setCals] = useState(0);
  const [steps, setSteps] = useState(0);
  const [recording, setRecording] = useState(false);
  const [gpsQ, setGpsQ] = useState<'off'|'good'|'bad'>('off');
  const [gpsPts, setGpsPts] = useState(0);
  const [tmSpd, setTmSpd] = useState(String(D_SPEED));
  const [tmInc, setTmInc] = useState(String(D_INCLINE));

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef = useRef<number | null>(null);
  const accelSubRef = useRef<{ unsubscribe: () => void } | null>(null);
  const startRef = useRef<string>('');
  const ptsRef = useRef<{lat:number;lon:number;ts:number}[]>([]);
  const lastTsRef = useRef<number>(0);
  const stepDetRef = useRef(new StepDetector());
  const kfRef = useRef(new GPSIMUFusion());
  const accDistRef = useRef(0);
  const stepsRef = useRef(0);
  const wtRef = useRef(70);
  const spdRef = useRef(D_SPEED);
  const incRef = useRef(D_INCLINE);
  const coordsRef = useRef<{lat:number;lon:number}[]>([]);
  const typeCN: Record<WorkoutType, string> = { walking: '走路', cycling: '骑行', treadmill: '跑步机' };
  const typeIcon: Record<WorkoutType, string> = { walking: '🚶', cycling: '🚴', treadmill: '🏃' };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (watchRef.current !== null) Geolocation.clearWatch(watchRef.current);
      if (accelSubRef.current) accelSubRef.current.unsubscribe();
    };
  }, []);

  async function start() {
    const ok = await reqLocation();
    if (!ok) { Alert.alert('权限不足','需要位置权限'); return; }
    const settings = await getSettings();
    wtRef.current = settings.weight;
    spdRef.current = parseFloat(tmSpd) || D_SPEED;
    incRef.current = parseFloat(tmInc) || D_INCLINE;

    startRef.current = new Date().toISOString();
    ptsRef.current = [];
    coordsRef.current = [];
    lastTsRef.current = Date.now();
    accDistRef.current = 0;
    stepsRef.current = 0;
    stepDetRef.current.reset();
    kfRef.current.reset();

    setRecording(true);
    setDur(0); setDist(0); setSpd(0); setCals(0); setSteps(0);
    setGpsPts(0); setGpsQ('good');

    timerRef.current = setInterval(() => {
      setDur(d => {
        const n = d + 1;
        if (n % 10 === 0) {
          const met = type === 'treadmill' ? calcMETTreadmill(spdRef.current, incRef.current)
            : type === 'cycling' ? calcMETCycling() : calcMETWalking();
          setCals(Math.round(met * wtRef.current * (n / 3600)));
          if (type === 'treadmill') {
            accDistRef.current = (spdRef.current * 1000 * n) / 3600;
            setDist(accDistRef.current);
          }
        }
        return n;
      });
    }, 1000);

    if (type === 'walking') {
      setUpdateIntervalForType(SensorTypes.accelerometer, 50);
      accelSubRef.current = accelerometer.subscribe({
        next: ({ x, y, z }: any) => {
          const ts = Date.now();
          const mag = Math.sqrt(x*x + y*y + z*z);
          const s = stepDetRef.current.add(mag, ts);
          if (s > 0) {
            stepsRef.current += s;
            accDistRef.current += 0.75;
            setDist(accDistRef.current);
            setSteps(stepsRef.current);
          }
        },
        error: () => {},
      });
    }

    if (type !== 'treadmill') {
      watchRef.current = Geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, speed: gpsSpd, altitude, accuracy } = pos.coords;
          const ts = Date.now();
          kfRef.current.updateGPS(latitude, longitude, Math.max(gpsSpd??0, 0), altitude??0, accuracy??10);
          setGpsQ(accuracy > 20 ? 'bad' : 'good');
          const prev = ptsRef.current[ptsRef.current.length-1];
          if (prev) {
            const d = haversine(prev.lat, prev.lon, latitude, longitude);
            const dt = (ts - lastTsRef.current) / 1000;
            if (dt > 0 && d > 0.3 && d < 200) {
              accDistRef.current += d;
              setDist(accDistRef.current);
              setSpd(d / dt);
            }
          }
          const pt = { lat: latitude, lon: longitude, ts };
          ptsRef.current.push(pt);
          coordsRef.current = [...coordsRef.current.slice(-199), { lat: latitude, lon: longitude }];
          lastTsRef.current = ts;
          setGpsPts(c => c+1);
        },
        () => { setGpsQ('bad'); },
        { distanceFilter: 1 },
      );
    }
  }

  function stop() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (watchRef.current !== null) { Geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    if (accelSubRef.current) { accelSubRef.current.unsubscribe(); accelSubRef.current = null; }
    setRecording(false); setGpsQ('off');
    if (!startRef.current) return;

    const end = new Date().toISOString();
    const date = startRef.current.split('T')[0];
    const met = type === 'treadmill' ? calcMETTreadmill(spdRef.current, incRef.current)
      : type === 'cycling' ? calcMETCycling() : calcMETWalking();
    const c = Math.round(met * wtRef.current * (dur / 3600));
    const d = Math.round(dist);
    const avgSpd = dur > 0 ? d / dur : 0;
    insertWorkout({
      type: type, duration: dur, distance: d, calories: c, date,
      startTime: startRef.current, endTime: end,
      steps: stepsRef.current || null, notes: null,
    }).then(() => {
      let msg = `${typeIcon[type]} ${typeCN[type]}\n⏱ ${fmtDuration(dur)}\n📏 ${fmtDist(d)}\n⚡ ${fmtSpeed(avgSpd)} km/h\n🔥 ${c} 千卡`;
      if (type === 'treadmill') msg += `\n🏔 坡度 ${incRef.current}% · 速度 ${spdRef.current} km/h`;
      if (gpsPts > 0) msg += `\n📍 GPS ${gpsPts} 个点`;
      Alert.alert('已保存', msg);
    }).catch(() => Alert.alert('保存失败'));

    setDist(0); setSpd(0); setCals(0); setSteps(0); setGpsPts(0);
    coordsRef.current = [];
    startRef.current = '';
  }

  const iconCN: Record<WorkoutType, [string,string]> = {
    walking: ['🚶','走路'],
    cycling: ['🚴','骑行'],
    treadmill: ['🏃','跑步机'],
  };
  const typeColors: Record<WorkoutType, string> = { walking: '#00C853', cycling: '#2979FF', treadmill: '#FF6D00' };
  const typeColor = typeColors[type];
  const currentCoords = coordsRef.current;

  return (
    <ScrollView style={C.container} contentContainerStyle={C.content} stickyHeaderIndices={[0]}>
      {/* Mode selector */}
      <View style={C.modeSelectorWrap}>
        <View style={C.modeSelector}>
          {(['walking','cycling','treadmill'] as WorkoutType[]).map(t => (
            <TouchableOpacity key={t} style={[C.modeBtn, type===t && { backgroundColor: typeColors[t] }]}
              onPress={() => setType(t)}>
              <Text style={C.modeIcon}>{iconCN[t][0]}</Text>
              <Text style={[C.modeLabel, type===t && C.modeLabelActive]}>{iconCN[t][1]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Treadmill params */}
      {type === 'treadmill' && !recording && (
        <View style={C.tmCard}>
          <View style={C.tmRow}>
            <View style={C.tmField}>
              <Text style={C.tmLbl}>速度</Text>
              <TextInput style={C.tmInput} value={tmSpd}
                onChangeText={setTmSpd} keyboardType="decimal-pad" placeholder="km/h" placeholderTextColor="#555" />
            </View>
            <View style={C.tmSep} />
            <View style={C.tmField}>
              <Text style={C.tmLbl}>坡度</Text>
              <TextInput style={C.tmInput} value={tmInc}
                onChangeText={setTmInc} keyboardType="decimal-pad" placeholder="%" placeholderTextColor="#555" />
            </View>
          </View>
        </View>
      )}

      {/* Timer */}
      <View style={C.timerCard}>
        <Text style={C.timerEmoji}>{iconCN[type][0]}</Text>
        <Text style={C.timerValue}>{fmtDuration(dur)}</Text>
        <Text style={C.timerLabel}>{typeCN[type]}</Text>
      </View>

      {/* Stats row */}
      <View style={C.statsRow}>
        <View style={C.statBox}><Text style={C.statBVal}>{fmtDist(dist)}</Text><Text style={C.statBLbl}>距离</Text></View>
        <View style={C.statBox}><Text style={C.statBVal}>{fmtSpeed(spd)}</Text><Text style={C.statBLbl}>km/h</Text></View>
        <View style={C.statBox}><Text style={C.statBVal}>{cals}</Text><Text style={C.statBLbl}>千卡</Text></View>
        {type === 'walking' && <View style={C.statBox}><Text style={C.statBVal}>{steps}</Text><Text style={C.statBLbl}>步</Text></View>}
        {type === 'treadmill' && <View style={C.statBox}><Text style={C.statBVal}>{spdRef.current}</Text><Text style={C.statBLbl}>km/h</Text></View>}
        {type === 'treadmill' && <View style={C.statBox}><Text style={C.statBVal}>{incRef.current}%</Text><Text style={C.statBLbl}>坡度</Text></View>}
      </View>

      {/* Map for outdoor modes during recording */}
      {type !== 'treadmill' && recording && currentCoords.length > 0 && (
        <OSMap points={currentCoords} currentLocation={currentCoords[currentCoords.length-1]} />
      )}

      {/* GPS status */}
      {type !== 'treadmill' && (
        <View style={C.gpsBar}>
          <View style={[C.gpsDot, gpsQ==='good'?C.gpsOn:gpsQ==='bad'?C.gpsBad:C.gpsOff]} />
          <Text style={C.gpsTxt}>
            {gpsQ==='good' ? `定位良好 · ${gpsPts}个轨迹点` : gpsQ==='bad' ? 'GPS信号弱' : 'GPS已关闭'}
          </Text>
        </View>
      )}
      {type === 'treadmill' && (
        <View style={C.gpsBar}>
          <Text style={C.gpsTxt}>🏃 跑步机模式 · 距离由速度×时间自动计算</Text>
        </View>
      )}

      {/* Action button */}
      {!recording ? (
        <TouchableOpacity style={[C.startBtn, { backgroundColor: typeColor }]} onPress={start}>
          <Text style={C.startBtnTxt}>开始{typeCN[type]}</Text>
        </TouchableOpacity>
      ) : (
        <View style={C.recordingSection}>
          <View style={C.recRow}><Text style={C.recDot}>●</Text><Text style={C.recTxt}>运动中</Text></View>
          <TouchableOpacity style={C.stopBtn} onPress={stop}><Text style={C.stopBtnTxt}>结束运动</Text></TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

// ─── 历史 ─────────────────────────────────────────────────────────────────
function HistoryScreen() {
  const [ws, setWs] = useState<Workout[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => { load(); }, []);
  async function load() { setWs(await getAllWorkouts()); }
  async function byDate() {
    if (!q.trim()) { load(); return; }
    setWs(await getWorkoutsByDate(q.trim()));
  }
  function del(w: Workout) {
    Alert.alert('删除记录','确定删除这条运动记录吗？',[
      {text:'取消',style:'cancel'},
      {text:'删除',style:'destructive',onPress:() => deleteWorkout(w.id).then(load)},
    ]);
  }
  const avgSpd = (w: Workout) => w.duration > 0 ? (w.distance??0)/w.duration*3.6 : 0;
  const icon: Record<string, string> = { walking: '🚶', cycling: '🚴', treadmill: '🏃' };
  const name: Record<string, string> = { walking: '走路', cycling: '骑行', treadmill: '跑步机' };
  const groups: {date:string; items:Workout[]}[] = [];
  ws.forEach(w => { const last = groups[groups.length-1]; if (last && last.date===w.date) last.items.push(w); else groups.push({date:w.date,items:[w]}); });

  return (
    <View style={C.container}>
      <View style={C.searchBar}>
        <TextInput style={C.dateInput} placeholder="按日期搜索，如 2026-04-16" value={q}
          onChangeText={setQ} onSubmitEditing={byDate} placeholderTextColor="#666" />
        <TouchableOpacity style={C.searchBtn} onPress={byDate}><Text style={C.searchBtnTxt}>搜索</Text></TouchableOpacity>
        <TouchableOpacity style={C.clrBtn} onPress={load}><Text style={C.clrBtnTxt}>全部</Text></TouchableOpacity>
      </View>
      <FlatList
        data={groups}
        keyExtractor={g => g.date}
        contentContainerStyle={C.listContent}
        renderItem={({item:g}) => (
          <View>
            <Text style={C.groupHdr}>{g.date}</Text>
            {g.items.map(w => (
              <TouchableOpacity key={w.id} style={C.wCard} onLongPress={() => del(w)}>
                <View style={C.wTop}>
                  <View style={C.wLeft}>
                    <Text style={C.wIcon}>{icon[w.type] || '🏃'}</Text>
                    <Text style={C.wType}>{name[w.type] || w.type}</Text>
                  </View>
                  <Text style={C.wTime}>{w.startTime.split('T')[1].substring(0,5)}</Text>
                </View>
                <View style={C.wStats}>
                  <Text style={C.wStat}>⏱ {fmtDuration(w.duration)}</Text>
                  <Text style={C.wStat}>📏 {fmtDist(w.distance??0)}</Text>
                  <Text style={C.wStat}>⚡ {avgSpd(w).toFixed(1)} km/h</Text>
                  <Text style={C.wStat}>🔥 {w.calories}千卡</Text>
                  {w.steps != null && <Text style={C.wStat}>👟 {w.steps}步</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
        ListEmptyComponent={<View style={C.empty}><Text style={C.emptyText}>暂无记录</Text><Text style={C.emptySub}>开始你的第一次运动吧！</Text></View>}
      />
    </View>
  );
}

// ─── 设置 ──────────────────────────────────────────────────────────────────
function ProfileScreen() {
  const [wt, setWt] = useState('70');
  const [saved, setSaved] = useState(false);
  useEffect(() => { getSettings().then(s => setWt(String(s.weight))); }, []);
  async function save() {
    const w = parseFloat(wt);
    if (isNaN(w) || w < 20 || w > 300) { Alert.alert('体重无效','请输入20-300之间的数值'); return; }
    await saveSettings({ weight: w });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    Alert.alert('保存成功', `体重已设置为 ${w} kg`);
  }
  return (
    <ScrollView style={C.container} contentContainerStyle={C.content}>
      <View style={C.profileHdr}>
        <View style={C.avatar}><Text style={C.avatarTxt}>🏃</Text></View>
        <Text style={C.profileName}>RunFit 用户</Text>
      </View>
      <View style={C.card}>
        <Text style={C.cardTitle}>⚙️ 运动设置</Text>
        <View style={C.setRow}>
          <Text style={C.setLbl}>体重 (kg)</Text>
          <TextInput style={C.setInput} value={wt} onChangeText={setWt} keyboardType="decimal-pad" />
        </View>
        <TouchableOpacity style={C.saveBtn} onPress={save}><Text style={C.saveBtnTxt}>保存设置</Text></TouchableOpacity>
        {saved && <Text style={C.savedHint}>✓ 已保存</Text>}
      </View>
      <View style={C.card}>
        <Text style={C.cardTitle}>📐 算法说明</Text>
        <Text style={C.infoTxt}>🚶 走路：MET = 3.8</Text>
        <Text style={C.infoTxt}>🚴 骑行：MET = 7.5</Text>
        <Text style={C.infoTxt}>🏃 跑步机：MET = (0.1×v + 1.8×v×坡度% + 3.5) ÷ 3.5</Text>
        <Text style={C.infoTxt}>🔥 卡路里 = MET × 体重(kg) × 时间(h)</Text>
      </View>
      <View style={C.card}>
        <Text style={C.cardTitle}>ℹ️ 关于</Text>
        <Text style={C.infoTxt}>RunFit v1.7.0</Text>
        <Text style={C.infoTxt}>纯 React Native，无 Expo</Text>
        <Text style={C.infoTxt}>GPS + IMU 传感器融合</Text>
        <Text style={C.infoTxt}>地图来源：OpenStreetMap</Text>
      </View>
    </ScrollView>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarStyle: C.tabBar,
          tabBarActiveTintColor: '#00d4ff',
          tabBarInactiveTintColor: '#666',
          headerStyle: C.header,
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        }}
      >
        <Tab.Screen name="首页" component={HomeScreen} options={{ title: 'RunFit', tabBarIcon: ({color}) => <Text style={{fontSize:20}}>🏠</Text> }} />
        <Tab.Screen name="记录" component={RecordScreen} options={{ title: '开始运动', tabBarIcon: ({color}) => <Text style={{fontSize:20}}>🎯</Text> }} />
        <Tab.Screen name="历史" component={HistoryScreen} options={{ title: '运动历史', tabBarIcon: ({color}) => <Text style={{fontSize:20}}>📋</Text> }} />
        <Tab.Screen name="设置" component={ProfileScreen} options={{ title: '个人设置', tabBarIcon: ({color}) => <Text style={{fontSize:20}}>⚙️</Text> }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const C = StyleSheet.create({
  // Layout
  container: { flex:1, backgroundColor: '#0d0d1a' },
  content: { paddingBottom: 24 },
  listContent: { paddingBottom: 24 },

  // Header
  header: { backgroundColor: '#0d0d1a', elevation: 0, shadowOpacity: 0, borderBottomWidth: 0 },
  tabBar: { backgroundColor: '#0d0d1a', borderTopWidth: 1, borderTopColor: '#1a1a2e', paddingTop: 4, height: 56 },

  // Home
  homeHeader: { backgroundColor: '#0d0d1a', padding: 24, paddingTop: 16, paddingBottom: 8 },
  homeGreeting: { color: '#fff', fontSize: 28, fontWeight: '800' },
  homeDate: { color: '#666', fontSize: 13, marginTop: 4 },
  heroCard: { backgroundColor: '#1a1a2e', marginHorizontal: 16, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#2a2a3e' },
  heroRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  heroStat: { flex: 1, alignItems: 'center' },
  heroDivider: { width: 1, height: 40, backgroundColor: '#2a2a3e' },
  heroValue: { color: '#00d4ff', fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  heroLabel: { color: '#888', fontSize: 12, marginTop: 4 },
  tipCard: { backgroundColor: '#1a1a2e', marginHorizontal: 16, borderRadius: 16, padding: 16, marginTop: 8, borderWidth: 1, borderColor: '#2a2a3e' },
  tipTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 6 },
  tipText: { color: '#888', fontSize: 13, lineHeight: 20 },

  // Mode selector
  modeSelectorWrap: { backgroundColor: '#0d0d1a', paddingTop: 12, paddingHorizontal: 16, paddingBottom: 8 },
  modeSelector: { flexDirection: 'row', backgroundColor: '#1a1a2e', borderRadius: 16, padding: 4 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12, gap: 6 },
  modeIcon: { fontSize: 16 },
  modeLabel: { fontSize: 14, fontWeight: '600', color: '#666' },
  modeLabelActive: { color: '#fff' },

  // Treadmill params
  tmCard: { backgroundColor: '#1a1a2e', marginHorizontal: 16, marginTop: 8, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#2a2a3e' },
  tmRow: { flexDirection: 'row', alignItems: 'center' },
  tmField: { flex: 1, alignItems: 'center' },
  tmSep: { width: 1, height: 40, backgroundColor: '#2a2a3e' },
  tmLbl: { color: '#888', fontSize: 13, marginBottom: 8 },
  tmInput: { backgroundColor: '#0d0d1a', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center', width: '100%' },

  // Timer
  timerCard: { backgroundColor: '#1a1a2e', margin: 16, borderRadius: 24, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a3e' },
  timerEmoji: { fontSize: 48, marginBottom: 8 },
  timerValue: { fontSize: 56, fontWeight: '800', color: '#fff', fontVariant: ['tabular-nums'] },
  timerLabel: { color: '#888', fontSize: 14, marginTop: 6 },

  // Stats
  statsRow: { flexDirection: 'row', marginHorizontal: 16, gap: 8, marginBottom: 8 },
  statBox: { flex: 1, backgroundColor: '#1a1a2e', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a3e' },
  statBVal: { fontSize: 18, fontWeight: '700', color: '#fff' },
  statBLbl: { fontSize: 11, color: '#888', marginTop: 4 },

  // GPS
  gpsBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, backgroundColor: '#1a1a2e', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#2a2a3e' },
  gpsDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  gpsOn: { backgroundColor: '#00C853' }, gpsBad: { backgroundColor: '#FF6D00' }, gpsOff: { backgroundColor: '#555' },
  gpsTxt: { fontSize: 12, color: '#888' },

  // Buttons
  startBtn: { marginHorizontal: 16, paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginBottom: 8 },
  startBtnTxt: { color: '#fff', fontSize: 18, fontWeight: '800' },
  recordingSection: { alignItems: 'center', marginTop: 4 },
  recRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  recDot: { color: '#FF3B30', fontSize: 14, marginRight: 8 },
  recTxt: { color: '#FF3B30', fontSize: 15, fontWeight: '600' },
  stopBtn: { backgroundColor: '#FF3B30', paddingVertical: 16, paddingHorizontal: 60, borderRadius: 30 },
  stopBtnTxt: { color: '#fff', fontSize: 18, fontWeight: '800' },

  // History search
  searchBar: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 8 },
  dateInput: { flex: 1, backgroundColor: '#1a1a2e', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#fff', borderWidth: 1, borderColor: '#2a2a3e' },
  searchBtn: { backgroundColor: '#00d4ff', paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center' },
  searchBtnTxt: { color: '#0d0d1a', fontWeight: '700', fontSize: 14 },
  clrBtn: { backgroundColor: '#2a2a3e', paddingHorizontal: 14, borderRadius: 12, justifyContent: 'center' },
  clrBtnTxt: { color: '#888', fontWeight: '600', fontSize: 14 },

  // History list
  groupHdr: { paddingVertical: 10, paddingHorizontal: 16, fontSize: 13, fontWeight: '700', color: '#00d4ff', backgroundColor: '#0d0d1a' },
  wCard: { backgroundColor: '#1a1a2e', marginHorizontal: 12, marginVertical: 4, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#2a2a3e' },
  wTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  wLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wIcon: { fontSize: 20 },
  wType: { fontSize: 16, fontWeight: '700', color: '#fff' },
  wTime: { fontSize: 13, color: '#666' },
  wStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  wStat: { fontSize: 13, color: '#aaa', fontWeight: '500' },
  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyText: { color: '#666', fontSize: 18, fontWeight: '600' },
  emptySub: { color: '#444', fontSize: 14, marginTop: 8 },

  // Profile
  profileHdr: { backgroundColor: '#1a1a2e', paddingVertical: 32, paddingHorizontal: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#2a2a3e' },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#0d0d1a', justifyContent: 'center', alignItems: 'center', marginBottom: 12, borderWidth: 2, borderColor: '#00d4ff' },
  avatarTxt: { fontSize: 32 },
  profileName: { color: '#fff', fontSize: 20, fontWeight: '700' },
  card: { backgroundColor: '#1a1a2e', margin: 16, marginTop: 8, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#2a2a3e' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 16 },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  setLbl: { fontSize: 15, color: '#aaa', width: 80 },
  setInput: { flex: 1, backgroundColor: '#0d0d1a', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: '#fff', textAlign: 'center', borderWidth: 1, borderColor: '#2a2a3e' },
  saveBtn: { backgroundColor: '#00d4ff', paddingVertical: 14, borderRadius: 24, alignItems: 'center' },
  saveBtnTxt: { color: '#0d0d1a', fontSize: 16, fontWeight: '800' },
  savedHint: { textAlign: 'center', color: '#00C853', fontSize: 13, marginTop: 10, fontWeight: '600' },
  infoTxt: { fontSize: 14, color: '#aaa', lineHeight: 26 },
});
