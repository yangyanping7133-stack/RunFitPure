export class KalmanFilter1D {
  q: number;
  r: number;
  x: number;
  p: number;
  k: number;

  constructor(processNoise = 0.1, measurementNoise = 1.0, initialValue = 0) {
    this.q = processNoise;
    this.r = measurementNoise;
    this.x = initialValue;
    this.p = 1;
    this.k = 0;
  }

  update(measurement: number): number {
    this.p = this.p + this.q;
    this.k = this.p / (this.p + this.r);
    this.x = this.x + this.k * (measurement - this.x);
    this.p = (1 - this.k) * this.p;
    return this.x;
  }

  reset(value = 0) {
    this.x = value;
    this.p = 1;
  }
}

export class GPSIMUFusion {
  private kfLat = new KalmanFilter1D(0.0001, 0.001);
  private kfLon = new KalmanFilter1D(0.0001, 0.001);
  private kfSpeed = new KalmanFilter1D(0.5, 2.0);
  private kfAlt = new KalmanFilter1D(1.0, 5.0);

  updateGPS(lat: number, lon: number, speed: number, alt: number, accuracy: number): {
    fusedLat: number; fusedLon: number; fusedSpeed: number; fusedAlt: number; quality: string;
  } {
    if (accuracy > 20) {
      this.kfLat.r = accuracy * 0.0001;
      this.kfLon.r = accuracy * 0.0001;
      this.kfSpeed.r = accuracy * 0.5;
      this.kfAlt.r = accuracy * 2;
    } else if (accuracy > 5) {
      this.kfLat.r = accuracy * 0.00001;
      this.kfLon.r = accuracy * 0.00001;
      this.kfSpeed.r = accuracy * 0.05;
      this.kfAlt.r = accuracy * 0.2;
    } else {
      this.kfLat.r = 0.00001;
      this.kfLon.r = 0.00001;
      this.kfSpeed.r = 0.5;
      this.kfAlt.r = 2.0;
    }

    const fusedLat = this.kfLat.update(lat);
    const fusedLon = this.kfLon.update(lon);
    const fusedSpeed = this.kfSpeed.update(Math.max(speed, 0));
    const fusedAlt = this.kfAlt.update(alt);
    const quality = accuracy > 20 ? 'low' : accuracy > 5 ? 'medium' : 'high';

    return { fusedLat, fusedLon, fusedSpeed, fusedAlt, quality };
  }

  reset() {
    this.kfLat.reset();
    this.kfLon.reset();
    this.kfSpeed.reset();
    this.kfAlt.reset();
  }
}
