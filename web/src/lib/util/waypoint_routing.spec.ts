import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import GPX from "../models/gpx/gpx";
import TrackSegment from "../models/gpx/track-segment";
import Track from "../models/gpx/track";
import GPXWaypoint from "../models/gpx/waypoint";
import {
    buildImportedRouteSegments,
    buildImportedRouteWaypoints,
    createWaypointFromTap,
    formatWaypointLocationName,
    getNumberedWaypointName,
    getRoutingRoleByIndex,
    getWaypointCoordinateName,
    getWaypointInsertIndexByNearestSegment,
    isPlaceholderWaypointName,
    shouldBuildImportedRouteWaypoints,
    simplifyPolylinePoints,
} from "./waypoint_routing";

describe("getWaypointInsertIndexByNearestSegment", () => {
    it("uses robust fallbacks for 0 and 1 existing waypoints", () => {
        expect(
            getWaypointInsertIndexByNearestSegment([], { lat: 52.5, lon: 13.4 }),
        ).toBe(0);

        expect(
            getWaypointInsertIndexByNearestSegment(
                [{ lat: 52.5, lon: 13.4 }],
                { lat: 52.6, lon: 13.5 },
            ),
        ).toBe(1);
    });

    it("inserts between the nearest waypoint segment", () => {
        const index = getWaypointInsertIndexByNearestSegment(
            [
                { lat: 52.0, lon: 13.0 },
                { lat: 52.0, lon: 14.0 },
                { lat: 53.0, lon: 14.0 },
            ],
            { lat: 52.05, lon: 13.5 },
        );

        expect(index).toBe(1);
    });
});

describe("routing roles", () => {
    it("maps waypoint positions to start/via/goal", () => {
        expect(getRoutingRoleByIndex(0, 3)).toBe("start");
        expect(getRoutingRoleByIndex(1, 3)).toBe("via");
        expect(getRoutingRoleByIndex(2, 3)).toBe("goal");
    });
});

describe("tap waypoint creation", () => {
    it("keeps optional metadata optional", () => {
        const withMetadata = createWaypointFromTap(10, 20, {
            name: "Lunch",
            description: "Optional details",
            icon: "utensils",
        });
        expect(withMetadata.name).toBe("Lunch");
        expect(withMetadata.description).toBe("Optional details");
        expect(withMetadata.icon).toBe("utensils");

        const withoutMetadata = createWaypointFromTap(10, 20);
        expect(withoutMetadata.name).toBe("");
        expect(withoutMetadata.description).toBe("");
    });
});

describe("polyline simplification", () => {
    it("keeps endpoints and reduces near-linear points", () => {
        const points = Array.from({ length: 21 }, (_, idx) => ({
            lat: 47 + idx * 0.0001,
            lon: 11 + idx * 0.0001,
        }));

        const simplified = simplifyPolylinePoints(points, {
            toleranceMeters: 5,
            maxPoints: 10,
        });

        expect(simplified[0]).toEqual(points[0]);
        expect(simplified.at(-1)).toEqual(points.at(-1));
        expect(simplified.length).toBeLessThan(points.length);
    });

    it("preserves significant bends", () => {
        const points = [
            { lat: 47.0, lon: 11.0 },
            { lat: 47.0001, lon: 11.0001 },
            { lat: 47.0002, lon: 11.0002 },
            { lat: 47.0003, lon: 11.0008 },
            { lat: 47.0004, lon: 11.0014 },
            { lat: 47.0005, lon: 11.0020 },
        ];

        const simplified = simplifyPolylinePoints(points, {
            toleranceMeters: 4,
            maxPoints: 6,
        });

        expect(simplified.length).toBeGreaterThanOrEqual(3);
        expect(
            simplified.some(
                (point) =>
                    point !== points[0] &&
                    point !== points.at(-1) &&
                    points.includes(point),
            ),
        ).toBe(true);
    });
});

describe("imported route waypoints", () => {
    it("formats imported waypoint names from street and house number", () => {
        expect(
            formatWaypointLocationName({
                streetName: "Hauptstraße",
                houseNumber: "12",
                fallback: "Innenstadt, Musterstadt",
                index: 3,
            }),
        ).toBe("Hauptstraße 12");
    });

    it("uses location fallback when no street name is available", () => {
        expect(
            formatWaypointLocationName({
                fallback: "Ziegenhain, Schwalmstadt, Hessen",
                index: 4,
            }),
        ).toBe("Ziegenhain, Schwalmstadt, Hessen");
    });

    it("uses a numbered waypoint fallback without reverse geocoding data", () => {
        expect(formatWaypointLocationName({ index: 7 })).toBe("Wegpunkt 7");
    });

    it("detects generated placeholder waypoint names", () => {
        expect(isPlaceholderWaypointName("Wegpunkt 7")).toBe(true);
        expect(isPlaceholderWaypointName("50.12345, 9.12345")).toBe(true);
        expect(isPlaceholderWaypointName("Parkplatz")).toBe(false);
    });

    it("initializes imported route waypoints with numbered names instead of coordinates", () => {
        const routeSegments = buildImportedRouteSegments(
            [
                [
                    { lat: 50.0, lon: 9.0 },
                    { lat: 50.01, lon: 9.01 },
                    { lat: 50.02, lon: 9.02 },
                ],
            ],
            {
                toleranceMeters: 1,
                maxPoints: 10,
            },
        );
        const waypoints = buildImportedRouteWaypoints(routeSegments, true);

        expect(waypoints.map((waypoint) => waypoint.name)).toEqual(
            waypoints.map((_, index) => getNumberedWaypointName(index + 1)),
        );
        expect(
            waypoints.every(
                (waypoint) =>
                    waypoint.name !==
                    getWaypointCoordinateName(waypoint.lat, waypoint.lon),
            ),
        ).toBe(true);
    });

    it("creates snap waypoints from GPX track control points when recalculation is enabled", () => {
        const trackPoints = [
            { lat: 50.0, lon: 9.0 },
            { lat: 50.0, lon: 9.01 },
            { lat: 50.01, lon: 9.01 },
            { lat: 50.01, lon: 9.02 },
            { lat: 50.02, lon: 9.02 },
        ];

        const routeSegments = buildImportedRouteSegments([trackPoints], {
            toleranceMeters: 1,
            maxPoints: 10,
        });
        const waypoints = buildImportedRouteWaypoints(routeSegments, true);

        expect(waypoints.length).toBeGreaterThan(2);
        expect(waypoints[0].lat).toBe(trackPoints[0].lat);
        expect(waypoints[0].lon).toBe(trackPoints[0].lon);
        expect(waypoints.at(-1)?.lat).toBe(trackPoints.at(-1)?.lat);
        expect(waypoints.at(-1)?.lon).toBe(trackPoints.at(-1)?.lon);
        expect(waypoints.slice(1).every((waypoint) => waypoint.connectionMode === "snap")).toBe(
            true,
        );
    });

    it("only builds synthetic GPX route waypoints when recalculation is enabled", () => {
        expect(shouldBuildImportedRouteWaypoints("tour.gpx", true)).toBe(true);
        expect(shouldBuildImportedRouteWaypoints("tour.gpx", false)).toBe(false);
        expect(shouldBuildImportedRouteWaypoints("tour.kml", false)).toBe(true);
        expect(shouldBuildImportedRouteWaypoints("tour.kmz", false)).toBe(true);
    });
});

describe("gpx elevation gaps", () => {
    it("keeps parsed GPX elevation strings as numeric GeoJSON elevations", () => {
        const gpx = GPX.parse(`<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="wanderer">
  <trk>
    <trkseg>
      <trkpt lat="47.0" lon="11.0"><ele>100.5</ele></trkpt>
      <trkpt lat="47.001" lon="11.001"><ele>112.25</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`);

        const feature = gpx.toGeoJSON().features[0];
        const coordinates = (feature.geometry as GeoJSON.LineString).coordinates;

        expect(coordinates[0][2]).toBe(100.5);
        expect(coordinates[1][2]).toBe(112.25);
    });

    it("draws missing segment endpoint elevations from neighboring route points", () => {
        const segment = new TrackSegment({
            trkpt: [
                new GPXWaypoint({ $: { lat: 47.0, lon: 11.0 } }),
                new GPXWaypoint({
                    $: { lat: 47.001, lon: 11.001 },
                    ele: 1234,
                }),
                new GPXWaypoint({ $: { lat: 47.002, lon: 11.002 } }),
            ],
        });

        const geojson = segment.toGeoJSON(new Track({}), 0, 0);
        const coordinates = (geojson.geometry as GeoJSON.LineString).coordinates;

        expect(coordinates[0][2]).toBe(1234);
        expect(coordinates[1][2]).toBe(1234);
        expect(coordinates[2][2]).toBe(1234);
    });

    it("does not count missing waypoint endpoint elevations as drops to sea level", () => {
        const gpx = new GPX({
            trk: [
                new Track({
                    trkseg: [
                        new TrackSegment({
                            trkpt: [
                                new GPXWaypoint({
                                    $: { lat: 47.0, lon: 11.0 },
                                    ele: 100,
                                }),
                                new GPXWaypoint({
                                    $: { lat: 47.001, lon: 11.001 },
                                    ele: 110,
                                }),
                                new GPXWaypoint({
                                    $: { lat: 47.002, lon: 11.002 },
                                }),
                            ],
                        }),
                        new TrackSegment({
                            trkpt: [
                                new GPXWaypoint({
                                    $: { lat: 47.002, lon: 11.002 },
                                }),
                                new GPXWaypoint({
                                    $: { lat: 47.003, lon: 11.003 },
                                    ele: 116,
                                }),
                                new GPXWaypoint({
                                    $: { lat: 47.004, lon: 11.004 },
                                    ele: 126,
                                }),
                            ],
                        }),
                    ],
                }),
            ],
        });

        expect(gpx.features.elevationLoss).toBe(0);
        expect(gpx.features.elevationGain).toBe(16);
    });
});

describe("trail editor integration", () => {
    const trailEditorPath = resolve("src/routes/trail/edit/[id]/+page.svelte");

    it("removes the advanced add-waypoint menu button from the UI", () => {
        const source = readFileSync(trailEditorPath, "utf8");
        expect(source).not.toContain('get(_)("add-waypoint-advanced")');
    });

    it("opens the waypoint action popup on map tap", () => {
        const source = readFileSync(trailEditorPath, "utf8");
        expect(source).toContain("showWaypointActionPopup(e.lngLat);");
    });

    it("preserves connection modes when confirming a waypoint move", () => {
        const source = readFileSync(trailEditorPath, "utf8");
        expect(source).toContain(
            "void recalculateAdjacentWaypointSegments(waypointIndex);",
        );
        expect(source).not.toContain(
            "recalculateAdjacentWaypointSegments(waypointIndex, {\n                snapAffectedSegments: true",
        );
    });

    it("guards route difficulty assessment against empty SAC scale entries", () => {
        const source = readFileSync(trailEditorPath, "utf8");
        expect(source).toContain(
            "Array.isArray(segmentGroup) ? segmentGroup : []",
        );
        expect(source).toContain("Number(segment?.sacScale)");
    });
});

describe("routing localization", () => {
    it("uses localized routing panel title in english and german", () => {
        const en = JSON.parse(readFileSync(resolve("src/lib/i18n/locales/en.json"), "utf8"));
        const de = JSON.parse(readFileSync(resolve("src/lib/i18n/locales/de.json"), "utf8"));

        expect(en["poi-routing-panel-title"]).toBe("POIs for map and routing");
        expect(de["poi-routing-panel-title"]).toBe("POIs für Karte und Routing");
        expect(en["error-calculating-route-after-waypoint-move"]).toBe(
            "Route could not be calculated after moving the waypoint",
        );
        expect(de["error-calculating-route-after-waypoint-move"]).toBe(
            "Route konnte nach dem Verschieben des Wegpunkts nicht berechnet werden",
        );
    });
});
