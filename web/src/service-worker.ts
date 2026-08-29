/// <reference lib="webworker" />

import { build, files, version } from "$service-worker";
import {
    PWA_LIVE_TILE_CACHE_NAME,
    PWA_LIVE_TILE_DOWNLOAD_CONCURRENCY,
    PWA_LIVE_TILE_ESTIMATED_BYTES,
    PWA_LIVE_TILE_MANIFEST_PATH,
    PWA_LIVE_TILE_MAX_BYTES,
    PWA_LIVE_TILE_MAX_TILES,
    PWA_LIVE_TILE_MAX_ZOOM,
    PWA_LIVE_TILE_MIN_ZOOM,
    PWA_LIVE_TILE_PROFILE_ID,
    PWA_LIVE_TILE_PROFILE_VERSION,
    PWA_LIVE_TILE_STORAGE_RESERVE,
    isPwaLiveTileUrl,
    pwaLiveTileResponseByteSize,
    type PwaLiveTileClientMessage,
    type PwaLiveTilePlan,
    type PwaLiveTileState,
    type PwaLiveTileStatus,
    type PwaLiveTileWorkerMessage,
} from "$lib/util/pwa_live_tiles";

const CACHE_NAME = `wanderer-cache-${version}`;
const LIVE_PATH = "/live";
const LIVE_DATA_PATH = "/live/__data.json";
const VERSION_PATH = "/_app/version.json";
const OFFLINE_RUNTIME_PATHS = new Set([
    LIVE_PATH,
    LIVE_DATA_PATH,
    VERSION_PATH,
]);
const ASSETS = [...build, ...files];
const ASSET_PATHS = new Set(
    ASSETS.map((asset) => new URL(asset, self.location.origin).pathname),
);
const LIVE_TILE_MANIFEST_URL = new URL(
    PWA_LIVE_TILE_MANIFEST_PATH,
    self.location.origin,
).toString();

interface ActiveTileDownload {
    routeFingerprint: string;
    controller: AbortController;
    cancelled: boolean;
    promise: Promise<void>;
}

let activeTileDownload: ActiveTileDownload | null = null;

function createTileState(
    plan: PwaLiveTilePlan,
    status: PwaLiveTileStatus,
    detail?: string,
): PwaLiveTileState {
    const now = new Date().toISOString();
    return {
        version: PWA_LIVE_TILE_PROFILE_VERSION,
        profileId: PWA_LIVE_TILE_PROFILE_ID,
        routeFingerprint: plan.routeFingerprint,
        trailId: plan.trailId,
        status,
        tileUrls: plan.tileUrls,
        tileSizes: {},
        includedZooms: plan.includedZooms,
        omittedZooms: plan.omittedZooms,
        totalTiles: plan.tileUrls.length,
        completedTiles: 0,
        completedBytes: 0,
        createdAt: now,
        updatedAt: now,
        ...(detail ? { detail } : {}),
    };
}

function isValidTilePlan(value: unknown): value is PwaLiveTilePlan {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const plan = value as Partial<PwaLiveTilePlan>;
    if (
        plan.version !== PWA_LIVE_TILE_PROFILE_VERSION ||
        plan.profileId !== PWA_LIVE_TILE_PROFILE_ID ||
        typeof plan.routeFingerprint !== "string" ||
        !/^[a-f0-9]{64}$/.test(plan.routeFingerprint) ||
        typeof plan.trailId !== "string" ||
        !plan.trailId ||
        !Array.isArray(plan.tileUrls) ||
        plan.tileUrls.length > PWA_LIVE_TILE_MAX_TILES ||
        new Set(plan.tileUrls).size !== plan.tileUrls.length ||
        !Array.isArray(plan.includedZooms) ||
        !Array.isArray(plan.omittedZooms) ||
        ![...plan.includedZooms, ...plan.omittedZooms].every(
            (zoom) =>
                Number.isInteger(zoom) &&
                zoom >= PWA_LIVE_TILE_MIN_ZOOM &&
                zoom <= PWA_LIVE_TILE_MAX_ZOOM,
        )
    ) {
        return false;
    }

    return plan.tileUrls.every((tileUrl) => {
        if (typeof tileUrl !== "string") {
            return false;
        }
        try {
            const url = new URL(tileUrl);
            if (!isPwaLiveTileUrl(url)) {
                return false;
            }
            const [, zoomPart, tileXPart, tileYPart] =
                url.pathname.split("/");
            const zoom = Number(zoomPart);
            const tileX = Number(tileXPart);
            const tileY = Number(tileYPart.replace(".png", ""));
            const tileCount = 2 ** zoom;
            return (
                Number.isInteger(zoom) &&
                zoom >= PWA_LIVE_TILE_MIN_ZOOM &&
                zoom <= PWA_LIVE_TILE_MAX_ZOOM &&
                Number.isInteger(tileX) &&
                tileX >= 0 &&
                tileX < tileCount &&
                Number.isInteger(tileY) &&
                tileY >= 0 &&
                tileY < tileCount
            );
        } catch {
            return false;
        }
    });
}

function isTileState(value: unknown): value is PwaLiveTileState {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const state = value as Partial<PwaLiveTileState>;
    return (
        state.version === PWA_LIVE_TILE_PROFILE_VERSION &&
        state.profileId === PWA_LIVE_TILE_PROFILE_ID &&
        typeof state.routeFingerprint === "string" &&
        typeof state.trailId === "string" &&
        [
            "preparing",
            "downloading",
            "ready",
            "partial",
            "cancelled",
            "storage-error",
            "rate-limited",
            "source-error",
            "too-large",
        ].includes(state.status ?? "") &&
        Array.isArray(state.tileUrls) &&
        state.tileUrls.length <= PWA_LIVE_TILE_MAX_TILES &&
        typeof state.tileSizes === "object" &&
        state.tileSizes !== null &&
        Array.isArray(state.includedZooms) &&
        Array.isArray(state.omittedZooms) &&
        typeof state.totalTiles === "number" &&
        typeof state.completedTiles === "number" &&
        typeof state.completedBytes === "number"
    );
}

async function readTileState(cache: Cache): Promise<PwaLiveTileState | null> {
    try {
        const response = await cache.match(LIVE_TILE_MANIFEST_URL);
        if (!response) {
            return null;
        }
        const value: unknown = await response.json();
        return isTileState(value) ? value : null;
    } catch {
        return null;
    }
}

async function writeTileState(
    cache: Cache,
    state: PwaLiveTileState,
): Promise<void> {
    state.updatedAt = new Date().toISOString();
    await cache.put(
        LIVE_TILE_MANIFEST_URL,
        new Response(JSON.stringify(state), {
            headers: { "content-type": "application/json" },
        }),
    );
}

async function broadcastTileState(state: PwaLiveTileState): Promise<void> {
    const message: PwaLiveTileWorkerMessage = {
        type: "PWA_LIVE_TILE_STATUS",
        state,
    };
    const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
    });
    for (const client of clients) {
        client.postMessage(message);
    }
}

async function persistAndBroadcastTileState(
    cache: Cache,
    state: PwaLiveTileState,
): Promise<void> {
    await writeTileState(cache, state);
    await broadcastTileState(state);
}

async function reconcileTileState(
    cache: Cache,
    state: PwaLiveTileState,
): Promise<void> {
    const reconciledSizes: Record<string, number> = {};
    const batchSize = 20;

    for (let offset = 0; offset < state.tileUrls.length; offset += batchSize) {
        const urls = state.tileUrls.slice(offset, offset + batchSize);
        const results = await Promise.all(
            urls.map(async (tileUrl) => {
                const response = await cache.match(tileUrl);
                if (!response) {
                    return null;
                }
                const storedSize = state.tileSizes[tileUrl];
                return [
                    tileUrl,
                    Number.isFinite(storedSize)
                        ? Math.max(0, storedSize)
                        : await pwaLiveTileResponseByteSize(response),
                ] as const;
            }),
        );
        for (const result of results) {
            if (result) {
                reconciledSizes[result[0]] = result[1];
            }
        }
    }

    state.tileSizes = reconciledSizes;
    state.completedTiles = Object.keys(reconciledSizes).length;
    state.completedBytes = Object.values(reconciledSizes).reduce(
        (sum, size) => sum + size,
        0,
    );
}

async function downloadTilePlan(
    job: ActiveTileDownload,
    plan: PwaLiveTilePlan,
    availableBytes: number | null,
    downloadAllowed: boolean,
): Promise<void> {
    let cache = await caches.open(PWA_LIVE_TILE_CACHE_NAME);
    const storedState = await readTileState(cache);
    const canResume =
        storedState?.routeFingerprint === plan.routeFingerprint &&
        storedState.profileId === plan.profileId;

    let state: PwaLiveTileState;
    if (canResume && storedState) {
        state = {
            ...storedState,
            trailId: plan.trailId,
            tileUrls: plan.tileUrls,
            includedZooms: plan.includedZooms,
            omittedZooms: plan.omittedZooms,
            totalTiles: plan.tileUrls.length,
        };
    } else {
        await caches.delete(PWA_LIVE_TILE_CACHE_NAME);
        cache = await caches.open(PWA_LIVE_TILE_CACHE_NAME);
        state = createTileState(plan, "preparing");
    }

    await reconcileTileState(cache, state);

    if (plan.tileUrls.length === 0) {
        state.status = "too-large";
        state.detail =
            "Die Route überschreitet bereits in Zoomstufe 12 das Tile-Limit.";
        await persistAndBroadcastTileState(cache, state);
        return;
    }

    if (state.completedTiles === state.totalTiles) {
        state.status = "ready";
        state.detail = plan.limited
            ? "Höhere Zoomstufen wurden zugunsten der vollständigen Route ausgelassen."
            : undefined;
        await persistAndBroadcastTileState(cache, state);
        return;
    }

    if (!downloadAllowed) {
        state.status = "partial";
        state.detail = "Der Download wird beim nächsten Online-Start fortgesetzt.";
        await persistAndBroadcastTileState(cache, state);
        return;
    }

    const missingTileCount = state.totalTiles - state.completedTiles;
    const estimatedRequiredBytes = Math.min(
        PWA_LIVE_TILE_MAX_BYTES - state.completedBytes,
        missingTileCount * PWA_LIVE_TILE_ESTIMATED_BYTES,
    );
    if (
        availableBytes !== null &&
        availableBytes < estimatedRequiredBytes + PWA_LIVE_TILE_STORAGE_RESERVE
    ) {
        state.status = "storage-error";
        state.detail = "Für die Offlinekarte ist nicht genügend Speicher frei.";
        await persistAndBroadcastTileState(cache, state);
        return;
    }

    state.status = "downloading";
    state.detail = undefined;
    await persistAndBroadcastTileState(cache, state);

    const missingTileUrls = state.tileUrls.filter(
        (tileUrl) => !(tileUrl in state.tileSizes),
    );
    let nextTileIndex = 0;
    let terminalStatus: PwaLiveTileStatus | null = null;
    let terminalDetail: string | undefined;
    let lastPersistedAt = Date.now();
    let commitQueue = Promise.resolve();

    const stopDownload = (
        status: PwaLiveTileStatus,
        detail: string,
    ): void => {
        if (terminalStatus) {
            return;
        }
        terminalStatus = status;
        terminalDetail = detail;
        job.controller.abort();
    };

    const persistProgress = async (force = false): Promise<void> => {
        const now = Date.now();
        if (
            !force &&
            state.completedTiles % 10 !== 0 &&
            now - lastPersistedAt < 750
        ) {
            return;
        }
        lastPersistedAt = now;
        await persistAndBroadcastTileState(cache, state);
    };

    const commitResponse = (
        tileUrl: string,
        response: Response,
        byteSize: number,
    ): Promise<void> => {
        commitQueue = commitQueue.then(async () => {
            if (terminalStatus || job.controller.signal.aborted) {
                return;
            }
            if (state.completedBytes + byteSize > PWA_LIVE_TILE_MAX_BYTES) {
                stopDownload(
                    "partial",
                    "Die Offlinekarte hat die Grenze von 60 MB erreicht.",
                );
                return;
            }

            try {
                await cache.put(tileUrl, response);
            } catch (error) {
                const detail =
                    error instanceof DOMException &&
                    error.name === "QuotaExceededError"
                        ? "Der Browser hat nicht genügend Speicher für weitere Tiles."
                        : "Ein Tile konnte nicht lokal gespeichert werden.";
                stopDownload("storage-error", detail);
                return;
            }

            state.tileSizes[tileUrl] = byteSize;
            state.completedTiles += 1;
            state.completedBytes += byteSize;
            await persistProgress();
        });
        return commitQueue;
    };

    const downloadNextTiles = async (): Promise<void> => {
        while (!job.controller.signal.aborted) {
            const tileIndex = nextTileIndex;
            nextTileIndex += 1;
            if (tileIndex >= missingTileUrls.length) {
                return;
            }

            const tileUrl = missingTileUrls[tileIndex];
            let response: Response;
            try {
                response = await fetch(tileUrl, {
                    cache: "no-store",
                    mode: "cors",
                    signal: job.controller.signal,
                });
            } catch {
                if (!job.controller.signal.aborted) {
                    stopDownload(
                        "partial",
                        "Die Verbindung wurde unterbrochen. Der Download kann später fortgesetzt werden.",
                    );
                }
                return;
            }

            if (response.status === 429) {
                stopDownload(
                    "rate-limited",
                    "OpenTopoMap hat weitere Anfragen vorübergehend begrenzt.",
                );
                return;
            }
            if (!response.ok) {
                stopDownload(
                    "source-error",
                    `OpenTopoMap hat mit HTTP ${response.status} geantwortet.`,
                );
                return;
            }
            const contentType = response.headers.get("content-type") ?? "";
            if (!contentType.startsWith("image/")) {
                stopDownload(
                    "source-error",
                    "OpenTopoMap hat keine gültige Kartenkachel geliefert.",
                );
                return;
            }

            const byteSize = await pwaLiveTileResponseByteSize(response);
            await commitResponse(tileUrl, response, byteSize);
        }
    };

    await Promise.all(
        Array.from(
            { length: PWA_LIVE_TILE_DOWNLOAD_CONCURRENCY },
            () => downloadNextTiles(),
        ),
    );
    await commitQueue;

    if (job.cancelled) {
        state.status = "cancelled";
        state.detail = "Der Download wurde abgebrochen. Vorhandene Tiles bleiben erhalten.";
    } else if (terminalStatus) {
        state.status = terminalStatus;
        state.detail = terminalDetail;
    } else if (state.completedTiles === state.totalTiles) {
        state.status = "ready";
        state.detail = plan.limited
            ? "Höhere Zoomstufen wurden zugunsten der vollständigen Route ausgelassen."
            : undefined;
    } else {
        state.status = "partial";
        state.detail = "Der Download kann später fortgesetzt werden.";
    }

    await persistProgress(true);
}

async function prepareTileDownload(
    plan: PwaLiveTilePlan,
    availableBytes: number | null,
    downloadAllowed: boolean,
): Promise<void> {
    if (activeTileDownload) {
        if (activeTileDownload.routeFingerprint === plan.routeFingerprint) {
            const cache = await caches.open(PWA_LIVE_TILE_CACHE_NAME);
            const state = await readTileState(cache);
            if (state) {
                await broadcastTileState(state);
            }
            return;
        }

        activeTileDownload.controller.abort();
        await activeTileDownload.promise;
    }

    const job: ActiveTileDownload = {
        routeFingerprint: plan.routeFingerprint,
        controller: new AbortController(),
        cancelled: false,
        promise: Promise.resolve(),
    };
    job.promise = downloadTilePlan(job, plan, availableBytes, downloadAllowed)
        .catch(async (error) => {
            console.error("PWA live tile cache failed", error);
            const state = createTileState(
                plan,
                "storage-error",
                "Die Offlinekarte konnte nicht lokal vorbereitet werden.",
            );
            await broadcastTileState(state);
        })
        .finally(() => {
            if (activeTileDownload === job) {
                activeTileDownload = null;
            }
        });
    activeTileDownload = job;
    await job.promise;
}

async function cancelTileDownload(routeFingerprint: string): Promise<void> {
    const job = activeTileDownload;
    if (!job || job.routeFingerprint !== routeFingerprint) {
        return;
    }
    job.cancelled = true;
    job.controller.abort();
    await job.promise;
}

self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            await cache.addAll(ASSETS);

            await Promise.all(
                [...OFFLINE_RUNTIME_PATHS].map(async (path) => {
                    try {
                        const response = await fetch(path, {
                            credentials: "same-origin",
                            headers: {
                                accept: path.endsWith(".json")
                                    ? "application/json"
                                    : "text/html",
                            },
                        });
                        if (
                            response.ok &&
                            new URL(response.url).pathname === path
                        ) {
                            await cache.put(path, response);
                        }
                    } catch {
                        // The live resources are warmed again when live mode starts.
                    }
                }),
            );
        })(),
    );

    void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter(
                        (key) =>
                            key !== CACHE_NAME &&
                            key !== PWA_LIVE_TILE_CACHE_NAME,
                    )
                    .map((key) => caches.delete(key)),
            ),
        ),
    );

    void self.clients.claim();
});

self.addEventListener("message", (event) => {
    const message = event.data as Partial<PwaLiveTileClientMessage>;
    if (message.type === "PREPARE_PWA_LIVE_TILES") {
        if (!isValidTilePlan(message.plan)) {
            return;
        }
        const availableBytes =
            typeof message.availableBytes === "number" &&
            Number.isFinite(message.availableBytes)
                ? Math.max(0, message.availableBytes)
                : null;
        event.waitUntil(
            prepareTileDownload(
                message.plan,
                availableBytes,
                message.downloadAllowed === true,
            ),
        );
        return;
    }

    if (
        message.type === "CANCEL_PWA_LIVE_TILES" &&
        typeof message.routeFingerprint === "string"
    ) {
        event.waitUntil(cancelTileDownload(message.routeFingerprint));
    }
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") {
        return;
    }

    const requestUrl = new URL(event.request.url);
    if (isPwaLiveTileUrl(requestUrl)) {
        event.respondWith(
            (async () => {
                const tileCache = await caches.open(PWA_LIVE_TILE_CACHE_NAME);
                const cachedResponse = await tileCache.match(event.request);
                return cachedResponse ?? fetch(event.request);
            })(),
        );
        return;
    }

    if (
        requestUrl.origin === self.location.origin &&
        OFFLINE_RUNTIME_PATHS.has(requestUrl.pathname)
    ) {
        event.respondWith(
            (async () => {
                const cache = await caches.open(CACHE_NAME);
                const cachedResponse = await cache.match(requestUrl.pathname);
                if (cachedResponse) {
                    return cachedResponse;
                }

                const response = await fetch(event.request);
                if (
                    response.ok &&
                    new URL(response.url).pathname === requestUrl.pathname
                ) {
                    await cache.put(requestUrl.pathname, response.clone());
                }
                return response;
            })(),
        );
        return;
    }

    if (
        requestUrl.origin !== self.location.origin ||
        !ASSET_PATHS.has(requestUrl.pathname)
    ) {
        return;
    }

    event.respondWith(
        caches
            .match(event.request, { ignoreSearch: true })
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(event.request).then((response) => {
                    if (response.ok) {
                        const responseClone = response.clone();
                        void caches
                            .open(CACHE_NAME)
                            .then((cache) =>
                                cache.put(event.request, responseClone),
                            );
                    }

                    return response;
                });
            }),
    );
});
