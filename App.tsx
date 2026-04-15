import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, FlatList,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
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

const MET = 3.8; // 走路 MET 值

function HomeScreen() {
  const [stats, setStats] = useState({ totalDuration: 0, totalDistance: 0, totalCalories: 0, totalSteps: 0, workoutCount: 0 });
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    getStats(today).then(setStats);
  }, []);

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
  const [distance, setDistance] = useState('');
  const [steps, setSteps] = useState('');
  const [notes, setNotes] = useState('');
  const [recording, setRecording] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<string | null>(null);

  function start() {
    startRef.current = new Date().toISOString();
    setRecording(true);
    setDuration(0);
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  }

  function stop() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
    if (!startRef.current) return;
    const end = new Date().toISOString();
    const cals = Math.round(MET * 70 * (duration / 3600));
    const distM = distance ? Math.round(parseFloat(distance) * 1000) : 0;
    const stepCount = steps ? parseInt(steps, 10) : 0;
    insertWorkout({
      type: 'walking',
      duration,
      distance: distM || null,
      calories: cals,
      date: startRef.current.split('T')[0],
      startTime: startRef.current,
      endTime: end,
      steps: stepCount || null,
      notes: notes || null,
    }).then(() => Alert.alert('已保存', `时长：${formatDuration(duration)}\n距离：${distance || '0'}公里\n千卡：${cals}`))
      .catch(() => Alert.alert('保存失败'));
    setDistance(''); setSteps(''); setNotes('');
    startRef.current = null;
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.timerCard}>
        <Text style={styles.timerEmoji}>🚶</Text>
        <Text style={styles.timerValue}>{formatDuration(duration)}</Text>
        <Text style={styles.timerLabel}>走路时长</Text>
      </View>

      {!recording && (
        <>
          <TextInput style={styles.input} placeholder="走了多少公里？" keyboardType="decimal-pad"
            value={distance} onChangeText={setDistance} />
          <TextInput style={styles.input} placeholder="走了多少步？（可选）" keyboardType="number-pad"
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
                  <Text style={styles.statText}>🔥 {w.calories}千卡</Text>
                  {w.steps != null && <Text style={styles.statText}>👟 {w.steps}步</Text>}
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
  timerCard: { backgroundColor: '#fff', margin: 16, borderRadius: 16, padding: 40, alignItems: 'center', elevation: 2 },
  timerEmoji: { fontSize: 56, marginBottom: 12 },
  timerValue: { fontSize: 52, fontWeight: 'bold', color: '#4CAF50', fontVariant: ['tabular-nums'] },
  timerLabel: { fontSize: 14, color: '#999', marginTop: 4 },
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
  cardStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  statText: { fontSize: 14, color: '#4CAF50', fontWeight: '600' },
  notes: { fontSize: 12, color: '#999', marginTop: 6, fontStyle: 'italic' },
  empty: { textAlign: 'center', color: '#999', paddingVertical: 40 },
});
