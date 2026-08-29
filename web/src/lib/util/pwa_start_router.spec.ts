import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    PWA_LIVE_PATH,
    PWA_LIVE_DATA_PATH,
    PWA_LIVE_ROUTE_STORAGE_KEY,
    PWA_START_PATH,
} from "./pwa_live_mode";

const projectRoot = resolve(import.meta.dirname, "../../..");

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
        expect(startDocument).toContain(`location.replace("${PWA_LIVE_PATH}")`);
        expect(startDocument).toContain("navigator.onLine");
        expect(startDocument).toContain("Keine Offline-Route aktiv");
    });

    it("keeps the live navigation shell in the versioned service-worker cache", () => {
        const serviceWorker = readFileSync(
            resolve(projectRoot, "src/service-worker.ts"),
            "utf8",
        );

        expect(serviceWorker).toContain(`const LIVE_PATH = '${PWA_LIVE_PATH}'`);
        expect(serviceWorker).toContain(
            `const LIVE_DATA_PATH = '${PWA_LIVE_DATA_PATH}'`,
        );
        expect(serviceWorker).toContain("cache.put(path, response)");
        expect(serviceWorker).toContain("cache.match(requestUrl.pathname)");
    });
});
