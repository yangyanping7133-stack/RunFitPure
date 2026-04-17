import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

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
var ROUTE_WEIGHT = 3;

// Default center: Moscow
map.setView([55.7558, 37.6173], 15);

window.addPoint = function(lat, lon) {
  coords.push([lat, lon]);
  if (polyline) {
    polyline.setLatLngs(coords);
  } else {
    polyline = L.polyline(coords, {color: ROUTE_COLOR, weight: ROUTE_WEIGHT, opacity: 0.9}).addTo(map);
  }
  if (currentMarker) {
    currentMarker.setLatLng([lat, lon]);
  } else {
    currentMarker = L.circleMarker([lat, lon], {radius: 7, color: ROUTE_COLOR, fillColor: '#ffffff', fillOpacity: 1, weight: 2}).addTo(map);
  }
  if (coords.length === 1) {
    map.setView([lat, lon], 17);
  }
};

window.updatePath = function(newCoords) {
  coords = newCoords;
  if (map) {
    map.removeLayer(polyline);
    map.removeLayer(currentMarker);
    polyline = null;
    currentMarker = null;
  }
  if (coords.length === 0) return;
  polyline = L.polyline(coords, {color: ROUTE_COLOR, weight: ROUTE_WEIGHT, opacity: 0.9}).addTo(map);
  var last = coords[coords.length - 1];
  currentMarker = L.circleMarker(last, {radius: 7, color: ROUTE_COLOR, fillColor: '#ffffff', fillOpacity: 1, weight: 2}).addTo(map);
  if (coords.length === 1) {
    map.setView(last, 17);
  } else {
    var bounds = L.latLngBounds(coords);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
  }
};

window.setCenter = function(lat, lon, zoom) {
  if (map) map.setView([lat, lon], zoom || 17);
};

window.fitBounds = function() {
  if (!map || coords.length === 0) return;
  if (coords.length === 1) {
    map.setView(coords[0], 16);
    return;
  }
  var bounds = L.latLngBounds(coords);
  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
};

window.clearAll = function() {
  coords = [];
  if (map) {
    if (polyline) { map.removeLayer(polyline); polyline = null; }
    if (currentMarker) { map.removeLayer(currentMarker); currentMarker = null; }
  }
};
</script>
</body>
</html>
`;

const OSMap = forwardRef((props, ref) => {
  const webviewRef = useRef<WebView>(null);

  useImperativeHandle(ref, () => ({
    setCenter: (lat: number, lon: number, zoom?: number) => {
      webviewRef.current?.injectJavaScript(`window.setCenter(${lat},${lon},${zoom||17});true;`);
    },
    fitBounds: () => {
      webviewRef.current?.injectJavaScript(`window.fitBounds();true;`);
    },
    addPoint: (lat: number, lon: number) => {
      webviewRef.current?.injectJavaScript(`window.addPoint(${lat},${lon});true;`);
    },
    updatePath: (newCoords: [number, number][]) => {
      const coordsStr = JSON.stringify(newCoords);
      webviewRef.current?.injectJavaScript(`window.updatePath(${coordsStr});true;`);
    },
    clearAll: () => {
      webviewRef.current?.injectJavaScript(`window.clearAll();true;`);
    },
  }));

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef as any}
        source={{ html: MAP_HTML }}
        scrollEnabled={false}
        zoomEnabled={true}
        style={styles.map}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        mixedContentMode="always"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        onLoadEnd={() => console.log('WebView loaded')}
        onError={() => console.log('WebView error')}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});

export default OSMap;
