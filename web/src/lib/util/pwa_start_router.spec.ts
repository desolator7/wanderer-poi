import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
    PWA_LIVE_PATH,
    PWA_LIVE_DATA_PATH,
    PWA_LIVE_ROUTE_RECOVERY_STORAGE_KEY,
    PWA_LIVE_ROUTE_STORAGE_KEY,
    PWA_START_PATH,
} from "./pwa_live_mode";
import {
    PWA_LIVE_TILE_MAX_ZOOM,
    PWA_LIVE_TILE_MIN_ZOOM,
    PWA_LIVE_TILE_PROFILE_ID,
} from "./pwa_live_tiles";
import {
    PWA_LIVE_RUNTIME_MAP_CACHE_NAME,
    PWA_LIVE_RUNTIME_MAP_MAX_BYTES,
    PWA_LIVE_RUNTIME_MAP_STORAGE_RESERVE,
} from "./pwa_live_runtime_map";

const projectRoot = resolve(import.meta.dirname, "../../..");

function executeStartRouter(
    online: boolean,
    storedValues: Record<string, string>,
) {
    const startDocument = readFileSync(
        resolve(projectRoot, "static/pwa-start.html"),
        "utf8",
    );
    const script = startDocument.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    if (!script) {
        throw new Error("PWA start script missing");
    }

    const values = new Map(Object.entries(storedValues));
    const listeners = new Map<string, () => void>();
    const elements = {
        status: { textContent: "" },
        resume: {
            hidden: true,
            addEventListener: (_type: string, listener: () => void) => {
                listeners.set("resume", listener);
            },
        },
        retry: {
            addEventListener: (_type: string, listener: () => void) => {
                listeners.set("retry", listener);
            },
        },
    };
    const replace = vi.fn();
    const localStorage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
    };

    runInNewContext(script, {
        document: {
            getElementById: (id: keyof typeof elements) => elements[id],
        },
        localStorage,
        location: { replace },
        navigator: { onLine: online },
        window: { addEventListener: vi.fn() },
    });

    return { elements, listeners, replace, values };
}

function storedLiveRoute(): string {
    return JSON.stringify({
        version: 2,
        trailId: "trail-1",
        sourcePath: "/trail/edit/trail-1",
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
    });
}

describe("PWA start router", () => {
    it("uses a stable manifest identity and the cached start document", () => {
        const manifest = JSON.parse(
            readFileSync(
                resolve(projectRoot, "static/manifest.webmanifest"),
                "utf8",
            ),
        );

        expect(manifest.id).toBe("/");
        expect(manifest.start_url).toBe(PWA_START_PATH);
        expect(manifest.lang).toBe("de");
    });

    it("routes a valid local live snapshot before the server-backed app", () => {
        const startDocument = readFileSync(
            resolve(projectRoot, "static/pwa-start.html"),
            "utf8",
        );

        expect(startDocument).toContain(PWA_LIVE_ROUTE_STORAGE_KEY);
        expect(startDocument).toContain(
            PWA_LIVE_ROUTE_RECOVERY_STORAGE_KEY,
        );
        expect(startDocument).toContain(PWA_LIVE_TILE_PROFILE_ID);
        expect(startDocument).toContain(`location.replace("${PWA_LIVE_PATH}")`);
        expect(startDocument).toContain("navigator.onLine");
        expect(startDocument).toContain("Keine Offline-Route aktiv");
    });

    it("offers the retained live session on the offline start screen", () => {
        const startDocument = readFileSync(
            resolve(projectRoot, "static/pwa-start.html"),
            "utf8",
        );
        const livePage = readFileSync(
            resolve(projectRoot, "src/routes/live/+page.svelte"),
            "utf8",
        );

        expect(startDocument).toContain(
            "Letzte Live-Sitzung fortsetzen",
        );
        expect(startDocument).toContain(
            'localStorage.getItem(LIVE_RECOVERY_KEY) === "1"',
        );
        expect(startDocument).toContain(
            "localStorage.removeItem(LIVE_RECOVERY_KEY)",
        );
        expect(startDocument).toContain(
            "Die letzte Live-Sitzung kann wiederhergestellt werden.",
        );
        expect(livePage).toContain("deactivatePwaLiveRoute()");
        expect(livePage).toContain("reactivatePwaLiveRoute()");
    });

    it("restores an inactive session offline and retains its snapshot", () => {
        const router = executeStartRouter(false, {
            [PWA_LIVE_ROUTE_STORAGE_KEY]: storedLiveRoute(),
            [PWA_LIVE_ROUTE_RECOVERY_STORAGE_KEY]: "1",
        });

        expect(router.replace).not.toHaveBeenCalled();
        expect(router.elements.resume.hidden).toBe(false);
        expect(router.elements.status.textContent).toContain(
            "Die letzte Live-Sitzung kann wiederhergestellt werden.",
        );

        router.listeners.get("resume")?.();

        expect(router.replace).toHaveBeenCalledWith(PWA_LIVE_PATH);
        expect(router.values.has(PWA_LIVE_ROUTE_STORAGE_KEY)).toBe(true);
        expect(
            router.values.has(PWA_LIVE_ROUTE_RECOVERY_STORAGE_KEY),
        ).toBe(false);
    });

    it("keeps the existing online redirect for an inactive session", () => {
        const router = executeStartRouter(true, {
            [PWA_LIVE_ROUTE_STORAGE_KEY]: storedLiveRoute(),
            [PWA_LIVE_ROUTE_RECOVERY_STORAGE_KEY]: "1",
        });

        expect(router.replace).toHaveBeenCalledWith("/");
        expect(router.values.has(PWA_LIVE_ROUTE_STORAGE_KEY)).toBe(true);
    });

    it("keeps the live navigation shell in the versioned service-worker cache", () => {
        const serviceWorker = readFileSync(
            resolve(projectRoot, "src/service-worker.ts"),
            "utf8",
        );

        expect(serviceWorker).toContain(`const LIVE_PATH = "${PWA_LIVE_PATH}"`);
        expect(serviceWorker).toContain(
            `const LIVE_DATA_PATH = "${PWA_LIVE_DATA_PATH}"`,
        );
        expect(serviceWorker).toContain("cache.put(path, response)");
        expect(serviceWorker).toContain("cache.match(requestUrl.pathname)");
    });

    it("keeps route tiles separate, bounded and cache-first", () => {
        const serviceWorker = readFileSync(
            resolve(projectRoot, "src/service-worker.ts"),
            "utf8",
        );

        expect(serviceWorker).toContain("key !== PWA_LIVE_TILE_CACHE_NAME");
        expect(serviceWorker).toContain(
            '{ length: PWA_LIVE_TILE_DOWNLOAD_CONCURRENCY }',
        );
        expect(serviceWorker).toContain(
            'message.type === "CANCEL_PWA_LIVE_TILES"',
        );
        expect(serviceWorker).toContain(
            "cachedResponse ?? fetch(event.request)",
        );
        expect(PWA_LIVE_TILE_MIN_ZOOM).toBe(12);
        expect(PWA_LIVE_TILE_MAX_ZOOM).toBe(15);
    });

    it("keeps viewed online map resources in a separate bounded cache", () => {
        const serviceWorker = readFileSync(
            resolve(projectRoot, "src/service-worker.ts"),
            "utf8",
        );
        const livePage = readFileSync(
            resolve(projectRoot, "src/routes/live/+page.svelte"),
            "utf8",
        );

        expect(serviceWorker).toContain(
            "unmarkPwaLiveRuntimeMapUrl(requestUrl.toString())",
        );
        expect(serviceWorker).toContain(
            "key !== PWA_LIVE_RUNTIME_MAP_CACHE_NAME",
        );
        expect(serviceWorker).toContain("createRuntimeMapRequestOperation");
        expect(serviceWorker).toContain(
            "ASSET_PATHS.has(upstreamRequestUrl.pathname)",
        );
        expect(livePage).toContain("transformRequest: transformLiveMapRequest");
        expect(livePage).toContain("navigator.serviceWorker?.controller");
        expect(PWA_LIVE_RUNTIME_MAP_CACHE_NAME).toBe(
            "wanderer-live-runtime-map-v1",
        );
        expect(PWA_LIVE_RUNTIME_MAP_MAX_BYTES).toBe(100 * 1024 * 1024);
        expect(PWA_LIVE_RUNTIME_MAP_STORAGE_RESERVE).toBe(10 * 1024 * 1024);
    });

    it("preserves the full-height iOS standalone viewport behavior", () => {
        const appDocument = readFileSync(
            resolve(projectRoot, "src/app.html"),
            "utf8",
        );
        const livePage = readFileSync(
            resolve(projectRoot, "src/routes/live/+page.svelte"),
            "utf8",
        );

        expect(appDocument).toContain(
            'name="apple-mobile-web-app-status-bar-style" content="black"',
        );
        expect(appDocument).not.toContain("black-translucent");
        expect(livePage).toContain("position: fixed");
        expect(livePage).toContain("inset: 0");
        expect(livePage).toContain(
            'window.addEventListener("orientationchange"',
        );
        expect(livePage).toContain("window.visualViewport");
        expect(livePage).toContain(
            '{#key `${offlineMapMode}:${runtimeMapCacheEnabled}`}',
        );
        expect(livePage).toContain(
            "showStyleSwitcher={!offlineMapMode}",
        );
        expect(livePage).toContain("offlineMode={offlineMapMode}");
        expect(livePage).toContain(
            "offlineMapMode = nextOfflineMapMode",
        );
        expect(livePage).toContain("await tick()");
    });

    it("moves the completed tile status into the offline zoom button", () => {
        const livePage = readFileSync(
            resolve(projectRoot, "src/routes/live/+page.svelte"),
            "utf8",
        );

        expect(livePage).toContain('{#if tileStatus !== "ready"}');
        expect(livePage).toContain('preset.value === "farOffline"');
        expect(livePage).toContain("fa-spinner fa-spin");
        expect(livePage).toContain("fa-circle-check");
        expect(livePage).toContain("fa-triangle-exclamation");
        expect(livePage).toContain("fa-circle-exclamation");
        expect(livePage).toContain("aria-label={tileStatusIconLabel()}");
    });
});
