import { describe, expect, it } from "vitest";
import {
    PWA_LIVE_TILE_CORRIDOR_METERS,
    PWA_LIVE_TILE_MAX_BYTES,
    PWA_LIVE_TILE_MAX_TILES,
    PWA_LIVE_TILE_MAX_ZOOM,
    PWA_LIVE_TILE_MIN_ZOOM,
    PWA_LIVE_TILE_PROFILE_ID,
    PWA_LIVE_TILE_URL_TEMPLATE,
    buildPwaLiveTilePlan,
    createPwaLiveMapStyle,
    createPwaLiveRouteFingerprint,
    extractPwaLiveCoordinateSegments,
    isPwaLiveTileUrl,
    pwaLiveTileResponseByteSize,
} from "./pwa_live_tiles";

const routeSegments = [
    [
        [11.0, 48.0],
        [11.04, 48.02],
        [11.08, 48.04],
    ],
] as const;

describe("PWA live tile profile", () => {
    it("uses the agreed coarse and bounded OpenTopoMap profile", () => {
        expect(PWA_LIVE_TILE_PROFILE_ID).toBe("opentopomap-route-v1");
        expect(PWA_LIVE_TILE_MIN_ZOOM).toBe(12);
        expect(PWA_LIVE_TILE_MAX_ZOOM).toBe(15);
        expect(PWA_LIVE_TILE_CORRIDOR_METERS).toBe(500);
        expect(PWA_LIVE_TILE_MAX_TILES).toBe(1_200);
        expect(PWA_LIVE_TILE_MAX_BYTES).toBe(60 * 1024 * 1024);
        expect(PWA_LIVE_TILE_URL_TEMPLATE).toBe(
            "https://tile.opentopomap.org/{z}/{x}/{y}.png",
        );
    });

    it("covers a route with unique tiles on every complete zoom level", () => {
        const plan = buildPwaLiveTilePlan(
            "trail-1",
            "fingerprint",
            routeSegments.map((segment) => [...segment]),
        );

        expect(plan.includedZooms).toEqual([12, 13, 14, 15]);
        expect(plan.omittedZooms).toEqual([]);
        expect(plan.limited).toBe(false);
        expect(plan.tileUrls.length).toBeGreaterThan(4);
        expect(new Set(plan.tileUrls).size).toBe(plan.tileUrls.length);
        for (const zoom of plan.includedZooms) {
            expect(
                plan.tileUrls.some((url) => url.includes(`/${zoom}/`)),
            ).toBe(true);
        }
    });

    it("omits a complete high zoom level instead of truncating the route", () => {
        const segments = routeSegments.map((segment) => [...segment]);
        const zoomTwelvePlan = buildPwaLiveTilePlan(
            "trail-1",
            "fingerprint",
            segments,
            { minZoom: 12, maxZoom: 12 },
        );
        const limitedPlan = buildPwaLiveTilePlan(
            "trail-1",
            "fingerprint",
            segments,
            { maxTiles: zoomTwelvePlan.tileUrls.length },
        );

        expect(limitedPlan.includedZooms).toEqual([12]);
        expect(limitedPlan.omittedZooms).toEqual([13, 14, 15]);
        expect(limitedPlan.tileUrls).toEqual(zoomTwelvePlan.tileUrls);
        expect(limitedPlan.limited).toBe(true);
    });

    it("uses the short direction when a route crosses the date line", () => {
        const plan = buildPwaLiveTilePlan(
            "trail-1",
            "fingerprint",
            [
                [
                    [179.99, 0],
                    [-179.99, 0],
                ],
            ],
            { minZoom: 12, maxZoom: 12 },
        );

        expect(plan.tileUrls.length).toBeGreaterThan(0);
        expect(plan.tileUrls.length).toBeLessThan(20);
    });

    it("keeps separate GPX track segments separate and ignores invalid points", () => {
        const segments = extractPwaLiveCoordinateSegments({
            trk: [
                {
                    trkseg: [
                        {
                            trkpt: [
                                { $: { lat: 48, lon: 11 } },
                                { $: { lat: Number.NaN, lon: 12 } },
                            ],
                        },
                        { trkpt: [{ $: { lat: 49, lon: 12 } }] },
                    ],
                },
            ],
        });

        expect(segments).toEqual([[[11, 48]], [[12, 49]]]);
    });

    it("creates stable route fingerprints that include the tile profile", async () => {
        const first = await createPwaLiveRouteFingerprint("<gpx>one</gpx>");
        const repeated = await createPwaLiveRouteFingerprint(
            "  <gpx>one</gpx>  ",
        );
        const changed = await createPwaLiveRouteFingerprint("<gpx>two</gpx>");

        expect(first).toMatch(/^[a-f0-9]{64}$/);
        expect(repeated).toBe(first);
        expect(changed).not.toBe(first);
    });

    it("uses only the bounded OpenTopoMap raster source in the live style", () => {
        const style = createPwaLiveMapStyle();
        const source = style.sources.liveOpenTopoMap;

        expect(source).toMatchObject({
            type: "raster",
            tiles: [PWA_LIVE_TILE_URL_TEMPLATE],
            minzoom: 12,
            maxzoom: 15,
        });
        expect(style.layers.map((layer) => layer.id)).toEqual([
            "live-offline-background",
            "live-open-topo-map",
        ]);
        expect(
            isPwaLiveTileUrl(
                new URL("https://tile.opentopomap.org/15/17400/11300.png"),
            ),
        ).toBe(true);
        expect(
            isPwaLiveTileUrl(
                new URL("https://example.com/15/17400/11300.png"),
            ),
        ).toBe(false);
    });

    it("measures tile bodies when Content-Length is not exposed", async () => {
        const withoutHeader = new Response(new Uint8Array([1, 2, 3, 4]));
        const withHeader = new Response(new Uint8Array([1]), {
            headers: { "content-length": "42" },
        });

        await expect(
            pwaLiveTileResponseByteSize(withoutHeader),
        ).resolves.toBe(4);
        await expect(pwaLiveTileResponseByteSize(withHeader)).resolves.toBe(
            42,
        );
    });
});
