import type Track from './track';
import Waypoint from './waypoint';

function isFiniteElevation(elevation: unknown): elevation is number {
  return typeof elevation === "number" && Number.isFinite(elevation);
}

function elevationAtOrNearest(points: Waypoint[], index: number): number {
  const currentElevation = points[index]?.ele;
  if (isFiniteElevation(currentElevation)) {
    return currentElevation;
  }

  for (let distance = 1; distance < points.length; distance++) {
    const previousElevation = points[index - distance]?.ele;
    if (isFiniteElevation(previousElevation)) {
      return previousElevation;
    }

    const nextElevation = points[index + distance]?.ele;
    if (isFiniteElevation(nextElevation)) {
      return nextElevation;
    }
  }

  return 0;
}

export default class TrackSegment {
  trkpt?: Waypoint[];
  extensions?: string;
  constructor(object: { trkpt?: Waypoint[], extensions?: string }) {
    if (object.trkpt) {
      if (!Array.isArray(object.trkpt)) {
        object.trkpt = [object.trkpt];
      }
      this.trkpt = object.trkpt.map(trkpt => new Waypoint(trkpt))
    }
    this.extensions = object.extensions;
  }

  toGeoJSON(
    track: Track,
    segmentId: number,
    featureId: number
  ): GeoJSON.Feature {
    const points = this.trkpt || [];
    const coordinates = points.map((pt, index) => [
      pt.$.lon ?? 0,
      pt.$.lat ?? 0,
      elevationAtOrNearest(points, index),
    ]);

    const times = points.map(pt => pt.time?.toISOString() ?? null);

    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates,
      },
      properties: {
        name: track.name,
        desc: track.desc,
        type: track.type,
        number: track.number,
        featureId,
        segmentId,
        coordinateProperties: {
          times
        }
      }
    };
  }

}
