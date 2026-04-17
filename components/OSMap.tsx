import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

interface LatLon { lat: number; lon: number; }

function buildHTML(points: LatLon[], center: LatLon | null): string {
  const centerStr = center ? `${center.lat},${center.lon}` : '39.9042,116.4074';

  return '<!DOCTYPE html><html><head>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=yes">' +
    '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">' +
    '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>' +
    '<style>*{margin:0;padding:0;box-sizing:border-box;}body{background:#1a1a2e;overflow:hidden;}#map{width:100%;height:100vh;}</style>' +
    '</head><body>' +
    '<div id="map"></div>' +
    '<script>' +
    'window.onerror=function(m,u,l,c){window.parent.postMessage("ERR:"+m,"*");};' +
    'try{' +
    'var map=L.map("map",{zoomControl:true,attributionControl:false,gestureHandling:true});' +
    'L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,opacity:.85}).addTo(map);' +
    'var mk=L.circleMarker([' + centerStr + '],{radius:8,color:"#00d4ff",fillColor:"#fff",fillOpacity:1}).addTo(map);' +
    'map.setView([' + centerStr + '],14);' +
    'window.mapReady=true;' +
    'var polyline=null;' +
    'function drawPts(pts){' +
    '  if(polyline)map.removeLayer(polyline);' +
    '  if(pts.length===0)return;' +
    '  if(pts.length===1){mk.setLatLng([pts[0].lat,pts[0].lon]);map.setView([pts[0].lat,pts[0].lon],16);return;}' +
    '  polyline=L.polyline(pts.map(function(p){return[p.lat,p.lon];}),{color:"#00d4ff",weight:4,opacity:0.85}).addTo(map);' +
    '  map.fitBounds(polyline.getBounds(),{padding:[40,40]});' +
    '}' +
    'function rc(lat,lon){map.setView([lat,lon],17);mk.setLatLng([lat,lon]);}' +
    'function addPt(lat,lon){' +
    '  if(!window._pts)window._pts=[];' +
    '  window._pts.push({lat:lat,lon:lon});' +
    '  window._pts=window._pts.slice(-500);' +
    '  drawPts(window._pts);' +
    '  window.parent.postMessage("PT:"+lat+","+lon,"*");' +
    '}' +
    'window.addEventListener("message",function(e){try{var d=JSON.parse(e.data);if(d.type==="addPoint")addPt(d.lat,d.lon);if(d.type==="recenter")rc(d.lat,d.lon);if(d.type==="drawRoute"){window._pts=d.pts;drawPts(window._pts);}if(d.type==="clear"){window._pts=[];if(polyline){map.removeLayer(polyline);polyline=null;}}}catch(err){window.parent.postMessage("MSG_ERR:"+err.message,"*");}});' +
    '}catch(e){window.parent.postMessage("INIT_ERR:"+e.message,"*");}' +
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

  function onMessage(e: any) {
    console.log('[OSMap WebView]', e.nativeEvent.data);
  }

  // Send full route on points change
  useEffect(() => {
    if (!webviewRef.current) return;
    if (props.points.length > 0) {
      webviewRef.current?.postMessage(JSON.stringify({ type: 'drawRoute', pts: props.points }));
    }
  }, [props.points]);

  const center = props.currentLocation ?? (props.points.length > 0 ? props.points[props.points.length - 1] : null);
  const html = buildHTML(props.points, center ?? null);

  return (
    <View style={{ flex: 1, backgroundColor: '#1a1a2e', height: 260 }}>
      <WebView
        ref={webviewRef as any}
        source={{ html }}
        scrollEnabled={false}
        style={{ backgroundColor: '#1a1a2e' }}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        mixedContentMode="always"
        onMessage={onMessage}
        onError={(e) => console.log('[OSMap Error]', e.nativeEvent.description)}
        onLoadEnd={() => console.log('[OSMap loaded]')}
      />
    </View>
  );
});

export default OSMap;
