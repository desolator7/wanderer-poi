import { haversineDistance } from "$lib/models/gpx/utils";

export const LIVE_POSITION_MAX_AGE_MS = 30_000;
const BASE_TOLERANCE_METERS = 50;
const MAX_ACCURACY_METERS = 100;

interface RoutePoint {
    $: { lat?: number; lon?: number };
    ele?: number;
    time?: Date;
}

interface RouteSource {
    trk?: Array<{ trkseg?: Array<{ trkpt?: RoutePoint[] }> }>;
    rte?: Array<{ rtept?: RoutePoint[] }>;
}

interface RouteEdge {
    from: RoutePoint;
    to: RoutePoint;
    startMeters: number;
    lengthMeters: number;
    startSeconds: number;
    seconds: number;
}

export interface LiveProfilePoint {
    distanceMeters: number;
    elevationMeters: number | null;
}

export interface LiveRouteModel {
    edges: RouteEdge[];
    profileSegments: LiveProfilePoint[][];
    totalMeters: number;
    durationSeconds: number | null;
    timedSeconds: number | null;
}

export interface LiveRouteProgress {
    completedMeters: number;
    remainingMeters: number;
    remainingSeconds: number | null;
    elevationMeters: number | null;
}

export type LivePositionStatus =
    | "waiting"
    | "on-route"
    | "off-route"
    | "inaccurate"
    | "stale"
    | "unavailable"
    | "denied"
    | "invalid-route";

export interface LiveProgressState {
    status: LivePositionStatus;
    progress: LiveRouteProgress | null;
}

export type LivePosition = Pick<GeolocationPosition, "timestamp"> & {
    coords: Pick<GeolocationCoordinates, "latitude" | "longitude" | "accuracy">;
};

function validCoordinate(point: RoutePoint): boolean {
    const { lat, lon } = point.$;
    return Number.isFinite(lat) && Number.isFinite(lon) &&
        Math.abs(lat!) <= 90 && Math.abs(lon!) <= 180;
}

function elevation(point: RoutePoint): number | null {
    return Number.isFinite(point.ele) ? point.ele! : null;
}

/** Keep segment boundaries, missing heights and timing separate from GPX totals. */
export function buildLiveRouteModel(
    gpx: RouteSource,
    plannedDurationSeconds?: number,
): LiveRouteModel {
    const segments = gpx.trk?.flatMap((track) =>
        (track.trkseg ?? []).map((segment) => segment.trkpt ?? []),
    ) ?? [];
    if (!segments.some((segment) => segment.length > 0)) {
        segments.push(...(gpx.rte ?? []).map((route) => route.rtept ?? []));
    }

    const edges: RouteEdge[] = [];
    const profileSegments: LiveProfilePoint[][] = [];
    let totalMeters = 0;
    let totalSeconds = 0;
    let timingComplete = true;

    for (const points of segments) {
        let previous: RoutePoint | undefined;
        let profile: LiveProfilePoint[] = [];
        for (const point of points) {
            if (!validCoordinate(point)) {
                previous = undefined;
                if (profile.length) profileSegments.push(profile);
                profile = [];
                timingComplete = false;
                continue;
            }
            if (previous) {
                const lengthMeters = haversineDistance(
                    previous.$.lat!, previous.$.lon!, point.$.lat!, point.$.lon!,
                );
                const seconds = ((point.time?.getTime() ?? NaN) -
                    (previous.time?.getTime() ?? NaN)) / 1000;
                // GPX timestamps can be rounded to seconds, so consecutive moving
                // points may share a timestamp. Only a decreasing time is invalid.
                const validTime = Number.isFinite(seconds) && seconds >= 0;
                timingComplete &&= validTime;
                if (lengthMeters > 0) {
                    edges.push({
                        from: previous,
                        to: point,
                        startMeters: totalMeters,
                        lengthMeters,
                        startSeconds: totalSeconds,
                        seconds: validTime ? seconds : 0,
                    });
                }
                totalMeters += lengthMeters;
                if (validTime) totalSeconds += seconds;
            }
            profile.push({ distanceMeters: totalMeters, elevationMeters: elevation(point) });
            previous = point;
        }
        if (profile.length) profileSegments.push(profile);
    }

    const timedSeconds = timingComplete && totalSeconds > 0 ? totalSeconds : null;
    return {
        edges,
        profileSegments,
        totalMeters,
        timedSeconds,
        durationSeconds: Number.isFinite(plannedDurationSeconds) && plannedDurationSeconds! > 0
            ? plannedDurationSeconds!
            : timedSeconds,
    };
}

function longitudeDelta(degrees: number): number {
    return ((degrees + 540) % 360 + 360) % 360 - 180;
}

function project(position: LivePosition, edge: RouteEdge) {
    // A local metric plane avoids snapping to sparse vertices, also at the dateline.
    const metersPerDegree = 6_371_000 * Math.PI / 180;
    const longitudeScale = metersPerDegree * Math.cos(position.coords.latitude * Math.PI / 180);
    const ax = longitudeDelta(edge.from.$.lon! - position.coords.longitude) * longitudeScale;
    const ay = (edge.from.$.lat! - position.coords.latitude) * metersPerDegree;
    const dx = longitudeDelta(edge.to.$.lon! - edge.from.$.lon!) * longitudeScale;
    const dy = (edge.to.$.lat! - edge.from.$.lat!) * metersPerDegree;
    const squaredLength = dx * dx + dy * dy;
    const projectedFraction = squaredLength > 0
        ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / squaredLength))
        : 0;
    const fraction = projectedFraction < 1e-9 ? 0 : projectedFraction > 1 - 1e-9 ? 1 : projectedFraction;
    return {
        edge,
        fraction,
        offsetMeters: Math.hypot(ax + fraction * dx, ay + fraction * dy),
        completedMeters: edge.startMeters + fraction * edge.lengthMeters,
    };
}

export function updateLiveProgress(
    route: LiveRouteModel,
    position: LivePosition,
    previous: LiveRouteProgress | null = null,
    now = Date.now(),
): LiveProgressState {
    const unchanged = (status: LivePositionStatus): LiveProgressState => ({ status, progress: previous });
    if (!route.edges.length) return unchanged("invalid-route");
    if (!Number.isFinite(position.timestamp) || now - position.timestamp > LIVE_POSITION_MAX_AGE_MS) {
        return unchanged("stale");
    }
    const { latitude, longitude, accuracy } = position.coords;
    if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > MAX_ACCURACY_METERS ||
        !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
        !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
        return unchanged("inaccurate");
    }

    const tolerance = Math.max(BASE_TOLERANCE_METERS, accuracy);
    const projections = route.edges.map((edge) => project(position, edge));
    const nearestOffset = projections.reduce((nearest, candidate) => Math.min(nearest, candidate.offsetMeters), Infinity);
    if (nearestOffset > tolerance) return unchanged("off-route");

    const candidates = projections.filter((candidate) =>
        candidate.offsetMeters <= tolerance && candidate.offsetMeters <= nearestOffset + 10,
    ).sort((a, b) => a.offsetMeters - b.offsetMeters);
    // Adjacent edges represent the same location. Keep their closest projection so
    // continuity cannot hold the marker just before a vertex or before the finish.
    const distinct: typeof candidates = [];
    for (const candidate of candidates) {
        if (!distinct.some((other) => Math.abs(other.completedMeters - candidate.completedMeters) < BASE_TOLERANCE_METERS)) {
            distinct.push(candidate);
        }
    }
    const reference = previous?.completedMeters ?? 0;
    distinct.sort((a, b) => Math.abs(a.completedMeters - reference) - Math.abs(b.completedMeters - reference));
    const match = distinct[0];
    const completedMeters = Math.max(0, Math.min(route.totalMeters, match.completedMeters));
    const remainingMeters = route.totalMeters - completedMeters;
    const remainingFraction = route.timedSeconds !== null
        ? 1 - (match.edge.startSeconds + match.fraction * match.edge.seconds) / route.timedSeconds
        : remainingMeters / route.totalMeters;
    const fromElevation = elevation(match.edge.from);
    const toElevation = elevation(match.edge.to);
    const elevationMeters = match.fraction === 0 ? fromElevation
        : match.fraction === 1 ? toElevation
        : fromElevation !== null && toElevation !== null
            ? fromElevation + (toElevation - fromElevation) * match.fraction
            : null;

    return {
        status: "on-route",
        progress: {
            completedMeters,
            remainingMeters,
            remainingSeconds: route.durationSeconds === null ? null
                : remainingMeters === 0 ? 0
                    : Math.max(0, Math.min(1, remainingFraction)) * route.durationSeconds,
            elevationMeters,
        },
    };
}

export function buildLiveElevationPlot(route: LiveRouteModel) {
    let minimum = Infinity;
    let maximum = -Infinity;
    for (const segment of route.profileSegments) {
        for (const point of segment) {
            if (point.elevationMeters !== null) {
                minimum = Math.min(minimum, point.elevationMeters);
                maximum = Math.max(maximum, point.elevationMeters);
            }
        }
    }
    if (!Number.isFinite(minimum) || route.totalMeters <= 0) return null;
    const range = Math.max(10, maximum - minimum);
    const center = (minimum + maximum) / 2;
    const x = (distance: number) => 4 + distance / route.totalMeters * 292;
    const y = (height: number) => 32 - (height - center) / range * 52;
    const paths: string[] = [];
    for (const segment of route.profileSegments) {
        let path = "";
        for (const point of segment) {
            if (point.elevationMeters === null) {
                if (path) paths.push(path);
                path = "";
                continue;
            }
            path += `${path ? " L" : "M"}${x(point.distanceMeters).toFixed(2)},${y(point.elevationMeters).toFixed(2)}`;
        }
        if (path) paths.push(path);
    }
    return { minimum, maximum, paths, x, y };
}

const kilometers = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatLiveKilometers(meters: number): string {
    return `${kilometers.format(meters / 1000)} km`;
}

export function formatLiveRemainingTime(seconds: number): string {
    const minutes = Math.ceil(Math.round(seconds) / 60);
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}
