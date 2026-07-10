import { describe, expect, it, vi } from "vitest";
import {
    DEFAULT_PWA_LIVE_ZOOM_PRESET,
    PWA_LIVE_ROUTE_STORAGE_KEY,
    PWA_LIVE_ZOOM_LEVELS,
    clearPwaLiveRoute,
    isCurrentPwaLiveRoute,
    isStandalonePwa,
    readPwaLiveRoute,
    writePwaLiveRoute,
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

describe("PWA live mode", () => {
    it("uses local fixed zoom levels", () => {
        expect(PWA_LIVE_ZOOM_LEVELS).toEqual({
            near: 18,
            medium: 16,
            far: 15,
        });
        expect(DEFAULT_PWA_LIVE_ZOOM_PRESET).toBe("medium");
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

    it("persists a route including its share query", () => {
        const storage = createStorage();
        const route = {
            trailId: "trail-1",
            path: "/trail/edit/trail-1?share=secret",
            zoomPreset: "near" as const,
        };

        writePwaLiveRoute(route, storage);

        expect(readPwaLiveRoute(storage)).toEqual(route);
        expect(
            isCurrentPwaLiveRoute(
                route,
                new URL("https://example.test/trail/edit/trail-1?share=secret"),
            ),
        ).toBe(true);
    });

    it.each([
        ["missing", undefined],
        ["invalid", "regional"],
    ])("normalizes a %s zoom preset to medium", (_name, zoomPreset) => {
        const storage = createStorage(
            JSON.stringify({
                trailId: "trail-1",
                path: "/trail/edit/trail-1",
                ...(zoomPreset === undefined ? {} : { zoomPreset }),
            }),
        );

        expect(readPwaLiveRoute(storage)).toEqual({
            trailId: "trail-1",
            path: "/trail/edit/trail-1",
            zoomPreset: DEFAULT_PWA_LIVE_ZOOM_PRESET,
        });
        expect(storage.removeItem).not.toHaveBeenCalled();
    });

    it("removes malformed and new-route state", () => {
        const malformedStorage = createStorage("not-json");
        const newRouteStorage = createStorage(
            JSON.stringify({ trailId: "new", path: "/trail/edit/new" }),
        );

        expect(readPwaLiveRoute(malformedStorage)).toBeNull();
        expect(malformedStorage.removeItem).toHaveBeenCalledWith(
            PWA_LIVE_ROUTE_STORAGE_KEY,
        );
        expect(readPwaLiveRoute(newRouteStorage)).toBeNull();
    });

    it("clears the active route explicitly", () => {
        const storage = createStorage();
        clearPwaLiveRoute(storage);
        expect(storage.removeItem).toHaveBeenCalledWith(
            PWA_LIVE_ROUTE_STORAGE_KEY,
        );
    });
});
