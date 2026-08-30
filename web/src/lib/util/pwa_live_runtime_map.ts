export const PWA_LIVE_RUNTIME_MAP_CACHE_VERSION = 1;
export const PWA_LIVE_RUNTIME_MAP_CACHE_NAME =
    "wanderer-live-runtime-map-v1";
export const PWA_LIVE_RUNTIME_MAP_MANIFEST_PATH =
    "/__wanderer-pwa/live-runtime-map-manifest-v1";
export const PWA_LIVE_RUNTIME_MAP_REQUEST_PARAM =
    "__wanderer_live_runtime_map";
export const PWA_LIVE_RUNTIME_MAP_MAX_BYTES = 100 * 1024 * 1024;
export const PWA_LIVE_RUNTIME_MAP_STORAGE_RESERVE = 10 * 1024 * 1024;
export const PWA_LIVE_RUNTIME_MAP_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PWA_LIVE_RUNTIME_MAP_ESTIMATED_BYTES = 50 * 1024;

export interface PwaLiveRuntimeMapCacheEntry {
    url: string;
    size: number;
    cachedAt: number;
    expiresAt: number;
    lastAccessedAt: number;
}

export interface PwaLiveRuntimeMapCacheManifest {
    version: typeof PWA_LIVE_RUNTIME_MAP_CACHE_VERSION;
    entries: Record<string, PwaLiveRuntimeMapCacheEntry>;
}

export interface PwaLiveRuntimeMapCachePolicy {
    cacheable: boolean;
    expiresAt: number;
}

function parseCacheControl(value: string | null): Map<string, string | true> {
    const directives = new Map<string, string | true>();
    for (const part of value?.split(",") ?? []) {
        const [rawName, ...rawValue] = part.trim().split("=");
        const name = rawName?.toLowerCase();
        if (!name) {
            continue;
        }
        const valuePart = rawValue.join("=").trim();
        directives.set(
            name,
            valuePart
                ? valuePart.replace(/^"|"$/g, "")
                : true,
        );
    }
    return directives;
}

function secondsDirective(
    directives: Map<string, string | true>,
    name: string,
): number | null {
    const value = directives.get(name);
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
        return null;
    }
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : null;
}

export function markPwaLiveRuntimeMapUrl(
    value: string,
    baseUrl: string,
): string {
    try {
        const url = new URL(value, baseUrl);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return value;
        }
        url.searchParams.set(PWA_LIVE_RUNTIME_MAP_REQUEST_PARAM, "1");
        return url.toString();
    } catch {
        return value;
    }
}

export function unmarkPwaLiveRuntimeMapUrl(value: string): string | null {
    try {
        const url = new URL(value);
        if (url.searchParams.get(PWA_LIVE_RUNTIME_MAP_REQUEST_PARAM) !== "1") {
            return null;
        }
        url.searchParams.delete(PWA_LIVE_RUNTIME_MAP_REQUEST_PARAM);
        return url.toString();
    } catch {
        return null;
    }
}

export function getPwaLiveRuntimeMapCachePolicy(
    headers: Pick<Headers, "get">,
    now = Date.now(),
): PwaLiveRuntimeMapCachePolicy {
    const directives = parseCacheControl(headers.get("cache-control"));
    if (directives.has("no-store")) {
        return { cacheable: false, expiresAt: now };
    }

    if (directives.has("no-cache")) {
        return { cacheable: true, expiresAt: now };
    }

    const maxAge = secondsDirective(directives, "max-age");
    if (maxAge !== null) {
        const age = secondsDirective(
            new Map([["age", headers.get("age") ?? ""]]),
            "age",
        );
        return {
            cacheable: true,
            expiresAt: now + Math.max(0, maxAge - (age ?? 0)) * 1000,
        };
    }

    const expires = headers.get("expires");
    if (expires) {
        const expiresAt = Date.parse(expires);
        if (Number.isFinite(expiresAt)) {
            return { cacheable: true, expiresAt: Math.max(now, expiresAt) };
        }
    }

    return {
        cacheable: true,
        expiresAt: now + PWA_LIVE_RUNTIME_MAP_DEFAULT_TTL_MS,
    };
}

export async function pwaLiveRuntimeMapResponseByteSize(
    response: Response,
): Promise<number> {
    const rawContentLength = response.headers.get("content-length");
    if (rawContentLength !== null) {
        const contentLength = Number(rawContentLength);
        if (Number.isFinite(contentLength) && contentLength > 0) {
            return contentLength;
        }
    }

    try {
        const byteSize = (await response.clone().blob()).size;
        if (byteSize > 0) {
            return byteSize;
        }
    } catch {
        // Opaque responses do not expose their body size.
    }

    return PWA_LIVE_RUNTIME_MAP_ESTIMATED_BYTES;
}

export function createEmptyPwaLiveRuntimeMapManifest(): PwaLiveRuntimeMapCacheManifest {
    return {
        version: PWA_LIVE_RUNTIME_MAP_CACHE_VERSION,
        entries: {},
    };
}

export function calculatePwaLiveRuntimeMapByteLimit(
    retainedBytes: number,
    quota: number | undefined,
    usage: number | undefined,
): number {
    if (
        typeof quota !== "number" ||
        !Number.isFinite(quota) ||
        typeof usage !== "number" ||
        !Number.isFinite(usage)
    ) {
        return PWA_LIVE_RUNTIME_MAP_MAX_BYTES;
    }

    return Math.min(
        PWA_LIVE_RUNTIME_MAP_MAX_BYTES,
        Math.max(
            0,
            retainedBytes +
                quota -
                usage -
                PWA_LIVE_RUNTIME_MAP_STORAGE_RESERVE,
        ),
    );
}

export function selectPwaLiveRuntimeMapEvictions(
    entries: Record<string, PwaLiveRuntimeMapCacheEntry>,
    incomingUrl: string,
    incomingSize: number,
    byteLimit: number,
    now = Date.now(),
): string[] {
    const candidates = Object.values(entries)
        .filter((entry) => entry.url !== incomingUrl)
        .sort((left, right) => {
            const leftExpired = left.expiresAt <= now;
            const rightExpired = right.expiresAt <= now;
            if (leftExpired !== rightExpired) {
                return leftExpired ? -1 : 1;
            }
            return left.lastAccessedAt - right.lastAccessedAt;
        });
    let retainedBytes = candidates.reduce(
        (total, entry) => total + entry.size,
        0,
    );
    const evictions: string[] = [];

    for (const entry of candidates) {
        if (
            entry.expiresAt > now &&
            retainedBytes + incomingSize <= byteLimit
        ) {
            break;
        }
        evictions.push(entry.url);
        retainedBytes -= entry.size;
    }

    return evictions;
}

export function isPwaLiveRuntimeMapCacheManifest(
    value: unknown,
): value is PwaLiveRuntimeMapCacheManifest {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const manifest = value as Partial<PwaLiveRuntimeMapCacheManifest>;
    if (
        manifest.version !== PWA_LIVE_RUNTIME_MAP_CACHE_VERSION ||
        typeof manifest.entries !== "object" ||
        manifest.entries === null
    ) {
        return false;
    }

    return Object.entries(manifest.entries).every(([url, entry]) => {
        if (typeof entry !== "object" || entry === null) {
            return false;
        }
        const candidate = entry as Partial<PwaLiveRuntimeMapCacheEntry>;
        return (
            candidate.url === url &&
            Number.isFinite(candidate.size) &&
            (candidate.size ?? -1) >= 0 &&
            Number.isFinite(candidate.cachedAt) &&
            Number.isFinite(candidate.expiresAt) &&
            Number.isFinite(candidate.lastAccessedAt)
        );
    });
}
