import React, { useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

interface LatLon { lat: number; lon: number; }

const MAP_HTML = (points: LatLon[], initialCenter: LatLon | null) => `
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
var map = L.map('map', { zoomControl: false, attributionControl: false, markerZoomAnimation: true });
var tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, opacity: 0.85 });
tileLayer.addTo(map);

var polyline = null;
var currentMarker = null;
var coords = [];

// Color palette - neon cyan on dark
var ROUTE_COLOR = '#00d4ff';
var ROUTE_WEIGHT = 5;

${points.length > 0 ? `
coords = [${points.map(p => `[${p.lat},${p.lon}]`).join(',')}];
if (coords.length > 1) {
  polyline = L.polyline(coords, {color: ROUTE_COLOR, weight: ROUTE_WEIGHT, opacity: 0.9, lineCap: 'round', lineJoin: 'round'}).addTo(map);
}
var last = coords[coords.length-1];
map.setView(last, 17);
currentMarker = L.circleMarker(last, {radius: 7, color: ROUTE_COLOR, fillColor: '#ffffff', fillOpacity: 1, weight: 2}).addTo(map);
` : `
var defCenter = [${initialCenter ? initialCenter.lat + ',' + initialCenter.lon : '39.9042,116.4074'}];
map.setView(defCenter, 15);
`}

function addPoint(lat, lon) {
  coords.push([lat, lon]);
  var pt = [lat, lon];
  if (currentMarker) {
    currentMarker.setLatLng(pt);
  } else {
    currentMarker = L.circleMarker(pt, {radius: 7, color: ROUTE_COLOR, fillColor: '#ffffff', fillOpacity: 1, weight: 2}).addTo(map);
  }
  if (coords.length === 1) {
    map.setView(pt, 17);
  } else {
    if (!polyline) {
      polyline = L.polyline(coords, {color: ROUTE_COLOR, weight: ROUTE_WEIGHT, opacity: 0.9, lineCap: 'round', lineJoin: 'round'}).addTo(map);
    } else {
      polyline.addLatLng(pt);
    }
    map.setView(pt, 17);
  }
}

function recenter(lat, lon) {
  map.setView([lat, lon], 17);
}

window.addEventListener('message', function(e) {
  try {
    var d = JSON.parse(e.data);
    if (d.type === 'addPoint') addPoint(d.lat, d.lon);
    if (d.type === 'recenter') recenter(d.lat, d.lon);
  } catch(err) {}
});

window.recenterMap = recenter;
window.addPointToMap = addPoint;
</script>
</body>
</html>`;

interface Props {
  points: LatLon[];
  currentLocation: LatLon | null;
}

export default function OSMap({ points, currentLocation }: Props) {
  const webviewRef = useRef<any>(null);
  const lastPointCountRef = useRef(0);

  // When new points come in, send to WebView
  useEffect(() => {
    if (!webviewRef.current) return;
    if (points.length > lastPointCountRef.current) {
      const newPoints = points.slice(lastPointCountRef.current);
      newPoints.forEach(p => {
        webviewRef.current.postMessage(JSON.stringify({ type: 'addPoint', lat: p.lat, lon: p.lon }));
      });
      lastPointCountRef.current = points.length;
    }
  }, [points]);

  // Recenter on current location
  useEffect(() => {
    if (!webviewRef.current || !currentLocation) return;
    webviewRef.current.postMessage(JSON.stringify({ type: 'recenter', lat: currentLocation.lat, lon: currentLocation.lon }));
  }, [currentLocation]);

  const initialCenter: LatLon | null = currentLocation || (points.length > 0 ? points[points.length - 1] : null);
  const html = MAP_HTML(points.slice(-200), initialCenter);

  return (
    <View style={styles.mapWrap}>
      <WebView
        ref={webviewRef}
        source={{ html }}
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
}

const styles = StyleSheet.create({
  mapWrap: {
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,212,255,0.2)',
  },
});
