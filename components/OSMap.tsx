import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, requireNativeComponent } from 'react-native';
import { WebView } from 'react-native-webview';
import { LEAFLET_JS } from './leaflet-src';

interface LatLon { lat: number; lon: number; }

const TILE_URL = 'https://core-sat.maps.yandex.net/tiles?l=sat&x={x}&y={y}&z={z}';

let _webviewRef: any = null;
let _mapRef: any = null;
let _coords: [number, number][] = [];
let _polylineRef: any = null;
let _markerRef: any = null;

const buildHTML = () => {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#1a1a2e;overflow:hidden;}
#map{width:100%;height:100vh;position:relative;}
#dbg{position:fixed;top:0;left:0;right:0;background:#000;color:#0f0;padding:2px 6px;font-size:10px;z-index:99999;font-family:monospace;}
.leaflet-container{background:#1a1a2e;}
</style>
<link rel="stylesheet" href="file:///android_asset/leaflet.css">
</head>
<body>
<div id="dbg">loading</div>
<div id="map"></div>
<script>
try{
  eval(LEAFLET_JS);
  var s=document.getElementById("dbg");
  window.onerror=function(m){s.innerHTML="err:"+m;};
  s.innerHTML="init";
  var map=L.map("map",{zoomControl:false,attributionControl:false});
  s.innerHTML="map ok";
  var tileLayer=L.tileLayer("${TILE_URL}",{maxZoom:19,opacity:0.85});
  tileLayer.on("load",function(){s.innerHTML="tiles ok";});
  tileLayer.on("tileerror",function(e){s.innerHTML="tile err";});
  tileLayer.addTo(map);
  s.innerHTML="done";
  window._map=map;
  window._tileLayer=tileLayer;
}catch(e){document.getElementById("dbg").innerHTML="e:"+e.message;}
</script>
<script>
var _coords=[];
var _polyline=null;
var _marker=null;

window.addPoint=function(lat,lon){
  _coords.push([lat,lon]);
  var latlng=L.latLng(lat,lon);
  if(_polyline){
    _polyline.setLatLngs(_coords);
  }else{
    _polyline=L.polyline(_coords,{color:'#00E5CC',weight:3}).addTo(window._map);
  }
  if(_marker){
    _marker.setLatLng(latlng);
  }else{
    _marker=L.circleMarker(latlng,{radius:7,color:'#00E5CC',fillColor:'#fff',fillOpacity:1,weight:2}).addTo(window._map);
  }
  if(_coords.length===1){
    window._map.setView(latlng,17);
  }
};

window.updatePath=function(coords){
  _coords=coords;
  if(_coords.length>0){
    if(_polyline){
      _polyline.setLatLngs(_coords);
    }else{
      _polyline=L.polyline(_coords,{color:'#00E5CC',weight:3}).addTo(window._map);
    }
    if(_coords.length===1){
      window._map.setView(_coords[0],17);
    }
  }
};

window.fitBounds=function(){
  if(_coords.length===0)return;
  if(_coords.length===1){window._map.setView(_coords[0],16);return;}
  var bounds=L.latLngBounds(_coords.map(function(c){return c;}));
  window._map.fitBounds(bounds,{padding:[40,40],maxZoom:17});
};

window.setCenter=function(lat,lon,zoom){
  window._map.setView([lat,lon],zoom||17);
};

window.clearAll=function(){
  _coords=[];
  if(_polyline){window._map.removeLayer(_polyline);_polyline=null;}
  if(_marker){window._map.removeLayer(_marker);_marker=null;}
};
</script>
</body>
</html>`;
};

const OSMap = forwardRef((props, ref) => {
  const webviewRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    setCenter: (lat: number, lon: number, zoom?: number) => {
      webviewRef.current?.injectJavaScript(`window.setCenter(${lat},${lon},${zoom || 17});true;`);
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

  const injectedJS = `try{eval(LEAFLET_JS);}catch(e){document.getElementById("dbg").innerHTML="leaflet_err:"+e.message;}true;`;

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        source={{ html: buildHTML() }}
        injectedJavaScriptBeforeContentLoaded={injectedJS}
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
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});

export default OSMap;
