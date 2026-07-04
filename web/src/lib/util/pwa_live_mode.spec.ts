import { describe, expect, it, vi } from "vitest";
import {
    PWA_LIVE_ROUTE_STORAGE_KEY,
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
