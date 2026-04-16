import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, FlatList, PermissionsAndroid, Platform, TextInput } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Geolocation from '@react-native-community/geolocation';
import { accelerometer, SensorTypes, setUpdateIntervalForType } from 'react-native-sensors';
import { getAllWorkouts, getWorkoutsByDate, getStats, insertWorkout, deleteWorkout, Workout } from './database';
import { HardwareStepCounterModule } from './HardwareStepCounter';
import { GPSIMUFusion } from './kalman';
import { getSettings, saveSettings } from './settings';
import OSMap from './components/OSMap';
import {YamapInstance} from 'react-native-yamap-plus';
YamapInstance.init('741e6cf5-8cb2-4ff9-b0ae-fa38d3c0a06d');

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
function fmtDist(m: number) { return m < 1000 ? `${m.toFixed(0)}m` : `${(m/1000).toFixed(2)}km`; }
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
    if (this.cnt % 50 === 0) this.base = this.buf.reduce((a,b) => a+b,0)/this.buf.length;
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

  const statCards = [
    { label:'运动次数', value:stats.workoutCount, unit:'次', color:'#00E5CC', emoji:'🏃' },
    { label:'总距离', value:fmtDist(stats.totalDistance), unit:'', color:'#FF6B9D', emoji:'📏' },
    { label:'总时长', value:fmtDuration(stats.totalDuration), unit:'', color:'#C084FC', emoji:'⏱' },
    { label:'消耗热量', value:stats.totalCalories, unit:'千卡', color:'#FB923C', emoji:'🔥' },
  ];

  return (
    <ScrollView style={C.container} contentContainerStyle={C.scrollContent}>
      {/* Header */}
      <View style={C.homeBg}>
        <Text style={C.homeGreeting}>动起来，</Text>
        <Text style={C.homeGreetingAccent}>每一天！</Text>
        <Text style={C.homeDate}>{today}</Text>
      </View>

      {/* Stat cards */}
      <View style={C.statGrid}>
        {statCards.map((s, i) => (
          <View key={s.label} style={[C.statCard, { borderLeftColor: s.color }]}>
            <Text style={C.statEmoji}>{s.emoji}</Text>
            <Text style={[C.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={C.statUnit}>{s.unit}</Text>
            <Text style={C.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* CTA card */}
      <View style={C.ctaCard}>
        <Text style={C.ctaTitle}>准备开始运动</Text>
        <Text style={C.ctaDesc}>点击底部「记录」开始你的运动，支持走路、骑行和跑步机三种模式</Text>
        <View style={C.ctaModes}>
          {[['🚶','走路','GPS+步数'],['🚴','骑行','GPS轨迹'],['🏃','跑步机','速度×时间']].map(([e,l,d]) => (
            <View key={l as string} style={C.ctaMode}>
              <Text style={C.ctaModeEmoji}>{e}</Text>
              <Text style={C.ctaModeLbl}>{l}</Text>
              <Text style={C.ctaModeDesc}>{d}</Text>
            </View>
          ))}
        </View>
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
  const [mapMode, setMapMode] = useState<"follow"|"route">("follow");
  const [tmSpd, setTmSpd] = useState(String(D_SPEED));
  const [tmInc, setTmInc] = useState(String(D_INCLINE));

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef = useRef<number | null>(null);
  const accelSubRef = useRef<{ unsubscribe: () => void } | null>(null);
  const startRef = useRef<string>('');
  const ptsRef = useRef<{lat:number;lon:number;ts:number}[]>([]);
  const lastTsRef = useRef<number>(0);
  const stepDetRef = useRef(new StepDetector());
  const recentStepTimesRef = useRef<number[]>([]);
  const lastStepTsRef = useRef<number>(0);
  const stepSubRef = useRef<{remove:()=>void}| null>(null);
  const kfRef = useRef(new GPSIMUFusion());
  const accDistRef = useRef(0);
  const stepsRef = useRef(0);
  const wtRef = useRef(70);
  const spdRef = useRef(D_SPEED);
  const incRef = useRef(D_INCLINE);
  const coordsRef = useRef<{lat:number;lon:number}[]>([]);
  const mapModeRef = useRef<"follow"|"route">("follow");
  const osMapRef = useRef<any>(null);

  const typeCN: Record<WorkoutType, string> = { walking:'走路', cycling:'骑行', treadmill:'跑步机' };
  const typeIcon: Record<WorkoutType, string> = { walking:'🚶', cycling:'🚴', treadmill:'🏃' };
  const typeColors: Record<WorkoutType, string> = { walking:'#00E5CC', cycling:'#60A5FA', treadmill:'#F472B6' };
  const typeColor = typeColors[type];

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
    mapModeRef.current = "follow";
    setMapMode("follow");
    recentStepTimesRef.current = [];
    lastTsRef.current = Date.now();
    accDistRef.current = 0;
    stepsRef.current = 0;
    stepDetRef.current.reset();
    recentStepTimesRef.current = [];
    lastStepTsRef.current = 0;
    if (stepSubRef.current) { stepSubRef.current.remove(); stepSubRef.current = null; }
    kfRef.current.reset();

    setRecording(true);
    setDur(0); setDist(0); setSpd(0); setCals(0); setSteps(0);
    setGpsPts(0); setGpsQ('good');

    timerRef.current = setInterval(() => {
      setDur(d => {
        const n = d + 1;
        if (n % 10 === 0) {
          const met = type==='treadmill' ? calcMETTreadmill(spdRef.current, incRef.current)
            : type==='cycling' ? calcMETCycling() : calcMETWalking();
          setCals(Math.round(met * wtRef.current * (n/3600)));
          if (type==='treadmill') { accDistRef.current = (spdRef.current*1000*n)/3600; setDist(accDistRef.current); }
        }
        return n;
      });
    }, 1000);

    if (type==='walking') {
      setUpdateIntervalForType(SensorTypes.accelerometer, 50);
      accelSubRef.current = accelerometer.subscribe({
        next: ({ x, y, z }: any) => {
          const ts = Date.now();
          const mag = Math.sqrt(x*x+y*y+z*z);
          const s = stepDetRef.current.add(mag, ts);
          if (s > 0) {
            stepsRef.current+=s;
            accDistRef.current+=0.75;
            setDist(accDistRef.current);
            setSteps(stepsRef.current);
            recentStepTimesRef.current.push(ts);
            if (recentStepTimesRef.current.length > 10) recentStepTimesRef.current.shift();
            // Step-based speed: steps/sec * step_length
            const times = recentStepTimesRef.current;
            if (times.length >= 2) {
              const span = (times[times.length-1] - times[0]) / 1000;
              if (span > 0) setSpd((times.length-1) / span * 0.75);
            }
          }
        }, error: () => {},
      });
    }
    if (type!=='treadmill') {
      watchRef.current = Geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, speed:gpsSpd, altitude, accuracy } = pos.coords;
          const ts = Date.now();
          kfRef.current.updateGPS(latitude, longitude, Math.max(gpsSpd??0,0), altitude??0, accuracy??10);
          setGpsQ(accuracy>20?'bad':'good');
          const prev = ptsRef.current[ptsRef.current.length-1];
          if (prev) {
            const d = haversine(prev.lat, prev.lon, latitude, longitude);
            const dt = (ts-lastTsRef.current)/1000;
            if (dt>0 && d>0.3 && d<200) {
              // Only add GPS distance for cycling; walking uses step count
              if (type !== "walking") { accDistRef.current+=d; setDist(accDistRef.current); setSpd(d/dt); }
            }
          }
          const pt = { lat:latitude, lon:longitude, ts };
          ptsRef.current.push(pt);
          coordsRef.current = [...coordsRef.current.slice(-199), { lat:latitude, lon:longitude }];
          lastTsRef.current = ts;
          setGpsPts(c=>c+1);
        },
        () => { setGpsQ('bad'); },
        { distanceFilter:1 },
      );
    }
  }

  function toggleMapMode() {
    if (mapModeRef.current === "follow") {
      mapModeRef.current = "route";
      setMapMode("route");
      setTimeout(() => osMapRef.current?.fitBounds(), 100);
    } else {
      mapModeRef.current = "follow";
      setMapMode("follow");
      if (coordsRef.current.length > 0) {
        const last = coordsRef.current[coordsRef.current.length - 1];
        setTimeout(() => osMapRef.current?.setCenter(last.lat, last.lon, 17), 100);
      }
    }
  }

  function stop() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current=null; }
    if (watchRef.current !== null) { Geolocation.clearWatch(watchRef.current); watchRef.current=null; }
    if (accelSubRef.current) { accelSubRef.current.unsubscribe(); accelSubRef.current=null; }
    if (stepSubRef.current) { stepSubRef.current.remove(); stepSubRef.current = null; }
    HardwareStepCounterModule.stop();
    setRecording(false); setGpsQ('off');
    if (!startRef.current) return;
    const end = new Date().toISOString();
    const date = startRef.current.split('T')[0];
    const met = type==='treadmill' ? calcMETTreadmill(spdRef.current, incRef.current)
      : type==='cycling' ? calcMETCycling() : calcMETWalking();
    const c = Math.round(met * wtRef.current * (dur/3600));
    const d = Math.round(dist);
    const avgSpd = dur>0 ? d/dur : 0;
    insertWorkout({ type, duration:dur, distance:d, calories:c, date, startTime:startRef.current, endTime:end, steps:stepsRef.current||null, notes:null })
      .then(() => {
        let msg = `${typeIcon[type]} ${typeCN[type]}\n⏱ ${fmtDuration(dur)}\n📏 ${fmtDist(d)}\n⚡ ${fmtSpeed(avgSpd)} km/h\n🔥 ${c} 千卡`;
        if (type==='treadmill') msg += `\n🏔 坡度 ${incRef.current}% · 速度 ${spdRef.current} km/h`;
        if (gpsPts>0) msg += `\n📍 GPS ${gpsPts} 个点`;
        Alert.alert('已保存', msg);
      }).catch(() => Alert.alert('保存失败'));
    setDist(0); setSpd(0); setCals(0); setSteps(0); setGpsPts(0);
    coordsRef.current = [];
    startRef.current = '';
  }

  const currentCoords = coordsRef.current;

  return (
    <ScrollView style={C.container} contentContainerStyle={C.scrollContent} stickyHeaderIndices={[0]}>
      {/* Sticky header */}
      <View style={C.stickyHeader}>
        <Text style={C.stickyTitle}>开始运动</Text>
      </View>

      {/* Mode selector */}
      <View style={C.modeSelector}>
        {(['walking','cycling','treadmill'] as WorkoutType[]).map(t => (
          <TouchableOpacity key={t} style={[C.modeBtn, type===t && { backgroundColor: typeColors[t]+'22', borderColor: typeColors[t] }]}
            onPress={() => setType(t)}>
            <Text style={C.modeIcon}>{typeIcon[t]}</Text>
            <Text style={[C.modeLabel, type===t && { color: typeColors[t] }]}>{typeCN[t]}</Text>
            {type===t && <View style={[C.modeDot, { backgroundColor: typeColors[t] }]} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Treadmill inputs */}
      {type==='treadmill' && !recording && (
        <View style={C.tmCard}>
          <View style={C.tmRow}>
            <View style={C.tmField}>
              <Text style={C.tmLbl}>速度 (km/h)</Text>
              <TextInput style={C.tmInput} value={tmSpd} onChangeText={setTmSpd} keyboardType="decimal-pad" placeholderTextColor="#555" />
            </View>
            <View style={C.tmDivider} />
            <View style={C.tmField}>
              <Text style={C.tmLbl}>坡度 (%)</Text>
              <TextInput style={C.tmInput} value={tmInc} onChangeText={setTmInc} keyboardType="decimal-pad" placeholderTextColor="#555" />
            </View>
          </View>
        </View>
      )}

      {/* Timer hero */}
      <View style={[C.timerHero, { borderColor: typeColor+'30' }]}>
        <Text style={C.timerEmoji}>{typeIcon[type]}</Text>
        <Text style={C.timerValue}>{fmtDuration(dur)}</Text>
        <Text style={[C.timerLabel, { color: typeColor }]}>{typeCN[type]}</Text>
        {/* Live data row */}
        <View style={C.liveRow}>
          <View style={C.liveItem}>
            <Text style={C.liveValue}>{fmtDist(dist)}</Text>
            <Text style={C.liveLabel}>距离</Text>
          </View>
          <View style={[C.liveDivider, { backgroundColor: typeColor+'40' }]} />
          <View style={C.liveItem}>
            <Text style={C.liveValue}>{fmtSpeed(spd)}</Text>
            <Text style={C.liveLabel}>km/h</Text>
          </View>
          <View style={[C.liveDivider, { backgroundColor: typeColor+'40' }]} />
          <View style={C.liveItem}>
            <Text style={[C.liveValue, { color: '#FB923C' }]}>{cals}</Text>
            <Text style={C.liveLabel}>千卡</Text>
          </View>
          {type==='walking' && <>
            <View style={[C.liveDivider, { backgroundColor: typeColor+'40' }]} />
            <View style={C.liveItem}>
              <Text style={C.liveValue}>{steps}</Text>
              <Text style={C.liveLabel}>步</Text>
            </View>
          </>}
        </View>
      </View>

      {/* Map */}
      {type!=='treadmill' && recording && currentCoords.length>0 && (
        <OSMap
          ref={osMapRef}
          points={currentCoords}
          currentLocation={currentCoords[currentCoords.length-1]}
          mode={mapMode}
        />
      )}

      {/* Map mode toggle */}
      {type!=='treadmill' && recording && currentCoords.length > 0 && (
        <TouchableOpacity
          style={[C.mapToggleBtn, mapMode==='route' && C.mapToggleBtnActive]}
          onPress={toggleMapMode}
          activeOpacity={0.8}
        >
          <Text style={[C.mapToggleBtnTxt, mapMode==='route' && C.mapToggleBtnTxtActive]}>
            {mapMode==='follow' ? '🗺️ 查看全路线' : '📍 回到定位'}
          </Text>
        </TouchableOpacity>
      )}

      {/* GPS indicator */}
      {type!=='treadmill' && (
        <View style={C.gpsBar}>
          <View style={[C.gpsDot, gpsQ==='good'?C.gpsOn:gpsQ==='bad'?C.gpsBad:C.gpsOff]} />
          <Text style={C.gpsTxt}>
            {gpsQ==='good' ? `定位良好 · ${gpsPts}轨迹点` : gpsQ==='bad' ? 'GPS信号弱' : 'GPS已关闭'}
          </Text>
        </View>
      )}
      {type==='treadmill' && (
        <View style={C.gpsBar}><Text style={C.gpsTxt}>🏃 跑步机 · 距离由速度×时间计算</Text></View>
      )}

      {/* Action button */}
      {!recording ? (
        <TouchableOpacity style={[C.bigBtn, { backgroundColor: typeColor }]} onPress={start} activeOpacity={0.85}>
          <Text style={C.bigBtnText}>开始{typeCN[type]}</Text>
        </TouchableOpacity>
      ) : (
        <View style={C.recSection}>
          <View style={C.recIndicator}>
            <View style={[C.recDot, { backgroundColor: '#FF3B30' }]} />
            <Text style={C.recText}>运动中</Text>
          </View>
          <TouchableOpacity style={C.stopBtn} onPress={stop} activeOpacity={0.8}>
            <Text style={C.stopBtnText}>结束运动</Text>
          </TouchableOpacity>
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
  async function byDate() { if (!q.trim()) { load(); return; } setWs(await getWorkoutsByDate(q.trim())); }
  function del(w: Workout) {
    Alert.alert('删除记录','确定删除这条运动记录吗？',[
      {text:'取消',style:'cancel'},
      {text:'删除',style:'destructive',onPress:()=>deleteWorkout(w.id).then(load)},
    ]);
  }
  const avgSpd = (w: Workout) => w.duration>0 ? (w.distance??0)/w.duration*3.6 : 0;
  const icon: Record<string,string> = { walking:'🚶', cycling:'🚴', treadmill:'🏃' };
  const name: Record<string,string> = { walking:'走路', cycling:'骑行', treadmill:'跑步机' };
  const typeColor2: Record<string,string> = { walking:'#00E5CC', cycling:'#60A5FA', treadmill:'#F472B6' };
  const groups: {date:string;items:Workout[]}[] = [];
  ws.forEach(w => { const last = groups[groups.length-1]; if(last&&last.date===w.date) last.items.push(w); else groups.push({date:w.date,items:[w]}); });

  return (
    <View style={C.container}>
      <View style={C.stickyHeader}>
        <Text style={C.stickyTitle}>运动历史</Text>
      </View>
      <View style={C.searchBar}>
        <TextInput style={C.dateInput} placeholder="搜索日期，如 2026-04-16" value={q}
          onChangeText={setQ} onSubmitEditing={byDate} placeholderTextColor="#555" />
        <TouchableOpacity style={C.searchBtn} onPress={byDate}><Text style={C.searchBtnTxt}>搜索</Text></TouchableOpacity>
        <TouchableOpacity style={C.clrBtn} onPress={load}><Text style={C.clrBtnTxt}>全部</Text></TouchableOpacity>
      </View>
      <FlatList
        data={groups}
        keyExtractor={g=>g.date}
        contentContainerStyle={C.listContent}
        renderItem={({item:g})=>(
          <View>
            <Text style={C.groupHdr}>{g.date}</Text>
            {g.items.map(w=>(
              <TouchableOpacity key={w.id} style={C.wCard} onLongPress={()=>del(w)}>
                <View style={C.wTop}>
                  <View style={C.wLeft}>
                    <Text style={C.wIcon}>{icon[w.type]||'🏃'}</Text>
                    <View>
                      <Text style={C.wType}>{name[w.type]||w.type}</Text>
                      <Text style={C.wTime}>{w.startTime.split('T')[1].substring(0,5)}</Text>
                    </View>
                  </View>
                  <View style={[C.wBadge, { backgroundColor: (typeColor2[w.type]||'#888')+'22' }]}>
                    <Text style={[C.wBadgeText, { color: typeColor2[w.type]||'#888' }]}>🔥 {w.calories}千卡</Text>
                  </View>
                </View>
                <View style={C.wStats}>
                  <Text style={C.wStat}>⏱ {fmtDuration(w.duration)}</Text>
                  <Text style={C.wStat}>📏 {fmtDist(w.distance??0)}</Text>
                  <Text style={C.wStat}>⚡ {avgSpd(w).toFixed(1)} km/h</Text>
                  {w.steps!=null && <Text style={C.wStat}>👟 {w.steps}步</Text>}
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
  useEffect(() => { getSettings().then(s=>setWt(String(s.weight))); }, []);
  async function save() {
    const w = parseFloat(wt);
    if (isNaN(w)||w<20||w>300) { Alert.alert('体重无效','请输入20-300之间的数值'); return; }
    await saveSettings({ weight: w });
    setSaved(true); setTimeout(()=>setSaved(false), 2500);
    Alert.alert('保存成功', `体重已设置为 ${w} kg`);
  }
  return (
    <ScrollView style={C.container} contentContainerStyle={C.scrollContent}>
      <View style={C.profileHdr}>
        <View style={C.avatar}>
          <Text style={C.avatarEmoji}>🏃</Text>
          <View style={C.avatarRing} />
        </View>
        <Text style={C.profileName}>RunFit 用户</Text>
        <Text style={C.profileSub}>v1.7.0 · Pure React Native</Text>
      </View>

      <View style={C.settingsCard}>
        <Text style={C.settingsTitle}>⚙️ 运动设置</Text>
        <View style={C.setRow}>
          <Text style={C.setLbl}>体重</Text>
          <View style={C.setInputWrap}>
            <TextInput style={C.setInput} value={wt} onChangeText={setWt} keyboardType="decimal-pad" />
            <Text style={C.setUnit}>kg</Text>
          </View>
        </View>
        <TouchableOpacity style={C.saveBtn} onPress={save} activeOpacity={0.85}>
          <Text style={C.saveBtnTxt}>保存设置</Text>
        </TouchableOpacity>
        {saved && <Text style={C.savedHint}>✓ 设置已保存</Text>}
      </View>

      <View style={C.infoCard}>
        <Text style={C.settingsTitle}>📐 卡路里算法</Text>
        {[
          ['🚶 走路','MET = 3.8 · GPS+步数融合'],
          ['🚴 骑行','MET = 7.5 · GPS轨迹'],
          ['🏃 跑步机','MET = (0.1v + 1.8v×坡度% + 3.5) ÷ 3.5'],
          ['🔥 公式','kcal = MET × 体重(kg) × 时间(h)'],
        ].map(([t,d])=>(
          <View key={t as string} style={C.infoRow}>
            <Text style={C.infoTitle}>{t}</Text>
            <Text style={C.infoDesc}>{d}</Text>
          </View>
        ))}
      </View>

      <View style={C.infoCard}>
        <Text style={C.settingsTitle}>🗺️ 地图说明</Text>
        <Text style={C.infoDesc}>地图来源：OpenStreetMap</Text>
        <Text style={C.infoDesc}>无需 API Key，完全免费</Text>
        <Text style={C.infoDesc}>支持轨迹显示与实时定位</Text>
      </View>
    </ScrollView>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarStyle: C.tabBar,
          tabBarActiveTintColor: '#00E5CC',
          tabBarInactiveTintColor: '#555',
          headerShown: false,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
          tabBarIcon: ({ color }) => {
            const icons: Record<string,string> = { '首页':'🏠', '记录':'🎯', '历史':'📋', '设置':'⚙️' };
            return <Text style={{ fontSize: 20, opacity: color==='#00E5CC' ? 1 : 0.5 }}>{icons[route.name]||'•'}</Text>;
          },
        })}
      >
        <Tab.Screen name="首页" component={HomeScreen} />
        <Tab.Screen name="记录" component={RecordScreen} />
        <Tab.Screen name="历史" component={HistoryScreen} />
        <Tab.Screen name="设置" component={ProfileScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const C = StyleSheet.create({
  // Base
  container: { flex:1, backgroundColor: '#0a0a12' },
  scrollContent: { paddingBottom: 32 },
  listContent: { paddingBottom: 32, paddingTop: 8 },

  // Sticky header
  stickyHeader: { backgroundColor: '#0a0a12', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  stickyTitle: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },

  // Tab bar
  tabBar: {
    backgroundColor: '#0a0a12',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 6,
    height: 60,
  },

  // Home
  homeBg: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  homeGreeting: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  homeGreetingAccent: { color: '#00E5CC', fontSize: 30, fontWeight: '800', letterSpacing: -0.5, marginTop: -2 },
  homeDate: { color: '#555', fontSize: 13, marginTop: 4 },

  // Stat grid
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, paddingTop: 16, gap: 10 },
  statCard: {
    width: '47%',
    backgroundColor: '#13131f',
    borderRadius: 18,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#00E5CC',
  },
  statEmoji: { fontSize: 22, marginBottom: 8 },
  statValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  statUnit: { fontSize: 12, color: '#555', marginTop: 2 },
  statLabel: { fontSize: 12, color: '#666', marginTop: 6 },

  // CTA card
  ctaCard: { backgroundColor: '#13131f', marginHorizontal: 16, marginTop: 16, borderRadius: 20, padding: 20 },
  ctaTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 6 },
  ctaDesc: { color: '#666', fontSize: 13, lineHeight: 20 },
  ctaModes: { flexDirection: 'row', marginTop: 16, gap: 8 },
  ctaMode: { flex:1, backgroundColor: '#0a0a12', borderRadius: 14, padding: 12, alignItems: 'center' },
  ctaModeEmoji: { fontSize: 22, marginBottom: 6 },
  ctaModeLbl: { color: '#fff', fontSize: 13, fontWeight: '600' },
  ctaModeDesc: { color: '#555', fontSize: 10, marginTop: 3 },

  // Mode selector
  modeSelector: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  modeBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    backgroundColor: '#13131f', borderRadius: 16, borderWidth: 1.5, borderColor: '#1e1e2e',
  },
  modeIcon: { fontSize: 22, marginBottom: 4 },
  modeLabel: { fontSize: 12, fontWeight: '600', color: '#555' },
  modeDot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },

  // Treadmill
  tmCard: { backgroundColor: '#13131f', marginHorizontal: 16, borderRadius: 18, padding: 16, marginBottom: 12 },
  tmRow: { flexDirection: 'row', alignItems: 'center' },
  tmField: { flex: 1, alignItems: 'center' },
  tmDivider: { width: 1, height: 44, backgroundColor: '#1e1e2e' },
  tmLbl: { color: '#666', fontSize: 12, marginBottom: 8 },
  tmInput: { backgroundColor: '#0a0a12', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 24, fontWeight: '700', color: '#fff', textAlign: 'center', width: '100%' },

  // Timer hero
  timerHero: { backgroundColor: '#13131f', marginHorizontal: 16, borderRadius: 24, padding: 28, alignItems: 'center', borderWidth: 1 },
  timerEmoji: { fontSize: 52, marginBottom: 6 },
  timerValue: { fontSize: 60, fontWeight: '800', color: '#fff', letterSpacing: -2, fontVariant: ['tabular-nums'] },
  timerLabel: { fontSize: 15, fontWeight: '600', marginTop: 4 },

  // Live data
  liveRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, width: '100%', paddingHorizontal: 8 },
  liveItem: { flex: 1, alignItems: 'center' },
  liveDivider: { width: 1, height: 32 },
  liveValue: { fontSize: 22, fontWeight: '700', color: '#fff', fontVariant: ['tabular-nums'] },
  liveLabel: { fontSize: 11, color: '#555', marginTop: 4 },

  // GPS
  gpsBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, backgroundColor: '#13131f', borderRadius: 12, padding: 12, gap: 8 },
  gpsDot: { width: 8, height: 8, borderRadius: 4 },
  gpsOn: { backgroundColor: '#00E5CC' }, gpsBad: { backgroundColor: '#FB923C' }, gpsOff: { backgroundColor: '#444' },
  gpsTxt: { fontSize: 12, color: '#666' },

  // Buttons
  bigBtn: { marginHorizontal: 16, paddingVertical: 18, borderRadius: 20, alignItems: 'center', marginBottom: 8 },
  bigBtnText: { color: '#0a0a12', fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  recSection: { alignItems: 'center', paddingTop: 8 },
  recIndicator: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
  recDot: { width: 10, height: 10, borderRadius: 5 },
  recText: { color: '#FF3B30', fontSize: 16, fontWeight: '600' },
  stopBtn: { backgroundColor: '#FF3B30', paddingVertical: 18, paddingHorizontal: 64, borderRadius: 20 },
  stopBtnText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  mapToggleBtn: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#13131f', borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1e1e2e' },
  mapToggleBtnActive: { backgroundColor: '#00E5CC22', borderColor: '#00E5CC' },
  mapToggleBtnTxt: { fontSize: 14, fontWeight: '600', color: '#888' },
  mapToggleBtnTxtActive: { color: '#00E5CC' },

  // History search
  searchBar: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  dateInput: { flex: 1, backgroundColor: '#13131f', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#fff', borderWidth: 1, borderColor: '#1e1e2e' },
  searchBtn: { backgroundColor: '#00E5CC', paddingHorizontal: 18, borderRadius: 14, justifyContent: 'center' },
  searchBtnTxt: { color: '#0a0a12', fontWeight: '700', fontSize: 14 },
  clrBtn: { backgroundColor: '#1e1e2e', paddingHorizontal: 16, borderRadius: 14, justifyContent: 'center' },
  clrBtnTxt: { color: '#888', fontWeight: '600', fontSize: 14 },

  // History list
  groupHdr: { paddingVertical: 10, paddingHorizontal: 20, fontSize: 12, fontWeight: '700', color: '#00E5CC', backgroundColor: '#0a0a12', letterSpacing: 0.5 },
  wCard: { backgroundColor: '#13131f', marginHorizontal: 14, marginVertical: 5, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#1a1a2a' },
  wTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  wLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  wIcon: { fontSize: 28 },
  wType: { fontSize: 16, fontWeight: '700', color: '#fff' },
  wTime: { fontSize: 12, color: '#555', marginTop: 2 },
  wBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  wBadgeText: { fontSize: 13, fontWeight: '700' },
  wStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  wStat: { fontSize: 13, color: '#888' },
  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyText: { color: '#444', fontSize: 18, fontWeight: '600' },
  emptySub: { color: '#333', fontSize: 14, marginTop: 8 },

  // Profile
  profileHdr: { alignItems: 'center', paddingVertical: 32, backgroundColor: '#13131f', borderBottomWidth: 1, borderBottomColor: '#1a1a2a' },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#0a0a12', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  avatarEmoji: { fontSize: 40 },
  avatarRing: { position:'absolute', width:88, height:88, borderRadius:44, borderWidth:2, borderColor:'#00E5CC', opacity:0.6 },
  profileName: { color: '#fff', fontSize: 22, fontWeight: '800' },
  profileSub: { color: '#555', fontSize: 12, marginTop: 6 },

  // Settings
  settingsCard: { backgroundColor: '#13131f', marginHorizontal: 16, marginTop: 20, borderRadius: 20, padding: 20 },
  settingsTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 16 },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  setLbl: { fontSize: 15, color: '#aaa', width: 48 },
  setInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a0a12', borderRadius: 12, borderWidth: 1, borderColor: '#1e1e2e', paddingHorizontal: 14 },
  setInput: { flex: 1, fontSize: 18, color: '#fff', paddingVertical: 12, textAlign: 'center' },
  setUnit: { color: '#555', fontSize: 15 },
  saveBtn: { backgroundColor: '#00E5CC', paddingVertical: 16, borderRadius: 20, alignItems: 'center' },
  saveBtnTxt: { color: '#0a0a12', fontSize: 17, fontWeight: '800' },
  savedHint: { textAlign: 'center', color: '#00E5CC', fontSize: 13, marginTop: 10, fontWeight: '600' },

  // Info card
  infoCard: { backgroundColor: '#13131f', marginHorizontal: 16, marginTop: 12, borderRadius: 20, padding: 20 },
  infoRow: { marginBottom: 14 },
  infoTitle: { fontSize: 14, fontWeight: '600', color: '#fff', marginBottom: 3 },
  infoDesc: { fontSize: 13, color: '#666', lineHeight: 22 },
});
