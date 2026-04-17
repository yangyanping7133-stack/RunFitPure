import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

const YANDEX_JS_KEY = '4774ab39-c691-43c8-8a1d-85d3ae9f915b';
const YANDEX_JS_URL = `https://api-maps.yandex.ru/2.1.81/?apikey=${YANDEX_JS_KEY}&lang=ru_RU`;

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
</style>
</head>
<body>
<div id="dbg">loading</div>
<div id="map"></div>
<script src="${YANDEX_JS_URL}"></script>
<script>
var dbg=document.getElementById("dbg");
window.onerror=function(m){dbg.innerHTML="err:"+m;};
function init(){
  dbg.innerHTML="ym loading";
  try{
    ymaps.ready(function(){
      dbg.innerHTML="ym ready";
      window._map=new ymaps.Map("map",{
        center:[55.7558,37.6173],
        zoom:15,
        controls:[]
      });
      window._map.behaviors.disable('scrollZoom');
      window._map.behaviors.disable('drag');
      window._map.geoObjects.removeAll();
      dbg.innerHTML="done";
    });
  }catch(e){dbg.innerHTML="e:"+e.message;}
}
if(typeof ymaps!=="undefined"){
  init();
}else{
  dbg.innerHTML="ym undefined, waiting...";
  window.ymReady=init;
}
</script>
</body>
</html>`;
};

const OSMap = forwardRef((props, ref) => {
  const webviewRef = useRef<WebView>(null);

  useImperativeHandle(ref, () => ({
    setCenter: (lat: number, lon: number, zoom?: number) => {
      webviewRef.current?.injectJavaScript(
        `if(window._map){window._map.setCenter([${lat},${lon}],${zoom||17});}true;`
      );
    },
    fitBounds: () => {
      webviewRef.current?.injectJavaScript(
        `if(window._bounds&&window._map){window._map.geoObjects.add(window._bounds);window._map.fitBounds(window._bounds.geometry.getBounds());}true;`
      );
    },
    addPoint: (lat: number, lon: number) => {
      webviewRef.current?.injectJavaScript(
        `if(window._map){
          var pt=[${lat},${lon}];
          window._map.geoObjects.removeAll();
          var m=new ymaps.Placemark(pt,{},{});
          window._map.geoObjects.add(m);
          window._map.setCenter(pt,17);
        }true;`
      );
    },
    updatePath: (newCoords: [number, number][]) => {
      if (newCoords.length === 0) {
        webviewRef.current?.injectJavaScript(`if(window._map){window._map.geoObjects.removeAll();}true;`);
        return;
      }
      const lineCoords = newCoords.map(c => `[${c[0]},${c[1]}]`).join(',');
      webviewRef.current?.injectJavaScript(
        `if(window._map){
          window._map.geoObjects.removeAll();
          var line=new ymaps.Polyline([${lineCoords}],{},{strokeColor:'#00E5CC',strokeWidth:3});
          window._map.geoObjects.add(line);
          ${newCoords.length===1 ? `window._map.setCenter([${newCoords[0][0]},${newCoords[0][1]}],17);` : `if(window._map.geoObjects.get(0)){window._map.fitBounds(window._map.geoObjects.get(0).geometry.getBounds());}`}
        }true;`
      );
    },
    clearAll: () => {
      webviewRef.current?.injectJavaScript(`if(window._map){window._map.geoObjects.removeAll();}true;`);
    },
  }));

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef as any}
        source={{ html: buildHTML() }}
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
