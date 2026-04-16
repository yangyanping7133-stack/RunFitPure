const fs = require('fs');
let c = fs.readFileSync('App.tsx', 'utf8');

// 1. Add HardwareStepCounter import
c = c.replace(
  "import { getAllWorkouts, getWorkoutsByDate, getStats, insertWorkout, deleteWorkout, Workout } from './database';",
  "import { getAllWorkouts, getWorkoutsByDate, getStats, insertWorkout, deleteWorkout, Workout } from './database';\nimport { HardwareStepCounterModule } from './HardwareStepCounter';"
);

// 2. Remove StepDetector class
c = c.replace(
  /class StepDetector \{[\s\S]*?\n  reset\(\) \{ this\.buf = \[\]; this\.lastTs = 0; this\.base = 9\.8; this\.cnt = 0; \}\n\}\n\n/,
  ''
);

// 3. Add lastStepTsRef and stepSubRef
c = c.replace(
  'const recentStepTimesRef = useRef<number[]>([]);',
  'const recentStepTimesRef = useRef<number[]>([]);\n  const lastStepTsRef = useRef<number>(0);\n  const stepSubRef = useRef<{remove:()=>void}| null>(null);'
);

// 4. Reset lastStepTsRef and stepSubRef on start
c = c.replace(
  'recentStepTimesRef.current = [];\n    kfRef.current.reset();',
  'recentStepTimesRef.current = [];\n    lastStepTsRef.current = 0;\n    if (stepSubRef.current) { stepSubRef.current.remove(); stepSubRef.current = null; }\n    kfRef.current.reset();'
);

// 5. Replace accelerometer walking block with hardware step counter
const oldWalkingBlock = `    if (type==='walking') {
      setUpdateIntervalForType(SensorTypes.accelerometer, 50);
      accelSubRef.current = accelerometer.subscribe({
        next: ({ x, y, z }: any) => {
          const ts = Date.now();
          const mag = Math.sqrt(x*x+y*y+z*z);
          const s = stepDetRef.current.add(mag, ts);
          if (s > 0) {
            stepsRef.current+=s;
            accDistRef.current+=0.75;
            setDist(accDistRef.current);
            setSteps(stepsRef.current);
            recentStepTimesRef.current.push(ts);
            if (recentStepTimesRef.current.length > 10) recentStepTimesRef.current.shift();
            const times = recentStepTimesRef.current;
            if (times.length >= 2) {
              const span = (times[times.length-1] - times[0]) / 1000;
              if (span > 0) setSpd((times.length-1) / span * 0.75);
            }
          }
        }, error: () => {},
      });
    }`;

const newWalkingBlock = `    if (type==='walking') {
      // Try hardware step counter first, fall back to accelerometer
      HardwareStepCounterModule.start().then(() => {
        const sub = HardwareStepCounterModule.addStepCountListener((e) => {
          stepsRef.current = e.steps;
          accDistRef.current = e.steps * 0.75;
          setDist(accDistRef.current);
          setSteps(e.steps);
          const now = Date.now();
          if (lastStepTsRef.current > 0) {
            const dt = (now - lastStepTsRef.current) / 1000;
            if (dt > 0.3 && dt < 3) setSpd(0.75 / dt);
          }
          lastStepTsRef.current = now;
        });
        stepSubRef.current = sub;
      }).catch(() => {
        // Fallback to accelerometer if hardware unavailable
        setUpdateIntervalForType(SensorTypes.accelerometer, 50);
        accelSubRef.current = accelerometer.subscribe({
          next: ({ x, y, z }: any) => {
            const ts = Date.now();
            const mag = Math.sqrt(x*x+y*y+z*z);
            const s = stepDetRef.current.add(mag, ts);
            if (s > 0) {
              stepsRef.current+=s;
              accDistRef.current+=0.75;
              setDist(accDistRef.current);
              setSteps(stepsRef.current);
              recentStepTimesRef.current.push(ts);
              if (recentStepTimesRef.current.length > 10) recentStepTimesRef.current.shift();
              const times = recentStepTimesRef.current;
              if (times.length >= 2) {
                const span = (times[times.length-1] - times[0]) / 1000;
                if (span > 0) setSpd((times.length-1) / span * 0.75);
              }
            }
          }, error: () => {},
        });
      });
    }`;

c = c.replace(oldWalkingBlock, newWalkingBlock);

// 6. Stop hardware step counter on stop()
c = c.replace(
  "if (accelSubRef.current) { accelSubRef.current.unsubscribe(); accelSubRef.current=null; }\n    setRecording(false);",
  "if (accelSubRef.current) { accelSubRef.current.unsubscribe(); accelSubRef.current=null; }\n    if (stepSubRef.current) { stepSubRef.current.remove(); stepSubRef.current = null; }\n    HardwareStepCounterModule.stop();\n    setRecording(false);"
);

fs.writeFileSync('App.tsx', c);
console.log('Done');
