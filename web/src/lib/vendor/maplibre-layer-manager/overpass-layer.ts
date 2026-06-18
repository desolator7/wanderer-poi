/**
 * Component adapted from: https://github.com/gpxstudio/gpx.studio/blob/main/website/src/lib/components/layer-control/OverpassLayer.ts
 * Original author: @vcoppe
 * License: MIT
 */

import { createOverpassPopup, type OverpassPopupAction } from "$lib/util/maplibre_util";
import * as M from "maplibre-gl";
import { type LngLatBounds, type MapMouseEvent, type StyleSpecification } from "maplibre-gl";
import { pois, type BaseLayer, type MapState } from "./layers";
import type { OverpassResponse } from "./types";
import { env } from '$env/dynamic/public'

const DEFAULT_OVERPASS_API_URL = "https://overpass.private.coffee";
const DEFAULT_OVERPASS_API_FALLBACK_URL = "https://overpass-api.de";
const OVERPASS_CACHE_DB_NAME = "wanderer-overpass-cache";
const OVERPASS_CACHE_STORE_NAME = "tiles";
const OVERPASS_CACHE_VERSION = 1;
const OVERPASS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OVERPASS_RATE_LIMIT_BACKOFF_MS = 10 * 60 * 1000;
const OVERPASS_ERROR_BACKOFF_MS = 60 * 1000;
const RETRYABLE_OVERPASS_STATUSES = new Set([429, 502, 503, 504]);

type CachedOverpassTile = {
    key: string;
    x: string;
    y: string;
    query: string;
    cachedAt: number;
    expiresAt: number;
    features: GeoJSON.Feature[];
}

let overpassCacheDB: Promise<IDBDatabase | null> | null = null;

export type OverpassPopupActionFactory = (
    feature: GeoJSON.Feature,
    coordinates: GeoJSON.Position,
) => OverpassPopupAction | null | undefined;

export class OverpassLayer implements BaseLayer {
    private overpassApiURLs: string[] = getOverpassInterpreterURLs(
        env.PUBLIC_OVERPASS_API_URL,
        env.PUBLIC_OVERPASS_API_FALLBACK_URL,
    );

    data: GeoJSON.FeatureCollection = ({ type: 'FeatureCollection', features: [] });

    private minZoom = 12;

    private cachedQueries: Set<string> = new Set();
    private cachedData: { query: string, id: string | number | undefined, feature: GeoJSON.Feature }[] = []
    private cachedFeatureKeys: Set<string> = new Set();
    private endpointBackoffUntil: Map<string, number> = new Map();
    private inFlightTileQueries: Map<string, Promise<void>> = new Map();
    private tileSize = 0.1;


    spec: StyleSpecification = {
        version: 8,
        name: "overpass",
        sources: {
            overpass: {
                type: 'geojson',
                data: this.data,
            }
        },
        layers: [
            {
                id: 'overpass',
                type: 'symbol',
                source: 'overpass',
                layout: {
                    'icon-image': ['get', 'icon'],
                    'icon-size': 0.25,
                    'icon-padding': 0,
                    'icon-allow-overlap': ['step', ['zoom'], false, 14, true],
                },
            }
        ],
    };

    listeners = {
        "overpass": {
            onMouseDown: (e: MapMouseEvent) => {
                this.openPopup(e)
            },
            onEnter: (e: MapMouseEvent) => {
                this.openPopup(e);
            },
        }
    }

    private popup: M.Popup;
    private map: M.Map;
    private currentPopupCoordinates: GeoJSON.Position | null = null
    private popupActionFactory?: OverpassPopupActionFactory;

    constructor(map: M.Map, popupActionFactory?: OverpassPopupActionFactory) {
        this.map = map;
        this.popupActionFactory = popupActionFactory;
        this.popup = new M.Popup()
            .setMaxWidth("420px")
    }

    private openPopup(e: MapMouseEvent) {
        const features = (e as any).features as GeoJSON.Feature[];
        const point = features[0].geometry as GeoJSON.Point;
        const action = this.popupActionFactory?.(features[0], point.coordinates);
        const content = createOverpassPopup(features[0], point.coordinates, action ?? undefined);

        this.currentPopupCoordinates = point.coordinates;
        this.popup
            .setLngLat(point.coordinates as M.LngLatLike)
            .setDOMContent(content)
            .addTo(this.map);

        this.map.on("mousemove", this.distanceNotifierBinded)
    }

    distanceNotifierBinded = this.distanceNotifier.bind(this);
    private distanceNotifier(e: MapMouseEvent) {
        if (this.currentPopupCoordinates === null) {
            return
        }

        if (this.map.project(this.currentPopupCoordinates as M.LngLatLike).dist(this.map.project(e.lngLat)) > 60) {
            this.popup.remove();
            this.map.off("mousemove", this.distanceNotifier)
            this.currentPopupCoordinates = null;
        }
    }

    async updateLayerIfNeeded(state: MapState, bounds: LngLatBounds) {

        const activeQueries: string[] = this.getActiveQueries(state);

        if (this.map.getZoom() >= this.minZoom) {

            await this.fetchMissingTilesForBounds(bounds, activeQueries);
        }


        const filter: M.FilterSpecification = ['in', 'query', ...activeQueries];

        this.map.setFilter('overpass', filter);

        return filter
    }

    private async fetchMissingTilesForBounds(bounds: M.LngLatBounds, activeQueries: string[]) {
        const result: [string, LngLatBounds][] = [];

        const south = bounds.getSouth();
        const north = bounds.getNorth();
        const west = bounds.getWest();
        const east = bounds.getEast();

        for (let lat = south; lat < north; lat += this.tileSize) {
            for (let lng = west; lng < east; lng += this.tileSize) {
                const x = Math.floor(lat / this.tileSize) * this.tileSize;
                const y = Math.floor(lng / this.tileSize) * this.tileSize;
                const missingQueries = activeQueries.filter(
                    (query) => !this.cachedQueries.has(this.getTileQueryKey(x, y, query))
                );
                if (missingQueries.length > 0) {
                    const tileBounds = this.getBoundsForTile(x, y)
                    await this.fetchTile(x, y, missingQueries, tileBounds)
                }

            }
        }

        return result;
    }

    private async fetchTile(x: number, y: number, activeQueries: string[], bounds: LngLatBounds) {
        await this.loadCachedTileQueries(x, y, activeQueries);

        let missingQueries = activeQueries.filter((query) => !this.cachedQueries.has(this.getTileQueryKey(x, y, query)));
        if (!missingQueries.length) {
            this.loadIcons(activeQueries);
            return;
        }

        const inFlightFetches = missingQueries
            .map((query) => this.inFlightTileQueries.get(this.getTileQueryKey(x, y, query)))
            .filter((promise): promise is Promise<void> => promise !== undefined);

        missingQueries = missingQueries.filter((query) => !this.inFlightTileQueries.has(this.getTileQueryKey(x, y, query)));

        if (missingQueries.length > 0) {
            const fetchPromise = this.fetchAndCacheTile(x, y, missingQueries, bounds);
            const cleanup = () => {
                missingQueries.forEach((query) => this.inFlightTileQueries.delete(this.getTileQueryKey(x, y, query)));
            };

            missingQueries.forEach((query) => this.inFlightTileQueries.set(this.getTileQueryKey(x, y, query), fetchPromise));
            fetchPromise.then(cleanup, cleanup);
            inFlightFetches.push(fetchPromise);
        }

        await Promise.all(inFlightFetches);
        this.loadIcons(activeQueries)

    }

    private async fetchAndCacheTile(x: number, y: number, activeQueries: string[], bounds: LngLatBounds) {
        const q = this.getOverpassQuery(activeQueries, bounds)
        if (!q.length) {
            return;
        }

        const response = await this.fetchOverpassData(q);
        if (response === null) {
            return;
        }

        await this.cacheData(x, y, response, activeQueries)
    }

    private async fetchOverpassData(query: string): Promise<OverpassResponse | null> {
        const urls = this.getAvailableOverpassURLs();
        if (!urls.length) {
            console.warn("All Overpass endpoints are temporarily rate limited or unavailable");
            return null;
        }

        for (const url of urls) {
            try {
                const r = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                    },
                    body: new URLSearchParams({ data: query }),
                });

                if (!r.ok) {
                    console.warn(`Overpass request to ${url} failed with status ${r.status}: ${r.statusText}`);

                    if (RETRYABLE_OVERPASS_STATUSES.has(r.status)) {
                        this.markEndpointBackoff(url, r.status);
                        continue;
                    }

                    return null;
                }

                const text = await r.text();

                try {
                    return JSON.parse(text) as OverpassResponse;
                } catch (error) {
                    console.warn(`Overpass request to ${url} did not return JSON`, error);
                    this.markEndpointBackoff(url);
                }
            } catch (error) {
                console.warn(`Overpass request to ${url} failed`, error);
                this.markEndpointBackoff(url);
            }
        }

        return null;
    }

    private getAvailableOverpassURLs() {
        const now = Date.now();
        return this.overpassApiURLs.filter((url) => (this.endpointBackoffUntil.get(url) ?? 0) <= now);
    }

    private markEndpointBackoff(url: string, status?: number) {
        this.endpointBackoffUntil.set(
            url,
            Date.now() + (status === 429 ? OVERPASS_RATE_LIMIT_BACKOFF_MS : OVERPASS_ERROR_BACKOFF_MS),
        );
    }

    private async loadCachedTileQueries(x: number, y: number, activeQueries: string[]) {
        await Promise.all(activeQueries.map(async (query) => {
            const tileKey = this.getTileQueryKey(x, y, query);
            if (this.cachedQueries.has(tileKey)) {
                return;
            }

            const cachedTile = await readCachedOverpassTile(tileKey);
            if (cachedTile === null) {
                return;
            }

            this.markTileQueryCached(x, y, query);
            cachedTile.features.forEach((feature) => this.addCachedFeature(query, feature));
        }));
    }

    private async cacheData(x: number, y: number, data: OverpassResponse, activeQueries: string[]) {
        if (data.elements === undefined) {
            return;
        }

        const featuresByQuery: Map<string, GeoJSON.Feature[]> = new Map(activeQueries.map((query) => [query, []]));

        for (let element of data.elements) {
            for (let query of activeQueries) {
                if (this.belongsToQuery(element, query)) {
                    const feature = this.createFeature(element, query);
                    if (feature === null) {
                        continue;
                    }

                    featuresByQuery.get(query)?.push(feature);
                    this.addCachedFeature(query, feature);
                }
            }
        }

        await Promise.all(activeQueries.map((query) => {
            this.markTileQueryCached(x, y, query);
            return writeCachedOverpassTile({
                key: this.getTileQueryKey(x, y, query),
                x: x.toFixed(4),
                y: y.toFixed(4),
                query,
                cachedAt: Date.now(),
                expiresAt: Date.now() + OVERPASS_CACHE_TTL_MS,
                features: featuresByQuery.get(query) ?? [],
            });
        }));
    }

    private createFeature(element: OverpassResponse["elements"][number], query: string): GeoJSON.Feature | null {
        const lat = element.center ? element.center.lat : element.lat;
        const lon = element.center ? element.center.lon : element.lon;

        if (lat === undefined || lon === undefined) {
            return null;
        }

        return {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [lon, lat],
            },
            properties: {
                id: element.id,
                lat,
                lon,
                query: query,
                icon: `overpass-${query}`,
                tags: element.tags,
                type: element.type,
            },
        };
    }

    private addCachedFeature(query: string, feature: GeoJSON.Feature) {
        const key = `${query}:${feature.properties?.type}:${feature.properties?.id}`;
        if (this.cachedFeatureKeys.has(key)) {
            return;
        }

        this.cachedFeatureKeys.add(key);
        this.cachedData.push({
            query,
            id: feature.properties?.id,
            feature,
        });
        this.data.features = this.cachedData.map(d => d.feature);
    }

    private markTileQueryCached(x: number, y: number, query: string) {
        this.cachedQueries.add(this.getTileQueryKey(x, y, query));
    }

    private getTileQueryKey(x: number, y: number, query: string) {
        return `v${OVERPASS_CACHE_VERSION}:${x.toFixed(4)}:${y.toFixed(4)}:${query}`;
    }

    private getActiveQueries(state: MapState) {
        const activeQueries: string[] = []
        for (const category of Object.keys(state.pois)) {
            for (const [name, active] of Object.entries(state.pois[category])) {
                if (active) {
                    activeQueries.push(name)
                }
            }
        }

        return activeQueries
    }

    private belongsToQuery(element: OverpassResponse["elements"][number], query: string) {
        if (Array.isArray(pois[query].tags)) {
            return pois[query].tags.some((tags) => this.belongsToQueryItem(element, tags));
        } else {
            return this.belongsToQueryItem(element, pois[query].tags);
        }
    }

    private belongsToQueryItem(element: any, tags: Record<string, string | boolean | string[]>) {
        if (!element.tags) {
            return false;
        }

        return Object.entries(tags).every(([tag, value]) =>
            Array.isArray(value) ? value.includes(element.tags[tag]) : element.tags[tag] === value
        );
    }

    private getOverpassQuery(activeQueries: string[], bounds: LngLatBounds) {
        return `[bbox:${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}][out:json];(${this.getQueries(activeQueries)});out center;`;

    }

    private getQueries(queries: string[]) {
        return queries.map((query) => this.getQuery(query)).join('');
    }

    private getQuery(query: string) {
        if (Array.isArray(pois[query].tags)) {
            return pois[query].tags.map((tags) => this.getQueryItem(tags)).join('');
        } else {
            return this.getQueryItem(pois[query].tags);
        }
    }

    private getQueryItem(tags: Record<string, string | boolean | string[]>) {
        let arrayEntry = Object.entries(tags).find(([_, value]) => Array.isArray(value));
        if (arrayEntry !== undefined) {
            return (arrayEntry[1] as string[])
                .map(
                    (val) =>
                        `nwr${Object.entries(tags)
                            .map(([tag, value]) => `[${tag}=${tag === arrayEntry[0] ? val : value}]`)
                            .join('')};`
                )
                .join('');
        } else {
            return `nwr${Object.entries(tags)
                .map(([tag, value]) => `[${tag}=${value}]`)
                .join('')};`;
        }
    }

    private loadIcons(activeQueries: string[]) {
        activeQueries.forEach((q) => {
            if (!this.map.hasImage(`overpass-${q}`)) {
                let icon = new Image(100, 100);
                icon.onload = () => {
                    if (!this.map.hasImage(`overpass-${q}`)) {
                        this.map.addImage(`overpass-${q}`, icon);
                    }
                };

                const svg = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
                    <circle cx="20" cy="20" r="20" fill="${pois[q].icon.bg}" />
                    <g transform="translate(8 8)">
                    ${transformFontAwesomeIcon(pois[q].icon.svg)}
                    </g>
                </svg>
                `

                icon.src =
                    'data:image/svg+xml,' +
                    encodeURIComponent(svg);
            }
        });
    }

    private getBoundsForTile(lat: number, lng: number): LngLatBounds {
        return new M.LngLatBounds(
            [lng, lat],
            [lng + this.tileSize, lat + this.tileSize]
        );
    }

    private showDebugTiles(tiles: [string, LngLatBounds][]) {
        const features = tiles.map(([_, bounds]) => boundsToPolygonFeature(bounds));

        const debugSource = this.map.getSource('debug') as M.GeoJSONSource;

        if (debugSource) {
            debugSource.setData({
                type: 'FeatureCollection',
                features,
            });
        }
    }

}

function getOverpassInterpreterURLs(configuredURL: string | undefined, configuredFallbackURL: string | undefined) {
    return [
        getOverpassInterpreterURL(configuredURL, DEFAULT_OVERPASS_API_URL),
        getOverpassInterpreterURL(configuredFallbackURL, DEFAULT_OVERPASS_API_FALLBACK_URL),
    ].filter((url, index, urls) => urls.indexOf(url) === index);
}

function getOverpassInterpreterURL(configuredURL: string | undefined, defaultURL: string) {
    const baseURL = (configuredURL?.trim() || defaultURL).replace(/\/+$/, "");
    const normalizedBaseURL = hasURLScheme(baseURL) || baseURL.startsWith("/")
        ? baseURL
        : `https://${baseURL}`;

    return normalizedBaseURL.endsWith("/api/interpreter")
        ? normalizedBaseURL
        : `${normalizedBaseURL}/api/interpreter`;
}

function hasURLScheme(url: string) {
    return /^[a-z][a-z\d+\-.]*:/i.test(url);
}

async function readCachedOverpassTile(key: string): Promise<CachedOverpassTile | null> {
    try {
        const db = await getOverpassCacheDB();
        if (db === null) {
            return null;
        }

        const cachedTile = await readFromOverpassCache(db, key);
        if (cachedTile === null) {
            return null;
        }

        if (cachedTile.expiresAt <= Date.now()) {
            deleteFromOverpassCache(db, key);
            return null;
        }

        return cachedTile;
    } catch (error) {
        console.warn("Failed to read Overpass cache", error);
        return null;
    }
}

async function writeCachedOverpassTile(tile: CachedOverpassTile): Promise<void> {
    try {
        const db = await getOverpassCacheDB();
        if (db === null) {
            return;
        }

        await writeToOverpassCache(db, tile);
    } catch (error) {
        console.warn("Failed to write Overpass cache", error);
    }
}

function getOverpassCacheDB(): Promise<IDBDatabase | null> {
    if (overpassCacheDB !== null) {
        return overpassCacheDB;
    }

    if (typeof indexedDB === "undefined") {
        overpassCacheDB = Promise.resolve(null);
        return overpassCacheDB;
    }

    overpassCacheDB = new Promise((resolve) => {
        const request = indexedDB.open(OVERPASS_CACHE_DB_NAME, OVERPASS_CACHE_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(OVERPASS_CACHE_STORE_NAME)) {
                db.createObjectStore(OVERPASS_CACHE_STORE_NAME, { keyPath: "key" });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            console.warn("Failed to open Overpass cache", request.error);
            resolve(null);
        };
        request.onblocked = () => {
            console.warn("Opening Overpass cache was blocked");
            resolve(null);
        };
    });

    return overpassCacheDB;
}

function readFromOverpassCache(db: IDBDatabase, key: string): Promise<CachedOverpassTile | null> {
    return new Promise((resolve, reject) => {
        const request = db
            .transaction(OVERPASS_CACHE_STORE_NAME, "readonly")
            .objectStore(OVERPASS_CACHE_STORE_NAME)
            .get(key);

        request.onsuccess = () => resolve((request.result as CachedOverpassTile | undefined) ?? null);
        request.onerror = () => reject(request.error);
    });
}

function writeToOverpassCache(db: IDBDatabase, tile: CachedOverpassTile): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = db
            .transaction(OVERPASS_CACHE_STORE_NAME, "readwrite")
            .objectStore(OVERPASS_CACHE_STORE_NAME)
            .put(tile);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function deleteFromOverpassCache(db: IDBDatabase, key: string) {
    const request = db
        .transaction(OVERPASS_CACHE_STORE_NAME, "readwrite")
        .objectStore(OVERPASS_CACHE_STORE_NAME)
        .delete(key);

    request.onerror = () => console.warn("Failed to delete expired Overpass cache entry", request.error);
}


function boundsToPolygonFeature(bounds: M.LngLatBounds): GeoJSON.Feature<GeoJSON.Polygon> {
    const [[west, south], [east, north]] = bounds.toArray();
    const coordinates = [[
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
    ]];

    return {
        type: 'Feature',
        geometry: {
            type: 'Polygon',
            coordinates: coordinates,
        },
        properties: {},
    };
}

function transformFontAwesomeIcon(svgText: string): string {
    const viewBoxMatch = svgText.match(/viewBox="0 0 (\d+) (\d+)"/);
    if (!viewBoxMatch) throw new Error("SVG viewBox not found");

    const originalWidth = parseFloat(viewBoxMatch[1]);
    const originalHeight = parseFloat(viewBoxMatch[2]);

    const maxDim = Math.max(originalWidth, originalHeight);
    const scale = 24 / maxDim;

    const scaledWidth = originalWidth * scale;
    const scaledHeight = originalHeight * scale;

    const dx = (24 - scaledWidth) / 2;
    const dy = (24 - scaledHeight) / 2;

    let innerContent = svgText
        .replace(/<svg[^>]*>/, '')
        .replace(/<\/svg>/, '')
        .trim();

    innerContent = innerContent.replace(
        /<path/g,
        '<path fill="white"'
    );

    return `
    <g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${scale.toFixed(6)})">
      ${innerContent}
    </g>
  `;
}
