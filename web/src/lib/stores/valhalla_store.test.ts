import { afterEach, describe, expect, it, vi } from "vitest";
import { encodePolyline } from "$lib/util/polyline_util";
import { calculateRouteBetween } from "./valhalla_store.svelte";

afterEach(() => vi.unstubAllGlobals());

describe("routing duration", () => {
    it.each(["pedestrian", "bicycle"] as const)("preserves the full reported %s duration between track endpoints", async (modeOfTransport) => {
        const shape = encodePolyline([[51.8, 10.7], [51.8, 10.71], [51.8, 10.72]]);
        vi.stubGlobal("fetch", vi.fn(async (url: string) => {
            if (url.endsWith("/route")) return Response.json({ trip: { legs: [{ shape }], summary: { time: 1200 } } });
            if (url.endsWith("/height")) return Response.json({ height: [300, 350, 420] });
            return Response.json({ edges: [] });
        }));
        const route = await calculateRouteBetween(51.8, 10.7, 51.8, 10.72, { autoRouting: true, modeOfTransport });
        expect(route.waypoints).toHaveLength(3);
        expect(route.waypoints.at(-1)!.time!.getTime() - route.waypoints[0].time!.getTime()).toBe(1_200_000);
    });
});
