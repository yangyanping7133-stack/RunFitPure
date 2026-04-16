import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Yamap, Marker, Polyline } from 'react-native-yamap-plus';

interface Point { lat: number; lon: number; }

const OSMap = forwardRef((props, ref) => {
  const [coords, setCoords] = useState<Point[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    setCenter: (lat: number, lon: number, zoom?: number) => {
      try {
        mapRef.current?.setCenter({ lat, lon }, zoom || 17, 0, 0, 300);
      } catch (e: any) {
        setError('setCenter: ' + e.message);
      }
    },
    fitBounds: () => {
      try {
        if (coords.length === 0) return;
        mapRef.current?.fitMarkers(coords, 300);
      } catch (e: any) {
        setError('fitBounds: ' + e.message);
      }
    },
    addPoint: (lat: number, lon: number) => {
      try {
        const newCoords = [...coords, { lat, lon }];
        setCoords(newCoords);
        setTimeout(() => {
          try {
            mapRef.current?.fitMarkers(newCoords, 300);
          } catch (e: any) {
            setError('addPoint.fit: ' + e.message);
          }
        }, 50);
      } catch (e: any) {
        setError('addPoint: ' + e.message);
      }
    },
    updatePath: (newCoords: [number, number][]) => {
      try {
        const mapped = newCoords.map(c => ({ lat: c[0], lon: c[1] }));
        setCoords(mapped);
      } catch (e: any) {
        setError('updatePath: ' + e.message);
      }
    },
    clearAll: () => {
      try {
        setCoords([]);
      } catch (e: any) {
        setError('clearAll: ' + e.message);
      }
    },
  }));

  const polylinePoints = coords.length >= 2 ? coords : [];
  const lastPoint = coords.length > 0 ? coords[coords.length - 1] : null;

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>Map Error: {error}</Text>
        </View>
      </View>
    );
  }

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
        mapType="vector"
        onMapReady={() => {
          console.log('=== Yandex Map READY ===');
          setError(null);
        }}
        onCameraMoveEnd={() => {
          console.log('=== Camera move end ===');
        }}
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
  errorBox: { flex: 1, backgroundColor: '#ffcccc', padding: 10, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#cc0000', fontSize: 12 },
});

export default OSMap;
