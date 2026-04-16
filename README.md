# RunFit 🏃

> 你的专属运动追踪助手 · Pure React Native · 无 Expo

[![GitHub release](https://img.shields.io/github/v/release/yangyanping7133-stack/RunFit)](https://github.com/yangyanping7133-stack/RunFit/releases)
[![License](https://img.shields.io/github/license/yangyanping7133-stack/RunFit)](https://github.com/yangyanping7133-stack/RunFit/blob/main/LICENSE)

---

## 📱 功能特性

### 三种运动模式

| 模式 | 图标 | 数据来源 | MET 值 |
|------|------|---------|--------|
| 走路 | 🚶 | GPS + 加速度计步数融合 | 3.8 |
| 骑行 | 🚴 | GPS 轨迹追踪 | 7.5 |
| 跑步机 | 🏃 | 速度 × 时间（可设坡度） | 动态计算 |

### 核心技术

- **GPS + IMU 传感器融合**：Kalman Filter 1D 平滑 GPS 信号，精度更高
- **加速度计步数检测**：峰值检测算法，实时步数统计
- **实时地图**：OpenStreetMap 底图，WebView 渲染，无需 API Key
- **卡路里计算**：MET × 体重 × 时间，个性化参数可配置

### 卡路里算法

```
kcal = MET × 体重(kg) × 时间(h)

走路：    MET = 3.8
骑行：    MET = 7.5
跑步机：  MET = (0.1×v + 1.8×v×坡度% + 3.5) ÷ 3.5
```

---

## 🎨 界面预览

深色主题 + 霓虹薄荷绿（#00E5CC）主色调，现代简约设计。

- **首页**：今日运动数据统计
- **记录页**：实时运动数据 + 地图轨迹
- **历史页**：运动记录历史，支持按日期搜索
- **设置页**：体重配置，卡路里算法说明

---

## 🛠️ 技术架构

| 层级 | 技术选型 |
|------|---------|
| 框架 | Pure React Native 0.76.9 |
| 定位 | @react-native-community/geolocation |
| 步数 | react-native-sensors（加速度计） |
| 地图 | WebView + Leaflet（OpenStreetMap） |
| 存储 | @react-native-async-storage/async-storage |
| 导航 | @react-navigation/bottom-tabs |
| 滤波 | 自研 Kalman Filter 1D |
| 目标平台 | Android（arm64-v8a） |

### 兼容华为鸿蒙

- ✅ 纯 React Native，无 Expo 依赖
- ✅ 无需 Google Play Services
- ✅ 无需 Google Maps API Key
- ✅ 华为 Mate 60 实测可用

---

## 📦 安装

### APK 下载

Releases 页面：https://github.com/yangyanping7133-stack/RunFit/releases

### 从源码构建

```bash
# 克隆项目
git clone https://github.com/yangyanping7133-stack/RunFitPure.git
cd RunFitPure

# 安装依赖
npm install --legacy-peer-deps

# 运行开发服务器
npx react-native start

# 打包 JS bundle（Android）
npx react-native bundle --platform android --dev false \
  --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res/

# 构建 Debug APK
cd android && ./gradlew assembleDebug
```

---

## 🔧 开发笔记

### 为什么不用 Expo？

Expo 的原生模块（expo-location、expo-sensors、expo-sqlite）在华为 Mate 60（HarmonyOS）上存在 native 初始化兼容性问题，会在启动时崩溃。切换为纯 React Native 后问题解决。

### 为什么不用 Google Maps？

Google Maps SDK 需要 Google Play Services，在华为设备上不可用。采用 WebView + OpenStreetMap（Leaflet）方案，完全免费且无需 API Key。

### Kalman Filter 在本应用中的作用

GPS 信号存在噪声和抖动，使用 1D Kalman Filter 对经纬度和速度分别进行平滑，配合 accuracy 动态调整过程噪声和测量噪声权重，提升轨迹精度。

### GPS + IMU 双源融合策略

走路模式同时使用 GPS 和加速度计：
- 距离优先使用 GPS（当 accuracy ≤ 20m 且轨迹点数 ≥ 5）
- GPS 信号弱时使用加速度计步数 × 步长（0.75m）估算

---

## 📂 项目结构

```
RunFitPure/
├── App.tsx              # 主应用（含首页/记录/历史/设置）
├── AppIntro.tsx         # APP 介绍页
├── database.ts          # 运动数据持久化（AsyncStorage）
├── kalman.ts            # Kalman Filter 1D + GPSIMUFusion
├── settings.ts          # 用户设置（体重）
├── components/
│   └── OSMap.tsx        # OpenStreetMap WebView 组件
└── android/             # Android 原生项目
```

---

## 📄 开源协议

MIT License - 可自由使用、修改和分发

---

## 👤 作者

GitHub: [@yangyanping7133-stack](https://github.com/yangyanping7133-stack)
项目地址：https://github.com/yangyanping7133-stack/RunFitPure

---

## 🗺️ 开发时间线

| 日期 | 版本 | 主要内容 |
|------|------|---------|
| 2026-04-15 | v1.0.0 | Expo 版本，基础走路/骑行模式 |
| 2026-04-15 | v1.2.0 | 纯 RN 移植，GPS 轨迹 + Kalman Filter |
| 2026-04-15 | v1.3.0 | 添加走路/骑行模式选择 |
| 2026-04-16 | v1.4.0 | 跑步机模式（速度×时间） |
| 2026-04-16 | v1.5.0 | 设置页（体重配置） |
| 2026-04-16 | v1.6.0 | 跑步机坡度参数 + MET 公式 |
| 2026-04-16 | v1.7.0 | 深色 UI + OpenStreetMap 地图 |
| 2026-04-16 | v1.8.0 | UI 全面升级（玻璃拟态主题） |

> 初始版本基于 Expo 构建，因 HarmonyOS 兼容性问题切换为纯 React Native。
