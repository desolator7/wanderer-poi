import { describe, expect, it, vi } from "vitest";
import {
    DEFAULT_PWA_LIVE_ZOOM_PRESET,
    PWA_LIVE_DATA_PATH,
    PWA_LIVE_PATH,
    PWA_LIVE_ROUTE_STORAGE_KEY,
    PWA_LIVE_ROUTE_VERSION,
    PWA_LIVE_ZOOM_LEVELS,
    PWA_START_PATH,
    cachePwaLiveShell,
    clearPwaLiveRoute,
    isPwaLiveOfflineMapPreset,
    isStandalonePwa,
    readPwaLiveRoute,
    writePwaLiveRoute,
    type PwaLiveRoute,
} from "./pwa_live_mode";

function createStorage(initialValue: string | null = null) {
    let value = initialValue;
    return {
        getItem: vi.fn(() => value),
        setItem: vi.fn((_key: string, nextValue: string) => {
            value = nextValue;
        }),
        removeItem: vi.fn(() => {
            value = null;
        }),
    };
}

function createRoute(): PwaLiveRoute {
    return {
        version: PWA_LIVE_ROUTE_VERSION,
        trailId: "trail-1",
        sourcePath: "/trail/edit/trail-1?share=secret",
        zoomPreset: "farOffline",
        offlineMap: {
            profileId: "opentopomap-route-v1",
            routeFingerprint:
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
        trail: {
            name: "Testweg",
            gpxData: "<gpx><trk /></gpx>",
        },
    };
}

describe("PWA live mode", () => {
    it("uses stable local routes and fixed zoom levels", () => {
        expect(PWA_LIVE_ROUTE_VERSION).toBe(2);
        expect(PWA_START_PATH).toBe("/pwa-start.html");
        expect(PWA_LIVE_PATH).toBe("/live");
        expect(PWA_LIVE_ZOOM_LEVELS).toEqual({
            near: 17,
            medium: 15,
            far: 14,
            farOffline: 14,
        });
        expect(DEFAULT_PWA_LIVE_ZOOM_PRESET).toBe("medium");
    });

    it("uses the tile cache only for the explicit offline preset", () => {
        expect(isPwaLiveOfflineMapPreset("near")).toBe(false);
        expect(isPwaLiveOfflineMapPreset("medium")).toBe(false);
        expect(isPwaLiveOfflineMapPreset("far")).toBe(false);
        expect(isPwaLiveOfflineMapPreset("farOffline")).toBe(true);
    });

    it("detects standard and iOS standalone PWAs", () => {
        const standaloneWindow = {
            matchMedia: vi.fn(() => ({ matches: true })),
            navigator: {},
        } as unknown as Window;
        const iosWindow = {
            matchMedia: vi.fn(() => ({ matches: false })),
            navigator: { standalone: true },
        } as unknown as Window;

        expect(isStandalonePwa(standaloneWindow)).toBe(true);
        expect(isStandalonePwa(iosWindow)).toBe(true);
    });

    it("persists the complete live route snapshot", () => {
        const storage = createStorage();
        const route = createRoute();

        writePwaLiveRoute(route, storage);

        expect(readPwaLiveRoute(storage)).toEqual(route);
    });

    it.each([
        ["malformed JSON", "not-json"],
        [
            "old metadata-only state",
            JSON.stringify({
                trailId: "trail-1",
                path: "/trail/edit/trail-1",
                zoomPreset: "medium",
            }),
        ],
        [
            "new route",
            JSON.stringify({ ...createRoute(), trailId: "new" }),
        ],
        [
            "invalid source path",
            JSON.stringify({ ...createRoute(), sourcePath: "/settings" }),
        ],
        [
            "empty GPX data",
            JSON.stringify({
                ...createRoute(),
                trail: { name: "Testweg", gpxData: "" },
            }),
        ],
        [
            "old snapshot version",
            JSON.stringify({ ...createRoute(), version: 1 }),
        ],
        [
            "invalid offline map profile",
            JSON.stringify({
                ...createRoute(),
                offlineMap: {
                    profileId: "other",
                    routeFingerprint: "invalid",
                },
            }),
        ],
    ])("removes %s", (_name, value) => {
        const storage = createStorage(value);

        expect(readPwaLiveRoute(storage)).toBeNull();
        expect(storage.removeItem).toHaveBeenCalledWith(
            PWA_LIVE_ROUTE_STORAGE_KEY,
        );
    });

    it("clears the active route explicitly", () => {
        const storage = createStorage();
        clearPwaLiveRoute(storage);
        expect(storage.removeItem).toHaveBeenCalledWith(
            PWA_LIVE_ROUTE_STORAGE_KEY,
        );
    });

    it("warms the cached live shell without throwing offline", async () => {
        const successfulFetch = vi.fn(async () => new Response("", { status: 200 }));
        const failedFetch = vi.fn(async () => {
            throw new TypeError("offline");
        });

        await expect(cachePwaLiveShell(successfulFetch)).resolves.toBe(true);
        expect(successfulFetch).toHaveBeenNthCalledWith(1, PWA_LIVE_PATH, {
            cache: "reload",
            credentials: "same-origin",
            headers: { accept: "text/html" },
        });
        expect(successfulFetch).toHaveBeenNthCalledWith(2, PWA_LIVE_DATA_PATH, {
            cache: "reload",
            credentials: "same-origin",
            headers: { accept: "application/json" },
        });
        await expect(cachePwaLiveShell(failedFetch)).resolves.toBe(false);
    });
});
