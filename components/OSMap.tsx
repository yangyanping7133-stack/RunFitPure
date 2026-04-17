import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

interface LatLon { lat: number; lon: number; }

function buildHTML(points: LatLon[], center: LatLon | null): string {
  const centerStr = center ? `${center.lat},${center.lon}` : '39.9042,116.4074';
  const initCoords = points.length > 0
    ? `coords=[${points.map(p => `[${p.lat},${p.lon}]`).join(',')}];if(coords.length>1){pl=L.polyline(coords,{color:COL,weight:WGHT,opacity:.9,lineCap:'round',lineJoin:'round'}).addTo(map);}var last=coords[coords.length-1];map.setView(last,17);mk=L.circleMarker(last,{radius:7,color:COL,fillColor:'#fff',fillOpacity:1,weight:2}).addTo(map);`
    : `map.setView([${centerStr}],15);`;

  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><style>*{margin:0;padding:0;box-sizing:border-box;}body{background:#1a1a2e;overflow:hidden;}#map{width:100%;height:100vh;}.leaflet-container{background:#1a1a2e;}</style></head><body><div id="map"></div><script>var map=L.map('map',{zoomControl:false,attributionControl:false,markerZoomAnimation:true});var tile=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,opacity:.85});tile.addTo(map);var COL='#00d4ff',WGHT=5;var mk=null,pl=null,coords=[];${initCoords}function addPt(lat,lon){coords.push([lat,lon]);var pt=[lat,lon];if(mk){mk.setLatLng(pt);}else{mk=L.circleMarker(pt,{radius:7,color:COL,fillColor:'#fff',fillOpacity:1,weight:2}).addTo(map);}if(coords.length===1){map.setView(pt,17);}else{if(!pl){pl=L.polyline(coords,{color:COL,weight:WGHT,opacity:.9,lineCap:'round',lineJoin:'round'}).addTo(map);}else{pl.addLatLng(pt);}map.setView(pt,17);}}function rc(lat,lon){map.setView([lat,lon],17);}function fb(){if(coords.length===0)return;if(coords.length===1){map.setView(coords[0],16);return;}var b=L.latLngBounds(coords);map.fitBounds(b,{padding:[40,40],maxZoom:17});}function ca(){coords=[];if(pl){map.removeLayer(pl);pl=null;}if(mk){map.removeLayer(mk);mk=null;}}window.addEventListener('message',function(e){try{var d=JSON.parse(e.data);if(d.type==='addPoint')addPt(d.lat,d.lon);if(d.type==='recenter')rc(d.lat,d.lon);if(d.type==='fitBounds')fb();if(d.type==='clearAll')ca();}catch(err){}});window.addPt=addPt;window.rc=rc;window.fb=fb;window.ca=ca;</script></body></html>`;
}

interface Props {
  points: LatLon[];
  currentLocation: LatLon | null;
}

const OSMap = forwardRef((props: Props, ref: any) => {
  const webviewRef = useRef<WebView>(null);
  const lastCountRef = useRef(0);

  useImperativeHandle(ref, () => ({
    setCenter: (lat: number, lon: number) => {
      webviewRef.current?.postMessage(JSON.stringify({ type: 'recenter', lat, lon }));
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
    const newPts = props.points.slice(lastCountRef.current);
    newPts.forEach(p => {
      webviewRef.current?.postMessage(JSON.stringify({ type: 'addPoint', lat: p.lat, lon: p.lon }));
    });
    lastCountRef.current = props.points.length;
  }, [props.points]);

  useEffect(() => {
    if (!webviewRef.current || !props.currentLocation) return;
    webviewRef.current.postMessage(JSON.stringify({
      type: 'recenter',
      lat: props.currentLocation.lat,
      lon: props.currentLocation.lon,
    }));
  }, [props.currentLocation]);

  const center = props.currentLocation ?? (props.points.length > 0 ? props.points[props.points.length - 1] : null);
  const html = buildHTML(props.points.slice(-200), center ?? null);

  return (
    <View style={styles.wrap}>
      <WebView
        ref={webviewRef as any}
        source={{ html }}
        scrollEnabled={false}
        zoomEnabled
        style={styles.web}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        mixedContentMode="always"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#1a1a2e' },
  web: { flex: 1, backgroundColor: '#1a1a2e' },
});

export default OSMap;
