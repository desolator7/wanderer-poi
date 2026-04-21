import { Waypoint } from "$lib/models/waypoint";

export interface GeoPoint {
    lat: number;
    lon: number;
}

export type RoutingRole = "start" | "via" | "goal";

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
