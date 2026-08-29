import type { StyleSpecification } from "maplibre-gl";

export const PWA_LIVE_TILE_PROFILE_VERSION = 1;
export const PWA_LIVE_TILE_PROFILE_ID = "opentopomap-route-v1";
export const PWA_LIVE_TILE_CACHE_NAME = "wanderer-live-tiles-v1";
export const PWA_LIVE_TILE_MANIFEST_PATH =
    "/__wanderer-pwa/live-tile-manifest-v1";
export const PWA_LIVE_TILE_URL_TEMPLATE =
    "https://tile.opentopomap.org/{z}/{x}/{y}.png";
export const PWA_LIVE_TILE_MIN_ZOOM = 12;
export const PWA_LIVE_TILE_MAX_ZOOM = 15;
export const PWA_LIVE_TILE_CORRIDOR_METERS = 500;
export const PWA_LIVE_TILE_MAX_TILES = 1_200;
export const PWA_LIVE_TILE_MAX_BYTES = 60 * 1024 * 1024;
export const PWA_LIVE_TILE_DOWNLOAD_CONCURRENCY = 2;
export const PWA_LIVE_TILE_ESTIMATED_BYTES = 50 * 1024;
export const PWA_LIVE_TILE_STORAGE_RESERVE = 10 * 1024 * 1024;

const EARTH_CIRCUMFERENCE_METERS = 40_075_016.686;
const MAX_MERCATOR_LATITUDE = 85.05112878;

export type PwaLiveCoordinate = readonly [longitude: number, latitude: number];

export type PwaLiveTileStatus =
    | "preparing"
    | "downloading"
    | "ready"
    | "partial"
    | "cancelled"
    | "storage-error"
    | "rate-limited"
    | "source-error"
    | "too-large";

export interface PwaLiveTilePlan {
    version: typeof PWA_LIVE_TILE_PROFILE_VERSION;
    profileId: typeof PWA_LIVE_TILE_PROFILE_ID;
    routeFingerprint: string;
    trailId: string;
    tileUrls: string[];
    includedZooms: number[];
    omittedZooms: number[];
    limited: boolean;
}

export interface PwaLiveTileState {
    version: typeof PWA_LIVE_TILE_PROFILE_VERSION;
    profileId: typeof PWA_LIVE_TILE_PROFILE_ID;
    routeFingerprint: string;
    trailId: string;
    status: PwaLiveTileStatus;
    tileUrls: string[];
    tileSizes: Record<string, number>;
    includedZooms: number[];
    omittedZooms: number[];
    totalTiles: number;
    completedTiles: number;
    completedBytes: number;
    createdAt: string;
    updatedAt: string;
    detail?: string;
}

export type PwaLiveTileClientMessage =
    | {
          type: "PREPARE_PWA_LIVE_TILES";
          plan: PwaLiveTilePlan;
          availableBytes: number | null;
          downloadAllowed: boolean;
      }
    | {
          type: "CANCEL_PWA_LIVE_TILES";
          routeFingerprint: string;
      };

export interface PwaLiveTileWorkerMessage {
    type: "PWA_LIVE_TILE_STATUS";
    state: PwaLiveTileState;
}

interface TilePlanOptions {
    minZoom?: number;
    maxZoom?: number;
    corridorMeters?: number;
    maxTiles?: number;
}

interface GpxLike {
    trk?: Array<{
        trkseg?: Array<{
            trkpt?: Array<{
                $: { lat?: number; lon?: number };
            }>;
        }>;
    }>;
}

function clampLatitude(latitude: number): number {
    return Math.max(
        -MAX_MERCATOR_LATITUDE,
        Math.min(MAX_MERCATOR_LATITUDE, latitude),
    );
}

function normalizeLongitude(longitude: number): number {
    return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function longitudeToTileX(longitude: number, zoom: number): number {
    return ((normalizeLongitude(longitude) + 180) / 360) * 2 ** zoom;
}

function latitudeToTileY(latitude: number, zoom: number): number {
    const latitudeRadians = (clampLatitude(latitude) * Math.PI) / 180;
    return (
        ((1 -
            Math.asinh(Math.tan(latitudeRadians)) / Math.PI) /
            2) *
        2 ** zoom
    );
}

function normalizeTileX(tileX: number, zoom: number): number {
    const tileCount = 2 ** zoom;
    return ((tileX % tileCount) + tileCount) % tileCount;
}

function distanceMeters(
    [longitudeA, latitudeA]: PwaLiveCoordinate,
    [longitudeB, latitudeB]: PwaLiveCoordinate,
): number {
    const earthRadius = 6_371_008.8;
    const latitudeARadians = (latitudeA * Math.PI) / 180;
    const latitudeBRadians = (latitudeB * Math.PI) / 180;
    const latitudeDelta = ((latitudeB - latitudeA) * Math.PI) / 180;
    const longitudeDelta =
        ((normalizeLongitude(longitudeB - longitudeA) * Math.PI) / 180);
    const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(latitudeARadians) *
            Math.cos(latitudeBRadians) *
            Math.sin(longitudeDelta / 2) ** 2;
    return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function interpolateCoordinate(
    [longitudeA, latitudeA]: PwaLiveCoordinate,
    [longitudeB, latitudeB]: PwaLiveCoordinate,
    progress: number,
): PwaLiveCoordinate {
    let longitudeDelta = longitudeB - longitudeA;
    if (longitudeDelta > 180) {
        longitudeDelta -= 360;
    } else if (longitudeDelta < -180) {
        longitudeDelta += 360;
    }

    return [
        normalizeLongitude(longitudeA + longitudeDelta * progress),
        latitudeA + (latitudeB - latitudeA) * progress,
    ];
}

function addBufferedCoordinateTiles(
    tileKeys: Set<string>,
    [longitude, latitude]: PwaLiveCoordinate,
    zoom: number,
    corridorMeters: number,
): void {
    const tileCount = 2 ** zoom;
    const latitudeRadians = (clampLatitude(latitude) * Math.PI) / 180;
    const metersPerTile = Math.max(
        1,
        (EARTH_CIRCUMFERENCE_METERS * Math.cos(latitudeRadians)) /
            tileCount,
    );
    const tileRadius = corridorMeters / metersPerTile;
    const centerX = longitudeToTileX(longitude, zoom);
    const centerY = latitudeToTileY(latitude, zoom);
    const minX = Math.floor(centerX - tileRadius);
    const maxX = Math.floor(centerX + tileRadius);
    const minY = Math.max(0, Math.floor(centerY - tileRadius));
    const maxY = Math.min(
        tileCount - 1,
        Math.floor(centerY + tileRadius),
    );

    for (let tileX = minX; tileX <= maxX; tileX += 1) {
        for (let tileY = minY; tileY <= maxY; tileY += 1) {
            tileKeys.add(`${zoom}/${normalizeTileX(tileX, zoom)}/${tileY}`);
        }
    }
}

function buildZoomTileKeys(
    segments: PwaLiveCoordinate[][],
    zoom: number,
    corridorMeters: number,
    tileLimit: number,
): Set<string> {
    const tileKeys = new Set<string>();
    const sampleSpacing = Math.max(50, corridorMeters / 2);

    for (const segment of segments) {
        if (segment.length === 1) {
            addBufferedCoordinateTiles(
                tileKeys,
                segment[0],
                zoom,
                corridorMeters,
            );
            if (tileKeys.size > tileLimit) {
                return tileKeys;
            }
            continue;
        }

        for (let index = 1; index < segment.length; index += 1) {
            const start = segment[index - 1];
            const end = segment[index];
            const sampleCount = Math.max(
                1,
                Math.ceil(distanceMeters(start, end) / sampleSpacing),
            );

            for (let sample = 0; sample <= sampleCount; sample += 1) {
                addBufferedCoordinateTiles(
                    tileKeys,
                    interpolateCoordinate(start, end, sample / sampleCount),
                    zoom,
                    corridorMeters,
                );
                if (tileKeys.size > tileLimit) {
                    return tileKeys;
                }
            }
        }
    }

    return tileKeys;
}

function tileKeyToUrl(tileKey: string): string {
    const [zoom, tileX, tileY] = tileKey.split("/");
    return PWA_LIVE_TILE_URL_TEMPLATE.replace("{z}", zoom)
        .replace("{x}", tileX)
        .replace("{y}", tileY);
}

export function extractPwaLiveCoordinateSegments(
    gpx: GpxLike,
): PwaLiveCoordinate[][] {
    const segments: PwaLiveCoordinate[][] = [];

    for (const track of gpx.trk ?? []) {
        for (const segment of track.trkseg ?? []) {
            const coordinates = (segment.trkpt ?? [])
                .map((point): PwaLiveCoordinate => [
                    point.$.lon ?? Number.NaN,
                    point.$.lat ?? Number.NaN,
                ])
                .filter(
                    ([longitude, latitude]) =>
                        Number.isFinite(longitude) &&
                        Number.isFinite(latitude) &&
                        latitude >= -90 &&
                        latitude <= 90,
                );
            if (coordinates.length > 0) {
                segments.push(coordinates);
            }
        }
    }

    return segments;
}

export function buildPwaLiveTilePlan(
    trailId: string,
    routeFingerprint: string,
    segments: PwaLiveCoordinate[][],
    options: TilePlanOptions = {},
): PwaLiveTilePlan {
    const minZoom = options.minZoom ?? PWA_LIVE_TILE_MIN_ZOOM;
    const maxZoom = options.maxZoom ?? PWA_LIVE_TILE_MAX_ZOOM;
    const corridorMeters =
        options.corridorMeters ?? PWA_LIVE_TILE_CORRIDOR_METERS;
    const maxTiles = options.maxTiles ?? PWA_LIVE_TILE_MAX_TILES;
    const tileUrls: string[] = [];
    const includedZooms: number[] = [];
    const omittedZooms: number[] = [];

    for (let zoom = minZoom; zoom <= maxZoom; zoom += 1) {
        const zoomTileUrls = [...buildZoomTileKeys(
            segments,
            zoom,
            corridorMeters,
            maxTiles - tileUrls.length,
        )].map(tileKeyToUrl);

        if (tileUrls.length + zoomTileUrls.length > maxTiles) {
            for (
                let omittedZoom = zoom;
                omittedZoom <= maxZoom;
                omittedZoom += 1
            ) {
                omittedZooms.push(omittedZoom);
            }
            break;
        }

        tileUrls.push(...zoomTileUrls);
        includedZooms.push(zoom);
    }

    return {
        version: PWA_LIVE_TILE_PROFILE_VERSION,
        profileId: PWA_LIVE_TILE_PROFILE_ID,
        routeFingerprint,
        trailId,
        tileUrls,
        includedZooms,
        omittedZooms,
        limited: omittedZooms.length > 0,
    };
}

export async function createPwaLiveRouteFingerprint(
    gpxData: string,
    targetCrypto: Pick<Crypto, "subtle"> = crypto,
): Promise<string> {
    const payload = new TextEncoder().encode(
        `${PWA_LIVE_TILE_PROFILE_ID}\n${gpxData.trim()}`,
    );
    const digest = await targetCrypto.subtle.digest("SHA-256", payload);
    return [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
}

export function isPwaLiveTileUrl(url: URL): boolean {
    return (
        url.origin === "https://tile.opentopomap.org" &&
        url.search === "" &&
        /^\/\d+\/\d+\/\d+\.png$/.test(url.pathname)
    );
}

export async function pwaLiveTileResponseByteSize(
    response: Response,
): Promise<number> {
    const rawContentLength = response.headers.get("content-length");
    if (rawContentLength !== null) {
        const contentLength = Number(rawContentLength);
        if (Number.isFinite(contentLength) && contentLength >= 0) {
            return contentLength;
        }
    }
    return (await response.clone().blob()).size;
}

export function createPwaLiveMapStyle(): StyleSpecification {
    return {
        version: 8,
        sources: {
            liveOpenTopoMap: {
                type: "raster",
                tiles: [PWA_LIVE_TILE_URL_TEMPLATE],
                tileSize: 256,
                minzoom: PWA_LIVE_TILE_MIN_ZOOM,
                maxzoom: PWA_LIVE_TILE_MAX_ZOOM,
                attribution:
                    '&copy; <a href="https://www.opentopomap.org" target="_blank">OpenTopoMap</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
            },
        },
        layers: [
            {
                id: "live-offline-background",
                type: "background",
                paint: {
                    "background-color": "#d9e2d0",
                },
            },
            {
                id: "live-open-topo-map",
                type: "raster",
                source: "liveOpenTopoMap",
            },
        ],
    };
}

export function isPwaLiveTileWorkerMessage(
    value: unknown,
): value is PwaLiveTileWorkerMessage {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const message = value as Partial<PwaLiveTileWorkerMessage>;
    return (
        message.type === "PWA_LIVE_TILE_STATUS" &&
        typeof message.state === "object" &&
        message.state !== null &&
        message.state.version === PWA_LIVE_TILE_PROFILE_VERSION &&
        message.state.profileId === PWA_LIVE_TILE_PROFILE_ID &&
        typeof message.state.routeFingerprint === "string"
    );
}

export async function getPwaLiveTileAvailableBytes(
    storageManager: StorageManager | undefined =
        typeof navigator === "undefined" ? undefined : navigator.storage,
): Promise<number | null> {
    if (!storageManager?.estimate) {
        return null;
    }

    try {
        await storageManager.persist?.();
        const estimate = await storageManager.estimate();
        if (
            typeof estimate.quota !== "number" ||
            typeof estimate.usage !== "number"
        ) {
            return null;
        }
        return Math.max(0, estimate.quota - estimate.usage);
    } catch {
        return null;
    }
}
