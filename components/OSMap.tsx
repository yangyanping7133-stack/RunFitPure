import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

interface LatLon { lat: number; lon: number; }

function buildHTML(points: LatLon[], center: LatLon | null): string {
  const centerStr = center ? `${center.lat},${center.lon}` : '39.9042,116.4074';

  return '<!DOCTYPE html><html><head>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">' +
    '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">' +
    '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>' +
    '<style>*{margin:0;padding:0;box-sizing:border-box;}body{background:#1a1a2e;overflow:hidden;}#map{width:100%;height:100vh;}</style>' +
    '</head><body>' +
    '<div id="map"></div>' +
    '<script>' +
    'window.onerror=function(m,u,l,c){window.parent.postMessage("ERR:"+m,"*");};' +
    'try{' +
    'var map=L.map("map",{zoomControl:false,attributionControl:false});' +
    'L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,opacity:.85}).addTo(map);' +
    'var mk=L.circleMarker([' + centerStr + '],{radius:8,color:"#00d4ff",fillColor:"#fff",fillOpacity:1}).addTo(map);' +
    'map.setView([' + centerStr + '],14);' +
    'window.mapReady=true;' +
    'function addPt(lat,lon){window.parent.postMessage("PT:"+lat+","+lon,"*");}' +
    'function rc(lat,lon){map.setView([lat,lon],17);mk.setLatLng([lat,lon]);}' +
    '}catch(e){window.parent.postMessage("INIT_ERR:"+e.message,"*");}' +
    'window.addEventListener("message",function(e){try{var d=JSON.parse(e.data);if(d.type==="addPoint")addPt(d.lat,d.lon);if(d.type==="recenter")rc(d.lat,d.lon);}catch(err){window.parent.postMessage("MSG_ERR:"+err.message,"*");}});' +
    '</script></body></html>';
}

interface Props {
  points: LatLon[];
  currentLocation: LatLon | null;
}

const OSMap = forwardRef((props: Props, ref: any) => {
  const webviewRef = useRef<WebView>(null);

  useImperativeHandle(ref, () => ({
    setCenter: (lat: number, lon: number) => {
      webviewRef.current?.postMessage(JSON.stringify({ type: 'recenter', lat, lon }));
    },
  }));

  //接收WebView里的日志
  function onMessage(e: any) {
    console.log('[OSMap WebView]', e.nativeEvent.data);
  }

  useEffect(() => {
    if (!webviewRef.current) return;
    const newPts = props.points;
    newPts.forEach(p => {
      webviewRef.current?.postMessage(JSON.stringify({ type: 'addPoint', lat: p.lat, lon: p.lon }));
    });
  }, [props.points]);

  const center = props.currentLocation ?? (props.points.length > 0 ? props.points[props.points.length - 1] : null);
  const html = buildHTML(props.points.slice(-200), center ?? null);

  return (
    <View style={{ flex: 1, backgroundColor: '#1a1a2e', height: 240 }}>
      <WebView
        ref={webviewRef as any}
        source={{ html }}
        scrollEnabled={false}
        zoomEnabled
        style={{ backgroundColor: '#1a1a2e' }}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        mixedContentMode="always"
        onMessage={onMessage}
        onError={(e) => console.log('[OSMap Error]', e.nativeEvent.description)}
        onLoadEnd={() => console.log('[OSMap loaded]')}
        onLoadStart={() => console.log('[OSMap loading...]')}
      />
    </View>
  );
});

export default OSMap;
