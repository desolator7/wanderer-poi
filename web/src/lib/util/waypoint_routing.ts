import { Waypoint } from "$lib/models/waypoint";

export interface GeoPoint {
    lat: number;
    lon: number;
}

export type RoutingRole = "start" | "via" | "goal";
export interface SimplifyPolylineOptions {
    toleranceMeters?: number;
    maxPoints?: number;
}

function toMeters(point: GeoPoint, originLat: number): { x: number; y: number } {
    const metersPerDegreeLat = 111_320;
    const metersPerDegreeLon = metersPerDegreeLat * Math.cos((originLat * Math.PI) / 180);
    return {
        x: point.lon * metersPerDegreeLon,
        y: point.lat * metersPerDegreeLat,
    };
}

function squaredDistanceToSegment(point: GeoPoint, from: GeoPoint, to: GeoPoint): number {
    const originLat = (point.lat + from.lat + to.lat) / 3;
    const p = toMeters(point, originLat);
    const a = toMeters(from, originLat);
    const b = toMeters(to, originLat);

    const abX = b.x - a.x;
    const abY = b.y - a.y;
    const abLengthSquared = abX * abX + abY * abY;

    if (abLengthSquared === 0) {
        const dx = p.x - a.x;
        const dy = p.y - a.y;
        return dx * dx + dy * dy;
    }

    const apX = p.x - a.x;
    const apY = p.y - a.y;
    const t = Math.max(0, Math.min(1, (apX * abX + apY * abY) / abLengthSquared));

    const projectionX = a.x + t * abX;
    const projectionY = a.y + t * abY;
    const dx = p.x - projectionX;
    const dy = p.y - projectionY;
    return dx * dx + dy * dy;
}

export function getWaypointInsertIndexByNearestSegment(
    existingWaypoints: GeoPoint[],
    candidate: GeoPoint,
): number {
    if (existingWaypoints.length === 0) {
        return 0;
    }
    if (existingWaypoints.length === 1) {
        return 1;
    }

    let bestSegmentStartIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < existingWaypoints.length - 1; i++) {
        const currentDistance = squaredDistanceToSegment(
            candidate,
            existingWaypoints[i],
            existingWaypoints[i + 1],
        );

        if (currentDistance < bestDistance) {
            bestDistance = currentDistance;
            bestSegmentStartIndex = i;
        }
    }

    return bestSegmentStartIndex + 1;
}

export function getRoutingRoleByIndex(index: number, totalWaypoints: number): RoutingRole {
    if (index <= 0) {
        return "start";
    }

    if (index >= totalWaypoints - 1) {
        return "goal";
    }

    return "via";
}

export function createWaypointFromTap(
    lat: number,
    lon: number,
    optionalData?: Pick<Waypoint, "name" | "description" | "icon">,
): Waypoint {
    return new Waypoint(lat, lon, {
        name: optionalData?.name ?? "",
        description: optionalData?.description ?? "",
        icon: optionalData?.icon,
    });
}

function squaredDistanceMeters(a: GeoPoint, b: GeoPoint): number {
    const originLat = (a.lat + b.lat) / 2;
    const aMeters = toMeters(a, originLat);
    const bMeters = toMeters(b, originLat);
    const dx = aMeters.x - bMeters.x;
    const dy = aMeters.y - bMeters.y;
    return dx * dx + dy * dy;
}

function simplifyWithRdp(points: GeoPoint[], toleranceMeters: number): GeoPoint[] {
    if (points.length <= 2) {
        return [...points];
    }

    const toleranceSquared = toleranceMeters * toleranceMeters;
    const keep = new Array(points.length).fill(false);
    keep[0] = true;
    keep[points.length - 1] = true;

    const stack: Array<{ start: number; end: number }> = [
        { start: 0, end: points.length - 1 },
    ];

    while (stack.length > 0) {
        const segment = stack.pop();
        if (!segment) {
            continue;
        }
        const { start, end } = segment;
        let bestIndex = -1;
        let maxDistanceSquared = 0;

        for (let i = start + 1; i < end; i++) {
            const distanceSquared = squaredDistanceToSegment(
                points[i],
                points[start],
                points[end],
            );
            if (distanceSquared > maxDistanceSquared) {
                maxDistanceSquared = distanceSquared;
                bestIndex = i;
            }
        }

        if (bestIndex !== -1 && maxDistanceSquared > toleranceSquared) {
            keep[bestIndex] = true;
            stack.push({ start, end: bestIndex });
            stack.push({ start: bestIndex, end });
        }
    }

    return points.filter((_, index) => keep[index]);
}

export function simplifyPolylinePoints(
    points: GeoPoint[],
    options?: SimplifyPolylineOptions,
): GeoPoint[] {
    if (points.length <= 2) {
        return [...points];
    }

    const maxPoints = Math.max(2, options?.maxPoints ?? 120);
    let toleranceMeters = Math.max(0.5, options?.toleranceMeters ?? 6);
    let simplified = simplifyWithRdp(points, toleranceMeters);

    while (simplified.length > maxPoints && toleranceMeters < 250) {
        toleranceMeters *= 1.6;
        simplified = simplifyWithRdp(points, toleranceMeters);
    }

    if (simplified.length <= maxPoints) {
        return simplified;
    }

    const sampled: GeoPoint[] = [];
    const step = (simplified.length - 1) / (maxPoints - 1);
    for (let i = 0; i < maxPoints; i++) {
        sampled.push(simplified[Math.round(i * step)]);
    }

    const deduplicated: GeoPoint[] = [];
    for (const point of sampled) {
        const prev = deduplicated.at(-1);
        if (!prev || squaredDistanceMeters(prev, point) > 0) {
            deduplicated.push(point);
        }
    }

    if (deduplicated.length === 1) {
        deduplicated.push(points[points.length - 1]);
    }

    return deduplicated;
}
