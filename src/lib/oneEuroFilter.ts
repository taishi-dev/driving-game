/**
 * One Euro Filter
 * An adaptive low-pass filter for suppressing jitter in landmark coordinates.
 *
 * Reference: https://cristal.univ-lille.fr/~casiez/1euro/
 */

/**
 * A filter that smooths strongly at low speeds and weakly at high speeds.
 */
class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  constructor(private alpha: number) {}

  filter(value: number, alpha?: number): number {
    if (alpha !== undefined) {
      this.alpha = alpha;
    }

    if (this.y === null) {
      this.s = value;
      this.y = value;
    } else {
      this.s = this.alpha * value + (1 - this.alpha) * (this.s ?? value);
      this.y = this.s;
    }

    return this.y;
  }

  lastValue(): number | null {
    return this.y;
  }
}

/**
 * Main One Euro Filter class
 */
export class OneEuroFilter {
  private xFilter: LowPassFilter;
  private dxFilter: LowPassFilter;
  private lastTime: number | null = null;

  /**
   * @param minCutoff - Minimum cutoff frequency (default: 1.0)
   * @param beta - Speed coefficient (default: 0.007); higher values reduce lag during fast motion
   * @param dCutoff - Cutoff frequency for the derivative (default: 1.0)
   */
  constructor(
    private minCutoff: number = 1.0,
    private beta: number = 0.007,
    private dCutoff: number = 1.0
  ) {
    this.xFilter = new LowPassFilter(this.alpha(this.minCutoff));
    this.dxFilter = new LowPassFilter(this.alpha(this.dCutoff));
  }

  /**
   * Compute the alpha value from a cutoff frequency.
   */
  private alpha(cutoff: number, dt: number = 1.0): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    const te = dt;
    return 1.0 / (1.0 + tau / te);
  }

  /**
   * Filter a value.
   * @param value - The value to filter
   * @param timestamp - Timestamp (in milliseconds)
   */
  filter(value: number, timestamp: number): number {
    // Compute the time delta (in seconds)
    let dt = 1.0;
    if (this.lastTime !== null && timestamp > this.lastTime) {
      dt = (timestamp - this.lastTime) / 1000.0;
    }
    this.lastTime = timestamp;

    // Estimate the speed
    const prevFiltered = this.xFilter.lastValue();
    const dx = prevFiltered !== null ? (value - prevFiltered) / dt : 0;
    const edx = this.dxFilter.filter(dx, this.alpha(this.dCutoff, dt));

    // Adjust the cutoff frequency according to the speed
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);

    // Apply filtering
    return this.xFilter.filter(value, this.alpha(cutoff, dt));
  }

  /**
   * Reset the filter.
   */
  reset(): void {
    this.xFilter = new LowPassFilter(this.alpha(this.minCutoff));
    this.dxFilter = new LowPassFilter(this.alpha(this.dCutoff));
    this.lastTime = null;
  }
}

/**
 * One Euro Filter for 3D coordinates
 */
export class OneEuroFilter3D {
  private xFilter: OneEuroFilter;
  private yFilter: OneEuroFilter;
  private zFilter: OneEuroFilter;

  constructor(minCutoff: number = 1.0, beta: number = 0.007, dCutoff: number = 1.0) {
    this.xFilter = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.yFilter = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.zFilter = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  /**
   * Filter 3D coordinates.
   */
  filter(
    point: { x: number; y: number; z: number },
    timestamp: number
  ): { x: number; y: number; z: number } {
    return {
      x: this.xFilter.filter(point.x, timestamp),
      y: this.yFilter.filter(point.y, timestamp),
      z: this.zFilter.filter(point.z, timestamp),
    };
  }

  /**
   * Reset the filter.
   */
  reset(): void {
    this.xFilter.reset();
    this.yFilter.reset();
    this.zFilter.reset();
  }
}

/**
 * Filter manager for the entire set of pose landmarks
 */
export class PoseLandmarkFilterManager {
  private filters: Map<number, OneEuroFilter3D> = new Map();

  constructor(
    private minCutoff: number = 1.0,
    private beta: number = 0.007,
    private dCutoff: number = 1.0
  ) {}

  /**
   * Filter a specific landmark.
   */
  filterLandmark(
    index: number,
    point: { x: number; y: number; z: number },
    timestamp: number
  ): { x: number; y: number; z: number } {
    if (!this.filters.has(index)) {
      this.filters.set(index, new OneEuroFilter3D(this.minCutoff, this.beta, this.dCutoff));
    }

    const filter = this.filters.get(index)!;
    return filter.filter(point, timestamp);
  }

  /**
   * Reset all filters.
   */
  reset(): void {
    this.filters.clear();
  }
}
