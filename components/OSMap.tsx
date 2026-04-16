import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet } from 'react-native';
import { Yamap, Marker, Polyline } from 'react-native-yamap-plus';

interface Point { lat: number; lon: number; }

const OSMap = forwardRef((props, ref) => {
  const [coords, setCoords] = useState<Point[]>([]);
  const mapRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    setCenter: (lat: number, lon: number, zoom?: number) => {
      mapRef.current?.setCenter({ lat, lon }, zoom || 17, 0, 0, 300);
    },
    fitBounds: () => {
      if (coords.length === 0) return;
      mapRef.current?.fitMarkers(coords, 300);
    },
    addPoint: (lat: number, lon: number) => {
      const newCoords = [...coords, { lat, lon }];
      setCoords(newCoords);
      // Animate to new point
      setTimeout(() => {
        mapRef.current?.fitMarkers(newCoords, 300);
      }, 50);
    },
    updatePath: (newCoords: [number, number][]) => {
      const mapped = newCoords.map(c => ({ lat: c[0], lon: c[1] }));
      setCoords(mapped);
    },
    clearAll: () => {
      setCoords([]);
    },
  }));

  const polylinePoints = coords.length >= 2 ? coords : [];
  const lastPoint = coords.length > 0 ? coords[coords.length - 1] : null;

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
