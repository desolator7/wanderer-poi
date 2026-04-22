import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    createWaypointFromTap,
    getRoutingRoleByIndex,
    getWaypointInsertIndexByNearestSegment,
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
        expect(simplified).toContainEqual(points[3]);
    });
});

describe("trail editor integration", () => {
    const trailEditorPath = resolve("src/routes/trail/edit/[id]/+page.svelte");

    it("removes the add-waypoint menu button from the UI", () => {
        const source = readFileSync(trailEditorPath, "utf8");
        expect(source).not.toContain('>{$_("add-waypoint")}</button');
    });

    it("hooks map tap directly to waypoint creation", () => {
        const source = readFileSync(trailEditorPath, "utf8");
        expect(source).toContain("await addWaypointFromTap(e.lngLat.lat, e.lngLat.lng);");
    });
});

describe("routing localization", () => {
    it("uses localized routing panel title in english and german", () => {
        const en = JSON.parse(readFileSync(resolve("src/lib/i18n/locales/en.json"), "utf8"));
        const de = JSON.parse(readFileSync(resolve("src/lib/i18n/locales/de.json"), "utf8"));

        expect(en["poi-routing-panel-title"]).toBe("POIs for map and routing");
        expect(de["poi-routing-panel-title"]).toBe("POIs für Karte und Routing");
    });
});
