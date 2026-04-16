import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Linking } from 'react-native';

const { width: W } = Dimensions.get('window');

interface Feature {
  emoji: string;
  title: string;
  desc: string;
  color: string;
}

const FEATURES: Feature[] = [
  { emoji: '🚶', title: '走路记录', desc: 'GPS + 加速度计双源融合，精准计步，实时轨迹显示', color: '#00E5CC' },
  { emoji: '🚴', title: '骑行模式', desc: '纯 GPS 轨迹追踪，随时记录骑行路线与速度', color: '#60A5FA' },
  { emoji: '🏃', title: '跑步机', desc: '速度 × 时间精准计算，支持自定义坡度参数', color: '#F472B6' },
  { emoji: '🗺️', title: '实时地图', desc: 'OpenStreetMap 免费地图，运动中实时显示轨迹', color: '#34D399' },
  { emoji: '🔥', title: '卡路里', desc: 'MET 算法，根据体重个性化计算运动消耗', color: '#FB923C' },
  { emoji: '📋', title: '运动历史', desc: '完整记录每日运动数据，随时回顾历史记录', color: '#A78BFA' },
];

const ALGORITHM_ITEMS = [
  { label: '走路', met: 'MET = 3.8', src: 'GPS + 加速度计步数融合' },
  { label: '骑行', met: 'MET = 7.5', src: 'GPS 轨迹距离' },
  { label: '跑步机', met: 'MET = (0.1v + 1.8×v×坡度% + 3.5) ÷ 3.5', src: '速度 × 时间' },
];

export default function AppIntro() {
  const [page, setPage] = useState(0);
  const totalPages = 3;

  function PageIndicator() {
    return (
      <View style={styles.pager}>
        {Array.from({ length: totalPages }).map((_, i) => (
          <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
        ))}
      </View>
    );
  }

  if (page === 0) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
          <View style={styles.heroSection}>
            <View style={styles.appIconWrap}>
              <Text style={styles.appIcon}>🏃</Text>
              <View style={styles.iconRing} />
              <View style={styles.iconRing2} />
            </View>
            <Text style={styles.appName}>RunFit</Text>
            <Text style={styles.appTagline}>你的专属运动追踪助手</Text>
            <Text style={styles.appVersion}>Pure React Native · 无 Expo</Text>
          </View>

          <View style={styles.highlightsRow}>
            {[
              { emoji: '🆓', text: '完全免费' },
              { emoji: '🔓', text: '无广告' },
              { emoji: '📂', text: '开源' },
            ].map(({ emoji, text }) => (
              <View key={text} style={styles.highlight}>
                <Text style={styles.highlightEmoji}>{emoji}</Text>
                <Text style={styles.highlightText}>{text}</Text>
              </View>
            ))}
          </View>

          <View style={styles.descCard}>
            <Text style={styles.descTitle}>关于 RunFit</Text>
            <Text style={styles.descText}>
              RunFit 是一款专为健身爱好者设计的运动追踪应用，支持走路、骑行、跑步机三种运动模式。采用 GPS + IMU 传感器融合算法，精准记录运动轨迹、距离、速度和消耗卡路里。
            </Text>
            <Text style={[styles.descText, { marginTop: 10 }]}>
              基于纯 React Native 构建，无需 Google Play 服务，兼容华为鸿蒙系统。地图数据来自 OpenStreetMap，完全免费，无需 API Key。
            </Text>
          </View>
        </ScrollView>
        <PageIndicator />
        <TouchableOpacity style={styles.nextBtn} onPress={() => setPage(1)} activeOpacity={0.85}>
          <Text style={styles.nextBtnText}>了解功能 →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (page === 1) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>🏆 核心功能</Text>
          <View style={styles.featureGrid}>
            {FEATURES.map(f => (
              <View key={f.title} style={[styles.featureCard, { borderLeftColor: f.color }]}>
                <Text style={styles.featureEmoji}>{f.emoji}</Text>
                <View style={styles.featureText}>
                  <Text style={[styles.featureTitle, { color: f.color }]}>{f.title}</Text>
                  <Text style={styles.featureDesc}>{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
        <PageIndicator />
        <TouchableOpacity style={styles.nextBtn} onPress={() => setPage(2)} activeOpacity={0.85}>
          <Text style={styles.nextBtnText}>算法说明 →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // page === 2
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>📐 算法说明</Text>

        <View style={styles.algoCard}>
          <Text style={styles.algoTitle}>卡路里计算公式</Text>
          <View style={styles.algoFormula}>
            <Text style={styles.formulaText}>kcal = MET × 体重(kg) × 时间(h)</Text>
          </View>
          <Text style={styles.algoNote}>体重可在「设置」中自定义，默认 70kg</Text>
        </View>

        <Text style={styles.subSectionTitle}>各运动模式 MET 值</Text>
        {ALGORITHM_ITEMS.map(item => (
          <View key={item.label} style={styles.algoRow}>
            <View style={styles.algoRowLeft}>
              <Text style={styles.algoLabel}>{item.label}</Text>
            </View>
            <View style={styles.algoRowRight}>
              <Text style={styles.algoMet}>{item.met}</Text>
              <Text style={styles.algoSrc}>{item.src}</Text>
            </View>
          </View>
        ))}

        <View style={styles.techCard}>
          <Text style={styles.subSectionTitle}>🛠️ 技术架构</Text>
          {[
            ['框架', 'Pure React Native 0.76.9'],
            ['系统', 'Android (arm64-v8a)'],
            ['GPS', '@react-native-community/geolocation'],
            ['步数', '加速度计峰值检测算法'],
            ['滤波', 'Kalman Filter 1D GPS平滑'],
            ['地图', 'WebView + Leaflet (OSM)'],
            ['存储', 'AsyncStorage 本地持久化'],
            ['开源', 'github.com/yangyanping7133-stack/RunFitPure'],
          ].map(([k, v]) => (
            <View key={k} style={styles.techRow}>
              <Text style={styles.techKey}>{k}</Text>
              <Text style={styles.techVal}>{v}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <PageIndicator />
      <TouchableOpacity style={styles.nextBtn} onPress={() => setPage(0)} activeOpacity={0.85}>
        <Text style={styles.nextBtnText}>重新了解 ↑</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a12' },
  page: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 100 },

  // Hero
  heroSection: { alignItems: 'center', paddingVertical: 32 },
  appIconWrap: { width: 96, height: 96, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  appIcon: { fontSize: 52 },
  iconRing: { position: 'absolute', width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: '#00E5CC', opacity: 0.4 },
  iconRing2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: '#00E5CC', opacity: 0.15 },
  appName: { fontSize: 38, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  appTagline: { fontSize: 16, color: '#00E5CC', marginTop: 6, fontWeight: '600' },
  appVersion: { fontSize: 12, color: '#444', marginTop: 8 },

  // Highlights
  highlightsRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginVertical: 24 },
  highlight: { alignItems: 'center' },
  highlightEmoji: { fontSize: 22, marginBottom: 4 },
  highlightText: { fontSize: 12, color: '#888', fontWeight: '600' },

  // Desc card
  descCard: { backgroundColor: '#13131f', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#1e1e2e' },
  descTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 12 },
  descText: { fontSize: 14, color: '#888', lineHeight: 24 },

  // Section titles
  sectionTitle: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 16 },
  subSectionTitle: { fontSize: 17, fontWeight: '700', color: '#fff', marginTop: 24, marginBottom: 12 },

  // Feature grid
  featureGrid: { gap: 10 },
  featureCard: {
    backgroundColor: '#13131f', borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14, borderLeftWidth: 3,
  },
  featureEmoji: { fontSize: 28 },
  featureText: { flex: 1 },
  featureTitle: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  featureDesc: { fontSize: 12, color: '#777', lineHeight: 18 },

  // Algorithm
  algoCard: { backgroundColor: '#13131f', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#1e1e2e', alignItems: 'center' },
  algoTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 14 },
  algoFormula: { backgroundColor: '#0a0a12', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 14 },
  formulaText: { fontSize: 16, fontWeight: '700', color: '#00E5CC', fontVariant: ['tabular-nums'] },
  algoNote: { fontSize: 12, color: '#555', marginTop: 12 },

  algoRow: { backgroundColor: '#13131f', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#1e1e2e' },
  algoRowLeft: { width: 70 },
  algoLabel: { fontSize: 14, fontWeight: '700', color: '#fff' },
  algoRowRight: { flex: 1 },
  algoMet: { fontSize: 13, fontWeight: '700', color: '#00E5CC' },
  algoSrc: { fontSize: 11, color: '#555', marginTop: 2 },

  // Tech
  techCard: { marginTop: 8 },
  techRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#13131f' },
  techKey: { fontSize: 13, color: '#666', fontWeight: '600' },
  techVal: { fontSize: 13, color: '#aaa', maxWidth: '60%', textAlign: 'right' },

  // Pager
  pager: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#333' },
  dotActive: { backgroundColor: '#00E5CC', width: 20 },

  // Next button
  nextBtn: { position: 'absolute', bottom: 32, left: 20, right: 20, backgroundColor: '#00E5CC', borderRadius: 20, paddingVertical: 16, alignItems: 'center' },
  nextBtnText: { color: '#0a0a12', fontSize: 17, fontWeight: '800' },
});
