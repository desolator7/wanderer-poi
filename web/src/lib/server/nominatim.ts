import { version } from "$app/environment";
import { resolveBaseUrl } from "$lib/server/url";
import type { RequestEvent } from "@sveltejs/kit";

const NOMINATIM_RATE_LIMIT_MS = 1000;
const NOMINATIM_MAX_RETRIES = 2;
const NOMINATIM_REVERSE_CACHE_MAX_ENTRIES = 1000;
const NOMINATIM_REVERSE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let lastNominatimCall = 0;
const reverseCache = new Map<string, { body: string; status: number; headers: [string, string][]; expiresAt: number }>();

function getNominatimBaseUrl(): string {
    return resolveBaseUrl("NOMINATIM_URL", "https://nominatim.openstreetmap.org");
}

function needsRateLimiting(baseUrl: string): boolean {
    return baseUrl.includes("nominatim.openstreetmap.org");
}

const waitTimer = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function nominatimRateLimiter(baseUrl: string) {
    if (!needsRateLimiting(baseUrl)) {
        return;
    }

    const elapsedTimeMs = Date.now() - lastNominatimCall;
    const waitTime = NOMINATIM_RATE_LIMIT_MS - elapsedTimeMs;
    if (waitTime > 0) {
        await waitTimer(waitTime);
    }

    lastNominatimCall = Date.now();
}

export async function fetchNominatim(event: RequestEvent, path: string, params: URLSearchParams): Promise<Response> {
    const baseUrl = getNominatimBaseUrl();
    const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    const cleanPath = path.replace(/^\/+/, "");
    const url = new URL(cleanPath, base);
    const query = params.toString();
    if (query.length) {
        url.search = query;
    }
    const cacheKey = cleanPath === "reverse" ? getReverseCacheKey(params) : null;
    const cachedResponse = cacheKey ? reverseCache.get(cacheKey) : null;

    if (cachedResponse && cachedResponse.expiresAt > Date.now()) {
        return new Response(cachedResponse.body, {
            status: cachedResponse.status,
            headers: new Headers(cachedResponse.headers),
        });
    }

    let attempt = 0;

    while (true) {
        await nominatimRateLimiter(baseUrl);

        try {
            const response = await event.fetch(url.toString(), {
                method: "GET",
                headers: {
                    "User-Agent": `wanderer/${version}`,
                },
            });
            if (!cacheKey || !response.ok) {
                return response;
            }

            const body = await response.text();
            if (reverseCache.size >= NOMINATIM_REVERSE_CACHE_MAX_ENTRIES) {
                reverseCache.clear();
            }
            reverseCache.set(cacheKey, {
                body,
                status: response.status,
                headers: [...response.headers.entries()],
                expiresAt: Date.now() + NOMINATIM_REVERSE_CACHE_TTL_MS,
            });

            return new Response(body, {
                status: response.status,
                headers: response.headers,
            });
        } catch (error) {
            if (attempt < NOMINATIM_MAX_RETRIES) {
                attempt++;
                continue;
            }
            throw new Error(`Nominatim fetch failed for ${url.toString()}`, { cause: error });
        }
    }
}

function getReverseCacheKey(params: URLSearchParams) {
    const lat = Number(params.get("lat"));
    const lon = Number(params.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
    }

    return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}
