const fs = require('fs');
let c = fs.readFileSync('App.tsx', 'utf8');

// 1. Add mapModeRef and osMapRef after coordsRef
c = c.replace(
  'const coordsRef = useRef<{lat:number;lon:number}[]>([]);',
  'const coordsRef = useRef<{lat:number;lon:number}[]>([]);\n  const mapModeRef = useRef<"follow"|"route">("follow");\n  const osMapRef = useRef<any>(null);'
);

// 2. Add mapMode state after gpsPts state
c = c.replace(
  'const [gpsPts, setGpsPts] = useState(0);',
  'const [gpsPts, setGpsPts] = useState(0);\n  const [mapMode, setMapMode] = useState<"follow"|"route">("follow");'
);

// 3. Add toggleMapMode function - find a good place to insert it (after stop function's isListening check)
c = c.replace(
  'function stop() {',
  'function toggleMapMode() {\n    if (mapModeRef.current === "follow") {\n      mapModeRef.current = "route";\n      setMapMode("route");\n      setTimeout(() => osMapRef.current?.fitBounds(), 100);\n    } else {\n      mapModeRef.current = "follow";\n      setMapMode("follow");\n      if (coordsRef.current.length > 0) {\n        const last = coordsRef.current[coordsRef.current.length - 1];\n        setTimeout(() => osMapRef.current?.setCenter(last.lat, last.lon, 17), 100);\n      }\n    }\n  }\n\n  function stop() {'
);

// 4. Add mode="follow" to OSMap component and ref
c = c.replace(
  '<OSMap points={currentCoords} currentLocation={currentCoords[currentCoords.length-1]} />',
  '<OSMap\n          ref={osMapRef}\n          points={currentCoords}\n          currentLocation={currentCoords[currentCoords.length-1]}\n          mode={mapMode}\n        />'
);

// 5. Add mode toggle button after OSMap
c = c.replace(
  '{/* Map */}\n      {type!==\'treadmill\' && recording && currentCoords.length>0 && (',
  '{/* Map */}\n      {type!==\'treadmill\' && recording && currentCoords.length>0 && ('
);

// Actually let me find the exact OSMap JSX block and add a toggle button after it
// Find the OSMap line and add a button below it
c = c.replace(
  '<OSMap\n          ref={osMapRef}\n          points={currentCoords}\n          currentLocation={currentCoords[currentCoords.length-1]}\n          mode={mapMode}\n        />',
  `<OSMap
          ref={osMapRef}
          points={currentCoords}
          currentLocation={currentCoords[currentCoords.length-1]}
          mode={mapMode}
        />`
);

// Now find where to insert the map toggle button - after OSMap closing
const osMapCloseMarker = `        />
      )}

      {/* GPS indicator */}`;
c = c.replace(
  osMapCloseMarker,
  `        />
      )}

      {/* Map mode toggle */}
      {type!=='treadmill' && recording && currentCoords.length > 0 && (
        <TouchableOpacity
          style={[C.mapToggleBtn, mapMode==='route' && C.mapToggleBtnActive]}
          onPress={toggleMapMode}
          activeOpacity={0.8}
        >
          <Text style={[C.mapToggleBtnTxt, mapMode==='route' && C.mapToggleBtnTxtActive]}>
            {mapMode==='follow' ? '🗺️ 查看全路线' : '📍 回到定位'}
          </Text>
        </TouchableOpacity>
      )}

      {/* GPS indicator */}`
);

// 6. Add reset of mapMode on start
c = c.replace(
  'coordsRef.current = [];\n    lastStepTsRef.current = 0;',
  'coordsRef.current = [];\n    mapModeRef.current = "follow";\n    setMapMode("follow");\n    lastStepTsRef.current = 0;'
);

// 7. Add reset on stop
c = c.replace(
  'coordsRef.current = [];\n    recentStepTimesRef.current = [];',
  'coordsRef.current = [];\n    mapModeRef.current = "follow";\n    setMapMode("follow");\n    recentStepTimesRef.current = [];'
);

// 8. Add styles for map toggle button
c = c.replace(
  "nextBtn: { position: 'absolute', bottom: 32, left: 20, right: 20, backgroundColor: '#00E5CC', borderRadius: 20, paddingVertical: 16, alignItems: 'center' },",
  `nextBtn: { position: 'absolute', bottom: 32, left: 20, right: 20, backgroundColor: '#00E5CC', borderRadius: 20, paddingVertical: 16, alignItems: 'center' },

  // Map toggle
  mapToggleBtn: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#13131f', borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1e1e2e' },
  mapToggleBtnActive: { backgroundColor: '#00E5CC22', borderColor: '#00E5CC' },
  mapToggleBtnTxt: { fontSize: 14, fontWeight: '600', color: '#888' },
  mapToggleBtnTxtActive: { color: '#00E5CC' },`
);

fs.writeFileSync('App.tsx', c);
console.log('Done');
