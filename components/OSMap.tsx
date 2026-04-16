import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

interface LatLon { lat: number; lon: number; }

const MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1a1a2e; }
  #map { width: 100%; height: 100vh; }
  .leaflet-container { background: #1a1a2e; }
</style>
</head>
<body>
<div id="map"></div>
<script>
var map = L.map('map', { zoomControl: false, attributionControl: false });
var tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, opacity: 0.85 });
tileLayer.addTo(map);

var polyline = null;
var currentMarker = null;
var coords = [];
var ROUTE_COLOR = '#00E5CC';
var ROUTE_WEIGHT = 5;

function clearAll() {
  if (polyline) { map.removeLayer(polyline); polyline = null; }
  if (currentMarker) { map.removeLayer(currentMarker); currentMarker = null; }
  coords = [];
}

function setCenter(lat, lon, zoom) {
  map.setView([lat, lon], zoom || 17);
}

function fitBounds() {
  if (coords.length === 0) return;
  if (coords.length === 1) { map.setView(coords[0], 16); return; }
  var bounds = L.latLngBounds(coords.map(function(c) { return [c[0], c[1]]; }));
  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
}

function addPoint(lat, lon) {
  coords.push([lat, lon]);
  var pt = [lat, lon];
  if (currentMarker) {
    currentMarker.setLatLng(pt);
  } else {
    currentMarker = L.circleMarker(pt, {radius:7, color:ROUTE_COLOR, fillColor:'#ffffff', fillOpacity:1, weight:2}).addTo(map);
  }
  if (coords.length === 1) {
    map.setView(pt, 17);
  } else {
    if (!polyline) {
      polyline = L.polyline(coords, {color:ROUTE_COLOR, weight:ROUTE_WEIGHT, opacity:0.9, lineCap:'round', lineJoin:'round'}).addTo(map);
    } else {
      polyline.addLatLng(pt);
    }
  }
}

window.addEventListener('message', function(e) {
  try {
    var d = JSON.parse(e.data);
    if (d.type === 'addPoint') addPoint(d.lat, d.lon);
    if (d.type === 'setCenter') setCenter(d.lat, d.lon, d.zoom);
    if (d.type === 'fitBounds') fitBounds();
    if (d.type === 'clearAll') clearAll();
  } catch(err) {}
});
</script>
</body>
</html>`;

export interface OSMapHandle {
  addPoint: (lat: number, lon: number) => void;
  setCenter: (lat: number, lon: number, zoom?: number) => void;
  fitBounds: () => void;
  clearAll: () => void;
}

interface Props {
  points: LatLon[];
  currentLocation: LatLon | null;
  mode: 'follow' | 'route';
}

const OSMap = forwardRef<OSMapHandle, Props>(function OSMap({ points, currentLocation, mode }, ref) {
  const webviewRef = useRef<any>(null);
  const lastCountRef = useRef(0);

  useImperativeHandle(ref, () => ({
    addPoint: (lat: number, lon: number) => {
      webviewRef.current?.postMessage(JSON.stringify({ type: 'addPoint', lat, lon }));
    },
    setCenter: (lat: number, lon: number, zoom?: number) => {
      webviewRef.current?.postMessage(JSON.stringify({ type: 'setCenter', lat, lon, zoom }));
    },
    fitBounds: () => {
      webviewRef.current?.postMessage(JSON.stringify({ type: 'fitBounds' }));
    },
    clearAll: () => {
      webviewRef.current?.postMessage(JSON.stringify({ type: 'clearAll' }));
    },
  }));

  useEffect(() => {
    if (!webviewRef.current) return;
    if (points.length > lastCountRef.current) {
      const newPoints = points.slice(lastCountRef.current);
      newPoints.forEach(p => {
        webviewRef.current.postMessage(JSON.stringify({ type: 'addPoint', lat: p.lat, lon: p.lon }));
      });
      lastCountRef.current = points.length;
    }
  }, [points]);

  useEffect(() => {
    if (!webviewRef.current || points.length === 0) return;
    if (mode === 'route') {
      webviewRef.current.postMessage(JSON.stringify({ type: 'fitBounds' }));
    } else if (mode === 'follow' && currentLocation) {
      webviewRef.current.postMessage(JSON.stringify({ type: 'setCenter', lat: currentLocation.lat, lon: currentLocation.lon, zoom: 17 }));
    }
  }, [mode, currentLocation, points.length]);

  return (
    <View style={styles.mapWrap}>
      <WebView
        ref={webviewRef}
        source={{ html: MAP_HTML }}
        scrollEnabled={false}
        zoomEnabled={true}
        style={{ flex: 1, backgroundColor: '#1a1a2e' }}
        javaScriptEnabled
        domStorageEnabled
        locationEnabled={false}
        originWhitelist={['*']}
        mixedContentMode="always"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
      />
    </View>
  );
});

export default OSMap;

const styles = StyleSheet.create({
  mapWrap: {
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,212,255,0.2)',
  },
});
