import { haversineDistance } from './utils';

class GpxMetricsComputation {
  private readonly thresholdXY_m: number;  // Distance threshold for filtering on the XY axis (latitude / longitude)
  private readonly thresholdZ_m: number;  // Distance threshold for filtering on the Z axis (elevation)
  private lastPointXY: any | null = null;
  private lastFilteredPointXY: any | null = null;
  private lastFilteredZ: number | null = null;
  private lastZ: number | null = null;
  totalElevationGain = 0;
  totalElevationLoss = 0;
  totalElevationGainSmoothed = 0;
  totalElevationLossSmoothed = 0;
  totalDistance = 0;
  totalDistanceSmoothed = 0;
  cumulativeDistance: number[] = []

  constructor(thresholdXY_m: number, thresholdZ_m: number) {
    this.thresholdXY_m = thresholdXY_m;
    this.thresholdZ_m = thresholdZ_m;
  }

  private getElevation(point: any): number | null {
    return Number.isFinite(point.ele) ? point.ele : null;
  }

  addAndFilter(point: any) {
    if (!this.lastPointXY || !this.lastFilteredPointXY) {
      // Initialize raw and smoothed anchors with the first point.
      this.lastPointXY = point;
      this.lastFilteredPointXY = point;
      const elevation = this.getElevation(point);
      this.lastFilteredZ = elevation;
      this.lastZ = elevation;
      return;
    }

    const distance = haversineDistance(
      this.lastPointXY.$.lat,
      this.lastPointXY.$.lon,
      point.$.lat,
      point.$.lon
    );

    const smoothedDistance = haversineDistance(
      this.lastFilteredPointXY.$.lat,
      this.lastFilteredPointXY.$.lon,
      point.$.lat,
      point.$.lon
    );

    this.totalDistance += distance;
    this.cumulativeDistance.push(this.totalDistance)

    this.lastPointXY = point;

    const elevation = this.getElevation(point);
    if (elevation !== null && this.lastZ !== null) {
      const elevationDiff = elevation - this.lastZ;
      if (elevationDiff > 0) {
        this.totalElevationGain += elevationDiff;
      }
      if (elevationDiff < 0) {
        this.totalElevationLoss -= elevationDiff;
      }
    }
    if (elevation !== null) {
      this.lastZ = elevation;
    }

    if (smoothedDistance < this.thresholdXY_m) {
      return;
    }

    this.totalDistanceSmoothed += smoothedDistance;
    this.lastFilteredPointXY = point;

    if (elevation === null) {
      return;
    }

    if (this.lastFilteredZ === null) {
      this.lastFilteredZ = elevation;
      return;
    }

    const elevationDiffSmoothed = elevation - this.lastFilteredZ;

    if (Math.abs(elevationDiffSmoothed) < this.thresholdZ_m) {
      return;
    }

    this.lastFilteredZ = elevation;
    if (elevationDiffSmoothed > 0) {
      this.totalElevationGainSmoothed += elevationDiffSmoothed;
    } else {
      this.totalElevationLossSmoothed -= elevationDiffSmoothed;
    }
  }
}

export default GpxMetricsComputation;
