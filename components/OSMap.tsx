import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet } from 'react-native';
import { Yamap, Marker, Polyline } from 'react-native-yamap-plus';

let _mapRef: any = null;
let _coords: { lat: number; lon: number }[] = [];

const OSMap = forwardRef((props, ref) => {
  const mapRef = useRef<any>(null);

  _mapRef = mapRef;

  useImperativeHandle(ref, () => ({
    setCenter: (lat: number, lon: number, zoom?: number) => {
      _mapRef.current?.setCenter({ lat, lon }, zoom || 17, 0, 0, 300);
    },
    fitBounds: () => {
      if (_coords.length === 0) return;
      _mapRef.current?.fitMarkers(_coords, 300);
    },
    addPoint: (lat: number, lon: number) => {
      _coords.push({ lat, lon });
      // Force re-render by updating a state-like trigger
      _mapRef.current?.fitMarkers(_coords, 300);
    },
    updatePath: (newCoords: [number, number][]) => {
      _coords = newCoords.map(c => ({ lat: c[0], lon: c[1] }));
    },
    clearAll: () => {
      _coords = [];
    },
  }));

  const polylinePoints = _coords.length >= 2 ? _coords : [];
  const lastPoint = _coords.length > 0 ? _coords[_coords.length - 1] : null;

  return (
    <View style={styles.container}>
      <Yamap
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          lat: 55.7558,
          lon: 37.6173,
          zoom: 15,
          azimuth: 0,
          tilt: 0,
        }}
        scrollGesturesDisabled={false}
        zoomGesturesDisabled={false}
        rotateGesturesDisabled
        tiltGesturesDisabled
        mapType="satellite"
      >
        {polylinePoints.length >= 2 && (
          <Polyline
            points={polylinePoints}
            strokeColor="#00E5CC"
            strokeWidth={3}
            style={{}}
          />
        )}
        {lastPoint && (
          <Marker
            point={lastPoint}
            scale={1.5}
          />
        )}
      </Yamap>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});

export default OSMap;
