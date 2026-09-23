import { describe, expect, it } from "vitest";
import {
    buildLiveElevationPlot,
    buildLiveRouteModel,
    formatLiveKilometers,
    formatLiveRemainingTime,
    updateLiveProgress,
    type LivePosition,
} from "./pwa_live_progress";

const metersPerDegree = 6_371_000 * Math.PI / 180;
const now = 1_000_000;
const point = (x: number, y = 0, ele?: number, seconds?: number) => ({
    $: { lat: y / metersPerDegree, lon: x / metersPerDegree },
    ele,
    time: seconds === undefined ? undefined : new Date(seconds * 1000),
});
const source = (...segments: ReturnType<typeof point>[][]) => ({
    trk: [{ trkseg: segments.map((trkpt) => ({ trkpt })) }],
});
const fix = (x: number, y = 0, accuracy = 5, timestamp = now): LivePosition => ({
    coords: { latitude: y / metersPerDegree, longitude: x / metersPerDegree, accuracy },
    timestamp,
});
const simple = () => buildLiveRouteModel(source([point(0), point(1000)]), 3600);

describe("live route progress", () => {
    it.each([0, 350, 1000])("projects a position at %i meters between sparse vertices", (distance) => {
        const route = simple();
        const result = updateLiveProgress(route, fix(distance), null, now);
        expect(result.status).toBe("on-route");
        expect(result.progress!.completedMeters).toBeCloseTo(distance, 4);
        expect(result.progress!.remainingMeters).toBeCloseTo(1000 - distance, 4);
        expect(result.progress!.remainingSeconds).toBeCloseTo(3600 * (1 - distance / 1000), 3);
    });

    it("allows walking back and reaches the finish without sticking to nearby vertices", () => {
        const route = buildLiveRouteModel(source([point(0), point(500), point(990), point(1000)]));
        const previous = updateLiveProgress(route, fix(700), null, now).progress;
        expect(updateLiveProgress(route, fix(300), previous, now).progress!.completedMeters).toBeCloseTo(300, 4);
        const nearFinish = updateLiveProgress(route, fix(995), previous, now).progress;
        expect(updateLiveProgress(route, fix(1000), nearFinish, now).progress!.remainingMeters).toBeCloseTo(0, 4);
    });

    it("does not count or match a gap between separate GPX segments", () => {
        const route = buildLiveRouteModel(source([point(0), point(100)], [point(1000), point(1200)]));
        expect(route.totalMeters).toBeCloseTo(300, 4);
        expect(updateLiveProgress(route, fix(600), null, now).status).toBe("off-route");
        expect(updateLiveProgress(route, fix(1100), null, now).progress!.completedMeters).toBeCloseTo(200, 4);
        expect(route.profileSegments).toHaveLength(2);
    });

    it("ignores duplicate points and does not bridge invalid coordinates", () => {
        const route = buildLiveRouteModel(source([point(0), point(0), point(100), point(NaN), point(900), point(1000)]));
        expect(route.totalMeters).toBeCloseTo(200, 4);
        expect(route.edges).toHaveLength(2);
        expect(updateLiveProgress(route, fix(500), null, now).status).toBe("off-route");
    });

    it.each([
        [49, 5, "on-route"], [51, 5, "off-route"],
        [79, 80, "on-route"], [81, 80, "off-route"],
        [99, 100, "on-route"], [101, 100, "off-route"],
        [0, 101, "inaccurate"], [0, NaN, "inaccurate"], [0, -1, "inaccurate"],
    ])("handles offset %i m with accuracy %i m", (offset, accuracy, status) => {
        expect(updateLiveProgress(simple(), fix(500, offset, accuracy), null, now).status).toBe(status);
    });

    it("keeps the last valid progress during deviations or stale fixes and resumes on return", () => {
        const route = simple();
        const previous = updateLiveProgress(route, fix(200), null, now).progress;
        for (const position of [fix(500, 200), fix(500, 0, 500), fix(500, 0, 5, now - 30_001)]) {
            expect(updateLiveProgress(route, position, previous, now).progress).toBe(previous);
        }
        expect(updateLiveProgress(route, fix(600), previous, now).progress!.completedMeters).toBeCloseTo(600, 4);
        expect(updateLiveProgress(route, fix(0, 0, 5, now - 30_001), null, now).status).toBe("stale");
    });

    it("uses the first passage initially and continuity on out-and-back routes", () => {
        const route = buildLiveRouteModel(source([point(0), point(1000), point(0)]));
        expect(updateLiveProgress(route, fix(0), null, now).progress!.completedMeters).toBe(0);
        const outbound = updateLiveProgress(route, fix(250), null, now).progress!;
        expect(outbound.completedMeters).toBeCloseTo(250, 4);
        const inbound = { ...outbound, completedMeters: 1700 };
        expect(updateLiveProgress(route, fix(250), inbound, now).progress!.completedMeters).toBeCloseTo(1750, 4);
        expect(updateLiveProgress(route, fix(0), { ...inbound, completedMeters: 1990 }, now).progress!.remainingMeters).toBeCloseTo(0, 4);
    });

    it("retains the current passage through a crossing despite GPS jitter", () => {
        const route = buildLiveRouteModel(source([point(-100, -100), point(100, 100), point(-100, 100), point(100, -100)]));
        const first = updateLiveProgress(route, fix(0), null, now).progress!;
        expect(first.completedMeters).toBeLessThan(route.totalMeters / 2);
        const later = { ...first, completedMeters: route.edges[2].startMeters + 140 };
        expect(updateLiveProgress(route, fix(0, 2), later, now).progress!.completedMeters).toBeGreaterThan(route.totalMeters / 2);
    });

    it("reports an empty or single-point route instead of NaN", () => {
        for (const gpx of [source([]), source([point(0)])]) {
            expect(updateLiveProgress(buildLiveRouteModel(gpx), fix(0), null, now)).toEqual({ status: "invalid-route", progress: null });
        }
    });

    it("supports GPX route points when no track is present", () => {
        const route = buildLiveRouteModel({ rte: [{ rtept: [point(0), point(200)] }] });
        expect(route.totalMeters).toBeCloseTo(200, 4);
    });
});

describe("planned remaining time", () => {
    const timed = () => source([point(0, 0, 100, 0), point(100, 0, 200, 100), point(400, 0, 300, 400)]);

    it("uses the planned timeline, including different section speeds", () => {
        const route = buildLiveRouteModel(source([point(0, 0, 0, 0), point(100, 0, 0, 300), point(400, 0, 0, 400)]));
        expect(updateLiveProgress(route, fix(50), null, now).progress!.remainingSeconds).toBeCloseTo(250, 4);
    });

    it("scales section times to a manually changed total duration", () => {
        const result = updateLiveProgress(buildLiveRouteModel(timed(), 800), fix(250), null, now);
        expect(result.progress!.remainingSeconds).toBeCloseTo(300, 4);
    });

    it("accepts repeated timestamps caused by GPX rounding", () => {
        const route = buildLiveRouteModel(source([
            point(0, 0, 100, 0), point(1, 0, 100, 0), point(100, 0, 100, 300),
        ]));
        expect(route.timedSeconds).toBe(300);
        expect(updateLiveProgress(route, fix(100), null, now).progress!.remainingSeconds).toBe(0);
    });

    it("uses independent segment times without counting the interval between segments", () => {
        const route = buildLiveRouteModel(source(
            [point(0, 0, 0, 1000), point(100, 0, 0, 1100)],
            [point(500, 0, 0, 5000), point(600, 0, 0, 5200)],
        ));
        expect(route.durationSeconds).toBe(300);
        expect(updateLiveProgress(route, fix(550), null, now).progress!.remainingSeconds).toBeCloseTo(100, 4);
    });

    it.each([undefined, -20, 0, NaN])("falls back to distance with an incomplete or invalid timestamp: %s", (time) => {
        const route = buildLiveRouteModel(source([point(0, 0, 100, 0), point(1000, 0, 100, time)]), 1000);
        expect(route.timedSeconds).toBeNull();
        expect(updateLiveProgress(route, fix(250), null, now).progress!.remainingSeconds).toBeCloseTo(750, 4);
    });

    it("leaves time unknown without a valid plan and does not count down while stationary", () => {
        expect(updateLiveProgress(buildLiveRouteModel(source([point(0), point(1000)])), fix(500), null, now).progress!.remainingSeconds).toBeNull();
        const route = simple();
        const first = updateLiveProgress(route, fix(500), null, now).progress;
        const later = updateLiveProgress(route, fix(500, 0, 5, now + 60_000), first, now + 60_000).progress;
        expect(later!.remainingSeconds).toBe(first!.remainingSeconds);
    });
});

describe("live elevation profile and formatting", () => {
    it("interpolates the position height", () => {
        const route = buildLiveRouteModel(source([point(0, 0, 100), point(1000, 0, 300)]));
        expect(updateLiveProgress(route, fix(250), null, now).progress!.elevationMeters).toBeCloseTo(150, 4);
    });

    it("leaves missing heights and segment boundaries as gaps without inventing zero elevations", () => {
        const route = buildLiveRouteModel(source(
            [point(0, 0, 100), point(100, 0, 200), point(200), point(300, 0, 250), point(400, 0, 300)],
            [point(600, 0, 150), point(700, 0, 200)],
        ));
        const plot = buildLiveElevationPlot(route)!;
        expect(plot.minimum).toBe(100);
        expect(plot.maximum).toBe(300);
        expect(plot.paths).toHaveLength(3);
        expect(updateLiveProgress(route, fix(150), null, now).progress!.elevationMeters).toBeNull();
    });

    it("centers a flat profile and handles missing heights", () => {
        const plot = buildLiveElevationPlot(buildLiveRouteModel(source([point(0, 0, 200), point(100, 0, 200)])))!;
        expect(plot.y(200)).toBe(32);
        expect(plot.paths.join()).not.toMatch(/NaN|Infinity/);
        expect(buildLiveElevationPlot(buildLiveRouteModel(source([point(0), point(100, 0, NaN)])))).toBeNull();
    });

    it("formats kilometers in German and rounds remaining minutes upwards", () => {
        expect(formatLiveKilometers(1250)).toBe("1,3 km");
        expect(formatLiveRemainingTime(3661)).toBe("1 h 02 min");
        expect(formatLiveRemainingTime(0)).toBe("0 h 00 min");
        expect(formatLiveRemainingTime(2400 + 1e-8)).toBe("0 h 40 min");
    });
});
