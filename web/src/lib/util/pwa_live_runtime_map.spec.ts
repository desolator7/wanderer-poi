import { describe, expect, it } from "vitest";
import {
    PWA_LIVE_RUNTIME_MAP_DEFAULT_TTL_MS,
    PWA_LIVE_RUNTIME_MAP_ESTIMATED_BYTES,
    PWA_LIVE_RUNTIME_MAP_MAX_BYTES,
    PWA_LIVE_RUNTIME_MAP_STORAGE_RESERVE,
    calculatePwaLiveRuntimeMapByteLimit,
    createEmptyPwaLiveRuntimeMapManifest,
    getPwaLiveRuntimeMapCachePolicy,
    isPwaLiveRuntimeMapCacheManifest,
    markPwaLiveRuntimeMapUrl,
    pwaLiveRuntimeMapResponseByteSize,
    selectPwaLiveRuntimeMapEvictions,
    unmarkPwaLiveRuntimeMapUrl,
} from "./pwa_live_runtime_map";

describe("PWA live runtime map cache", () => {
    it("marks HTTP map resources without losing existing query parameters", () => {
        const marked = markPwaLiveRuntimeMapUrl(
            "https://tiles.example.test/12/1/2.pbf?token=secret#fragment",
            "https://wanderer.example.test/live",
        );

        expect(marked).toContain("token=secret");
        expect(marked).toContain("__wanderer_live_runtime_map=1");
        expect(unmarkPwaLiveRuntimeMapUrl(marked)).toBe(
            "https://tiles.example.test/12/1/2.pbf?token=secret#fragment",
        );
    });

    it("resolves relative resources and ignores non-HTTP URLs", () => {
        const marked = markPwaLiveRuntimeMapUrl(
            "/styles/map.json",
            "https://wanderer.example.test/live",
        );
        expect(unmarkPwaLiveRuntimeMapUrl(marked)).toBe(
            "https://wanderer.example.test/styles/map.json",
        );
        expect(
            markPwaLiveRuntimeMapUrl(
                "data:application/json,{}",
                "https://wanderer.example.test/live",
            ),
        ).toBe("data:application/json,{}");
        expect(unmarkPwaLiveRuntimeMapUrl("https://example.test/map")).toBeNull();
    });

    it("honours max-age, Age and Expires", () => {
        const now = Date.parse("2026-08-30T10:00:00Z");
        expect(
            getPwaLiveRuntimeMapCachePolicy(
                new Headers({ "cache-control": "public, max-age=600", age: "60" }),
                now,
            ),
        ).toEqual({ cacheable: true, expiresAt: now + 540_000 });
        expect(
            getPwaLiveRuntimeMapCachePolicy(
                new Headers({ expires: "Sun, 30 Aug 2026 11:00:00 GMT" }),
                now,
            ),
        ).toEqual({
            cacheable: true,
            expiresAt: Date.parse("2026-08-30T11:00:00Z"),
        });
    });

    it("does not store no-store responses and requires no-cache revalidation", () => {
        const now = 1_000;
        expect(
            getPwaLiveRuntimeMapCachePolicy(
                new Headers({ "cache-control": "private, no-store" }),
                now,
            ),
        ).toEqual({ cacheable: false, expiresAt: now });
        expect(
            getPwaLiveRuntimeMapCachePolicy(
                new Headers({ "cache-control": "no-cache" }),
                now,
            ),
        ).toEqual({ cacheable: true, expiresAt: now });
    });

    it("uses the seven-day fallback and agreed storage limits", () => {
        const now = 1_000;
        expect(
            getPwaLiveRuntimeMapCachePolicy(new Headers(), now),
        ).toEqual({
            cacheable: true,
            expiresAt: now + PWA_LIVE_RUNTIME_MAP_DEFAULT_TTL_MS,
        });
        expect(PWA_LIVE_RUNTIME_MAP_MAX_BYTES).toBe(100 * 1024 * 1024);
        expect(PWA_LIVE_RUNTIME_MAP_STORAGE_RESERVE).toBe(10 * 1024 * 1024);
    });

    it("reduces the cache limit when the browser reserve is missing", () => {
        const megabyte = 1024 * 1024;
        expect(
            calculatePwaLiveRuntimeMapByteLimit(
                100 * megabyte,
                500 * megabyte,
                495 * megabyte,
            ),
        ).toBe(95 * megabyte);
        expect(
            calculatePwaLiveRuntimeMapByteLimit(
                20 * megabyte,
                undefined,
                undefined,
            ),
        ).toBe(PWA_LIVE_RUNTIME_MAP_MAX_BYTES);
    });

    it("measures readable responses and estimates unavailable sizes", async () => {
        await expect(
            pwaLiveRuntimeMapResponseByteSize(
                new Response(new Uint8Array([1, 2, 3, 4])),
            ),
        ).resolves.toBe(4);
        await expect(
            pwaLiveRuntimeMapResponseByteSize(
                new Response(null, { headers: { "content-length": "42" } }),
            ),
        ).resolves.toBe(42);
        await expect(
            pwaLiveRuntimeMapResponseByteSize(new Response(null)),
        ).resolves.toBe(PWA_LIVE_RUNTIME_MAP_ESTIMATED_BYTES);
    });

    it("validates the runtime manifest", () => {
        const manifest = createEmptyPwaLiveRuntimeMapManifest();
        expect(isPwaLiveRuntimeMapCacheManifest(manifest)).toBe(true);
        expect(
            isPwaLiveRuntimeMapCacheManifest({
                ...manifest,
                entries: {
                    "https://tiles.example.test/1/2/3.png": {
                        url: "different-url",
                        size: 1,
                        cachedAt: 1,
                        expiresAt: 2,
                        lastAccessedAt: 1,
                    },
                },
            }),
        ).toBe(false);
    });

    it("evicts expired entries before the least recently used entries", () => {
        const now = 10_000;
        const entries = {
            expired: {
                url: "expired",
                size: 10,
                cachedAt: 1,
                expiresAt: now,
                lastAccessedAt: 9_000,
            },
            oldest: {
                url: "oldest",
                size: 20,
                cachedAt: 1,
                expiresAt: 20_000,
                lastAccessedAt: 2_000,
            },
            newest: {
                url: "newest",
                size: 20,
                cachedAt: 1,
                expiresAt: 20_000,
                lastAccessedAt: 8_000,
            },
        };

        expect(
            selectPwaLiveRuntimeMapEvictions(
                entries,
                "incoming",
                30,
                50,
                now,
            ),
        ).toEqual(["expired", "oldest"]);
    });
});
