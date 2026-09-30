/**
 * 1€ (One-Euro) Filter implementation for real-time jitter reduction.
 * Casiez, G., Roussel, N. and Vogel, D. (2012).
 * 1 € filter: a simple speed-based low-pass filter for noisy input in interactive systems.
 */

class LowPassFilter {
  constructor(alpha = 0.5) {
    this.alpha = alpha;
    this.s = null;
  }

  filter(value, alpha = this.alpha) {
    if (this.s === null) {
      this.s = value;
    } else {
      this.s = alpha * value + (1.0 - alpha) * this.s;
    }
    return this.s;
  }

  hasLastRawValue() {
    return this.s !== null;
  }

  lastRawValue() {
    return this.s;
  }
}

export class OneEuroFilter {
  constructor(freq = 60, mincutoff = 1.0, beta = 0.007, dcutoff = 1.0) {
    this.freq = freq;
    this.mincutoff = mincutoff;
    this.beta = beta;
    this.dcutoff = dcutoff;
    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
    this.lastTime = null;
  }

  alpha(cutoff) {
    const te = 1.0 / this.freq;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  filter(val, timestamp) {
    if (this.lastTime !== null && timestamp && timestamp > this.lastTime) {
      this.freq = 1.0 / ((timestamp - this.lastTime) / 1000.0);
    }
    this.lastTime = timestamp;

    const prevX = this.xFilter.hasLastRawValue() ? this.xFilter.lastRawValue() : val;
    const dx = (val - prevX) * this.freq;
    const edx = this.dxFilter.filter(dx, this.alpha(this.dcutoff));
    const cutoff = this.mincutoff + this.beta * Math.abs(edx);
    return this.xFilter.filter(val, this.alpha(cutoff));
  }
}

/**
 * Convenience container to filter 3D points (x, y, z)
 */
export class Point3DFilter {
  constructor(freq = 60, mincutoff = 1.2, beta = 0.008) {
    this.x = new OneEuroFilter(freq, mincutoff, beta);
    this.y = new OneEuroFilter(freq, mincutoff, beta);
    this.z = new OneEuroFilter(freq, mincutoff, beta);
  }

  filter(pt, timestamp) {
    return {
      x: this.x.filter(pt.x, timestamp),
      y: this.y.filter(pt.y, timestamp),
      z: this.z.filter(pt.z, timestamp)
    };
  }
}
